import express from 'express';
import cors from 'cors';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

app.use(cors());
app.use(express.json());

// Serve static files from public directory
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, '../public')));

// ============ UNIFIED PHONE NORMALIZATION ============
// SINGLE SOURCE OF TRUTH used everywhere
function normalizePhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return null;

  let normalized = phone.trim()
    .replace(/\s/g, '')
    .replace(/-/g, '')
    .replace(/,/g, '')
    .replace(/\./g, '');

  if (!normalized) return null;
  if (normalized.startsWith('+')) normalized = normalized.substring(1);
  normalized = normalized.replace(/[^\d]/g, '');
  if (!normalized) return null;

  // Rule 1: 07XXXXXXXXX (11 digits)
  if (normalized.length === 11 && normalized.startsWith('07')) {
    return '+964' + normalized.substring(1);
  }
  // Rule 2: 7XXXXXXXXX (10 digits)
  if (normalized.length === 10 && normalized.startsWith('7')) {
    return '+964' + normalized;
  }
  // Rule 3: 9647XXXXXXXXX (12 digits)
  if (normalized.length === 12 && normalized.startsWith('9647')) {
    return '+' + normalized;
  }
  // Rule 4: Already +964...
  if (normalized.length === 13 && normalized.startsWith('964')) {
    return '+' + normalized;
  }

  return null;
}

function isValidIraqiPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return false;
  const iraqiPattern = /^\+9647\d{9}$/;
  return iraqiPattern.test(normalized);
}

function detectLanguage(text) {
  if (!text || typeof text !== 'string') return 'unknown';
  const arabicRegex = /[\u0600-\u06FF]/g;
  const arabicMatches = text.match(arabicRegex);
  const kurdishKeywords = ['کورد', 'کردی', 'سۆرانی', 'کورمانجی', 'ئاراپی'];
  const isKurdishText = kurdishKeywords.some(k => text.includes(k));

  if (isKurdishText) return 'kurdish';
  if (arabicMatches && arabicMatches.length / text.length > 0.4) return 'arabic';
  return 'unknown';
}

// ============ VALIDATION ENDPOINT ============
app.post('/api/validate', async (req, res) => {
  try {
    const { source, csvData, singleContact } = req.body;

    let rows = [];
    if (source === 'csv') {
      rows = parse(csvData, { columns: true, skip_empty_lines: true });
    } else if (source === 'single') {
      rows = [{ phone: singleContact, name: 'Test Contact' }];
    } else if (source === 'supabase') {
      if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });
      const table = req.body.table || 'businesses';
      const { data, error } = await supabase.from(table).select('*');
      if (error) throw error;
      rows = data || [];
    }

    const results = {
      total: rows.length,
      valid: 0,
      invalid: 0,
      duplicates: 0,
      normalized_count: 0,
      invalid_reasons: {},
      contacts: []
    };

    const seenPhones = new Set();
    const normalized = [];

    for (const row of rows) {
      const phone_original = row.phone || '';
      const phone_normalized = normalizePhoneNumber(phone_original);
      const isValid = isValidIraqiPhone(phone_original);

      if (!isValid) {
        results.invalid++;
        const reason = !phone_normalized ? 'format_invalid' : 'not_iraqi_mobile';
        results.invalid_reasons[reason] = (results.invalid_reasons[reason] || 0) + 1;
        continue;
      }

      results.valid++;
      results.normalized_count++;

      if (seenPhones.has(phone_normalized)) {
        results.duplicates++;
        continue;
      }

      seenPhones.add(phone_normalized);
      normalized.push({
        business_name: row.name || row.business_name || 'N/A',
        phone_original,
        phone_normalized,
        language_detected: detectLanguage(row.name || row.business_name || ''),
        governorate: row.governorate || '',
        city: row.city || '',
        category: row.category || ''
      });
    }

    results.contacts = normalized.slice(0, 20);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ FLEXIBLE FIELD MAPPING ============
function mapBusinessRow(row) {
  // Map common field names to standard contact shape
  const name = row.business_name || row.name || row.arabic_name || 'Unknown';
  const phone = row.whatsapp || row.phone_1 || row.phone || row.phone_2 || '';

  return {
    id: row.id || Math.random().toString(),
    name: String(name).trim(),
    phone: String(phone).trim(),
    whatsapp: row.whatsapp ? String(row.whatsapp).trim() : undefined,
    category: row.category ? String(row.category).trim() : undefined,
    governorate: row.governorate ? String(row.governorate).trim() : undefined,
    city: row.city ? String(row.city).trim() : undefined,
  };
}

app.get('/api/contacts', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }

    const table = req.query.table || 'businesses';
    const cityFilter = req.query.city || '';
    const categoryFilter = req.query.category || '';
    const loadAll = req.query.loadAll === 'true';

    console.log(`[Supabase] Loading from table: ${table}, city: ${cityFilter}, category: ${categoryFilter}, loadAll: ${loadAll}`);

    // Build query
    let query = supabase.from(table).select('*');

    // Only apply filters if specific values selected (not "All")
    if (cityFilter && cityFilter !== '') {
      query = query.eq('city', cityFilter);
      console.log(`[Supabase] Applied city filter: ${cityFilter}`);
    }
    if (categoryFilter && categoryFilter !== '') {
      query = query.eq('category', categoryFilter);
      console.log(`[Supabase] Applied category filter: ${categoryFilter}`);
    }

    // Limit unless loadAll requested
    if (!loadAll) {
      query = query.limit(100);
      console.log(`[Supabase] Applied limit: 100 rows`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const rawCount = data ? data.length : 0;
    console.log(`[Supabase] Raw fetched: ${rawCount} rows`);

    // Show first 3 raw rows for debugging
    if (data && data.length > 0) {
      console.log('[Supabase] Sample raw rows:', JSON.stringify(data.slice(0, 3), null, 2));
    }

    // Map rows using flexible field mapping
    const mappedContacts = (data || []).map(mapBusinessRow);
    console.log(`[Supabase] Mapped: ${mappedContacts.length} rows`);

    // Show first 3 mapped rows
    if (mappedContacts.length > 0) {
      console.log('[Supabase] Sample mapped rows:', JSON.stringify(mappedContacts.slice(0, 3), null, 2));
    }

    // Validate phones
    let validCount = 0;
    let invalidCount = 0;
    const invalidReasons = {};

    mappedContacts.forEach(contact => {
      if (!contact.phone) {
        invalidCount++;
        invalidReasons['no_phone'] = (invalidReasons['no_phone'] || 0) + 1;
      } else if (!/^\+?9647\d{9}$|^07\d{9}$|^9647\d{9}$/.test(contact.phone.replace(/[\s-]/g, ''))) {
        invalidCount++;
        invalidReasons['invalid_format'] = (invalidReasons['invalid_format'] || 0) + 1;
      } else {
        validCount++;
      }
    });

    console.log(`[Supabase] Valid: ${validCount}, Invalid: ${invalidCount}`, invalidReasons);
    console.log(`[Supabase] First 3 invalid reasons:`, Object.keys(invalidReasons).slice(0, 3).map(k => `${k}: ${invalidReasons[k]}`));

    res.json({
      success: true,
      contacts: mappedContacts,
      totalCount: count || rawCount,
      loadedCount: mappedContacts.length,
      isPartial: !loadAll && mappedContacts.length >= 100,
      validCount,
      invalidCount,
      invalidReasons
    });
  } catch (error) {
    console.error('[Supabase] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ DRY RUN (no actual sends) ============
app.post('/api/dry-run', async (req, res) => {
  try {
    const { source, csvData, message, singleContact, table } = req.body;

    let rows = [];
    if (source === 'csv') {
      rows = parse(csvData, { columns: true, skip_empty_lines: true });
    } else if (source === 'single') {
      rows = [{ phone: singleContact, name: 'Test' }];
    } else if (source === 'supabase') {
      if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });
      const { data, error } = await supabase.from(table || 'businesses').select('*');
      if (error) throw error;
      rows = data || [];
    }

    const results = {
      would_send: 0,
      would_skip: 0,
      invalid: 0,
      summary: []
    };

    const seenPhones = new Set();
    const logs = [];

    for (const row of rows) {
      const phone_original = row.phone || '';
      const phone_normalized = normalizePhoneNumber(phone_original);
      const isValid = isValidIraqiPhone(phone_original);
      const business_name = row.name || row.business_name || 'N/A';

      let status = 'would_send';
      let reason = null;

      if (!isValid) {
        status = 'would_skip';
        reason = 'invalid_format';
        results.invalid++;
      } else if (seenPhones.has(phone_normalized)) {
        status = 'would_skip';
        reason = 'duplicate_batch';
        results.would_skip++;
      } else {
        seenPhones.add(phone_normalized);
        results.would_send++;
      }

      if (status === 'would_skip' && reason) {
        results.would_skip++;
      }

      logs.push({
        phone: phone_normalized || phone_original,
        business_name,
        status,
        reason
      });
    }

    results.summary = logs.slice(0, 10);
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ REAL SEND ============
app.post('/api/send', async (req, res) => {
  try {
    const { source, csvData, message, singleContact, campaignId, table } = req.body;

    let rows = [];
    if (source === 'csv') {
      rows = parse(csvData, { columns: true, skip_empty_lines: true });
    } else if (source === 'single') {
      rows = [{ phone: singleContact, name: 'Test' }];
    } else if (source === 'supabase') {
      if (!supabase) return res.status(500).json({ success: false, error: 'Supabase not configured' });
      const { data, error } = await supabase.from(table || 'businesses').select('*');
      if (error) throw error;
      rows = data || [];
    }

    const results = {
      sent: 0,
      failed: 0,
      skipped: 0,
      logs: []
    };

    const NABDA_API_URL = process.env.NABDA_API_URL || 'https://api.nabdaotp.com';
    const NABDA_API_TOKEN = process.env.NABDA_API_TOKEN;
    const seenPhones = new Set();
    const campaignKey = campaignId || message.substring(0, 50);

    for (const row of rows) {
      const phone_original = row.phone || '';
      const phone_normalized = normalizePhoneNumber(phone_original);
      const business_name = row.name || row.business_name || 'N/A';

      // Validate
      if (!isValidIraqiPhone(phone_original)) {
        results.skipped++;
        results.logs.push({
          phone: phone_original,
          business_name,
          status: 'skipped',
          reason: 'invalid_format',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      // Check duplicates in batch
      if (seenPhones.has(phone_normalized)) {
        results.skipped++;
        results.logs.push({
          phone: phone_normalized,
          business_name,
          status: 'skipped',
          reason: 'duplicate_batch',
          timestamp: new Date().toISOString()
        });
        continue;
      }

      seenPhones.add(phone_normalized);

      // Render message (replace placeholders)
      let rendered_message = message;
      rendered_message = rendered_message.replace(/\{\{name\}\}/g, row.name || row.business_name || 'Hello');
      rendered_message = rendered_message.replace(/\{\{governorate\}\}/g, row.governorate || '');
      rendered_message = rendered_message.replace(/\{\{category\}\}/g, row.category || '');
      rendered_message = rendered_message.replace(/\{\{phone\}\}/g, phone_normalized);

      // Send via Nabda
      let sendStatus = 'failed';
      let errorReason = null;

      try {
        const payload = {
          phone: phone_normalized,
          message: rendered_message
        };

        const response = await fetch(`${NABDA_API_URL}/api/v1/messages/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NABDA_API_TOKEN}`
          },
          body: JSON.stringify(payload)
        });

        if (response.ok) {
          sendStatus = 'sent';
          results.sent++;
        } else {
          errorReason = `HTTP ${response.status}`;
          results.failed++;
        }
      } catch (err) {
        errorReason = err.message;
        results.failed++;
      }

      // Log to Supabase
      if (supabase) {
        try {
          await supabase.from('message_logs').insert({
            phone: phone_normalized,
            business_name,
            message: rendered_message,
            status: sendStatus,
            error_reason: errorReason,
            campaign_key: campaignKey,
            language_detected: detectLanguage(business_name),
            sent_at: new Date().toISOString()
          });
        } catch (logErr) {
          console.error('Log error:', logErr);
        }
      }

      results.logs.push({
        phone: phone_normalized,
        business_name,
        status: sendStatus,
        reason: errorReason,
        timestamp: new Date().toISOString()
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tables', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.' });
    }
    const commonTables = ['businesses', 'business', 'staging_businesses', 'contacts', 'users', 'customers', 'leads', 'subscribers', 'clients', 'members', 'profiles', 'accounts'];
    const foundTables = [];
    
    for (const table of commonTables) {
      try {
        const { count, error: countError } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        if (!countError) {
          foundTables.push({ name: table, count: count || 0 });
        }
      } catch (e) {
        // Table doesn't exist or access denied, skip
      }
    }
    
    if (foundTables.length === 0) {
      res.json({ success: true, tables: [], message: 'No common table names found. Please check your Supabase dashboard for the exact table name.' });
    } else {
      res.json({ success: true, tables: foundTables });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/responses', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.' });
    }
    const { data, error } = await supabase
      .from('responses')
      .select('*, contacts(phone, name)')
      .order('received_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ success: true, responses: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/copy-contacts', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.' });
    }
    const { sourceTable } = req.body;
    
    const { data: sourceData, error: sourceError } = await supabase
      .from(sourceTable)
      .select('*');

    if (sourceError) throw sourceError;
    
    if (!sourceData || sourceData.length === 0) {
      res.json({ success: false, error: 'No contacts found in source table' });
      return;
    }

    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('phone');

    const existingPhones = new Set(existingContacts?.map(c => c.phone) || []);
    const newContacts = sourceData.filter(c => !existingPhones.has(c.phone));
    
    const { error: insertError } = await supabase
      .from('contacts')
      .insert(newContacts);

    if (insertError) throw insertError;

    res.json({ 
      success: true, 
      message: `Copied ${newContacts.length} contacts to contacts table`,
      total: sourceData.length,
      duplicates: sourceData.length - newContacts.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Export for development
export default app;

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
