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
    const table = req.query.table || 'contacts';
    const { data, error } = await supabase
      .from(table)
      .select('*');

    if (error) throw error;
    res.json({ success: true, contacts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const { source, csvData, message, ctaType, singleContact } = req.body;
    
    let recipients = [];
    
    if (source === 'single') {
      recipients = [singleContact];
    } else if (source === 'supabase') {
      if (!supabase) {
        return res.status(500).json({ success: false, error: 'Supabase not configured' });
      }
      const { data, error } = await supabase.from('contacts').select('*');
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

    for (const recipient of recipients) {
      const phone = recipient.phone;
      
      if (sentPhones.has(phone)) {
        results.push({ phone, status: 'skipped', response: { message: 'Duplicate in batch' } });
        continue;
      }
      
      sentPhones.add(phone);
      let personalizedMessage = message;
      
      personalizedMessage = personalizedMessage.replace(/\{\{name\}\}/g, recipient.name || '');
      personalizedMessage = personalizedMessage.replace(/\{\{governorate\}\}/g, recipient.governorate || '');
      personalizedMessage = personalizedMessage.replace(/\{\{category\}\}/g, recipient.category || '');
      personalizedMessage = personalizedMessage.replace(/\{\{phone\}\}/g, phone || '');

      const response = await fetch(`${NABDA_API_URL}/api/v1/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': NABDA_API_TOKEN },
        body: JSON.stringify({
          phone: phone,
          message: personalizedMessage,
          cta_type: ctaType
        })
      });

      const responseData = await response.json();
      results.push({ phone, status: response.ok ? 'success' : 'failed', response: responseData });

      if (supabase) {
        try {
          await supabase.from('message_logs').insert({
            phone,
            message: personalizedMessage,
            cta_type: ctaType,
            sent_at: new Date().toISOString()
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
    const commonTables = ['business', 'staging', 'contacts', 'users', 'customers', 'leads', 'subscribers', 'clients', 'members', 'profiles', 'accounts'];
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
