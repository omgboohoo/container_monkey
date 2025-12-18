// Backups Module
// Handles backup file management: loading, displaying, uploading, downloading, restoring, deleting

// Load backups
async function loadBackups() {
    const errorEl = document.getElementById('backups-error');
    const backupsList = document.getElementById('backups-list');
    const backupsSpinner = document.getElementById('backups-spinner');
    const backupsWrapper = document.getElementById('backups-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';
    if (backupsList) backupsList.innerHTML = '';

    // Clear search input when reloading
    const searchInput = document.getElementById('backup-search-input');
    if (searchInput) searchInput.value = '';

    // Show spinner and prevent scrollbars
    if (backupsSpinner) backupsSpinner.style.display = 'flex';
    if (backupsWrapper) {
        backupsWrapper.style.overflow = 'hidden';
        backupsWrapper.classList.add('loading-grid');
    }

    try {
        const response = await fetch('/api/backups');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load backups');
        }

        // Store all backups for filtering and sorting
        window.AppState.allBackups = data.backups || [];

        // Apply current sort if any, then render
        let backupsToDisplay = window.AppState.allBackups;
        if (window.AppState.currentBackupSortColumn) {
            backupsToDisplay = sortBackupsData([...window.AppState.allBackups], window.AppState.currentBackupSortColumn, window.AppState.currentBackupSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-backup-${window.AppState.currentBackupSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = window.AppState.currentBackupSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderBackups(backupsToDisplay);

    } catch (error) {
        if (errorEl) {
            errorEl.textContent = `Error: ${error.message}`;
            errorEl.style.display = 'block';
        }
    } finally {
        // Hide spinner and restore overflow
        if (backupsSpinner) backupsSpinner.style.display = 'none';
        if (backupsWrapper) {
            backupsWrapper.style.overflow = '';
            backupsWrapper.classList.remove('loading-grid');
        }
    }
}

// Create backup row
function createBackupRow(backup) {
    const tr = document.createElement('tr');
    tr.className = 'backup-row';

    const backupType = backup.type || (backup.filename.endsWith('.zip') ? 'container' : 'network');
    const sizeMB = (backup.size / (1024 * 1024)).toFixed(2);
    const sizeKB = (backup.size / 1024).toFixed(2);
    const sizeDisplay = backup.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
    const createdDate = new Date(backup.created).toLocaleString();

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    // Build type display
    const typeDisplay = backupType === 'network'
        ? '<span style="color: #667eea;">🌐 Network</span>'
        : '<span style="color: #10b981;">📦 Container</span>';

    // Build backup type display (manual/scheduled)
    const backupTypeValue = backup.backup_type || 'manual';
    const backupTypeDisplay = backupTypeValue === 'scheduled'
        ? '<span style="color: #f59e0b; font-weight: 500;"><i class="ph ph-clock-clockwise" style="margin-right: 4px;"></i>Scheduled</span>'
        : '<span style="color: var(--text-secondary);"><i class="ph ph-hand" style="margin-right: 4px;"></i>Manual</span>';

    // Build actions column
    const actionsHtml = `
        <div class="btn-group" style="display: flex; gap: 4px; flex-wrap: nowrap;">
            ${backupType === 'container'
            ? `<button class="btn btn-primary btn-sm" onclick="showRestoreModal('${escapeHtml(backup.filename)}')" title="Restore container backup"><i class="ph ph-upload-simple"></i> Restore</button>`
            : `<button class="btn btn-primary btn-sm" onclick="restoreNetworkBackup('${escapeHtml(backup.filename)}')" title="Restore network backup"><i class="ph ph-upload-simple"></i> Restore</button>`
        }
        </div>
    `;

    // Build storage location display
    const storageLocation = backup.storage_location || 'local';
    const storageDisplay = storageLocation === 's3'
        ? '<span style="color: #3b82f6; font-weight: 500;"><i class="ph ph-cloud" style="margin-right: 4px;"></i>S3</span>'
        : '<span style="color: var(--text-secondary);"><i class="ph ph-hard-drives" style="margin-right: 4px;"></i>Local</span>';

    // Build server name display
    const serverName = backup.server_name || 'Unknown Server';
    const serverDisplay = `<span style="color: var(--text-primary);"><i class="ph ph-server" style="margin-right: 4px; color: var(--text-secondary);"></i>${escapeHtml(serverName)}</span>`;

    tr.innerHTML = `
        <td class="checkbox-cell" onclick="event.stopPropagation();">
            <input type="checkbox" class="backup-checkbox" data-backup-filename="${escapeHtml(backup.filename)}" onclick="event.stopPropagation(); handleBackupCheckboxClick(this);">
        </td>
        <td>
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(backup.filename)}</div>
        </td>
        <td>
            ${typeDisplay}
        </td>
        <td>
            ${backupTypeDisplay}
        </td>
        <td>
            ${storageDisplay}
        </td>
        <td>
            ${serverDisplay}
        </td>
        <td>
            <div style="color: var(--text-secondary);">${sizeDisplay}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">${createdDate}</div>
        </td>
        <td>
            ${actionsHtml}
        </td>
    `;

    // Add data attributes for filtering
    tr.setAttribute('data-filename', backup.filename.toLowerCase());
    tr.setAttribute('data-type', backupType);
    tr.setAttribute('data-backup-type', backupTypeValue);
    tr.setAttribute('data-storage', storageLocation);
    tr.setAttribute('data-server', serverName.toLowerCase());
    tr.setAttribute('data-size', backup.size.toString());
    tr.setAttribute('data-created', createdDate.toLowerCase());

    // Add click handler to toggle checkbox when row is clicked
    tr.onclick = (event) => toggleBackupSelection(event, tr);

    return tr;
}

// Filter backups based on search input
function filterBackups() {
    const searchInput = document.getElementById('backup-search-input');
    const backupsList = document.getElementById('backups-list');

    if (!searchInput || !backupsList) return;

    const searchTerm = searchInput.value.toLowerCase().trim();
    const rows = backupsList.querySelectorAll('.backup-row');

    // Remove any existing "no results" message
    const noResultsRow = backupsList.querySelector('tr[data-no-results]');
    if (noResultsRow) {
        noResultsRow.remove();
    }

    if (!searchTerm) {
        // Show all rows if search is empty
        rows.forEach(row => {
            row.style.display = '';
        });
        updateBackupButtonStates();
        updateSelectAllBackupCheckbox();
        return;
    }

    // Filter rows based on search term
    let visibleCount = 0;
    rows.forEach(row => {
        const filenameCell = row.querySelector('td:nth-child(2)');
        let filename = '';
        if (filenameCell) {
            const filenameDiv = filenameCell.querySelector('div');
            if (filenameDiv) {
                filename = (filenameDiv.textContent || filenameDiv.innerText || '').toLowerCase().trim();
            }
        }
        
        const matches = filename.includes(searchTerm);

        if (matches) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Show "no results" message if no rows match
    if (visibleCount === 0 && rows.length > 0) {
        const tr = document.createElement('tr');
        tr.setAttribute('data-no-results', 'true');
        tr.innerHTML = '<td colspan="9" style="text-align: center; padding: 60px 40px; color: var(--text-secondary); font-size: 1em;">No backups match your search</td>';
        backupsList.appendChild(tr);
    }

    // Update button states and select all checkbox after filtering
    updateBackupButtonStates();
    updateSelectAllBackupCheckbox();
}

// Sort backups
function sortBackups(column) {
    // Toggle sort direction if clicking the same column
    if (window.AppState.currentBackupSortColumn === column) {
        window.AppState.currentBackupSortDirection = window.AppState.currentBackupSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.AppState.currentBackupSortColumn = column;
        window.AppState.currentBackupSortDirection = 'asc';
    }

    // Update sort indicators
    document.querySelectorAll('#backups-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-backup-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = window.AppState.currentBackupSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    // Sort and re-render backups
    const sorted = sortBackupsData([...window.AppState.allBackups], column, window.AppState.currentBackupSortDirection);
    renderBackups(sorted);
}

// Helper function to sort backup data
function sortBackupsData(backups, column, direction) {
    return backups.sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'filename':
                aVal = (a.filename || '').toLowerCase();
                bVal = (b.filename || '').toLowerCase();
                break;
            case 'type':
                const aType = a.type || (a.filename.endsWith('.zip') ? 'container' : 'network');
                const bType = b.type || (b.filename.endsWith('.zip') ? 'container' : 'network');
                aVal = aType.toLowerCase();
                bVal = bType.toLowerCase();
                break;
            case 'backup-type':
                aVal = (a.backup_type || 'manual').toLowerCase();
                bVal = (b.backup_type || 'manual').toLowerCase();
                break;
            case 'storage':
                aVal = (a.storage_location || 'local').toLowerCase();
                bVal = (b.storage_location || 'local').toLowerCase();
                break;
            case 'server':
                aVal = (a.server_name || 'Unknown Server').toLowerCase();
                bVal = (b.server_name || 'Unknown Server').toLowerCase();
                break;
            case 'size':
                aVal = a.size || 0;
                bVal = b.size || 0;
                break;
            case 'created':
                aVal = new Date(a.created || 0).getTime();
                bVal = new Date(b.created || 0).getTime();
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// Render backups to the table
function renderBackups(backups) {
    const backupsList = document.getElementById('backups-list');
    if (!backupsList) return;

    backupsList.innerHTML = '';

    if (backups.length === 0) {
        backupsList.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 60px 40px; color: var(--text-secondary); font-size: 1em;">No backups found</td></tr>';
    } else {
        backups.forEach(backup => {
            const row = createBackupRow(backup);
            backupsList.appendChild(row);
        });
    }

    // Apply current filter if any
    const searchInput = document.getElementById('backup-search-input');
    if (searchInput && searchInput.value.trim()) {
        filterBackups();
    }

    // Update button states after rendering
    updateBackupButtonStates();
}

// Backup selection management functions
function getSelectedBackups() {
    const selectedCheckboxes = document.querySelectorAll('.backup-checkbox:checked');
    return Array.from(selectedCheckboxes).map(cb => cb.dataset.backupFilename);
}

function handleBackupCheckboxClick(checkbox) {
    updateBackupButtonStates();
    updateSelectAllBackupCheckbox();
}

function toggleBackupSelection(event, row) {
    // Don't toggle if clicking on a button or link
    if (event.target.closest('button') || event.target.closest('a')) {
        return;
    }
    const checkbox = row.querySelector('.backup-checkbox');
    if (checkbox) {
        checkbox.checked = !checkbox.checked;
        handleBackupCheckboxClick(checkbox);
    }
}

function toggleSelectAllBackups(source) {
    // Only select visible backups (respects filtering)
    const allRows = document.querySelectorAll('.backup-row');
    const visibleRows = Array.from(allRows).filter(row => row.style.display !== 'none');
    const visibleCheckboxes = visibleRows
        .map(row => row.querySelector('.backup-checkbox'))
        .filter(cb => cb !== null);

    visibleCheckboxes.forEach(cb => cb.checked = source.checked);
    updateBackupButtonStates();
}

function updateSelectAllBackupCheckbox() {
    const selectAllCheckbox = document.getElementById('select-all-backups');
    if (!selectAllCheckbox) return;

    const allRows = document.querySelectorAll('.backup-row');
    const visibleRows = Array.from(allRows).filter(row => row.style.display !== 'none');
    const visibleCheckboxes = visibleRows
        .map(row => row.querySelector('.backup-checkbox'))
        .filter(cb => cb !== null);

    if (visibleCheckboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }

    const checkedCount = visibleCheckboxes.filter(cb => cb.checked).length;
    if (checkedCount === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
    } else if (checkedCount === visibleCheckboxes.length) {
        selectAllCheckbox.checked = true;
        selectAllCheckbox.indeterminate = false;
    } else {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = true;
    }
}

function updateBackupButtonStates() {
    const selectedBackups = getSelectedBackups();
    const downloadBtn = document.getElementById('download-backups-btn');
    const deleteBtn = document.getElementById('delete-backups-btn');

    if (downloadBtn) {
        downloadBtn.disabled = selectedBackups.length === 0;
    }
    if (deleteBtn) {
        deleteBtn.disabled = selectedBackups.length === 0;
    }
}

// Helper function to format bytes/speed
function formatSpeed(bytesPerSecond) {
    if (bytesPerSecond >= 1048576) { // >= 1 MB/s
        return (bytesPerSecond / 1048576).toFixed(2) + ' MB/s';
    } else if (bytesPerSecond >= 1024) { // >= 1 KB/s
        return (bytesPerSecond / 1024).toFixed(2) + ' KB/s';
    } else {
        return bytesPerSecond.toFixed(0) + ' B/s';
    }
}

// Helper function to format file size
function formatFileSize(bytes) {
    if (bytes >= 1073741824) { // >= 1 GB
        return (bytes / 1073741824).toFixed(2) + ' GB';
    } else if (bytes >= 1048576) { // >= 1 MB
        return (bytes / 1048576).toFixed(2) + ' MB';
    } else if (bytes >= 1024) { // >= 1 KB
        return (bytes / 1024).toFixed(2) + ' KB';
    } else {
        return bytes + ' B';
    }
}

// Cancel upload function
function cancelUploadAll() {
    window.AppState.uploadCancelled = true;
    if (window.AppState.currentUploadXHR) {
        window.AppState.currentUploadXHR.abort();
        window.AppState.currentUploadXHR = null;
    }
    const statusEl = document.getElementById('upload-progress-status');
    if (statusEl) {
        statusEl.innerHTML = '⏸️ Upload cancelled by user';
    }
    const cancelBtn = document.getElementById('upload-progress-cancel-btn');
    const closeBtn = document.getElementById('upload-progress-close-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'block';
}

// Upload backup
async function uploadBackup(event) {
    const files = event.target.files;
    if (!files.length) {
        return;
    }

    const modal = document.getElementById('upload-progress-modal');
    const statusEl = document.getElementById('upload-progress-status');
    const listEl = document.getElementById('upload-progress-list');
    const closeBtn = document.getElementById('upload-progress-close-btn');
    const cancelBtn = document.getElementById('upload-progress-cancel-btn');

    // Reset cancellation flag
    window.AppState.uploadCancelled = false;
    window.AppState.currentUploadXHR = null;

    if (!modal || !statusEl || !listEl || !closeBtn || !cancelBtn) {
        console.error('Upload modal elements not found');
        return;
    }

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    cancelBtn.style.display = 'block';
    statusEl.innerHTML = `Starting upload for ${files.length} file(s)...`;

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    // Create initial list items for each file
    let fileListHtml = '';
    for (let i = 0; i < files.length; i++) {
        fileListHtml += `
            <div id="upload-item-${i}" class="backup-item-progress">
                <strong>${escapeHtml(files[i].name)}</strong>
                <span class="status-badge waiting">Waiting...</span>
            </div>
        `;
    }
    listEl.innerHTML = fileListHtml;

    let successCount = 0;
    let errorCount = 0;
    const jsonFilesToRestore = []; // Track JSON files that need restore prompt

    for (let i = 0; i < files.length; i++) {
        // Check for cancellation
        if (window.AppState.uploadCancelled) {
            // Mark remaining files as cancelled
            for (let j = i; j < files.length; j++) {
                const cancelledItemEl = document.getElementById(`upload-item-${j}`);
                if (cancelledItemEl) {
                    const cancelledBadge = cancelledItemEl.querySelector('.status-badge');
                    if (cancelledBadge) {
                        cancelledBadge.textContent = 'Cancelled';
                        cancelledBadge.className = 'status-badge skipped';
                    }
                    cancelledItemEl.style.borderColor = 'var(--warning)';
                }
            }
            break;
        }

        const file = files[i];
        const itemEl = document.getElementById(`upload-item-${i}`);
        const statusBadge = itemEl.querySelector('.status-badge');

        // Update status with file info
        const fileSize = file.size;
        statusEl.innerHTML = `Uploading file ${i + 1} of ${files.length}: <strong>${escapeHtml(file.name)}</strong>`;
        statusBadge.textContent = 'Uploading...';
        statusBadge.className = 'status-badge uploading';
        itemEl.style.borderColor = 'var(--secondary)';
        // Scroll the active upload into view
        itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Validate file type
        if (!file.name.endsWith('.tar.gz') && !file.name.endsWith('.json')) {
            errorCount++;
            statusBadge.textContent = 'Skipped (must be .tar.gz or .json)';
            statusBadge.className = 'status-badge skipped';
            itemEl.style.borderColor = 'var(--warning)';
            continue;
        }

        let fileContent = null;
        let networkName = null;

        // For JSON files, validate structure before upload
        if (file.name.endsWith('.json')) {
            try {
                fileContent = await file.text();
                const networkConfig = JSON.parse(fileContent);
                if (!networkConfig.Name) {
                    throw new Error('Invalid network backup: missing network name');
                }
                networkName = networkConfig.Name;
            } catch (error) {
                errorCount++;
                statusBadge.textContent = `Error: ${error.message}`;
                statusBadge.className = 'status-badge error';
                itemEl.style.borderColor = 'var(--danger)';
                continue;
            }
        }

        const formData = new FormData();
        // Use file content for JSON, original file for tar.gz
        if (file.name.endsWith('.json') && fileContent) {
            const blob = new Blob([fileContent], { type: 'application/json' });
            formData.append('file', blob, file.name);
        } else {
            formData.append('file', file);
        }

        try {
            // Use XMLHttpRequest for upload progress tracking
            const uploadPromise = new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                
                // Store XHR for cancellation
                window.AppState.currentUploadXHR = xhr;
                
                // Track upload progress
                let uploadedBytes = 0;
                const startTime = Date.now();
                let lastUpdateTime = startTime;
                let lastUploadedBytes = 0;
                let currentSpeed = 0;
                
                // Update progress function
                const updateProgress = () => {
                    // Check for cancellation
                    if (window.AppState.uploadCancelled) {
                        xhr.abort();
                        return;
                    }
                    
                    const elapsed = (Date.now() - startTime) / 1000; // seconds
                    const recentElapsed = (Date.now() - lastUpdateTime) / 1000;
                    
                    // Calculate speed based on recent progress
                    if (recentElapsed > 0.1) { // Update speed every ~100ms
                        currentSpeed = (uploadedBytes - lastUploadedBytes) / recentElapsed;
                        lastUpdateTime = Date.now();
                        lastUploadedBytes = uploadedBytes;
                    }
                    
                    // Calculate average speed
                    const avgSpeed = elapsed > 0 ? uploadedBytes / elapsed : 0;
                    const speed = currentSpeed || avgSpeed;
                    
                    // Calculate percentage
                    const percent = fileSize > 0 ? ((uploadedBytes / fileSize) * 100).toFixed(1) : 0;
                    
                    // Update status bar
                    statusEl.innerHTML = `Uploading file ${i + 1} of ${files.length}: <strong>${escapeHtml(file.name)}</strong>`;
                    
                    // Update file item badge
                    statusBadge.textContent = `Uploading... ${percent}% - ${formatSpeed(speed)}`;
                };
                
                // Upload progress event
                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable) {
                        uploadedBytes = e.loaded;
                        updateProgress();
                    }
                });
                
                // Handle completion
                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const data = JSON.parse(xhr.responseText);
                            const totalTime = (Date.now() - startTime) / 1000;
                            const finalSpeed = totalTime > 0 ? uploadedBytes / totalTime : 0;
                            
                            resolve({
                                ok: true,
                                status: xhr.status,
                                data: data,
                                finalSpeed: finalSpeed
                            });
                        } catch (jsonError) {
                            reject(new Error(`Failed to parse response: ${jsonError.message}`));
                        }
                    } else {
                        // Handle error responses
                        let errorMessage = `Upload failed with status ${xhr.status}`;
                        try {
                            const errorData = JSON.parse(xhr.responseText);
                            errorMessage = errorData.error || errorMessage;
                            
                            // Handle CSRF errors - refresh page to get new token
                            if (errorData.csrf_error) {
                                console.error('CSRF token error - refreshing page');
                                location.reload();
                                return;
                            }
                        } catch (e) {
                            // Not JSON, use default message
                        }
                        
                        if (xhr.status === 429) {
                            errorMessage = 'Rate limit exceeded. Please wait a moment and try again.';
                        }
                        reject(new Error(errorMessage));
                    }
                });
                
                // Handle errors
                xhr.addEventListener('error', () => {
                    window.AppState.currentUploadXHR = null;
                    if (window.AppState.uploadCancelled) {
                        reject(new Error('Upload cancelled'));
                    } else {
                        reject(new Error('Network error during upload'));
                    }
                });
                
                xhr.addEventListener('abort', () => {
                    window.AppState.currentUploadXHR = null;
                    reject(new Error('Upload cancelled'));
                });
                
                // Start upload
                xhr.open('POST', '/api/upload-backup');
                
                // Add CSRF token header
                const getCsrfToken = window.getCsrfToken || (() => {
                    if (window.csrfToken) return window.csrfToken;
                    const name = 'X-CSRFToken';
                    const cookies = document.cookie.split(';');
                    for (let cookie of cookies) {
                        const [key, value] = cookie.trim().split('=');
                        if (key === name) {
                            return decodeURIComponent(value);
                        }
                    }
                    return null;
                });
                const csrfToken = getCsrfToken();
                if (csrfToken) {
                    xhr.setRequestHeader('X-CSRFToken', csrfToken);
                }
                
                xhr.send(formData);
            });
            
            // Clear XHR reference when promise resolves/rejects
            uploadPromise.finally(() => {
                window.AppState.currentUploadXHR = null;
            });
            
            const result = await uploadPromise;
            
            if (!result.ok) {
                if (result.status === 429) {
                    throw new Error('Rate limit exceeded. Please wait a moment and try again.');
                }
                throw new Error(result.data?.error || `Upload failed`);
            }
            
            successCount++;
            statusBadge.textContent = `Success (${formatSpeed(result.finalSpeed)} avg)`;
            statusBadge.className = 'status-badge success';
            itemEl.style.borderColor = 'var(--accent)';

            // Track JSON files for restore prompt
            if (file.name.endsWith('.json')) {
                jsonFilesToRestore.push({
                    filename: result.data.filename || file.name,
                    networkName: networkName
                });
            }
        } catch (error) {
            // Check if error is due to cancellation
            if (window.AppState.uploadCancelled || error.message === 'Upload cancelled' || error.message === 'Upload aborted') {
                statusBadge.textContent = 'Cancelled';
                statusBadge.className = 'status-badge skipped';
                itemEl.style.borderColor = 'var(--warning)';
                // Break out of loop if cancelled
                break;
            }
            
            errorCount++;
            statusBadge.textContent = `Error: ${error.message}`;
            statusBadge.className = 'status-badge error';
            itemEl.style.borderColor = 'var(--danger)';
        }
    }

    // Final status
    if (window.AppState.uploadCancelled) {
        statusEl.innerHTML = `⏸️ Upload cancelled. ${successCount} succeeded, ${errorCount} failed.`;
    } else {
        statusEl.innerHTML = `✅ Upload complete. ${successCount} succeeded, ${errorCount} failed.`;
    }
    
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'block';
    event.target.value = ''; // Reset file input
    window.AppState.currentUploadXHR = null;
    
    // Only reload backups and prompt for restore if not cancelled
    if (!window.AppState.uploadCancelled) {
        loadBackups();
        
        // Prompt to restore network backups if any were uploaded
        if (jsonFilesToRestore.length > 0 && window.showConfirmationModal) {
            for (const jsonFile of jsonFilesToRestore) {
                const networkName = jsonFile.networkName || 'unknown';

                window.showConfirmationModal(`Network backup uploaded. Restore network "${networkName}"?`, async () => {
                    const restoreResponse = await fetch('/api/network/restore', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            filename: jsonFile.filename
                        })
                    });

                    const restoreData = await restoreResponse.json();

                    if (!restoreResponse.ok) {
                        if (restoreResponse.status === 409) {
                            console.warn(`Network already exists: ${restoreData.network_name || 'unknown'}`);
                        } else {
                            throw new Error(restoreData.error || 'Restore failed');
                        }
                    } else {
                        console.log(`Network restored: ${restoreData.network_name}`);
                    }

                    if (window.loadNetworks) {
                        window.loadNetworks();
                    }
                    loadBackups(); // Refresh backup grid after restore too
                });
            }
        }
    }
}

function closeUploadProgressModal() {
    const modal = document.getElementById('upload-progress-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Show restore modal
async function showRestoreModal(filename) {
    window.AppState.currentRestoreFilename = filename;
    const filenameEl = document.getElementById('restore-filename');
    const contentEl = document.getElementById('restore-content');
    const progressEl = document.getElementById('restore-progress');
    const restoreLoading = document.getElementById('restore-loading');
    const restoreOptions = document.getElementById('restore-options');
    const modalActions = document.getElementById('restore-modal-actions');

    if (!filenameEl || !contentEl || !progressEl || !restoreLoading || !restoreOptions) {
        console.error('Restore modal elements not found');
        return;
    }

    filenameEl.textContent = filename;
    contentEl.style.display = 'block';
    progressEl.style.display = 'none';

    // Show loading spinner
    restoreLoading.className = 'backup-progress';
    restoreLoading.style.display = 'block';
    restoreLoading.style.textAlign = 'center';
    restoreLoading.style.padding = '60px 20px';
    restoreLoading.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div><p style="margin-top: 20px;">Loading backup preview...</p>';
    restoreOptions.style.display = 'none';
    if (modalActions) modalActions.style.display = 'none';

    const modal = document.getElementById('restore-modal');
    if (modal) {
        modal.style.display = 'block';
    }

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        // Fetch backup preview
        const response = await fetch(`/api/backup/${filename}/preview`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load backup preview');
        }

        window.AppState.currentRestorePreview = data;

        // Populate volumes section
        const volumesListEl = document.getElementById('restore-volumes-list');
        const volumesSectionEl = document.getElementById('restore-volumes-section');
        const overwriteCheckbox = document.getElementById('restore-overwrite-volumes');

        if (data.volumes && data.volumes.length > 0 && volumesListEl && volumesSectionEl && overwriteCheckbox) {
            volumesSectionEl.style.display = 'block';
            let volumesHtml = '<div style="margin-bottom: 10px; font-size: 0.9em; color: var(--text-secondary);">Volumes in backup:</div>';
            volumesHtml += '<ul style="margin: 0 0 10px 20px; padding: 0; color: var(--text-light); font-size: 0.9em;">';
            data.volumes.forEach(vol => {
                const exists = data.existing_volumes.includes(vol.name);
                volumesHtml += `<li>${escapeHtml(vol.name)}${exists ? ' <span style="color: var(--warning);">(exists)</span>' : ''}</li>`;
            });
            volumesHtml += '</ul>';
            volumesListEl.innerHTML = volumesHtml;

            // Set checkbox based on whether volumes exist
            if (data.existing_volumes.length > 0) {
                overwriteCheckbox.checked = false;
                overwriteCheckbox.disabled = false;
            } else {
                overwriteCheckbox.checked = true;
                overwriteCheckbox.disabled = true;
            }
        } else if (volumesSectionEl) {
            volumesSectionEl.style.display = 'none';
        }

        // Populate ports section
        const portsListEl = document.getElementById('restore-ports-list');
        const portsSectionEl = document.getElementById('restore-ports-section');

        if (data.port_mappings && data.port_mappings.length > 0 && portsListEl && portsSectionEl) {
            portsSectionEl.style.display = 'block';
            let portsHtml = '';
            data.port_mappings.forEach(port => {
                portsHtml += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; align-items: center;">
                        <input type="text" class="restore-port-input" data-container-port="${escapeHtml(port.container_port)}" value="${escapeHtml(port.host_port)}" placeholder="e.g. 8080" style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); padding: 8px; border-radius: 4px; font-family: monospace;">
                        <div style="font-family: monospace; background: var(--bg-card); padding: 8px; border-radius: 4px; border: 1px solid var(--border); text-align: center; color: var(--text-primary);">${escapeHtml(port.container_port)}</div>
                    </div>
                `;
            });
            portsListEl.innerHTML = portsHtml;
        } else if (portsSectionEl) {
            portsSectionEl.style.display = 'none';
        }

        // Hide loading spinner, show options and buttons
        restoreLoading.style.display = 'none';
        restoreOptions.style.display = 'block';
        if (modalActions) modalActions.style.display = 'flex';

    } catch (error) {
        // Show error in loading area
        restoreLoading.className = '';
        restoreLoading.style.display = 'flex';
        restoreLoading.style.flexDirection = 'column';
        restoreLoading.style.alignItems = 'center';
        restoreLoading.style.justifyContent = 'center';
        restoreLoading.style.padding = '40px 20px';
        restoreLoading.innerHTML = `<div class="error" style="text-align: center; color: var(--error);">Error: ${escapeHtml(error.message)}</div>`;
        // Still show buttons so user can close
        if (modalActions) modalActions.style.display = 'flex';
    }
}

function closeRestoreModal() {
    const modal = document.getElementById('restore-modal');
    if (modal) {
        modal.style.display = 'none';
    }
    window.AppState.currentRestoreFilename = null;
    window.AppState.currentRestorePreview = null;
    
    // Reset modal state for next open
    const restoreLoading = document.getElementById('restore-loading');
    const restoreOptions = document.getElementById('restore-options');
    const restoreContent = document.getElementById('restore-content');
    const restoreProgress = document.getElementById('restore-progress');
    const modalActions = document.getElementById('restore-modal-actions');
    
    if (restoreLoading) {
        restoreLoading.style.display = 'none';
        restoreLoading.className = 'backup-progress';
        restoreLoading.style.textAlign = 'center';
        restoreLoading.style.padding = '60px 20px';
        restoreLoading.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div><p style="margin-top: 20px;">Loading backup preview...</p>';
    }
    if (restoreOptions) restoreOptions.style.display = 'none';
    if (restoreContent) restoreContent.style.display = 'block';
    if (restoreProgress) restoreProgress.style.display = 'none';
    if (modalActions) modalActions.style.display = 'flex';
}

async function submitRestore() {
    if (!window.AppState.currentRestoreFilename) {
        return;
    }

    const overwriteCheckbox = document.getElementById('restore-overwrite-volumes');
    const restoreContent = document.getElementById('restore-content');
    const modalActions = document.getElementById('restore-modal-actions');
    const restoreProgressEl = document.getElementById('restore-progress');

    if (!overwriteCheckbox || !restoreContent || !restoreProgressEl) {
        console.error('Restore modal elements not found');
        return;
    }

    // Get volume overwrite option
    const overwriteVolumes = overwriteCheckbox.checked;

    // Get port overrides
    const portOverrides = {};
    const portInputs = document.querySelectorAll('.restore-port-input');
    portInputs.forEach(input => {
        const containerPort = input.dataset.containerPort;
        const hostPort = input.value.trim();
        if (hostPort) {
            portOverrides[containerPort] = hostPort;
        }
    });

    // Hide options and buttons, show progress
    restoreContent.style.display = 'none';
    if (modalActions) modalActions.style.display = 'none';
    restoreProgressEl.style.display = 'block';

    restoreProgressEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px;">
            <div class="spinner" style="margin: 0 auto;"></div>
            <p style="margin-top: 20px;"><strong>Restoring container...</strong></p>
            <p style="font-size: 0.9em; color: #cbd5e1; margin-top: 10px;">This may take a while for large backups.</p>
        </div>
    `;

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch('/api/restore-backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: window.AppState.currentRestoreFilename,
                new_name: '',
                overwrite_volumes: overwriteVolumes,
                port_overrides: Object.keys(portOverrides).length > 0 ? portOverrides : null
            })
        });

        let data;
        try {
            const responseText = await response.text();
            if (!responseText) {
                throw new Error('Empty response from server');
            }
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            throw new Error('Invalid response from server. Restore may have succeeded - please refresh containers.');
        }

        if (!response.ok) {
            if (response.status === 409) {
                throw new Error(`Conflict: ${data.error || 'Container name already exists'}`);
            }
            throw new Error(data.error || 'Restore failed');
        }

        // Success - update UI
        closeRestoreModal();
        if (window.showNotification) {
            window.showNotification(
                `✅ Container Restored Successfully!\nName: ${escapeHtml(data.container_name || 'Unknown')}`,
                'success'
            );
        }

        // Reload containers and backups
        if (window.loadContainers) {
            window.loadContainers();
        }
        loadBackups();

    } catch (error) {
        console.error('Restore error:', error);
        if (restoreProgressEl) {
            restoreProgressEl.innerHTML = `
                <div class="error">
                    <h3>❌ Restore Failed</h3>
                    <p>${escapeHtml(error && error.message ? error.message : 'Unknown error occurred')}</p>
                    <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                        Note: The container may have been created successfully. Please check the containers tab.
                    </p>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-primary btn-sm" onclick="if(window.showSection) window.showSection('containers'); if(window.loadContainers) window.loadContainers(); closeRestoreModal();" style="margin-right: 10px;">Check Containers</button>
                        <button class="btn btn-secondary btn-sm" onclick="closeRestoreModal()">Close</button>
                    </div>
                </div>
            `;
        } else {
            console.error(`Restore Failed: ${error && error.message ? error.message : 'Unknown error occurred'}\n\nThe container may have been created - please check the containers tab.`);
            closeRestoreModal();
        }
    }
}

// Delete backup
async function deleteBackup(filename) {
    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Remove backup "${filename}"?\n\nThis action cannot be undone.`, async () => {
            try {
                const response = await fetch(`/api/backup/${filename}`, {
                    method: 'DELETE',
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to remove backup');
                }

                if (window.showNotification) {
                    window.showNotification('Backup removed successfully', 'success');
                }
                loadBackups();
            } catch (error) {
                console.error(`Error removing backup: ${error.message}`);
                if (window.showNotification) {
                    window.showNotification(`Error removing backup: ${error.message}`, 'error');
                }
            }
        });
    }
}

// Download selected backups - wrapper with confirmation
async function downloadAllBackups() {
    const selectedBackups = getSelectedBackups();
    
    if (selectedBackups.length === 0) {
        if (window.showNotification) {
            window.showNotification('Please select at least one backup to download.', 'warning');
        }
        return;
    }

    // Show confirmation
    const warningMessage = `Download ${selectedBackups.length} selected backup file(s)?\n\nDo you want to proceed?`;
    
    if (window.showConfirmationModal) {
        window.showConfirmationModal(warningMessage, () => {
            // User confirmed, proceed with download
            downloadAllBackupsInternal(selectedBackups);
        });
    }
}

// Cancel download function
function cancelDownloadAll() {
    window.AppState.downloadCancelled = true;
    if (window.AppState.currentDownloadAbortController) {
        window.AppState.currentDownloadAbortController.abort();
        window.AppState.currentDownloadAbortController = null;
    }
    const statusEl = document.getElementById('download-all-status');
    if (statusEl) {
        statusEl.innerHTML = '❌ Download cancelled by user';
    }
    const cancelBtn = document.getElementById('download-all-cancel-btn');
    const closeBtn = document.getElementById('download-all-close-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'block';
}

// Download selected backups - internal function that performs the actual download
async function downloadAllBackupsInternal(selectedFiles) {
    const modal = document.getElementById('download-all-modal');
    const statusEl = document.getElementById('download-all-status');
    const listEl = document.getElementById('download-all-list');
    const closeBtn = document.getElementById('download-all-close-btn');
    const cancelBtn = document.getElementById('download-all-cancel-btn');

    if (!modal || !statusEl || !listEl || !closeBtn || !cancelBtn) {
        console.error('Modal elements not found');
        return;
    }

    // Reset cancellation flag
    window.AppState.downloadCancelled = false;
    window.AppState.currentDownloadAbortController = null;

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    cancelBtn.style.display = 'block';
    statusEl.innerHTML = 'Preparing...';
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-light);">Loading files...</div>';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const files = selectedFiles;
        const total = files.length;

        if (!files || files.length === 0) {
            throw new Error('No files to download');
        }

        // Display file list
        listEl.innerHTML = files.map((filename, index) => {
            return `
                <div id="download-file-${index}" style="padding: 10px; margin-bottom: 8px; background: var(--bg-card); border-radius: 4px; border-left: 4px solid var(--border); border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                            <span style="color: var(--text-light); font-size: 0.9em; margin-left: 10px;">⏳ Waiting...</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        statusEl.innerHTML = `Downloading ${total} file(s) sequentially...`;

        // Download files sequentially, one at a time
        let completed = 0;
        let failed = 0;

        for (let i = 0; i < files.length; i++) {
            // Check for cancellation
            if (window.AppState.downloadCancelled) {
                // Mark remaining files as cancelled
                for (let j = i; j < files.length; j++) {
                    const cancelledFileEl = document.getElementById(`download-file-${j}`);
                    if (cancelledFileEl) {
                        cancelledFileEl.innerHTML = `
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: var(--text-primary);">${escapeHtml(files[j])}</strong>
                                    <span style="color: var(--warning); font-size: 0.9em; margin-left: 10px;">⏸️ Cancelled</span>
                                </div>
                            </div>
                        `;
                        cancelledFileEl.style.borderLeftColor = 'var(--warning)';
                    }
                }
                break;
            }

            const filename = files[i];
            const fileEl = document.getElementById(`download-file-${i}`);
            
            // Update status to downloading
            if (fileEl) {
                fileEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                            <span style="color: var(--secondary); font-size: 0.9em; margin-left: 10px;">⬇️ Downloading...</span>
                        </div>
                    </div>
                `;
                fileEl.style.borderLeftColor = 'var(--secondary)';
                // Scroll the active download into view
                fileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            statusEl.innerHTML = `Downloading ${i + 1} / ${total}: ${escapeHtml(filename)}`;

            try {
                // Download file using fetch to get full control with real-time speed tracking
                const downloadUrl = `/api/download/${encodeURIComponent(filename)}`;
                
                // Create abort controller for this download
                window.AppState.currentDownloadAbortController = new AbortController();
                const response = await fetch(downloadUrl, {
                    signal: window.AppState.currentDownloadAbortController.signal
                });
                if (!response.ok) {
                    throw new Error(`Download failed: ${response.statusText}`);
                }
                
                // Get content length if available
                const contentLength = response.headers.get('content-length');
                const totalBytes = contentLength ? parseInt(contentLength, 10) : null;
                
                // Track download progress
                let downloadedBytes = 0;
                const startTime = Date.now();
                let lastUpdateTime = startTime;
                let lastDownloadedBytes = 0;
                let currentSpeed = 0;
                
                // Update UI function
                const updateProgress = () => {
                    const elapsed = (Date.now() - startTime) / 1000; // seconds
                    const recentElapsed = (Date.now() - lastUpdateTime) / 1000;
                    
                    // Calculate speed based on recent progress
                    if (recentElapsed > 0.1) { // Update speed every ~100ms
                        currentSpeed = (downloadedBytes - lastDownloadedBytes) / recentElapsed;
                        lastUpdateTime = Date.now();
                        lastDownloadedBytes = downloadedBytes;
                    }
                    
                    // Calculate average speed
                    const avgSpeed = elapsed > 0 ? downloadedBytes / elapsed : 0;
                    
                    // Build status text
                    let statusText = `Downloading ${i + 1} / ${total}: ${escapeHtml(filename)}`;
                    statusEl.innerHTML = statusText;
                    
                    // Update file element
                    if (fileEl) {
                        let progressText = '⬇️ Downloading...';
                        if (totalBytes) {
                            const percent = ((downloadedBytes / totalBytes) * 100).toFixed(0);
                            progressText += ` ${percent}%`;
                        }
                        progressText += ` - ${formatSpeed(currentSpeed || avgSpeed)}`;
                        
                        fileEl.innerHTML = `
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                    <span style="color: var(--secondary); font-size: 0.9em; margin-left: 10px;">${progressText}</span>
                                </div>
                            </div>
                        `;
                    }
                };
                
                // Read the stream chunk by chunk to track progress
                const reader = response.body.getReader();
                const chunks = [];
                
                try {
                    while (true) {
                        // Check for cancellation
                        if (window.AppState.downloadCancelled) {
                            reader.cancel();
                            throw new Error('Download cancelled');
                        }
                        
                        const { done, value } = await reader.read();
                        if (done) break;
                        
                        chunks.push(value);
                        downloadedBytes += value.length;
                        
                        // Update UI every chunk
                        updateProgress();
                    }
                } catch (readError) {
                    // If cancelled, don't process the blob
                    if (window.AppState.downloadCancelled || readError.name === 'AbortError') {
                        throw new Error('Download cancelled');
                    }
                    throw readError;
                }
                
                // Combine chunks into blob
                const blob = new Blob(chunks);
                
                // Final speed calculation
                const totalTime = (Date.now() - startTime) / 1000;
                const finalSpeed = totalTime > 0 ? downloadedBytes / totalTime : 0;
                
                // Now trigger the browser download with the blob
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = blobUrl;
                a.setAttribute('download', filename);
                document.body.appendChild(a);
                a.click();
                
                // Clean up: remove element and revoke blob URL after a short delay
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(blobUrl);
                }, 100);

                // Mark as completed
                completed++;
                if (fileEl) {
                    fileEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Downloaded (${formatSpeed(finalSpeed)} avg)</span>
                            </div>
                        </div>
                    `;
                    fileEl.style.borderLeftColor = 'var(--accent)';
                }

            } catch (error) {
                // Check if error is due to cancellation
                if (window.AppState.downloadCancelled || error.name === 'AbortError' || error.message === 'Download cancelled') {
                    if (fileEl) {
                        fileEl.innerHTML = `
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                    <span style="color: var(--warning); font-size: 0.9em; margin-left: 10px;">⏸️ Cancelled</span>
                                </div>
                            </div>
                        `;
                        fileEl.style.borderLeftColor = 'var(--warning)';
                    }
                    // Break out of loop if cancelled
                    break;
                }
                
                console.error(`Error downloading ${filename}:`, error);
                failed++;
                if (fileEl) {
                    fileEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                <span style="color: var(--danger); font-size: 0.9em; margin-left: 10px;">❌ Failed</span>
                            </div>
                        </div>
                    `;
                    fileEl.style.borderLeftColor = 'var(--danger)';
                }
            }
        }

        // Final status
        if (window.AppState.downloadCancelled) {
            statusEl.innerHTML = `⏸️ Download cancelled. ${completed} file(s) downloaded, ${failed} failed`;
        } else if (failed === 0) {
            statusEl.innerHTML = `✅ Successfully downloaded ${completed} file(s)!`;
        } else {
            statusEl.innerHTML = `⚠️ Completed: ${completed} file(s) downloaded, ${failed} failed`;
        }
        
        cancelBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        window.AppState.currentDownloadAbortController = null;

        // Clear selection after download completes
        document.querySelectorAll('.backup-checkbox:checked').forEach(cb => cb.checked = false);
        updateBackupButtonStates();
        updateSelectAllBackupCheckbox();

    } catch (error) {
        statusEl.innerHTML = `❌ Error: ${escapeHtml(error.message)}`;
        listEl.innerHTML = '';
        closeBtn.style.display = 'block';
    }
}

function closeDownloadAllModal() {
    const modal = document.getElementById('download-all-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Remove selected backups
async function deleteAllBackups() {
    const selectedBackups = getSelectedBackups();
    
    if (selectedBackups.length === 0) {
        if (window.showNotification) {
            window.showNotification('Please select at least one backup to remove.', 'warning');
        }
        return;
    }

    const confirmMessage = selectedBackups.length === 1
        ? `Remove backup "${selectedBackups[0]}"?\n\nThis action cannot be undone.`
        : `Remove ${selectedBackups.length} selected backups?\n\nThis will permanently remove the selected backup files.\n\nThis action CANNOT be undone!`;

    if (window.showConfirmationModal) {
        window.showConfirmationModal(confirmMessage, async () => {
            // User confirmed, proceed with deletion with progress modal
            deleteAllBackupsInternal(selectedBackups);
        });
    }
}

// Remove selected backups - internal function that performs the actual removal with progress
async function deleteAllBackupsInternal(selectedBackups) {
    const modal = document.getElementById('delete-all-modal');
    const statusEl = document.getElementById('delete-all-status');
    const listEl = document.getElementById('delete-all-list');
    const closeBtn = document.getElementById('delete-all-close-btn');

    if (!modal || !statusEl || !listEl || !closeBtn) {
        console.error('Modal elements not found');
        return;
    }

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    statusEl.innerHTML = 'Preparing...';
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-light);">Loading files...</div>';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const files = selectedBackups;
        const total = files.length;

        if (!files || files.length === 0) {
            throw new Error('No files to remove');
        }

        // Display file list
        listEl.innerHTML = files.map((filename, index) => {
            return `
                <div id="delete-file-${index}" style="padding: 10px; margin-bottom: 8px; background: var(--bg-card); border-radius: 4px; border-left: 4px solid var(--border); border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                            <span style="color: var(--text-light); font-size: 0.9em; margin-left: 10px;">⏳ Waiting...</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        statusEl.innerHTML = `Removing ${total} backup file(s)...`;

        // Remove files sequentially, one at a time
        let completed = 0;
        let failed = 0;

        for (let i = 0; i < files.length; i++) {
            const filename = files[i];
            const fileEl = document.getElementById(`delete-file-${i}`);
            
            // Update status to deleting
            if (fileEl) {
                fileEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                            <span style="color: var(--secondary); font-size: 0.9em; margin-left: 10px;">🗑️ Removing...</span>
                        </div>
                    </div>
                `;
                fileEl.style.borderLeftColor = 'var(--secondary)';
                // Scroll the active deletion into view
                fileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            statusEl.innerHTML = `Removing ${i + 1} / ${total}: ${escapeHtml(filename)}`;

            try {
                const response = await fetch(`/api/backup/${encodeURIComponent(filename)}`, {
                    method: 'DELETE',
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to remove backup');
                }

                // Mark as completed
                completed++;
                if (fileEl) {
                    fileEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Removed</span>
                            </div>
                        </div>
                    `;
                    fileEl.style.borderLeftColor = 'var(--accent)';
                }

                // Small delay between deletions
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`Error removing ${filename}:`, error);
                failed++;
                if (fileEl) {
                    fileEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                <span style="color: var(--danger); font-size: 0.9em; margin-left: 10px;">❌ Failed: ${escapeHtml(error.message)}</span>
                            </div>
                        </div>
                    `;
                    fileEl.style.borderLeftColor = 'var(--danger)';
                }
            }
        }

        // Final status
        if (failed === 0) {
            statusEl.innerHTML = `✅ Successfully removed ${completed} backup file(s)!`;
        } else {
            statusEl.innerHTML = `⚠️ Completed: ${completed} backup(s) removed, ${failed} failed`;
        }
        
        closeBtn.style.display = 'block';

        // Clear selection
        document.querySelectorAll('.backup-checkbox:checked').forEach(cb => cb.checked = false);
        updateBackupButtonStates();
        updateSelectAllBackupCheckbox();
        
        // Reload backups list
        loadBackups();

    } catch (error) {
        statusEl.innerHTML = `❌ Error: ${escapeHtml(error.message)}`;
        listEl.innerHTML = '';
        closeBtn.style.display = 'block';
    }
}

function closeDeleteAllModal() {
    const modal = document.getElementById('delete-all-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Backup network
async function backupNetwork(networkId, networkName) {
    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Backup network "${networkName}"?`, async () => {
            try {
                const response = await fetch(`/api/network/${networkId}/backup`, {
                    method: 'POST',
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to backup network');
                }

                console.log(`Network backed up: ${data.filename}`);
                if (window.showNotification) {
                    window.showNotification(`Network backed up successfully: ${data.filename}`, 'success');
                }
                if (window.loadNetworks) {
                    window.loadNetworks();
                }
                // Refresh backups list if we're on the backups tab
                const backupsTab = document.getElementById('backups-tab');
                if (backupsTab && backupsTab.style.display !== 'none') {
                    loadBackups();
                }
            } catch (error) {
                console.error(`Error backing up network: ${error.message}`);
                if (window.showNotification) {
                    window.showNotification(`Error backing up network: ${error.message}`, 'error');
                }
            }
        });
    }
}

// Restore network backup from backups tab
async function restoreNetworkBackup(filename) {
    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Restore network from backup "${filename}"?`, async () => {
            try {
                const response = await fetch('/api/network/restore', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        filename: filename
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    if (response.status === 409) {
                        throw new Error(`Network already exists: ${data.network_name || 'unknown'}`);
                    }
                    throw new Error(data.error || 'Restore failed');
                }

                console.log(`Network restored: ${data.network_name}`);
                if (window.showNotification) {
                    window.showNotification(`Network restored successfully: ${data.network_name}`, 'success');
                }
                if (window.loadNetworks) {
                    window.loadNetworks();
                }
                loadBackups(); // Refresh backup grid after restore
            } catch (error) {
                console.error(`Error restoring network: ${error.message}`);
                if (window.showNotification) {
                    window.showNotification(`Error restoring network: ${error.message}`, 'error');
                }
            }
        });
    }
}

// Export functions to window for HTML access
window.loadBackups = loadBackups;
window.createBackupRow = createBackupRow;
window.filterBackups = filterBackups;
window.sortBackups = sortBackups;
window.sortBackupsData = sortBackupsData;
window.renderBackups = renderBackups;
window.getSelectedBackups = getSelectedBackups;
window.handleBackupCheckboxClick = handleBackupCheckboxClick;
window.toggleBackupSelection = toggleBackupSelection;
window.toggleSelectAllBackups = toggleSelectAllBackups;
window.updateSelectAllBackupCheckbox = updateSelectAllBackupCheckbox;
window.updateBackupButtonStates = updateBackupButtonStates;
window.cancelUploadAll = cancelUploadAll;
window.uploadBackup = uploadBackup;
window.closeUploadProgressModal = closeUploadProgressModal;
window.showRestoreModal = showRestoreModal;
window.closeRestoreModal = closeRestoreModal;
window.submitRestore = submitRestore;
window.deleteBackup = deleteBackup;
window.downloadAllBackups = downloadAllBackups;
window.cancelDownloadAll = cancelDownloadAll;
window.downloadAllBackupsInternal = downloadAllBackupsInternal;
window.closeDownloadAllModal = closeDownloadAllModal;
window.deleteAllBackups = deleteAllBackups;
window.deleteAllBackupsInternal = deleteAllBackupsInternal;
window.closeDeleteAllModal = closeDeleteAllModal;
window.formatSpeed = formatSpeed;
window.formatFileSize = formatFileSize;
window.backupNetwork = backupNetwork;
window.restoreNetworkBackup = restoreNetworkBackup;

