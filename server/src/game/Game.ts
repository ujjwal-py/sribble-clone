import { Phase, RoundEndPayload, RoundEndReason } from '../types';
import { makeId, pickRandom, pickWords } from '../utils/random';
import type { Room } from './Room';
import { getWordPool } from './words';

const CHOOSE_TIME_MS = 15_000;
const ROUND_END_MS = 6_000;
const DRAWER_POINTS_PER_GUESSER = 50;
const MIN_GUESS_POINTS = 100;
const MAX_GUESS_POINTS = 200;

type Timer = NodeJS.Timeout;

export function maskWord(word: string): string {
  return word
    .split('')
    .map(() => '_')
    .join(' ');
}

export class Game {
  phase: Phase = 'lobby';
  round = 0; // 1-based while a game is running

  // Turn order is the players' join order, refreshed at the start of each round.
  turnOrder: string[] = [];
  turnIndex = 0;

  drawerId: string | null = null;
  currentWord: string | null = null;
  wordOptions: string[] = [];

  // Epoch timestamps let clients display the countdown without deciding anything.
  chooseEndsAt: number | null = null;
  roundEndsAt: number | null = null;

  // Points earned during the current turn, used by the round-end overlay.
  roundPoints: Record<string, number> = {};

  timers: {
    wordChoice: Timer | null;
    draw: Timer | null;
    nextTurn: Timer | null;
  } = {
    wordChoice: null,
    draw: null,
    nextTurn: null,
  };

  constructor(private room: Room) {}

  startGame(): void {
    if (this.phase !== 'lobby' || this.room.players.length < 2) return;

    this.clearTimers();
    this.round = 1;
    this.turnOrder = this.room.players.map((player) => player.id);
    this.turnIndex = 0;

    for (const player of this.room.players) {
      player.score = 0;
      player.hasGuessed = false;
    }

    this.startTurn();
  }

  private startTurn(): void {
    if (this.room.players.length < 2) {
      this.endGame();
      return;
    }

    const drawer = this.room.getPlayer(this.turnOrder[this.turnIndex]);
    if (!drawer) {
      this.advanceTurn();
      return;
    }

    this.phase = 'choosing';
    this.drawerId = drawer.id;
    this.currentWord = null;
    this.wordOptions = pickWords(
      getWordPool(this.room.settings.categories),
      this.room.settings.wordCount,
    );
    this.chooseEndsAt = Date.now() + CHOOSE_TIME_MS;
    this.roundEndsAt = null;
    this.roundPoints = {};

    for (const player of this.room.players) {
      player.hasGuessed = false;
      this.roundPoints[player.id] = 0;
    }

    // A new turn always starts with a blank canvas for everyone.
    this.room.strokes = [];

    this.room.broadcast('round_start', {
      round: this.round,
      turnNumber: this.turnIndex + 1,
      turnsThisRound: this.turnOrder.length,
      drawerId: drawer.id,
      drawerName: drawer.name,
      chooseEndsAt: this.chooseEndsAt,
    });

    // Word choices go only to the drawer's socket.
    this.room.sendTo(drawer.id, 'word_options', {
      options: this.wordOptions,
      endsAt: this.chooseEndsAt,
    });

    this.timers.wordChoice = setTimeout(() => {
      const autoPick = pickRandom(this.wordOptions);
      if (autoPick) this.chooseWord(drawer.id, autoPick);
    }, CHOOSE_TIME_MS);
  }

  /** Called by the socket handler after checking the sender is the drawer. */
  chooseWord(playerId: string, rawWord: string): boolean {
    if (this.phase !== 'choosing' || playerId !== this.drawerId) return false;

    const word = rawWord.trim().toLowerCase();
    if (!this.wordOptions.includes(word)) return false;

    this.clearWordChoiceTimer();
    this.currentWord = word;
    this.phase = 'drawing';
    this.roundEndsAt = Date.now() + this.room.settings.drawTime * 1000;

    const base = {
      drawerId: this.drawerId,
      maskedWord: maskWord(word),
      wordLength: word.length,
      endsAt: this.roundEndsAt,
      round: this.round,
    };

    // Per-player payloads: the word is added only for the drawer.
    for (const player of this.room.players) {
      this.room.sendTo(
        player.id,
        'word_chosen',
        player.id === this.drawerId ? { ...base, word } : base,
      );
    }

    this.wordOptions = [];
    this.timers.draw = setTimeout(() => {
      this.endRound('time_up');
    }, this.room.settings.drawTime * 1000);

    return true;
  }

  /** Called by the socket handler for every guess. All correctness checks happen here. */
  handleGuess(playerId: string, rawText: string): void {
    if (this.phase !== 'drawing' || !this.currentWord) return;

    const player = this.room.getPlayer(playerId);
    if (!player || playerId === this.drawerId || player.hasGuessed) return;

    const text = rawText.trim().slice(0, 60);
    if (!text) return;

    // Word matching is intentionally strict: trim + case-insensitive exact match.
    const isCorrect = text.toLowerCase() === this.currentWord.toLowerCase();

    if (!isCorrect) {
      this.room.sendTo(playerId, 'guess_result', { correct: false });
      this.room.broadcast('chat_message', {
        id: makeId(),
        kind: 'guess',
        playerId,
        name: player.name,
        text,
      });
      return;
    }

    const drawTimeMs = this.room.settings.drawTime * 1000;
    const remainingMs = Math.max(0, (this.roundEndsAt ?? Date.now()) - Date.now());
    const timeRatio = Math.min(1, remainingMs / drawTimeMs);

    // Faster guess -> up to 200 points, slowest possible correct guess -> 100.
    const points =
      MIN_GUESS_POINTS + Math.round((MAX_GUESS_POINTS - MIN_GUESS_POINTS) * timeRatio);

    player.hasGuessed = true;
    player.score += points;
    this.roundPoints[player.id] = (this.roundPoints[player.id] ?? 0) + points;

    const drawer = this.drawerId ? this.room.getPlayer(this.drawerId) : undefined;
    if (drawer) {
      drawer.score += DRAWER_POINTS_PER_GUESSER;
      this.roundPoints[drawer.id] =
        (this.roundPoints[drawer.id] ?? 0) + DRAWER_POINTS_PER_GUESSER;
    }

    this.room.sendTo(playerId, 'guess_result', { correct: true, points });

    // Never broadcast the correct guess text. Only a system notice.
    this.room.broadcast('chat_message', {
      id: makeId(),
      kind: 'system',
      text: `${player.name} guessed the word!`,
    });

    this.broadcastPlayers();

    if (this.allGuessersGuessed()) {
      this.endRound('all_guessed');
    }
  }

  private allGuessersGuessed(): boolean {
    const guessers = this.room.players.filter((player) => player.id !== this.drawerId);
    return guessers.length > 0 && guessers.every((player) => player.hasGuessed);
  }

  private endRound(reason: RoundEndReason): void {
    if (this.phase !== 'drawing' && this.phase !== 'choosing') return;

    this.clearTimers();
    this.phase = 'roundEnd';
    this.chooseEndsAt = null;
    this.roundEndsAt = null;

    const payload: RoundEndPayload = {
      word: this.currentWord,
      reason,
      players: this.room.players.map((player) => player.toInfo()),
      deltas: { ...this.roundPoints },
      nextAt: Date.now() + ROUND_END_MS,
    };

    this.room.broadcast('round_end', payload);

    if (this.room.players.length < 2) {
      this.endGame();
      return;
    }

    this.timers.nextTurn = setTimeout(() => {
      this.advanceTurn();
    }, ROUND_END_MS);
  }

  private advanceTurn(): void {
    this.clearNextTurnTimer();
    if (this.phase === 'gameOver') return;

    if (this.room.players.length < 2) {
      this.endGame();
      return;
    }

    this.turnIndex += 1;

    if (this.turnIndex >= this.turnOrder.length) {
      this.round += 1;

      if (this.round > this.room.settings.rounds) {
        this.endGame();
        return;
      }

      // Rebuild from the current player list so anyone who left is skipped.
      this.turnOrder = this.room.players.map((player) => player.id);
      this.turnIndex = 0;
    }

    if (this.turnOrder.length === 0) {
      this.endGame();
      return;
    }

    this.startTurn();
  }

  endGame(): void {
    if (this.phase === 'gameOver') return;

    this.clearTimers();
    this.phase = 'gameOver';
    this.chooseEndsAt = null;
    this.roundEndsAt = null;

    const standings = [...this.room.players].sort((a, b) => b.score - a.score);

    this.room.broadcast('game_over', {
      standings: standings.map((player) => player.toInfo()),
      winnerId: standings[0]?.id ?? null,
    });
  }

  /**
   * Removes a departed player from the current turn order. The socket handler
   * has already removed them from room.players before calling this.
   */
  onPlayerLeft(playerId: string): void {
    const removedIndex = this.turnOrder.indexOf(playerId);

    if (removedIndex !== -1) {
      this.turnOrder.splice(removedIndex, 1);
      // Keep turnIndex pointing at the same current drawer, or at the slot the
      // departing drawer occupied so the next advance starts the right player.
      if (removedIndex <= this.turnIndex) this.turnIndex -= 1;
    }

    if (this.room.players.length === 0) return;

    if (this.room.players.length < 2) {
      if (this.phase !== 'lobby') this.endGame();
      return;
    }

    if (this.phase === 'choosing' || this.phase === 'drawing') {
      if (playerId === this.drawerId) {
        this.endRound('drawer_left');
        return;
      }

      if (this.phase === 'drawing' && this.allGuessersGuessed()) {
        this.endRound('all_guessed');
      }
    }
  }

  resetToLobby(): void {
    this.clearTimers();
    this.phase = 'lobby';
    this.round = 0;
    this.turnOrder = [];
    this.turnIndex = 0;
    this.drawerId = null;
    this.currentWord = null;
    this.wordOptions = [];
    this.chooseEndsAt = null;
    this.roundEndsAt = null;
    this.roundPoints = {};
    this.room.strokes = [];

    for (const player of this.room.players) {
      player.score = 0;
      player.hasGuessed = false;
    }

    this.room.broadcast('game_state', this.room.getState(''));
  }

  canDraw(playerId: string): boolean {
    return this.phase === 'drawing' && this.drawerId === playerId;
  }

  getPublicState(viewerId: string) {
    const word = this.currentWord;

    return {
      phase: this.phase,
      round: this.round,
      drawerId: this.drawerId,
      maskedWord: word ? maskWord(word) : null,
      wordLength: word ? word.length : null,
      // The secret is only ever exposed to the current drawer.
      word: this.drawerId === viewerId ? word : null,
      endsAt: this.phase === 'drawing' ? this.roundEndsAt : null,
      chooseEndsAt: this.phase === 'choosing' ? this.chooseEndsAt : null,
    };
  }

  clearTimers(): void {
    this.clearWordChoiceTimer();
    this.clearDrawTimer();
    this.clearNextTurnTimer();
  }

  private clearWordChoiceTimer(): void {
    if (this.timers.wordChoice) clearTimeout(this.timers.wordChoice);
    this.timers.wordChoice = null;
  }

  private clearDrawTimer(): void {
    if (this.timers.draw) clearTimeout(this.timers.draw);
    this.timers.draw = null;
  }

  private clearNextTurnTimer(): void {
    if (this.timers.nextTurn) clearTimeout(this.timers.nextTurn);
    this.timers.nextTurn = null;
  }

  private broadcastPlayers(): void {
    this.room.broadcast('players_update', {
      players: this.room.players.map((player) => player.toInfo()),
      hostId: this.room.hostId,
    });
  }
}
