import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function fixLogging() {
  console.log('🔧 Fixing message_logs table structure...\n');
  
  try {
    // Add status column to message_logs table
    console.log('📝 Adding status column to message_logs...');
    const { error: alterError } = await targetClient.rpc('exec_sql', {
      sql: 'ALTER TABLE public.message_logs ADD COLUMN IF NOT EXISTS status TEXT;'
    });
    
    if (alterError) {
      console.log('⚠️  Could not add status column via RPC:', alterError.message);
      console.log('⚠️  Please run this SQL manually in Supabase SQL Editor:');
      console.log('ALTER TABLE public.message_logs ADD COLUMN IF NOT EXISTS status TEXT;');
    } else {
      console.log('✅ Added status column to message_logs');
    }
    
    // Check current structure
    console.log('\n📋 Checking message_logs table structure...');
    const { data: logs } = await targetClient
      .from('message_logs')
      .select('*')
      .limit(1);
    
    if (logs && logs.length > 0) {
      console.log('📋 Current columns:', Object.keys(logs[0]).join(', '));
    }
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
    throw error;
  }
}

fixLogging()
  .then(() => {
    console.log('\n✅ Logging fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
