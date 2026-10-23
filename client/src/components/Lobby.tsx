import { useState } from 'react';
import type { RoomState } from '../types';
import PlayersPanel from './PlayersPanel';

interface LobbyProps {
  room: RoomState;
  playerId: string;
  onStart: () => void;
  onLeave: () => void;
}

export default function Lobby({ room, playerId, onStart, onLeave }: LobbyProps) {
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
        <button type="button" className="btn btn-ghost" onClick={onLeave}>
          Leave room
        </button>
      </header>

      <main className="lobby-grid">
        <section className="card lobby-card">
          <div>
            <p className="eyebrow">Room code</p>
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
            <input value={inviteUrl} readOnly aria-label="Invite link" />
            <button type="button" className="btn btn-secondary" onClick={copyInvite}>
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          <div className="settings-chips">
            <span>{room.settings.rounds} rounds</span>
            <span>{room.settings.drawTime}s per turn</span>
            <span>{room.settings.wordCount} word choices</span>
            <span>max {room.settings.maxPlayers} players</span>
          </div>

          {isHost ? (
            <div className="lobby-start">
              <button
                type="button"
                className="btn btn-primary btn-large"
                onClick={onStart}
                disabled={room.players.length < 2}
              >
                Start game
              </button>
              {room.players.length < 2 && (
                <p className="muted small">At least 2 players are needed to start.</p>
              )}
            </div>
          ) : (
            <p className="waiting-note">
              Waiting for the host to start the game
              <span className="waiting-dots">...</span>
            </p>
          )}
        </section>

        <PlayersPanel room={room} playerId={playerId} />
      </main>
    </div>
  );
}
