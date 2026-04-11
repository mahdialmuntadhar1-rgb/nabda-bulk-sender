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
  message TEXT NOT NULL,
  cta_type TEXT, -- 'link', 'call', 'reply_yes', 'reply_info', etc.
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status TEXT NOT NULL -- 'sent', 'failed'
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
CREATE INDEX IF NOT EXISTS idx_responses_contact_id ON responses(contact_id);
CREATE INDEX IF NOT EXISTS idx_responses_message_id ON responses(message_id);

-- Enable Row Level Security (optional, can be disabled for simplicity)
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (for demo purposes - adjust for production)
CREATE POLICY "Public access to contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to message_logs" ON message_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public access to responses" ON responses FOR ALL USING (true) WITH CHECK (true);
