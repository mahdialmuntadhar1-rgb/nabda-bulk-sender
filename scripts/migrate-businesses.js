import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Source Supabase (HAS DATA - ~3,600+ businesses)
const SOURCE_URL = 'https://hsadukhmcclwixuntqwu.supabase.co';
const SOURCE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzYWR1a2htY2Nsd2l4dW50cXd1Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzA4MzM2OCwiZXhwIjoyMDg4NjU5MzY4fQ.2YpuPKrlv4jQNG-5dDlnzWzFqjqRbO_bxXksWh4PRZY';

// Target Supabase (CURRENT APP)
const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const sourceClient = createClient(SOURCE_URL, SOURCE_SERVICE_KEY);
const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function migrateBusinesses() {
  console.log('🚀 Starting business migration...');
  
  try {
    // Step 1: Fetch all businesses from source (with pagination)
    console.log('📥 Fetching businesses from source project...');
    let allBusinesses = [];
    let fromIndex = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: businesses, error: fetchError } = await sourceClient
        .from('businesses')
        .select('*')
        .range(fromIndex, fromIndex + PAGE_SIZE - 1);
      
      if (fetchError) {
        console.error('❌ Error fetching from source:', fetchError);
        throw fetchError;
      }
      
      if (businesses && businesses.length > 0) {
        allBusinesses = [...allBusinesses, ...businesses];
        console.log(`📄 Fetched ${businesses.length} businesses (total: ${allBusinesses.length})`);
        fromIndex += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`✅ Found ${allBusinesses.length} businesses in source`);
    
    // Step 2: Transform and prepare data
    console.log('🔄 Transforming data...');
    const transformedBusinesses = allBusinesses.map(business => {
      // Map fields safely with fallbacks
      return {
        source_business_id: business.id?.toString() || null,
        source: 'migration', // Add default value for source column
        name: business.name || business.business_name || business.nameAr || business.nameKu || '',
        name_ar: business.nameAr || business.name || '',
        name_ku: business.nameKu || business.name || '',
        phone: business.phone || business.phone_1 || business.whatsapp || '',
        whatsapp: business.whatsapp || business.phone || business.phone_1 || '',
        city: business.city || '',
        address: business.address || '',
        // Preserve existing fields
        category: business.category || '',
        governorate: business.governorate || '',
        // Add any other fields that exist
        ...(business.business_name && { business_name: business.business_name }),
        ...(business.phone_1 && { phone_1: business.phone_1 }),
      };
    });
    
    console.log(`✅ Transformed ${transformedBusinesses.length} businesses`);
    
    // Step 3: Batch insert into target (500 rows at a time)
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < transformedBusinesses.length; i += BATCH_SIZE) {
      const batch = transformedBusinesses.slice(i, i + BATCH_SIZE);
      console.log(`📤 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(transformedBusinesses.length / BATCH_SIZE)} (${batch.length} rows)...`);
      
      try {
        const { error: insertError } = await targetClient
          .from('staging_businesses')
          .upsert(batch, { onConflict: 'source_business_id' });
        
        if (insertError) {
          console.error(`❌ Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, insertError);
        } else {
          totalInserted += batch.length;
          console.log(`✅ Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        }
      } catch (batchError) {
        console.error(`❌ Batch error:`, batchError);
        totalSkipped += batch.length;
      }
    }
    
    console.log('\n📊 Migration Summary:');
    console.log(`✅ Total businesses processed: ${allBusinesses.length}`);
    console.log(`✅ Total inserted: ${totalInserted}`);
    console.log(`⚠️  Total skipped: ${totalSkipped}`);
    
    // Step 4: Verify the migration
    console.log('\n🔍 Verifying migration...');
    const { count: targetCount, error: countError } = await targetClient
      .from('staging_businesses')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Error counting target records:', countError);
    } else {
      console.log(`✅ Total businesses in target staging_businesses: ${targetCount}`);
    }
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

// Run the migration
migrateBusinesses()
  .then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
