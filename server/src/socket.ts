import { Server, Socket } from 'socket.io';
import { rooms } from './game/RoomManager';
import { Room } from './game/Room';
import { DrawTool, JoinAck, Point, RoomSettings } from './types';
import { makeId } from './utils/random';

const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
};

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeSettings(raw: unknown): RoomSettings {
  const input = (raw ?? {}) as Record<string, unknown>;
  return {
    maxPlayers: clampInt(input.maxPlayers, 2, 20, DEFAULT_SETTINGS.maxPlayers),
    rounds: clampInt(input.rounds, 2, 10, DEFAULT_SETTINGS.rounds),
    drawTime: clampInt(input.drawTime, 15, 240, DEFAULT_SETTINGS.drawTime),
    wordCount: clampInt(input.wordCount, 1, 5, DEFAULT_SETTINGS.wordCount),
  };
}

function cleanName(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, 20) : '';
}

function cleanCode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().toUpperCase() : '';
}

function currentRoom(socket: Socket): Room | undefined {
  const code = socket.data.roomCode as string | undefined;
  return code ? rooms.get(code) : undefined;
}

function reply(ack: ((response: JoinAck) => void) | undefined, response: JoinAck): void {
  if (typeof ack === 'function') ack(response);
}

function clamp01(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function validColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#111827';
}

function validSize(value: unknown, max = 0.03): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.006;
  return Math.min(max, Math.max(0.002, number));
}

function validTool(value: unknown): DrawTool {
  return value === 'eraser' || value === 'fill' ? value : 'brush';
}

function leaveRoom(socket: Socket): void {
  const room = currentRoom(socket);
  if (!room) {
    socket.data.roomCode = undefined;
    return;
  }

  const player = room.removePlayer(socket.id);
  socket.leave(room.code);
  socket.data.roomCode = undefined;

  if (!player) return;

  console.log(`[room ${room.code}] ${player.name} left`);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  room.broadcast('player_left', {
    playerId: player.id,
    name: player.name,
    players: room.players.map((entry) => entry.toInfo()),
    hostId: room.hostId,
  });
}

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    socket.on('create_room', (payload: any, ack?: (response: JoinAck) => void) => {
      if (currentRoom(socket)) {
        reply(ack, { ok: false, error: 'You are already in a room.' });
        return;
      }

      const name = cleanName(payload?.name);
      if (!name) {
        reply(ack, { ok: false, error: 'Please enter a name.' });
        return;
      }

      const settings = normalizeSettings(payload?.settings);
      const room = rooms.create(io, settings);
      const player = room.addPlayer(socket.id, name);

      socket.data.roomCode = room.code;
      socket.join(room.code);

      console.log(`[room ${room.code}] created by ${name} (${socket.id})`);

      reply(ack, {
        ok: true,
        playerId: player.id,
        code: room.code,
        state: room.getState(player.id),
      });
    });

    socket.on('join_room', (payload: any, ack?: (response: JoinAck) => void) => {
      if (currentRoom(socket)) {
        reply(ack, { ok: false, error: 'You are already in a room.' });
        return;
      }

      const name = cleanName(payload?.name);
      const code = cleanCode(payload?.code);

      if (!name) {
        reply(ack, { ok: false, error: 'Please enter a name.' });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        reply(ack, { ok: false, error: 'Room not found. Check the code.' });
        return;
      }

      if (room.game.phase !== 'lobby') {
        reply(ack, { ok: false, error: 'That game has already started.' });
        return;
      }

      if (room.isFull()) {
        reply(ack, { ok: false, error: 'That room is full.' });
        return;
      }

      const player = room.addPlayer(socket.id, name);
      socket.data.roomCode = room.code;
      socket.join(room.code);

      console.log(`[room ${room.code}] ${name} joined`);

      reply(ack, {
        ok: true,
        playerId: player.id,
        code: room.code,
        state: room.getState(player.id),
      });

      // Existing players need the new lobby list; the new player already has the ack state.
      socket.to(room.code).emit('player_joined', {
        player: player.toInfo(),
        players: room.players.map((entry) => entry.toInfo()),
        hostId: room.hostId,
      });
    });

    socket.on('start_game', () => {
      const room = currentRoom(socket);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      if (room.game.phase !== 'lobby') return;
      if (room.players.length < 2) return;

      console.log(`[room ${room.code}] game started by host`);
      room.game.startGame();
    });

    socket.on('word_chosen', (payload: any) => {
      const room = currentRoom(socket);
      if (!room || typeof payload?.word !== 'string') return;
      room.game.chooseWord(socket.id, payload.word);
    });

    socket.on('draw_start', (payload: any) => {
      const room = currentRoom(socket);
      if (!room || !room.game.canDraw(socket.id)) return;

      const tool = validTool(payload?.tool);
      const stroke = {
        id: makeId(),
        tool,
        // The drawing surface is white, so an eraser is simply white paint.
        // Forcing the color server-side prevents a mismatched client palette.
        color: tool === 'eraser' ? '#ffffff' : validColor(payload?.color),
        size:
          tool === 'fill'
            ? 0
            : validSize(payload?.size, tool === 'eraser' ? 0.07 : 0.03),
        points: [{ x: clamp01(payload?.x), y: clamp01(payload?.y) }],
      };

      room.strokes.push(stroke);
      socket.to(room.code).emit('draw_data', { type: 'start', stroke });
    });

    socket.on('draw_move', (payload: any) => {
      const room = currentRoom(socket);
      if (!room || !room.game.canDraw(socket.id)) return;

      const stroke = room.strokes[room.strokes.length - 1];
      // A fill is a single operation; it has no line to extend.
      if (!stroke || stroke.tool === 'fill') return;

      // A simple safety cap on a single stroke's history.
      if (stroke.points.length >= 5000) return;

      const point: Point = { x: clamp01(payload?.x), y: clamp01(payload?.y) };
      stroke.points.push(point);
      socket.to(room.code).emit('draw_data', {
        type: 'move',
        strokeId: stroke.id,
        x: point.x,
        y: point.y,
      });
    });

    socket.on('draw_end', () => {
      const room = currentRoom(socket);
      if (!room || !room.game.canDraw(socket.id)) return;

      const stroke = room.strokes[room.strokes.length - 1];
      if (!stroke) return;

      socket.to(room.code).emit('draw_data', { type: 'end', strokeId: stroke.id });
    });

    socket.on('draw_undo', () => {
      const room = currentRoom(socket);
      if (!room || !room.game.canDraw(socket.id)) return;

      room.strokes.pop();
      // Full list, so every client can redraw from the same authoritative state.
      room.broadcast('draw_undo', { strokes: room.strokes });
    });

    socket.on('canvas_clear', () => {
      const room = currentRoom(socket);
      if (!room || !room.game.canDraw(socket.id)) return;

      room.strokes = [];
      room.broadcast('canvas_clear', {});
    });

    socket.on('guess', (payload: any) => {
      const room = currentRoom(socket);
      if (!room || typeof payload?.text !== 'string') return;
      room.game.handleGuess(socket.id, payload.text);
    });

    socket.on('play_again', () => {
      const room = currentRoom(socket);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      if (room.game.phase !== 'gameOver') return;

      room.game.resetToLobby();
    });

    socket.on('leave_room', () => {
      leaveRoom(socket);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected ${socket.id}`);
      leaveRoom(socket);
    });
  });
}
