# Architecture

This document explains how the pieces fit together and why the server is the only authority.

## 1. Big picture

```
┌──────────────────────┐        Socket.IO        ┌──────────────────────────┐
│ React client         │  ───────────────────►   │ Node + Express + Socket.IO│
│                      │  create/join/start      │                          │
│ HomePage             │  draw_* / guess         │ socket.ts                │
│ RoomPage ────────────┤                         │   │                      │
│   ├─ Lobby           │  ◄───────────────────   │   ▼                      │
│   ├─ GameView        │  game_state, round_*    │ RoomManager              │
│   │   ├─ CanvasBoard │  draw_data, chat_*      │   └─ Room                │
│   │   ├─ Toolbar     │  word_options (drawer)  │       ├─ Player[]        │
│   │   └─ GuessPanel  │                         │       └─ Game            │
│   └─ overlays        │                         │           └─ timers      │
└──────────────────────┘                         └──────────────────────────┘
```

The client renders state and sends intents. It never decides:

- whether a guess is correct
- who draws next
- whether a round is over
- what the score is
- what the secret word is (unless it is the drawer)

The server keeps all rooms in a `Map<string, Room>` inside `RoomManager`. No database is involved.

## 2. Server classes

### `Player`

```ts
class Player {
  id: string;          // socket.id, also the key used by timers and scoring
  name: string;
  score: number;       // total across the whole game
  hasGuessed: boolean; // reset at the start of every turn
}
```

`hasGuessed` powers two rules: a player who already guessed cannot guess again, and the round can end early when every non-drawer has guessed.

### `Room`

```ts
class Room {
  code: string;                 // 6 uppercase characters
  settings: RoomSettings;
  players: Player[];            // array order = join order = turn order base
  hostId: string | null;
  strokes: Stroke[];            // current turn's ordered drawing operations
  game: Game;
  io: Server;
}
```

Responsibilities:

- add/remove players
- keep the host assigned
- hold the authoritative stroke list
- broadcast to the Socket.IO room (`io.to(code).emit(...)`)
- send to one player (`io.to(playerId).emit(...)`)
- build the per-viewer room state
- clear timers on destruction

Host transfer happens in `removePlayer`: if the host left, the first remaining player becomes host. `player_left` includes the new `hostId`.

### `Game`

```ts
class Game {
  phase: 'lobby' | 'choosing' | 'drawing' | 'roundEnd' | 'gameOver';
  round: number;                // 1-based
  turnOrder: string[];          // player ids for this round
  turnIndex: number;            // index into turnOrder
  drawerId: string | null;
  wordOptions: string[];        // private to the drawer
  currentWord: string | null;   // private to the server + drawer
  chooseEndsAt: number | null;  // epoch ms
  roundEndsAt: number | null;   // epoch ms
  roundPoints: Record<string, number>;
  timers: { wordChoice, draw, nextTurn };
}
```

Responsibilities:

- phase transitions
- turn rotation and round counting
- word options, auto-pick, and the 15-second choice timer
- starting/stopping the draw timer
- validating guesses and calculating points
- ending rounds/games
- pruning turn order when players leave
- clearing every timer

### `RoomManager`

Generates unique 6-character codes and owns the in-memory map. `delete()` calls `Room.destroy()` so timers do not survive a deleted room.

## 3. Phase state machine

```
lobby
  │ host + >= 2 players starts
  ▼
choosing ── 15s auto-pick ──► drawing
  │                            │
  │                            ├─ timer reaches 0
  │                            ├─ all guessers correct
  │                            └─ drawer leaves
  ▼                            ▼
roundEnd ◄────────────────────┘
  │
  ├─ more turns/rounds ──► choosing
  └─ last turn ──────────► gameOver
                              │ host clicks Back to lobby
                              ▼
                            lobby
```

`round` increments after the last player in a round has drawn. If `round > settings.rounds`, the game ends.

## 4. Event flow

### Create / join

1. Client emits `create_room` or `join_room` with an acknowledgement callback.
2. Server validates the name, settings, code, room capacity, and phase.
3. Server adds a `Player`, stores `socket.data.roomCode`, and calls `socket.join(code)`.
4. The ack returns `{ playerId, code, state }`. `HomePage` navigates to `/room/:code` and passes that state to `RoomPage`.
5. Existing lobby members receive `player_joined` with the updated player list and host id.

Joining is only allowed in the `lobby` phase, which enforces "game not already started".

### Start and word choice

1. Host emits `start_game`.
2. Server checks host, phase, and player count.
3. `Game.startGame()` resets scores, snapshots join order into `turnOrder`, and calls `startTurn()`.
4. `round_start` goes to everyone: round, drawer, and `chooseEndsAt`.
5. `word_options` goes **only** to the drawer's socket.
6. Drawer emits `word_chosen { word }`.
7. Server verifies the sender is the drawer and that the word is one of the offered options.
8. `Game.chooseWord` starts the draw timer and sends `word_chosen` to each player separately. Only the drawer's payload contains `word`; everyone gets `maskedWord` and `wordLength`.
9. If the drawer does nothing for 15 seconds, a server timer picks a random offered word through the same `chooseWord` path.

### Drawing

1. Drawer's canvas emits `draw_start { x, y, color, size, tool }`, where `tool` is `brush`, `eraser`, or `fill`.
2. Server checks `phase === 'drawing'` and `drawerId === socket.id`.
3. Server creates `{ id, tool, color, size, points: [{x, y}] }`, appends it to `room.strokes`, and emits `draw_data { type: 'start', stroke }` to everyone **except** the drawer.
4. For a brush or eraser, `draw_move { x, y }` appends to the last stroke and forwards a `draw_data { type: 'move', strokeId, x, y }`. Moves are ignored when the last operation is a fill.
5. `draw_end` forwards `{ type: 'end', strokeId }`.
6. The drawer renders locally at the same time, so it does not wait for a round trip.

Tool-specific rules live on the server:

- **Eraser:** the server forces the color to `#ffffff`. The drawing surface is white, so white paint is visually equivalent to erasing while staying replayable with the same stroke model.
- **Fill:** the server forces size to `0` and stores only the click seed. The actual flood fill runs in each browser, then the operation is replayed in order on redraw/undo.
- **Unknown tool:** falls back to `brush`; fill moves and non-drawer drawing events are dropped.

### Guessing

1. Client emits `guess { text }`.
2. Server ignores it if the round is not drawing, the sender is the drawer, or the sender already guessed.
3. Matching is exactly: `text.trim().toLowerCase() === currentWord.toLowerCase()`.
4. Wrong guess: only the guesser gets `guess_result { correct: false }`; everyone gets a `chat_message` with the guess text.
5. Correct guess: the guesser gets `guess_result { correct: true, points }`; everyone gets a system `chat_message` ("Name guessed the word!") **without the guess text**.
6. `players_update` refreshes scores and `hasGuessed` everywhere.
7. If every non-drawer has guessed, the round ends immediately with reason `all_guessed`.

### Round end and game over

1. `endRound()` clears the word/draw timers, changes phase to `roundEnd`, and broadcasts:
   ```ts
   { word, reason, players, deltas, nextAt }
   ```
   The word is now intentionally public.
2. After 6 seconds, `advanceTurn()` either starts the next drawer or calls `endGame()`.
3. `endGame()` clears timers, sorts players by score, and emits `game_over { standings, winnerId }`.
4. Host emits `play_again`, which resets scores, phase, strokes, words, and timers, then broadcasts a fresh lobby `game_state`.

## 5. Word secrecy

The secret word is only written into payloads created for the drawer:

```ts
word: this.drawerId === viewerId ? currentWord : null
```

In addition:

- `word_options` is sent with `room.sendTo(drawerId, ...)`.
- `word_chosen` is built once and then sent per player, adding `word` only for the drawer.
- `round_end` reveals the word to everyone, which is required by the UI.
- Correct guess text is never broadcast.
- A player who already guessed is ignored before any broadcast, so they cannot leak the word through the guess feed.
- The drawer has no guess input, and server-side guesses from the drawer are ignored.

## 6. Canvas synchronization

### Stroke shape

```ts
type Point = { x: number; y: number }; // 0..1
type Stroke = {
  id: string;
  tool: 'brush' | 'eraser' | 'fill';
  color: string;
  size: number; // fraction of canvas width; 0 for fills
  points: Point[]; // fills use the first point as the flood-fill seed
};
```

Coordinates are normalized against the canvas bounding box. The renderer multiplies by the actual canvas width/height, so a stroke drawn on a 500px canvas lands in the same relative place on a 1200px canvas.

Brush size is also normalized. `0.005` and `0.015` become `size * canvas.width`, which keeps thin/thick visually consistent across screen sizes. The eraser uses a larger derived width from the selected brush size.

### Tools and raster operations

- **Brush:** standard round, joined canvas path in the selected color.
- **Eraser:** the same path model in white. This is deliberately simple because the drawing surface never changes color.
- **Fill:** a scanline flood fill over the current `ImageData`, starting at the normalized click point. It stops on the first non-matching pixel, so anti-aliased stroke edges form the boundary.

Fills are stored as one operation with a single seed point, not as a bitmap. `draw_undo`, `canvas_clear`, and `game_state` therefore keep working with the existing ordered stroke list. On a full redraw, clients fill the canvas white and replay brush, eraser, and fill operations in order. The server owns the operation order and validates the sender; pixel rasterization is necessarily local to each browser, so a fill boundary can differ by a few pixels between different canvas resolutions.

### Rendering model

`CanvasBoard` owns:

- `strokesRef`: the strokes it is currently rendering
- the canvas context
- the active local stroke
- a 30ms throttle timer

It exposes an imperative handle to `RoomPage`:

- `setStrokes(strokes)`: replace everything and redraw
- `startRemoteStroke(stroke)`: append and paint a stroke
- `addRemotePoint(strokeId, x, y)`: append one point and paint only that segment

Incoming `draw_data` events do not trigger React state updates for every point. They go straight to the canvas handle, avoiding a full component re-render at 30–60 events per second.

### Throttling

`draw_move` is throttled to one send per 30ms. The sender still draws every local point immediately, so the drawer's own line is smooth. If a move is too soon, the latest point is queued; a trailing timeout sends it. On pointer-up, any queued point is flushed before `draw_end` so the remote line reaches the same endpoint.

### Undo and clear

- Undo: server pops the last operation and broadcasts the complete `strokes` list. All clients clear and redraw from that authoritative list, replaying fills and strokes in order. This also replaces the drawer's local copy.
- Clear: server empties `strokes` and broadcasts `canvas_clear`; every client resets its canvas.

### Resize and re-sync

A `ResizeObserver` resizes the backing canvas to CSS pixels × devicePixelRatio and redraws every stroke from `strokesRef`. Existing drawings therefore survive window resizing.

`game_state` includes the current stroke list, and `RoomPage` passes it to `setStrokes` when it receives one. Normal play cannot join mid-game, but the state payload is ready for a future rejoin flow.

## 7. Turn rotation and leaving

At the start of each round:

```ts
turnOrder = room.players.map((player) => player.id);
turnIndex = 0;
```

The current drawer is `turnOrder[turnIndex]`. Advancing increments `turnIndex`, and a new round rebuilds the list from the current players, so players who left are skipped naturally.

When someone leaves, `Game.onPlayerLeft` removes them from `turnOrder`. If their old index was at or before the current index, `turnIndex` is decremented:

```ts
if (removedIndex <= this.turnIndex) this.turnIndex -= 1;
```

That one rule handles both cases:

- someone before the drawer left: keep pointing at the same drawer,
- the drawer left: point at the slot before the next player, so the next `advanceTurn()` starts the right person.

Special cases:

- drawer leaves during `choosing` or `drawing` → end round with `drawer_left`,
- a guesser leaves and all remaining guessers have guessed → end round with `all_guessed`,
- fewer than 2 players remain → end the game immediately with standings,
- zero players → the room is deleted and all timers are cleared.

The host is reassigned separately by `Room.removePlayer`, so a host leaving does not affect turn order.

## 8. Scoring

### Guesser

```ts
remainingMs = max(0, roundEndsAt - now)
timeRatio   = min(1, remainingMs / (drawTime * 1000))
points      = 100 + round(100 * timeRatio)
```

This yields 100–200 points: an instant correct guess gets about 200, and a guess at the deadline gets 100.

### Drawer

The drawer earns **50 points for each correct guesser** during their turn. With three correct guessers, the drawer earns 150.

`roundPoints` records the points earned this turn. It is sent as `deltas` in `round_end` so the overlay can show `+198`, `+50`, etc. Scores themselves live on `Player` and are cumulative.

## 9. Timers and cleanup

Timers are plain `setTimeout` handles stored on `Game`:

- `wordChoice`: 15 seconds to pick or auto-pick
- `draw`: `drawTime * 1000`
- `nextTurn`: 6-second round-end pause

The server also sends absolute deadlines (`chooseEndsAt`, `endsAt`, `nextAt`). Clients only render `ceil((deadline - now) / 1000)`; they cannot extend a turn or end one.

`Game.clearTimers()` is called when:

- a round ends,
- a game ends,
- a room returns to the lobby,
- a room is destroyed.

`RoomManager.delete()` calls `Room.destroy()`, which calls `clearTimers()`, so a room whose last player leaves cannot leave a timer running.

## 10. Client structure

- `HomePage` validates the name locally, emits create/join, and navigates with the ack state.
- `RoomPage` owns all socket listeners and the main room state (players, phase, deadlines, chat, overlays).
- `Lobby` and `GameView` are presentation components.
- `CanvasBoard` handles pointer input, local drawing, remote drawing, DPR resizing, and redraws.
- `DrawingToolbar` selects brush/eraser/fill and only emits undo/clear intents; the server confirms by broadcasting the canonical canvas.
- `GuessPanel` only emits guess text; it never compares words.
- `Countdown` derives seconds from a server timestamp.
- `ThemeToggle` reads/writes `scribble-theme` in `localStorage`; the inline script in `index.html` applies the stored or OS preference before React renders to avoid a light flash.
- `main.tsx` loads the self-hosted Fontsource faces: **Fredoka Variable** for display text and **Nunito Variable** for body text. `lucide-react` supplies the icon set used across the lobby, toolbar, status messages, and overlays.
- `socket.ts` is a single typed Socket.IO client pointed at `VITE_SERVER_URL`.

The client's optimistic behavior is limited to drawing that the current drawer is performing (including the local flood fill). Everything else waits for a server event.

Dark mode is pure CSS: `data-theme="dark"` on `<html>` switches the custom properties for surfaces, text, borders, focus rings, and shadows. The canvas itself stays white in both themes so drawings and eraser strokes keep consistent colors.

## 11. Extra event names

The required event names are used. Four small events were added because they make the implementation simpler and keep payloads small:

| Event | Direction | Why |
| --- | --- | --- |
| `word_options` | server → drawer | Sends the choices without putting them in a public payload |
| `players_update` | server → room | Live score/guessed updates without resending strokes |
| `play_again` | client → server | Host returns everyone to the lobby after game over |
| `leave_room` | client → server | Explicit leave when navigating back to the home page |

## 12. Known limitations

- **No token-based reconnect.** `id` is the socket id, and a disconnect removes the player. This matches the assignment's leave rules. Supporting refresh/reconnect mid-game would require a persistent player token, a grace period, and turn-order restoration.
- Rooms are process memory only. Restarting the server deletes them.
- **Fill is rasterized client-side.** The server records and orders the operation and validates the drawer, but does not run a canvas rasterization engine. Fill boundaries can differ by a few pixels across very different canvas sizes.
- The countdown display uses the browser clock. The server's timers remain authoritative; clock skew only affects what the number looks like.
- The client throttles drawing, but the server does not rate-limit malicious clients beyond validating sender, phase, coordinate ranges, stroke length, tool, and color/size formats.
