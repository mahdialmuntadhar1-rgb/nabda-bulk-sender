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
    const { data, error } = await supabase
      .from('contacts')
      .select('*');

    if (error) throw error;
    res.json({ success: true, contacts: data || [] });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const { source, csvData, message, ctaType } = req.body;
    
    let recipients = [];
    
    if (source === 'supabase') {
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

    for (const recipient of recipients) {
      const phone = recipient.phone;
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
