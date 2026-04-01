// ============================================================
// CallFirst API — Input Validation (Zod)
// ============================================================

import { z } from 'zod';

/** Sanitise string input — strip HTML tags and trim */
function sanitise(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[<>"'&]/g, '')
    .trim();
}

/** UK phone number — accepts 07xxx, +447xxx, 447xxx */
const ukPhoneSchema = z
  .string()
  .transform(sanitise)
  .pipe(
    z.string().regex(
      /^(?:\+44|44|0)7\d{9}$/,
      'Valid UK mobile number required'
    )
  );

/** Normalise UK phone to +44 format */
export function normalisePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+44')) return cleaned;
  if (cleaned.startsWith('44')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+44${cleaned.slice(1)}`;
  return cleaned;
}

/** Conversation message schema */
const messageSchema = z.object({
  role: z.enum(['assistant', 'user']),
  content: z.string().min(1).max(2000).transform(sanitise),
  timestamp: z.string().datetime(),
});

/** Chat request validation */
export const chatRequestSchema = z.object({
  clientId: z.string().uuid('Valid client ID required'),
  messages: z
    .array(messageSchema)
    .min(1, 'At least one message required')
    .max(50, 'Conversation too long'),
});

/** Extracted lead data validation */
const extractedLeadSchema = z.object({
  customerName: z.string().min(1).max(100).transform(sanitise),
  customerPhone: ukPhoneSchema,
  jobType: z.string().min(1).max(200).transform(sanitise),
  propertyType: z.string().min(1).max(100).transform(sanitise),
  estimatedDuration: z.string().min(1).max(100).transform(sanitise),
  estimatedValue: z.string().min(1).max(50).transform(sanitise),
  callbackTime: z.string().min(1).max(100).transform(sanitise),
  leadScore: z.enum(['hot', 'warm', 'cold']),
  area: z.string().min(1).max(100).transform(sanitise),
  suggestedOpener: z.string().min(1).max(500).transform(sanitise),
});

/** Lead submission validation */
export const leadRequestSchema = z.object({
  clientId: z.string().uuid('Valid client ID required'),
  lead: extractedLeadSchema,
  conversationLog: z.array(messageSchema).min(1).max(50),
});

/** Twilio webhook validation */
export const twilioWebhookSchema = z.object({
  MessageSid: z.string().min(1),
  MessageStatus: z.enum([
    'queued',
    'sent',
    'delivered',
    'undelivered',
    'failed',
    'read',
  ]),
  To: z.string().min(1),
  ErrorCode: z.string().optional(),
});

export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
export type LeadRequestInput = z.infer<typeof leadRequestSchema>;
export type TwilioWebhookInput = z.infer<typeof twilioWebhookSchema>;
