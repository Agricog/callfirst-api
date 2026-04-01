// ============================================================
// CallFirst API — Admin Routes (password-protected)
// POST /api/admin/clients — Create a new client
// GET  /api/admin/clients — List all clients
// ============================================================

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { logger } from '../utils/logger.js';
import { z } from 'zod';
import crypto from 'node:crypto';

export const adminRoute = new Hono();

/** Verify admin password */
function isAuthorised(c: { req: { header: (name: string) => string | undefined } }): boolean {
  const adminKey = process.env['ADMIN_SECRET'];
  if (!adminKey) return false;
  const provided = c.req.header('X-Admin-Secret');
  if (!provided) return false;
  return crypto.timingSafeEqual(
    Buffer.from(adminKey),
    Buffer.from(provided.padEnd(adminKey.length).slice(0, adminKey.length))
  );
}

// ============================================================
// POST / — Create a new client
// ============================================================

const createClientSchema = z.object({
  businessName: z.string().min(1).max(200),
  contactName: z.string().min(1).max(100),
  phone: z.string().min(10).max(20),
  email: z.string().email(),
  trade: z.string().min(1).max(100),
  area: z.string().min(1).max(100),
  domain: z.string().min(3).max(200),
  whatsappEnabled: z.boolean().optional().default(false),
  tone: z.string().max(500).optional().default('friendly and professional'),
  sellingPoints: z.string().max(500).optional().default(''),
  priceGuidance: z.string().max(1000).optional().default(''),
  customGreeting: z.string().max(500).optional().default(''),
  googleReviewUrl: z.string().max(500).optional().default(''),
});

adminRoute.post('/', async (c) => {
  if (!isAuthorised(c)) {
    return c.json({ error: 'Unauthorised' }, 401);
  }

  try {
    const body = await c.req.json();
    const parsed = createClientSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid data', details: parsed.error.flatten().fieldErrors }, 400);
    }

    const data = parsed.data;
    const apiKey = `cf_live_${crypto.randomBytes(32).toString('hex')}`;

    const sql = getDb();
    const rows = await sql`
      INSERT INTO clients (
        business_name, contact_name, phone, email,
        trade, area, domain, whatsapp_enabled,
        tone, selling_points, price_guidance,
        custom_greeting, google_review_url, api_key
      ) VALUES (
        ${data.businessName}, ${data.contactName}, ${data.phone}, ${data.email},
        ${data.trade}, ${data.area}, ${data.domain}, ${data.whatsappEnabled},
        ${data.tone}, ${data.sellingPoints}, ${data.priceGuidance},
        ${data.customGreeting}, ${data.googleReviewUrl}, ${apiKey}
      )
      RETURNING id, api_key
    `;

    const row = rows[0];
    if (!row) throw new Error('Failed to create client');

    logger.info('New client created', {
      clientId: row['id'],
      businessName: data.businessName,
      domain: data.domain,
    });

    return c.json({
      success: true,
      client: {
        id: row['id'],
        apiKey: row['api_key'],
        businessName: data.businessName,
        domain: data.domain,
      },
      nextSteps: [
        `1. Buy domain: ${data.domain}`,
        `2. Clone callfirst-demo repo to new repo: callfirst-${data.domain.replace(/\./g, '-')}`,
        `3. Update src/data/clientConfig.ts with client details`,
        `4. Deploy to Railway — add these variables:`,
        `   VITE_API_URL = https://callfirst-api-production.up.railway.app`,
        `   VITE_API_KEY = ${row['api_key']}`,
        `   VITE_CLIENT_ID = ${row['id']}`,
        `5. Point domain DNS to Railway`,
        `6. Create Clerk user for client dashboard access`,
        `7. Add domain to ALLOWED_ORIGINS in API if needed`,
      ],
    });
  } catch (error) {
    logger.error('Admin create client error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return c.json({ error: 'Failed to create client' }, 500);
  }
});

// ============================================================
// GET / — List all clients
// ============================================================

adminRoute.get('/', async (c) => {
  if (!isAuthorised(c)) {
    return c.json({ error: 'Unauthorised' }, 401);
  }

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, business_name, contact_name, trade, area, domain, active, created_at
      FROM clients
      ORDER BY created_at DESC
    `;

    return c.json({ clients: rows });
  } catch (error) {
    logger.error('Admin list clients error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return c.json({ error: 'Failed to list clients' }, 500);
  }
});
