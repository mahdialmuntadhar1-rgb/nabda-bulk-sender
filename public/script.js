let csvData = '';
let supabaseContacts = [];
let singleContact = null;

function toggleSource() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const csvSection = document.getElementById('csvSection');
    const supabaseSection = document.getElementById('supabaseSection');
    const singleSection = document.getElementById('singleSection');
    const sendBtn = document.getElementById('sendBtn');
    
    if (source === 'csv') {
        csvSection.style.display = 'flex';
        supabaseSection.style.display = 'none';
        singleSection.style.display = 'none';
    } else if (source === 'supabase') {
        csvSection.style.display = 'none';
        supabaseSection.style.display = 'flex';
        singleSection.style.display = 'none';
    } else if (source === 'single') {
        csvSection.style.display = 'none';
        supabaseSection.style.display = 'none';
        singleSection.style.display = 'flex';
    }
    
    sendBtn.disabled = true;
}

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

    const reader = new FileReader();
    reader.onload = function(e) {
        csvData = e.target.result;
        status.textContent = `Loaded: ${file.name}`;
        
        const lines = csvData.split('\n').slice(0, 5);
        preview.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
        
        sendBtn.disabled = false;
    };
    reader.readAsText(file);
}

async function loadSupabase() {
    const status = document.getElementById('supabaseStatus');
    const preview = document.getElementById('csvPreview');
    const sendBtn = document.getElementById('sendBtn');
    const tableName = document.getElementById('tableName').value;

    status.textContent = 'Loading...';

    try {
        const response = await fetch(`/api/contacts?table=${tableName}`);
        const data = await response.json();
        
        if (data.success) {
            supabaseContacts = data.contacts;
            status.textContent = `Loaded ${data.contacts.length} contacts from ${tableName}`;
            
            preview.innerHTML = data.contacts.slice(0, 5).map(c => 
                `<div>${c.phone} - ${c.name || 'No name'}</div>`
            ).join('');
            
            sendBtn.disabled = false;
        } else {
            status.textContent = 'Error: ' + data.error;
        }
    } catch (error) {
        status.textContent = 'Error: ' + error.message;
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

async function sendMessages() {
    const source = document.querySelector('input[name="source"]:checked').value;
    const message = document.getElementById('message').value;
    const ctaType = document.getElementById('ctaType').value;
    const sendBtn = document.getElementById('sendBtn');
    const progress = document.getElementById('progress');
    const results = document.getElementById('results');

    if ((source === 'csv' && !csvData) || (source === 'supabase' && supabaseContacts.length === 0) || (source === 'single' && !singleContact) || !message) {
        alert('Please load contacts and write a message');
        return;
    }

    sendBtn.disabled = true;
    progress.style.display = 'block';
    progress.textContent = 'Sending messages...';
    results.innerHTML = '';

    try {
        const response = await fetch('/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ source, csvData, message, ctaType, singleContact })
        });

        const data = await response.json();
        
        if (data.success) {
            progress.textContent = 'Messages sent!';
            
            data.results.forEach(result => {
                const div = document.createElement('div');
                div.className = result.status === 'sent' ? 'success' : 'error';
                div.textContent = `${result.phone}: ${result.status}`;
                results.appendChild(div);
            });
        } else {
            progress.textContent = 'Error: ' + data.error;
        }
    } catch (error) {
        progress.textContent = 'Error: ' + error.message;
    }

    sendBtn.disabled = false;
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
