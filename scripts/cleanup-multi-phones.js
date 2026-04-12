import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

function normalizePhone(phone) {
  if (!phone) return null;
  
  let normalized = phone.trim().replace(/[\s\-\(\)]/g, '');
  
  if (normalized.startsWith('07')) {
    normalized = '+964' + normalized.substring(1);
  }
  
  const iraqiMobilePattern = /^\+9647\d{8,9}$/;
  
  if (iraqiMobilePattern.test(normalized)) {
    return normalized;
  }
  
  return null;
}

async function cleanupMultiPhones() {
  console.log('🔧 Cleaning multi-phone contacts...\n');
  
  try {
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
    
    console.log(`\n✅ Total contacts before cleanup: ${allContacts.length}\n`);
    
    const multiPhoneContacts = allContacts.filter(c => c.phone && c.phone.includes(','));
    const singlePhoneContacts = allContacts.filter(c => !c.phone || !c.phone.includes(','));
    
    console.log(`📊 Multi-phone contacts: ${multiPhoneContacts.length}`);
    console.log(`📊 Single-phone contacts: ${singlePhoneContacts.length}\n`);
    
    const newContacts = [];
    const invalidContacts = [];
    const normalizedPhones = new Set();
    const duplicates = [];
    
    multiPhoneContacts.forEach(contact => {
      const phones = contact.phone.split(',').map(p => p.trim());
      let validPhoneCount = 0;
      
      phones.forEach(phone => {
        const normalized = normalizePhone(phone);
        
        if (normalized) {
          if (normalizedPhones.has(normalized)) {
            duplicates.push({ phone: normalized, original: contact.phone });
            return;
          }
          
          normalizedPhones.add(normalized);
          
          newContacts.push({
            phone: normalized,
            name: contact.name || '',
            whatsapp: normalized,
            city: contact.city || '',
            governorate: contact.governorate || '',
            category: contact.category || '',
            opt_in: contact.opt_in || false
          });
          
          validPhoneCount++;
        } else {
          invalidContacts.push({ phone, original: contact.phone });
        }
      });
    });
    
    console.log(`\n📊 New valid contacts: ${newContacts.length}`);
    console.log(`📊 Invalid contacts: ${invalidContacts.length}`);
    console.log(`📊 Duplicates removed: ${duplicates.length}\n`);
    
    const BATCH_SIZE = 100;
    let insertedCount = 0;
    
    console.log('📤 Inserting new contacts...');
    for (let i = 0; i < newContacts.length; i += BATCH_SIZE) {
      const batch = newContacts.slice(i, i + BATCH_SIZE);
      console.log(`📤 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(newContacts.length / BATCH_SIZE)}...`);
      
      const { error } = await targetClient.from('contacts').insert(batch);
      
      if (error) {
        console.error(`❌ Batch error:`, error);
      } else {
        insertedCount += batch.length;
        console.log(`✅ Inserted batch ${Math.floor(i / BATCH_SIZE) + 1}`);
      }
    }
    
    console.log(`\n✅ Inserted ${insertedCount} new contacts\n`);
    
    const multiPhoneIds = multiPhoneContacts.map(c => c.id);
    console.log(`🗑️  Deleting ${multiPhoneIds.length} multi-phone contacts...`);
    
    const { error: deleteError } = await targetClient
      .from('contacts')
      .delete()
      .in('id', multiPhoneIds);
    
    if (deleteError) {
      console.error('❌ Delete error:', deleteError);
    } else {
      console.log(`✅ Deleted ${multiPhoneIds.length} multi-phone contacts\n`);
    }
    
    const { count: finalCount } = await targetClient
      .from('contacts')
      .select('*', { count: 'exact', head: true });
    
    console.log('📊 CLEANUP SUMMARY:');
    console.log(`  Before: ${allContacts.length}`);
    console.log(`  After: ${finalCount}`);
    console.log(`  New valid contacts: ${newContacts.length}`);
    console.log(`  Invalid contacts removed: ${invalidContacts.length}`);
    console.log(`  Duplicates removed: ${duplicates.length}`);
    console.log(`  Multi-phone rows deleted: ${multiPhoneIds.length}`);
    
    return {
      before: allContacts.length,
      after: finalCount,
      newValid: newContacts.length,
      invalidRemoved: invalidContacts.length,
      duplicatesRemoved: duplicates.length,
      multiPhoneDeleted: multiPhoneIds.length
    };
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    throw error;
  }
}

cleanupMultiPhones()
  .then(() => {
    console.log('\n✅ Multi-phone cleanup completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
