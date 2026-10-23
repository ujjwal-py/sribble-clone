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

export default function RoundEndOverlay({ result, round }: RoundEndOverlayProps) {
  return (
    <div className="canvas-overlay">
      <div className="overlay-card round-end-card">
        <p className="eyebrow">Round {round} complete</p>
        <p className="round-reason">{REASON_TEXT[result.reason]}</p>

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
