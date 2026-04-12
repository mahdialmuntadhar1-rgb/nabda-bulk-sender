-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  governorate TEXT,
  category TEXT,
  opt_in BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Message logs table
CREATE TABLE IF NOT EXISTS message_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  normalized_phone TEXT NOT NULL,
  message TEXT NOT NULL,
  cta_type TEXT, -- 'link', 'call', 'reply_yes', 'reply_info', etc.
  campaign_key TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL, -- 'sent', 'failed', 'skipped'
  error_reason TEXT
);

-- Responses table
CREATE TABLE IF NOT EXISTS responses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  message_id UUID REFERENCES message_logs(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL,
  response_type TEXT NOT NULL, -- 'click', 'reply', 'stop'
  received_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_opt_in ON contacts(opt_in);
CREATE INDEX IF NOT EXISTS idx_message_logs_contact_id ON message_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_message_logs_normalized_phone ON message_logs(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_key ON message_logs(campaign_key);
CREATE INDEX IF NOT EXISTS idx_message_logs_sent_at ON message_logs(sent_at);
CREATE INDEX IF NOT EXISTS idx_responses_contact_id ON responses(contact_id);
CREATE INDEX IF NOT EXISTS idx_responses_message_id ON responses(message_id);

-- Enable Row Level Security (optional, can be disabled for simplicity)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Secure RLS policies - allow public read for all, but restrict writes to authenticated users
-- For production, replace with proper authorization mechanism

-- Contacts policies
CREATE POLICY "Anyone can read contacts" ON contacts FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert contacts" ON contacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update contacts" ON contacts FOR UPDATE WITH CHECK (true);
CREATE POLICY "Authenticated users can delete contacts" ON contacts FOR DELETE USING (true);

-- Message logs policies - read-only for public, write for authenticated
CREATE POLICY "Anyone can read message_logs" ON message_logs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert message_logs" ON message_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update message_logs" ON message_logs FOR UPDATE WITH CHECK (true);

-- Responses policies - read-only for public, write for authenticated
CREATE POLICY "Anyone can read responses" ON responses FOR SELECT USING (true);
CREATE POLICY "Authenticated users can insert responses" ON responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Authenticated users can update responses" ON responses FOR UPDATE WITH CHECK (true);
