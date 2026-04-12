import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const TARGET_URL = 'https://ujdsxzvvgaugypwtugdl.supabase.co';
const TARGET_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVqZHN4enZ2Z2F1Z3lwd3R1Z2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM3NDc2NiwiZXhwIjoyMDkwOTUwNzY2fQ.-t2egD15jUCt77X4IXG_ROksAj8xh4IDqt6A8l1lE_c';

const targetClient = createClient(TARGET_URL, TARGET_SERVICE_KEY);

async function auditFilters() {
  console.log('🔍 Auditing Filter Correctness...\n');
  
  try {
    // Get all contacts from staging_businesses
    console.log('📥 Fetching all contacts from staging_businesses...');
    let allContacts = [];
    let fromIndex = 0;
    const PAGE_SIZE = 1000;
    let hasMore = true;
    
    while (hasMore) {
      const { data: contacts } = await targetClient
        .from('staging_businesses')
        .select('city, category')
        .range(fromIndex, fromIndex + PAGE_SIZE - 1);
      
      if (contacts && contacts.length > 0) {
        allContacts = [...allContacts, ...contacts];
        console.log(`📄 Fetched ${contacts.length} contacts (total: ${allContacts.length})`);
        fromIndex += PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }
    
    console.log(`\n✅ Total contacts: ${allContacts.length}\n`);
    
    // Get unique cities and categories
    const cities = [...new Set(allContacts.map(c => c.city).filter(Boolean))].sort();
    const categories = [...new Set(allContacts.map(c => c.category).filter(Boolean))].sort();
    
    console.log(`📋 Unique cities: ${cities.length}`);
    console.log(`📋 Unique categories: ${categories.length}\n`);
    
    // Test server-side filtering
    console.log('🧪 Testing server-side filtering...\n');
    
    // Test 1: Filter by city
    if (cities.length > 0) {
      const testCity = cities[0];
      console.log(`Test 1: Filter by city "${testCity}"`);
      const { data: cityFiltered, error: cityError } = await targetClient
        .from('staging_businesses')
        .select('*')
        .eq('city', testCity)
        .limit(5);
      
      if (cityError) {
        console.log(`❌ City filter error:`, cityError.message);
      } else {
        console.log(`✅ City filter returned ${cityFiltered?.length || 0} rows`);
        if (cityFiltered && cityFiltered.length > 0) {
          console.log(`📋 Sample: ${cityFiltered[0].city} - ${cityFiltered[0].name || 'No name'}`);
        }
      }
    }
    
    // Test 2: Filter by category
    if (categories.length > 0) {
      const testCategory = categories[0];
      console.log(`\nTest 2: Filter by category "${testCategory}"`);
      const { data: categoryFiltered, error: categoryError } = await targetClient
        .from('staging_businesses')
        .select('*')
        .eq('category', testCategory)
        .limit(5);
      
      if (categoryError) {
        console.log(`❌ Category filter error:`, categoryError.message);
      } else {
        console.log(`✅ Category filter returned ${categoryFiltered?.length || 0} rows`);
        if (categoryFiltered && categoryFiltered.length > 0) {
          console.log(`📋 Sample: ${categoryFiltered[0].category} - ${categoryFiltered[0].name || 'No name'}`);
        }
      }
    }
    
    // Test 3: Combined city + category filter
    if (cities.length > 0 && categories.length > 0) {
      const testCity = cities[0];
      const testCategory = categories[0];
      console.log(`\nTest 3: Combined city "${testCity}" + category "${testCategory}"`);
      const { data: combinedFiltered, error: combinedError } = await targetClient
        .from('staging_businesses')
        .select('*')
        .eq('city', testCity)
        .eq('category', testCategory)
        .limit(5);
      
      if (combinedError) {
        console.log(`❌ Combined filter error:`, combinedError.message);
      } else {
        console.log(`✅ Combined filter returned ${combinedFiltered?.length || 0} rows`);
        if (combinedFiltered && combinedFiltered.length > 0) {
          console.log(`📋 Sample: ${combinedFiltered[0].city} - ${combinedFiltered[0].category} - ${combinedFiltered[0].name || 'No name'}`);
        }
      }
    }
    
    // Sample counts for 3 combinations
    console.log('\n📊 Sample counts for 3 combinations:\n');
    let count = 0;
    for (let i = 0; i < Math.min(3, cities.length); i++) {
      for (let j = 0; j < Math.min(2, categories.length); j++) {
        if (count >= 3) break;
        const { data: comboData } = await targetClient
          .from('staging_businesses')
          .select('*', { count: 'exact', head: true })
          .eq('city', cities[i])
          .eq('category', categories[j]);
        
        console.log(`  ${cities[i]} + ${categories[j]}: ${comboData || 0} contacts`);
        count++;
      }
      if (count >= 3) break;
    }
    
    console.log('\n✅ Filter audit completed!');
    
    return {
      totalContacts: allContacts.length,
      uniqueCities: cities.length,
      uniqueCategories: categories.length,
      cityFilterWorks: cities.length > 0,
      categoryFilterWorks: categories.length > 0,
      combinedFilterWorks: cities.length > 0 && categories.length > 0
    };
    
  } catch (error) {
    console.error('❌ Audit failed:', error);
    throw error;
  }
}

auditFilters()
  .then(() => {
    console.log('\n✅ Filter audit completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
