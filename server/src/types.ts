export type Phase = 'lobby' | 'choosing' | 'drawing' | 'roundEnd' | 'gameOver';

export interface RoomSettings {
  maxPlayers: number; // 2-20
  rounds: number; // 2-10
  drawTime: number; // seconds, 15-240
  wordCount: number; // word options shown to the drawer, 1-5
}

export interface Point {
  x: number; // 0..1 relative to canvas width
  y: number; // 0..1 relative to canvas height
}

export interface Stroke {
  id: string;
  color: string;
  size: number; // fraction of canvas width
  points: Point[];
}

export interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  hasGuessed: boolean;
}

/**
 * Everything a client may know about a game. `word` is deliberately optional
 * and is only filled in for the current drawer.
 */
export interface PublicGameState {
  phase: Phase;
  round: number;
  drawerId: string | null;
  maskedWord: string | null;
  wordLength: number | null;
  word: string | null; // ONLY for the drawer
  endsAt: number | null; // drawing deadline (epoch ms)
  chooseEndsAt: number | null; // word-choice deadline (epoch ms)
}

export interface RoomState extends PublicGameState {
  code: string;
  settings: RoomSettings;
  hostId: string | null;
  players: PlayerInfo[];
  strokes: Stroke[];
}

export interface ChatMessage {
  id: string;
  kind: 'guess' | 'system';
  playerId?: string;
  name?: string;
  text: string;
}

export type RoundEndReason = 'time_up' | 'all_guessed' | 'drawer_left';

export interface RoundEndPayload {
  word: string | null;
  reason: RoundEndReason;
  players: PlayerInfo[];
  deltas: Record<string, number>;
  nextAt: number; // epoch ms for the next turn
}

export interface GameOverPayload {
  standings: PlayerInfo[];
  winnerId: string | null;
}

export type DrawData =
  | { type: 'start'; stroke: Stroke }
  | { type: 'move'; strokeId: string; x: number; y: number }
  | { type: 'end'; strokeId: string };

export type JoinAck =
  | { ok: true; playerId: string; code: string; state: RoomState }
  | { ok: false; error: string };
