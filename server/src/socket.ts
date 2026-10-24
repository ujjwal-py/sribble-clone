import { Server, Socket } from 'socket.io';
import { rooms } from './game/RoomManager';
import { Room } from './game/Room';
import {
  DrawTool,
  JoinAck,
  Point,
  RoomSettings,
  RoomVisibility,
  WORD_CATEGORY_IDS,
  WordCategory,
} from './types';
import { makeId } from './utils/random';

const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  categories: [...WORD_CATEGORY_IDS],
  visibility: 'private',
};

/**
 * Socket.IO room that holds every socket currently browsing the public room
 * list. It is separate from game rooms, whose codes never contain a dash.
 */
const PUBLIC_LOBBY = 'public-lobby';

function broadcastPublicRooms(io: Server): void {
  io.to(PUBLIC_LOBBY).emit('public_rooms', { rooms: rooms.listPublic() });
}

function normalizeCategories(raw: unknown): WordCategory[] {
  if (!Array.isArray(raw)) return [...WORD_CATEGORY_IDS];

  const selected = raw.filter(
    (value): value is WordCategory =>
      typeof value === 'string' &&
      (WORD_CATEGORY_IDS as readonly string[]).includes(value),
  );

  return selected.length > 0 ? [...new Set(selected)] : [...WORD_CATEGORY_IDS];
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeSettings(raw: unknown): RoomSettings {
  const input = (raw ?? {}) as Record<string, unknown>;
  const visibility: RoomVisibility = input.visibility === 'public' ? 'public' : 'private';

  return {
    maxPlayers: clampInt(input.maxPlayers, 2, 20, DEFAULT_SETTINGS.maxPlayers),
    rounds: clampInt(input.rounds, 2, 10, DEFAULT_SETTINGS.rounds),
    drawTime: clampInt(input.drawTime, 15, 240, DEFAULT_SETTINGS.drawTime),
    wordCount: clampInt(input.wordCount, 1, 5, DEFAULT_SETTINGS.wordCount),
    categories: normalizeCategories(input.categories),
    visibility,
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

function leaveRoom(socket: Socket, io: Server): void {
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
    broadcastPublicRooms(io);
    return;
  }

  room.broadcast('player_left', {
    playerId: player.id,
    name: player.name,
    players: room.players.map((entry) => entry.toInfo()),
    hostId: room.hostId,
  });

  broadcastPublicRooms(io);
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

      broadcastPublicRooms(io);
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

      if (room.isKicked(socket.id)) {
        reply(ack, { ok: false, error: 'You were removed from this room by the host.' });
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

      broadcastPublicRooms(io);
    });

    socket.on('start_game', () => {
      const room = currentRoom(socket);
      if (!room) return;
      if (socket.id !== room.hostId) return;
      if (room.game.phase !== 'lobby') return;
      if (room.players.length < 2) return;

      console.log(`[room ${room.code}] game started by host`);
      room.game.startGame();
      // A running room is no longer joinable, so drop it from the browser.
      broadcastPublicRooms(io);
    });

    socket.on('kick_player', (payload: any) => {
      const room = currentRoom(socket);
      if (!room || socket.id !== room.hostId) return;
      if (room.game.phase === 'roundEnd' || room.game.phase === 'gameOver') return;

      const targetId = typeof payload?.playerId === 'string' ? payload.playerId : '';
      if (!targetId || targetId === socket.id) return;

      const target = room.getPlayer(targetId);
      const host = room.getPlayer(socket.id);
      if (!target || !host) return;

      // Remove the target from the socket room first so game events caused by
      // their departure (round_end, game_over) do not reach the kicked client.
      const targetSocket = io.sockets.sockets.get(targetId);
      targetSocket?.leave(room.code);
      if (targetSocket) targetSocket.data.roomCode = undefined;

      const player = room.kickPlayer(targetId);
      if (!player) return;

      targetSocket?.emit('kicked', {
        byName: host.name,
        reason: 'The host removed you from the room.',
      });

      console.log(`[room ${room.code}] ${player.name} was kicked by ${host.name}`);

      if (room.players.length === 0) {
        rooms.delete(room.code);
        broadcastPublicRooms(io);
        return;
      }

      room.broadcast('player_left', {
        playerId: player.id,
        name: player.name,
        players: room.players.map((entry) => entry.toInfo()),
        hostId: room.hostId,
      });

      broadcastPublicRooms(io);
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
      // Back in the lobby, so a public room is joinable again.
      broadcastPublicRooms(io);
    });

    socket.on('subscribe_public_rooms', () => {
      socket.join(PUBLIC_LOBBY);
      socket.emit('public_rooms', { rooms: rooms.listPublic() });
    });

    socket.on('unsubscribe_public_rooms', () => {
      socket.leave(PUBLIC_LOBBY);
    });

    socket.on('leave_room', () => {
      leaveRoom(socket, io);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected ${socket.id}`);
      leaveRoom(socket, io);
    });
  });
}
