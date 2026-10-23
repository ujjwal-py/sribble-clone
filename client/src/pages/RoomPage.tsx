import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { CanvasHandle } from '../components/CanvasBoard';
import GameView from '../components/GameView';
import Lobby from '../components/Lobby';
import ThemeToggle from '../components/ThemeToggle';
import { socket } from '../socket';
import type {
  ChatMessage,
  GameOverPayload,
  JoinResponse,
  RoomState,
  RoundEndPayload,
} from '../types';

interface RoomLocationState {
  playerId: string;
  room: RoomState;
}

export default function RoomPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const expectedCode = code.toUpperCase();

  const navigationState = location.state as RoomLocationState | null;
  const initial =
    navigationState && navigationState.room.code === expectedCode
      ? navigationState
      : null;

  const [playerId, setPlayerId] = useState<string | null>(initial?.playerId ?? null);
  const [room, setRoom] = useState<RoomState | null>(initial?.room ?? null);
  const [options, setOptions] = useState<{ options: string[]; endsAt: number } | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roundResult, setRoundResult] = useState<RoundEndPayload | null>(null);
  const [gameOver, setGameOver] = useState<GameOverPayload | null>(null);
  const [guessNote, setGuessNote] = useState('');

  const [joinName, setJoinName] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [online, setOnline] = useState(socket.connected);
  const [disconnected, setDisconnected] = useState(false);

  const canvasRef = useRef<CanvasHandle>(null);
  const inRoomRef = useRef(Boolean(initial));

  useEffect(() => {
    const handleGameState = (state: RoomState): void => {
      setRoom(state);
      setOptions(null);
      setRoundResult(null);
      setGameOver(null);
      setMessages([]);
      setGuessNote('');
      canvasRef.current?.setStrokes(state.strokes);
    };

    const handlePlayerList = (payload: {
      players: RoomState['players'];
      hostId: string | null;
    }): void => {
      setRoom((previous) =>
        previous
          ? { ...previous, players: payload.players, hostId: payload.hostId }
          : previous,
      );
    };

    const handleRoundStart = (payload: {
      round: number;
      drawerId: string;
      chooseEndsAt: number;
    }): void => {
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              phase: 'choosing',
              round: payload.round,
              drawerId: payload.drawerId,
              chooseEndsAt: payload.chooseEndsAt,
              endsAt: null,
              maskedWord: null,
              wordLength: null,
              word: null,
            }
          : previous,
      );
      setOptions(null);
      setRoundResult(null);
      setGameOver(null);
      setMessages([]);
      setGuessNote('');
      canvasRef.current?.setStrokes([]);
    };

    const handleWordOptions = (payload: { options: string[]; endsAt: number }): void => {
      setOptions(payload);
      setRoom((previous) =>
        previous ? { ...previous, chooseEndsAt: payload.endsAt } : previous,
      );
    };

    const handleWordChosen = (payload: {
      drawerId: string;
      maskedWord: string;
      wordLength: number;
      endsAt: number;
      round: number;
      word?: string;
    }): void => {
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              phase: 'drawing',
              round: payload.round,
              drawerId: payload.drawerId,
              maskedWord: payload.maskedWord,
              wordLength: payload.wordLength,
              // Only the drawer's socket receives `word`.
              word: payload.word ?? null,
              endsAt: payload.endsAt,
              chooseEndsAt: null,
            }
          : previous,
      );
      setOptions(null);
      setGuessNote('');
    };

    const handleDrawData = (payload: {
      type: 'start' | 'move' | 'end';
      stroke?: RoomState['strokes'][number];
      strokeId?: string;
      x?: number;
      y?: number;
    }): void => {
      if (payload.type === 'start' && payload.stroke) {
        canvasRef.current?.startRemoteStroke(payload.stroke);
        return;
      }

      if (
        payload.type === 'move' &&
        payload.strokeId &&
        typeof payload.x === 'number' &&
        typeof payload.y === 'number'
      ) {
        canvasRef.current?.addRemotePoint(payload.strokeId, payload.x, payload.y);
      }
    };

    const handleRoundEnd = (payload: RoundEndPayload): void => {
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              phase: 'roundEnd',
              players: payload.players,
              endsAt: null,
              chooseEndsAt: null,
            }
          : previous,
      );
      setRoundResult(payload);
      setOptions(null);
      setGuessNote('');
    };

    const handleGameOver = (payload: GameOverPayload): void => {
      setRoom((previous) =>
        previous ? { ...previous, phase: 'gameOver' } : previous,
      );
      setGameOver(payload);
      setRoundResult(null);
      setOptions(null);
      setGuessNote('');
    };

    const handleGuessResult = (payload: { correct: boolean; points?: number }): void => {
      setGuessNote(
        payload.correct
          ? `Correct! +${payload.points ?? 0} points.`
          : 'Not quite — try again.',
      );
    };

    const handleChatMessage = (message: ChatMessage): void => {
      setMessages((previous) => {
        const next = [...previous, message];
        return next.length > 50 ? next.slice(-50) : next;
      });
    };

    const handleConnect = (): void => {
      setOnline(true);
      if (!inRoomRef.current) setDisconnected(false);
    };

    const handleDisconnect = (): void => {
      setOnline(false);
      if (inRoomRef.current) setDisconnected(true);
    };

    socket.on('game_state', handleGameState);
    socket.on('player_joined', handlePlayerList);
    socket.on('player_left', handlePlayerList);
    socket.on('players_update', handlePlayerList);
    socket.on('round_start', handleRoundStart);
    socket.on('word_options', handleWordOptions);
    socket.on('word_chosen', handleWordChosen);
    socket.on('draw_data', handleDrawData);
    socket.on('draw_undo', (payload) => canvasRef.current?.setStrokes(payload.strokes));
    socket.on('canvas_clear', () => canvasRef.current?.setStrokes([]));
    socket.on('round_end', handleRoundEnd);
    socket.on('game_over', handleGameOver);
    socket.on('guess_result', handleGuessResult);
    socket.on('chat_message', handleChatMessage);
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    setOnline(socket.connected);

    return () => {
      socket.off('game_state', handleGameState);
      socket.off('player_joined', handlePlayerList);
      socket.off('player_left', handlePlayerList);
      socket.off('players_update', handlePlayerList);
      socket.off('round_start', handleRoundStart);
      socket.off('word_options', handleWordOptions);
      socket.off('word_chosen', handleWordChosen);
      socket.off('draw_data', handleDrawData);
      socket.off('draw_undo');
      socket.off('canvas_clear');
      socket.off('round_end', handleRoundEnd);
      socket.off('game_over', handleGameOver);
      socket.off('guess_result', handleGuessResult);
      socket.off('chat_message', handleChatMessage);
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, []);

  function handleJoin(event: FormEvent): void {
    event.preventDefault();
    const name = joinName.trim();
    if (!name) {
      setJoinError('Please enter a name.');
      return;
    }

    setJoining(true);
    setJoinError('');

    socket.emit('join_room', { code: expectedCode, name }, (response: JoinResponse) => {
      setJoining(false);
      if (!response.ok) {
        setJoinError(response.error);
        return;
      }

      inRoomRef.current = true;
      setPlayerId(response.playerId);
      setRoom(response.state);
      setOnline(true);
    });
  }

  if (!room || !playerId) {
    return (
      <div className="center-page">
        <form className="card join-room-card" onSubmit={handleJoin}>
          <div className="join-room-top">
            <p className="eyebrow">Room {expectedCode || 'unknown'}</p>
            <ThemeToggle />
          </div>
          <h1>Join the game</h1>
          <p className="muted">Enter a name to take a seat in this room.</p>

          <label className="field">
            <span>Your name</span>
            <input
              value={joinName}
              onChange={(event) => setJoinName(event.target.value)}
              placeholder="e.g. Sam"
              maxLength={20}
              autoFocus
              autoComplete="nickname"
            />
          </label>

          {joinError && <p className="form-error">{joinError}</p>}
          {!online && (
            <p className="connection-note">Connecting to the game server...</p>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-large"
            disabled={joining || !online || !expectedCode}
          >
            {joining ? 'Joining...' : 'Join room'}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => navigate('/')}
          >
            Back to home
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {disconnected && (
        <div className="connection-banner">
          <span>Connection lost. This seat was closed on the server.</span>
          <button type="button" className="btn btn-small" onClick={() => navigate('/')}>
            Return home
          </button>
        </div>
      )}

      {room.phase === 'lobby' ? (
        <Lobby
          room={room}
          playerId={playerId}
          onStart={() => socket.emit('start_game')}
          onLeave={() => navigate('/')}
        />
      ) : (
        <GameView
          room={room}
          playerId={playerId}
          options={options}
          messages={messages}
          roundResult={roundResult}
          gameOver={gameOver}
          guessNote={guessNote}
          canvasRef={canvasRef}
          onChooseWord={(word) => socket.emit('word_chosen', { word })}
          onUndo={() => socket.emit('draw_undo')}
          onClear={() => socket.emit('canvas_clear')}
          onGuess={(text) => {
            setGuessNote('');
            socket.emit('guess', { text });
          }}
          onPlayAgain={() => socket.emit('play_again')}
          onLeave={() => navigate('/')}
        />
      )}
    </>
  );
}
