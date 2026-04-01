// ============================================================
// CallFirst API — Dashboard Routes
// GET  /api/dashboard/leads       — list leads
// GET  /api/dashboard/stats       — lead counts by status
// PATCH /api/dashboard/leads/:id  — update lead status
// GET  /api/dashboard/settings    — get client settings
// PATCH /api/dashboard/settings   — update urgency/discount
// ============================================================

import { Hono } from 'hono';
import '../types/hono.js';
import {
  getLeadsByClientId,
  getLeadStats,
  updateLeadStatus,
  updateClientSettings,
  cancelPendingFollowUps,
} from '../db/queries.js';
import { logger } from '../utils/logger.js';
import type { Client } from '../types/index.js';
import { z } from 'zod';

export const dashboardRoute = new Hono();

// ============================================================
// GET /leads — list leads for authenticated client
// ============================================================
dashboardRoute.get('/leads', async (c) => {
  try {
    const client = c.get('client') as Client;
    const status = c.req.query('status');

    const leads = await getLeadsByClientId(client.id, status || undefined);

    // Strip conversation log from list view — too much data
    const sanitised = leads.map((lead) => ({
      id: lead.id,
      customerName: lead.customerName,
      customerPhone: lead.customerPhone,
      jobType: lead.jobType,
      propertyType: lead.propertyType,
      estimatedValue: lead.estimatedValue,
      callbackTime: lead.callbackTime,
      leadScore: lead.leadScore,
      area: lead.area,
      suggestedOpener: lead.suggestedOpener,
      status: lead.status,
      createdAt: lead.createdAt,
    }));

    return c.json({ leads: sanitised });
  } catch (error) {
    logger.error('Dashboard leads error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return c.json({ error: 'Failed to fetch leads' }, 500);
  }
});

// ============================================================
// GET /stats — lead counts by status
// ============================================================
dashboardRoute.get('/stats', async (c) => {
  try {
    const client = c.get('client') as Client;
    const stats = await getLeadStats(client.id);
    return c.json({ stats });
  } catch (error) {
    logger.error('Dashboard stats error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return c.json({ error: 'Failed to fetch stats' }, 500);
  }
});

// ============================================================
// PATCH /leads/:id — update lead status
// ============================================================
const statusSchema = z.object({
  status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost', 'dead']),
});

dashboardRoute.patch('/leads/:id', async (c) => {
  try {
    const client = c.get('client') as Client;
    const leadId = c.req.param('id');

    const body = await c.req.json();
    const parsed = statusSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid status' }, 400);
    }

    await updateLeadStatus(leadId, parsed.data.status);

    // Cancel pending follow-ups if lead is won or lost
    if (parsed.data.status === 'won' || parsed.data.status === 'lost' || parsed.data.status === 'dead') {
      await cancelPendingFollowUps(leadId);
    }

    logger.info('Lead status updated', {
      leadId,
      clientId: client.id,
      newStatus: parsed.data.status,
    });

    return c.json({ success: true });
  } catch (error) {
    logger.error('Lead status update error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return c.json({ error: 'Failed to update status' }, 500);
  }
});

// ============================================================
// GET /settings — get client settings
// ============================================================
dashboardRoute.get('/settings', async (c) => {
  try {
    const client = c.get('client') as Client;
    return c.json({
      businessName: client.businessName,
      contactName: client.contactName,
      trade: client.trade,
      area: client.area,
      urgencyMode: client.urgencyMode,
      discountPercent: client.discountPercent,
      priceGuidance: client.priceGuidance,
    });
  } catch (error) {
    logger.error('Dashboard settings error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return c.json({ error: 'Failed to fetch settings' }, 500);
  }
});

// ============================================================
// PATCH /settings — update urgency/discount toggles
// ============================================================
const settingsSchema = z.object({
  urgencyMode: z.boolean().optional(),
  discountPercent: z.number().int().min(0).max(50).optional(),
  priceGuidance: z.string().max(1000).optional(),
});

dashboardRoute.patch('/settings', async (c) => {
  try {
    const client = c.get('client') as Client;

    const body = await c.req.json();
    const parsed = settingsSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({ error: 'Invalid settings' }, 400);
    }

    await updateClientSettings(client.id, parsed.data);

    logger.info('Client settings updated', {
      clientId: client.id,
      changes: parsed.data,
    });

    return c.json({ success: true });
  } catch (error) {
    logger.error('Settings update error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return c.json({ error: 'Failed to update settings' }, 500);
  }
});
