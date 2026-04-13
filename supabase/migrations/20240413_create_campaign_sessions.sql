-- Create campaign_sessions table for stop/resume functionality
CREATE TABLE IF NOT EXISTS campaign_sessions (
    campaign_id TEXT PRIMARY KEY,
    campaign_name TEXT,
    total_count INTEGER NOT NULL,
    current_index INTEGER NOT NULL DEFAULT 0,
    sent_count INTEGER NOT NULL DEFAULT 0,
    failed_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    processed_numbers TEXT[] DEFAULT ARRAY[]::TEXT[],
    status TEXT NOT NULL CHECK (status IN ('sending', 'stopped', 'completed')),
    source TEXT NOT NULL,
    table_name TEXT,
    message TEXT,
    batch_size INTEGER,
    message_delay INTEGER,
    batch_delay INTEGER,
    random_delay BOOLEAN DEFAULT FALSE,
    skip_previously_contacted BOOLEAN DEFAULT FALSE,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create index for quick active campaign lookup
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_status ON campaign_sessions(status);
CREATE INDEX IF NOT EXISTS idx_campaign_sessions_updated_at ON campaign_sessions(updated_at DESC);

-- Add trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_campaign_sessions_updated_at BEFORE UPDATE ON campaign_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
