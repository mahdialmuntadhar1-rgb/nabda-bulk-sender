import { existsSync, readFileSync, writeFileSync } from 'fs';
const OPTOUT_FILE = './opt-outs.json';
export function loadOptOuts() {
    if (!existsSync(OPTOUT_FILE))
        return new Set();
    try {
        const content = readFileSync(OPTOUT_FILE, 'utf-8');
        const records = JSON.parse(content);
        return new Set(records.map(r => r.phone));
    }
    catch {
        return new Set();
    }
}
export function addOptOut(phone, reason) {
    const existing = loadOptOutRecords();
    const normalized = phone.replace(/^\+/, '');
    if (existing.some(r => r.phone === normalized))
        return;
    existing.push({
        phone: normalized,
        opted_out_at: new Date().toISOString(),
        reason
    });
    writeFileSync(OPTOUT_FILE, JSON.stringify(existing, null, 2));
}
function loadOptOutRecords() {
    if (!existsSync(OPTOUT_FILE))
        return [];
    try {
        return JSON.parse(readFileSync(OPTOUT_FILE, 'utf-8'));
    }
    catch {
        return [];
    }
}
export function isOptedOut(phone) {
    const optouts = loadOptOuts();
    const normalized = phone.replace(/^\+/, '');
    return optouts.has(normalized);
}
