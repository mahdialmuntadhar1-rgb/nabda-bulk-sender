// ============ UNIFIED PHONE NORMALIZATION ============
// SINGLE SOURCE OF TRUTH - used in validation, preview, deduplication, sending
function normalizePhoneNumber(phone) {
    if (!phone || typeof phone !== 'string') return null;
    let normalized = phone.trim()
        .replace(/\s/g, '')
        .replace(/-/g, '')
        .replace(/,/g, '')
        .replace(/\./g, '');
    if (!normalized) return null;
    if (normalized.startsWith('+')) normalized = normalized.substring(1);
    normalized = normalized.replace(/[^\d]/g, '');
    if (!normalized) return null;
    if (normalized.length === 11 && normalized.startsWith('07')) return '+964' + normalized.substring(1);
    if (normalized.length === 10 && normalized.startsWith('7')) return '+964' + normalized;
    if (normalized.length === 12 && normalized.startsWith('9647')) return '+' + normalized;
    if (normalized.length === 13 && normalized.startsWith('964')) return '+' + normalized;
    return null;
}

function isValidIraqiPhone(phone) {
    if (!phone || typeof phone !== 'string') return false;
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return false;
    return /^\+9647\d{9}$/.test(normalized);
}

function detectLanguage(text) {
    if (!text || typeof text !== 'string') return 'unknown';
    const arabicRegex = /[\u0600-\u06FF]/g;
    const arabicMatches = text.match(arabicRegex);
    const kurdishKeywords = ['کورد', 'کردی', 'سۆرانی', 'کورمانجی', 'ئاراپی'];
    if (kurdishKeywords.some(k => text.includes(k))) return 'kurdish';
    if (arabicMatches && arabicMatches.length / text.length > 0.4) return 'arabic';
    return 'unknown';
}

let csvData = '';
let csvParsedData = [];
let supabaseContacts = [];
let singleContact = null;
let shouldStopSending = false;
let contactStatusMap = new Map(); // Track status of each contact by phone
let csvValidationErrors = []; // Store CSV validation errors
let sendingProgress = {
    currentIndex: 0,
    sentPhones: new Set(),
    campaignId: null,
    isPaused: false,
    session: null
};

// Check for active campaign on page load
async function checkActiveCampaign() {
    try {
        const response = await fetch('/api/campaigns/active');
        const data = await response.json();
        
        if (data.success && data.session) {
            const session = data.session;
            sendingProgress.session = session;
            sendingProgress.campaignId = session.campaign_id;
            
            // Show recovery UI
            const progress = document.getElementById('progress');
            const resumeBtn = document.getElementById('resumeBtn');
            
            const statusColor = session.status === 'stopped' ? '#ff9800' : '#2196F3';
            const statusText = session.status === 'stopped' ? 'Stopped' : 'In Progress';
            
            progress.style.display = 'block';
            progress.innerHTML = `
                <div style="background: #fff3cd; padding: 20px; border-radius: 8px; border: 2px solid #ffc107;">
                    <h3 style="margin-top: 0; color: #856404;">🔄 Incomplete Campaign Detected</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0;">
                        <div>
                            <p><strong>Campaign ID:</strong> ${session.campaign_id}</p>
                            <p><strong>Campaign Name:</strong> ${session.campaign_name || 'Auto-generated'}</p>
                            <p><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
                        </div>
                        <div>
                            <p><strong>Progress:</strong> ${session.current_index} / ${session.total_count}</p>
                            <p><strong>Sent:</strong> ${session.sent_count}</p>
                            <p><strong>Failed:</strong> ${session.failed_count}</p>
                            <p><strong>Skipped:</strong> ${session.skipped_count}</p>
                        </div>
                    </div>
                    ${session.status === 'stopped' ? `
                        <button onclick="resumeSending()" style="background: #4CAF50; padding: 12px 24px; font-size: 16px; color: white; border: none; border-radius: 4px; cursor: pointer;">🔄 Resume Campaign</button>
                        <button onclick="dismissCampaign()" style="background: #f44336; padding: 12px 24px; font-size: 16px; color: white; border: none; border-radius: 4px; cursor: pointer; margin-left: 10px;">❌ Dismiss</button>
                    ` : '<p style="color: #856404;">This campaign is still in progress. Please wait or dismiss to start a new campaign.</p>'}
                </div>
            `;
            
            if (session.status === 'stopped') {
                resumeBtn.style.display = 'inline-block';
                resumeBtn.disabled = false;
            }
        }
    } catch (error) {
        console.error('Failed to check for active campaign:', error);
    }
}

// Dismiss campaign recovery UI
function dismissCampaign() {
    sendingProgress.session = null;
    sendingProgress.campaignId = null;
    document.getElementById('progress').style.display = 'none';
    document.getElementById('resumeBtn').style.display = 'none';
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    checkActiveCampaign();
    updateCharCounter();
    updateSourceClarity();
    updateCampaignStatus('Ready');
    
    // Add event listener for test mode
    const testMode = document.getElementById('testMode');
    if (testMode) {
        testMode.addEventListener('change', updateTestModeBanner);
    }
    
    // Add event listener for source changes
    const sourceRadios = document.querySelectorAll('input[name="source"]');
    sourceRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            updateSourceClarity();
            updateSendButtonState();
        });
    });
    
    // Add event listeners for message inputs
    const greeting = document.getElementById('greeting');
    const message = document.getElementById('message');
    const closing = document.getElementById('closing');
    
    if (greeting) greeting.addEventListener('input', () => {
        updateCharCounter();
        updateSendButtonState();
    });
    if (message) message.addEventListener('input', () => {
        updateCharCounter();
        updateSendButtonState();
    });
    if (closing) closing.addEventListener('input', () => {
        updateCharCounter();
        updateSendButtonState();
    });
});

// Update character counter
function updateCharCounter() {
    const message = getCombinedMessage();
    const currentLength = document.getElementById('currentLength');
    const charWarning = document.getElementById('charWarning');
    const sendBtn = document.getElementById('sendBtn');
    
    currentLength.textContent = message.length;
    
    if (message.length > 255) {
        currentLength.style.color = '#f44336';
        charWarning.style.display = 'inline';
        if (sendBtn) sendBtn.disabled = true;
    } else {
        currentLength.style.color = '#4CAF50';
        charWarning.style.display = 'none';
        // Only enable send button if other conditions are met
        updateSendButtonState();
    }
    
    // Update message preview
    updateMessagePreview();
}

// Update message preview with placeholder resolution
function updateMessagePreview() {
    const message = getCombinedMessage();
    const preview = document.getElementById('finalMessagePreview');
    const resolution = document.getElementById('placeholderResolution');
    
    if (!message || message.trim() === '') {
        preview.textContent = 'Type your message above to see the preview...';
        resolution.textContent = '';
        return;
    }
    
    // Show a sample preview with placeholder resolution
    const sampleContact = {
        name: 'Ahmed Cafe',
        governororate: 'Baghdad',
        category: 'Restaurant',
        phone: '+9647XXXXXXXXX'
    };
    
    const previewMessage = safeReplaceVariables(message, sampleContact);
    preview.textContent = previewMessage;
    
    // Show placeholder resolution info
    const hasName = message.includes('{{name}}');
    const hasGovernorate = message.includes('{{governorate}}');
    const hasCategory = message.includes('{{category}}');
    const hasPhone = message.includes('{{phone}}');
    
    let resolutionText = '';
    if (hasName) resolutionText += '{{name}} → "Ahmed Cafe" ';
    if (hasGovernorate) resolutionText += '{{governorate}} → "Baghdad" ';
    if (hasCategory) resolutionText += '{{category}} → "Restaurant" ';
    if (hasPhone) resolutionText += '{{phone}} → "+9647XXXXXXXXX" ';
    
    resolution.textContent = resolutionText || 'No placeholders in message';
}

// Update test mode banner visibility
function updateTestModeBanner() {
    const testMode = document.getElementById('testMode');
    const banner = document.getElementById('testModeBanner');
    
    if (testMode && testMode.checked) {
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
}

// Update contact source clarity
function updateSourceClarity() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const sourceClarity = document.getElementById('sourceClarity');
    const sourceType = document.getElementById('sourceType');
    const sourceDetails = document.getElementById('sourceDetails');
    
    if (!sourceClarity) return;
    
    sourceClarity.style.display = 'block';
    
    let details = '';
    if (source === 'csv') {
        sourceType.textContent = 'CSV File';
        details = `Loaded: ${csvParsedData.length} contacts`;
    } else if (source === 'supabase') {
        sourceType.textContent = 'Supabase Database';
        const tableName = document.getElementById('tableName').value;
        details = `Table: ${tableName || 'Not selected'} | Loaded: ${supabaseContacts.length} contacts`;
    } else if (source === 'single') {
        sourceType.textContent = 'Single Phone';
        details = `Test mode: single number`;
    }
    
    sourceDetails.textContent = details;
}

// Update campaign status indicator
function updateCampaignStatus(status) {
    const statusBadge = document.getElementById('statusBadge');
    if (!statusBadge) return;
    
    const statusColors = {
        'Ready': '#4CAF50',
        'Sending': '#2196F3',
        'Stopped': '#ff9800',
        'Completed': '#4CAF50',
        'Error': '#f44336'
    };
    
    statusBadge.textContent = status;
    statusBadge.style.background = statusColors[status] || '#6c757d';
}

// Update send button state based on all conditions
function updateSendButtonState() {
    const sendBtn = document.getElementById('sendBtn');
    if (!sendBtn) return;
    
    const source = document.querySelector('input[name="source"]:checked').value;
    const message = getCombinedMessage();
    const lengthCheck = validateMessageLength(message);
    
    let hasContacts = false;
    if (source === 'csv') hasContacts = csvParsedData.length > 0;
    else if (source === 'supabase') hasContacts = supabaseContacts.length > 0;
    else if (source === 'single') hasContacts = singleContact !== null;
    
    const canSend = hasContacts && message && message.length > 0 && lengthCheck.valid;
    sendBtn.disabled = !canSend;
}

// Shared phone normalization helper - ensures consistency across frontend and backend
function normalizePhoneNumber(phone) {
    if (!phone) return null;
    
    let normalized = phone.trim().replace(/-/g, '').replace(/\s/g, '').replace(/,/g, '');
    
    // Convert 07XXXXXXXXX to +9647XXXXXXXXX
    if (normalized.startsWith('07')) {
        normalized = '+964' + normalized.substring(1);
    }
    
    return normalized;
}

// Validate Iraqi mobile format
function isValidIraqiPhone(phone) {
    const iraqiMobilePattern = /^\+9647\d{9}$/;
    return iraqiMobilePattern.test(phone);
}

// Validate message length (max 255 characters)
function validateMessageLength(message) {
    if (message.length > 255) {
        return {
            valid: false,
            length: message.length,
            max: 255,
            error: `Final message is too long for provider limit (255 characters). Please shorten it. Current: ${message.length} characters.`
        };
    }
    return {
        valid: true,
        length: message.length,
        max: 255
    };
}

// Safe variable replacement with fallbacks to prevent broken messages
function safeReplaceVariables(message, contact) {
    let result = message;
    
    // Replace {{name}} with fallback to prevent broken greetings
    result = result.replace(/\{\{name\}\}/g, (match) => {
        const name = (contact.name || '').trim();
        return name || 'Hello'; // Fallback to "Hello" if name is missing/empty
    });
    
    // Replace {{governorate}} with fallback
    result = result.replace(/\{\{governorate\}\}/g, (match) => {
        const governorate = (contact.governorate || '').trim();
        return governorate || 'your area';
    });
    
    // Replace {{category}} with fallback
    result = result.replace(/\{\{category\}\}/g, (match) => {
        const category = (contact.category || '').trim();
        return category || 'your business';
    });
    
    // Replace {{phone}} - no fallback needed, phone is required
    result = result.replace(/\{\{phone\}\}/g, (match) => {
        return contact.phone || '';
    });
    
    return result;
}

// Helper function to get combined message from the three fields
function getCombinedMessage() {
    const greeting = document.getElementById('greeting').value;
    const mainMessage = document.getElementById('message').value;
    const closing = document.getElementById('closing').value;
    
    // Trim each part and join cleanly without double blank lines
    const parts = [];
    if (greeting) parts.push(greeting.trim());
    if (mainMessage) parts.push(mainMessage.trim());
    if (closing) parts.push(closing.trim());
    
    return parts.join('\n\n').trim();
}

// Insert variable into the currently focused textarea
function insertVariable(variable) {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'TEXTAREA')) {
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const text = activeElement.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);
        activeElement.value = before + variable + after;
        activeElement.selectionStart = activeElement.selectionEnd = start + variable.length;
        activeElement.focus();
    }
}

// Update mode badges based on checkbox states
function updateModeBadges() {
    const dryRunMode = document.getElementById('dryRunMode').checked;
    const testMode = document.getElementById('testMode').checked;
    
    const dryRunBadge = document.getElementById('dryRunBadge');
    const testModeBadge = document.getElementById('testModeBadge');
    const liveModeBadge = document.getElementById('liveModeBadge');
    
    dryRunBadge.style.display = dryRunMode ? 'inline-block' : 'none';
    testModeBadge.style.display = testMode ? 'inline-block' : 'none';
    liveModeBadge.style.display = (!dryRunMode && !testMode) ? 'inline-block' : 'none';
}

// Show contacts preview table
function showContactsTable() {
    const container = document.getElementById('contactsTableContainer');
    const tbody = document.getElementById('contactsTableBody');
    
    if (container.style.display === 'none') {
        container.style.display = 'block';
        renderContactsTable('all');
    } else {
        container.style.display = 'none';
    }
}

// Filter contacts table
function filterContactsTable() {
    const filter = document.getElementById('tableFilter').value;
    renderContactsTable(filter);
}

// Render contacts table with filter
function renderContactsTable(filter) {
    const tbody = document.getElementById('contactsTableBody');
    const source = document.querySelector('input[name="source"]:checked').value;
    
    let contacts = [];
    if (source === 'csv') {
        contacts = csvParsedData;
    } else if (source === 'supabase') {
        contacts = supabaseContacts;
    } else if (source === 'single') {
        contacts = [singleContact];
    }
    
    // Validate phones for status
    const phones = new Set();
    let html = '';
    
    contacts.forEach((contact, index) => {
        let phone = contact.phone || '';
        let status = 'Valid';
        let statusColor = 'green';
        
        if (phone) {
            phone = phone.trim().replace(/-/g, '').replace(/\s/g, '');
            if (phone.startsWith('07')) {
                phone = '+964' + phone.substring(1);
            }
            
            const iraqiMobilePattern = /^\+9647\d{9}$/;
            if (!iraqiMobilePattern.test(phone)) {
                status = 'Invalid';
                statusColor = 'red';
            } else if (phones.has(phone)) {
                status = 'Duplicate';
                statusColor = 'orange';
            } else {
                phones.add(phone);
            }
        } else {
            status = 'Invalid';
            statusColor = 'red';
        }
        
        // Apply filter
        if (filter === 'valid' && status !== 'Valid') return;
        if (filter === 'duplicates' && status !== 'Duplicate') return;
        
        html += `
            <tr>
                <td>${contact.name || 'No name'}</td>
                <td>${contact.phone || 'NO_PHONE'}</td>
                <td>${contact.governorate || 'N/A'}</td>
                <td>${contact.category || 'N/A'}</td>
                <td style="color: ${statusColor}; font-weight: bold;">${status}</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = html || '<tr><td colspan="5">No contacts to display</td></tr>';
}

// Update stats dashboard
function updateStats(stats) {
    document.getElementById('statTotal').textContent = stats.total || 0;
    document.getElementById('statValid').textContent = stats.valid || 0;
    document.getElementById('statInvalid').textContent = stats.invalid || 0;
    document.getElementById('statDuplicates').textContent = stats.duplicates || 0;
    document.getElementById('statPending').textContent = stats.pending || 0;
    document.getElementById('statSent').textContent = stats.sent || 0;
    document.getElementById('statFailed').textContent = stats.failed || 0;
    document.getElementById('statSkipped').textContent = stats.skipped || 0;
    document.getElementById('statRemaining').textContent = stats.remaining || 0;
}

// Update current recipient display
function updateCurrentRecipient(name, phone) {
    const currentRecipient = document.getElementById('currentRecipient');
    document.getElementById('currentRecipientName').textContent = name || '-';
    document.getElementById('currentRecipientPhone').textContent = phone || '-';
    currentRecipient.style.display = 'block';
}

function toggleSource() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const csvSection = document.getElementById('csvSection');
    const supabaseSection = document.getElementById('supabaseSection');
    const singleSection = document.getElementById('singleSection');
    const sendBtn = document.getElementById('sendBtn');
    
    // Check message fields
    const greeting = document.getElementById('greeting').value;
    const mainMessage = document.getElementById('mainMessage').value;
    const hasMessage = greeting || mainMessage;

    if (source === 'csv') {
        csvSection.style.display = 'flex';
        supabaseSection.style.display = 'none';
        singleSection.style.display = 'none';
        sendBtn.disabled = csvParsedData.length === 0 || !hasMessage;
    } else if (source === 'supabase') {
        csvSection.style.display = 'none';
        supabaseSection.style.display = 'flex';
        singleSection.style.display = 'none';
        sendBtn.disabled = supabaseContacts.length === 0 || !hasMessage;
    } else if (source === 'single') {
        csvSection.style.display = 'none';
        supabaseSection.style.display = 'none';
        singleSection.style.display = 'flex';
        sendBtn.disabled = !singleContact || !hasMessage;
    }
}

// Initialize mode badges on page load
document.addEventListener('DOMContentLoaded', function() {
    updateModeBadges();
    
    // Add event listeners for message fields to update send button state
    document.getElementById('greeting').addEventListener('input', toggleSource);
    document.getElementById('mainMessage').addEventListener('input', toggleSource);
    document.getElementById('closing').addEventListener('input', toggleSource);
});

function loadCSV() {
    const fileInput = document.getElementById('csvFile');
    const file = fileInput.files[0];
    const status = document.getElementById('csvStatus');
    const preview = document.getElementById('csvPreview');
    const sendBtn = document.getElementById('sendBtn');

    if (!file) {
        status.textContent = 'Please select a CSV file';
        return;
    }

    csvValidationErrors = []; // Reset validation errors
    const reader = new FileReader();
    reader.onload = function(e) {
        csvData = e.target.result;
        
        // Parse CSV
        const lines = csvData.split('\n').filter(line => line.trim());
        const headers = lines[0].split(',').map(h => h.trim());
        
        // Validate required columns
        const requiredColumns = ['phone'];
        const optionalColumns = ['name', 'governorate', 'category'];
        const missingColumns = requiredColumns.filter(col => !headers.includes(col));
        
        if (missingColumns.length > 0) {
            status.textContent = 'Error: Missing required columns';
            preview.innerHTML = `
                <div style="color: red; padding: 15px; background: #fee; border-radius: 5px; border: 2px solid #fcc;">
                    <h3>❌ CSV Validation Error</h3>
                    <p><strong>Missing required columns:</strong> ${missingColumns.join(', ')}</p>
                    <p><strong>Required columns:</strong> ${requiredColumns.join(', ')}</p>
                    <p><strong>Optional columns:</strong> ${optionalColumns.join(', ')}</p>
                    <p><strong>Found columns:</strong> ${headers.join(', ')}</p>
                </div>
            `;
            csvValidationErrors.push(`Missing required columns: ${missingColumns.join(', ')}`);
            sendBtn.disabled = true;
            return;
        }
        
        // Warn about optional columns
        const missingOptional = optionalColumns.filter(col => !headers.includes(col));
        if (missingOptional.length > 0) {
            csvValidationErrors.push(`Optional columns missing: ${missingOptional.join(', ')}`);
        }
        
        csvParsedData = [];
        const phones = new Set();
        let validPhones = 0;
        let invalidPhones = 0;
        let duplicates = 0;
        let multiplePhones = 0;
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.trim());
            const row = {};
            headers.forEach((h, idx) => {
                row[h] = values[idx] || '';
            });
            
            // Check opt_in
            if (row.opt_in !== 'true' && row.opt_in !== '1' && row.opt_in !== 'yes') {
                continue;
            }
            
            // Validate phone
            let phone = row.phone || '';
            if (phone) {
                phone = phone.trim().replace(/-/g, '').replace(/\s/g, '');
                
                // Detect multiple phone numbers in one cell
                if (phone.includes(',')) {
                    multiplePhones++;
                    csvValidationErrors.push(`Row ${i}: Multiple phone numbers detected - will use first number`);
                    phone = phone.split(',')[0].trim();
                }
                
                if (phone.startsWith('07')) {
                    phone = '+964' + phone.substring(1);
                }
                
                const iraqiMobilePattern = /^\+9647\d{9}$/;
                if (iraqiMobilePattern.test(phone)) {
                    validPhones++;
                    if (phones.has(phone)) {
                        duplicates++;
                    } else {
                        phones.add(phone);
                        csvParsedData.push(row);
                    }
                } else {
                    invalidPhones++;
                }
            } else {
                invalidPhones++;
            }
        }
        
        status.textContent = `Loaded: ${file.name}`;
        
        // Show preview summary with validation warnings
        let validationWarnings = '';
        if (csvValidationErrors.length > 0) {
            validationWarnings = `
                <div style="background: #fff3cd; padding: 10px; border-radius: 5px; border: 2px solid #ffc107; margin-top: 10px;">
                    <h4 style="margin-top: 0; color: #856404;">⚠️ Validation Warnings</h4>
                    <ul style="margin: 5px 0; padding-left: 20px; color: #856404;">
                        ${csvValidationErrors.slice(0, 5).map(e => `<li>${e}</li>`).join('')}
                        ${csvValidationErrors.length > 5 ? `<li>... and ${csvValidationErrors.length - 5} more warnings</li>` : ''}
                    </ul>
                </div>
            `;
        }
        
        preview.innerHTML = `
            <div class="preview-summary">
                <h3>CSV Preview Summary</h3>
                <p><strong>Total rows loaded:</strong> ${lines.length - 1}</p>
                <p><strong>Valid phones:</strong> ${validPhones}</p>
                <p><strong>Invalid phones:</strong> ${invalidPhones}</p>
                <p><strong>Duplicates removed:</strong> ${duplicates}</p>
                ${multiplePhones > 0 ? `<p style="color: #ff9800;"><strong>Multiple phones detected:</strong> ${multiplePhones}</p>` : ''}
                <p><strong>Ready to send:</strong> ${csvParsedData.length}</p>
            </div>
            ${validationWarnings}
            <h4>Sample records (first 5):</h4>
            ${csvParsedData.slice(0, 5).map(c => 
                `<div>${c.phone} - ${c.name || 'No name'} (${c.city || 'No city'}, ${c.category || 'No category'})</div>`
            ).join('')}
        `;
        
        // Populate CSV preview table (first 20 rows)
        populateCSVPreviewTable(headers, lines.slice(1, 21));
        
        // Show column mapping
        showColumnMapping(headers);
        
        sendBtn.disabled = csvParsedData.length === 0;
        
        // Update stats dashboard
        updateStats({
            total: lines.length - 1,
            valid: validPhones,
            invalid: invalidPhones,
            duplicates: duplicates,
            pending: csvParsedData.length,
            sent: 0,
            failed: 0,
            skipped: 0,
            remaining: csvParsedData.length
        });
    };
    reader.readAsText(file);
}

// Populate CSV preview table
function populateCSVPreviewTable(headers, rows) {
    const headerEl = document.getElementById('csvPreviewHeader');
    const bodyEl = document.getElementById('csvPreviewBody');
    const container = document.getElementById('csvPreviewTableContainer');
    
    if (!headers || headers.length === 0) {
        container.style.display = 'none';
        return;
    }
    
    container.style.display = 'block';
    
    // Build header row
    let headerHTML = '<tr>';
    headers.forEach(h => {
        headerHTML += `<th style="padding: 8px; background: #f8f9fa; border: 1px solid #ddd; white-space: nowrap;">${h}</th>`;
    });
    headerHTML += '</tr>';
    headerEl.innerHTML = headerHTML;
    
    // Build body rows
    let bodyHTML = '';
    rows.forEach(row => {
        const values = row.split(',').map(v => v.trim());
        bodyHTML += '<tr>';
        values.forEach(v => {
            bodyHTML += `<td style="padding: 8px; border: 1px solid #ddd; white-space: nowrap;">${v || ''}</td>`;
        });
        bodyHTML += '</tr>';
    });
    bodyEl.innerHTML = bodyHTML;
}

// Show column mapping
function showColumnMapping(headers) {
    const mappingEl = document.getElementById('columnMapping');
    
    const fieldMapping = {
        'phone': headers.find(h => h.toLowerCase().includes('phone')),
        'name': headers.find(h => h.toLowerCase().includes('name')),
        'governorate': headers.find(h => h.toLowerCase().includes('governorate') || h.toLowerCase().includes('gov')),
        'category': headers.find(h => h.toLowerCase().includes('category') || h.toLowerCase().includes('cat'))
    };
    
    mappingEl.innerHTML = `
        <h4 style="margin-top: 0; color: #2c3e50;">📋 Column Mapping</h4>
        <p><strong>Phone:</strong> ${fieldMapping.phone || '⚠️ Not found'}</p>
        <p><strong>Name:</strong> ${fieldMapping.name || '⚠️ Not found'}</p>
        <p><strong>Governorate:</strong> ${fieldMapping.governorate || '⚠️ Not found'}</p>
        <p><strong>Category:</strong> ${fieldMapping.category || '⚠️ Not found'}</p>
        <p style="font-size: 0.9em; color: #666;">Available columns: ${headers.join(', ')}</p>
    `;
    mappingEl.style.display = 'block';
}

// Debug Preview Mode - shows rendered messages per row
function debugPreviewMode() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const message = getCombinedMessage();
    const preview = document.getElementById('csvPreview');
    
    if (!message) {
        preview.innerHTML = '<div style="color: red;">Please write a message first.</div>';
        return;
    }
    
    let contacts = [];
    if (source === 'csv') {
        contacts = csvParsedData;
    } else if (source === 'supabase') {
        contacts = supabaseContacts;
    } else if (source === 'single') {
        contacts = [singleContact];
    }
    
    if (contacts.length === 0) {
        preview.innerHTML = '<div style="color: red;">No contacts loaded. Please load contacts first.</div>';
        return;
    }
    
    const previewCount = Math.min(10, contacts.length);
    let previewHTML = `
        <div class="debug-preview" style="background: #e3f2fd; padding: 15px; border-radius: 5px; border: 2px solid #2196F3;">
            <h3 style="margin-top: 0; color: #2c3e50;">🔍 Debug Preview Mode (First ${previewCount})</h3>
    `;
    
    for (let i = 0; i < previewCount; i++) {
        const contact = contacts[i];
        const personalizedMessage = safeReplaceVariables(message, contact);
        
        // Check for missing variables
        const missingVars = [];
        if (!contact.name) missingVars.push('name');
        if (!contact.governorate) missingVars.push('governorate');
        if (!contact.category) missingVars.push('category');
        
        const warningStyle = missingVars.length > 0 ? 'border-left: 4px solid #ff9800;' : 'border-left: 4px solid #4CAF50;';
        const warningText = missingVars.length > 0 ? `<p style="color: #ff9800; font-size: 0.85em;">⚠️ Missing variables: ${missingVars.join(', ')}</p>` : '';
        
        previewHTML += `
            <div style="background: white; padding: 12px; margin: 8px 0; border-radius: 4px; ${warningStyle}">
                <p><strong>Name:</strong> ${contact.name || '⚠️ MISSING'}</p>
                <p><strong>Phone:</strong> ${contact.phone || 'NO_PHONE'}</p>
                <p><strong>Governorate:</strong> ${contact.governorate || '⚠️ MISSING'}</p>
                <p><strong>Category:</strong> ${contact.category || '⚠️ MISSING'}</p>
                <hr style="margin: 8px 0; border: none; border-top: 1px solid #eee;">
                <p><strong>Final Message:</strong></p>
                <div style="background: #f8f9fa; padding: 8px; border-radius: 4px; font-family: monospace; white-space: pre-wrap;">${personalizedMessage}</div>
                ${warningText}
            </div>
        `;
    }
    
    if (contacts.length > 10) {
        previewHTML += `<p style="color: #666;">... and ${contacts.length - 10} more contacts</p>`;
    }
    
    previewHTML += '</div>';
    preview.innerHTML = previewHTML;
}

// Show pre-send summary
function showPreSendSummary() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const message = getCombinedMessage();
    const dryRunMode = document.getElementById('dryRunMode').checked;
    const testMode = document.getElementById('testMode').checked;
    const skipPreviouslyContacted = document.getElementById('skipPreviouslyContacted').checked;
    const campaignName = document.getElementById('campaignName').value;
    
    if (!message) {
        alert('Please write a message first.');
        return;
    }
    
    let contacts = [];
    let sourceLabel = '';
    let sourceStatus = '';
    
    if (source === 'csv') {
        contacts = csvParsedData;
        sourceLabel = 'CSV Upload';
        sourceStatus = 'Full dataset';
    } else if (source === 'supabase') {
        contacts = supabaseContacts;
        sourceLabel = 'Supabase Table';
        sourceStatus = 'Full dataset';
    } else if (source === 'single') {
        contacts = [singleContact];
        sourceLabel = 'Single Phone';
        sourceStatus = 'N/A';
    }
    
    if (contacts.length === 0) {
        alert('No contacts loaded. Please load contacts first.');
        return;
    }
    
    // Validate contacts
    const phones = new Set();
    let validPhones = 0;
    let invalidPhones = 0;
    let duplicateCount = 0;
    const invalidPhoneList = [];
    
    contacts.forEach(contact => {
        const phone = normalizePhoneNumber(contact.phone);
        
        if (phone) {
            if (isValidIraqiPhone(phone)) {
                validPhones++;
                if (phones.has(phone)) {
                    duplicateCount++;
                } else {
                    phones.add(phone);
                }
            } else {
                invalidPhones++;
                if (invalidPhoneList.length < 10) {
                    invalidPhoneList.push(contact.phone || 'NO_PHONE');
                }
            }
        } else {
            invalidPhones++;
        }
    });
    
    const finalRecipients = phones.size;
    const mode = dryRunMode ? 'Dry Run (no sending)' : (testMode ? 'Test Mode (1 number only)' : 'Real Send');
    const modeColor = dryRunMode ? '#ffc107' : (testMode ? '#ff9800' : '#4CAF50');
    
    const summaryHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div>
                <p><strong>📊 Total Contacts Loaded:</strong> ${contacts.length}</p>
                <p><strong>✅ Valid Contacts:</strong> ${validPhones}</p>
                <p><strong>❌ Invalid Numbers:</strong> ${invalidPhones}</p>
                <p><strong>🔄 Duplicates Removed:</strong> ${duplicateCount}</p>
                <p><strong>🎯 Final Recipients:</strong> <span style="font-size: 1.2em; font-weight: bold; color: #4CAF50;">${finalRecipients}</span></p>
            </div>
            <div>
                <p><strong>📁 Data Source:</strong> ${sourceLabel}</p>
                <p><strong>📋 Source Status:</strong> ${sourceStatus}</p>
                <p><strong>🏷️ Campaign Name:</strong> ${campaignName || 'Auto-generated'}</p>
                <p><strong>📝 Skip Previously Contacted:</strong> ${skipPreviouslyContacted ? 'Yes' : 'No'}</p>
                <p><strong>⚡ Mode:</strong> <span style="color: ${modeColor}; font-weight: bold;">${mode}</span></p>
            </div>
        </div>
        ${duplicateCount > 0 ? `
            <div style="margin-top: 15px; background: #fff3cd; padding: 10px; border-radius: 5px; border: 2px solid #ffc107;">
                <p style="margin: 0; color: #856404;"><strong>Duplicates found:</strong> ${duplicateCount} contacts</p>
                <p style="font-size: 0.9em; color: #666;">These numbers have already been contacted in previous campaigns or earlier in this session.</p>
                <p style="font-size: 0.9em; color: #666;">To fix this:</p>
                <ul style="font-size: 0.9em; color: #666; margin-left: 20px;">
                    <li>Use a new campaign name</li>
                    <li>Disable "Skip previously contacted numbers" for testing</li>
                    <li>Use a different phone number</li>
                </ul>
            </div>
        ` : ''}
        ${invalidPhones > 0 ? `
            <div style="margin-top: 15px; background: #fee; padding: 10px; border-radius: 5px; border: 1px solid #fcc;">
                <p style="margin: 0; color: #c00;"><strong>⚠️ Invalid Numbers Preview (first 10):</strong> ${invalidPhoneList.join(', ')}</p>
            </div>
        ` : ''}
        ${csvValidationErrors.length > 0 ? `
            <div style="margin-top: 15px; background: #fff3cd; padding: 10px; border-radius: 5px; border: 1px solid #ffc107;">
                <p style="margin: 0; color: #856404;"><strong>⚠️ CSV Validation Warnings:</strong> ${csvValidationErrors.slice(0, 3).join(', ')}${csvValidationErrors.length > 3 ? '...' : ''}</p>
            </div>
        ` : ''}
    `;
    
    document.getElementById('preSendSummaryContent').innerHTML = summaryHTML;
    
    // Build pre-send checklist
    const checklist = document.getElementById('checklistItems');
    const lengthCheck = validateMessageLength(message);
    if (checklist) {
        let checklistHTML = '';
        
        // Data loaded
        checklistHTML += `<div style="color: ${validPhones > 0 ? '#4CAF50' : '#f44336'};">${validPhones > 0 ? '✅' : '❌'} Data loaded: ${validPhones} valid contacts</div>`;
        
        // Valid contacts count
        checklistHTML += `<div style="color: ${validPhones > 0 ? '#4CAF50' : '#f44336'};">${validPhones > 0 ? '✅' : '❌'} Valid contacts count: ${validPhones}</div>`;
        
        // Message length valid
        checklistHTML += `<div style="color: ${lengthCheck.valid ? '#4CAF50' : '#f44336'};">${lengthCheck.valid ? '✅' : '❌'} Message length valid: ${lengthCheck.length} / 255</div>`;
        
        // No missing required fields
        checklistHTML += `<div style="color: ${invalidPhones === 0 ? '#4CAF50' : '#f44336'};">${invalidPhones === 0 ? '✅' : '❌'} No missing required fields: ${invalidPhones} invalid contacts</div>`;
        
        // Mode (Test / Real)
        checklistHTML += `<div style="color: #4CAF50;">✅ Mode: ${testMode ? 'Test Mode' : 'Real Sending Mode'}</div>`;
        
        // Campaign name
        checklistHTML += `<div style="color: ${campaignName ? '#4CAF50' : '#ff9800'};">${campaignName ? '✅' : '⚠️'} Campaign name: ${campaignName || 'Auto-generated'}</div>`;
        
        checklist.innerHTML = checklistHTML;
    }
    
    document.getElementById('preSendSummary').style.display = 'block';
    
    // Store summary data for confirmation
    window.preSendData = {
        contacts,
        finalRecipients,
        validPhones,
        invalidPhones,
        duplicateCount
    };
    
    // If 200+ contacts, require SEND NOW confirmation
    if (finalRecipients >= 200 && !dryRunMode) {
        document.getElementById('sendNowConfirmation').style.display = 'block';
        document.getElementById('confirmSendBtn').disabled = true;
        document.getElementById('confirmSendBtn').style.opacity = '0.5';
    }
}

// Check SEND NOW input
function checkSendNowInput() {
    const input = document.getElementById('sendNowInput').value.trim();
    const confirmBtn = document.getElementById('confirmSendBtn');
    
    if (input === 'SEND NOW') {
        confirmBtn.disabled = false;
        confirmBtn.style.opacity = '1';
    } else {
        confirmBtn.disabled = true;
        confirmBtn.style.opacity = '0.5';
    }
}

// Confirm and start sending
function confirmAndSend() {
    document.getElementById('preSendSummary').style.display = 'none';
    sendMessages();
}

// Cancel send
function cancelSend() {
    document.getElementById('preSendSummary').style.display = 'none';
    document.getElementById('sendNowConfirmation').style.display = 'none';
    document.getElementById('sendNowInput').value = '';
    document.getElementById('confirmSendBtn').disabled = false;
    document.getElementById('confirmSendBtn').style.opacity = '1';
}

// Resume sending
function resumeSending() {
    if (!sendingProgress.isPaused) {
        alert('No paused sending to resume.');
        return;
    }
    
    sendingProgress.isPaused = false;
    document.getElementById('resumeBtn').style.display = 'none';
    document.getElementById('stopBtn').disabled = false;
    
    // Continue sending from where we left off
    continueSending();
}

// Continue sending from paused state
async function continueSending() {
    if (!sendingProgress.session) {
        alert('No session to resume from.');
        return;
    }
    
    const session = sendingProgress.session;
    const campaignId = session.campaign_id;
    const resumeFromIndex = session.current_index || 0;
    const processedPhones = new Set(session.processed_numbers || []);
    
    const source = document.querySelector('input[name="source"]:checked').value;
    const message = getCombinedMessage();
    const ctaType = document.getElementById('ctaType').value;
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const progress = document.getElementById('progress');
    const results = document.getElementById('results');
    const tableName = document.getElementById('tableName').value;
    const batchSize = parseInt(document.getElementById('batchSize').value) || 20;
    const messageDelay = parseInt(document.getElementById('messageDelay').value) || 2;
    const batchDelay = parseInt(document.getElementById('batchDelay').value) || 15;
    const randomDelay = document.getElementById('randomDelay').checked;
    const skipPreviouslyContacted = document.getElementById('skipPreviouslyContacted').checked;
    
    if (!message) {
        alert('Please write a message first.');
        return;
    }
    
    shouldStopSending = false;
    sendingProgress.isPaused = false;
    
    sendBtn.disabled = true;
    stopBtn.disabled = false;
    resumeBtn.style.display = 'none';
    progress.style.display = 'block';
    results.innerHTML = '';
    
    try {
        let contacts = [];
        if (source === 'csv') {
            contacts = csvParsedData;
        } else if (source === 'supabase') {
            contacts = supabaseContacts;
        } else if (source === 'single') {
            contacts = [singleContact];
        }
        
        if (contacts.length === 0) {
            alert('No contacts loaded. Please load contacts first.');
            return;
        }
        
        // Skip already processed contacts
        contacts = contacts.slice(resumeFromIndex);
        
        const totalContacts = session.total_count;
        const remainingContacts = contacts.length;
        const totalBatches = Math.ceil(remainingContacts / batchSize);
        
        let allResults = [];
        let sentCount = session.sent_count || 0;
        let failedCount = session.failed_count || 0;
        let skippedCount = session.skipped_count || 0;
        
        // Update campaign session to sending status
        try {
            await fetch('/api/campaign/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignId,
                    currentIndex: resumeFromIndex,
                    sentCount,
                    failedCount,
                    skippedCount,
                    processedNumbers: Array.from(processedPhones),
                    status: 'sending'
                })
            });
        } catch (updateError) {
            console.error('Failed to update campaign session on resume:', updateError);
        }
        
        progress.innerHTML = `
            <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border: 2px solid #ffc107;">
                <h3>🔄 Resuming Campaign</h3>
                <p>Campaign: ${campaignId}</p>
                <p>Resuming from contact ${resumeFromIndex}</p>
                <p>Remaining: ${remainingContacts} contacts</p>
            </div>
        `;
        
        // Send remaining batches
        for (let i = 0; i < remainingContacts; i += batchSize) {
            if (shouldStopSending) {
                // Update campaign session to stopped status
                try {
                    await fetch('/api/campaign/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            campaignId,
                            currentIndex: resumeFromIndex + i,
                            sentCount,
                            failedCount,
                            skippedCount,
                            processedNumbers: Array.from(processedPhones),
                            status: 'stopped'
                        })
                    });
                } catch (updateError) {
                    console.error('Failed to update campaign session on stop:', updateError);
                }
                progress.innerHTML = '<div style="color: orange;">⚠️ Stopped by user</div>';
                break;
            }
            
            const batch = contacts.slice(i, i + batchSize);
            const batchNum = Math.floor(i / batchSize) + 1;
            
            progress.innerHTML = `
                <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; border: 2px solid #2196F3;">
                    <div style="background: #e9ecef; height: 20px; border-radius: 10px; margin: 10px 0;">
                        <div style="background: #2196F3; height: 100%; border-radius: 10px; width: ${Math.round((resumeFromIndex + i) / totalContacts * 100)}%"></div>
                    </div>
                    <p><strong>Sending batch ${batchNum}/${totalBatches}</strong> (${batch.length} contacts)</p>
                    <p>Resumed from: ${resumeFromIndex} | Sent: ${sentCount} | Failed: ${failedCount} | Remaining: ${remainingContacts - i - batch.length}</p>
                </div>
            `;
            
            const response = await fetch('/api/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    source: source === 'csv' ? 'csv' : 'supabase',
                    csvData: source === 'csv' ? JSON.stringify(batch) : null,
                    message,
                    ctaType,
                    singleContact: source === 'single' ? batch[0] : null,
                    table: tableName,
                    contacts: source === 'supabase' ? batch : null,
                    campaignId,
                    skipPreviouslyContacted,
                    messageDelay,
                    randomDelay
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                allResults = allResults.concat(data.results);
                sentCount += data.results.filter(r => r.status === 'sent').length;
                failedCount += data.results.filter(r => r.status !== 'sent').length;
                skippedCount += data.results.filter(r => r.status === 'skipped').length;
                
                // Track processed phones
                data.results.forEach(r => {
                    if (r.phone) {
                        processedPhones.add(r.phone);
                    }
                });
                
                // Update campaign session progress
                try {
                    await fetch('/api/campaign/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            campaignId,
                            currentIndex: resumeFromIndex + i + batch.length,
                            sentCount,
                            failedCount,
                            skippedCount,
                            processedNumbers: Array.from(processedPhones),
                            status: 'sending'
                        })
                    });
                } catch (updateError) {
                    console.error('Failed to update campaign session:', updateError);
                }
            } else {
                progress.innerHTML += `<p style="color: red;">Error in batch: ${data.error}</p>`;
                break;
            }
            
            // Random delay between batches
            if (i + batchSize < remainingContacts) {
                const batchDelayMs = batchDelay * 1000;
                const actualDelay = randomDelay ? batchDelayMs * (0.5 + Math.random()) : batchDelayMs;
                await new Promise(resolve => setTimeout(resolve, actualDelay));
            }
        }
        
        progress.innerHTML = `
            <div style="background: #c8e6c9; padding: 15px; border-radius: 5px; border: 2px solid #4CAF50;">
                <h3>✅ Sending Complete</h3>
                <p>Total: ${totalContacts}</p>
                <p style="color: green;">Sent: ${sentCount}</p>
                <p style="color: red;">Failed: ${failedCount}</p>
                <p style="color: orange;">Skipped: ${skippedCount}</p>
            </div>
        `;
        
        // Mark campaign session as completed
        try {
            await fetch('/api/campaign/update', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignId,
                    currentIndex: totalContacts,
                    sentCount,
                    failedCount,
                    skippedCount,
                    processedNumbers: Array.from(processedPhones),
                    status: 'completed'
                })
            });
        } catch (updateError) {
            console.error('Failed to mark campaign as completed:', updateError);
        }
        
    } catch (error) {
        progress.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    }
    
    sendBtn.disabled = false;
    stopBtn.disabled = true;
    shouldStopSending = false;
}

// Send test message to single number
async function sendTestMessage() {
    const testPhone = document.getElementById('testPhone').value.trim();
    const message = getCombinedMessage();
    const ctaType = document.getElementById('ctaType').value;
    const campaignName = document.getElementById('campaignName').value;
    
    if (!testPhone) {
        alert('Please enter a phone number to test.');
        return;
    }
    
    if (!message) {
        alert('Please write a message first.');
        return;
    }
    
    // Validate message length
    const lengthCheck = validateMessageLength(message);
    if (!lengthCheck.valid) {
        alert(lengthCheck.error);
        return;
    }
    
    // Normalize phone number
    let normalizedPhone = testPhone.replace(/-/g, '').replace(/\s/g, '').replace(/,/g, '');
    if (normalizedPhone.startsWith('07')) {
        normalizedPhone = '+964' + normalizedPhone.substring(1);
    }
    
    // Validate Iraqi mobile format
    const iraqiMobilePattern = /^\+9647\d{9}$/;
    if (!iraqiMobilePattern.test(normalizedPhone)) {
        alert('Invalid Iraqi mobile format. Please use format: +9647XXXXXXXXX');
        return;
    }
    
    if (!confirm(`Send test message to ${normalizedPhone}?`)) {
        return;
    }
    
    // Generate campaign ID for test
    const campaignId = campaignName || `Test_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    const testContact = {
        phone: normalizedPhone,
        name: 'Test Recipient',
        governororate: 'Test',
        category: 'Test'
    };
    
    const progress = document.getElementById('progress');
    progress.style.display = 'block';
    progress.innerHTML = '<div style="background: #fff3cd; padding: 15px; border-radius: 5px; border: 2px solid #ffc107;">Sending test message...</div>';
    
    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                source: 'single',
                singleContact: testContact,
                message,
                ctaType,
                campaignId,
                skipPreviouslyContacted: false,
                messageDelay: 0,
                randomDelay: false
            })
        });
        
        const data = await response.json();
        
        if (data.success && data.results.length > 0) {
            const result = data.results[0];
            if (result.status === 'sent') {
                progress.innerHTML = `
                    <div style="background: #d4edda; padding: 15px; border-radius: 5px; border: 2px solid #28a745;">
                        <h3 style="margin-top: 0; color: #155724;">✅ Test Message Sent Successfully</h3>
                        <p><strong>To:</strong> ${normalizedPhone}</p>
                        <p><strong>Status:</strong> Sent</p>
                    </div>
                `;
                if (response.ok) {
                    const results = document.getElementById('results');
                    results.innerHTML = `<div style="background: #c8e6c9; padding: 15px; border-radius: 5px; border: 2px solid #4CAF50;">
                        <h3 style="margin-top: 0;">✅ Message sent successfully to ${normalizedPhone}</h3>
                        <p><strong>Status:</strong> ${data.success ? 'Sent' : 'Failed'}</p>
                        <p><strong>Response:</strong> ${JSON.stringify(data)}</p>
                    </div>`;
                    
                    // Show payload debug
                    const payloadDebug = document.getElementById('payloadDebug');
                    if (payloadDebug) {
                        payloadDebug.style.display = 'block';
                        document.getElementById('payloadKeys').textContent = 'Payload keys: ["phone", "message"]';
                        document.getElementById('lastPayload').textContent = JSON.stringify({
                            phone: normalizedPhone,
                            message: message
                        }, null, 2);
                    }
                }
            } else {
                progress.innerHTML = `
                    <div style="background: #f8d7da; padding: 15px; border-radius: 5px; border: 2px solid #dc3545;">
                        <h3 style="margin-top: 0; color: #721c24;">❌ Test Message Failed</h3>
                        <p><strong>To:</strong> ${normalizedPhone}</p>
                        <p><strong>Status:</strong> Failed</p>
                        <p><strong>Error:</strong> ${JSON.stringify(result.response)}</p>
                    </div>
                `;
            }
        } else {
            progress.innerHTML = `
                <div style="background: #f8d7da; padding: 15px; border-radius: 5px; border: 2px solid #dc3545;">
                    <h3 style="margin-top: 0; color: #721c24;">❌ Test Message Failed</h3>
                    <p><strong>Error:</strong> ${data.error || 'Unknown error'}</p>
                </div>
            `;
        }
    } catch (error) {
        progress.innerHTML = `
            <div style="background: #f8d7da; padding: 15px; border-radius: 5px; border: 2px solid #dc3545;">
                <h3 style="margin-top: 0; color: #721c24;">❌ Test Message Failed</h3>
                <p><strong>Error:</strong> ${error.message}</p>
            </div>
        `;
    }
}

// Export full dataset to CSV
function exportCSV() {
    const tableName = document.getElementById('tableName').value;
    const cityFilter = document.getElementById('cityFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;
    
    const url = `/api/export-csv?table=${tableName}&city=${cityFilter}&category=${categoryFilter}`;
    window.open(url, '_blank');
}

async function loadSupabase(loadAll = false) {
    const status = document.getElementById('supabaseStatus');
    const preview = document.getElementById('csvPreview');
    const sendBtn = document.getElementById('sendBtn');
    const tableName = document.getElementById('tableName').value;
    const cityFilter = document.getElementById('cityFilter').value;
    const categoryFilter = document.getElementById('categoryFilter').value;
    
    // Reset stats
    updateStats({
        total: 0,
        valid: 0,
        invalid: 0,
        duplicates: 0,
        pending: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        remaining: 0
    });

    status.textContent = 'Loading...';
    console.log('Loading from Supabase...', { tableName, cityFilter, categoryFilter, loadAll });

    try {
        const url = `/api/contacts?table=${tableName}&city=${cityFilter}&category=${categoryFilter}&loadAll=${loadAll}`;
        console.log('Fetching:', url);
        const response = await fetch(url);
        const data = await response.json();
        console.log('Response:', data);
        
        if (data.success) {
            supabaseContacts = data.contacts || [];
            const totalCount = data.totalCount || 0;
            const loadedCount = data.loadedCount || 0;
            const isPartial = data.isPartial || false;
            
            console.log('Contacts loaded:', loadedCount, 'of', totalCount);
            
            // Build status message with clear indication of partial/full load
            let statusMessage = '';
            if (isPartial) {
                statusMessage = `⚠️ PARTIAL LOAD: ${loadedCount} of ${totalCount} rows loaded`;
            } else {
                statusMessage = `✅ FULL LOAD: ${loadedCount} of ${totalCount} rows loaded`;
            }
            status.textContent = statusMessage;
            
            // Validate phones for stats
            const phones = new Set();
            let validPhones = 0;
            let invalidPhones = 0;
            let duplicateCount = 0;
            
            supabaseContacts.forEach(contact => {
                let phone = contact.phone || '';
                if (phone) {
                    phone = phone.trim().replace(/-/g, '').replace(/\s/g, '');
                    if (phone.startsWith('07')) {
                        phone = '+964' + phone.substring(1);
                    }
                    
                    const iraqiMobilePattern = /^\+9647\d{9}$/;
                    if (iraqiMobilePattern.test(phone)) {
                        validPhones++;
                        if (phones.has(phone)) {
                            duplicateCount++;
                        } else {
                            phones.add(phone);
                        }
                    } else {
                        invalidPhones++;
                    }
                } else {
                    invalidPhones++;
                }
            });
            
            // Build preview with clear status indicators
            let previewHTML = '';
            
            if (isPartial) {
                previewHTML += `
                    <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border: 2px solid #ffc107; margin-bottom: 10px;">
                        <h3 style="margin-top: 0; color: #856404;">⚠️ Partial Dataset Loaded</h3>
                        <p><strong>Table contains:</strong> ${totalCount} rows</p>
                        <p><strong>Currently loaded:</strong> ${loadedCount} rows</p>
                        <p><strong>Sending will use:</strong> Only the ${loadedCount} loaded rows</p>
                        <button onclick="loadSupabase(true)" style="margin-top: 10px; background: #ff9800;">Load All ${totalCount} Rows</button>
                    </div>
                `;
            } else {
                previewHTML += `
                    <div style="background: #d4edda; padding: 15px; border-radius: 5px; border: 2px solid #28a745; margin-bottom: 10px;">
                        <h3 style="margin-top: 0; color: #155724;">✅ Full Dataset Loaded</h3>
                        <p><strong>Table contains:</strong> ${totalCount} rows</p>
                        <p><strong>Currently loaded:</strong> ${loadedCount} rows</p>
                        <p><strong>Sending will use:</strong> All ${loadedCount} rows</p>
                    </div>
                `;
            }
            
            if (supabaseContacts.length === 0) {
                previewHTML += '<div style="color: orange;">No records found. Check table name or filters.</div>';
            } else {
                previewHTML += `
                    <h4>Sample records (first 5):</h4>
                    ${supabaseContacts.slice(0, 5).map(c => 
                        `<div>${c.phone || 'NO_PHONE'} - ${c.name || 'No name'} (${c.city || 'No city'}, ${c.category || 'No category'})</div>`
                    ).join('')}
                    ${supabaseContacts.length > 5 ? `<div style="margin-top: 10px; color: #666;">... and ${supabaseContacts.length - 5} more</div>` : ''}
                `;
            }
            
            preview.innerHTML = previewHTML;
            
            sendBtn.disabled = supabaseContacts.length === 0;
            
            // Update stats dashboard
            updateStats({
                total: totalCount,
                valid: validPhones,
                invalid: invalidPhones,
                duplicates: duplicateCount,
                pending: phones.size,
                sent: 0,
                failed: 0,
                skipped: 0,
                remaining: phones.size
            });
            
            updateSourceClarity();
            updateSendButtonState();
        } else {
            status.textContent = 'Error: ' + (data.error || 'Unknown error');
            preview.innerHTML = `<div style="color: red;">${data.error || 'Unknown error'}</div>`;
            if (data.availableTables) {
                preview.innerHTML += `<div style="color: #666; margin-top: 5px;">Available tables: ${data.availableTables.join(', ')}</div>`;
            }
            console.error('API Error:', data.error);
        }
    } catch (error) {
        status.textContent = 'Error: ' + error.message;
        console.error('Fetch Error:', error);
    }
}

async function populateFilters() {
    const tableName = document.getElementById('tableName').value;
    const cityFilter = document.getElementById('cityFilter');
    const categoryFilter = document.getElementById('categoryFilter');

    console.log('Populating filters for table:', tableName);

    try {
        const response = await fetch(`/api/contacts?table=${tableName}`);
        const data = await response.json();
        console.log('Filter data:', data);
        
        if (data.success && data.contacts) {
            const contacts = data.contacts;
            console.log('Populating from', contacts.length, 'contacts');
            
            // Get unique cities
            const cities = [...new Set(contacts.map(c => c.city).filter(Boolean))].sort();
            cityFilter.innerHTML = '<option value="">All Cities</option>' + 
                cities.map(city => `<option value="${city}">${city}</option>`).join('');
            console.log('Cities found:', cities.length);
            
            // Get unique categories
            const categories = [...new Set(contacts.map(c => c.category).filter(Boolean))].sort();
            categoryFilter.innerHTML = '<option value="">All Categories</option>' + 
                categories.map(category => `<option value="${category}">${category}</option>`).join('');
            console.log('Categories found:', categories.length);
        } else {
            console.error('Failed to populate filters:', data.error);
        }
    } catch (error) {
        console.error('Error populating filters:', error);
    }
}

function loadSingle() {
    const phone = document.getElementById('singlePhone').value.trim();
    const status = document.getElementById('singleStatus');
    const preview = document.getElementById('csvPreview');
    const sendBtn = document.getElementById('sendBtn');

    if (!phone) {
        status.textContent = 'Please enter a phone number';
        return;
    }

    if (!phone.startsWith('+')) {
        status.textContent = 'Phone must start with + (e.g., +9647701234567)';
        return;
    }

    singleContact = { phone, name: 'Test Contact' };
    status.textContent = `Added: ${phone}`;
    preview.innerHTML = `<div>${phone} - Test Contact</div>`;
    sendBtn.disabled = false;
}

function validateCSV() {
    const preview = document.getElementById('csvPreview');
    
    if (csvParsedData.length === 0) {
        preview.innerHTML = '<div style="color: red;">No CSV loaded. Please upload a CSV file first.</div>';
        return;
    }
    
    // Re-validate and show summary
    const phones = new Set();
    let validPhones = 0;
    let invalidPhones = 0;
    let duplicates = 0;
    
    csvParsedData.forEach(row => {
        let phone = row.phone || '';
        if (phone) {
            phone = phone.trim().replace(/-/g, '').replace(/\s/g, '');
            if (phone.startsWith('07')) {
                phone = '+964' + phone.substring(1);
            }
            
            const iraqiMobilePattern = /^\+9647\d{9}$/;
            if (iraqiMobilePattern.test(phone)) {
                validPhones++;
                if (phones.has(phone)) {
                    duplicates++;
                } else {
                    phones.add(phone);
                }
            } else {
                invalidPhones++;
            }
        } else {
            invalidPhones++;
        }
    });
    
    preview.innerHTML = `
        <div class="validation-summary" style="background: #f0f8ff; padding: 15px; border-radius: 5px; border: 2px solid #4CAF50;">
            <h3 style="margin-top: 0; color: #2c3e50;">CSV Validation Report</h3>
            <p><strong>Total rows:</strong> ${csvParsedData.length}</p>
            <p style="color: #4CAF50;"><strong>Valid numbers:</strong> ${validPhones}</p>
            <p style="color: #f44336;"><strong>Invalid numbers:</strong> ${invalidPhones}</p>
            <p style="color: #ff9800;"><strong>Duplicates removed:</strong> ${duplicates}</p>
            <p style="color: #2196F3;"><strong>Ready to send:</strong> ${phones.size}</p>
            ${invalidPhones > 0 ? '<p style="color: #f44336; font-weight: bold;">⚠️ Some numbers are invalid. They will be skipped during sending.</p>' : ''}
            ${duplicates > 0 ? '<p style="color: #ff9800; font-weight: bold;">⚠️ Duplicates will be automatically removed during sending.</p>' : ''}
        </div>
    `;
    
    // Update stats dashboard
    updateStats({
        total: csvParsedData.length,
        valid: validPhones,
        invalid: invalidPhones,
        duplicates: duplicates,
        pending: phones.size,
        sent: 0,
        failed: 0,
        skipped: 0,
        remaining: phones.size
    });
    
    updateSourceClarity();
    updateSendButtonState();
}

function previewMessages() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const message = getCombinedMessage();
    const preview = document.getElementById('csvPreview');
    
    if (!message) {
        preview.innerHTML = '<div style="color: red;">Please write a message first.</div>';
        return;
    }
    
    let contacts = [];
    if (source === 'csv') {
        contacts = csvParsedData;
    } else if (source === 'supabase') {
        contacts = supabaseContacts;
    } else if (source === 'single') {
        contacts = [singleContact];
    }
    
    if (contacts.length === 0) {
        preview.innerHTML = '<div style="color: red;">No contacts loaded. Please load contacts first.</div>';
        return;
    }
    
    const previewCount = Math.min(10, contacts.length);
    let previewHTML = `
        <div class="message-preview" style="background: #fff9c4; padding: 15px; border-radius: 5px; border: 2px solid #FFC107;">
            <h3 style="margin-top: 0; color: #2c3e50;">Message Preview (First ${previewCount})</h3>
            <p style="color: #666; font-size: 14px;">Showing personalized messages for each contact</p>
    `;
    
    for (let i = 0; i < previewCount; i++) {
        const contact = contacts[i];
        const personalizedMessage = safeReplaceVariables(message, contact);
        
        previewHTML += `
            <div style="background: white; padding: 10px; margin: 5px 0; border-radius: 3px; border-left: 3px solid #FFC107;">
                <div style="display: flex; gap: 15px;">
                    <div style="flex: 1;">
                        <strong style="color: #2c3e50;">To:</strong> ${contact.phone || 'NO_PHONE'}<br>
                        <strong style="color: #2c3e50;">Name:</strong> ${contact.name || 'No name'}<br>
                        <strong style="color: #2c3e50;">Location:</strong> ${contact.governorate || 'N/A'} (${contact.category || 'N/A'})
                    </div>
                    <div style="flex: 2; background: #f9f9f9; padding: 8px; border-radius: 3px; font-size: 13px; white-space: pre-wrap;">${personalizedMessage}</div>
                </div>
            </div>
        `;
    }
    
    if (contacts.length > 10) {
        previewHTML += `<p style="color: #666; text-align: center;">... and ${contacts.length - 10} more contacts</p>`;
    }
    
    previewHTML += '</div>';
    preview.innerHTML = previewHTML;
}

function stopSending() {
    shouldStopSending = true;
    sendingProgress.isPaused = true;
    const progress = document.getElementById('progress');
    progress.innerHTML = '<div style="color: orange;">⚠️ Stopping... Please wait for current batch to complete.</div>';
    
    // Show resume button after a short delay
    setTimeout(() => {
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('resumeBtn').style.display = 'inline-block';
        document.getElementById('resumeBtn').disabled = false;
        progress.innerHTML += '<div style="margin-top: 10px; color: #ff9800;">🔄 Paused. Click RESUME to continue from where you left off.</div>';
    }, 2000);
}

async function sendMessages() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const message = getCombinedMessage();
    const ctaType = document.getElementById('ctaType').value;
    const sendBtn = document.getElementById('sendBtn');
    const stopBtn = document.getElementById('stopBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const progress = document.getElementById('progress');
    const results = document.getElementById('results');
    const tableName = document.getElementById('tableName').value;
    const batchSize = parseInt(document.getElementById('batchSize').value) || 20;
    const messageDelay = parseInt(document.getElementById('messageDelay').value) || 2;
    const batchDelay = parseInt(document.getElementById('batchDelay').value) || 15;
    const randomDelay = document.getElementById('randomDelay').checked;
    const maxTotal = parseInt(document.getElementById('maxTotal').value) || 0;
    const testMode = document.getElementById('testMode').checked;
    const dryRunMode = document.getElementById('dryRunMode').checked;
    const skipPreviouslyContacted = document.getElementById('skipPreviouslyContacted').checked;
    const campaignName = document.getElementById('campaignName').value;

    if ((source === 'csv' && csvParsedData.length === 0) || (source === 'supabase' && supabaseContacts.length === 0) || (source === 'single' && !singleContact) || !message) {
        alert('Please load contacts and write a message');
        return;
    }
    
    // Validate message length
    const lengthCheck = validateMessageLength(message);
    if (!lengthCheck.valid) {
        alert(lengthCheck.error);
        sendBtn.disabled = false;
        stopBtn.disabled = true;
        progress.style.display = 'none';
        return;
    }

    // Check for CSV validation errors
    if (source === 'csv' && csvValidationErrors.length > 0) {
        const errorSummary = csvValidationErrors.slice(0, 5).join('\n');
        const moreErrors = csvValidationErrors.length > 5 ? `\n... and ${csvValidationErrors.length - 5} more warnings` : '';
        if (!confirm(`⚠️ CSV has validation errors:\n${errorSummary}${moreErrors}\n\nDo you still want to send? (Not recommended)`)) {
            return;
        }
    }

    shouldStopSending = false;
    contactStatusMap.clear(); // Reset session tracking
    
    // Generate campaign ID
    const campaignId = campaignName || `Campaign_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    sendingProgress.campaignId = campaignId;
    sendingProgress.sentPhones.clear();
    sendingProgress.currentIndex = 0;
    sendingProgress.isPaused = false;
    
    sendBtn.disabled = true;
    stopBtn.disabled = false;
    resumeBtn.style.display = 'none';
    progress.style.display = 'block';
    results.innerHTML = '';
    
    // Update campaign status to sending
    updateCampaignStatus('Sending');

    try {
        let contacts = [];
        if (source === 'csv') {
            contacts = csvParsedData;
        } else if (source === 'supabase') {
            contacts = supabaseContacts;
        } else if (source === 'single') {
            contacts = [singleContact];
        }

        // Start campaign session
        try {
            const startResponse = await fetch('/api/campaign/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    campaignId,
                    campaignName,
                    totalContacts: contacts.length,
                    source,
                    tableName,
                    message,
                    batchSize,
                    messageDelay,
                    batchDelay,
                    randomDelay,
                    skipPreviouslyContacted
                })
            });
            const startData = await startResponse.json();
            if (startData.success) {
                sendingProgress.session = startData.session;
            }
        } catch (sessionError) {
            console.error('Failed to start campaign session:', sessionError);
            // Continue anyway - session is for recovery, not critical for sending
        }

        // Apply max total limit
        if (maxTotal > 0 && contacts.length > maxTotal) {
            contacts = contacts.slice(0, maxTotal);
        }

        // Apply test mode
        if (testMode && contacts.length > 1) {
            contacts = contacts.slice(0, 1);
        }

        const totalContacts = contacts.length;
        
        // Confirmation for sending to more than 50 contacts
        if (!dryRunMode && totalContacts > 50) {
            if (!confirm(`⚠️ You are about to send messages to ${totalContacts} contacts.\n\nThis is a large batch. Are you sure you want to proceed?`)) {
                sendBtn.disabled = false;
                stopBtn.disabled = true;
                progress.style.display = 'none';
                return;
            }
        }
        
        // HARD warning at 200+ contacts (second confirmation)
        if (!dryRunMode && totalContacts > 200) {
            if (!confirm(`🚨 CRITICAL WARNING: You are about to send messages to ${totalContacts} contacts.\n\nThis is a VERY LARGE batch that could trigger spam filters.\n\nAre you ABSOLUTELY sure you want to proceed?`)) {
                sendBtn.disabled = false;
                stopBtn.disabled = true;
                progress.style.display = 'none';
                return;
            }
        }

        const totalBatches = Math.ceil(totalContacts / batchSize);
        let allResults = [];
        let sentCount = 0;
        let failedCount = 0;
        let skippedCount = 0;
        const processedPhones = new Set();

        // Initialize stats
        const phones = new Set();
        let validCount = 0;
        let invalidCount = 0;
        let duplicateCount = 0;

        // Pre-validate contacts
        contacts.forEach(contact => {
            const phone = normalizePhoneNumber(contact.phone);
            
            if (phone) {
                if (isValidIraqiPhone(phone)) {
                    validCount++;
                    if (phones.has(phone)) {
                        duplicateCount++;
                    } else {
                        phones.add(phone);
                    }
                } else {
                    invalidCount++;
                }
            } else {
                invalidCount++;
            }
        });

        // Update initial stats
        updateStats({
            total: totalContacts,
            valid: validCount,
            invalid: invalidCount,
            duplicates: duplicateCount,
            pending: totalContacts,
            sent: 0,
            failed: 0,
            skipped: 0,
            remaining: totalContacts
        });

        // Dry run mode - just simulate
        if (dryRunMode) {
            progress.innerHTML = `
                <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border: 2px solid #ffc107;">
                    <h3>🔍 DRY RUN MODE - No messages will be sent</h3>
                    <p>Total contacts: ${totalContacts}</p>
                    <p>Batch size: ${batchSize}</p>
                    <p>Delay: ${randomDelay ? 'Random (3-6s)' : batchDelay + 'ms'}</p>
                    <p>CTA Type: ${ctaType || 'None'}</p>
                </div>
            `;
            
            // Simulate sending
            for (let i = 0; i < contacts.length; i++) {
                if (shouldStopSending) {
                    progress.innerHTML += '<p style="color: orange;">⚠️ Stopped by user</p>';
                    break;
                }
                
                const contact = contacts[i];
                const personalizedMessage = safeReplaceVariables(message, contact);
                
                allResults.push({ phone: contact.phone, status: 'simulated', message: personalizedMessage });
                sentCount++;
                
                // Update current recipient
                updateCurrentRecipient(contact.name, contact.phone);
                
                // Update stats
                updateStats({
                    total: totalContacts,
                    valid: validCount,
                    invalid: invalidCount,
                    duplicates: duplicateCount,
                    pending: totalContacts - i - 1,
                    sent: sentCount,
                    failed: failedCount,
                    skipped: skippedCount,
                    remaining: totalContacts - i - 1
                });
                
                if (i % batchSize === 0 || i === contacts.length - 1) {
                    const percent = Math.round((i + 1) / totalContacts * 100);
                    progress.innerHTML = `
                        <div style="background: #fff3cd; padding: 15px; border-radius: 5px; border: 2px solid #ffc107;">
                            <h3>🔍 DRY RUN MODE - No messages will be sent</h3>
                            <div style="background: #e9ecef; height: 20px; border-radius: 10px; margin: 10px 0;">
                                <div style="background: #ffc107; height: 100%; border-radius: 10px; width: ${percent}%"></div>
                            </div>
                            <p>Progress: ${percent}% (${i + 1}/${totalContacts})</p>
                            <p>Simulated: ${sentCount}</p>
                        </div>
                    `;
                }
                
                if (randomDelay) {
                    await new Promise(resolve => setTimeout(resolve, 3000 + Math.random() * 3000));
                } else {
                    await new Promise(resolve => setTimeout(resolve, 100)); // Faster in dry run
                }
            }
            
            // Show preview of what would be sent
            results.innerHTML = '<h3>Dry Run Results (First 10):</h3>';
            allResults.slice(0, 10).forEach(result => {
                const div = document.createElement('div');
                div.style.background = '#fff9c4';
                div.style.padding = '10px';
                div.style.margin = '5px 0';
                div.style.borderRadius = '3px';
                div.innerHTML = `<strong>To:</strong> ${result.phone}<br><strong>Message:</strong> ${result.message.substring(0, 100)}...`;
                results.appendChild(div);
            });
            
            progress.innerHTML += '<p style="color: green; font-weight: bold;">✅ Dry run completed. No messages were actually sent.</p>';
        } else {
            // Actual sending
            for (let i = 0; i < contacts.length; i += batchSize) {
                if (shouldStopSending) {
                    progress.innerHTML = '<div style="color: orange;">⚠️ Stopped by user</div>';
                    break;
                }
                
                const batch = contacts.slice(i, i + batchSize);
                const batchNum = Math.floor(i / batchSize) + 1;
                
                progress.innerHTML = `
                    <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; border: 2px solid #2196F3;">
                        <div style="background: #e9ecef; height: 20px; border-radius: 10px; margin: 10px 0;">
                            <div style="background: #2196F3; height: 100%; border-radius: 10px; width: ${Math.round((i / totalContacts) * 100)}%"></div>
                        </div>
                        <p><strong>Sending batch ${batchNum}/${totalBatches}</strong> (${batch.length} contacts)</p>
                        <p>Sent: ${sentCount} | Failed: ${failedCount} | Remaining: ${totalContacts - i - batch.length}</p>
                    </div>
                `;

                const response = await fetch('/api/send', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        source: source === 'csv' ? 'csv' : 'supabase',
                        csvData: source === 'csv' ? JSON.stringify(batch) : null,
                        message,
                        ctaType,
                        singleContact: source === 'single' ? batch[0] : null,
                        table: tableName,
                        contacts: source === 'supabase' ? batch : null,
                        campaignId: sendingProgress.campaignId,
                        skipPreviouslyContacted: skipPreviouslyContacted,
                        messageDelay: messageDelay,
                        randomDelay: randomDelay
                    })
                });

                const data = await response.json();

                if (data.success) {
                    allResults = allResults.concat(data.results);
                    sentCount += data.results.filter(r => r.status === 'sent').length;
                    failedCount += data.results.filter(r => r.status !== 'sent').length;
                    skippedCount += data.results.filter(r => r.status === 'skipped').length;
                    
                    // Track processed phones
                    data.results.forEach(r => {
                        if (r.phone) {
                            processedPhones.add(r.phone);
                        }
                    });
                    
                    // Update stats
                    updateStats({
                        total: totalContacts,
                        valid: validCount,
                        invalid: invalidCount,
                        duplicates: duplicateCount,
                        pending: totalContacts - i - batch.length,
                        sent: sentCount,
                        failed: failedCount,
                        skipped: skippedCount,
                        remaining: totalContacts - i - batch.length
                    });
                    
                    // Update campaign session progress
                    if (sendingProgress.session) {
                        try {
                            await fetch('/api/campaign/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    campaignId: sendingProgress.campaignId,
                                    currentIndex: i + batch.length,
                                    sentCount,
                                    failedCount,
                                    skippedCount,
                                    processedNumbers: Array.from(processedPhones),
                                    status: 'sending'
                                })
                            });
                        } catch (updateError) {
                            console.error('Failed to update campaign session:', updateError);
                        }
                    }
                } else {
                    progress.innerHTML += `<p style="color: red;">Error in batch: ${data.error}</p>`;
                    break;
                }

                // Check if stopped
                if (shouldStopSending) {
                    // Update campaign session to stopped status
                    if (sendingProgress.session) {
                        try {
                            await fetch('/api/campaign/update', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    campaignId: sendingProgress.campaignId,
                                    currentIndex: i + batch.length,
                                    sentCount,
                                    failedCount,
                                    skippedCount,
                                    processedNumbers: Array.from(processedPhones),
                                    status: 'stopped'
                                })
                            });
                        } catch (updateError) {
                            console.error('Failed to update campaign session on stop:', updateError);
                        }
                    }
                    // Update campaign status to stopped
                    updateCampaignStatus('Stopped');
                    progress.innerHTML = '<div style="color: orange;">⚠️ Stopped by user</div>';
                    break;
                }

                // Random delay between batches
                if (i + batchSize < contacts.length) {
                    const batchDelayMs = batchDelay * 1000; // Convert seconds to milliseconds
                    const actualDelay = randomDelay ? batchDelayMs * (0.5 + Math.random()) : batchDelayMs;
                    await new Promise(resolve => setTimeout(resolve, actualDelay));
                }
            }

            progress.innerHTML = `
                <div style="background: #c8e6c9; padding: 15px; border-radius: 5px; border: 2px solid #4CAF50;">
                    <h3>✅ Sending Complete</h3>
                    <p>Total: ${allResults.length}</p>
                    <p style="color: green;">Sent: ${sentCount}</p>
                    <p style="color: red;">Failed: ${failedCount}</p>
                    <p style="color: orange;">Skipped: ${skippedCount}</p>
                </div>
            `;
            
            // Update campaign status to completed
            updateCampaignStatus('Completed');
            
            // Show duplicate reasons if any
            if (duplicateCount > 0) {
                progress.innerHTML += `
                    <p style="color: orange;"><strong>Duplicates found:</strong> ${duplicateCount} contacts</p>
                    <p style="font-size: 0.9em; color: #666;">These numbers have already been contacted in previous campaigns or earlier in this session.</p>
                    <p style="font-size: 0.9em; color: #666;">To fix this:</p>
                    <ul style="font-size: 0.9em; color: #666; margin-left: 20px;">
                        <li>Use a new campaign name</li>
                        <li>Disable "Skip previously contacted numbers" for testing</li>
                        <li>Use a different phone number</li>
                    </ul>
                `;
            }
            
            // Build pre-send checklist
            const checklist = document.getElementById('checklistItems');
            if (checklist) {
                let checklistHTML = '';
                
                // Data loaded
                checklistHTML += `<div style="color: ${validPhones > 0 ? '#4CAF50' : '#f44336'};">${validPhones > 0 ? '✅' : '❌'} Data loaded: ${validPhones} valid contacts</div>`;
                
                // Valid contacts count
                checklistHTML += `<div style="color: ${validPhones > 0 ? '#4CAF50' : '#f44336'};">${validPhones > 0 ? '✅' : '❌'} Valid contacts count: ${validPhones}</div>`;
                
                // Message length valid
                checklistHTML += `<div style="color: ${lengthCheck.valid ? '#4CAF50' : '#f44336'};">${lengthCheck.valid ? '✅' : '❌'} Message length valid: ${lengthCheck.length} / 255</div>`;
                
                // No missing required fields
                checklistHTML += `<div style="color: ${invalidPhones === 0 ? '#4CAF50' : '#f44336'};">${invalidPhones === 0 ? '✅' : '❌'} No missing required fields: ${invalidPhones} invalid contacts</div>`;
                
                // Mode (Test / Real)
                checklistHTML += `<div style="color: #4CAF50;">✅ Mode: ${testMode ? 'Test Mode' : 'Real Sending Mode'}</div>`;
                
                // Campaign name
                checklistHTML += `<div style="color: ${campaignName ? '#4CAF50' : '#ff9800'};">${campaignName ? '✅' : '⚠️'} Campaign name: ${campaignName || 'Auto-generated'}</div>`;
                
                checklist.innerHTML = checklistHTML;
            }

            // Mark campaign session as completed
            if (sendingProgress.session) {
                try {
                    await fetch('/api/campaign/update', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            campaignId: sendingProgress.campaignId,
                            currentIndex: totalContacts,
                            sentCount,
                            failedCount,
                            skippedCount,
                            processedNumbers: Array.from(processedPhones),
                            status: 'completed'
                        })
                    });
                } catch (updateError) {
                    console.error('Failed to mark campaign as completed:', updateError);
                }
            }

            allResults.forEach(result => {
                const div = document.createElement('div');
                div.className = result.status === 'sent' ? 'success' : 'error';
                div.textContent = `${result.phone}: ${result.status}`;
                results.appendChild(div);
            });
        }

    } catch (error) {
        progress.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    }

    sendBtn.disabled = false;
    stopBtn.disabled = true;
    shouldStopSending = false;
}

async function checkTables() {
    const status = document.getElementById('tablesStatus');
    const tablesList = document.getElementById('tablesList');

    status.textContent = 'Checking tables...';
    tablesList.innerHTML = '';

    try {
        const response = await fetch('/api/tables');
        const data = await response.json();
        
        if (data.success) {
            if (data.tables.length === 0) {
                status.textContent = 'No tables found';
                tablesList.innerHTML = data.message || 'Please check your Supabase dashboard for the exact table name.';
                return;
            }
            
            status.textContent = `Found ${data.tables.length} tables`;
            tablesList.innerHTML = data.tables.map(t => 
                `<div class="table-item">
                    <strong>${t.name}</strong>: ${t.count} records
                    ${t.count > 0 ? `<button onclick="selectTable('${t.name}')">Use this table</button>` : ''}
                </div>`
            ).join('');
        } else {
            status.textContent = 'Error: ' + data.error;
        }
    } catch (error) {
        status.textContent = 'Error: ' + error.message;
    }
}

function selectTable(tableName) {
    const select = document.getElementById('tableName');
    select.value = tableName;
    populateFilters();
}

async function copyToContacts() {
    const sourceTable = document.getElementById('tableName').value;
    const status = document.getElementById('supabaseStatus');

    if (!sourceTable) {
        alert('Please select a source table first');
        return;
    }

    if (sourceTable === 'contacts') {
        alert('Source table cannot be the same as destination');
        return;
    }

    status.textContent = 'Copying contacts...';

    try {
        const response = await fetch('/api/copy-contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourceTable })
        });

        const data = await response.json();
        
        if (data.success) {
            status.textContent = data.message;
            alert(`${data.message}\nTotal: ${data.total}\nDuplicates removed: ${data.duplicates}`);
        } else {
            status.textContent = 'Error: ' + data.error;
            alert('Error: ' + data.error);
        }
    } catch (error) {
        status.textContent = 'Error: ' + error.message;
        alert('Error: ' + error.message);
    }
}

async function loadResponses() {
    const responsesDiv = document.getElementById('responses');
    responsesDiv.innerHTML = 'Loading...';

    try {
        const response = await fetch('/api/responses');
        const data = await response.json();
        
        if (data.success) {
            if (data.responses.length === 0) {
                responsesDiv.innerHTML = 'No responses yet';
                return;
            }
            
            responsesDiv.innerHTML = data.responses.map(r => 
                `<div class="response-item">
                    <strong>${r.contacts?.phone || 'Unknown'}</strong> (${r.contacts?.name || 'No name'}): 
                    ${r.response_text} 
                    <span class="response-type">${r.response_type}</span>
                    <span class="response-time">${new Date(r.received_at).toLocaleString()}</span>
                </div>`
            ).join('');
        } else {
            responsesDiv.innerHTML = 'Error: ' + data.error;
        }
    } catch (error) {
        responsesDiv.innerHTML = 'Error: ' + error.message;
    }
}
