import express from 'express';
import cors from 'cors';
import { parse } from 'csv-parse/sync';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Shared phone normalization helper - must match frontend exactly
function normalizePhoneNumber(phone) {
  if (!phone) return null;
  
  let normalized = phone.trim().replace(/-/g, '').replace(/\s/g, '').replace(/,/g, '');
  
  // Convert 07XXXXXXXXX to +9647XXXXXXXXX
  if (normalized.startsWith('07')) {
    normalized = '+964' + normalized.substring(1);
  }
  
  return normalized;
}

// Validate Iraqi mobile format
function isValidIraqiPhone(phone) {
  const iraqiMobilePattern = /^\+9647\d{9}$/;
  return iraqiMobilePattern.test(phone);
}

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/contacts', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.' });
    }
    
    // Auto-correct common table name mistakes
    let table = req.query.table || 'businesses';
    if (table === 'business' || table === 'contact') {
      table = table + 'es';
    }
    
    const cityFilter = req.query.city;
    const categoryFilter = req.query.category;
    const loadAll = req.query.loadAll === 'true';
    
    // Get total count first
    let countQuery = supabase.from(table).select('*', { count: 'exact', head: true });
    
    if (cityFilter) {
      countQuery = countQuery.eq('city', cityFilter);
    }
    
    if (categoryFilter) {
      countQuery = countQuery.eq('category', categoryFilter);
    }
    
    const { count: totalCount, error: countError } = await countQuery;
    
    if (countError) {
      // Handle table not found specifically
      if (countError.message.includes('Could not find the table') || countError.message.includes('does not exist')) {
        return res.status(404).json({ 
          success: false, 
          error: `Table '${table}' not found. Please use 'businesses' table.`,
          availableTables: ['businesses']
        });
      }
      throw countError;
    }
    
    let data = [];
    let loadedCount = 0;
    
    if (loadAll && totalCount > 0) {
      // Fetch all rows using pagination (1000 rows per page is Supabase default)
      const pageSize = 1000;
      const totalPages = Math.ceil(totalCount / pageSize);
      
      for (let page = 0; page < totalPages; page++) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        
        let query = supabase.from(table).select('*').range(from, to);
        
        if (cityFilter) {
          query = query.eq('city', cityFilter);
        }
        
        if (categoryFilter) {
          query = query.eq('category', categoryFilter);
        }
        
        const { data: pageData, error: pageError } = await query;
        
        if (pageError) throw pageError;
        
        if (pageData) {
          data = data.concat(pageData);
          loadedCount = data.length;
        }
      }
    } else {
      // Default: load first 1000 rows only
      let query = supabase.from(table).select('*').limit(1000);
      
      if (cityFilter) {
        query = query.eq('city', cityFilter);
      }
      
      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }
      
      const { data: defaultData, error: defaultError } = await query;
      
      if (defaultError) throw defaultError;
      
      data = defaultData || [];
      loadedCount = data.length;
    }
    
    res.json({ 
      success: true, 
      contacts: data || [], 
      totalCount: totalCount || 0,
      loadedCount: loadedCount,
      isPartial: loadedCount < (totalCount || 0)
    });
  } catch (error) {
    console.error('API Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const { source, csvData, message, ctaType, singleContact, campaignId, contacts, skipPreviouslyContacted, messageDelay, randomDelay } = req.body;

    let recipients = [];

    if (source === 'single') {
      recipients = [singleContact];
    } else if (source === 'supabase') {
      if (!supabase) {
        return res.status(500).json({ success: false, error: 'Supabase not configured' });
      }
      // If contacts array is provided (from batch sending), use it
      if (contacts && contacts.length > 0) {
        recipients = contacts;
      } else {
        // Otherwise load from table
        const table = req.body.table || 'businesses';
        const { data, error } = await supabase.from(table).select('*');
        if (error) throw error;
        recipients = data || [];
      }
    } else {
      // CSV source - parse the data
      if (contacts && contacts.length > 0) {
        recipients = contacts;
      } else {
        recipients = parse(csvData, { columns: true, skip_empty_lines: true });
        recipients = recipients.filter(r => r.opt_in === 'true' || r.opt_in === '1' || r.opt_in === 'yes');
      }
    }

    const results = [];
    const NABDA_API_URL = process.env.NABDA_API_URL || 'https://api.nabdaotp.com';
    const NABDA_API_TOKEN = process.env.NABDA_API_TOKEN;
    const sentPhones = new Set();
    const campaignKey = campaignId || message.substring(0, 50);
    
    // If skipPreviouslyContacted is enabled, fetch previously contacted phones
    const previouslyContactedPhones = new Set();
    if (skipPreviouslyContacted && supabase) {
      try {
        const { data: previousLogs } = await supabase
          .from('message_logs')
          .select('normalized_phone')
          .eq('status', 'sent')
          .neq('campaign_key', campaignKey);
        
        if (previousLogs) {
          previousLogs.forEach(log => {
            if (log.normalized_phone) {
              previouslyContactedPhones.add(log.normalized_phone);
            }
          });
        }
      } catch (checkError) {
        console.error('Error fetching previously contacted phones:', checkError);
      }
    }

    for (const recipient of recipients) {
      let phone = normalizePhoneNumber(recipient.phone);
      let skipReason = null;
      
      // Skip if no phone after normalization
      if (!phone) {
        skipReason = 'invalid_phone';
        const originalPhone = recipient.phone || 'NULL';
        results.push({ phone: originalPhone, status: 'skipped', response: { message: 'No valid phone' } });

        if (supabase) {
          try {
            await supabase.from('message_logs').insert({
              phone: originalPhone,
              normalized_phone: originalPhone,
              message: message,
              cta_type: ctaType,
              status: 'skipped',
              error_reason: skipReason,
              campaign_key: campaignKey,
              sent_at: new Date().toISOString(),
              attempted_at: new Date().toISOString()
            });
          } catch (logError) {
            console.error('Failed to log to Supabase:', logError);
          }
        }
        continue;
      }
      
      // Skip if not valid Iraq mobile format
      if (!isValidIraqiPhone(phone)) {
        skipReason = 'invalid_phone';
        results.push({ phone, status: 'skipped', response: { message: 'Invalid Iraq mobile format' } });
        
        if (supabase) {
          try {
            await supabase.from('message_logs').insert({
              phone: phone,
              normalized_phone: phone,
              message: message,
              cta_type: ctaType,
              status: 'skipped',
              error_reason: skipReason,
              campaign_key: campaignKey,
              sent_at: new Date().toISOString(),
              attempted_at: new Date().toISOString()
            });
          } catch (logError) {
            console.error('Failed to log to Supabase:', logError);
          }
        }
        continue;
      }
      
      // Skip if previously contacted (if enabled)
      if (skipPreviouslyContacted && previouslyContactedPhones.has(phone)) {
        skipReason = 'duplicate_previous';
        results.push({ phone, status: 'skipped', response: { message: 'This number was already contacted in a previous campaign or earlier in this session.' } });
        
        if (supabase) {
          try {
            await supabase.from('message_logs').insert({
              phone: phone,
              normalized_phone: phone,
              message: message,
              cta_type: ctaType,
              status: 'skipped',
              error_reason: skipReason,
              campaign_key: campaignKey,
              sent_at: new Date().toISOString(),
              attempted_at: new Date().toISOString()
            });
          } catch (logError) {
            console.error('Failed to log to Supabase:', logError);
          }
        }
        continue;
      }
      
      // Skip if already sent to this phone in this batch
      if (sentPhones.has(phone)) {
        skipReason = 'duplicate_same_run';
        results.push({ phone, status: 'skipped', response: { message: 'Duplicate in batch' } });
        
        if (supabase) {
          try {
            await supabase.from('message_logs').insert({
              phone: phone,
              normalized_phone: phone,
              message: message,
              cta_type: ctaType,
              status: 'skipped',
              error_reason: skipReason,
              campaign_key: campaignKey,
              sent_at: new Date().toISOString(),
              attempted_at: new Date().toISOString()
            });
          } catch (logError) {
            console.error('Failed to log to Supabase:', logError);
          }
        }
        continue;
      }
      
      // Check for previous runs with same phone and campaign/message
      if (supabase) {
        try {
          const { data: previousLogs } = await supabase
            .from('message_logs')
            .select('id')
            .eq('normalized_phone', phone)
            .eq('campaign_key', campaignKey)
            .in('status', ['sent', 'skipped'])
            .limit(1);
          
          if (previousLogs && previousLogs.length > 0) {
            skipReason = 'duplicate_previous_run';
            results.push({ phone, status: 'skipped', response: { message: 'Duplicate from previous run' } });
            
            await supabase.from('message_logs').insert({
              phone: phone,
              normalized_phone: phone,
              message: message,
              cta_type: ctaType,
              status: 'skipped',
              error_reason: skipReason,
              campaign_key: campaignKey,
              sent_at: new Date().toISOString(),
              attempted_at: new Date().toISOString()
            });
            continue;
          }
        } catch (checkError) {
          console.error('Duplicate check error:', checkError);
        }
      }
      
      sentPhones.add(phone);
      let personalizedMessage = message;
      
      // Safe variable replacement with fallbacks to prevent broken messages
      personalizedMessage = personalizedMessage.replace(/\{\{name\}\}/g, (match) => {
        const name = (recipient.name || '').trim();
        return name || 'Hello'; // Fallback to "Hello" if name is missing/empty
      });
      personalizedMessage = personalizedMessage.replace(/\{\{governorate\}\}/g, (match) => {
        const governorate = (recipient.governorate || '').trim();
        return governorate || 'your area';
      });
      personalizedMessage = personalizedMessage.replace(/\{\{category\}\}/g, (match) => {
        const category = (recipient.category || '').trim();
        return category || 'your business';
      });
      personalizedMessage = personalizedMessage.replace(/\{\{phone\}\}/g, phone || '');

      // Send with retry logic
      let response;
      let responseData;
      let sendStatus = 'failed';
      const maxRetries = 2;
      
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const payload = {
            phone: phone,
            message: personalizedMessage
          };
          console.log('Sending payload keys:', Object.keys(payload));
          
          response = await fetch(`${NABDA_API_URL}/api/v1/messages/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': NABDA_API_TOKEN },
            body: JSON.stringify(payload)
          });

          responseData = await response.json();
          
          if (response.ok) {
            sendStatus = 'sent';
            break; // Success, no need to retry
          } else {
            if (attempt < maxRetries) {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
          }
        } catch (error) {
          console.error(`Send attempt ${attempt + 1} failed for ${phone}:`, error);
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
          } else {
            responseData = { error: error.message };
          }
        }
      }
      
      results.push({ phone, status: sendStatus, response: responseData });

      // Log to Supabase if configured
      if (supabase) {
        try {
          await supabase.from('message_logs').insert({
            phone,
            normalized_phone: phone,
            message: personalizedMessage,
            cta_type: ctaType,
            status: sendStatus,
            error_reason: sendStatus === 'failed' ? JSON.stringify(responseData) : null,
            campaign_key: campaignKey,
            sent_at: new Date().toISOString(),
            attempted_at: new Date().toISOString()
          });
        } catch (logError) {
          console.error('Failed to log to Supabase:', logError);
        }
      }
      
      // Add delay between messages if specified
      if (messageDelay && messageDelay > 0) {
        const delayMs = messageDelay * 1000; // Convert seconds to milliseconds
        const actualDelay = randomDelay ? delayMs * (0.5 + Math.random()) : delayMs;
        await new Promise(resolve => setTimeout(resolve, actualDelay));
      }
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tables', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.' });
    }
    // Try common table names and check their record counts
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

app.get('/api/export-csv', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const table = req.query.table || 'businesses';
    const cityFilter = req.query.city;
    const categoryFilter = req.query.category;
    
    // Get total count
    let countQuery = supabase.from(table).select('*', { count: 'exact', head: true });
    
    if (cityFilter) {
      countQuery = countQuery.eq('city', cityFilter);
    }
    
    if (categoryFilter) {
      countQuery = countQuery.eq('category', categoryFilter);
    }
    
    const { count: totalCount, error: countError } = await countQuery;
    
    if (countError) throw countError;
    
    // Fetch all rows
    const pageSize = 1000;
    const totalPages = Math.ceil(totalCount / pageSize);
    let allData = [];
    
    for (let page = 0; page < totalPages; page++) {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      
      let query = supabase.from(table).select('*').range(from, to);
      
      if (cityFilter) {
        query = query.eq('city', cityFilter);
      }
      
      if (categoryFilter) {
        query = query.eq('category', categoryFilter);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      if (data) {
        allData = allData.concat(data);
      }
    }
    
    // Convert to CSV
    if (allData.length === 0) {
      return res.status(404).json({ success: false, error: 'No data found' });
    }
    
    const headers = Object.keys(allData[0]);
    const csvRows = [headers.join(',')];
    
    allData.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        // Escape commas and quotes
        const escaped = String(value).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${table}_export.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Export Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Campaign session management endpoints
app.post('/api/campaign/start', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const { campaignId, campaignName, totalContacts, source, tableName, message, batchSize, messageDelay, batchDelay, randomDelay, skipPreviouslyContacted } = req.body;
    
    const session = {
      campaign_id: campaignId,
      campaign_name: campaignName || null,
      total_count: totalContacts,
      current_index: 0,
      sent_count: 0,
      failed_count: 0,
      skipped_count: 0,
      processed_numbers: [],
      status: 'sending',
      source,
      table_name: tableName || null,
      message: message.substring(0, 200), // Store first 200 chars
      batch_size: batchSize,
      message_delay: messageDelay,
      batch_delay: batchDelay,
      random_delay: randomDelay,
      skip_previously_contacted: skipPreviouslyContacted,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase.from('campaign_sessions').insert(session).select().single();
    
    if (error) {
      console.error('Campaign start error:', error);
      // Try to update if exists
      const { data: updateData, error: updateError } = await supabase
        .from('campaign_sessions')
        .update({ status: 'sending', current_index: 0, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId)
        .select()
        .single();
      
      if (updateError) throw updateError;
      return res.json({ success: true, session: updateData });
    }
    
    res.json({ success: true, session: data });
  } catch (error) {
    console.error('Campaign start error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/campaign/update', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const { campaignId, currentIndex, sentCount, failedCount, skippedCount, processedNumbers, status } = req.body;
    
    const updateData = {
      current_index: currentIndex,
      sent_count: sentCount,
      failed_count: failedCount,
      skipped_count: skippedCount,
      processed_numbers: processedNumbers,
      status: status || 'sending',
      updated_at: new Date().toISOString()
    };
    
    const { data, error } = await supabase
      .from('campaign_sessions')
      .update(updateData)
      .eq('campaign_id', campaignId)
      .select()
      .single();
    
    if (error) throw error;
    
    res.json({ success: true, session: data });
  } catch (error) {
    console.error('Campaign update error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/campaign/:campaignId', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const { campaignId } = req.params;
    
    const { data, error } = await supabase
      .from('campaign_sessions')
      .select('*')
      .eq('campaign_id', campaignId)
      .single();
    
    if (error) throw error;
    
    if (!data) {
      return res.status(404).json({ success: false, error: 'Campaign not found' });
    }
    
    res.json({ success: true, session: data });
  } catch (error) {
    console.error('Campaign get error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/campaigns/active', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured' });
    }
    
    const { data, error } = await supabase
      .from('campaign_sessions')
      .select('*')
      .in('status', ['sending', 'stopped'])
      .order('started_at', { ascending: false })
      .limit(1);
    
    if (error) throw error;
    
    res.json({ success: true, session: data && data.length > 0 ? data[0] : null });
  } catch (error) {
    console.error('Active campaign error:', error);
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
    
    // Get all contacts from source table
    const { data: sourceData, error: sourceError } = await supabase
      .from(sourceTable)
      .select('*');

    if (sourceError) throw sourceError;
    
    if (!sourceData || sourceData.length === 0) {
      res.json({ success: false, error: 'No contacts found in source table' });
      return;
    }

    // Get existing contacts to check for duplicates
    const { data: existingContacts } = await supabase
      .from('contacts')
      .select('phone');

    const existingPhones = new Set(existingContacts?.map(c => c.phone) || []);
    
    // Filter out duplicates
    const newContacts = sourceData.filter(c => !existingPhones.has(c.phone));
    
    // Insert new contacts
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

// Start server for Railway/Render/local development
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

// Export for Vercel
export default app;
