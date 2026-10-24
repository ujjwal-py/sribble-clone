# Scribble

A multiplayer drawing-and-guessing game in the style of skribbl.io. One player draws a secret word, everyone else races to guess it, and the server owns the truth: turns, words, timers, guesses, and scores.

Built for an internship assignment with a deliberately small, readable codebase.

## What is included

- Create a room with name, max players (2–20), rounds (2–10), draw time (15–240s), word options (1–5), and word categories
- Pick a room type: **private** (invite link or code only) or **public** (listed for anyone to join)
- Public room browser on the home page with host name, player count, and categories, updated live
- Join by 6-character room code, shared `/room/:code` link, or the public room browser
- Live lobby with host badge, invite link, host-only start button, and host kick controls
- Join-order turns: every player draws once per round
- Drawer gets word options and a 15-second auto-pick timer
- Live canvas sync with normalized coordinates
- Brush, eraser, and paint-bucket fill tools, with thin/thick sizes, undo, and clear
- Persistent light/dark theme toggle on the home, join, lobby, and game screens
- Playful rounded interface with Lucide icons and self-hosted Fredoka/Nunito fonts
- Server-checked guesses with strict trim + case-insensitive matching
- Time-based scoring, live scoreboard, round reveal, and game-over standings
- Host can return everyone to the lobby to replay with the same settings
- Edge cases for disconnects, host transfer, leavers, and room cleanup

Rooms are stored in server memory. There is no database.

## Stack

| Part | Technology |
| --- | --- |
| Client | React, TypeScript, Vite, HTML5 Canvas |
| Server | Node.js, Express, TypeScript, Socket.IO |
| UI | Lucide icons, Fontsource (Fredoka + Nunito) |
| Words | Hardcoded `server/src/data/words.json` (100 words across 8 categories) |
| Transport | Socket.IO events + acknowledgements |

## Project layout

```
scribble_web3task/
├─ client/
│  ├─ public/favicon.svg
│  ├─ src/
│  │  ├─ components/       # lobby, game view, canvas, panels, overlays
│  │  ├─ pages/            # HomePage (create/join), RoomPage (state + sockets)
│  │  ├─ App.tsx           # routes
│  │  ├─ socket.ts         # one typed Socket.IO client
│  │  ├─ theme.ts          # persisted light/dark preference
│  │  ├─ types.ts          # client copies of payload types
│  │  ├─ wordCategories.ts # category labels/icons for room creation
│  │  └─ styles.css
│  └─ .env.example
├─ server/
│  ├─ src/
│  │  ├─ game/             # Player, Room, Game, RoomManager
│  │  ├─ data/words.json
│  │  ├─ socket.ts         # event handlers -> Room/Game methods
│  │  ├─ index.ts          # Express + HTTP + Socket.IO
│  │  └─ types.ts
│  └─ .env.example
├─ README.md
└─ ARCHITECTURE.md
```

## Local setup

Prerequisites: **Node.js 20 or newer** and npm.

### 1. Start the server

From the repository root:

```powershell
cd server
```

`cd server` changes into the backend folder.

```powershell
npm install
```

`npm install` downloads the server dependencies listed in `server/package.json` into `server/node_modules`.

```powershell
Copy-Item .env.example .env
```

`Copy-Item .env.example .env` creates your local server config. On macOS/Linux use `cp .env.example .env` instead. The defaults work for local development.

```powershell
npm run dev
```

`npm run dev` starts the TypeScript server with `tsx watch`, so it restarts when server files change. It listens on **http://localhost:3001**. Leave this terminal running.

You can check it at `http://localhost:3001/health`.

### 2. Start the client

Open a second terminal at the repository root:

```powershell
cd client
```

`cd client` changes into the frontend folder.

```powershell
npm install
```

`npm install` downloads the client dependencies into `client/node_modules`.

```powershell
Copy-Item .env.example .env
```

`Copy-Item .env.example .env` creates the client config. On macOS/Linux use `cp .env.example .env`. The default points the client at `http://localhost:3001`.

```powershell
npm run dev
```

`npm run dev` starts the Vite development server with hot reload. Open the printed URL, normally **http://localhost:5173**.

### 3. Play

1. Enter a name, choose **Private** or **Public**, and click **Create room**.
2. Copy the invite link or room code.
3. Open the link in a second browser window/tab, enter a second name, and join. (For testing from another device, expose Vite with `--host` and update both `VITE_SERVER_URL` and `CLIENT_ORIGIN` to your LAN addresses.)
4. For a public room, other players can also find it in the **Join a room** card and join from there.
5. The host clicks **Start game**.
6. The drawer picks a word, draws, and everyone else types guesses.

## Environment variables

### Server (`server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3001` | Port for Express + Socket.IO |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Allowed browser origin(s). Comma-separate for multiple origins. |

### Client (`client/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_SERVER_URL` | `http://localhost:3001` | URL of the Socket.IO server |

The client reads `VITE_SERVER_URL` once at build/dev-server start, so restart Vite after changing it.

## Scripts

### Server

| Command | What it does |
| --- | --- |
| `npm run dev` | Run with `tsx watch` for development |
| `npm run typecheck` | Type-check without emitting files |
| `npm run build` | Compile TypeScript into `server/dist` |
| `npm start` | Run the compiled server from `server/dist` |

### Client

| Command | What it does |
| --- | --- |
| `npm run dev` | Start Vite with hot reload |
| `npm run typecheck` | Type-check the client |
| `npm run build` | Type-check and create a production build in `client/dist` |
| `npm run preview` | Serve the production build locally |

## Deployment

1. Build the server with `cd server` then `npm run build`. Run it with `npm start`, and set `PORT` and `CLIENT_ORIGIN` in the host's environment.
2. Build the client with `cd client` then `npm run build`. Deploy `client/dist` to a static host. Configure an SPA fallback so `/room/:code` serves `index.html`.
3. Set `VITE_SERVER_URL` to the deployed server URL **before** building the client, and set the server's `CLIENT_ORIGIN` to the deployed client origin.
4. The server must support WebSockets. If the host uses sticky sessions or a proxy, enable WebSocket upgrades.

**Live URL:** `<https://your-live-url.example.com>` (placeholder)

## Testing checklist

These match the build order and are easy to repeat manually.

### Step 1 — Theme, rooms, and lobby

1. Toggle between **Dark** and **Light** mode. Reload the page and confirm your choice is remembered.
2. Create a **Private** room with only one word category selected. Confirm the 6-character code, invite link, "Private room" chip, and category chip appear.
3. Open the invite link in a second window, enter another name, and join.
4. In a third window, create a **Public** room. Without reloading the first window, confirm it appears under **Or join a public room** with the host name, player count, and categories.
5. Join that public room from the list. Confirm the player count updates live and the room leaves the list once the host starts the game.
6. Confirm both windows update the player list and the host badge.
7. Confirm **Start game** is host-only and disabled with one player.
8. As host, click the remove button next to the other player. Confirm that player sees the removed screen, the host's list updates, and the kicked window cannot immediately rejoin.
9. Close the host's tab. The other player should become host.
10. Try joining with a bad code, a full room, and a room that has already started; each should be rejected with a message.

### Step 2 — Turns and word choice

1. Start with two players and confirm the first player in join order draws first.
2. Only the drawer should see word option buttons. Everyone else sees "… is choosing a word".
3. Confirm every offered word belongs to the room's selected categories.
4. Pick a word and confirm the draw timer starts for everyone.
5. Alternatively, do not pick: after 15 seconds the server auto-picks one of the shown options.
6. Finish a turn and confirm the next player draws; after the last player, the round number increases.

### Step 3 — Canvas

1. Draw on the drawer's canvas. The other window should see strokes live.
2. Resize either window. Existing strokes should stay in the same relative position.
3. Try drawing in the guesser's window; nothing should happen.
4. Select **Fill**, pick a color, and click empty canvas space. Both windows should fill that region.
5. Select **Eraser** and drag through a filled area or stroke. Both windows should show white canvas again.
6. Click **Undo** and confirm the last operation disappears for everyone, including fills and eraser strokes.
7. Draw again, click **Clear**, accept the confirmation, and confirm both canvases are blank.

### Step 4 — Guessing and scoring

1. Type a wrong guess. It appears in the guess feed and does not affect scores.
2. Type the correct word with different casing and surrounding spaces. It should count.
3. Confirm a correct player's guess text is never shown; only "… guessed the word!" appears.
4. Confirm the correct player cannot submit another guess and their input is disabled.
5. Confirm the drawer has no guess input.
6. Play with three players: after one correct guess the round should continue; after the last guesser, it should end early.
7. Let a draw timer expire and confirm the round ends with the word revealed and per-player point changes.

### Step 5 — End screens and edge cases

1. Complete all rounds and confirm final standings and a winner appear.
2. As host, click **Back to lobby**; confirm everyone returns and scores reset.
3. Disconnect the drawer mid-turn; the round should end and the next player should draw (or the game ends if fewer than two players remain).
4. Disconnect a non-host player; their future turns are skipped.
5. Leave one player alone mid-game; the game should end and show standings.
6. Close all tabs; the server should remove the room and clear its timers.
