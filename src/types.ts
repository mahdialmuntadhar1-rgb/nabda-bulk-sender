export interface Recipient {
  phone: string;
  name?: string;
  governorate?: string;
  category?: string;
  opt_in?: string | boolean;
  [key: string]: string | undefined | boolean;
}

export interface SendResult {
  timestamp: string;
  phone_input: string;
  phone_normalized: string;
  phone_sent: string;
  template_hash: string;
  message_preview: string;
  status: 'sent' | 'failed' | 'skipped_optout' | 'skipped_no_optin' | 'skipped_invalid_phone' | 'skipped_already_sent';
  http_status?: number;
  message_id?: string;
  error?: string;
  retry_count: number;
}

export interface NabdaResponse {
  messageId?: string;
  id?: string;
  message_id?: string;
  status?: string;
  error?: string;
}

export interface WebhookEvent {
  event: string;
  data: {
    phone?: string;
    message?: string;
    messageId?: string;
    status?: string;
    [key: string]: unknown;
  };
  timestamp?: string;
}

export interface OptOutRecord {
  phone: string;
  opted_out_at: string;
  reason: string;
}
