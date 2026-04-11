let csvData = '';

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
        
        // Show preview
        const lines = csvData.split('\n').slice(0, 5);
        preview.innerHTML = lines.map(line => `<div>${line}</div>`).join('');
        
        sendBtn.disabled = false;
    };
    reader.readAsText(file);
}

async function sendMessages() {
    const message = document.getElementById('message').value;
    const sendBtn = document.getElementById('sendBtn');
    const progress = document.getElementById('progress');
    const results = document.getElementById('results');

    if (!csvData || !message) {
        alert('Please load CSV and write a message');
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
            body: JSON.stringify({ csvData, message })
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
