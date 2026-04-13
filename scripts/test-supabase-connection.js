import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = 'https://hsadukhmcclwixuntqwu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzYWR1a2htY2Nsd2l4dW50cXd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMwODMzNjgsImV4cCI6MjA4ODY1OTM2OH0.XWDbzIPZNPk6j1GXixcIJKUb4lp48ipC7jExG2Q09Ns';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testConnection() {
  console.log('🔍 Testing Supabase connection...\n');
  
  try {
    // Test 1: Check businesses table
    console.log('📋 Testing businesses table...');
    const { data: businesses, error: businessesError } = await supabase
      .from('businesses')
      .select('*')
      .limit(5);
    
    if (businessesError) {
      console.log('❌ Businesses table error:', businessesError.message);
    } else {
      console.log(`✅ Businesses table: ${businesses.length} records`);
      if (businesses.length > 0) {
        console.log('📄 Sample:', businesses[0]);
      }
    }
    
    // Test 2: Check staging_businesses table
    console.log('\n📋 Testing staging_businesses table...');
    const { data: staging, error: stagingError } = await supabase
      .from('staging_businesses')
      .select('*')
      .limit(5);
    
    if (stagingError) {
      console.log('❌ Staging_businesses table error:', stagingError.message);
    } else {
      console.log(`✅ Staging_businesses table: ${staging.length} records`);
      if (staging.length > 0) {
        console.log('📄 Sample:', staging[0]);
      }
    }
    
    // Test 3: Check message_logs table
    console.log('\n📋 Testing message_logs table...');
    const { data: logs, error: logsError } = await supabase
      .from('message_logs')
      .select('*')
      .limit(5);
    
    if (logsError) {
      console.log('❌ Message_logs table error:', logsError.message);
    } else {
      console.log(`✅ Message_logs table: ${logs.length} records`);
      if (logs.length > 0) {
        console.log('📄 Sample:', logs[0]);
      }
    }
    
    // Test 4: Get total counts
    console.log('\n📊 Total counts:');
    const { count: businessesCount } = await supabase
      .from('businesses')
      .select('*', { count: 'exact', head: true });
    console.log(`  Businesses: ${businessesCount || 0}`);
    
    console.log('\n✅ Supabase connection test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testConnection()
  .then(() => {
    console.log('\n✅ All tests completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
