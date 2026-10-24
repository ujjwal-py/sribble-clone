import { DoorOpen, Timer, Trophy, type LucideIcon } from 'lucide-react';
import type { RoundEndPayload } from '../types';
import Countdown from './Countdown';

interface RoundEndOverlayProps {
  result: RoundEndPayload;
  round: number;
}

const REASON_TEXT: Record<RoundEndPayload['reason'], string> = {
  time_up: "Time's up!",
  all_guessed: 'Everyone guessed it!',
  drawer_left: 'The drawer left, so this turn ended.',
};

const REASON_ICON: Record<RoundEndPayload['reason'], LucideIcon> = {
  time_up: Timer,
  all_guessed: Trophy,
  drawer_left: DoorOpen,
};

export default function RoundEndOverlay({ result, round }: RoundEndOverlayProps) {
  const ReasonIcon = REASON_ICON[result.reason];

  return (
    <div className="canvas-overlay">
      <div className="overlay-card round-end-card">
        <p className="eyebrow">
          <Trophy className="icon" aria-hidden="true" /> Round {round} complete
        </p>
        <p className="round-reason">
          <ReasonIcon className="icon" aria-hidden="true" />
          {REASON_TEXT[result.reason]}
        </p>

        <h2 className="revealed-word">
          {result.word ? result.word : 'No word chosen'}
        </h2>
        <p className="muted small">The word was</p>

        <ul className="delta-list">
          {result.players.map((player) => {
            const delta = result.deltas[player.id] ?? 0;
            return (
              <li key={player.id}>
                <span>{player.name}</span>
                <strong className={delta > 0 ? 'delta-positive' : 'delta-zero'}>
                  +{delta}
                </strong>
              </li>
            );
          })}
        </ul>

        <Countdown endsAt={result.nextAt} label="Next turn in" />
      </div>
    </div>
  );
}
