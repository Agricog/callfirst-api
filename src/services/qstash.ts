// ============================================================
// CallFirst API — Upstash QStash Scheduled Follow-ups
// ============================================================

import { Client as QStashClient } from '@upstash/qstash';
import { createFollowUp } from '../db/queries.js';
import type { FollowUp } from '../types/index.js';
import { logger } from '../utils/logger.js';

let qstashClient: QStashClient | null = null;

function getQStashClient(): QStashClient {
  if (!qstashClient) {
    const token = process.env['QSTASH_TOKEN'];
    if (!token) throw new Error('QSTASH_TOKEN required');
    qstashClient = new QStashClient({ token });
  }
  return qstashClient;
}

function getApiBaseUrl(): string {
  const url = process.env['API_BASE_URL'];
  if (!url) throw new Error('API_BASE_URL required for scheduling follow-ups');
  return url;
}

interface ScheduleParams {
  leadId: string;
  clientId: string;
  type: FollowUp['type'];
  delaySeconds: number;
}

/** Schedule a follow-up message via QStash */
async function scheduleFollowUp(params: ScheduleParams): Promise<void> {
  const qstash = getQStashClient();
  const baseUrl = getApiBaseUrl();

  try {
    const result = await qstash.publishJSON({
      url: `${baseUrl}/api/follow-up`,
      body: {
        leadId: params.leadId,
        clientId: params.clientId,
        type: params.type,
      },
      delay: params.delaySeconds,
    });

    const scheduledFor = new Date(
      Date.now() + params.delaySeconds * 1000
    ).toISOString();

    await createFollowUp({
      leadId: params.leadId,
      clientId: params.clientId,
      type: params.type,
      scheduledFor,
      qstashId: result.messageId,
    });

    logger.info('Follow-up scheduled', {
      leadId: params.leadId,
      type: params.type,
      delaySeconds: params.delaySeconds,
    });
  } catch (error) {
    logger.error('Failed to schedule follow-up', {
      leadId: params.leadId,
      type: params.type,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/** Schedule the full follow-up sequence for a new lead */
export async function scheduleLeadFollowUps(
  leadId: string,
  clientId: string
): Promise<void> {
  // 24-hour chase — if contractor hasn't contacted them
  await scheduleFollowUp({
    leadId,
    clientId,
    type: 'chase_24h',
    delaySeconds: 24 * 60 * 60, // 24 hours
  });

  // 7-day chase — gentle nudge
  await scheduleFollowUp({
    leadId,
    clientId,
    type: 'chase_7d',
    delaySeconds: 7 * 24 * 60 * 60, // 7 days
  });

  // 6-week reactivation — dead lead revival
  await scheduleFollowUp({
    leadId,
    clientId,
    type: 'reactivation_6w',
    delaySeconds: 42 * 24 * 60 * 60, // 6 weeks
  });
}

/** Schedule a Google review request 3 days after job completion */
export async function scheduleReviewRequest(
  leadId: string,
  clientId: string
): Promise<void> {
  await scheduleFollowUp({
    leadId,
    clientId,
    type: 'review_request',
    delaySeconds: 3 * 24 * 60 * 60,
  });
}
