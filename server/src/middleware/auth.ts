import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, type AccessPayload } from '../lib/jwt.js';
import { verifyKeycloakToken, type KeycloakTokenPayload } from '../lib/keycloak.js';

export interface AuthRequest extends Request {
  user?: AccessPayload;
  keycloakUser?: KeycloakTokenPayload;
  userId?: string;
  userEmail?: string;
}

/**
 * requireAuth — accepts EITHER a local JWT (dev/test) OR a Keycloak OIDC token.
 * Local JWT is attempted first (fast path); falls back to Keycloak when configured.
 */
export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers['authorization'];
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'missing_token' });
    return;
  }

  const token = header.slice(7);

  // Fast path: local JWT
  try {
    const payload = verifyAccessToken(token);
    req.user = payload;
    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
    return;
  } catch {
    // not a local token — fall through
  }

  // Keycloak OIDC token (only when env is configured)
  const keycloakEnabled = Boolean(process.env['KEYCLOAK_URL'] && process.env['KEYCLOAK_REALM']);
  if (!keycloakEnabled) {
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  try {
    const kc = await verifyKeycloakToken(token);
    req.keycloakUser = kc;
    req.userId = kc.sub;
    req.userEmail = kc.email;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}
