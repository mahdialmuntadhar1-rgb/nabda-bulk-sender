import { appendFileSync, existsSync, readFileSync } from 'fs';
import type { SendResult } from '../types.js';

export class SendLogger {
  private logPath: string;
  private sentPhones: Set<string> = new Set();

  constructor(logPath: string) {
    this.logPath = logPath;
    this.loadExistingLog();
  }

  private loadExistingLog(): void {
    if (!existsSync(this.logPath)) return;
    try {
      const content = readFileSync(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(l => l);
      for (const line of lines) {
        try {
          const entry: SendResult = JSON.parse(line);
          if (entry.status === 'sent' && entry.phone_normalized) {
            this.sentPhones.add(entry.phone_normalized);
          }
        } catch {
          // skip invalid lines
        }
      }
    } catch {
      // ignore read errors
    }
  }

  hasBeenSent(phone: string): boolean {
    return this.sentPhones.has(phone);
  }

  log(entry: SendResult): void {
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.logPath, line);
    if (entry.status === 'sent') {
      this.sentPhones.add(entry.phone_normalized);
    }
  }
}
