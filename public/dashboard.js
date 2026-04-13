/**
 * NABDA BULK SENDER - DASHBOARD
 * Unified frontend for data load, validate, preview, dry run, and send
 */

// ============ STATE ============
let appState = {
  source: 'csv',
  csvData: '',
  contacts: [],
  message: '',
  isValidated: false,
  validation: null,
  dryRunResult: null,
  isTestMode: false
};

// ============ PHONE UTILS (DUPLICATED FROM BACKEND) ============
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

// ============ STEP 1: LOAD DATA ============
async function loadCSV() {
  const fileInput = document.getElementById('csvFile');
  if (!fileInput.files.length) {
    alert('Please select a CSV file');
    return;
  }

  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = (e) => {
    appState.csvData = e.target.result;
    appState.source = 'csv';
    showDataSummary();
  };
  reader.readAsText(file);
}

async function loadSupabase() {
  if (!window.supabase) {
    alert('Supabase not configured');
    return;
  }

  const table = document.getElementById('tableName').value || 'businesses';
  const city = document.getElementById('cityFilter').value;
  const category = document.getElementById('categoryFilter').value;

  const url = `/api/contacts?table=${table}${city ? '&city=' + city : ''}${category ? '&category=' + category : ''}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.success) {
    appState.contacts = data.contacts;
    appState.source = 'supabase';
    showDataSummary();
  } else {
    alert('Error: ' + data.error);
  }
}

function loadSingle() {
  const phone = document.getElementById('singlePhone').value.trim();
  if (!phone) {
    alert('Enter a phone number');
    return;
  }

  appState.contacts = [{ phone, name: 'Single Contact' }];
  appState.source = 'single';
  showDataSummary();
}

function showDataSummary() {
  let total = 0;
  if (appState.source === 'csv' && appState.csvData) {
    const lines = appState.csvData.split('\n').filter(l => l.trim());
    total = lines.length - 1; // minus header
  } else {
    total = appState.contacts.length;
  }

  const summary = document.getElementById('csvStatus') || document.getElementById('supabaseStatus') || document.getElementById('singleStatus');
  if (summary) {
    summary.textContent = `✓ Loaded: ${total} rows`;
    summary.style.color = '#4CAF50';
  }

  document.getElementById('validateBtn').disabled = false;
}

// ============ STEP 2: VALIDATE ============
async function validateData() {
  const payload = {
    source: appState.source,
    csvData: appState.csvData,
    singleContact: appState.contacts[0]?.phone || '',
    table: document.getElementById('tableName')?.value
  };

  const response = await fetch('/api/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (data.success) {
    appState.validation = data.results;
    appState.isValidated = true;
    showValidationResults();
    showMessagePreview();
  } else {
    alert('Validation error: ' + data.error);
  }
}

function showValidationResults() {
  const val = appState.validation;
  const html = `
    <div style="background: #e3f2fd; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <h4>Validation Results</h4>
      <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 10px 0;">
        <div><strong>Total:</strong> ${val.total}</div>
        <div><strong>Valid:</strong> <span style="color: #4CAF50;">${val.valid}</span></div>
        <div><strong>Invalid:</strong> <span style="color: #f44336;">${val.invalid}</span></div>
        <div><strong>Duplicates:</strong> ${val.duplicates}</div>
      </div>
      <p style="margin: 10px 0; font-size: 12px; color: #666;">
        Invalid reasons: ${JSON.stringify(val.invalid_reasons)}
      </p>
    </div>
  `;

  const container = document.getElementById('validationResults');
  if (container) {
    container.innerHTML = html;
    container.style.display = 'block';
  } else {
    const section = document.querySelector('.section');
    if (section) {
      const div = document.createElement('div');
      div.id = 'validationResults';
      div.innerHTML = html;
      section.appendChild(div);
    }
  }
}

// ============ STEP 3: PREVIEW ============
function showMessagePreview() {
  const msg = document.getElementById('message')?.value || 'Sample message with {{name}}';
  const val = appState.validation;

  if (!val || !val.contacts || val.contacts.length === 0) return;

  let html = '<h4>First 10 Contacts Preview</h4><table style="width: 100%; border-collapse: collapse;">';
  html += '<tr style="background: #f5f5f5;"><th style="border: 1px solid #ddd; padding: 8px;">Business</th><th style="border: 1px solid #ddd; padding: 8px;">Phone</th><th style="border: 1px solid #ddd; padding: 8px;">Language</th><th style="border: 1px solid #ddd; padding: 8px;">Message Preview</th></tr>';

  val.contacts.slice(0, 10).forEach(contact => {
    let preview = msg;
    preview = preview.replace(/\{\{name\}\}/g, contact.business_name);
    preview = preview.replace(/\{\{governorate\}\}/g, contact.governorate);
    preview = preview.replace(/\{\{category\}\}/g, contact.category);
    preview = preview.replace(/\{\{phone\}\}/g, contact.phone_normalized);
    if (preview.length > 60) preview = preview.substring(0, 57) + '...';

    html += `<tr style="border: 1px solid #ddd;">
      <td style="padding: 8px; border: 1px solid #ddd;">${contact.business_name}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-family: monospace; font-size: 12px;">${contact.phone_normalized}</td>
      <td style="padding: 8px; border: 1px solid #ddd;">${contact.language_detected}</td>
      <td style="padding: 8px; border: 1px solid #ddd; font-size: 12px;">${preview}</td>
    </tr>`;
  });

  html += '</table>';

  const container = document.getElementById('messagePreview');
  if (container) {
    container.innerHTML = html;
    container.style.display = 'block';
  }
}

function showDebugPreview() {
  const val = appState.validation;
  if (!val || !val.contacts) {
    alert('No validation data. Run validation first.');
    return;
  }

  let html = '<h4>Debug Preview (First 5)</h4><pre style="background: #f5f5f5; padding: 10px; overflow-x: auto;">';
  val.contacts.slice(0, 5).forEach(contact => {
    html += JSON.stringify(contact, null, 2) + '\n---\n';
  });
  html += '</pre>';

  const container = document.getElementById('debugPreview');
  if (container) {
    container.innerHTML = html;
    container.style.display = 'block';
  }
}

// ============ STEP 4: DRY RUN ============
async function runDryRun() {
  const message = document.getElementById('message')?.value || '';
  if (!message.trim()) {
    alert('Please write a message');
    return;
  }

  const payload = {
    source: appState.source,
    csvData: appState.csvData,
    message,
    singleContact: appState.contacts[0]?.phone || '',
    table: document.getElementById('tableName')?.value
  };

  const response = await fetch('/api/dry-run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (data.success) {
    appState.dryRunResult = data.results;
    showDryRunResults();
  } else {
    alert('Dry run error: ' + data.error);
  }
}

function showDryRunResults() {
  const dr = appState.dryRunResult;
  const html = `
    <div style="background: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <h4>🧪 Dry Run Results (NOT SENT)</h4>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0;">
        <div><strong>Would Send:</strong> <span style="color: #4CAF50;">${dr.would_send}</span></div>
        <div><strong>Would Skip:</strong> ${dr.would_skip}</div>
        <div><strong>Invalid:</strong> <span style="color: #f44336;">${dr.invalid}</span></div>
      </div>
      <details style="margin-top: 10px;">
        <summary>View sample logs</summary>
        <pre style="background: #f5f5f5; padding: 10px; font-size: 12px; overflow-x: auto;">
${JSON.stringify(dr.summary, null, 2)}
        </pre>
      </details>
    </div>
  `;

  const container = document.getElementById('dryRunResults');
  if (container) {
    container.innerHTML = html;
    container.style.display = 'block';
  }

  document.getElementById('sendBtn').disabled = false;
}

// ============ STEP 5: SEND ============
async function sendMessages() {
  if (!confirm(`Ready to send messages to ${appState.dryRunResult?.would_send || '?'} contacts?`)) {
    return;
  }

  const message = document.getElementById('message')?.value || '';
  const campaignId = document.getElementById('campaignId')?.value || '';

  const payload = {
    source: appState.source,
    csvData: appState.csvData,
    message,
    singleContact: appState.contacts[0]?.phone || '',
    campaignId,
    table: document.getElementById('tableName')?.value
  };

  const btnText = document.getElementById('sendBtn');
  btnText.disabled = true;
  btnText.textContent = 'Sending...';

  const response = await fetch('/api/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  btnText.disabled = false;
  btnText.textContent = 'Send Messages';

  if (data.success) {
    showSendResults(data.results);
  } else {
    alert('Send error: ' + data.error);
  }
}

function showSendResults(results) {
  const html = `
    <div style="background: #c8e6c9; padding: 15px; border-radius: 5px; margin: 15px 0;">
      <h4>✓ Send Complete</h4>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin: 10px 0;">
        <div><strong>Sent:</strong> <span style="color: #4CAF50; font-size: 18px;">${results.sent}</span></div>
        <div><strong>Failed:</strong> <span style="color: #f44336; font-size: 18px;">${results.failed}</span></div>
        <div><strong>Skipped:</strong> ${results.skipped}</div>
      </div>
      <details style="margin-top: 10px;">
        <summary>View logs (first 10)</summary>
        <pre style="background: #f5f5f5; padding: 10px; font-size: 11px; overflow-x: auto;">
${JSON.stringify(results.logs.slice(0, 10), null, 2)}
        </pre>
      </details>
    </div>
  `;

  const container = document.getElementById('sendResults');
  if (container) {
    container.innerHTML = html;
    container.style.display = 'block';
  }
}

// ============ TOGGLE SOURCE ============
function toggleSource() {
  const source = document.querySelector('input[name="source"]:checked').value;
  document.getElementById('csvSection').style.display = source === 'csv' ? 'block' : 'none';
  document.getElementById('supabaseSection').style.display = source === 'supabase' ? 'block' : 'none';
  document.getElementById('singleSection').style.display = source === 'single' ? 'block' : 'none';
  appState.source = source;
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  // Enable buttons based on state
  setInterval(() => {
    if (appState.isValidated) {
      document.getElementById('dryRunBtn').disabled = false;
      document.getElementById('previewBtn').disabled = false;
      document.getElementById('debugBtn').disabled = false;
    }
  }, 500);
});
