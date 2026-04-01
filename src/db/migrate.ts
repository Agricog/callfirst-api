// ============================================================
// CallFirst API — Database Migration
// Run: npm run db:migrate
// ============================================================

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate(): Promise<void> {
  console.log('Running database migration...');

  const schemaPath = resolve(__dirname, 'schema.sql');
  const schema = readFileSync(schemaPath, 'utf-8');

  const sql = getDb();

  // Split on semicolons and run each statement
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith('--'));

  for (const statement of statements) {
    try {
      await sql(statement);
    } catch (error) {
      console.error('Migration failed on statement:', statement.slice(0, 80));
      throw error;
    }
  }

  console.log('Migration complete — all tables created.');
  process.exit(0);
}

migrate().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
