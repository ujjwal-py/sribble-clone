import { Server } from 'socket.io';
import { RoomSettings } from '../types';
import { makeRoomCode } from '../utils/random';
import { Room } from './Room';

export class RoomManager {
  private rooms = new Map<string, Room>();

  create(io: Server, settings: RoomSettings): Room {
    let code = makeRoomCode();
    while (this.rooms.has(code)) {
      code = makeRoomCode();
    }

    const room = new Room(code, settings, io);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.trim().toUpperCase());
  }

  delete(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.destroy();
    this.rooms.delete(code);
  }
}

// One in-memory room store for the whole server process.
export const rooms = new RoomManager();
