import Countdown from './Countdown';

interface WordChoiceProps {
  options: string[];
  endsAt: number;
  onChoose: (word: string) => void;
}

export default function WordChoice({ options, endsAt, onChoose }: WordChoiceProps) {
  return (
    <div className="canvas-overlay">
      <div className="overlay-card word-choice-card">
        <p className="eyebrow">You are drawing</p>
        <h2>Choose a word</h2>
        <p className="muted">Pick one before the timer runs out.</p>

        {options.length > 0 ? (
          <div className="word-options">
            {options.map((word) => (
              <button
                key={word}
                type="button"
                className="word-option"
                onClick={() => onChoose(word)}
              >
                {word}
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Preparing words...</p>
        )}

        <Countdown endsAt={endsAt} label="Auto-pick in" />
      </div>
    </div>
  );
}
