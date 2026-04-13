/**
 * NABDA BULK SENDER - v2 COMPLETE REFACTOR
 *
 * Features:
 * - Unified phone normalization
 * - Language detection (Arabic/Kurdish)
 * - Complete CSV validation
 * - Per-contact message preview
 * - Debug preview with all details
 * - Working dry run
 * - Clean dashboard UI
 *
 * Data flow: Load → Validate → Preview → Configure → Send → Results
 */

// ============================================================================
// GLOBAL STATE
// ============================================================================

let appState = {
    source: 'csv', // csv | supabase | single
    csvData: [],
    supabaseContacts: [],
    singleContact: null,

    // Processed contacts
    contacts: [],
    validContacts: [],
    invalidContacts: [],
    duplicatePhones: new Set(),

    // Validation results
    validation: {
        total: 0,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        arabic: 0,
        kurdish: 0,
        unknown: 0
    },

    // Sending state
    sending: {
        active: false,
        paused: false,
        currentIndex: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        results: []
    },

    // Message template
    message: {
        greeting: '',
        main: '',
        closing: ''
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    loadActiveCampaign();
});

function initializeUI() {
    // Set up event listeners
    document.getElementById('csvFile').addEventListener('change', handleCSVFileChange);
    document.querySelector('input[name="source"][value="csv"]').addEventListener('change', toggleSource);
    document.querySelector('input[name="source"][value="supabase"]').addEventListener('change', toggleSource);
    document.querySelector('input[name="source"][value="single"]').addEventListener('change', toggleSource);

    // Message inputs
    document.getElementById('greeting').addEventListener('input', onMessageChange);
    document.getElementById('message').addEventListener('input', onMessageChange);
    document.getElementById('closing').addEventListener('input', onMessageChange);

    // Checkboxes
    document.getElementById('testMode').addEventListener('change', updateModeBadges);
    document.getElementById('dryRunMode').addEventListener('change', updateModeBadges);

    updateModeBadges();
    onMessageChange();
}

async function loadActiveCampaign() {
    try {
        const res = await fetch('/api/campaigns/active');
        const data = await res.json();
        if (data.success && data.session) {
            showCampaignRecovery(data.session);
        }
    } catch (err) {
        console.error('Campaign recovery failed:', err);
    }
}

// ============================================================================
// CSV HANDLING
// ============================================================================

function handleCSVFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            appState.csvData = parseCSV(event.target.result);
            validateAndProcessContacts();
            updateUI();
        } catch (err) {
            showError(`CSV parse error: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

function parseCSV(text) {
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const nameIdx = headers.indexOf('name');
    const phoneIdx = headers.indexOf('phone');
    const govIdx = headers.indexOf('governorate');
    const catIdx = headers.indexOf('category');

    const contacts = [];
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        contacts.push({
            name: nameIdx >= 0 ? values[nameIdx]?.trim() : '',
            phone: phoneIdx >= 0 ? values[phoneIdx]?.trim() : '',
            governorate: govIdx >= 0 ? values[govIdx]?.trim() : '',
            category: catIdx >= 0 ? values[catIdx]?.trim() : '',
            raw: lines[i]
        });
    }

    return contacts;
}

function validateAndProcessContacts() {
    appState.contacts = [];
    appState.validContacts = [];
    appState.invalidContacts = [];
    appState.duplicatePhones = new Set();

    const seenPhones = new Set();

    appState.validation = {
        total: appState.csvData.length,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        arabic: 0,
        kurdish: 0,
        unknown: 0
    };

    appState.csvData.forEach(contact => {
        const normalized = normalizePhoneNumber(contact.phone);
        const language = detectLanguage(contact.name);

        // Track language
        appState.validation[language]++;

        let status = 'valid';
        let reason = '';

        if (!normalized) {
            status = 'invalid';
            reason = 'Invalid phone format';
            appState.validation.invalid++;
            appState.invalidContacts.push({ ...contact, normalized, language, status, reason });
        } else if (!isValidIraqiPhone(contact.phone)) {
            status = 'invalid';
            reason = 'Not Iraqi mobile';
            appState.validation.invalid++;
            appState.invalidContacts.push({ ...contact, normalized, language, status, reason });
        } else if (seenPhones.has(normalized)) {
            status = 'duplicate';
            reason = 'Duplicate phone';
            appState.validation.duplicates++;
            appState.duplicatePhones.add(normalized);
            appState.invalidContacts.push({ ...contact, normalized, language, status, reason });
        } else {
            seenPhones.add(normalized);
            appState.validation.valid++;
            appState.validContacts.push({
                name: contact.name || '(No Name)',
                phone_original: contact.phone,
                phone_normalized: normalized,
                governorate: contact.governorate || '',
                category: contact.category || '',
                language,
                status: 'valid'
            });
        }

        appState.contacts.push({
            ...contact,
            normalized,
            language,
            status,
            reason
        });
    });
}

// ============================================================================
// VALIDATION & PREVIEW
// ============================================================================

function validateCSV() {
    if (appState.validContacts.length === 0) {
        showError('No valid contacts to validate');
        return;
    }

    const html = `
        <div class="validation-summary">
            <h3>✅ CSV Validation Results</h3>
            <div class="validation-grid">
                <div class="validation-item">
                    <label>Total Rows:</label>
                    <span>${appState.validation.total}</span>
                </div>
                <div class="validation-item">
                    <label>Valid:</label>
                    <span style="color: #4CAF50;">${appState.validation.valid}</span>
                </div>
                <div class="validation-item">
                    <label>Invalid:</label>
                    <span style="color: #f44336;">${appState.validation.invalid}</span>
                </div>
                <div class="validation-item">
                    <label>Duplicates:</label>
                    <span style="color: #ff9800;">${appState.validation.duplicates}</span>
                </div>
            </div>
            <div class="language-breakdown" style="margin-top: 15px;">
                <h4>Language Distribution</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                    <div style="background: #e3f2fd; padding: 10px; border-radius: 4px;">
                        🇸🇦 Arabic: ${appState.validation.arabic}
                    </div>
                    <div style="background: #f3e5f5; padding: 10px; border-radius: 4px;">
                        🇰🇺 Kurdish: ${appState.validation.kurdish}
                    </div>
                    <div style="background: #f5f5f5; padding: 10px; border-radius: 4px;">
                        ❓ Unknown: ${appState.validation.unknown}
                    </div>
                </div>
            </div>
            ${appState.invalidContacts.length > 0 ? `
                <div style="margin-top: 15px;">
                    <h4>Invalid Contacts (First 10)</h4>
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 8px; text-align: left;">Name</th>
                                <th style="padding: 8px; text-align: left;">Phone</th>
                                <th style="padding: 8px; text-align: left;">Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${appState.invalidContacts.slice(0, 10).map(c => `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 8px;">${c.name}</td>
                                    <td style="padding: 8px; font-family: monospace;">${c.phone}</td>
                                    <td style="padding: 8px; color: #f44336;">${c.reason}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    ${appState.invalidContacts.length > 10 ? `<p>... and ${appState.invalidContacts.length - 10} more</p>` : ''}
                </div>
            ` : ''}
        </div>
    `;

    document.getElementById('results').innerHTML = html;
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

function previewMessages() {
    if (appState.validContacts.length === 0) {
        showError('No valid contacts to preview');
        return;
    }

    const message = getCombinedMessage();
    if (!message.trim()) {
        showError('Please write a message');
        return;
    }

    const samples = appState.validContacts.slice(0, 5);
    const html = `
        <div class="message-preview">
            <h3>📱 Message Preview (First 5 Contacts)</h3>
            <p style="color: #666;">Template: <strong>${getCombinedMessage().substring(0, 100)}...</strong></p>
            <div style="display: grid; gap: 15px; margin-top: 15px;">
                ${samples.map((contact, idx) => {
                    const rendered = safeReplaceVariables(message, contact);
                    return `
                        <div style="background: white; padding: 12px; border: 2px solid #2196F3; border-radius: 8px;">
                            <div style="margin-bottom: 8px;">
                                <strong>${contact.name}</strong> (${contact.phone_normalized})
                                <span style="margin-left: 10px; background: ${getLanguageColor(contact.language)}; padding: 4px 8px; border-radius: 3px; font-size: 0.9em;">
                                    ${getLanguageName(contact.language)}
                                </span>
                            </div>
                            <div style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-family: monospace; white-space: pre-wrap; word-break: break-word;">
                                ${rendered}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    document.getElementById('results').innerHTML = html;
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

function debugPreviewMode() {
    if (appState.validContacts.length === 0) {
        showError('No valid contacts');
        return;
    }

    const contact = appState.validContacts[0];
    const message = getCombinedMessage();

    const html = `
        <div class="debug-preview" style="background: #f5f5f5; padding: 15px; border-radius: 8px; border: 2px solid #666;">
            <h3>🔍 Debug Preview (First Contact)</h3>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 15px;">
                <div>
                    <h4>Raw Data</h4>
                    <pre style="background: white; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(contact, null, 2)}</pre>
                </div>

                <div>
                    <h4>Mapped Fields</h4>
                    <table style="width: 100%; font-size: 0.9em;">
                        <tr><td><strong>Name:</strong></td><td>${contact.name}</td></tr>
                        <tr><td><strong>Phone (Original):</strong></td><td>${contact.phone_original || 'N/A'}</td></tr>
                        <tr><td><strong>Phone (Normalized):</strong></td><td style="font-family: monospace;">${contact.phone_normalized}</td></tr>
                        <tr><td><strong>Governorate:</strong></td><td>${contact.governorate}</td></tr>
                        <tr><td><strong>Category:</strong></td><td>${contact.category}</td></tr>
                        <tr><td><strong>Language Detected:</strong></td><td>${getLanguageName(contact.language)}</td></tr>
                        <tr><td><strong>Language Code:</strong></td><td>${contact.language}</td></tr>
                    </table>
                </div>
            </div>

            <div style="margin-top: 15px;">
                <h4>Template Configuration</h4>
                <table style="width: 100%; font-size: 0.9em;">
                    <tr><td><strong>Chosen Template:</strong></td><td>${getLanguageName(contact.language)}</td></tr>
                    <tr><td><strong>Template ID:</strong></td><td>${contact.language}</td></tr>
                </table>
            </div>

            <div style="margin-top: 15px;">
                <h4>Final Message</h4>
                <div style="background: white; padding: 12px; border-radius: 4px; border: 2px solid #4CAF50; font-family: monospace; white-space: pre-wrap; word-break: break-word;">
                    ${safeReplaceVariables(message, contact)}
                </div>
                <p style="margin-top: 8px; color: #666;">Length: ${safeReplaceVariables(message, contact).length} / 255 characters</p>
            </div>
        </div>
    `;

    document.getElementById('results').innerHTML = html;
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

function onMessageChange() {
    const message = getCombinedMessage();

    // Update character counter
    const counter = document.getElementById('currentLength');
    const warning = document.getElementById('charWarning');
    counter.textContent = message.length;

    if (message.length > 255) {
        counter.style.color = '#f44336';
        warning.style.display = 'inline';
        document.getElementById('sendBtn').disabled = true;
    } else {
        counter.style.color = '#4CAF50';
        warning.style.display = 'none';
        updateSendButtonState();
    }

    // Update live preview
    const preview = document.getElementById('finalMessagePreview');
    if (!message.trim()) {
        preview.textContent = 'Type your message above...';
    } else {
        const sample = {
            name: 'Ahmed Cafe',
            governorate: 'Baghdad',
            category: 'Restaurant',
            phone_normalized: '+9647XXXXXXXXX'
        };
        preview.textContent = safeReplaceVariables(message, sample);
    }
}

function getCombinedMessage() {
    const greeting = document.getElementById('greeting').value.trim();
    const main = document.getElementById('message').value.trim();
    const closing = document.getElementById('closing').value.trim();

    const parts = [greeting, main, closing].filter(p => p);
    return parts.join('\n\n');
}

function safeReplaceVariables(template, contact) {
    let result = template;

    // Replace placeholders with actual values (with fallbacks)
    result = result.replace(/\{\{name\}\}/g, contact.name || 'Friend');
    result = result.replace(/\{\{governorate\}\}/g, contact.governorate || 'your area');
    result = result.replace(/\{\{category\}\}/g, contact.category || 'your business');
    result = result.replace(/\{\{phone\}\}/g, contact.phone_normalized || '');

    return result;
}

// ============================================================================
// SENDING & DRY RUN
// ============================================================================

async function showPreSendSummary() {
    if (appState.validContacts.length === 0) {
        showError('No valid contacts to send');
        return;
    }

    const message = getCombinedMessage();
    if (!message.trim()) {
        showError('Please write a message');
        return;
    }

    const dryRun = document.getElementById('dryRunMode').checked;
    const testMode = document.getElementById('testMode').checked;
    const batchSize = parseInt(document.getElementById('batchSize').value) || 20;
    const campaignName = document.getElementById('campaignName').value || 'Auto-generated';

    const summary = `
        <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; border: 2px solid #2196F3;">
            <h3>📋 Pre-Send Summary</h3>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                <div>
                    <p><strong>Campaign Name:</strong> ${campaignName}</p>
                    <p><strong>Mode:</strong> ${dryRun ? '🧪 DRY RUN' : testMode ? '🧪 TEST' : '🚀 LIVE'}</p>
                    <p><strong>Total Contacts:</strong> ${appState.validContacts.length}</p>
                    <p><strong>Batch Size:</strong> ${batchSize}</p>
                </div>
                <div>
                    <p><strong>Arabic:</strong> ${appState.validation.arabic}</p>
                    <p><strong>Kurdish:</strong> ${appState.validation.kurdish}</p>
                    <p><strong>Unknown:</strong> ${appState.validation.unknown}</p>
                    <p><strong>Invalid (skipped):</strong> ${appState.validation.invalid}</p>
                </div>
            </div>

            <div style="margin-top: 15px; padding: 12px; background: white; border-radius: 4px;">
                <strong>Message Preview:</strong>
                <div style="margin-top: 8px; font-family: monospace; white-space: pre-wrap; color: #666;">
                    ${getCombinedMessage().substring(0, 200)}...
                </div>
            </div>

            ${!dryRun && appState.validContacts.length > 50 ? `
                <div style="margin-top: 15px; background: #fff3cd; padding: 12px; border-radius: 4px; border: 2px solid #ffc107;">
                    <strong>⚠️ Large Campaign Detected</strong>
                    <p>You are about to send to ${appState.validContacts.length} contacts. Type <code>SEND NOW</code> to confirm:</p>
                    <input type="text" id="confirmInput" placeholder="Type SEND NOW" style="padding: 8px; width: 200px; margin-top: 10px;">
                </div>
            ` : ''}

            <div style="margin-top: 20px;">
                <button onclick="executeSend()" style="background: #4CAF50; padding: 12px 24px; font-size: 16px; border: none; border-radius: 4px; cursor: pointer; color: white;">
                    ✅ ${dryRun ? 'Start Dry Run' : 'Start Sending'}
                </button>
                <button onclick="closeSummary()" style="background: #f44336; padding: 12px 24px; font-size: 16px; border: none; border-radius: 4px; cursor: pointer; color: white; margin-left: 10px;">
                    ❌ Cancel
                </button>
            </div>
        </div>
    `;

    document.getElementById('results').innerHTML = summary;
    document.getElementById('results').scrollIntoView({ behavior: 'smooth' });
}

async function executeSend() {
    // Check confirmation for large campaigns
    const confirmInput = document.getElementById('confirmInput');
    if (confirmInput && confirmInput.value !== 'SEND NOW') {
        showError('Please type SEND NOW to confirm large campaigns');
        return;
    }

    const dryRun = document.getElementById('dryRunMode').checked;
    const testMode = document.getElementById('testMode').checked;
    const campaignName = document.getElementById('campaignName').value || 'Auto-generated';

    appState.sending = {
        active: true,
        paused: false,
        currentIndex: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        results: []
    };

    const message = getCombinedMessage();
    const contacts = testMode ? [appState.validContacts[0]] : appState.validContacts;

    updateSendProgress();

    for (let i = 0; i < contacts.length; i++) {
        if (!appState.sending.active) break;

        const contact = contacts[i];
        const rendered = safeReplaceVariables(message, contact);

        if (dryRun) {
            // Simulate sending
            appState.sending.results.push({
                contact: contact.name,
                phone: contact.phone_normalized,
                message: rendered,
                status: 'would_send',
                language: contact.language
            });
            appState.sending.sent++;
        } else {
            // Actually send
            try {
                const res = await fetch('/api/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: contact.phone_normalized,
                        name: contact.name,
                        message: rendered,
                        campaignName
                    })
                });
                const data = await res.json();
                if (data.success) {
                    appState.sending.sent++;
                    appState.sending.results.push({
                        contact: contact.name,
                        phone: contact.phone_normalized,
                        status: 'sent'
                    });
                } else {
                    appState.sending.failed++;
                    appState.sending.results.push({
                        contact: contact.name,
                        phone: contact.phone_normalized,
                        status: 'failed',
                        error: data.error
                    });
                }
            } catch (err) {
                appState.sending.failed++;
                appState.sending.results.push({
                    contact: contact.name,
                    phone: contact.phone_normalized,
                    status: 'error',
                    error: err.message
                });
            }
        }

        appState.sending.currentIndex = i + 1;
        updateSendProgress();

        // Add delay
        await sleep(500);
    }

    appState.sending.active = false;
    showFinalResults();
}

function updateSendProgress() {
    const total = appState.validContacts.length;
    const sent = appState.sending.sent;
    const pct = Math.round((appState.sending.currentIndex / total) * 100);

    const html = `
        <div style="margin-top: 20px;">
            <div style="background: #e3f2fd; padding: 15px; border-radius: 8px;">
                <div style="margin-bottom: 10px;">
                    <span><strong>${appState.sending.currentIndex}</strong> / ${total} contacts processed</span>
                    <span style="float: right; color: #2196F3;"><strong>${pct}%</strong></span>
                </div>
                <div style="width: 100%; height: 30px; background: #e0e0e0; border-radius: 15px; overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #2196F3, #4CAF50); transition: width 0.3s;"></div>
                </div>
                <div style="margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; font-size: 0.9em;">
                    <div>✅ Sent: ${appState.sending.sent}</div>
                    <div>❌ Failed: ${appState.sending.failed}</div>
                    <div>⏭️ Remaining: ${total - appState.sending.currentIndex}</div>
                </div>
            </div>
        </div>
    `;

    document.getElementById('results').innerHTML = html;
}

function showFinalResults() {
    const dryRun = document.getElementById('dryRunMode').checked;
    const mode = dryRun ? '🧪 DRY RUN' : '🚀 LIVE SEND';

    const summary = `
        <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; border: 2px solid #4CAF50;">
            <h3>✅ ${mode} Complete</h3>

            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin: 15px 0;">
                <div style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #4CAF50;">
                    <div style="font-size: 2em; font-weight: bold; color: #4CAF50;">${appState.sending.sent}</div>
                    <div>${dryRun ? 'Would Send' : 'Sent'}</div>
                </div>
                <div style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #f44336;">
                    <div style="font-size: 2em; font-weight: bold; color: #f44336;">${appState.sending.failed}</div>
                    <div>Failed</div>
                </div>
                <div style="background: white; padding: 15px; border-radius: 4px; border-left: 4px solid #2196F3;">
                    <div style="font-size: 2em; font-weight: bold; color: #2196F3;">${appState.validation.invalid}</div>
                    <div>Skipped (Invalid)</div>
                </div>
            </div>

            ${appState.sending.results.length > 0 ? `
                <div style="margin-top: 20px;">
                    <h4>Last 10 Results</h4>
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
                        <thead>
                            <tr style="background: #f5f5f5;">
                                <th style="padding: 10px; text-align: left;">Contact</th>
                                <th style="padding: 10px; text-align: left;">Phone</th>
                                <th style="padding: 10px; text-align: left;">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${appState.sending.results.slice(-10).map(r => `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 10px;">${r.contact}</td>
                                    <td style="padding: 10px; font-family: monospace; font-size: 0.85em;">${r.phone}</td>
                                    <td style="padding: 10px; color: ${r.status === 'sent' || r.status === 'would_send' ? '#4CAF50' : '#f44336'};">
                                        ${r.status === 'would_send' ? '📋 Would Send' : r.status === 'sent' ? '✅ Sent' : '❌ ' + r.status}
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            ` : ''}

            <div style="margin-top: 20px;">
                <button onclick="location.reload()" style="background: #4CAF50; padding: 12px 24px; color: white; border: none; border-radius: 4px; cursor: pointer;">
                    🔄 Start New Campaign
                </button>
            </div>
        </div>
    `;

    document.getElementById('results').innerHTML = summary;
}

// ============================================================================
// UI HELPERS
// ============================================================================

function toggleSource() {
    appState.source = document.querySelector('input[name="source"]:checked').value;
    updateUI();
}

function updateUI() {
    const csvSection = document.getElementById('csvSection');
    const supabaseSection = document.getElementById('supabaseSection');
    const singleSection = document.getElementById('singleSection');

    csvSection.style.display = appState.source === 'csv' ? 'flex' : 'none';
    supabaseSection.style.display = appState.source === 'supabase' ? 'flex' : 'none';
    singleSection.style.display = appState.source === 'single' ? 'flex' : 'none';

    updateStats();
    updateSendButtonState();
}

function updateStats() {
    document.getElementById('statTotal').textContent = appState.validation.total;
    document.getElementById('statValid').textContent = appState.validation.valid;
    document.getElementById('statInvalid').textContent = appState.validation.invalid;
    document.getElementById('statDuplicates').textContent = appState.validation.duplicates;
    document.getElementById('statPending').textContent = appState.validation.valid;
    document.getElementById('statSent').textContent = appState.sending.sent;
    document.getElementById('statFailed').textContent = appState.sending.failed;
    document.getElementById('statSkipped').textContent = appState.validation.invalid;
    document.getElementById('statRemaining').textContent = Math.max(0, appState.validation.valid - appState.sending.sent);
}

function updateSendButtonState() {
    const btn = document.getElementById('sendBtn');
    const hasContacts = appState.validContacts.length > 0;
    const hasMessage = getCombinedMessage().trim().length > 0;
    const lengthValid = getCombinedMessage().length <= 255;

    btn.disabled = !hasContacts || !hasMessage || !lengthValid;
}

function updateModeBadges() {
    const testMode = document.getElementById('testMode').checked;
    const dryRunMode = document.getElementById('dryRunMode').checked;

    const testBanner = document.getElementById('testModeBanner');
    if (testBanner) testBanner.style.display = testMode ? 'block' : 'none';
}

function closeSummary() {
    document.getElementById('results').innerHTML = '';
}

function showError(msg) {
    alert(`❌ Error: ${msg}`);
}

function showCampaignRecovery(session) {
    const html = `...recovery UI...`;
    document.getElementById('progress').innerHTML = html;
    document.getElementById('progress').style.display = 'block';
}

function getLanguageColor(lang) {
    const colors = {
        'arabic': '#e3f2fd',
        'kurdish': '#f3e5f5',
        'unknown': '#fafafa'
    };
    return colors[lang] || '#fafafa';
}

function getLanguageName(lang) {
    const names = {
        'arabic': '🇸🇦 Arabic',
        'kurdish': '🇰🇺 Kurdish',
        'unknown': '❓ Unknown'
    };
    return names[lang] || 'Unknown';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
