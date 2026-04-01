// ============================================================
// CallFirst API — Twilio Messaging Service
// Handles SMS and WhatsApp delivery
// ============================================================

import Twilio from 'twilio';
import type { Client, JobBrief } from '../types/index.js';
import { normalisePhone } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

let twilioClient: Twilio.Twilio | null = null;

function getTwilioClient(): Twilio.Twilio {
  if (!twilioClient) {
    const sid = process.env['TWILIO_ACCOUNT_SID'];
    const token = process.env['TWILIO_AUTH_TOKEN'];
    if (!sid || !token) throw new Error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN required');
    twilioClient = Twilio(sid, token);
  }
  return twilioClient;
}

function getTwilioFromNumber(): string {
  const num = process.env['TWILIO_PHONE_NUMBER'];
  if (!num) throw new Error('TWILIO_PHONE_NUMBER required');
  return num;
}

function getWhatsAppFromNumber(): string {
  return process.env['TWILIO_WHATSAPP_NUMBER'] ?? `whatsapp:${getTwilioFromNumber()}`;
}

/** Format the JobBrief as a readable message for the contractor */
function formatJobBrief(brief: JobBrief, customerPhone: string): string {
  const scoreEmoji =
    brief.leadScore === 'hot' ? '🔥' : brief.leadScore === 'warm' ? '🟡' : '🔵';

  return `📋 NEW LEAD ${scoreEmoji}

${brief.customerName} — ${brief.jobType}
🏠 ${brief.propertyType}
📍 ${brief.area}
💰 Est: ${brief.estimatedValue}
📞 ${customerPhone}
⏰ Callback: ${brief.callbackTime}

💬 Opening line:
"${brief.suggestedOpener}"`;
}

/** Format the 60-second acknowledgement to the customer */
function formatCustomerAck(
  customerName: string,
  businessName: string,
  contactName: string,
  callbackTime: string
): string {
  return `Hi ${customerName}, thanks for your enquiry! ${contactName} from ${businessName} will call you back ${callbackTime}. If you need anything in the meantime, just reply here.`;
}

/** Send SMS via Twilio */
async function sendSms(to: string, body: string): Promise<string> {
  const client = getTwilioClient();
  const message = await client.messages.create({
    body,
    from: getTwilioFromNumber(),
    to: normalisePhone(to),
    statusCallback: `${process.env['API_BASE_URL'] ?? ''}/api/webhook/twilio`,
  });
  return message.sid;
}

/** Send WhatsApp via Twilio */
async function sendWhatsApp(to: string, body: string): Promise<string> {
  const client = getTwilioClient();
  const message = await client.messages.create({
    body,
    from: getWhatsAppFromNumber(),
    to: `whatsapp:${normalisePhone(to)}`,
    statusCallback: `${process.env['API_BASE_URL'] ?? ''}/api/webhook/twilio`,
  });
  return message.sid;
}

/** Send JobBrief to the contractor */
export async function sendJobBrief(
  client: Client,
  brief: JobBrief,
  customerPhone: string
): Promise<string> {
  const message = formatJobBrief(brief, customerPhone);

  try {
    const sid = client.whatsappEnabled
      ? await sendWhatsApp(client.phone, message)
      : await sendSms(client.phone, message);

    logger.info('JobBrief sent to contractor', {
      clientId: client.id,
      method: client.whatsappEnabled ? 'whatsapp' : 'sms',
      messageSid: sid,
    });

    return sid;
  } catch (error) {
    logger.error('Failed to send JobBrief', {
      clientId: client.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/** Send 60-second acknowledgement to the customer */
export async function sendCustomerAck(
  client: Client,
  customerName: string,
  customerPhone: string,
  callbackTime: string
): Promise<string> {
  const message = formatCustomerAck(
    customerName,
    client.businessName,
    client.contactName,
    callbackTime
  );

  try {
    // Customer always gets SMS first (more reliable, no WhatsApp opt-in needed)
    const sid = await sendSms(customerPhone, message);

    logger.info('Customer acknowledgement sent', {
      clientId: client.id,
      messageSid: sid,
    });

    return sid;
  } catch (error) {
    logger.error('Failed to send customer ack', {
      clientId: client.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
