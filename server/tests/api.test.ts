import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import request from 'supertest';
import authRouter from '../src/routes/auth.js';
import conversationsRouter from '../src/routes/conversations.js';
import messagesRouter from '../src/routes/messages.js';
import preferencesRouter from '../src/routes/preferences.js';

// Minimal test app without DB — uses real routes but mocked db module

// ── Mock DB ───────────────────────────────────────────────────────────────────

function makeChain(result: unknown[] = []): unknown {
  const p = Promise.resolve(result);
  const proxy: Record<string, unknown> = new Proxy({} as Record<string, unknown>, {
    get(_t: Record<string, unknown>, prop: string) {
      if (prop === 'then') return p.then.bind(p);
      if (prop === 'catch') return p.catch.bind(p);
      if (prop === 'finally') return p.finally.bind(p);
      if (prop === 'returning') return () => p;
      return () => proxy;
    },
  });
  return proxy;
}

vi.mock('../src/db/client.js', () => ({
  db: {
    select: () => makeChain([]),
    insert: () => makeChain([]),
    update: () => makeChain([]),
    delete: () => makeChain([]),
  },
}));

import { signAccessToken } from '../src/lib/jwt.js';

function buildApp() {
  const app = express();
  app.use(helmet());
  app.use(express.json());
  app.use(rateLimit({ windowMs: 60_000, max: 1000 }));
  app.use('/auth', authRouter);
  app.use('/conversations', conversationsRouter);
  app.use('/conversations/:conversationId/messages', messagesRouter);
  app.use('/preferences', preferencesRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
};

const app = buildApp();

// ── Auth middleware helper ─────────────────────────────────────────────────────
const testUserId = '11111111-1111-1111-1111-111111111111';
const testEmail = 'test@example.com';

function authHeader(): string {
  return `Bearer ${signAccessToken({ sub: testUserId, email: testEmail })}`;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('POST /auth/login validation', () => {
  it('rejects missing email', async () => {
    const res = await request(app).post('/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
  });

  it('rejects malformed email', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
  });
});

describe('POST /auth/refresh validation', () => {
  it('rejects missing refresh token', async () => {
    const res = await request(app).post('/auth/refresh').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('refresh_token_required');
  });

  it('rejects invalid refresh token', async () => {
    const res = await request(app).post('/auth/refresh').send({ refreshToken: 'garbage' });
    expect(res.status).toBe(401);
  });
});

describe('GET /conversations — authorization', () => {
  it('requires Bearer token', async () => {
    const res = await request(app).get('/conversations');
    expect(res.status).toBe(401);
  });

  it('returns array with valid token', async () => {
    const res = await request(app)
      .get('/conversations')
      .set('Authorization', authHeader());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /conversations validation', () => {
  it('requires Bearer token', async () => {
    const res = await request(app).post('/conversations').send({ title: 'Chat' });
    expect(res.status).toBe(401);
  });

  it('rejects title > 200 chars', async () => {
    const res = await request(app)
      .post('/conversations')
      .set('Authorization', authHeader())
      .send({ title: 'x'.repeat(201) });
    expect(res.status).toBe(400);
  });
});

describe('GET /preferences — authorization', () => {
  it('requires Bearer token', async () => {
    const res = await request(app).get('/preferences');
    expect(res.status).toBe(401);
  });
});

describe('PUT /preferences validation', () => {
  it('rejects wakeSensitivity > 1', async () => {
    const res = await request(app)
      .put('/preferences')
      .set('Authorization', authHeader())
      .send({ wakeSensitivity: 1.5 });
    expect(res.status).toBe(400);
  });

  it('rejects silenceTimeoutMs < 1000', async () => {
    const res = await request(app)
      .put('/preferences')
      .set('Authorization', authHeader())
      .send({ silenceTimeoutMs: 500 });
    expect(res.status).toBe(400);
  });
});
