// ============================================================
// CallFirst API — Twilio Webhook Route
// POST /api/webhook/twilio — Delivery status callbacks
// ============================================================

import { Hono } from 'hono';
import { twilioWebhookSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';
import crypto from 'node:crypto';

export const webhookRoute = new Hono();

/** Validate Twilio signature to prevent spoofed webhooks */
function validateTwilioSignature(
  url: string,
  params: Record<string, string>,
  signature: string
): boolean {
  const authToken = process.env['TWILIO_AUTH_TOKEN'];
  if (!authToken) return false;

  // Sort params and concatenate
  const sortedKeys = Object.keys(params).sort();
  let dataString = url;
  for (const key of sortedKeys) {
    dataString += key + (params[key] ?? '');
  }

  const computed = crypto
    .createHmac('sha1', authToken)
    .update(dataString, 'utf-8')
    .digest('base64');

  return crypto.timingSafeEqual(
    Buffer.from(computed),
    Buffer.from(signature)
  );
}

webhookRoute.post('/', async (c) => {
  try {
    // Verify Twilio signature
    const twilioSig = c.req.header('X-Twilio-Signature');
    if (!twilioSig) {
      return c.json({ error: 'Missing Twilio signature' }, 401);
    }

    const body = await c.req.parseBody();
    const baseUrl = process.env['API_BASE_URL'] ?? '';
    const fullUrl = `${baseUrl}/api/webhook/twilio`;

    const isValid = validateTwilioSignature(
      fullUrl,
      body as Record<string, string>,
      twilioSig
    );

    if (!isValid) {
      logger.warn('Invalid Twilio signature on webhook');
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Parse the webhook payload
    const parsed = twilioWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: 'Invalid webhook payload' }, 400);
    }

    const { MessageSid, MessageStatus, ErrorCode } = parsed.data;

    // Log delivery status
    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      logger.error('Message delivery failed', {
        messageSid: MessageSid,
        status: MessageStatus,
        errorCode: ErrorCode,
      });
    } else {
      logger.info('Message status update', {
        messageSid: MessageSid,
        status: MessageStatus,
      });
    }

    // Twilio expects a 200 response
    return c.text('OK', 200);
  } catch (error) {
    logger.error('Twilio webhook error', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return c.text('OK', 200); // Still return 200 so Twilio doesn't retry
  }
});
