import type { NabdaResponse, SendResult } from '../types.js';
import { CONFIG } from '../config.js';
import { stripPlus } from '../utils/phone.js';

export class NabdaClient {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = CONFIG.NABDA_API_URL;
    // Use API key from environment
    this.apiKey = CONFIG.NABDA_API_TOKEN || '';
    
    if (!this.apiKey) {
      throw new Error('NABDA_API_TOKEN is required in .env file');
    }
  }

  async sendMessage(phone: string, message: string, attempt: number = 1): Promise<SendResult> {
    const phoneSent = phone; // Don't strip +, send as-is
    const url = `${this.baseUrl}/api/v1/messages/send`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.apiKey
        },
        body: JSON.stringify({ phone: phoneSent, message })
      });

      const responseText = await response.text();
      
      let data: NabdaResponse = {};
      
      try {
        data = JSON.parse(responseText) as NabdaResponse;
      } catch {
        // not JSON - likely HTML error page
      }

      const messageId = data.messageId || data.id || data.message_id;
      
      if (response.ok) {
        return {
          timestamp: new Date().toISOString(),
          phone_input: phone,
          phone_normalized: phone,
          phone_sent: phoneSent,
          template_hash: '',
          message_preview: message.slice(0, 80),
          status: 'sent',
          http_status: response.status,
          message_id: messageId,
          retry_count: attempt
        };
      }

      // Handle retryable errors
      if (this.isRetryable(response.status) && attempt < 5) {
        const delay = this.calculateBackoff(attempt);
        await sleep(delay);
        return this.sendMessage(phone, message, attempt + 1);
      }

      return {
        timestamp: new Date().toISOString(),
        phone_input: phone,
        phone_normalized: phone,
        phone_sent: phoneSent,
        template_hash: '',
        message_preview: message.slice(0, 80),
        status: 'failed',
        http_status: response.status,
        error: `HTTP ${response.status}: ${responseText.startsWith('<') ? 'HTML error page received - check URL/credentials' : responseText.slice(0, 200)}`,
        retry_count: attempt
      };

    } catch (error) {
      const err = error as Error;
      
      // Network errors are retryable
      if (attempt < 5) {
        const delay = this.calculateBackoff(attempt);
        await sleep(delay);
        return this.sendMessage(phone, message, attempt + 1);
      }

      return {
        timestamp: new Date().toISOString(),
        phone_input: phone,
        phone_normalized: phone,
        phone_sent: phoneSent,
        template_hash: '',
        message_preview: message.slice(0, 80),
        status: 'failed',
        error: err.message,
        retry_count: attempt
      };
    }
  }

  private isRetryable(status: number): boolean {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }

  private calculateBackoff(attempt: number): number {
    const base = 1000;
    const max = 30000;
    const jitter = Math.random() * 1000;
    return Math.min(base * Math.pow(2, attempt) + jitter, max);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
