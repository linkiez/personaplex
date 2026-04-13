import { Router } from 'express';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/client.js';
import { conversations } from '../db/schema.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { emitEvent } from '../lib/analytics.js';

const router = Router();

router.use(requireAuth);

const CreateConvSchema = z.object({
  title: z.string().max(200).optional(),
  persona: z.string().max(100).optional(),
});

// GET /conversations — list user's conversations
router.get('/', async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const rows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, userId))
    .orderBy(desc(conversations.updatedAt))
    .limit(50);

  res.json(rows);
});

// POST /conversations — create new conversation
router.post('/', async (req: AuthRequest, res) => {
  const parsed = CreateConvSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'validation_error', details: parsed.error.flatten() });
    return;
  }

  const userId2 = req.userId;
  if (!userId2) { res.status(401).json({ error: 'unauthorized' }); return; }

  const [conv] = await db
    .insert(conversations)
    .values({
      userId: userId2,
      title: parsed.data.title,
      persona: parsed.data.persona,
    })
    .returning();

  res.status(201).json(conv);
  emitEvent('conversation.created', userId2, { conversationId: conv?.id });
});

// DELETE /conversations/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  const { id } = req.params as { id: string };
  const userId = req.userId;
  if (!userId) { res.status(401).json({ error: 'unauthorized' }); return; }

  const [deleted] = await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .returning({ id: conversations.id });

  if (!deleted) {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  res.json({ ok: true });
  emitEvent('conversation.deleted', userId, { conversationId: id });
});

export default router;
