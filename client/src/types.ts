export type Phase = 'lobby' | 'choosing' | 'drawing' | 'roundEnd' | 'gameOver';

export interface RoomSettings {
  maxPlayers: number;
  rounds: number;
  drawTime: number;
  wordCount: number;
}

export interface PlayerInfo {
  id: string;
  name: string;
  score: number;
  hasGuessed: boolean;
}

export interface Point {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  color: string;
  size: number;
  points: Point[];
}

export interface RoomState {
  code: string;
  settings: RoomSettings;
  hostId: string | null;
  players: PlayerInfo[];
  phase: Phase;
  round: number;
  drawerId: string | null;
  maskedWord: string | null;
  wordLength: number | null;
  word: string | null;
  endsAt: number | null;
  chooseEndsAt: number | null;
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
  nextAt: number;
}

export interface GameOverPayload {
  standings: PlayerInfo[];
  winnerId: string | null;
}

export type DrawData =
  | { type: 'start'; stroke: Stroke }
  | { type: 'move'; strokeId: string; x: number; y: number }
  | { type: 'end'; strokeId: string };

export interface JoinSuccess {
  ok: true;
  playerId: string;
  code: string;
  state: RoomState;
}

export type JoinResponse = JoinSuccess | { ok: false; error: string };
export type JoinAck = (response: JoinResponse) => void;

export interface ServerToClientEvents {
  game_state: (state: RoomState) => void;
  player_joined: (payload: {
    player: PlayerInfo;
    players: PlayerInfo[];
    hostId: string | null;
  }) => void;
  player_left: (payload: {
    playerId: string;
    name: string;
    players: PlayerInfo[];
    hostId: string | null;
  }) => void;
  players_update: (payload: { players: PlayerInfo[]; hostId: string | null }) => void;
  round_start: (payload: {
    round: number;
    turnNumber: number;
    turnsThisRound: number;
    drawerId: string;
    drawerName: string;
    chooseEndsAt: number;
  }) => void;
  word_options: (payload: { options: string[]; endsAt: number }) => void;
  word_chosen: (payload: {
    drawerId: string;
    maskedWord: string;
    wordLength: number;
    endsAt: number;
    round: number;
    word?: string;
  }) => void;
  draw_data: (payload: DrawData) => void;
  draw_undo: (payload: { strokes: Stroke[] }) => void;
  canvas_clear: () => void;
  guess_result: (payload: { correct: boolean; points?: number }) => void;
  chat_message: (payload: ChatMessage) => void;
  round_end: (payload: RoundEndPayload) => void;
  game_over: (payload: GameOverPayload) => void;
}

export interface ClientToServerEvents {
  create_room: (payload: { name: string; settings: RoomSettings }, ack: JoinAck) => void;
  join_room: (payload: { code: string; name: string }, ack: JoinAck) => void;
  start_game: () => void;
  word_chosen: (payload: { word: string }) => void;
  draw_start: (payload: { x: number; y: number; color: string; size: number }) => void;
  draw_move: (payload: { x: number; y: number }) => void;
  draw_end: () => void;
  draw_undo: () => void;
  canvas_clear: () => void;
  guess: (payload: { text: string }) => void;
  play_again: () => void;
  leave_room: () => void;
}
