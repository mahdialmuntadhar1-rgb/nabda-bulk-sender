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
  opt_in?: boolean;
  created_at?: string;
  [key: string]: any; // Allow any additional fields
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

// Try different table names for contacts
const CONTACT_TABLES = ['contacts', 'users', 'customers', 'leads', 'subscribers'];

export async function getContacts(): Promise<Contact[]> {
  for (const tableName of CONTACT_TABLES) {
    try {
      const { data, error } = await supabase
        .from(tableName)
        .select('*');

      if (!error && data) {
        console.log(`Found contacts in table: ${tableName}`);
        // Filter for opted-in contacts if opt_in field exists
        return data.filter(c => c.opt_in !== false && c.opt_in !== 'false');
      }
    } catch (e) {
      // Table doesn't exist or access denied, try next
      continue;
    }
  }
  
  throw new Error('No contacts table found. Please create a contacts table or specify your table name.');
}

export async function logMessage(messageLog: MessageLog): Promise<void> {
  const tables = ['message_logs', 'messages', 'campaigns'];
  
  for (const tableName of tables) {
    try {
      const { error } = await supabase
        .from(tableName)
        .insert(messageLog);

      if (!error) {
        console.log(`Logged message to table: ${tableName}`);
        return;
      }
    } catch (e) {
      continue;
    }
  }
  
  // If no table exists, just log to console
  console.log('Message log:', messageLog);
}

export async function logResponse(response: Response): Promise<void> {
  const tables = ['responses', 'replies', 'webhooks'];
  
  for (const tableName of tables) {
    try {
      const { error } = await supabase
        .from(tableName)
        .insert(response);

      if (!error) {
        console.log(`Logged response to table: ${tableName}`);
        return;
      }
    } catch (e) {
      continue;
    }
  }
  
  console.log('Response log:', response);
}

export async function getResponses(contactId?: string): Promise<Response[]> {
  const tables = ['responses', 'replies', 'webhooks'];
  
  for (const tableName of tables) {
    try {
      let query = supabase.from(tableName).select('*');
      
      if (contactId) {
        query = query.eq('contact_id', contactId);
      }
      
      const { data, error } = await query.order('received_at', { ascending: false }).limit(50);
      
      if (!error && data) {
        console.log(`Found responses in table: ${tableName}`);
        return data;
      }
    } catch (e) {
      continue;
    }
  }
  
  return [];
}

export async function getTableStructure(tableName: string): Promise<any[]> {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);

    if (error) throw error;
    return data || [];
  } catch (e) {
    return [];
  }
}
