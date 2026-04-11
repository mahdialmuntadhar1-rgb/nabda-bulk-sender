import { createServer } from 'http';
import { addOptOut } from '../utils/optout.js';
import { CONFIG } from '../config.js';
import type { WebhookEvent } from '../types.js';

export async function webhookCommand(): Promise<void> {
  const port = CONFIG.WEBHOOK_PORT;
  
  const server = createServer((req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end('Method not allowed');
      return;
    }

    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const event = JSON.parse(body) as WebhookEvent;
        console.log(`[${new Date().toISOString()}] Event: ${event.event}`);
        
        if (event.event === 'message.received' && event.data.message) {
          const msg = event.data.message.toLowerCase();
          const phone = event.data.phone;
          
          if (msg.includes('stop') || msg.includes('unsubscribe')) {
            if (phone) {
              addOptOut(phone, `Received: ${event.data.message}`);
              console.log(`→ Opt-out recorded for ${phone}`);
            }
          }
        }
        
        res.writeHead(200).end('OK');
      } catch (err) {
        console.error('Webhook parse error:', err);
        res.writeHead(400).end('Bad request');
      }
    });
  });

  server.listen(port, () => {
    console.log(`Webhook server listening on port ${port}`);
    console.log(`Configure Nabda dashboard webhook URL to: http://YOUR_IP:${port}/`);
  });
}
