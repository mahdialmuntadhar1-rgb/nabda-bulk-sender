#!/usr/bin/env node
import { Command } from 'commander';
import { sendCommand } from './commands/send.js';
import { webhookCommand } from './commands/webhook.js';
import { validateConfig } from './config.js';
const program = new Command();
program
    .name('nabda-bulk-sender')
    .description('Compliant bulk WhatsApp messaging CLI for Nabda Gateway')
    .version('1.0.0');
program
    .command('send')
    .description('Send bulk WhatsApp messages from template')
    .requiredOption('--csv <path>', 'Path to recipients CSV file')
    .requiredOption('--template <path>', 'Path to message template file')
    .option('--dry-run', 'Preview messages without sending', false)
    .option('--limit <n>', 'Limit number of recipients', parseInt)
    .option('--concurrency <n>', 'Concurrent sends', parseInt, 1)
    .option('--batch-size <n>', 'Batch size', parseInt, 10)
    .option('--batch-delay-ms <n>', 'Delay between batches (ms)', parseInt, 2000)
    .option('--resume', 'Skip already-sent recipients from log', false)
    .option('--log <path>', 'Log file path', './send-log.jsonl')
    .action(async (options) => {
    try {
        if (!options.dryRun)
            validateConfig();
        await sendCommand(options);
    }
    catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
});
program
    .command('webhook')
    .description('Start webhook server for opt-out processing')
    .action(async () => {
    try {
        validateConfig();
        await webhookCommand();
    }
    catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
});
program.parse();
