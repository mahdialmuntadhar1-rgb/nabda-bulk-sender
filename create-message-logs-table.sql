-- Create message_logs table for send history and error tracking
CREATE TABLE IF NOT EXISTS public.message_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone TEXT,
  normalized_phone TEXT,
  message TEXT,
  cta_type TEXT,
  status TEXT,
  error_reason TEXT,
  campaign_key TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  attempted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_message_logs_phone ON public.message_logs(phone);
CREATE INDEX IF NOT EXISTS idx_message_logs_normalized_phone ON public.message_logs(normalized_phone);
CREATE INDEX IF NOT EXISTS idx_message_logs_campaign_key ON public.message_logs(campaign_key);
CREATE INDEX IF NOT EXISTS idx_message_logs_status ON public.message_logs(status);
CREATE INDEX IF NOT EXISTS idx_message_logs_attempted_at ON public.message_logs(attempted_at);

-- Enable Row Level Security
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;

-- Create policy for public access (for local development)
CREATE POLICY "Public access to message_logs" ON public.message_logs FOR ALL USING (true) WITH CHECK (true);
