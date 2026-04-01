// ============================================================
// CallFirst API — Claude AI Service
// Handles the conversational intake flow
// ============================================================

import Anthropic from '@anthropic-ai/sdk';
import type { Client, ConversationMessage, ChatResponse, ExtractedLead } from '../types/index.js';
import { logger } from '../utils/logger.js';

let anthropicClient: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env['ANTHROPIC_API_KEY'];
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

/** Build the system prompt for the AI intake agent */
function buildSystemPrompt(client: Client): string {
  const discountLine =
    client.discountPercent > 0
      ? `\nIMPORTANT: ${client.businessName} is currently offering ${client.discountPercent}% off all quotes this week. Mention this naturally when you give the price estimate.`
      : '';

  const urgencyLine = client.urgencyMode
    ? `\nURGENCY MODE: ${client.businessName} has availability this week. Emphasise fast turnaround and encourage the customer to book a callback today.`
    : '';

  const priceLine = client.priceGuidance
    ? `\nPRICE GUIDE (use these for estimates): ${client.priceGuidance}`
    : '';

  const sellingLine = client.sellingPoints
    ? `\nKEY SELLING POINTS (weave in naturally, don't list them): ${client.sellingPoints}`
    : '';

  const greetingLine = client.customGreeting
    ? `\nYour opening message must be: "${client.customGreeting}"`
    : '';

  return `You are the AI assistant for ${client.businessName}, a ${client.trade} company in ${client.area}.

YOUR VOICE: ${client.tone}. You sound like you work here, not like a chatbot.${greetingLine}

YOUR JOB: Collect 5 things from the customer, ONE AT A TIME. Never skip ahead. Never combine questions.

STEP 1 → Ask: What work do they need?
STEP 2 → Ask: What type of property? (domestic/commercial, house type)
STEP 3 → Ask: When do they need it?
STEP 4 → Give a price estimate. Then ask: Can I get your name and number?
STEP 5 → Ask: What time suits for a callback?
STEP 6 → Confirm and say goodbye. MUST include the |||LEAD_DATA||| block.

ABSOLUTE RULES:
- ONE question per message. If you ask two questions, you have failed.
- Maximum 2 sentences per message. Be concise.
- British English only.
- Prices are ROUGH — say "roughly" or "in the region of"
- Never discuss competitors${discountLine}${urgencyLine}${priceLine}${sellingLine}

LEAD DATA — MANDATORY ON GOODBYE:
When you say goodbye in STEP 6, you MUST append this block. Without it the customer gets no callback and the lead is permanently lost.

|||LEAD_DATA|||
{
  "customerName": "their name",
  "customerPhone": "their number exactly as given",
  "jobType": "what they need",
  "propertyType": "property details",
  "estimatedDuration": "your estimate",
  "estimatedValue": "£X–£Y",
  "callbackTime": "when they want the call",
  "leadScore": "hot or warm or cold",
  "area": "${client.area}",
  "suggestedOpener": "A specific friendly opening line for ${client.contactName} referencing the job"
}
|||END_LEAD|||

hot = within 2 weeks, warm = within a month, cold = just researching.
EVERY goodbye MUST have the |||LEAD_DATA||| block. No exceptions.`;
}

/** Process a chat message through Claude */
export async function processChat(
  client: Client,
  messages: ConversationMessage[]
): Promise<ChatResponse> {
  const claude = getAnthropicClient();

  const claudeMessages = messages.map((m) => ({
    role: m.role as 'assistant' | 'user',
    content: m.content,
  }));

  try {
    const response = await claude.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: buildSystemPrompt(client),
      messages: claudeMessages,
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const fullResponse = textBlock?.text ?? '';

    // Check if lead data was extracted
    const leadMatch = fullResponse.match(
      /\|\|\|LEAD_DATA\|\|\|([\s\S]*?)\|\|\|END_LEAD\|\|\|/
    );

    if (leadMatch?.[1]) {
      try {
        const leadData = JSON.parse(leadMatch[1].trim()) as ExtractedLead;
        const cleanMessage = fullResponse
          .replace(/\|\|\|LEAD_DATA\|\|\|[\s\S]*?\|\|\|END_LEAD\|\|\|/, '')
          .trim();

        logger.info('Lead data extracted from conversation', {
          clientId: client.id,
          leadScore: leadData.leadScore,
        });

        return {
          message: cleanMessage,
          complete: true,
          leadData,
        };
      } catch {
        logger.warn('Failed to parse lead data JSON', { clientId: client.id });
      }
    }

    return {
      message: fullResponse,
      complete: false,
    };
  } catch (error) {
    logger.error('Claude API error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      clientId: client.id,
    });
    throw new Error('Failed to process message');
  }
}
