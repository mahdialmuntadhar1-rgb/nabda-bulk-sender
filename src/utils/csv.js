import { parse } from 'csv-parse/lib/sync.js';
import { readFileSync } from 'fs';
export function loadRecipients(csvPath) {
    const content = readFileSync(csvPath, 'utf-8');
    const records = parse(content, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
    });
    return records.map((record) => ({
        phone: record.phone || '',
        name: record.name,
        governorate: record.governorate,
        category: record.category,
        opt_in: record.opt_in === 'true' || record.opt_in === '1' || record.opt_in === 'yes',
        ...record
    }));
}
