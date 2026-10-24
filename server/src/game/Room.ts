import { Server } from 'socket.io';
import { RoomSettings, RoomState, Stroke } from '../types';
import { Game } from './Game';
import { Player } from './Player';

export class Room {
  players: Player[] = [];
  hostId: string | null = null;
  strokes: Stroke[] = [];
  game: Game;
  private kickedIds = new Set<string>();

  constructor(
    public code: string,
    public settings: RoomSettings,
    public io: Server,
  ) {
    this.game = new Game(this);
  }

  addPlayer(id: string, name: string): Player {
    const player = new Player(id, name);
    this.players.push(player);

    // The first player in an empty room becomes the host.
    if (!this.hostId) this.hostId = id;

    return player;
  }

  getPlayer(id: string): Player | undefined {
    return this.players.find((player) => player.id === id);
  }

  isFull(): boolean {
    return this.players.length >= this.settings.maxPlayers;
  }

  removePlayer(id: string): Player | null {
    const index = this.players.findIndex((player) => player.id === id);
    if (index === -1) return null;

    const [player] = this.players.splice(index, 1);

    // The game updates turn order and may end the round/game before we pick a
    // new host, because both operations only depend on the remaining players.
    this.game.onPlayerLeft(player.id);

    if (this.hostId === player.id) {
      this.hostId = this.players[0]?.id ?? null;
    }

    return player;
  }

  /**
   * Removes a player and remembers their socket id so the same connection
   * cannot immediately rejoin the room it was kicked from.
   */
  kickPlayer(id: string): Player | null {
    const player = this.removePlayer(id);
    if (player) this.kickedIds.add(id);
    return player;
  }

  isKicked(id: string): boolean {
    return this.kickedIds.has(id);
  }

  broadcast(event: string, payload?: unknown): void {
    this.io.to(this.code).emit(event, payload);
  }

  sendTo(playerId: string, event: string, payload?: unknown): void {
    this.io.to(playerId).emit(event, payload);
  }

  getState(viewerId: string): RoomState {
    return {
      code: this.code,
      settings: this.settings,
      hostId: this.hostId,
      players: this.players.map((player) => player.toInfo()),
      strokes: this.strokes,
      ...this.game.getPublicState(viewerId),
    };
  }

  /** Called when the last player leaves or the room is deleted. */
  destroy(): void {
    this.game.clearTimers();
    this.strokes = [];
    this.kickedIds.clear();
  }
}
