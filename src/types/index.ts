// ============================================================
// CallFirst API — Shared Types
// ============================================================

/** Client (contractor) record — stored in Neon */
export interface Client {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email: string;
  trade: string;
  area: string;
  domain: string;
  whatsappEnabled: boolean;
  discountPercent: number;
  urgencyMode: boolean;
  apiKey: string;
  /** Personality / tone for the AI agent */
  tone: string;
  /** Selling points to weave into conversation */
  sellingPoints: string;
  /** Price guidance per job type */
  priceGuidance: string;
  /** Custom opening greeting */
  customGreeting: string;
  googleReviewUrl: string;
  createdAt: string;
  updatedAt: string;
}

/** Lead record — every customer conversation */
export interface Lead {
  id: string;
  clientId: string;
  customerName: string;
  customerPhone: string;
  jobType: string;
  propertyType: string;
  estimatedDuration: string;
  estimatedValue: string;
  callbackTime: string;
  leadScore: 'hot' | 'warm' | 'cold';
  area: string;
  conversationLog: ConversationMessage[];
  suggestedOpener: string;
  status: 'new' | 'contacted' | 'quoted' | 'won' | 'lost' | 'dead' | 'completed';
  createdAt: string;
  updatedAt: string;
}

/** Follow-up schedule record */
export interface FollowUp {
  id: string;
  leadId: string;
  clientId: string;
  type: 'acknowledgement' | 'chase_24h' | 'chase_7d' | 'reactivation_6w' | 'review_request';
  scheduledFor: string;
  sentAt: string | null;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  createdAt: string;
}

/** Single message in the AI conversation */
export interface ConversationMessage {
  role: 'assistant' | 'user';
  content: string;
  timestamp: string;
}

/** Chat request from frontend → API */
export interface ChatRequest {
  clientId: string;
  messages: ConversationMessage[];
}

/** Chat response from API → frontend */
export interface ChatResponse {
  message: string;
  complete: boolean;
  leadData?: ExtractedLead;
}

/** Structured data extracted by Claude from the conversation */
export interface ExtractedLead {
  customerName: string;
  customerPhone: string;
  jobType: string;
  propertyType: string;
  estimatedDuration: string;
  estimatedValue: string;
  callbackTime: string;
  leadScore: 'hot' | 'warm' | 'cold';
  area: string;
  suggestedOpener: string;
}

/** Lead submission from frontend → API */
export interface LeadRequest {
  clientId: string;
  lead: ExtractedLead;
  conversationLog: ConversationMessage[];
}

/** JobBrief — the formatted message sent to the contractor */
export interface JobBrief {
  customerName: string;
  jobType: string;
  propertyType: string;
  estimatedValue: string;
  callbackTime: string;
  leadScore: string;
  suggestedOpener: string;
  area: string;
}
