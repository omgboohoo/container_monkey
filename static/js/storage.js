// Storage Module
// Handles storage settings: S3 configuration, local storage, testing connections

// Load storage settings
async function loadStorageSettings() {
    try {
        const response = await fetch('/api/storage/settings');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load storage settings');
        }

        window.AppState.currentStorageSettings = data;
        const toggle = document.getElementById('storage-toggle');
        if (toggle) {
            toggle.checked = data.storage_type === 's3';
        }
    } catch (error) {
        console.error('Error loading storage settings:', error);
    }
}

// Toggle storage type
async function toggleStorageType() {
    const toggle = document.getElementById('storage-toggle');
    if (!toggle) return;

    if (toggle.checked) {
        // Switching to S3 - show configuration modal (will load saved settings from database)
        await showS3ConfigModal();
    } else {
        // Switching to local - show confirmation modal
        showLocalStorageConfirmModal();
    }
}

// Show local storage confirm modal
function showLocalStorageConfirmModal() {
    const modal = document.getElementById('local-storage-confirm-modal');
    if (!modal) return;
    modal.style.display = 'block';
}

// Close local storage confirm modal
function closeLocalStorageConfirmModal() {
    const modal = document.getElementById('local-storage-confirm-modal');
    const toggle = document.getElementById('storage-toggle');

    if (modal) {
        modal.style.display = 'none';
    }

    // Reset toggle if user cancelled
    if (toggle && window.AppState.currentStorageSettings && window.AppState.currentStorageSettings.storage_type === 's3') {
        toggle.checked = true;
    }
}

// Confirm switch to local
async function confirmSwitchToLocal() {
    const toggle = document.getElementById('storage-toggle');
    closeLocalStorageConfirmModal();

    // Save settings to local
    await saveStorageSettings('local');

    // Ensure toggle is unchecked (it should be already, but just in case)
    if (toggle) {
        toggle.checked = false;
    }
}

// Show S3 config modal
async function showS3ConfigModal() {
    const modal = document.getElementById('s3-config-modal');
    const errorEl = document.getElementById('s3-config-error');
    const successEl = document.getElementById('s3-config-success');

    if (!modal) return;

    if (errorEl) errorEl.style.display = 'none';
    if (successEl) successEl.style.display = 'none';

    // Always reload settings from database to get latest values
    try {
        const response = await fetch('/api/storage/settings');
        const data = await response.json();

        if (response.ok && data) {
            // Populate form fields with saved settings
            const bucketEl = document.getElementById('s3-bucket');
            const regionEl = document.getElementById('s3-region');
            const accessKeyEl = document.getElementById('s3-access-key');
            const secretKeyField = document.getElementById('s3-secret-key');

            if (bucketEl) bucketEl.value = data.s3_bucket || '';
            if (regionEl) regionEl.value = data.s3_region || '';
            if (accessKeyEl) accessKeyEl.value = data.s3_access_key || '';
            // Secret key is masked for security - leave field empty or show placeholder
            // User must enter secret key if they want to change it
            if (secretKeyField) {
                if (data.s3_secret_key === '***') {
                    // Secret key exists but is masked - show placeholder
                    secretKeyField.value = '';
                    secretKeyField.placeholder = 'Enter new secret key (leave blank to keep existing)';
                } else {
                    secretKeyField.value = '';
                    secretKeyField.placeholder = '';
                }
            }

            // Update currentStorageSettings (without secret key for security)
            window.AppState.currentStorageSettings = data;
        }
    } catch (error) {
        console.error('Error loading storage settings:', error);
        // If loading fails, try to use cached settings
        if (window.AppState.currentStorageSettings) {
            const bucketEl = document.getElementById('s3-bucket');
            const regionEl = document.getElementById('s3-region');
            const accessKeyEl = document.getElementById('s3-access-key');
            const secretKeyField = document.getElementById('s3-secret-key');

            if (bucketEl) bucketEl.value = window.AppState.currentStorageSettings.s3_bucket || '';
            if (regionEl) regionEl.value = window.AppState.currentStorageSettings.s3_region || '';
            if (accessKeyEl) accessKeyEl.value = window.AppState.currentStorageSettings.s3_access_key || '';
            // Don't populate secret key from cache for security
            if (secretKeyField) {
                secretKeyField.value = '';
                if (window.AppState.currentStorageSettings.s3_secret_key === '***') {
                    secretKeyField.placeholder = 'Enter new secret key (leave blank to keep existing)';
                }
            }
        }
    }

    modal.style.display = 'block';
}

// Close S3 config modal
function closeS3ConfigModal() {
    const modal = document.getElementById('s3-config-modal');
    const toggle = document.getElementById('storage-toggle');

    if (modal) {
        modal.style.display = 'none';
    }

    // Reset toggle if settings weren't saved
    if (toggle && window.AppState.currentStorageSettings && window.AppState.currentStorageSettings.storage_type === 'local') {
        toggle.checked = false;
    }
}

// Test S3 connection
async function testS3Connection() {
    const bucketEl = document.getElementById('s3-bucket');
    const regionEl = document.getElementById('s3-region');
    const accessKeyEl = document.getElementById('s3-access-key');
    const secretKeyField = document.getElementById('s3-secret-key');

    if (!bucketEl || !regionEl || !accessKeyEl || !secretKeyField) return;

    const bucket = bucketEl.value.trim();
    const region = regionEl.value.trim();
    const accessKey = accessKeyEl.value.trim();
    const secretKey = secretKeyField.value.trim();

    // For testing, secret key is required
    if (!bucket || !region || !accessKey || !secretKey) {
        if (window.showNotification) {
            window.showNotification('Please fill in all fields (including secret key for testing)', 'warning');
        }
        return;
    }

    // Show loading state
    const testBtn = event.target.closest('button');
    if (!testBtn) return;

    const originalText = testBtn.innerHTML;
    testBtn.disabled = true;
    testBtn.innerHTML = '<i class="ph ph-spinner" style="animation: spin 1s linear infinite;"></i> Testing...';

    try {
        const response = await fetch('/api/storage/test-s3', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                s3_bucket: bucket,
                s3_region: region,
                s3_access_key: accessKey,
                s3_secret_key: secretKey
            })
        });

        const data = await response.json();

        if (data.success) {
            if (window.showNotification) {
                window.showNotification(data.message || 'S3 connection test successful!', 'success');
            }
        } else {
            if (window.showNotification) {
                window.showNotification(data.message || 'S3 connection test failed', 'error');
            }
        }
    } catch (error) {
        if (window.showNotification) {
            window.showNotification(`Error testing connection: ${error.message}`, 'error');
        }
    } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = originalText;
    }
}

// Show S3 error (deprecated: use showNotification directly)
function showS3Error(message) {
    if (window.showNotification) {
        window.showNotification(message, 'error');
    }
}

// Save S3 config
async function saveS3Config(event) {
    event.preventDefault();

    const bucketEl = document.getElementById('s3-bucket');
    const regionEl = document.getElementById('s3-region');
    const accessKeyEl = document.getElementById('s3-access-key');
    const secretKeyField = document.getElementById('s3-secret-key');

    if (!bucketEl || !regionEl || !accessKeyEl || !secretKeyField) return;

    const bucket = bucketEl.value.trim();
    const region = regionEl.value.trim();
    const accessKey = accessKeyEl.value.trim();
    const secretKey = secretKeyField.value.trim();

    // Validate required fields (secret key can be empty if preserving existing)
    if (!bucket || !region || !accessKey) {
        if (window.showNotification) {
            window.showNotification('Please fill in bucket, region, and access key', 'warning');
        }
        return;
    }

    // If secret key is empty, send masked value to preserve existing
    const secretKeyToSend = secretKey || '***';

    // Close modal immediately as requested
    closeS3ConfigModal();
    if (window.showNotification) {
        window.showNotification('Saving S3 configuration...', 'info');
    }

    await saveStorageSettings('s3', bucket, region, accessKey, secretKeyToSend);
}

// Save storage settings
async function saveStorageSettings(storageType, bucket = '', region = '', accessKey = '', secretKey = '') {
    try {
        const response = await fetch('/api/storage/settings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                storage_type: storageType,
                s3_bucket: bucket,
                s3_region: region,
                s3_access_key: accessKey,
                s3_secret_key: secretKey
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save storage settings');
        }

        // Update current settings
        await loadStorageSettings();

        // Show success message
        if (window.showNotification) {
            if (storageType === 's3') {
                window.showNotification('S3 settings saved successfully!', 'success');
            } else {
                window.showNotification('Switched to local storage successfully', 'success');
            }
        }

        // Refresh backup list
        if (window.loadBackups) {
            window.loadBackups();
        }

    } catch (error) {
        console.error('Error saving storage settings:', error);
        if (window.showNotification) {
            window.showNotification(`Error saving settings: ${error.message}`, 'error');
        }
    }
}

// Export functions to window for HTML access
window.loadStorageSettings = loadStorageSettings;
window.toggleStorageType = toggleStorageType;
window.showLocalStorageConfirmModal = showLocalStorageConfirmModal;
window.closeLocalStorageConfirmModal = closeLocalStorageConfirmModal;
window.confirmSwitchToLocal = confirmSwitchToLocal;
window.showS3ConfigModal = showS3ConfigModal;
window.closeS3ConfigModal = closeS3ConfigModal;
window.testS3Connection = testS3Connection;
window.showS3Error = showS3Error;
window.saveS3Config = saveS3Config;
window.saveStorageSettings = saveStorageSettings;

