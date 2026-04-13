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

app.get('/api/contacts', async (req, res) => {
  try {
    if (!supabase) {
      return res.status(500).json({ success: false, error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.' });
    }
    const table = req.query.table || 'businesses';
    const cityFilter = req.query.city;
    const categoryFilter = req.query.category;
    
    let query = supabase.from(table).select('*');
    
    if (cityFilter) {
      query = query.eq('city', cityFilter);
    }
    
    if (categoryFilter) {
      query = query.eq('category', categoryFilter);
    }
    
    const { data, error } = await query;

    if (error) throw error;
    res.json({ success: true, contacts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const { source, csvData, message, ctaType, singleContact, campaignId } = req.body;
    
    let recipients = [];
    
    if (source === 'single') {
      recipients = [singleContact];
    } else if (source === 'supabase') {
      if (!supabase) {
        return res.status(500).json({ success: false, error: 'Supabase not configured' });
      }
      const { data, error } = await supabase.from('businesses').select('*');
      if (error) throw error;
      recipients = data || [];
    } else {
      recipients = parse(csvData, { columns: true, skip_empty_lines: true });
      recipients = recipients.filter(r => r.opt_in === 'true' || r.opt_in === '1' || r.opt_in === 'yes');
    }

    const results = [];
    const NABDA_API_URL = process.env.NABDA_API_URL || 'https://api.nabdaotp.com';
    const NABDA_API_TOKEN = process.env.NABDA_API_TOKEN;
    const sentPhones = new Set();
    const campaignKey = campaignId || message.substring(0, 50);

    for (const recipient of recipients) {
      let phone = recipient.phone;
      let skipReason = null;
      
      // Normalize phone number
      if (phone) {
        phone = phone.trim().replace(/-/g, '').replace(/\s/g, '');
        // Convert 07XXXXXXXXX to +9647XXXXXXXXX
        if (phone.startsWith('07')) {
          phone = '+964' + phone.substring(1);
        }
      }
      
      // Validate phone format - exact Iraqi mobile: +9647XXXXXXXXX (9 digits after +9647)
      const iraqiMobilePattern = /^\+9647\d{9}$/;
      
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
      
      // Skip if phone contains comma (should not happen after cleanup)
      if (phone.includes(',')) {
        skipReason = 'invalid_phone';
        results.push({ phone, status: 'skipped', response: { message: 'Phone contains comma' } });
        
        if (supabase) {
          try {
            await supabase.from('message_logs').insert({
              phone: phone,
              normalized_phone: null,
              message: message,
              cta_type: ctaType,
              status: 'skipped',
              error_reason: skipReason,
              campaign_key: message.substring(0, 50),
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
      if (!iraqiMobilePattern.test(phone)) {
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
              campaign_key: message.substring(0, 50),
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
              campaign_key: message.substring(0, 50),
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
            results.push({ phone, status: 'skipped', response: { message: 'This number was already contacted in a previous campaign or earlier in this session.' } });

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
      
      personalizedMessage = personalizedMessage.replace(/\{\{name\}\}/g, recipient.name || '');
      personalizedMessage = personalizedMessage.replace(/\{\{governorate\}\}/g, recipient.governorate || '');
      personalizedMessage = personalizedMessage.replace(/\{\{category\}\}/g, recipient.category || '');
      personalizedMessage = personalizedMessage.replace(/\{\{phone\}\}/g, phone || '');

      const payload = {
        phone: phone,
        message: personalizedMessage
      };
      console.log('Sending payload keys:', Object.keys(payload));

      const response = await fetch(`${NABDA_API_URL}/api/v1/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': NABDA_API_TOKEN },
        body: JSON.stringify(payload)
      });

      const responseData = await response.json();
      const sendStatus = response.ok ? 'sent' : 'failed';
      results.push({ phone, status: sendStatus, response: responseData });

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

export default app;
