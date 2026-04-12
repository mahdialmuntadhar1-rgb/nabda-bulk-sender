import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function fixPhones() {
  console.log('🔧 Fixing phone numbers...\n');
  
  try {
    // Get all contacts
    let allContacts = [];
    let fromIndex = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: contacts } = await targetClient
        .from('contacts')
        .select('*')
        .range(fromIndex, fromIndex + PAGE_SIZE - 1);
      
      if (contacts && contacts.length > 0) {
        allContacts = [...allContacts, ...contacts];
        console.log(`📄 Fetched ${contacts.length} contacts (total: ${allContacts.length})`);
        fromIndex += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`\n✅ Total contacts to process: ${allContacts.length}\n`);
    
    // Fix phone numbers - take first phone if multiple
    let fixedCount = 0;
    const updates = [];
    
    allContacts.forEach(contact => {
      if (contact.phone && contact.phone.includes(',')) {
        // Take first phone, remove spaces and dashes
        const firstPhone = contact.phone.split(',')[0].trim().replace(/-/g, '').replace(/\s/g, '');
        // Normalize to +964 format if it starts with 07
        const normalizedPhone = firstPhone.startsWith('07') ? '+964' + firstPhone.substring(1) : firstPhone;
        
        updates.push({
          id: contact.id,
          phone: normalizedPhone,
          whatsapp: contact.whatsapp ? contact.whatsapp.split(',')[0].trim().replace(/-/g, '').replace(/\s/g, '') : normalizedPhone
        });
        fixedCount++;
      }
    });
    
    console.log(`🔧 Found ${fixedCount} contacts with multiple phones\n`);
    
    // Update contacts in batches
    const BATCH_SIZE = 100;
    let updatedCount = 0;
    
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      console.log(`📤 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(updates.length / BATCH_SIZE)}...`);
      
      for (const update of batch) {
        const { error } = await targetClient
          .from('contacts')
          .update({ phone: update.phone, whatsapp: update.whatsapp })
          .eq('id', update.id);
        
        if (error) {
          console.error(`❌ Error updating contact ${update.id}:`, error);
        } else {
          updatedCount++;
        }
      }
      
      console.log(`✅ Updated batch ${Math.floor(i / BATCH_SIZE) + 1}`);
    }
    
    console.log(`\n✅ Updated ${updatedCount} contacts\n`);
    
    // Verify the fix
    console.log('🔍 Verifying fix...');
    const { data: sampleContacts } = await targetClient
      .from('contacts')
      .select('phone, name')
      .limit(10);
    
    console.log('\n📋 Sample fixed phones:\n');
    sampleContacts.forEach(c => {
      console.log(`  ${c.phone} - ${c.name || 'No name'}`);
    });
    
  } catch (error) {
    console.error('❌ Fix failed:', error);
    throw error;
  }
}

fixPhones()
  .then(() => {
    console.log('\n✅ Phone fix completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
