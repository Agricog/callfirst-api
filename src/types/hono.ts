// ============================================================
// CallFirst API — Hono Context Type Extensions
// ============================================================

import type { Client } from './index.js';

declare module 'hono' {
  interface ContextVariableMap {
    client: Client;
  }
}
