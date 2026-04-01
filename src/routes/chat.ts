// ============================================================
// CallFirst API — Chat Route
// POST /api/chat — Proxies conversation to Claude API
// ============================================================

import { Hono } from 'hono';
import '../types/hono.js';
import { processChat } from '../services/claude.js';
import { chatRequestSchema } from '../utils/validation.js';
import { getClientById } from '../db/queries.js';
import { logger } from '../utils/logger.js';
import type { Client } from '../types/index.js';

export const chatRoute = new Hono();

chatRoute.post('/', async (c) => {
  try {
    // Parse and validate input
    const body = await c.req.json();
    const parsed = chatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    // Get client config — either from auth middleware or by ID
    let client = c.get('client') as Client | undefined;

    if (!client) {
      client = await getClientById(parsed.data.clientId) ?? undefined;
      if (!client) {
        return c.json({ error: 'Client not found' }, 404);
      }
    }

    // Process through Claude
    const response = await processChat(client, parsed.data.messages);

    return c.json(response);
  } catch (error) {
    logger.error('Chat route error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.json({ error: 'Failed to process message' }, 500);
  }
});
