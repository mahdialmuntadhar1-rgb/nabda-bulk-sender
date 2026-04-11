import { createClient } from '@supabase/supabase-js';
import { CONFIG } from './config.js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseKey);

export interface Contact {
  id?: string;
  phone: string;
  name?: string;
  governorate?: string;
  category?: string;
  opt_in: boolean;
  created_at?: string;
}

export interface MessageLog {
  id?: string;
  contact_id: string;
  message: string;
  cta_type?: string;
  sent_at?: string;
  status: 'sent' | 'failed';
}

export interface Response {
  id?: string;
  contact_id: string;
  message_id: string;
  response_text: string;
  response_type: 'click' | 'reply' | 'stop';
  received_at?: string;
}

export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('opt_in', true);

  if (error) throw error;
  return data || [];
}

export async function logMessage(messageLog: MessageLog): Promise<void> {
  const { error } = await supabase
    .from('message_logs')
    .insert(messageLog);

  if (error) throw error;
}

export async function logResponse(response: Response): Promise<void> {
  const { error } = await supabase
    .from('responses')
    .insert(response);

  if (error) throw error;
}

export async function getResponses(contactId?: string): Promise<Response[]> {
  let query = supabase.from('responses').select('*');
  
  if (contactId) {
    query = query.eq('contact_id', contactId);
  }
  
  const { data, error } = await query.order('received_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}
