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
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.get('/api/contacts', async (req, res) => {
  try {
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

    // Check sent messages for duplicate prevention
    try {
      const { data: sentData } = await supabase
        .from('message_logs')
        .select('message')
        .eq('message', message)
        .limit(1000);
      
      if (sentData && sentData.length > 0) {
        // Get phones from recent messages with same content
        const { data: recentMessages } = await supabase
          .from('message_logs')
          .select('message')
          .eq('message', message)
          .order('sent_at', { ascending: false })
          .limit(500);
        
        if (recentMessages) {
          // Mark as potential duplicates if same message sent recently
          console.log(`Found ${recentMessages.length} recent messages with same content`);
        }
      }
    } catch (e) {
      // message_logs table might not exist, continue
      console.log('Duplicate check skipped - message_logs table not found');
    }

    for (const recipient of recipients) {
      const phone = recipient.phone;
      
      // Skip if already sent to this phone in this batch
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
        body: JSON.stringify({ phone, message: personalizedMessage })
      });

      const result = await response.json();
      
      if (supabaseUrl && supabaseKey) {
        try {
          let contactId = recipient.id;
          if (!contactId && source === 'csv') {
            const { data: contactData } = await supabase.from('contacts').upsert({
              phone, name: recipient.name, governorate: recipient.governorate, category: recipient.category, opt_in: true
            }, { onConflict: 'phone' }).select();
            contactId = contactData?.[0]?.id;
          }
          if (contactId) {
            await supabase.from('message_logs').insert({
              contact_id: contactId, message: personalizedMessage, cta_type: ctaType || null, status: response.ok ? 'sent' : 'failed'
            });
          }
        } catch (logError) {
          console.error('Error logging to Supabase:', logError);
        }
      }

      results.push({ phone, status: response.ok ? 'sent' : 'failed', response: result });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/tables', async (req, res) => {
  try {
    // Try common table names and check their record counts
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
