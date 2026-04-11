import { readFileSync } from 'fs';
import { loadRecipients } from '../utils/csv.js';
import { normalizePhone } from '../utils/phone.js';
import { renderTemplate, hashTemplate } from '../utils/template.js';
import { SendLogger } from '../utils/logger.js';
import { loadOptOuts, isOptedOut } from '../utils/optout.js';
import { NabdaClient } from '../nabda/client.js';
export async function sendCommand(options) {
    console.log('Loading recipients and template...');
    const recipients = loadRecipients(options.csv);
    const template = readFileSync(options.template, 'utf-8');
    const templateHash = hashTemplate(template);
    const optouts = loadOptOuts();
    const logger = new SendLogger(options.log);
    const nabda = new NabdaClient();
    console.log(`Loaded ${recipients.length} recipients`);
    console.log(`Template hash: ${templateHash}`);
    console.log(`Opt-outs on file: ${optouts.size}`);
    let filtered = recipients.filter(r => {
        if (!r.phone)
            return false;
        if (!r.opt_in) {
            console.log(`Skipping ${r.phone}: no opt-in`);
            return false;
        }
        return true;
    });
    if (options.limit) {
        filtered = filtered.slice(0, options.limit);
    }
    console.log(`\nWill process ${filtered.length} recipients`);
    console.log(`Concurrency: ${options.concurrency}, Batch size: ${options.batchSize}, Delay: ${options.batchDelayMs}ms`);
    if (options.dryRun) {
        console.log('\n--- DRY RUN ---');
        for (let i = 0; i < Math.min(3, filtered.length); i++) {
            const r = filtered[i];
            const normalized = normalizePhone(r.phone);
            const message = renderTemplate(template, { ...r, phone: normalized || r.phone });
            console.log(`\nTo: ${normalized}`);
            console.log(`Message: ${message.slice(0, 100)}...`);
        }
        console.log(`\nTotal would send: ${filtered.length}`);
        return;
    }
    let sent = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < filtered.length; i += options.batchSize) {
        const batch = filtered.slice(i, i + options.batchSize);
        console.log(`\nProcessing batch ${Math.floor(i / options.batchSize) + 1}/${Math.ceil(filtered.length / options.batchSize)}`);
        const promises = batch.map(async (recipient) => {
            const normalized = normalizePhone(recipient.phone);
            if (!normalized) {
                const result = {
                    timestamp: new Date().toISOString(),
                    phone_input: recipient.phone,
                    phone_normalized: 'invalid',
                    phone_sent: 'invalid',
                    template_hash: templateHash,
                    message_preview: '',
                    status: 'skipped_invalid_phone',
                    error: 'Could not normalize phone',
                    retry_count: 0
                };
                logger.log(result);
                skipped++;
                return;
            }
            if (options.resume && logger.hasBeenSent(normalized)) {
                console.log(`Skipping ${normalized}: already sent (resume mode)`);
                skipped++;
                return;
            }
            if (isOptedOut(normalized)) {
                const result = {
                    timestamp: new Date().toISOString(),
                    phone_input: recipient.phone,
                    phone_normalized: normalized,
                    phone_sent: stripPlus(normalized),
                    template_hash: templateHash,
                    message_preview: '',
                    status: 'skipped_optout',
                    retry_count: 0
                };
                logger.log(result);
                skipped++;
                return;
            }
            const message = renderTemplate(template, { ...recipient, phone: normalized });
            const result = await nabda.sendMessage(normalized, message);
            result.template_hash = templateHash;
            logger.log(result);
            if (result.status === 'sent') {
                sent++;
                console.log(`✓ Sent to ${normalized}`);
            }
            else {
                failed++;
                console.log(`✗ Failed to ${normalized}: ${result.error}`);
            }
        });
        await Promise.all(promises);
        if (i + options.batchSize < filtered.length) {
            console.log(`Waiting ${options.batchDelayMs}ms before next batch...`);
            await sleep(options.batchDelayMs);
        }
    }
    console.log(`\n=== SUMMARY ===`);
    console.log(`Sent: ${sent}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Log written to: ${options.log}`);
}
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
function stripPlus(phone) {
    return phone.replace(/^\+/, '');
}
