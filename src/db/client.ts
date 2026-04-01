// ============================================================
// CallFirst API — Neon Database Client
// ============================================================

import { neon } from '@neondatabase/serverless';
import { logger } from '../utils/logger.js';

function getDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  return url;
}

/** Create a Neon SQL client */
export function getDb() {
  return neon(getDatabaseUrl());
}

/** Health check — verify database connectivity */
export async function checkDbHealth(): Promise<boolean> {
  try {
    const sql = getDb();
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    logger.error('Database health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}
