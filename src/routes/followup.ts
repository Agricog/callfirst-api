// ============================================================
// CallFirst API — Follow-up Route
// POST /api/follow-up — Executes scheduled follow-ups (called by QStash)
// ============================================================

import { Hono } from 'hono';
import { getLeadById, getClientById, markFollowUpSent, markFollowUpFailed } from '../db/queries.js';
import { logger } from '../utils/logger.js';
import { normalisePhone } from '../utils/validation.js';
import { z } from 'zod';
import Twilio from 'twilio';

export const followUpRoute = new Hono();

const followUpSchema = z.object({
  leadId: z.string().uuid(),
  clientId: z.string().uuid(),
  type: z.enum(['chase_24h', 'chase_7d', 'reactivation_6w', 'review_request']),
  followUpId: z.string().uuid().optional(),
});

function getTwilioClient(): Twilio.Twilio {
  const sid = process.env['TWILIO_ACCOUNT_SID'];
  const token = process.env['TWILIO_AUTH_TOKEN'];
  if (!sid || !token) throw new Error('Twilio credentials required');
  return Twilio(sid, token);
}

function getTwilioFromNumber(): string {
  const num = process.env['TWILIO_PHONE_NUMBER'];
  if (!num) throw new Error('TWILIO_PHONE_NUMBER required');
  return num;
}

/** Build the follow-up message based on type */
function buildFollowUpMessage(
  type: string,
  customerName: string,
  businessName: string,
  contactName: string,
  jobType: string
): string {
  switch (type) {
    case 'chase_24h':
      return `Hi ${customerName}, just a quick follow-up from ${businessName}. ${contactName} is keen to get back to you about your ${jobType} enquiry. If you'd still like a quote, just reply here or give us a call. Thanks!`;

    case 'chase_7d':
      return `Hi ${customerName}, it's ${businessName} here. We wanted to check if you still need help with your ${jobType}? We'd love to give you a competitive quote. Just reply if you're still interested!`;

    case 'reactivation_6w':
      return `Hi ${customerName}, ${contactName} from ${businessName} here. We helped you with a ${jobType} enquiry a while back. If you still need the work done or have any other jobs coming up, we'd be happy to help. Just drop us a message!`;

    case 'review_request':
      return `Hi ${customerName}, thanks for choosing ${businessName} for your ${jobType}! If you were happy with the service, we'd really appreciate a quick Google review — it helps other locals find us. Thanks! ${contactName}`;

    default:
      return '';
  }
}

followUpRoute.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const parsed = followUpSchema.safeParse(body);

    if (!parsed.success) {
      logger.warn('Invalid follow-up payload', { errors: parsed.error.flatten() });
      return c.json({ error: 'Invalid payload' }, 400);
    }

    const { leadId, clientId, type, followUpId } = parsed.data;

    // Get lead and client data
    const [lead, client] = await Promise.all([
      getLeadById(leadId),
      getClientById(clientId),
    ]);

    if (!lead || !client) {
      logger.warn('Follow-up: lead or client not found', { leadId, clientId });
      return c.json({ error: 'Not found' }, 404);
    }

    // Don't send follow-ups for leads that are already won, lost, or dead
    if (['won', 'lost', 'dead'].includes(lead.status)) {
      logger.info('Follow-up skipped — lead already resolved', {
        leadId,
        status: lead.status,
        type,
      });
      if (followUpId) await markFollowUpSent(followUpId);
      return c.json({ success: true, skipped: true });
    }

    // Build and send the message
    const message = buildFollowUpMessage(
      type,
      lead.customerName,
      client.businessName,
      client.contactName,
      lead.jobType
    );

    if (!message) {
      logger.warn('Follow-up: empty message', { type });
      return c.json({ error: 'Unknown follow-up type' }, 400);
    }

    const twilio = getTwilioClient();
    await twilio.messages.create({
      body: message,
      from: getTwilioFromNumber(),
      to: normalisePhone(lead.customerPhone),
    });

    if (followUpId) {
      await markFollowUpSent(followUpId);
    }

    logger.info('Follow-up sent', { leadId, clientId, type });
    return c.json({ success: true });
  } catch (error) {
    logger.error('Follow-up execution error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });

    // Try to mark as failed
    try {
      const body = await c.req.json().catch(() => null);
      if (body && typeof body === 'object' && 'followUpId' in body) {
        await markFollowUpFailed(body.followUpId as string);
      }
    } catch {
      // ignore
    }

    return c.json({ error: 'Follow-up failed' }, 500);
  }
});
