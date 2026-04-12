import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Target Supabase (CURRENT APP)
const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function populateContacts() {
  console.log('🚀 Populating contacts table from staging_businesses...');
  
  try {
    // Fetch all businesses from staging_businesses (with pagination)
    console.log('📥 Fetching businesses from staging_businesses...');
    let allBusinesses = [];
    let fromIndex = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: businesses, error: fetchError } = await targetClient
        .from('staging_businesses')
        .select('*')
        .range(fromIndex, fromIndex + PAGE_SIZE - 1);
      
      if (fetchError) {
        console.error('❌ Error fetching from staging_businesses:', fetchError);
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
    
    console.log(`✅ Found ${allBusinesses.length} businesses in staging_businesses`);
    
    // Transform to contacts format
    console.log('🔄 Transforming data to contacts format...');
    const contacts = allBusinesses
      .filter(b => b.phone) // Only include businesses with phone numbers
      .map(business => ({
        name: business.name || business.name_ar || business.name_ku || '',
        phone: business.phone || '',
        whatsapp: business.whatsapp || business.phone || '',
        category: business.category || '',
        governorate: business.governorate || '',
        city: business.city || ''
      }));
    
    console.log(`✅ Transformed ${contacts.length} contacts (filtered for phone numbers)`);
    
    // Batch insert into contacts (500 rows at a time)
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
      const batch = contacts.slice(i, i + BATCH_SIZE);
      console.log(`📤 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(contacts.length / BATCH_SIZE)} (${batch.length} rows)...`);
      
      try {
        const { error: insertError } = await targetClient
          .from('contacts')
          .upsert(batch, { onConflict: 'phone' });
        
        if (insertError) {
          console.error(`❌ Error inserting batch ${Math.floor(i / BATCH_SIZE) + 1}:`, insertError);
          totalSkipped += batch.length;
        } else {
          totalInserted += batch.length;
          console.log(`✅ Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}`);
        }
      } catch (batchError) {
        console.error(`❌ Batch error:`, batchError);
        totalSkipped += batch.length;
      }
    }
    
    console.log('\n📊 Contacts Population Summary:');
    console.log(`✅ Total businesses processed: ${allBusinesses.length}`);
    console.log(`✅ Total contacts with phone: ${contacts.length}`);
    console.log(`✅ Total inserted: ${totalInserted}`);
    console.log(`⚠️  Total skipped: ${totalSkipped}`);
    
    // Verify the population
    console.log('\n🔍 Verifying contacts population...');
    const { count: contactsCount, error: countError } = await targetClient
      .from('contacts')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      console.error('❌ Error counting contacts:', countError);
    } else {
      console.log(`✅ Total contacts in contacts table: ${contactsCount}`);
    }
    
    console.log('\n✅ Contacts population completed successfully!');
    
  } catch (error) {
    console.error('❌ Contacts population failed:', error);
    throw error;
  }
}

// Run the population
populateContacts()
  .then(() => {
    console.log('🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
