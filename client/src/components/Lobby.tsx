import { useState } from 'react';
import {
  Check,
  Copy,
  DoorOpen,
  Hash,
  Link2,
  LoaderCircle,
  Play,
  Sparkles,
  Tags,
  Timer,
  Trophy,
  Users,
} from 'lucide-react';
import type { RoomState } from '../types';
import { categorySummary } from '../wordCategories';
import PlayersPanel from './PlayersPanel';
import ThemeToggle from './ThemeToggle';

interface LobbyProps {
  room: RoomState;
  playerId: string;
  onStart: () => void;
  onKick: (playerId: string) => void;
  onLeave: () => void;
}

export default function Lobby({ room, playerId, onStart, onKick, onLeave }: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const isHost = room.hostId === playerId;
  const inviteUrl = `${window.location.origin}/room/${room.code}`;

  async function copyInvite(): Promise<void> {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this invite link:', inviteUrl);
    }
  }

  return (
    <div className="lobby-page">
      <header className="lobby-topbar">
        <div className="mini-brand">
          <span className="brand-mark">S</span>
          <span>Scribble</span>
        </div>
        <div className="topbar-actions">
          <ThemeToggle />
          <button type="button" className="btn btn-ghost" onClick={onLeave}>
            <DoorOpen className="icon" aria-hidden="true" /> Leave room
          </button>
        </div>
      </header>

      <main className="lobby-grid">
        <section className="card lobby-card">
          <div>
            <p className="eyebrow">
              <Hash className="icon" aria-hidden="true" /> Room code
            </p>
            <div className="room-code">{room.code}</div>
          </div>

          <div>
            <h1>Waiting for players</h1>
            <p className="muted">
              Send this link to friends. The host starts the game once at least two
              players are here.
            </p>
          </div>

          <div className="invite-box">
            <Link2 className="icon invite-icon" aria-hidden="true" />
            <input value={inviteUrl} readOnly aria-label="Invite link" />
            <button type="button" className="btn btn-secondary" onClick={copyInvite}>
              {copied ? (
                <>
                  <Check className="icon" aria-hidden="true" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="icon" aria-hidden="true" /> Copy link
                </>
              )}
            </button>
          </div>

          <div className="settings-chips">
            <span>
              <Trophy className="icon" aria-hidden="true" /> {room.settings.rounds} rounds
            </span>
            <span>
              <Timer className="icon" aria-hidden="true" /> {room.settings.drawTime}s per turn
            </span>
            <span>
              <Sparkles className="icon" aria-hidden="true" /> {room.settings.wordCount} word choices
            </span>
            <span>
              <Tags className="icon" aria-hidden="true" />{' '}
              {categorySummary(room.settings.categories)}
            </span>
            <span>
              <Users className="icon" aria-hidden="true" /> max {room.settings.maxPlayers} players
            </span>
          </div>

          {isHost ? (
            <div className="lobby-start">
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={onStart}
                disabled={room.players.length < 2}
              >
                <Play className="icon" aria-hidden="true" /> Start game
              </button>
              {room.players.length < 2 && (
                <p className="muted small">At least 2 players are needed to start.</p>
              )}
            </div>
          ) : (
            <p className="waiting-note">
              <LoaderCircle className="icon spin" aria-hidden="true" />
              Waiting for the host to start the game
              <span className="waiting-dots">...</span>
            </p>
          )}
        </section>

        <PlayersPanel room={room} playerId={playerId} onKick={onKick} />
      </main>
    </div>
  );
}
