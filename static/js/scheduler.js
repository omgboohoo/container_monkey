// Scheduler Module
// Handles backup scheduler configuration and management

// Load scheduler config
async function loadSchedulerConfig() {
    window.AppState.schedulerLoadingConfig = true; // Prevent auto-save during load
    try {
        const response = await fetch('/api/scheduler/config');

        // Check response status before parsing JSON
        if (!response.ok) {
            // Try to parse JSON error response, but handle HTML errors gracefully
            let errorMessage = 'Failed to load scheduler config';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;

                // Handle authentication errors
                if (response.status === 401) {
                    errorMessage = 'Authentication required. Please refresh the page and log in again.';
                }
            } catch (jsonError) {
                // Response is not JSON (likely HTML error page)
                if (response.status === 401) {
                    errorMessage = 'Authentication required. Please refresh the page and log in again.';
                } else {
                    errorMessage = `Server error (${response.status}). Please refresh the page.`;
                }
            }
            throw new Error(errorMessage);
        }

        window.AppState.schedulerConfig = await response.json();

        // Update UI with config
        const scheduleTypeEl = document.getElementById('schedule-type');
        const scheduleHourEl = document.getElementById('schedule-hour');
        const dayOfWeekEl = document.getElementById('day-of-week');
        const scheduleLifecycleEl = document.getElementById('schedule-lifecycle');

        if (scheduleTypeEl) scheduleTypeEl.value = window.AppState.schedulerConfig.schedule_type || 'daily';
        if (scheduleHourEl) scheduleHourEl.value = window.AppState.schedulerConfig.hour || 2;
        if (dayOfWeekEl) dayOfWeekEl.value = window.AppState.schedulerConfig.day_of_week || 0;
        if (scheduleLifecycleEl) scheduleLifecycleEl.value = window.AppState.schedulerConfig.lifecycle || 7;

        updateScheduleUI();
        updateSchedulerStatus();

        // Load containers after config is loaded so checkboxes can be set correctly
        loadSchedulerContainers();
    } catch (error) {
        console.error('Error loading scheduler config:', error);
        showError('scheduler-error', `Error loading scheduler config: ${error.message}`);
        // Still load containers even if config fails (will show unchecked)
        loadSchedulerContainers();
    } finally {
        window.AppState.schedulerLoadingConfig = false; // Re-enable auto-save after load completes
    }
}

// Load scheduler containers
async function loadSchedulerContainers() {
    const spinner = document.getElementById('scheduler-containers-spinner');
    const list = document.getElementById('scheduler-containers-list');
    const wrapper = document.getElementById('scheduler-containers-table-wrapper');

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    if (spinner) {
        spinner.style.display = 'flex';
        spinner.dataset.shownAt = Date.now(); // Track when shown
    }
    if (wrapper) wrapper.classList.add('loading-grid');
    if (list) list.innerHTML = '';

    try {
        const response = await fetch('/api/containers');

        // Check response status before parsing JSON
        if (!response.ok) {
            // Try to parse JSON error response, but handle HTML errors gracefully
            let errorMessage = 'Failed to load containers';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;

                // Handle authentication errors
                if (response.status === 401) {
                    errorMessage = 'Authentication required. Please refresh the page and log in again.';
                }
            } catch (jsonError) {
                // Response is not JSON (likely HTML error page)
                if (response.status === 401) {
                    errorMessage = 'Authentication required. Please refresh the page and log in again.';
                } else {
                    errorMessage = `Server error (${response.status}). Please refresh the page.`;
                }
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const containers = data.containers || [];
        const selectedIds = window.AppState.schedulerConfig ? (window.AppState.schedulerConfig.selected_containers || []) : [];

        // Update select all checkbox
        const selectAllCheckbox = document.getElementById('scheduler-select-all');
        if (selectAllCheckbox) {
            const visibleContainers = containers.filter(c => !c.is_self);
            const allSelected = visibleContainers.length > 0 && visibleContainers.every(c => selectedIds.includes(c.id));
            selectAllCheckbox.checked = allSelected;
            selectAllCheckbox.indeterminate = !allSelected && visibleContainers.some(c => selectedIds.includes(c.id));
        }

        if (containers.length === 0) {
            if (list) list.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-secondary);">No containers found</td></tr>';
        } else {
            containers.forEach(container => {
                // Skip self container
                if (container.is_self) {
                    return;
                }

                const isSelected = selectedIds.includes(container.id);
                const tr = document.createElement('tr');
                tr.className = 'scheduler-container-row';
                tr.style.cursor = 'pointer';
                tr.onclick = (event) => {
                    if (event.target.type !== 'checkbox') {
                        const checkbox = tr.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            checkbox.checked = !checkbox.checked;
                            updateSelectAllCheckbox();
                        }
                    }
                };

                const statusLower = container.status.toLowerCase();
                const statusTextLower = (container.status_text || '').toLowerCase();
                const isPaused = statusLower === 'paused' || statusTextLower.includes('paused');
                const statusClass = isPaused ? 'status-paused' :
                    statusLower === 'running' ? 'status-running' : 'status-stopped';
                const statusDisplay = container.status_text || container.status.toUpperCase();

                const imageInfo = container.image_info || {};
                const imageName = imageInfo.name || container.image || 'unknown';

                tr.innerHTML = `
                    <td class="checkbox-cell" onclick="event.stopPropagation();">
                        <input type="checkbox" 
                               class="container-checkbox scheduler-container-checkbox"
                               data-container-id="${container.id}" 
                               ${isSelected ? 'checked' : ''} 
                               onclick="event.stopPropagation(); updateSelectAllCheckbox(); autoSaveSchedulerConfig();">
                    </td>
                    <td>
                        <div class="container-name" style="font-weight: 600; color: var(--text-primary);">${escapeHtml(container.name)}</div>
                        <div style="font-size: 0.8em; color: var(--text-secondary); font-family: monospace;">ID: ${container.id.substring(0, 12)}</div>
                    </td>
                    <td>
                        <div class="container-status ${statusClass}">${statusDisplay}</div>
                    </td>
                    <td>
                        <div style="color: #fff; font-size: 0.9em;">${escapeHtml(imageName)}</div>
                    </td>
                `;

                if (list) list.appendChild(tr);
            });
        }

        if (spinner) {
            spinner.style.display = 'none';
            delete spinner.dataset.shownAt;
        }
        if (wrapper) {
            wrapper.style.overflow = '';
            wrapper.classList.remove('loading-grid');
        }
    } catch (error) {
        console.error('Error loading containers:', error);
        if (spinner) {
            spinner.style.display = 'none';
            delete spinner.dataset.shownAt;
        }
        if (list) list.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--danger);">Error loading containers: ${error.message}</td></tr>`;
    }
}

// Toggle select all scheduler containers
function toggleSelectAllSchedulerContainers() {
    const selectAllCheckbox = document.getElementById('scheduler-select-all');
    const checkboxes = document.querySelectorAll('.scheduler-container-checkbox');
    if (!selectAllCheckbox) return;

    const isChecked = selectAllCheckbox.checked;

    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
    updateSelectAllCheckbox();
    autoSaveSchedulerConfig();
}

// Update select all checkbox
function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('scheduler-select-all');
    const checkboxes = document.querySelectorAll('.scheduler-container-checkbox');

    if (!selectAllCheckbox) return;

    if (checkboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }

    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    selectAllCheckbox.checked = checkedCount === checkboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

// Update schedule UI
function updateScheduleUI() {
    const scheduleType = document.getElementById('schedule-type');
    const dayOfWeekContainer = document.getElementById('day-of-week-container');
    if (!scheduleType || !dayOfWeekContainer) return;

    const scheduleTypeValue = scheduleType.value;

    if (scheduleTypeValue === 'weekly') {
        dayOfWeekContainer.style.display = 'block';
    } else {
        dayOfWeekContainer.style.display = 'none';
    }

    // Auto-save when schedule type changes
    autoSaveSchedulerConfig();
}

// Update scheduler status
function updateSchedulerStatus() {
    const statusIcon = document.getElementById('scheduler-status-icon');
    const statusText = document.getElementById('scheduler-status-text');
    const nextRun = document.getElementById('scheduler-next-run');

    if (!statusIcon || !statusText) return;

    if (!window.AppState.schedulerConfig) {
        statusIcon.textContent = '⏸️';
        statusText.textContent = 'Scheduler disabled (no containers selected)';
        if (nextRun) nextRun.style.display = 'none';
        return;
    }

    const enabled = window.AppState.schedulerConfig.enabled;
    const selectedCount = window.AppState.schedulerConfig.selected_containers ? window.AppState.schedulerConfig.selected_containers.length : 0;

    if (enabled && selectedCount > 0) {
        statusIcon.textContent = '✅';
        statusText.textContent = `Scheduler enabled: ${selectedCount} container(s) selected`;

        if (window.AppState.schedulerConfig.next_run && nextRun) {
            const nextRunDate = new Date(window.AppState.schedulerConfig.next_run);
            // Use DD-MM-YYYY HH:MM:SS format
            const year = nextRunDate.getFullYear();
            const month = String(nextRunDate.getMonth() + 1).padStart(2, '0');
            const day = String(nextRunDate.getDate()).padStart(2, '0');
            const hours = String(nextRunDate.getHours()).padStart(2, '0');
            const minutes = String(nextRunDate.getMinutes()).padStart(2, '0');
            const seconds = String(nextRunDate.getSeconds()).padStart(2, '0');
            nextRun.textContent = `Next backup: ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
            nextRun.style.display = 'block';
        } else {
            if (nextRun) nextRun.style.display = 'none';
        }
    } else {
        statusIcon.textContent = '⏸️';
        statusText.textContent = 'Scheduler disabled (no containers selected)';
        if (nextRun) nextRun.style.display = 'none';
    }
}

// Auto-save scheduler config
function autoSaveSchedulerConfig() {
    // Don't auto-save during initial config load
    if (window.AppState.schedulerLoadingConfig) {
        return;
    }

    // Clear existing timer
    if (window.AppState.schedulerAutoSaveTimer) {
        clearTimeout(window.AppState.schedulerAutoSaveTimer);
    }

    // Debounce: wait 500ms after last change before saving
    window.AppState.schedulerAutoSaveTimer = setTimeout(() => {
        saveSchedulerConfig(true); // true = silent save (no notification)
    }, 500);
}

// Save scheduler config
async function saveSchedulerConfig(silent = false) {
    const errorEl = document.getElementById('scheduler-error');
    if (errorEl) errorEl.style.display = 'none';

    try {
        const scheduleTypeEl = document.getElementById('schedule-type');
        const scheduleHourEl = document.getElementById('schedule-hour');
        const dayOfWeekEl = document.getElementById('day-of-week');
        const scheduleLifecycleEl = document.getElementById('schedule-lifecycle');

        if (!scheduleTypeEl || !scheduleHourEl || !scheduleLifecycleEl) {
            throw new Error('Scheduler form elements not found');
        }

        const scheduleType = scheduleTypeEl.value;
        const hour = parseInt(scheduleHourEl.value);
        const dayOfWeek = scheduleType === 'weekly' && dayOfWeekEl ? parseInt(dayOfWeekEl.value) : null;
        const lifecycle = parseInt(scheduleLifecycleEl.value);

        // Get selected container IDs
        const checkboxes = document.querySelectorAll('.scheduler-container-checkbox');
        const selectedContainers = Array.from(checkboxes)
            .filter(cb => cb.checked)
            .map(cb => cb.getAttribute('data-container-id'));

        const config = {
            schedule_type: scheduleType,
            hour: hour,
            day_of_week: dayOfWeek,
            lifecycle: lifecycle,
            selected_containers: selectedContainers
        };

        const response = await fetch('/api/scheduler/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save scheduler config');
        }

        const result = await response.json();
        window.AppState.schedulerConfig = result.config;

        updateSchedulerStatus();

        if (!silent) {
            if (window.showNotification) {
                window.showNotification('Scheduler configuration saved successfully!', 'success');
            }
        }
    } catch (error) {
        console.error('Error saving scheduler config:', error);
        showError('scheduler-error', `Error saving scheduler config: ${error.message}`);
    }
}

// Show error
function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

// Check environment
async function checkEnvironment() {
    const modal = document.getElementById('env-check-modal');
    const resultsDiv = document.getElementById('env-check-results');

    if (!modal || !resultsDiv) return;

    modal.style.display = 'block';
    resultsDiv.innerHTML = '';
    resultsDiv.style.display = 'none';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch('/api/check-environment');
        const data = await response.json();

        resultsDiv.style.display = 'block';

        const allGood = data.docker_socket && data.docker_cli && data.busybox;
        const headerColor = allGood ? '#10b981' : '#ef4444';
        const headerIcon = allGood ? '✅' : '⚠️';
        const headerText = allGood ? 'System Ready' : 'Issues Detected';

        let html = `
            <div style="text-align: center; margin-bottom: 20px; padding: 15px; background: ${allGood ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border-radius: 8px; border: 1px solid ${headerColor};">
                <h3 style="color: ${headerColor}; margin: 0;">${headerIcon} ${headerText}</h3>
            </div>
            <div style="background: #1e293b; border-radius: 8px; padding: 15px; max-height: 300px; overflow-y: auto; border: 1px solid #334155;">
        `;

        if (data.details && data.details.length > 0) {
            data.details.forEach(line => {
                const isError = line.startsWith('❌');
                html += `<div style="margin-bottom: 8px; color: #cbd5e1; display: flex; align-items: flex-start;">
                            <span style="margin-right: 10px;">${line.substring(0, 1)}</span>
                            <span>${escapeHtml(line.substring(1).trim())}</span>
                         </div>`;
            });
        }

        html += '</div>';

        if (!data.busybox) {
            html += `
                <div style="margin-top: 15px; padding: 12px; background: rgba(245, 158, 11, 0.1); border: 1px solid #f59e0b; border-radius: 6px;">
                    <strong style="color: #f59e0b;">💡 Fix Busybox Issue:</strong>
                    <p style="font-size: 0.9em; margin-top: 5px; color: #cbd5e1;">
                        The app needs the 'busybox' image for backups/restores.
                        If your server is offline, load it manually:
                    </p>
                    <code style="display: block; background: #0f172a; padding: 8px; margin-top: 5px; border-radius: 4px; font-family: monospace; font-size: 0.85em;">docker load < busybox.tar</code>
                </div>
            `;
        }

        resultsDiv.innerHTML = html;

    } catch (error) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `<div class="error">Failed to run checks: ${escapeHtml(error.message)}</div>`;
    }
}

// Close environment check modal
function closeEnvCheckModal() {
    const modal = document.getElementById('env-check-modal');
    if (modal) modal.style.display = 'none';
}

// Export functions to window for HTML access
window.loadSchedulerConfig = loadSchedulerConfig;
window.loadSchedulerContainers = loadSchedulerContainers;
window.toggleSelectAllSchedulerContainers = toggleSelectAllSchedulerContainers;
window.updateSelectAllCheckbox = updateSelectAllCheckbox;
window.updateScheduleUI = updateScheduleUI;
window.updateSchedulerStatus = updateSchedulerStatus;
window.autoSaveSchedulerConfig = autoSaveSchedulerConfig;
window.saveSchedulerConfig = saveSchedulerConfig;
window.showError = showError;
window.checkEnvironment = checkEnvironment;
window.closeEnvCheckModal = closeEnvCheckModal;

