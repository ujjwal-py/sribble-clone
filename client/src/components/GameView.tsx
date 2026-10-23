import { useState, type RefObject } from 'react';
import type {
  ChatMessage,
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
  onPlayAgain,
  onLeave,
}: GameViewProps) {
  const [color, setColor] = useState('#111827');
  const [size, setSize] = useState(0.005);

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
            Round {Math.max(1, room.round)}/{room.settings.rounds}
          </span>
          <span className="topbar-divider" />
          <span>
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
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="game-layout">
        <main className="game-main">
          <div className="word-banner">
            {room.phase === 'drawing' && isDrawer && (
              <>
                <span className="word-label">Draw this</span>
                <strong className="word-value">{room.word}</strong>
              </>
            )}

            {room.phase === 'drawing' && !isDrawer && (
              <>
                <span className="word-label">Guess the word</span>
                <strong className="word-mask">{room.maskedWord}</strong>
                <span className="muted small">{room.wordLength} letters</span>
              </>
            )}

            {room.phase === 'choosing' && (
              <span className="word-label">The word is hidden while it is being chosen.</span>
            )}

            {room.phase === 'roundEnd' && (
              <span className="word-label">Round complete — the word is revealed below.</span>
            )}

            {room.phase === 'gameOver' && (
              <span className="word-label">Final scores are in.</span>
            )}
          </div>

          <div className="canvas-frame">
            <CanvasBoard ref={canvasRef} canDraw={canDraw} color={color} size={size} />

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
              color={color}
              size={size}
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
          <PlayersPanel room={room} playerId={playerId} />
          <div className="panel tip-panel">
            <h2>How to score</h2>
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
