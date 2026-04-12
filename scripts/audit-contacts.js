import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// Target Supabase (CURRENT APP)
const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function auditContactsQuality() {
  console.log('🔍 Auditing Contacts Table Quality...\n');
  
  try {
    // Get all contacts with pagination
    console.log('📥 Fetching all contacts...');
    let allContacts = [];
    let fromIndex = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: contacts, error: fetchError } = await targetClient
        .from('contacts')
        .select('*')
        .range(fromIndex, fromIndex + PAGE_SIZE - 1);
      
      if (fetchError) {
        console.error('❌ Error fetching contacts:', fetchError);
        throw fetchError;
      }
      
      if (contacts && contacts.length > 0) {
        allContacts = [...allContacts, ...contacts];
        console.log(`📄 Fetched ${contacts.length} contacts (total: ${allContacts.length})`);
        fromIndex += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`\n✅ Total contacts: ${allContacts.length}\n`);
    
    // Audit findings
    const nullNames = allContacts.filter(c => !c.name || c.name.trim() === '');
    const nullPhones = allContacts.filter(c => !c.phone || c.phone.trim() === '');
    const nullWhatsapp = allContacts.filter(c => !c.whatsapp || c.whatsapp.trim() === '');
    
    // Check for duplicate phones
    const phoneMap = new Map();
    const duplicatePhones = [];
    allContacts.forEach(c => {
      const normalizedPhone = c.phone?.trim().replace(/\s/g, '');
      if (phoneMap.has(normalizedPhone)) {
        duplicatePhones.push({ phone: c.phone, existing: phoneMap.get(normalizedPhone) });
      } else {
        phoneMap.set(normalizedPhone, c.phone);
      }
    });
    
    // Check for invalid Iraqi phone formats
    const invalidPhones = allContacts.filter(c => {
      const phone = c.phone?.trim().replace(/\s/g, '');
      // Iraqi phone format: +9647XXXXXXXXX or 07XXXXXXXXX
      const validIraqiPattern = /^(\+9647\d{8,9}|07\d{8,9})$/;
      return phone && !validIraqiPattern.test(phone);
    });
    
    // Check for placeholder/junk data
    const junkRows = allContacts.filter(c => {
      const name = c.name?.trim().toLowerCase() || '';
      const phone = c.phone?.trim() || '';
      return name.includes('test') || name.includes('sample') || 
             phone.includes('00000000') || phone.includes('11111111') ||
             name.length < 2 || phone.length < 5;
    });
    
    // Sample rows for inspection
    const sampleRows = allContacts.slice(0, 30);
    
    // Output findings
    console.log('📊 AUDIT FINDINGS:\n');
    console.log(`❌ Null names: ${nullNames.length} (${((nullNames.length / allContacts.length) * 100).toFixed(2)}%)`);
    console.log(`❌ Null phones: ${nullPhones.length} (${((nullPhones.length / allContacts.length) * 100).toFixed(2)}%)`);
    console.log(`❌ Null whatsapp: ${nullWhatsapp.length} (${((nullWhatsapp.length / allContacts.length) * 100).toFixed(2)}%)`);
    console.log(`⚠️  Duplicate phones: ${duplicatePhones.length}`);
    console.log(`❌ Invalid Iraqi phone formats: ${invalidPhones.length} (${((invalidPhones.length / allContacts.length) * 100).toFixed(2)}%)`);
    console.log(`⚠️  Junk/placeholder rows: ${junkRows.length}\n`);
    
    console.log('📋 SAMPLE ROWS (first 30):\n');
    sampleRows.forEach((c, i) => {
      console.log(`${i + 1}. Phone: ${c.phone || 'NULL'} | Name: ${c.name || 'NULL'} | City: ${c.city || 'NULL'} | Category: ${c.category || 'NULL'} | WhatsApp: ${c.whatsapp || 'NULL'}`);
    });
    
    // Column structure
    console.log('\n📋 EXACT COLUMNS IN CONTACTS:\n');
    if (allContacts.length > 0) {
      Object.keys(allContacts[0]).forEach(col => {
        console.log(`  - ${col}`);
      });
    }
    
    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:\n');
    if (nullNames.length > 0) console.log(`  ⚠️  Remove ${nullNames.length} rows with null names`);
    if (nullPhones.length > 0) console.log(`  ⚠️  Remove ${nullPhones.length} rows with null phones`);
    if (invalidPhones.length > 0) console.log(`  ⚠️  Review ${invalidPhones.length} rows with invalid phone formats`);
    if (duplicatePhones.length > 0) console.log(`  ⚠️  Remove ${duplicatePhones.length} duplicate phone rows`);
    if (junkRows.length > 0) console.log(`  ⚠️  Review ${junkRows.length} potential junk rows`);
    
    return {
      totalContacts: allContacts.length,
      nullNames: nullNames.length,
      nullPhones: nullPhones.length,
      nullWhatsapp: nullWhatsapp.length,
      duplicatePhones: duplicatePhones.length,
      invalidPhones: invalidPhones.length,
      junkRows: junkRows.length,
      sampleRows: sampleRows,
      columns: allContacts.length > 0 ? Object.keys(allContacts[0]) : []
    };
    
  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  }
}

auditContactsQuality()
  .then(() => {
    console.log('\n✅ Audit completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
