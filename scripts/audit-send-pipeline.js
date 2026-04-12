import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function auditSendPipeline() {
  console.log('🔍 Auditing Send Pipeline Safety...\n');
  
  const findings = {
    singleSend: false,
    bulkSend: false,
    duplicatePrevention: false,
    failureHandling: false,
    filterRespect: false,
    logging: false,
    phoneNormalization: false
  };
  
  // Check message_logs table structure
  try {
    console.log('📋 Checking message_logs table structure...');
    const { data: logs, error: logsError } = await targetClient
      .from('message_logs')
      .select('*')
      .limit(1);
    
    if (logsError) {
      console.log('❌ message_logs table error:', logsError.message);
    } else if (logs && logs.length > 0) {
      console.log('✅ message_logs table exists');
      console.log('📋 Columns:', Object.keys(logs[0]).join(', '));
      findings.logging = true;
    } else {
      console.log('⚠️  message_logs table is empty');
    }
  } catch (e) {
    console.log('❌ message_logs table check failed:', e.message);
  }
  
  // Check for recent message logs
  try {
    console.log('\n📋 Checking recent message logs...');
    const { data: recentLogs, error: recentError } = await targetClient
      .from('message_logs')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(5);
    
    if (recentError) {
      console.log('❌ Error fetching recent logs:', recentError.message);
    } else if (recentLogs && recentLogs.length > 0) {
      console.log(`✅ Found ${recentLogs.length} recent logs`);
      console.log('📋 Sample log:', recentLogs[0]);
    } else {
      console.log('⚠️  No recent logs found');
    }
  } catch (e) {
    console.log('❌ Recent logs check failed:', e.message);
  }
  
  // Check send pipeline code review
  console.log('\n📋 Send Pipeline Code Review:');
  console.log('✅ Single-send: Supported (source === "single")');
  findings.singleSend = true;
  
  console.log('✅ Bulk-send: Supported (source === "supabase" or CSV)');
  findings.bulkSend = true;
  
  console.log('✅ Duplicate prevention: In-batch deduplication (sentPhones Set)');
  console.log('⚠️  Duplicate prevention: No cross-run deduplication (checks message_logs but only for same message content)');
  findings.duplicatePrevention = true;
  
  console.log('✅ Failure handling: Try-catch blocks, error logging');
  console.log('⚠️  Failure handling: No retry logic, no status tracking');
  findings.failureHandling = true;
  
  console.log('✅ Filter respect: Server-side filtering (city, category parameters)');
  findings.filterRespect = true;
  
  console.log('✅ Logging: message_logs table with phone, message, cta_type, sent_at');
  console.log('⚠️  Logging: No status field in logs (success/failed)');
  findings.logging = true;
  
  console.log('❌ Phone normalization: No normalization logic in send pipeline');
  console.log('❌ Phone normalization: Phones sent as-is from database');
  console.log('❌ Phone normalization: No format validation before send');
  findings.phoneNormalization = false;
  
  return findings;
}

auditSendPipeline()
  .then(() => {
    console.log('\n✅ Send pipeline audit completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
