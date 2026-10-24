import { Crown, DoorOpen, LoaderCircle, RotateCcw, Trophy } from 'lucide-react';
import type { GameOverPayload } from '../types';

interface GameOverScreenProps {
  payload: GameOverPayload;
  playerId: string;
  hostId: string | null;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export default function GameOverScreen({
  payload,
  playerId,
  hostId,
  onPlayAgain,
  onLeave,
}: GameOverScreenProps) {
  const topScore = payload.standings[0]?.score ?? 0;
  const winners = payload.standings.filter((player) => player.score === topScore);
  const isHost = hostId === playerId;

  const title =
    winners.length === 0
      ? 'Game over'
      : winners.length === 1
        ? `${winners[0].name} wins!`
        : "It's a tie!";

  return (
    <div className="modal-backdrop">
      <div className="modal-card game-over-card">
        <p className="eyebrow">
          <Trophy className="icon" aria-hidden="true" /> Final standings
        </p>
        <h1>{title}</h1>
        {winners.length > 1 && (
          <p className="muted">{winners.map((player) => player.name).join(' & ')}</p>
        )}

        <ol className="final-standings">
          {payload.standings.map((player, index) => (
            <li
              key={player.id}
              className={player.id === playerId ? 'final-row final-row-you' : 'final-row'}
            >
              <span className="final-rank">{index + 1}</span>
              <span className="final-name">
                {player.score === topScore && topScore > 0 && (
                  <Crown className="icon final-crown" aria-hidden="true" />
                )}
                {player.name}
                {player.id === playerId && <span className="you-label">you</span>}
              </span>
              <strong className="final-score">{player.score}</strong>
            </li>
          ))}
        </ol>

        <div className="modal-actions">
          {isHost ? (
            <button type="button" className="btn btn-primary btn-large" onClick={onPlayAgain}>
              <RotateCcw className="icon" aria-hidden="true" /> Back to lobby
            </button>
          ) : (
            <p className="waiting-note">
              <LoaderCircle className="icon spin" aria-hidden="true" />
              Waiting for the host to restart
            </p>
          )}
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            <DoorOpen className="icon" aria-hidden="true" /> Leave room
          </button>
        </div>
        <p className="muted small">The lobby keeps the same settings and resets scores.</p>
      </div>
    </div>
  );
}
