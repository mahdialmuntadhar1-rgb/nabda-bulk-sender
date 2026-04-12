import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Target Supabase (CURRENT APP)
const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function fixSchema() {
  console.log('🔧 Fixing target schema...');
  
  try {
    // Add missing columns to staging_businesses table
    const sql = `
      alter table public.staging_businesses
      add column if not exists source_business_id text,
      add column if not exists name_ar text,
      add column if not exists name_ku text,
      add column if not exists phone text,
      add column if not exists whatsapp text,
      add column if not exists city text,
      add column if not exists address text;

      create unique index if not exists staging_businesses_source_business_id_idx
      on public.staging_businesses(source_business_id);
    `;
    
    console.log('📝 Executing SQL...');
    const { error } = await targetClient.rpc('exec_sql', { sql });
    
    if (error) {
      console.error('❌ Error executing SQL:', error);
      // Try using direct SQL execution via REST API
      console.log('🔄 Trying alternative approach...');
      
      // Since we can't execute raw SQL via the client, we need to use the REST API
      const response = await fetch(`${TARGET_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${TARGET_SERVICE_KEY}`,
          'apikey': TARGET_SERVICE_KEY
        },
        body: JSON.stringify({ sql })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      console.log('✅ Schema fixed via REST API');
    } else {
      console.log('✅ Schema fixed successfully');
    }
    
    console.log('\n✅ Schema fix completed!');
    
  } catch (error) {
    console.error('❌ Schema fix failed:', error);
    throw error;
  }
}

// Alternative approach using individual column additions
async function fixSchemaIndividual() {
  console.log('🔧 Fixing target schema (individual columns)...');
  
  const columns = [
    { name: 'source_business_id', type: 'text' },
    { name: 'name_ar', type: 'text' },
    { name: 'name_ku', type: 'text' },
    { name: 'phone', type: 'text' },
    { name: 'whatsapp', type: 'text' },
    { name: 'city', type: 'text' },
    { name: 'address', type: 'text' }
  ];
  
  for (const column of columns) {
    try {
      console.log(`📝 Adding column: ${column.name}...`);
      const { error } = await targetClient
        .from('staging_businesses')
        .select(column.name)
        .limit(1);
      
      if (error && error.message.includes('column')) {
        // Column doesn't exist, we need to add it via SQL
        console.log(`⚠️  Column ${column.name} needs to be added via SQL`);
        console.log('⚠️  Please run this SQL manually in your Supabase SQL Editor:');
        console.log(`ALTER TABLE public.staging_businesses ADD COLUMN IF NOT EXISTS ${column.name} ${column.type};`);
      } else {
        console.log(`✅ Column ${column.name} exists`);
      }
    } catch (e) {
      console.log(`⚠️  Column ${column.name} check failed: ${e.message}`);
    }
  }
  
  console.log('\n⚠️  Please run the following SQL in your Supabase SQL Editor:');
  console.log('```sql');
  console.log('ALTER TABLE public.staging_businesses');
  console.log('ADD COLUMN IF NOT EXISTS source_business_id text,');
  console.log('ADD COLUMN IF NOT EXISTS name_ar text,');
  console.log('ADD COLUMN IF NOT EXISTS name_ku text,');
  console.log('ADD COLUMN IF NOT EXISTS phone text,');
  console.log('ADD COLUMN IF NOT EXISTS whatsapp text,');
  console.log('ADD COLUMN IF NOT EXISTS city text,');
  console.log('ADD COLUMN IF NOT EXISTS address text;');
  console.log('```');
}

fixSchemaIndividual()
  .then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
