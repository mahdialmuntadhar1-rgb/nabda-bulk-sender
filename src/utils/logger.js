import { appendFileSync, existsSync, readFileSync } from 'fs';
export class SendLogger {
    logPath;
    sentPhones = new Set();
    constructor(logPath) {
        this.logPath = logPath;
        this.loadExistingLog();
    }
    loadExistingLog() {
        if (!existsSync(this.logPath))
            return;
        try {
            const content = readFileSync(this.logPath, 'utf-8');
            const lines = content.trim().split('\n').filter(l => l);
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    if (entry.status === 'sent' && entry.phone_normalized) {
                        this.sentPhones.add(entry.phone_normalized);
                    }
                }
                catch {
                    // skip invalid lines
                }
            }
        }
        catch {
            // ignore read errors
        }
    }
    hasBeenSent(phone) {
        return this.sentPhones.has(phone);
    }
    log(entry) {
        const line = JSON.stringify(entry) + '\n';
        appendFileSync(this.logPath, line);
        if (entry.status === 'sent') {
            this.sentPhones.add(entry.phone_normalized);
        }
    }
}
