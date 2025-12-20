// Audit Log Module
// Handles audit log management: loading, pagination, filtering, clearing

// Load audit logs
async function loadAuditLogs(reset = true) {
    const errorEl = document.getElementById('audit-log-error');
    const auditLogList = document.getElementById('audit-log-list');
    const auditLogSpinner = document.getElementById('audit-log-spinner');
    const auditLogWrapper = document.getElementById('audit-log-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';

    if (reset) {
        window.AppState.auditLogCurrentPage = 1;
    }

    // Calculate offset from current page
    const auditLogOffset = (window.AppState.auditLogCurrentPage - 1) * window.AppState.auditLogLimit;

    // Show spinner
    if (auditLogSpinner) auditLogSpinner.style.display = 'flex';
    if (auditLogWrapper) {
        auditLogWrapper.style.overflow = 'hidden';
        auditLogWrapper.classList.add('loading-grid');
    }

    // Clear existing logs
    if (auditLogList) auditLogList.innerHTML = '';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const operationTypeEl = document.getElementById('audit-filter-operation');
        const statusEl = document.getElementById('audit-filter-status');
        const searchInput = document.getElementById('audit-log-search');
        const operationType = (operationTypeEl && operationTypeEl.value) || '';
        const status = (statusEl && statusEl.value) || '';
        const searchTerm = (searchInput && searchInput.value.trim()) || '';

        let url = `/api/audit-logs?limit=${window.AppState.auditLogLimit}&offset=${auditLogOffset}`;
        if (operationType) url += `&operation_type=${encodeURIComponent(operationType)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load audit logs');
        }

        window.AppState.auditLogTotal = data.total || 0;
        window.AppState.auditLogTotalPages = Math.ceil(window.AppState.auditLogTotal / window.AppState.auditLogLimit);

        if (!data.logs || data.logs.length === 0) {
            if (auditLogList) {
                auditLogList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">No audit logs found</td></tr>';
            }
            updateAuditLogPagination();
        } else {
            data.logs.forEach(log => {
                const row = createAuditLogRow(log);
                if (auditLogList) auditLogList.appendChild(row);
            });

            updateAuditLogPagination();
        }

    } catch (error) {
        if (errorEl) {
            errorEl.textContent = `Error: ${error.message}`;
            errorEl.style.display = 'block';
        }
    } finally {
        // Hide spinner
        if (auditLogSpinner) auditLogSpinner.style.display = 'none';
        if (auditLogWrapper) {
            auditLogWrapper.style.overflow = '';
            auditLogWrapper.classList.remove('loading-grid');
        }
    }
}

// Update audit log pagination
function updateAuditLogPagination() {
    const prevBtn = document.getElementById('audit-prev-btn');
    const nextBtn = document.getElementById('audit-next-btn');
    const pageInfo = document.getElementById('audit-page-info');

    if (window.AppState.auditLogTotalPages <= 1) {
        if (prevBtn) prevBtn.style.display = 'none';
        if (nextBtn) nextBtn.style.display = 'none';
        if (pageInfo) pageInfo.textContent = '';
    } else {
        if (prevBtn) prevBtn.style.display = window.AppState.auditLogCurrentPage > 1 ? 'inline-flex' : 'none';
        if (nextBtn) nextBtn.style.display = window.AppState.auditLogCurrentPage < window.AppState.auditLogTotalPages ? 'inline-flex' : 'none';
        
        const start = window.AppState.auditLogTotal === 0 ? 0 : (window.AppState.auditLogCurrentPage - 1) * window.AppState.auditLogLimit + 1;
        const end = Math.min(window.AppState.auditLogCurrentPage * window.AppState.auditLogLimit, window.AppState.auditLogTotal);
        if (pageInfo) {
            pageInfo.textContent = `Page ${window.AppState.auditLogCurrentPage} of ${window.AppState.auditLogTotalPages} (${start}-${end} of ${window.AppState.auditLogTotal})`;
        }
    }
}

// Load audit logs page
async function loadAuditLogsPage(direction) {
    if (direction === 'next' && window.AppState.auditLogCurrentPage < window.AppState.auditLogTotalPages) {
        window.AppState.auditLogCurrentPage++;
        await loadAuditLogs(false);
    } else if (direction === 'prev' && window.AppState.auditLogCurrentPage > 1) {
        window.AppState.auditLogCurrentPage--;
        await loadAuditLogs(false);
    }
}

// Clear audit logs
async function clearAuditLogs() {
    if (window.showConfirmationModal) {
        window.showConfirmationModal(
            'Are you sure you want to clear all audit logs?\n\nThis will permanently delete all audit log entries. This action cannot be undone.',
            async () => {
                try {
                    const response = await fetch('/api/audit-logs/clear', {
                        method: 'DELETE'
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Failed to clear audit logs');
                    }

                    // Show success notification
                    if (window.showNotification) {
                        window.showNotification(`Successfully cleared ${data.deleted_count || 0} audit log(s)`, 'success');
                    }

                    // Reload audit logs (will show empty state)
                    await loadAuditLogs(true);
                } catch (error) {
                    if (window.showNotification) {
                        window.showNotification(`Error clearing audit logs: ${error.message}`, 'error');
                    }
                }
            }
        );
    }
}

// Filter audit logs
function filterAuditLogs() {
    window.AppState.auditLogCurrentPage = 1; // Reset to first page when filtering
    const searchInput = document.getElementById('audit-log-search');
    if (!searchInput) return;

    const searchTerm = searchInput.value.trim();

    // Clear existing timeout
    if (window.AppState.auditLogSearchTimeout) {
        clearTimeout(window.AppState.auditLogSearchTimeout);
    }

    // Debounce the search - wait 300ms after user stops typing
    window.AppState.auditLogSearchTimeout = setTimeout(() => {
        // Reload audit logs with search term
        loadAuditLogs(true);
    }, 300);
}

// Create audit log row
function createAuditLogRow(log) {
    const tr = document.createElement('tr');

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    // Format timestamp
    const timestamp = new Date(log.timestamp);
    const formattedTime = timestamp.toLocaleString();

    // Format operation type
    const operationLabels = {
        'backup_manual': 'Manual Backup',
        'backup_scheduled': 'Scheduled Backup',
        'restore': 'Restore',
        'cleanup': 'Lifecycle Cleanup',
        'delete_backup': 'Remove Backup'
    };
    const operationLabel = operationLabels[log.operation_type] || log.operation_type;

    // Format status with badge
    const statusClass = log.status === 'completed' ? 'status-running' :
        log.status === 'error' ? 'status-stopped' :
            'status-stopped'; // Use existing class for started/pending
    const statusText = log.status.charAt(0).toUpperCase() + log.status.slice(1);

    // Format container info
    const containerInfo = log.container_name || log.container_id || '-';
    const containerId = log.container_id ? ` (${log.container_id.substring(0, 12)})` : '';

    // Format backup filename
    const backupFile = log.backup_filename || '-';

    // Format details
    let detailsHtml = '-';
    if (log.details) {
        const details = [];
        if (log.details.deleted_count !== undefined) {
            details.push(`Removed: ${log.details.deleted_count}`);
        }
        if (log.details.lifecycle !== undefined) {
            details.push(`Lifecycle: ${log.details.lifecycle}`);
        }
        if (log.details.new_name) {
            details.push(`New name: ${log.details.new_name}`);
        }
        if (log.details.overwrite_volumes !== undefined) {
            details.push(`Overwrite volumes: ${log.details.overwrite_volumes}`);
        }
        if (details.length > 0) {
            detailsHtml = details.join(', ');
        }
    }

    // Error message
    const errorMsg = log.error_message ? `<div style="color: var(--danger); font-size: 0.9em; margin-top: 4px;">${escapeHtml(log.error_message)}</div>` : '';

    // Add data attributes for filtering (explicitly separate fields for better search accuracy)
    tr.setAttribute('data-timestamp', formattedTime.toLowerCase());
    tr.setAttribute('data-operation', operationLabel.toLowerCase());
    tr.setAttribute('data-container-name', (log.container_name || '').toLowerCase());
    tr.setAttribute('data-container-id', (log.container_id || '').toLowerCase());
    tr.setAttribute('data-backup-filename', (log.backup_filename || '').toLowerCase());
    tr.setAttribute('data-status', statusText.toLowerCase());
    tr.setAttribute('data-error', (log.error_message || '').toLowerCase());
    tr.setAttribute('data-details', detailsHtml.toLowerCase());

    tr.innerHTML = `
        <td style="color: var(--text-secondary); font-size: 0.9em;">${formattedTime}</td>
        <td style="font-weight: 500;">${escapeHtml(operationLabel)}</td>
        <td>
            <div style="font-weight: 500;">${escapeHtml(containerInfo)}</div>
            ${containerId ? `<div style="font-size: 0.9em; color: var(--text-secondary);">${escapeHtml(containerId)}</div>` : ''}
        </td>
        <td style="color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(backupFile)}</td>
        <td>
            <div class="container-status ${statusClass}">${statusText}</div>
            ${errorMsg}
        </td>
        <td style="color: var(--text-secondary); font-size: 0.9em;">${detailsHtml}</td>
    `;

    return tr;
}

// Create total summary row (for statistics if needed)
function createTotalRow(label, value) {
    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    const tr = document.createElement('tr');
    tr.className = 'statistics-total-row';
    tr.style.backgroundColor = 'var(--card-bg)';
    tr.style.fontWeight = 'bold';

    tr.innerHTML = `
        <td colspan="2" style="font-weight: 600; color: var(--text-primary);">${escapeHtml(label)}</td>
        <td>-</td>
        <td>-</td>
        <td style="font-weight: 600; color: var(--text-primary);">${escapeHtml(value)}</td>
    `;

    return tr;
}

// Export functions to window for HTML access
window.loadAuditLogs = loadAuditLogs;
window.updateAuditLogPagination = updateAuditLogPagination;
window.loadAuditLogsPage = loadAuditLogsPage;
window.clearAuditLogs = clearAuditLogs;
window.filterAuditLogs = filterAuditLogs;
window.createAuditLogRow = createAuditLogRow;
window.createTotalRow = createTotalRow;

