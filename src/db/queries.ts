// ============================================================
// CallFirst API — Database Queries
// ============================================================

import { getDb } from './client.js';
import type { Client, Lead, FollowUp, ConversationMessage } from '../types/index.js';
import { logger } from '../utils/logger.js';

// ============================================================
// CLIENT QUERIES
// ============================================================

export async function getClientByApiKey(apiKey: string): Promise<Client | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM clients
    WHERE api_key = ${apiKey} AND active = true
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return mapClient(row);
}

export async function getClientById(id: string): Promise<Client | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM clients
    WHERE id = ${id} AND active = true
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return mapClient(row);
}

/** Update client settings (urgency, discount) */
export async function updateClientSettings(
  clientId: string,
  settings: { urgencyMode?: boolean; discountPercent?: number; priceGuidance?: string }
): Promise<void> {
  const sql = getDb();
  
  if (settings.urgencyMode !== undefined) {
    await sql`UPDATE clients SET urgency_mode = ${settings.urgencyMode} WHERE id = ${clientId}`;
  }
  if (settings.discountPercent !== undefined) {
    await sql`UPDATE clients SET discount_percent = ${settings.discountPercent} WHERE id = ${clientId}`;
  }
  if (settings.priceGuidance !== undefined) {
    await sql`UPDATE clients SET price_guidance = ${settings.priceGuidance} WHERE id = ${clientId}`;
  }
}

// ============================================================
// LEAD QUERIES
// ============================================================

export async function createLead(params: {
  clientId: string;
  customerName: string;
  customerPhone: string;
  jobType: string;
  propertyType: string;
  estimatedDuration: string;
  estimatedValue: string;
  callbackTime: string;
  leadScore: string;
  area: string;
  conversationLog: ConversationMessage[];
  suggestedOpener: string;
}): Promise<Lead> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO leads (
      client_id, customer_name, customer_phone, job_type,
      property_type, estimated_duration, estimated_value,
      callback_time, lead_score, area, conversation_log, suggested_opener
    ) VALUES (
      ${params.clientId}, ${params.customerName}, ${params.customerPhone},
      ${params.jobType}, ${params.propertyType}, ${params.estimatedDuration},
      ${params.estimatedValue}, ${params.callbackTime}, ${params.leadScore},
      ${params.area}, ${JSON.stringify(params.conversationLog)}, ${params.suggestedOpener}
    )
    RETURNING *
  `;

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create lead');
  }

  logger.info('Lead created', { leadId: row['id'], clientId: params.clientId });
  return mapLead(row);
}

/** Get leads for a client with optional status filter */
export async function getLeadsByClientId(
  clientId: string,
  status?: string
): Promise<Lead[]> {
  const sql = getDb();
  let rows;

  if (status) {
    rows = await sql`
      SELECT * FROM leads
      WHERE client_id = ${clientId} AND status = ${status}
      ORDER BY created_at DESC
      LIMIT 100
    `;
  } else {
    rows = await sql`
      SELECT * FROM leads
      WHERE client_id = ${clientId}
      ORDER BY created_at DESC
      LIMIT 100
    `;
  }

  return rows.map((row) => mapLead(row));
}

/** Get a single lead by ID */
export async function getLeadById(leadId: string): Promise<Lead | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT * FROM leads WHERE id = ${leadId} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return mapLead(row);
}

/** Update lead status */
export async function updateLeadStatus(
  leadId: string,
  status: Lead['status']
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE leads SET status = ${status} WHERE id = ${leadId}
  `;
}

/** Get lead counts by status for a client */
export async function getLeadStats(clientId: string): Promise<Record<string, number>> {
  const sql = getDb();
  const rows = await sql`
    SELECT status, COUNT(*)::int as count
    FROM leads
    WHERE client_id = ${clientId}
    GROUP BY status
  `;
  const stats: Record<string, number> = {};
  for (const row of rows) {
    const status = row['status'] as string;
    const count = row['count'] as number;
    stats[status] = count;
  }
  return stats;
}

// ============================================================
// FOLLOW-UP QUERIES
// ============================================================

export async function createFollowUp(params: {
  leadId: string;
  clientId: string;
  type: FollowUp['type'];
  scheduledFor: string;
  qstashId?: string;
}): Promise<FollowUp> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO follow_ups (lead_id, client_id, type, scheduled_for, qstash_id)
    VALUES (${params.leadId}, ${params.clientId}, ${params.type}, ${params.scheduledFor}, ${params.qstashId ?? null})
    RETURNING *
  `;

  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create follow-up');
  }

  return mapFollowUp(row);
}

export async function markFollowUpSent(id: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE follow_ups SET status = 'sent', sent_at = NOW() WHERE id = ${id}
  `;
}

export async function markFollowUpFailed(id: string): Promise<void> {
  const sql = getDb();
  await sql`UPDATE follow_ups SET status = 'failed' WHERE id = ${id}`;
}

/** Cancel pending follow-ups for a lead (when status changes to won/lost) */
export async function cancelPendingFollowUps(leadId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE follow_ups
    SET status = 'cancelled'
    WHERE lead_id = ${leadId} AND status = 'pending'
  `;
}

// ============================================================
// ROW MAPPERS
// ============================================================

function mapClient(row: Record<string, unknown>): Client {
  return {
    id: row['id'] as string,
    businessName: row['business_name'] as string,
    contactName: row['contact_name'] as string,
    phone: row['phone'] as string,
    email: row['email'] as string,
    trade: row['trade'] as string,
    area: row['area'] as string,
    domain: row['domain'] as string,
    whatsappEnabled: row['whatsapp_enabled'] as boolean,
    discountPercent: row['discount_percent'] as number,
    urgencyMode: row['urgency_mode'] as boolean,
    apiKey: row['api_key'] as string,
    tone: row['tone'] as string,
    sellingPoints: row['selling_points'] as string,
    priceGuidance: row['price_guidance'] as string,
    customGreeting: row['custom_greeting'] as string,
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

function mapLead(row: Record<string, unknown>): Lead {
  return {
    id: row['id'] as string,
    clientId: row['client_id'] as string,
    customerName: row['customer_name'] as string,
    customerPhone: row['customer_phone'] as string,
    jobType: row['job_type'] as string,
    propertyType: row['property_type'] as string,
    estimatedDuration: row['estimated_duration'] as string,
    estimatedValue: row['estimated_value'] as string,
    callbackTime: row['callback_time'] as string,
    leadScore: row['lead_score'] as 'hot' | 'warm' | 'cold',
    area: row['area'] as string,
    conversationLog: row['conversation_log'] as ConversationMessage[],
    suggestedOpener: row['suggested_opener'] as string,
    status: row['status'] as Lead['status'],
    createdAt: row['created_at'] as string,
    updatedAt: row['updated_at'] as string,
  };
}

function mapFollowUp(row: Record<string, unknown>): FollowUp {
  return {
    id: row['id'] as string,
    leadId: row['lead_id'] as string,
    clientId: row['client_id'] as string,
    type: row['type'] as FollowUp['type'],
    scheduledFor: row['scheduled_for'] as string,
    sentAt: row['sent_at'] as string | null,
    status: row['status'] as FollowUp['status'],
    createdAt: row['created_at'] as string,
  };
}
