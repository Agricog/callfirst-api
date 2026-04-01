-- ============================================================
-- CallFirst — Database Schema (Neon PostgreSQL)
-- Run once: npm run db:migrate
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- CLIENTS (contractors)
-- ============================================================
CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name   TEXT NOT NULL,
  contact_name    TEXT NOT NULL,
  phone           TEXT NOT NULL,
  email           TEXT NOT NULL,
  trade           TEXT NOT NULL,
  area            TEXT NOT NULL,
  domain          TEXT NOT NULL UNIQUE,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT false,
  discount_percent INTEGER NOT NULL DEFAULT 0 CHECK (discount_percent >= 0 AND discount_percent <= 50),
  urgency_mode    BOOLEAN NOT NULL DEFAULT false,
  api_key         TEXT NOT NULL UNIQUE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clients_api_key ON clients(api_key);
CREATE INDEX IF NOT EXISTS idx_clients_domain ON clients(domain);

-- ============================================================
-- LEADS (customer enquiries)
-- ============================================================
CREATE TABLE IF NOT EXISTS leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  customer_name     TEXT NOT NULL,
  customer_phone    TEXT NOT NULL,
  job_type          TEXT NOT NULL,
  property_type     TEXT NOT NULL,
  estimated_duration TEXT NOT NULL,
  estimated_value   TEXT NOT NULL,
  callback_time     TEXT NOT NULL,
  lead_score        TEXT NOT NULL CHECK (lead_score IN ('hot', 'warm', 'cold')),
  area              TEXT NOT NULL,
  conversation_log  JSONB NOT NULL DEFAULT '[]',
  suggested_opener  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'quoted', 'won', 'lost', 'dead')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);

-- ============================================================
-- FOLLOW-UPS (scheduled messages)
-- ============================================================
CREATE TABLE IF NOT EXISTS follow_ups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('acknowledgement', 'chase_24h', 'chase_7d', 'reactivation_6w', 'review_request')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at       TIMESTAMPTZ,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  qstash_id     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_ups_lead_id ON follow_ups(lead_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled ON follow_ups(scheduled_for) WHERE status = 'pending';

-- ============================================================
-- AUTO-UPDATE updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
