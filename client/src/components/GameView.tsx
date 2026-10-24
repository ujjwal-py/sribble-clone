import { useState, type RefObject } from 'react';
import {
  Check,
  DoorOpen,
  Eye,
  LoaderCircle,
  Pencil,
  Target,
  Trophy,
} from 'lucide-react';
import type {
  ChatMessage,
  DrawTool,
  GameOverPayload,
  RoundEndPayload,
  RoomState,
} from '../types';
import CanvasBoard, { type CanvasHandle } from './CanvasBoard';
import Countdown from './Countdown';
import DrawingToolbar from './DrawingToolbar';
import GameOverScreen from './GameOverScreen';
import GuessPanel from './GuessPanel';
import PlayersPanel from './PlayersPanel';
import RoundEndOverlay from './RoundEndOverlay';
import ThemeToggle from './ThemeToggle';
import WordChoice from './WordChoice';

interface GameViewProps {
  room: RoomState;
  playerId: string;
  options: { options: string[]; endsAt: number } | null;
  messages: ChatMessage[];
  roundResult: RoundEndPayload | null;
  gameOver: GameOverPayload | null;
  guessNote: string;
  canvasRef: RefObject<CanvasHandle>;
  onChooseWord: (word: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onGuess: (text: string) => void;
  onKick: (playerId: string) => void;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export default function GameView({
  room,
  playerId,
  options,
  messages,
  roundResult,
  gameOver,
  guessNote,
  canvasRef,
  onChooseWord,
  onUndo,
  onClear,
  onGuess,
  onKick,
  onPlayAgain,
  onLeave,
}: GameViewProps) {
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(0.005);
  const [tool, setTool] = useState<DrawTool>('brush');

  const isDrawer = room.drawerId === playerId;
  const drawer = room.players.find((player) => player.id === room.drawerId);
  const canDraw = isDrawer && room.phase === 'drawing';

  const topbarEnd =
    room.phase === 'drawing' ? room.endsAt : room.phase === 'choosing' ? room.chooseEndsAt : null;

  return (
    <div className="game-page">
      <header className="game-topbar">
        <div className="topbar-left">
          <div className="mini-brand">
            <span className="brand-mark">S</span>
            <span>Scribble</span>
          </div>
          <span className="room-pill">{room.code}</span>
        </div>

        <div className="topbar-center">
          <span>
            <Trophy className="icon" aria-hidden="true" /> Round {Math.max(1, room.round)}/
            {room.settings.rounds}
          </span>
          <span className="topbar-divider" />
          <span>
            {room.phase === 'choosing' ? (
              <LoaderCircle className="icon spin" aria-hidden="true" />
            ) : room.phase === 'drawing' ? (
              <Pencil className="icon" aria-hidden="true" />
            ) : room.phase === 'roundEnd' ? (
              <Check className="icon" aria-hidden="true" />
            ) : (
              <Trophy className="icon" aria-hidden="true" />
            )}
            {room.phase === 'choosing'
              ? `${drawer?.name ?? 'Someone'} is choosing`
              : room.phase === 'drawing'
                ? `${drawer?.name ?? 'Someone'} is drawing`
                : room.phase === 'roundEnd'
                  ? 'Round complete'
                  : 'Game over'}
          </span>
        </div>

        <div className="topbar-right">
          {topbarEnd && <Countdown endsAt={topbarEnd} label="Time" />}
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            <DoorOpen className="icon" aria-hidden="true" /> Leave
          </button>
        </div>
      </header>

      <div className="game-layout">
        <main className="game-main">
          <div className="word-banner">
            {room.phase === 'drawing' && isDrawer && (
              <>
                <span className="word-label">
                  <Pencil className="icon" aria-hidden="true" /> Draw this
                </span>
                <strong className="word-value">{room.word}</strong>
              </>
            )}

            {room.phase === 'drawing' && !isDrawer && (
              <>
                <span className="word-label">
                  <Eye className="icon" aria-hidden="true" /> Guess the word
                </span>
                <strong className="word-mask">{room.maskedWord}</strong>
                <span className="muted small">{room.wordLength} letters</span>
              </>
            )}

            {room.phase === 'choosing' && (
              <span className="word-label">
                <LoaderCircle className="icon spin" aria-hidden="true" />
                The word is hidden while it is being chosen.
              </span>
            )}

            {room.phase === 'roundEnd' && (
              <span className="word-label">
                <Trophy className="icon" aria-hidden="true" />
                Round complete — the word is revealed below.
              </span>
            )}

            {room.phase === 'gameOver' && (
              <span className="word-label">
                <Trophy className="icon" aria-hidden="true" />
                Final scores are in.
              </span>
            )}
          </div>

          <div className="canvas-frame">
            <CanvasBoard
              ref={canvasRef}
              canDraw={canDraw}
              tool={tool}
              color={color}
              size={size}
            />

            {room.phase === 'choosing' &&
              (isDrawer && options ? (
                <WordChoice
                  options={options.options}
                  endsAt={options.endsAt}
                  onChoose={onChooseWord}
                />
              ) : (
                <div className="canvas-overlay">
                  <div className="overlay-card choosing-card">
                    <div className="spinner" />
                    <h2>{drawer?.name ?? 'The drawer'} is choosing a word</h2>
                    <p className="muted">The round starts as soon as they pick.</p>
                    <Countdown endsAt={room.chooseEndsAt} />
                  </div>
                </div>
              ))}

            {room.phase === 'roundEnd' && roundResult && (
              <RoundEndOverlay result={roundResult} round={room.round} />
            )}

            {room.phase === 'gameOver' && gameOver && (
              <GameOverScreen
                payload={gameOver}
                playerId={playerId}
                hostId={room.hostId}
                onPlayAgain={onPlayAgain}
                onLeave={onLeave}
              />
            )}
          </div>

          {isDrawer && room.phase === 'drawing' && (
            <DrawingToolbar
              tool={tool}
              color={color}
              size={size}
              onToolChange={setTool}
              onColorChange={setColor}
              onSizeChange={setSize}
              onUndo={onUndo}
              onClear={onClear}
            />
          )}

          <GuessPanel
            room={room}
            playerId={playerId}
            messages={messages}
            guessNote={guessNote}
            onGuess={onGuess}
          />
        </main>

        <aside className="game-sidebar">
          <PlayersPanel room={room} playerId={playerId} onKick={onKick} />
          <div className="panel tip-panel">
            <h2>
              <Target className="icon" aria-hidden="true" /> How to score
            </h2>
            <p className="muted small">
              Guess correctly to earn up to 200 points. The faster you guess, the more
              you get. The drawer earns 50 points for each person who guesses.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
