import express from 'express';
import cors from 'cors';
import { parse } from 'csv-parse/sync';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

app.post('/api/send', async (req, res) => {
  try {
    const { csvData, message } = req.body;
    
    // Parse CSV data
    const recipients = parse(csvData, {
      columns: true,
      skip_empty_lines: true
    });

    // Filter opted-in recipients
    const optedIn = recipients.filter(r => 
      r.opt_in === 'true' || r.opt_in === '1' || r.opt_in === 'yes'
    );

    // Send messages to Nabda API
    const results = [];
    const NABDA_API_URL = process.env.NABDA_API_URL || 'https://api.nabdaotp.com';
    const NABDA_API_TOKEN = process.env.NABDA_API_TOKEN;

    for (const recipient of optedIn) {
      const phone = recipient.phone;
      let personalizedMessage = message;
      
      // Replace template variables
      personalizedMessage = personalizedMessage.replace(/\{\{name\}\}/g, recipient.name || '');
      personalizedMessage = personalizedMessage.replace(/\{\{governorate\}\}/g, recipient.governorate || '');
      personalizedMessage = personalizedMessage.replace(/\{\{category\}\}/g, recipient.category || '');
      personalizedMessage = personalizedMessage.replace(/\{\{phone\}\}/g, phone || '');

      const response = await fetch(`${NABDA_API_URL}/api/v1/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': NABDA_API_TOKEN
        },
        body: JSON.stringify({ phone, message: personalizedMessage })
      });

      const result = await response.json();
      results.push({
        phone,
        status: response.ok ? 'sent' : 'failed',
        response: result
      });
    }

    res.json({ success: true, results });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
