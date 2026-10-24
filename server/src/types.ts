export type Phase = 'lobby' | 'choosing' | 'drawing' | 'roundEnd' | 'gameOver';

// Keep these IDs in sync with client/src/types.ts and wordCategories.ts.
export const WORD_CATEGORY_IDS = [
  'food',
  'animals',
  'places',
  'vehicles',
  'nature',
  'music-tech',
  'objects',
  'fantasy',
] as const;

export type WordCategory = (typeof WORD_CATEGORY_IDS)[number];

export interface RoomSettings {
  maxPlayers: number; // 2-20
  rounds: number; // 2-10
  drawTime: number; // seconds, 15-240
  wordCount: number; // word options shown to the drawer, 1-5
  categories: WordCategory[]; // word pools available for this room
}

export interface Point {
  x: number; // 0..1 relative to canvas width
  y: number; // 0..1 relative to canvas height
}

export type DrawTool = 'brush' | 'eraser' | 'fill';

export interface Stroke {
  id: string;
  tool: DrawTool;
  color: string;
  size: number; // fraction of canvas width; ignored for fills
  points: Point[]; // fills use the first point as the flood-fill seed
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
