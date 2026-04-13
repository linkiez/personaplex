import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { users, sessions } from '../db/schema.js';
import {
    signAccessToken,
    signRefreshToken,
    verifyRefreshToken,
    refreshExpiresAt,
} from '../lib/jwt.js';
import {
    buildAuthorizationUrl,
    exchangeCodeForTokens,
    verifyKeycloakToken,
} from '../lib/keycloak.js';
import { emitEvent } from '../lib/analytics.js';
import type { AuthRequest } from '../middleware/auth.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const LoginSchema = z.object({
  email: z.string().email().max(254),
  displayName: z.string().max(100).optional(),
});

// POST /auth/login — upserts user by email, returns tokens
router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
    return;
  }

  const { email, displayName } = parsed.data;

  let [user] = await db
    .insert(users)
    .values({ email, displayName })
    .onConflictDoUpdate({ target: users.email, set: { updatedAt: new Date() } })
    .returning();

  if (!user) {
    [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  }

  if (!user) {
    res.status(500).json({ error: 'user_creation_failed' });
    return;
  }

  const [session] = await db
    .insert(sessions)
    .values({
      userId: user.id,
      token: crypto.randomUUID(),
      expiresAt: refreshExpiresAt(),
    })
    .returning();

  if (!session) {
    res.status(500).json({ error: 'session_creation_failed' });
    return;
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, jti: session.id });

  emitEvent('auth.login', user.id, { email: user.email });
  res.json({ accessToken, refreshToken, userId: user.id });
});

// POST /auth/refresh — rotates refresh token
router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    res.status(400).json({ error: 'refresh_token_required' });
    return;
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    res.status(401).json({ error: 'invalid_refresh_token' });
    return;
  }

  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, payload.jti))
    .limit(1);

  if (!session || session.expiresAt < new Date()) {
    res.status(401).json({ error: 'session_expired' });
    return;
  }

  const [user] = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
  if (!user) {
    res.status(401).json({ error: 'user_not_found' });
    return;
  }

  // Rotate: delete old session, create new one
  await db.delete(sessions).where(eq(sessions.id, session.id));

  const [newSession] = await db
    .insert(sessions)
    .values({ userId: user.id, token: crypto.randomUUID(), expiresAt: refreshExpiresAt() })
    .returning();

  if (!newSession) {
    res.status(500).json({ error: 'session_rotation_failed' });
    return;
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const newRefreshToken = signRefreshToken({ sub: user.id, jti: newSession.id });

  res.json({ accessToken, refreshToken: newRefreshToken });
});

// POST /auth/logout — invalidates session
router.post('/logout', requireAuth, async (req: AuthRequest, res) => {
  if (!req.userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const { sessionId } = req.body as { sessionId?: string };
  if (sessionId) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
  }

  emitEvent('auth.logout', req.userId);
  res.json({ ok: true });
});

// ─── Keycloak OIDC routes ─────────────────────────────────────────────────────

// GET /auth/oidc/login — redirects user to Keycloak authorization page
router.get('/oidc/login', (req, res) => {
  const redirectUri = process.env['KEYCLOAK_REDIRECT_URI'] ?? '';
  if (!redirectUri) {
    res.status(503).json({ error: 'keycloak_not_configured' });
    return;
  }

  // state is a random nonce to prevent CSRF
  const state = crypto.randomUUID();
  const url = buildAuthorizationUrl(redirectUri, state);
  res.json({ url, state });
});

// POST /auth/oidc/callback — exchanges authorization code for local tokens
router.post('/oidc/callback', async (req, res) => {
  const { code, redirectUri } = req.body as { code?: string; redirectUri?: string };
  if (!code || !redirectUri) {
    res.status(400).json({ error: 'code_and_redirect_uri_required' });
    return;
  }

  let kcTokens;
  try {
    kcTokens = await exchangeCodeForTokens(code, redirectUri);
  } catch {
    res.status(401).json({ error: 'keycloak_exchange_failed' });
    return;
  }

  const kcPayload = await verifyKeycloakToken(kcTokens.access_token);
  const email = kcPayload.email ?? kcPayload.preferred_username ?? kcPayload.sub ?? '';
  const displayName = kcPayload.name;

  if (!email) {
    res.status(400).json({ error: 'no_email_in_token' });
    return;
  }

  let [user] = await db
    .insert(users)
    .values({ email, displayName })
    .onConflictDoUpdate({ target: users.email, set: { updatedAt: new Date() } })
    .returning();

  if (!user) {
    [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  }

  if (!user) {
    res.status(500).json({ error: 'user_creation_failed' });
    return;
  }

  const [session] = await db
    .insert(sessions)
    .values({ userId: user.id, token: crypto.randomUUID(), expiresAt: refreshExpiresAt() })
    .returning();

  if (!session) {
    res.status(500).json({ error: 'session_creation_failed' });
    return;
  }

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken({ sub: user.id, jti: session.id });

  emitEvent('auth.oidc_callback', user.id, { email: user.email });
  res.json({ accessToken, refreshToken, userId: user.id });
});

export default router;
