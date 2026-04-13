import { Router } from 'express';
import { z } from 'zod';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations, messages } from '../db/schema.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { emitEvent } from '../lib/analytics.js';

const router = Router({ mergeParams: true });

router.use(requireAuth);

const AddMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().max(32768).optional(),
  audioBase64: z.string().max(2_000_000).optional(),
  durationMs: z.number().positive().optional(),
});

/** Verify conversation belongs to authenticated user. */
async function ownsConversation(userId: string, conversationId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);
  return !!row;
}

// GET /conversations/:conversationId/messages
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const { conversationId } = req.params as { conversationId: string };

  if (!(await ownsConversation(userId, conversationId))) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt));

  res.json(rows);
});

// POST /conversations/:conversationId/messages
router.post('/', async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const { conversationId } = req.params as { conversationId: string };

  if (!(await ownsConversation(userId, conversationId))) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const parsed = AddMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
    return;
  }

  const [msg] = await db
    .insert(messages)
    .values({
      conversationId,
      role: parsed.data.role,
      text: parsed.data.text,
      audioBase64: parsed.data.audioBase64,
      durationMs: parsed.data.durationMs,
    })
    .returning();

  // Bump conversation updatedAt
  await db
    .update(conversations)
    .set({ updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  res.status(201).json(msg);
  emitEvent('message.added', userId, { conversationId, role: parsed.data.role, durationMs: parsed.data.durationMs });
});

export default router;
