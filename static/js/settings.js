// Settings Module
// Handles UI settings: server name, settings modal

// Load server name
async function loadServerName() {
    try {
        const response = window.apiRequest ? await window.apiRequest('/api/ui/settings/server_name') : await fetch('/api/ui/settings/server_name');
        const serverNameDisplay = document.getElementById('server-name-display');
        if (!serverNameDisplay) return;

        if (response.ok) {
            const data = await response.json();
            // Check if value is null, undefined, or empty - only then use default
            let serverName = data.value;
            if (serverName === null || serverName === undefined || serverName === '') {
                serverName = 'My Server Name';
            } else {
                serverName = serverName.trim() || 'My Server Name';
            }
            
            // Update only the text span, preserve the icon
            const span = serverNameDisplay.querySelector('span');
            if (span) {
                span.textContent = serverName;
            } else {
                serverNameDisplay.textContent = serverName;
            }
            
            // Show the panel
            serverNameDisplay.style.display = 'flex';
        } else {
            // If error, use default and show
            const span = serverNameDisplay.querySelector('span');
            if (span) {
                span.textContent = 'My Server Name';
            } else {
                serverNameDisplay.textContent = 'My Server Name';
            }
            serverNameDisplay.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error loading server name:', error);
        // On error, show default
        const serverNameDisplay = document.getElementById('server-name-display');
        if (serverNameDisplay) {
            const span = serverNameDisplay.querySelector('span');
            if (span) {
                span.textContent = 'My Server Name';
            } else {
                serverNameDisplay.textContent = 'My Server Name';
            }
            serverNameDisplay.style.display = 'flex';
        }
    }
}

// Show settings modal
function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    // Hide error/success messages
    const errorEl = document.getElementById('settings-error');
    const successEl = document.getElementById('settings-success');
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';

    // Load current settings
    loadSettingsForm();

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Focus and select all text in the input field
    setTimeout(() => {
        const serverNameInput = document.getElementById('server-name');
        if (serverNameInput) {
            serverNameInput.focus();
            serverNameInput.select();
        }
    }, 100); // Small delay to ensure modal is fully rendered
}

// Close settings modal
function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// Load settings form
async function loadSettingsForm() {
    try {
        const response = window.apiRequest ? await window.apiRequest('/api/ui/settings/server_name') : await fetch('/api/ui/settings/server_name');
        const serverNameInput = document.getElementById('server-name');
        if (!serverNameInput) return;

        if (response.ok) {
            const data = await response.json();
            serverNameInput.value = data.value || 'My Server Name';
        } else {
            // Use default if not set
            serverNameInput.value = 'My Server Name';
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        // Use default on error
        const serverNameInput = document.getElementById('server-name');
        if (serverNameInput) {
            serverNameInput.value = 'My Server Name';
        }
    }
}

// Save settings
async function saveSettings(event) {
    event.preventDefault();

    const serverNameInput = document.getElementById('server-name');
    if (!serverNameInput) return;

    const serverName = serverNameInput.value.trim() || 'My Server Name';

    // Hide previous messages
    const errorEl = document.getElementById('settings-error');
    const successEl = document.getElementById('settings-success');
    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';

    try {
        const response = window.apiRequest ? await window.apiRequest('/api/ui/settings/server_name', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: serverName
            })
        }) : await fetch('/api/ui/settings/server_name', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: serverName
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save settings');
        }

        // Update display in top bar
        await loadServerName();

        // Show toast notification
        if (window.showNotification) {
            window.showNotification('Server name saved successfully', 'success');
        }

        // Close modal immediately
        closeSettingsModal();

    } catch (error) {
        console.error('Error saving settings:', error);
        if (window.showNotification) {
            window.showNotification(`Error saving settings: ${error.message}`, 'error');
        }
    }
}

// Export functions to window for HTML access
window.loadServerName = loadServerName;
window.showSettingsModal = showSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.loadSettingsForm = loadSettingsForm;
window.saveSettings = saveSettings;

