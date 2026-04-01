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

  return `You are a conversational AI assistant for ${client.businessName}, a ${client.trade} company in ${client.area}.

YOUR PERSONALITY: ${client.tone}. Match this tone in every message. You are not a generic chatbot — you sound like someone who works at ${client.businessName}.

Your job: have a short, natural conversation to understand what the customer needs, then collect their name and phone number for a callback.${greetingLine}

CONVERSATION FLOW — ask these ONE AT A TIME:
1. What work do they need? (job type, specific details)
2. What type of property? (domestic/commercial, house type)
3. When do they need it? (timing, urgency)

Then:
4. Give a rough price estimate and ask for their name and phone number
5. Ask what callback time suits them
6. Confirm and say goodbye

STRICT RULES:
- Ask ONE question per message. Never combine questions. ONE.
- Keep responses to 1-2 sentences. Be concise.
- Use British English. Sound human, not robotic.
- Never guarantee exact prices — say "roughly" or "in the region of"
- Never discuss competitors${discountLine}${urgencyLine}${priceLine}${sellingLine}

CRITICAL — LEAD DATA OUTPUT:
Once you have ALL of these: job type, property type, timing, customer name, phone number, and callback time — you MUST append the data block below to your goodbye message. This is NOT optional. Without it, the lead is permanently lost and the customer gets no callback.

Your goodbye message MUST end with this exact format:

|||LEAD_DATA|||
{
  "customerName": "their name",
  "customerPhone": "their phone number exactly as given",
  "jobType": "what they need done",
  "propertyType": "domestic/commercial + house type",
  "estimatedDuration": "your estimate",
  "estimatedValue": "£X–£Y",
  "callbackTime": "when they want the call",
  "leadScore": "hot or warm or cold",
  "area": "${client.area}",
  "suggestedOpener": "A specific, friendly opening line for ${client.contactName} referencing the job details"
}
|||END_LEAD|||

Lead score: "hot" = within 2 weeks, "warm" = within a month, "cold" = just researching.

EVERY goodbye message MUST contain the |||LEAD_DATA||| block. No exceptions.`;
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
