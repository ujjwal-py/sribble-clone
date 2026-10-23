import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { socket } from '../socket';
import type { JoinResponse, RoomSettings } from '../types';

const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
};

interface SelectFieldProps {
  label: string;
  value: number;
  options: number[];
  suffix?: string;
  onChange: (value: number) => void;
}

function SelectField({ label, value, options, suffix, onChange }: SelectFieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(Number(event.target.value))}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
            {suffix ? ` ${suffix}` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

function range(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export default function HomePage() {
  const navigate = useNavigate();
  const [createName, setCreateName] = useState('');
  const [joinName, setJoinName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [createError, setCreateError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [online, setOnline] = useState(socket.connected);

  useEffect(() => {
    // Returning to the home page (including browser Back) leaves any old room.
    socket.emit('leave_room');
    setOnline(socket.connected);

    const handleConnect = (): void => setOnline(true);
    const handleDisconnect = (): void => setOnline(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  function updateSetting<K extends keyof RoomSettings>(key: K, value: number): void {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }

  function handleCreate(event: FormEvent): void {
    event.preventDefault();
    const name = createName.trim();
    if (!name) {
      setCreateError('Please enter a name.');
      return;
    }

    setBusy('create');
    setCreateError('');

    socket.emit('create_room', { name, settings }, (response: JoinResponse) => {
      setBusy(null);
      if (!response.ok) {
        setCreateError(response.error);
        return;
      }

      navigate(`/room/${response.code}`, {
        state: { playerId: response.playerId, room: response.state },
      });
    });
  }

  function handleJoin(event: FormEvent): void {
    event.preventDefault();
    const name = joinName.trim();
    const code = joinCode.trim().toUpperCase();

    if (!name) {
      setJoinError('Please enter a name.');
      return;
    }
    if (!code) {
      setJoinError('Please enter a room code.');
      return;
    }

    setBusy('join');
    setJoinError('');

    socket.emit('join_room', { code, name }, (response: JoinResponse) => {
      setBusy(null);
      if (!response.ok) {
        setJoinError(response.error);
        return;
      }

      navigate(`/room/${response.code}`, {
        state: { playerId: response.playerId, room: response.state },
      });
    });
  }

  return (
    <div className="home-page">
      <main className="home-inner">
        <header className="hero">
          <div className="mini-brand">
            <span className="brand-mark">S</span>
            <span>Scribble</span>
          </div>
          <h1>Draw it. Guess it. Laugh about it.</h1>
          <p className="hero-subtitle">
            A real-time multiplayer drawing and guessing game. Create a room, share the
            link, and take turns sketching the secret word.
          </p>
          <div className="hero-meta">
            <span>2–20 players</span>
            <span>2–10 rounds</span>
            <span>No account needed</span>
          </div>
          {!online && <p className="connection-note">Connecting to the game server...</p>}
        </header>

        <div className="home-grid">
          <section className="card home-card">
            <div className="card-heading">
              <p className="eyebrow">Host a game</p>
              <h2>Create a room</h2>
            </div>

            <form className="stack" onSubmit={handleCreate}>
              <label className="field">
                <span>Your name</span>
                <input
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  placeholder="e.g. Alex"
                  maxLength={20}
                  autoComplete="nickname"
                />
              </label>

              <div className="settings-grid">
                <SelectField
                  label="Max players"
                  value={settings.maxPlayers}
                  options={range(2, 20)}
                  onChange={(value) => updateSetting('maxPlayers', value)}
                />
                <SelectField
                  label="Rounds"
                  value={settings.rounds}
                  options={range(2, 10)}
                  onChange={(value) => updateSetting('rounds', value)}
                />
                <SelectField
                  label="Draw time"
                  value={settings.drawTime}
                  options={[15, 30, 45, 60, 90, 120, 180, 240]}
                  suffix="sec"
                  onChange={(value) => updateSetting('drawTime', value)}
                />
                <SelectField
                  label="Word choices"
                  value={settings.wordCount}
                  options={range(1, 5)}
                  onChange={(value) => updateSetting('wordCount', value)}
                />
              </div>

              {createError && <p className="form-error">{createError}</p>}

              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={busy !== null || !online}
              >
                {busy === 'create' ? 'Creating...' : 'Create room'}
              </button>
            </form>
          </section>

          <section className="card home-card join-card">
            <div className="card-heading">
              <p className="eyebrow">Have a code?</p>
              <h2>Join a room</h2>
            </div>

            <form className="stack" onSubmit={handleJoin}>
              <label className="field">
                <span>Room code</span>
                <input
                  className="code-input"
                  value={joinCode}
                  onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={6}
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </label>

              <label className="field">
                <span>Your name</span>
                <input
                  value={joinName}
                  onChange={(event) => setJoinName(event.target.value)}
                  placeholder="e.g. Sam"
                  maxLength={20}
                  autoComplete="nickname"
                />
              </label>

              {joinError && <p className="form-error">{joinError}</p>}

              <button
                type="submit"
                className="btn btn-secondary btn-large"
                disabled={busy !== null || !online}
              >
                {busy === 'join' ? 'Joining...' : 'Join room'}
              </button>
            </form>

            <div className="join-divider">
              <span>Open a shared link?</span>
            </div>
            <p className="muted small">
              A friend&apos;s invite link takes you straight to the room, where you can
              enter your name.
            </p>
          </section>
        </div>

        <footer className="home-footer">
          <span>Server-authoritative scoring</span>
          <span>·</span>
          <span>Live drawing sync</span>
          <span>·</span>
          <span>Rooms disappear when everyone leaves</span>
        </footer>
      </main>
    </div>
  );
}
