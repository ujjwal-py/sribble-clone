import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  DoorOpen,
  Globe,
  Link2,
  LoaderCircle,
  Lock,
  LogIn,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Tags,
  Trophy,
  Users,
  WifiOff,
} from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';
import { socket } from '../socket';
import type {
  JoinResponse,
  PublicRoomInfo,
  RoomSettings,
  RoomVisibility,
  WordCategory,
} from '../types';
import { ALL_WORD_CATEGORIES, WORD_CATEGORIES, categorySummary } from '../wordCategories';

const DEFAULT_SETTINGS: RoomSettings = {
  maxPlayers: 8,
  rounds: 3,
  drawTime: 80,
  wordCount: 3,
  categories: [...ALL_WORD_CATEGORIES],
  visibility: 'private',
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
  const [publicRooms, setPublicRooms] = useState<PublicRoomInfo[] | null>(null);

  useEffect(() => {
    // Returning to the home page (including browser Back) leaves any old room.
    socket.emit('leave_room');
    setOnline(socket.connected);

    const handlePublicRooms = (payload: { rooms: PublicRoomInfo[] }): void => {
      setPublicRooms(payload.rooms);
    };

    const handleConnect = (): void => {
      setOnline(true);
      // Re-subscribe after a reconnect so the browser keeps updating.
      socket.emit('subscribe_public_rooms');
    };

    const handleDisconnect = (): void => setOnline(false);

    socket.on('public_rooms', handlePublicRooms);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) socket.emit('subscribe_public_rooms');

    return () => {
      socket.off('public_rooms', handlePublicRooms);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.emit('unsubscribe_public_rooms');
    };
  }, []);

  function updateSetting<K extends keyof RoomSettings>(key: K, value: number): void {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }

  function setVisibility(visibility: RoomVisibility): void {
    setSettings((previous) => ({ ...previous, visibility }));
  }

  function toggleCategory(category: WordCategory): void {
    setSettings((previous) => {
      const isSelected = previous.categories.includes(category);
      if (isSelected && previous.categories.length === 1) return previous;

      return {
        ...previous,
        categories: isSelected
          ? previous.categories.filter((entry) => entry !== category)
          : [...previous.categories, category],
      };
    });
  }

  function selectAllCategories(): void {
    setSettings((previous) => ({
      ...previous,
      categories: [...ALL_WORD_CATEGORIES],
    }));
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

  function joinPublicRoom(code: string): void {
    const name = joinName.trim();
    if (!name) {
      setJoinError('Enter your name above to join a public room.');
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
          <div className="hero-top">
            <div className="mini-brand">
              <span className="brand-mark">D</span>
              <span>DoodleDash</span>
            </div>
            <ThemeToggle />
          </div>
          <h1>Draw it. Guess it. Laugh about it.</h1>
          <p className="hero-subtitle">
            A real-time multiplayer drawing and guessing game. Create a room, share the
            link, and take turns sketching the secret word.
          </p>
          <div className="hero-meta">
            <span>
              <Users className="icon" aria-hidden="true" /> 2–20 players
            </span>
            <span>
              <Trophy className="icon" aria-hidden="true" /> 2–10 rounds
            </span>
            <span>
              <Sparkles className="icon" aria-hidden="true" /> No account needed
            </span>
          </div>
          {!online && (
            <p className="connection-note">
              <WifiOff className="icon" aria-hidden="true" /> Connecting to the game server...
            </p>
          )}
        </header>

        <div className="home-grid">
          <section className="card home-card">
            <div className="card-heading">
              <p className="eyebrow">
                <Plus className="icon" aria-hidden="true" /> Host a game
              </p>
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

              <div className="field">
                <span className="field-label">
                  <Globe className="icon" aria-hidden="true" /> Room type
                </span>
                <div className="visibility-toggle" role="group" aria-label="Room type">
                  <button
                    type="button"
                    className={
                      settings.visibility === 'private'
                        ? 'visibility-option is-selected'
                        : 'visibility-option'
                    }
                    aria-pressed={settings.visibility === 'private'}
                    onClick={() => setVisibility('private')}
                  >
                    <Lock className="icon" aria-hidden="true" />
                    <strong>Private</strong>
                    <span className="visibility-hint">Invite link or code only</span>
                  </button>
                  <button
                    type="button"
                    className={
                      settings.visibility === 'public'
                        ? 'visibility-option is-selected'
                        : 'visibility-option'
                    }
                    aria-pressed={settings.visibility === 'public'}
                    onClick={() => setVisibility('public')}
                  >
                    <Globe className="icon" aria-hidden="true" />
                    <strong>Public</strong>
                    <span className="visibility-hint">Anyone can find and join</span>
                  </button>
                </div>
              </div>

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

              <div className="field category-field">
                <span className="field-label">
                  <Tags className="icon" aria-hidden="true" /> Word categories
                </span>
                <div className="category-grid">
                  {WORD_CATEGORIES.map(({ id, label, icon: Icon }) => {
                    const selected = settings.categories.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        className={selected ? 'category-chip is-selected' : 'category-chip'}
                        aria-pressed={selected}
                        onClick={() => toggleCategory(id)}
                      >
                        <Icon className="icon" aria-hidden="true" /> {label}
                      </button>
                    );
                  })}
                </div>
                <div className="category-actions">
                  <span className="muted small">
                    Words are drawn from the selected categories.
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={selectAllCategories}
                    disabled={settings.categories.length === WORD_CATEGORIES.length}
                  >
                    Select all
                  </button>
                </div>
              </div>

              {createError && <p className="form-error">{createError}</p>}

              <button
                type="submit"
                className="btn btn-primary btn-large"
                disabled={busy !== null || !online}
              >
                {busy === 'create' ? (
                  <>
                    <LoaderCircle className="icon spin" aria-hidden="true" /> Creating...
                  </>
                ) : (
                  <>
                    <Plus className="icon" aria-hidden="true" /> Create room
                  </>
                )}
              </button>
            </form>
          </section>

          <section className="card home-card join-card">
            <div className="card-heading">
              <p className="eyebrow">
                <Link2 className="icon" aria-hidden="true" /> Have a code?
              </p>
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
                {busy === 'join' ? (
                  <>
                    <LoaderCircle className="icon spin" aria-hidden="true" /> Joining...
                  </>
                ) : (
                  <>
                    <LogIn className="icon" aria-hidden="true" /> Join room
                  </>
                )}
              </button>
            </form>

            <div className="join-divider">
              <span>Or join a public room</span>
            </div>

            <div className="public-room-list">
              {publicRooms === null && (
                <p className="muted small public-room-note">
                  <LoaderCircle className="icon spin" aria-hidden="true" /> Looking for open
                  rooms...
                </p>
              )}

              {publicRooms?.length === 0 && (
                <p className="muted small public-room-note">
                  <Globe className="icon" aria-hidden="true" /> No public rooms right now.
                  Create one and set its type to public!
                </p>
              )}

              {publicRooms?.map((room) => (
                <article className="public-room" key={room.code}>
                  <div className="public-room-main">
                    <strong>{room.hostName}&apos;s room</strong>
                    <span className="public-room-meta">
                      <span>
                        <Users className="icon" aria-hidden="true" /> {room.playerCount}/
                        {room.maxPlayers}
                      </span>
                      <span>
                        <Tags className="icon" aria-hidden="true" />{' '}
                        {categorySummary(room.categories)}
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => joinPublicRoom(room.code)}
                    disabled={busy !== null || !online}
                  >
                    <LogIn className="icon" aria-hidden="true" /> Join
                  </button>
                </article>
              ))}
            </div>

            <p className="muted small">
              Your name above is used when you join. Have an invite link? Opening it takes
              you straight to the room.
            </p>
          </section>
        </div>

        <footer className="home-footer">
          <div className="home-footer-links">
            <span>
              <ShieldCheck className="icon" aria-hidden="true" /> Server-authoritative scoring
            </span>
            <span>·</span>
            <span>
              <Pencil className="icon" aria-hidden="true" /> Live drawing sync
            </span>
            <span>·</span>
            <span>
              <DoorOpen className="icon" aria-hidden="true" /> Rooms disappear when everyone leaves
            </span>
          </div>
          <p className="home-credit">
            © {new Date().getFullYear()} DoodleDash · Built by{' '}
            <a
              href="https://github.com/ujjwal-py/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Ujjwal
              <ArrowUpRight className="icon" aria-hidden="true" />
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
