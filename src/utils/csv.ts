import { parse } from 'csv-parse/sync';
import { readFileSync } from 'fs';
import type { Recipient } from '../types.js';

export function loadRecipients(csvPath: string): Recipient[] {
  const content = readFileSync(csvPath, 'utf-8');
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records.map((record: Record<string, string>) => ({
    phone: record.phone || '',
    name: record.name,
    governorate: record.governorate,
    category: record.category,
    opt_in: record.opt_in === 'true' || record.opt_in === '1' || record.opt_in === 'yes',
    ...record
  }));
}
