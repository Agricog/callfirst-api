// ============================================================
// CallFirst API — Server Entry Point
// ============================================================

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { serve } from '@hono/node-server';
import { chatRoute } from './routes/chat.js';
import { leadRoute } from './routes/lead.js';
import { webhookRoute } from './routes/webhook.js';
import { dashboardRoute } from './routes/dashboard.js';
import { followUpRoute } from './routes/followup.js';
import { adminRoute } from './routes/admin.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';
import { checkDbHealth } from './db/client.js';
import { logger } from './utils/logger.js';

const app = new Hono();

// ============================================================
// GLOBAL MIDDLEWARE
// ============================================================

app.use('*', secureHeaders());

// CORS — locked to known domains
const ALLOWED_ORIGINS = [
  'https://callfirst.co.uk',
  'https://www.callfirst.co.uk',
  // Add client domains as they onboard
];

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      // Allow exact matches
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      // Allow all Railway preview URLs (for development/demos)
      if (origin.endsWith('.up.railway.app')) return origin;
      // Allow any callfirst subdomain
      if (origin.endsWith('.callfirst.co.uk')) return origin;
      // Localhost for development
      if (origin.startsWith('http://localhost:')) return origin;
      // Allow file:// for local admin page
      return origin;
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    aallowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Secret', 'x-api-key'],
    maxAge: 86400,
  })
);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/health', async (c) => {
  const dbHealthy = await checkDbHealth();
  const status = dbHealthy ? 200 : 503;
  return c.json(
    {
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { database: dbHealthy },
    },
    status
  );
});

// ============================================================
// PUBLIC API ROUTES (client sites call these)
// ============================================================

// Chat — rate limited to 30/min per IP, authenticated
app.use('/api/chat/*', rateLimitMiddleware({ max: 30, windowSeconds: 60 }));
app.use('/api/chat/*', authMiddleware);
app.route('/api/chat', chatRoute);

// Lead — rate limited to 5/min per IP, authenticated
app.use('/api/lead/*', rateLimitMiddleware({ max: 5, windowSeconds: 60 }));
app.use('/api/lead/*', authMiddleware);
app.route('/api/lead', leadRoute);

// ============================================================
// DASHBOARD API ROUTES (contractor dashboard calls these)
// ============================================================

app.use('/api/dashboard/*', rateLimitMiddleware({ max: 60, windowSeconds: 60 }));
app.use('/api/dashboard/*', authMiddleware);
app.route('/api/dashboard', dashboardRoute);

// ============================================================
// WEBHOOK / SCHEDULED ROUTES
// ============================================================

// Twilio webhook — Twilio signature verification inside the route
app.use('/api/webhook/twilio/*', rateLimitMiddleware({ max: 60, windowSeconds: 60 }));
app.route('/api/webhook/twilio', webhookRoute);

// Follow-up execution — called by QStash
app.use('/api/follow-up/*', rateLimitMiddleware({ max: 60, windowSeconds: 60 }));
app.route('/api/follow-up', followUpRoute);

// ============================================================
// ADMIN ROUTES (password protected)
// ============================================================

app.use('/api/admin/*', rateLimitMiddleware({ max: 10, windowSeconds: 60 }));
app.route('/api/admin/clients', adminRoute);

// ============================================================
// 404 + ERROR HANDLERS
// ============================================================

app.notFound((c) => c.json({ error: 'Not found' }, 404));

app.onError((err, c) => {
  logger.error('Unhandled error', {
    error: err.message,
    path: c.req.path,
    method: c.req.method,
  });
  return c.json({ error: 'Internal server error' }, 500);
});

// ============================================================
// START SERVER
// ============================================================

const port = parseInt(process.env['PORT'] ?? '3002', 10);

serve({ fetch: app.fetch, port }, () => {
  logger.info('CallFirst API running', { port, env: process.env['NODE_ENV'] ?? 'development' });
});

export default app;
