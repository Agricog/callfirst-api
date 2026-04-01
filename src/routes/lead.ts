// ============================================================
// CallFirst API — Lead Route
// POST /api/lead — Save lead + send JobBrief + ack customer
// ============================================================

import { Hono } from 'hono';
import '../types/hono.js';
import { leadRequestSchema } from '../utils/validation.js';
import { normalisePhone } from '../utils/validation.js';
import { getClientById, createLead } from '../db/queries.js';
import { sendJobBrief, sendCustomerAck } from '../services/twilio.js';
import { scheduleLeadFollowUps } from '../services/qstash.js';
import { logger } from '../utils/logger.js';
import type { Client, JobBrief } from '../types/index.js';

export const leadRoute = new Hono();

leadRoute.post('/', async (c) => {
  try {
    // Parse and validate
    const body = await c.req.json();
    const parsed = leadRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: 'Invalid request', details: parsed.error.flatten().fieldErrors },
        400
      );
    }

    const { clientId, lead, conversationLog } = parsed.data;

    // Get client
    let client = c.get('client') as Client | undefined;
    if (!client) {
      client = await getClientById(clientId) ?? undefined;
      if (!client) {
        return c.json({ error: 'Client not found' }, 404);
      }
    }

    const normalisedPhone = normalisePhone(lead.customerPhone);

    // 1. Save lead to Neon
    const savedLead = await createLead({
      clientId,
      customerName: lead.customerName,
      customerPhone: normalisedPhone,
      jobType: lead.jobType,
      propertyType: lead.propertyType,
      estimatedDuration: lead.estimatedDuration,
      estimatedValue: lead.estimatedValue,
      callbackTime: lead.callbackTime,
      leadScore: lead.leadScore,
      area: lead.area,
      conversationLog,
      suggestedOpener: lead.suggestedOpener,
    });

    // 2. Send JobBrief to contractor (fire and forget — don't block response)
    const jobBrief: JobBrief = {
      customerName: lead.customerName,
      jobType: lead.jobType,
      propertyType: lead.propertyType,
      estimatedValue: lead.estimatedValue,
      callbackTime: lead.callbackTime,
      leadScore: lead.leadScore,
      suggestedOpener: lead.suggestedOpener,
      area: lead.area,
    };

    // Fire simultaneously — don't await sequentially
    const messagingPromises = [
      sendJobBrief(client, jobBrief, normalisedPhone).catch((err: unknown) => {
        logger.error('JobBrief send failed', {
          leadId: savedLead.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }),
      sendCustomerAck(client, lead.customerName, normalisedPhone, lead.callbackTime).catch(
        (err: unknown) => {
          logger.error('Customer ack send failed', {
            leadId: savedLead.id,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      ),
    ];

    // 3. Schedule follow-up sequence
    messagingPromises.push(
      scheduleLeadFollowUps(savedLead.id, clientId).catch((err: unknown) => {
        logger.error('Follow-up scheduling failed', {
          leadId: savedLead.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      })
    );

    // Don't block the response — let messaging happen in background
    void Promise.all(messagingPromises);

    logger.info('Lead processed', {
      leadId: savedLead.id,
      clientId,
      leadScore: lead.leadScore,
    });

    return c.json({
      success: true,
      leadId: savedLead.id,
      message: 'Lead saved. Contractor notified.',
    });
  } catch (error) {
    logger.error('Lead route error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.json({ error: 'Failed to process lead' }, 500);
  }
});
