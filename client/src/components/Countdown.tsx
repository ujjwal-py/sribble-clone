import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface CountdownProps {
  endsAt: number | null;
  label?: string;
}

export default function Countdown({ endsAt, label }: CountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;

    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [endsAt]);

  if (!endsAt) return null;

  const seconds = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const warning = seconds <= 10;

  return (
    <div className={`countdown ${warning ? 'countdown-warning' : ''}`} aria-live="polite">
      <Clock className="icon countdown-icon" aria-hidden="true" />
      {label && <span className="countdown-label">{label}</span>}
      <span className="countdown-value">{seconds}</span>
      <span className="countdown-unit">s</span>
    </div>
  );
}
