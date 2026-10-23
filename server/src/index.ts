import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { registerSocketHandlers } from './socket';

const PORT = Number(process.env.PORT) || 3001;

const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const app = express();

app.get('/health', (_request, response) => {
  response.json({ ok: true });
});

app.get('/', (_request, response) => {
  response.type('text').send('Scribble server is running.');
});

const httpServer = createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: clientOrigins,
    methods: ['GET', 'POST'],
  },
});

registerSocketHandlers(io);

httpServer.listen(PORT, () => {
  console.log(`Scribble server listening on http://localhost:${PORT}`);
  console.log(`Allowed client origins: ${clientOrigins.join(', ')}`);
});
