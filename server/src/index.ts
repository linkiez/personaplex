import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';

import authRouter from './routes/auth.js';
import conversationsRouter from './routes/conversations.js';
import messagesRouter from './routes/messages.js';
import preferencesRouter from './routes/preferences.js';

const PORT = Number.parseInt(process.env['PORT'] ?? '3001', 10);

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet());

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '4mb' }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Stricter limiter on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});
app.use('/auth', authLimiter);

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);
app.use('/conversations', conversationsRouter);
app.use('/conversations/:conversationId/messages', messagesRouter);
app.use('/preferences', preferencesRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_server_error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`voxpulse-realtime-voice-hub API listening on :${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
