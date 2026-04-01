// ============================================================
// CallFirst API — Client Authentication Middleware
// ============================================================

import type { Context, Next } from 'hono';
import { getClientByApiKey } from '../db/queries.js';
import { logger } from '../utils/logger.js';

/**
 * Authenticate client requests via API key in Authorization header.
 * Sets `c.set('client', client)` for downstream handlers.
 */
export async function authMiddleware(c: Context, next: Next): Promise<Response | void> {
  const authHeader = c.req.header('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Missing or invalid Authorization header' }, 401);
  }

  const apiKey = authHeader.slice(7).trim();

  if (!apiKey || apiKey.length < 32) {
    return c.json({ error: 'Invalid API key format' }, 401);
  }

  try {
    const client = await getClientByApiKey(apiKey);

    if (!client) {
      logger.warn('Authentication failed — invalid API key', {
        keyPrefix: apiKey.slice(0, 8),
      });
      return c.json({ error: 'Invalid API key' }, 401);
    }

    c.set('client', client);
    await next();
  } catch (error) {
    logger.error('Auth middleware error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.json({ error: 'Authentication failed' }, 500);
  }
}
