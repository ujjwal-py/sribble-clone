import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Send,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react';
import type { ChatMessage, RoomState } from '../types';

interface GuessPanelProps {
  room: RoomState;
  playerId: string;
  messages: ChatMessage[];
  guessNote: string;
  onGuess: (text: string) => void;
}

export default function GuessPanel({
  room,
  playerId,
  messages,
  guessNote,
  onGuess,
}: GuessPanelProps) {
  const [text, setText] = useState('');
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const feed = feedRef.current;
    if (feed) feed.scrollTop = feed.scrollHeight;
  }, [messages]);

  const me = room.players.find((player) => player.id === playerId);
  const isDrawer = room.drawerId === playerId;
  const alreadyGuessed = me?.hasGuessed ?? false;
  const canGuess = room.phase === 'drawing' && !isDrawer && !alreadyGuessed;

  let status: string | null = null;
  let StatusIcon: LucideIcon = MessageCircle;
  if (isDrawer) {
    status = "You're drawing — no guessing for you.";
    StatusIcon = Pencil;
  } else if (alreadyGuessed) {
    status = 'You guessed it! Waiting for the others...';
    StatusIcon = CheckCircle2;
  } else if (room.phase === 'choosing') {
    status = 'Waiting for the drawer to pick a word...';
    StatusIcon = LoaderCircle;
  } else if (room.phase === 'roundEnd') {
    status = 'Round over. Next turn starting soon...';
    StatusIcon = Clock3;
  } else if (room.phase === 'gameOver') {
    status = 'Game over.';
    StatusIcon = Trophy;
  }

  function submit(event: FormEvent): void {
    event.preventDefault();
    const guess = text.trim();
    if (!guess || !canGuess) return;
    setText('');
    onGuess(guess);
  }

  return (
    <section className="panel guess-panel">
      <div className="panel-heading">
        <h2>
          <MessageCircle className="icon" aria-hidden="true" /> Guesses
        </h2>
      </div>

      <div className="guess-feed" ref={feedRef}>
        {messages.length === 0 && (
          <p className="muted small guess-empty">
            <MessageCircle className="icon" aria-hidden="true" />
            Guesses will appear here.
          </p>
        )}
        {messages.map((message) => (
          <p
            key={message.id}
            className={`guess-message ${message.kind === 'system' ? 'guess-system' : ''}`}
          >
            {message.kind === 'system' ? (
              message.text
            ) : (
              <>
                <strong>{message.name}</strong>
                <span>{message.text}</span>
              </>
            )}
          </p>
        ))}
      </div>

      {canGuess ? (
        <form className="guess-form" onSubmit={submit}>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type your guess..."
            maxLength={60}
            autoComplete="off"
            aria-label="Your guess"
          />
          <button type="submit" className="btn btn-primary" disabled={!text.trim()}>
            <Send className="icon" aria-hidden="true" /> Guess
          </button>
        </form>
      ) : (
        status && (
          <p className="guess-status">
            <StatusIcon
              className={`icon ${StatusIcon === LoaderCircle ? 'spin' : ''}`}
              aria-hidden="true"
            />
            {status}
          </p>
        )
      )}

      {guessNote && (
        <p className={`guess-note ${guessNote.startsWith('Correct') ? 'guess-note-positive' : ''}`}>
          {guessNote.startsWith('Correct') ? (
            <CheckCircle2 className="icon" aria-hidden="true" />
          ) : (
            <X className="icon" aria-hidden="true" />
          )}
          {guessNote}
        </p>
      )}
    </section>
  );
}
