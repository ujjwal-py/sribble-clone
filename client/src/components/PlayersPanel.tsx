import { Check, Crown, Pencil, Trophy, Users } from 'lucide-react';
import type { RoomState } from '../types';

interface PlayersPanelProps {
  room: RoomState;
  playerId: string;
}

export default function PlayersPanel({ room, playerId }: PlayersPanelProps) {
  const players =
    room.phase === 'lobby'
      ? room.players
      : [...room.players].sort((a, b) => b.score - a.score);

  return (
    <section className="panel players-panel">
      <div className="panel-heading">
        <h2>
          {room.phase === 'lobby' ? (
            <Users className="icon" aria-hidden="true" />
          ) : (
            <Trophy className="icon" aria-hidden="true" />
          )}
          {room.phase === 'lobby' ? 'Players' : 'Scoreboard'}
        </h2>
        <span className="muted">
          {room.players.length}/{room.settings.maxPlayers}
        </span>
      </div>

      <ul className="player-list">
        {players.map((player, index) => (
          <li key={player.id} className="player-row">
            {room.phase !== 'lobby' && <span className="player-rank">{index + 1}</span>}

            <div className="player-name-block">
              <span className="player-name">
                {player.name}
                {player.id === playerId && <span className="you-label">you</span>}
              </span>
              <span className="player-badges">
                {player.id === room.hostId && (
                  <span className="badge badge-host">
                    <Crown className="icon" aria-hidden="true" /> Host
                  </span>
                )}
                {player.id === room.drawerId && room.phase !== 'lobby' && (
                  <span className="badge badge-drawer">
                    <Pencil className="icon" aria-hidden="true" /> Drawing
                  </span>
                )}
              </span>
            </div>

            {room.phase !== 'lobby' ? (
              <span className="player-score">{player.score}</span>
            ) : (
              <span className="badge badge-ready">
                <Check className="icon" aria-hidden="true" /> Ready
              </span>
            )}

            {room.phase === 'drawing' && player.hasGuessed && player.id !== room.drawerId && (
              <span className="guessed-mark" title="Guessed correctly">
                <Check className="icon" aria-hidden="true" />
              </span>
            )}
          </li>
        ))}
      </ul>

      {room.phase === 'lobby' && room.players.length < 2 && (
        <p className="panel-note">Share the room link to bring in another player.</p>
      )}
    </section>
  );
}
