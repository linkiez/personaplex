import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { userPreferences } from '../db/schema.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { cacheGet, cacheSet, cacheInvalidate, prefKey } from '../lib/cache.js';
import { emitEvent } from '../lib/analytics.js';

const router = Router();

router.use(requireAuth);

const PREFS_TTL = 120; // 2 minutes

const PrefsSchema = z.object({
  preferredPersona: z.string().max(100).nullable().optional(),
  preferredVoice: z.string().max(50).nullable().optional(),
  wakeSensitivity: z.number().min(0).max(1).optional(),
  silenceTimeoutMs: z.number().min(1000).max(60000).optional(),
  emitActions: z.boolean().optional(),
});

// GET /preferences
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const cacheKey = prefKey('prefs', userId);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  const [prefs] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);

  const result = prefs ?? { userId };
  await cacheSet(cacheKey, result, PREFS_TTL);
  res.json(result);
});

// PUT /preferences
router.put('/', async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const parsed = PrefsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
    return;
  }

  const [row] = await db
    .insert(userPreferences)
    .values({ userId, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { ...parsed.data, updatedAt: new Date() },
    })
    .returning();

  await cacheInvalidate(prefKey('prefs', userId));
  emitEvent('preferences.updated', userId);
  res.json(row);
});

export default router;
