// Containers Module
// Handles all container-related functionality: loading, displaying, actions, bulk operations

// Load containers
async function loadContainers() {
    // Prevent concurrent loads
    if (window.AppState.isLoadingContainers) {
        return;
    }

    // Clear any active filters when reloading
    window.AppState.isFilteredByStack = false;
    window.AppState.currentStackFilter = null;
    const clearFilterBtn = document.getElementById('clear-filter-btn');
    if (clearFilterBtn) clearFilterBtn.style.display = 'none';

    window.AppState.isLoadingContainers = true;
    const errorEl = document.getElementById('error');
    const containersList = document.getElementById('containers-list');
    const containersSpinner = document.getElementById('containers-spinner');
    const containersWrapper = document.getElementById('containers-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';
    if (containersList) containersList.innerHTML = ''; // Clear immediately

    // Show spinner and prevent scrollbars
    if (containersSpinner) {
        containersSpinner.style.display = 'flex';
        containersSpinner.dataset.shownAt = Date.now(); // Track when shown
    }
    if (containersWrapper) {
        containersWrapper.style.overflow = 'hidden';
        containersWrapper.classList.add('loading-grid');
    }

    try {
        const response = await fetch('/api/containers');

        // Check response status before parsing JSON
        if (!response.ok) {
            // Try to parse JSON error response, but handle HTML errors gracefully
            let errorMessage = 'Failed to load containers';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;

                // Handle Docker client not available error specially
                if (response.status === 503 && errorData.error === 'Docker client not available') {
                    if (errorEl) {
                        errorEl.innerHTML = `
                            <h3>❌ Docker Client Not Available</h3>
                            <p><strong>${errorData.message || 'Docker daemon is not accessible'}</strong></p>
                            <p>To fix this issue:</p>
                            <ol style="text-align: left; display: inline-block; margin: 10px 0;">
                                <li>Run: <code>./add-to-docker-group.sh</code></li>
                                <li>Or manually: <code>sudo usermod -aG docker $USER</code></li>
                                <li>Then run: <code>newgrp docker</code> (or log out/in)</li>
                                <li>Verify: <code>docker ps</code></li>
                            </ol>
                            <p>After fixing, refresh this page.</p>
                        `;
                        errorEl.style.display = 'block';
                    }
                    if (containersSpinner) containersSpinner.style.display = 'none';
                    if (containersWrapper) containersWrapper.style.overflow = '';
                    window.AppState.isLoadingContainers = false;
                    return;
                }

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

        if (data.containers.length === 0) {
            if (containersList) {
                containersList.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">No containers found</p>';
            }
            if (window.updateButtonStates) {
                window.updateButtonStates();
            }
        } else {
            // Deduplicate containers by name (keep the first occurrence, which should be the newest)
            const seenNames = new Set();
            const uniqueContainers = [];

            for (const container of data.containers) {
                const containerName = container.name || '';
                if (!seenNames.has(containerName)) {
                    seenNames.add(containerName);
                    uniqueContainers.push(container);
                } else {
                    console.warn(`Duplicate container detected: ${containerName} (ID: ${container.id}). Skipping duplicate.`);
                }
            }

            // Store containers data for sorting
            window.AppState.containersData = uniqueContainers;

            // Render containers (will use current sort if any)
            renderContainers(window.AppState.containersData);
        }

        // Reset selection state (buttons and select-all checkbox)
        // Update button states after loading containers
        if (window.resetSelection) {
            window.resetSelection();
        }
        if (window.updateButtonStates) {
            window.updateButtonStates();
        }

        // Restart stats polling after containers are loaded
        if (window.startStatsPolling) {
            window.startStatsPolling();
        }

    } catch (error) {
        if (errorEl) {
            errorEl.innerHTML = `<h3>Error</h3><p>${window.escapeHtml ? window.escapeHtml(error.message) : error.message}</p>`;
            errorEl.style.display = 'block';
        }
    } finally {
        // Hide spinner and restore overflow
        if (containersSpinner) containersSpinner.style.display = 'none';
        if (containersWrapper) {
            containersWrapper.style.overflow = '';
            containersWrapper.classList.remove('loading-grid');
        }
        window.AppState.isLoadingContainers = false;
    }
}

// Create container row
function createContainerCard(container) {
    const tr = document.createElement('tr');
    const statusLower = container.status.toLowerCase();
    const statusTextLower = (container.status_text || '').toLowerCase();
    const isPaused = statusLower === 'paused' || statusTextLower.includes('paused');
    const rowStatusClass = isPaused ? 'paused' : statusLower;
    tr.className = `container-row ${rowStatusClass}`;
    // Store network names as data attribute for filtering
    const networkNames = container.networks && Array.isArray(container.networks) ? container.networks.join(',') : '';
    tr.setAttribute('data-networks', networkNames);
    if (!container.is_self) {
        tr.style.cursor = 'pointer';
        tr.onclick = (event) => toggleContainerSelection(event, tr);
    } else {
        // For self container, ensure buttons are still clickable
        tr.style.pointerEvents = 'auto';
    }

    // Normalize status for display
    const statusClass = isPaused ? 'status-paused' :
        statusLower === 'running' ? 'status-running' :
        statusLower === 'stopped' ? 'status-stopped' :
            'status-exited';
    const isRunning = statusLower === 'running' && !isPaused;

    // Use status_text if available for more detail
    const statusDisplay = container.status_text || container.status.toUpperCase();

    // Format IP and ports
    const ipAddress = container.ip_address || 'N/A';
    const portMappings = container.port_mappings || [];
    let portsDisplay = 'No ports';

    if (portMappings.length > 0) {
        const portLinks = portMappings.map(p => {
            if (p.host) {
                return `<span class="port-mapping"><span class="port-label host">Host</span> <span class="port-number">${p.host}</span></span> <span class="port-arrow">&rarr;</span> <span class="port-mapping"><span class="port-label container">Container</span> <span class="port-number">${p.container}</span></span>`;
            }
            return `<span class="port-mapping"><span class="port-label host">Host</span> <span class="port-number">${p.host}</span></span> <span class="port-arrow">&rarr;</span> <span class="port-mapping"><span class="port-label container">Container</span> <span class="port-number">${p.container}</span></span>`;
        });
        portsDisplay = portLinks.join('<br>');
    }

    // Format image info
    const imageInfo = container.image_info || {};
    const imageName = imageInfo.name || container.image || 'unknown';
    // Handle created timestamp - can be milliseconds (number) or ISO string
    let createdDate = 'Unknown';
    if (container.created) {
        if (typeof container.created === 'number') {
            // If it's a number, it should be milliseconds timestamp
            // If it's less than a reasonable date (e.g., before 2000), it might be seconds - convert it
            if (container.created > 0 && container.created < 946684800000) { // Jan 1, 2000 in milliseconds
                // Likely seconds, convert to milliseconds
                createdDate = new Date(container.created * 1000).toLocaleString();
            } else if (container.created > 0) {
                // Already milliseconds
                createdDate = new Date(container.created).toLocaleString();
            }
        } else if (typeof container.created === 'string') {
            // ISO 8601 string format
            createdDate = new Date(container.created).toLocaleString();
        }
    }

    // Format stack info
    const stackInfo = container.stack_info || null;
    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });
    const stackDisplay = stackInfo ? escapeHtml(stackInfo.display || stackInfo.name || '') : '<span style="color: var(--text-light);">-</span>';

    tr.innerHTML = `
        <td class="checkbox-cell">
            <input type="checkbox" class="container-checkbox" data-container-id="${container.id}" onclick="event.stopPropagation(); handleCheckboxClick(this);" ${container.is_self ? 'disabled' : ''}>
        </td>
        <td>
            <div class="container-name" style="font-weight: 600; color: var(--text-primary);">${escapeHtml(container.name)} ${container.is_self ? '<span style="color: #999; font-size: 0.8em;">(self)</span>' : ''}</div>
            <div style="font-size: 0.8em; color: var(--text-secondary); font-family: monospace;">ID: ${container.id.substring(0, 12)}</div>
        </td>
        <td>
            <div class="container-status ${statusClass}">${statusDisplay}</div>
        </td>
        <td>
            <div style="color: var(--accent); font-size: 0.9em; font-weight: 500;">${stackDisplay}</div>
            ${stackInfo && stackInfo.service ? `<div style="font-size: 0.75em; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(stackInfo.service)}</div>` : ''}
        </td>
        <td>
            <div style="color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(imageName)}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">${createdDate}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">${escapeHtml(ipAddress)}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">${portsDisplay}</div>
        </td>
        <td style="white-space: nowrap;">
            <div class="btn-group" style="display: flex; gap: 2px; pointer-events: auto;">
                <button class="btn-icon" onclick="event.stopPropagation(); event.preventDefault(); showContainerDetails('${container.id}'); return false;" title="Container Details" style="pointer-events: auto;">
                    <i class="ph ph-info"></i>
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); event.preventDefault(); showContainerInspect('${container.id}', '${escapeHtml(container.name)}'); return false;" title="Inspect Container" style="pointer-events: auto;">
                    <i class="ph ph-magnifying-glass"></i>
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); event.preventDefault(); showLogs('${container.id}', '${escapeHtml(container.name)}'); return false;" title="Container Logs" style="pointer-events: auto;">
                    <i class="ph ph-terminal-window"></i>
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); event.preventDefault(); openAttachConsole('${container.id}', '${escapeHtml(container.name)}'); return false;" title="Exec Console" style="pointer-events: auto;">
                    <i class="ph ph-terminal"></i>
                </button>
            </div>
        </td>
    `;

    return tr;
}

// Render containers (used for initial load and after sorting)
function renderContainers(containers) {
    const containersList = document.getElementById('containers-list');
    if (!containersList) return;
    
    containersList.innerHTML = '';
    // Clear container metadata map
    window.AppState.containerMetadata.clear();

    containers.forEach(container => {
        // Store container metadata
        window.AppState.containerMetadata.set(container.id, {
            is_self: container.is_self || false,
            name: container.name || ''
        });
        const card = createContainerCard(container);
        containersList.appendChild(card);
    });
}

// Sort containers
function sortContainers(column) {
    // Toggle sort direction if clicking the same column
    if (window.AppState.currentSortColumn === column) {
        window.AppState.currentSortDirection = window.AppState.currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.AppState.currentSortColumn = column;
        window.AppState.currentSortDirection = 'asc';
    }

    // Update sort indicators
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        indicator.textContent = '';
    });

    const sortIndicator = document.getElementById(`sort-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = window.AppState.currentSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    // Sort containers
    const sorted = [...window.AppState.containersData].sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            case 'status':
                aVal = (a.status || '').toLowerCase();
                bVal = (b.status || '').toLowerCase();
                break;
            case 'stack':
                aVal = (a.stack_info?.name || a.stack_info?.display || '').toLowerCase();
                bVal = (b.stack_info?.name || b.stack_info?.display || '').toLowerCase();
                // Put empty stacks at the end
                if (!aVal && bVal) return 1;
                if (aVal && !bVal) return -1;
                break;
            case 'image':
                const aImage = a.image_info?.name || a.image || '';
                const bImage = b.image_info?.name || b.image || '';
                aVal = aImage.toLowerCase();
                bVal = bImage.toLowerCase();
                break;
            case 'created':
                aVal = a.created || 0;
                bVal = b.created || 0;
                break;
            case 'ip':
                aVal = (a.ip_address || 'N/A').toLowerCase();
                bVal = (b.ip_address || 'N/A').toLowerCase();
                // Put N/A at the end
                if (aVal === 'n/a' && bVal !== 'n/a') return 1;
                if (aVal !== 'n/a' && bVal === 'n/a') return -1;
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return window.AppState.currentSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return window.AppState.currentSortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    // Re-render containers
    renderContainers(sorted);
}

function toggleContainerSelection(event, row) {
    // Don't toggle if clicking on a button or link
    if (event.target.closest('button') || event.target.closest('a')) {
        return;
    }
    const checkbox = row.querySelector('.container-checkbox');
    if (checkbox) {
        // Don't toggle if checkbox is disabled (e.g., app's own container)
        if (checkbox.disabled) {
            return;
        }
        checkbox.checked = !checkbox.checked;
        if (window.handleCheckboxClick) {
            window.handleCheckboxClick(checkbox);
        }
    }
}

function toggleSelectAll(source) {
    // Only select visible containers (respects filtering)
    const allRows = document.querySelectorAll('.container-row');
    const visibleRows = Array.from(allRows).filter(row => row.style.display !== 'none');
    const visibleCheckboxes = visibleRows
        .map(row => row.querySelector('.container-checkbox:not([disabled])'))
        .filter(cb => cb !== null);

    visibleCheckboxes.forEach(cb => cb.checked = source.checked);
    if (window.updateButtonStates) {
        window.updateButtonStates();
    }
}

// This is the single source of truth for all container button states.
function updateButtonStates(containers) {
    const containerCheckboxes = document.querySelectorAll('.container-checkbox');
    const nonSelfCheckboxes = document.querySelectorAll('.container-checkbox:not([disabled])');
    const selectedCheckboxes = document.querySelectorAll('.container-checkbox:checked');

    const bulkActionButtons = document.querySelectorAll('.bulk-btn');
    const backupAllBtn = document.getElementById('backup-all-btn');

    const hasSelection = selectedCheckboxes.length > 0;
    const hasEligibleContainers = nonSelfCheckboxes.length > 0;

    // Check status of selected containers
    let hasPausedContainers = false;
    let hasStoppedContainers = false;  // Stopped, Created, or Exited
    let hasRunningContainers = false;   // Running, Healthy, Unhealthy, or Starting
    
    if (hasSelection) {
        selectedCheckboxes.forEach(checkbox => {
            const row = checkbox.closest('tr');
            if (row) {
                const rowClass = row.className || '';
                const statusText = row.querySelector('.container-status')?.textContent?.toLowerCase() || '';
                
                // Check for paused state
                if (rowClass.includes('paused') || statusText.includes('paused')) {
                    hasPausedContainers = true;
                }
                // Check for stopped states (stopped, created, exited)
                else if (rowClass.includes('stopped') || rowClass.includes('exited') || 
                         statusText.includes('stopped') || statusText.includes('created') || 
                         statusText.includes('exited')) {
                    hasStoppedContainers = true;
                }
                // Check for running states (running, healthy, unhealthy, starting)
                else if (rowClass.includes('running') || statusText.includes('running') || 
                         statusText.includes('healthy') || statusText.includes('unhealthy') ||
                         statusText.includes('starting')) {
                    hasRunningContainers = true;
                }
            }
        });
    }

    // Handle restart button explicitly (works on any container status)
    const restartBtn = document.getElementById('restart-btn');
    if (restartBtn) {
        const shouldBeDisabled = !hasSelection;
        if (shouldBeDisabled) {
            restartBtn.setAttribute('disabled', 'disabled');
        } else {
            restartBtn.removeAttribute('disabled');
        }
        restartBtn.disabled = shouldBeDisabled;
        restartBtn.style.opacity = shouldBeDisabled ? '0.5' : '1';
        restartBtn.style.cursor = shouldBeDisabled ? 'not-allowed' : 'pointer';
    }
    
    // Handle buttons that depend on selection and status
    bulkActionButtons.forEach(btn => {
        // Skip restart button as it's handled above
        if (btn.id === 'restart-btn') {
            return;
        }
        
        const onclickAttr = btn.getAttribute('onclick') || btn.onclick?.toString() || '';
        let isDisabled = !hasSelection;
        
        // Start button: disabled if no selection OR if no stopped containers selected
        if (onclickAttr.includes('startSelectedContainers')) {
            isDisabled = !hasSelection || !hasStoppedContainers;
        }
        // Stop button: disabled if no selection OR if no running containers selected
        else if (onclickAttr.includes('stopSelectedContainers')) {
            isDisabled = !hasSelection || !hasRunningContainers;
        }
        // Kill button: disabled if no selection OR if stopped containers are selected
        else if (onclickAttr.includes('killSelectedContainers')) {
            isDisabled = !hasSelection || hasStoppedContainers;
        }
        // Pause button: disabled if no selection OR if no running containers selected
        else if (onclickAttr.includes('pauseSelectedContainers')) {
            isDisabled = !hasSelection || !hasRunningContainers;
        }
        // Resume button: disabled if no selection OR if no paused containers selected
        else if (onclickAttr.includes('resumeSelectedContainers')) {
            isDisabled = !hasSelection || !hasPausedContainers;
        }
        // Backup and Remove buttons: disabled only if no selection
        // (they work on both running and stopped containers)
        
        // Explicitly set disabled state
        if (isDisabled) {
            btn.setAttribute('disabled', 'disabled');
        } else {
            btn.removeAttribute('disabled');
        }
        btn.disabled = isDisabled;
        btn.style.opacity = isDisabled ? '0.5' : '1';
        btn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
    });

    // Handle "Backup All" button
    if (backupAllBtn) {
        const isDisabled = !hasEligibleContainers;
        backupAllBtn.disabled = isDisabled;
        backupAllBtn.style.opacity = isDisabled ? '0.5' : '1';
        backupAllBtn.style.cursor = isDisabled ? 'not-allowed' : 'pointer';
        backupAllBtn.style.pointerEvents = isDisabled ? 'none' : 'auto';
    }
}

function resetSelection() {
    // Uncheck all container checkboxes
    document.querySelectorAll('.container-checkbox').forEach(cb => cb.checked = false);

    // Uncheck select all
    const selectAll = document.getElementById('select-all-containers');
    if (selectAll) selectAll.checked = false;

    // Update button state
    if (window.handleCheckboxClick) {
        window.handleCheckboxClick();
    }
}

// Handle checkbox clicks for bulk actions
function handleCheckboxClick(checkbox) {
    if (window.updateButtonStates) {
        window.updateButtonStates();
    }
}

// Show container details
async function showContainerDetails(containerId) {
    window.AppState.currentContainerId = containerId;
    const modal = document.getElementById('details-modal');
    const detailsDiv = document.getElementById('container-details');

    if (!modal || !detailsDiv) return;

    detailsDiv.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';
    modal.style.display = 'block';

    try {
        const response = await fetch(`/api/container/${containerId}/details`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load container details');
        }

        detailsDiv.innerHTML = formatContainerDetails(data);
    } catch (error) {
        detailsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

// Show container inspect (raw JSON)
async function showContainerInspect(containerId, containerName) {
    const modal = document.getElementById('inspect-modal');
    const titleDiv = document.getElementById('inspect-modal-title');
    const contentDiv = document.getElementById('inspect-content');
    const copyBtn = document.getElementById('inspect-copy-btn');

    if (!modal || !contentDiv) {
        console.error('Inspect modal elements not found');
        return;
    }

    if (titleDiv) {
        titleDiv.textContent = `Inspect: ${containerName || containerId.substring(0, 12)}`;
    }

    contentDiv.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';
    modal.style.display = 'block';

    // Disable copy button while loading
    if (copyBtn) {
        copyBtn.disabled = true;
    }

    try {
        const response = await fetch(`/api/container/${containerId}/inspect`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to inspect container');
        }

        // Format JSON with proper indentation and basic syntax highlighting
        const jsonString = JSON.stringify(data, null, 2);
        const highlightedJson = highlightJson(jsonString);
        contentDiv.innerHTML = `<pre id="inspect-json-content"><code>${highlightedJson}</code></pre>`;

        // Enable copy button
        if (copyBtn) {
            copyBtn.disabled = false;
        }
    } catch (error) {
        const escapeHtml = window.escapeHtml || ((text) => {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        });
        contentDiv.innerHTML = `<div class="error">Error: ${escapeHtml(error.message)}</div>`;
        if (copyBtn) {
            copyBtn.disabled = true;
        }
    }
}

// Basic JSON syntax highlighting
function highlightJson(json) {
    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });
    return escapeHtml(json)
        .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
            let cls = 'json-value';
            if (/^"/.test(match)) {
                if (/:$/.test(match)) {
                    cls = 'json-key';
                } else {
                    cls = 'json-string';
                }
            } else if (/true|false/.test(match)) {
                cls = 'json-boolean';
            } else if (/null/.test(match)) {
                cls = 'json-null';
            } else if (/^-?\d/.test(match)) {
                cls = 'json-number';
            }
            return `<span class="${cls}">${match}</span>`;
        });
}

// Copy inspect JSON to clipboard
function copyInspectJson() {
    const contentDiv = document.getElementById('inspect-json-content');
    if (!contentDiv) {
        return;
    }

    const jsonText = contentDiv.textContent || contentDiv.innerText;
    
    navigator.clipboard.writeText(jsonText).then(() => {
        const copyBtn = document.getElementById('inspect-copy-btn');
        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="ph ph-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
        if (window.showNotification) {
            window.showNotification('Failed to copy to clipboard', 'error');
        }
    });
}

// Close inspect modal
function closeInspectModal() {
    const modal = document.getElementById('inspect-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Format container details
function formatContainerDetails(data) {
    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });
    
    let html = `
        <div class="details-section">
            <h3>Basic Information</h3>
            <ul>
                <li><strong>Name:</strong> ${escapeHtml(data.name)}</li>
                <li><strong>ID:</strong> <span style="font-family: monospace; font-size: 0.9em;">${escapeHtml(data.id)}</span></li>
                <li><strong>Image:</strong> ${escapeHtml(data.image)}</li>
                <li><strong>Status:</strong> ${escapeHtml(data.status)}</li>
                <li><strong>Created:</strong> ${new Date(data.created).toLocaleString()}</li>
                ${data.started ? `<li><strong>Start Time:</strong> ${new Date(data.started).toLocaleString()}</li>` : ''}
            </ul>
        </div>
    `;

    if (data.config && data.config.env && data.config.env.length > 0) {
        html += `
            <div class="details-section">
                <h3>Environment Variables</h3>
                <ul>
                    ${data.config.env.map(env => `<li>${escapeHtml(env)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    if (data.config && data.config.labels && Object.keys(data.config.labels).length > 0) {
        html += `
            <div class="details-section">
                <h3>Labels</h3>
                <ul>
                    ${Object.entries(data.config.labels).map(([key, value]) => `<li><strong>${escapeHtml(key)}</strong> ${escapeHtml(value)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    if (data.host_config && data.host_config.binds && data.host_config.binds.length > 0) {
        html += `
            <div class="details-section">
                <h3>Volume Mounts</h3>
                <ul>
                    ${data.host_config.binds.map(bind => `<li>${escapeHtml(bind)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    if (data.host_config && data.host_config.port_bindings && Object.keys(data.host_config.port_bindings).length > 0) {
        html += `
            <div class="details-section">
                <h3>Port Mappings</h3>
                <ul>
                    ${Object.entries(data.host_config.port_bindings).map(([port, bindings]) => {
            if (bindings && bindings.length > 0) {
                return `<li>${bindings[0].HostPort}:${port}</li>`;
            }
            return '';
        }).join('')}
                </ul>
            </div>
        `;
    }

    if (data.host_config && data.host_config.network_mode) {
        html += `
            <div class="details-section">
                <h3>Network</h3>
                <ul>
                    <li><strong>Mode:</strong> ${escapeHtml(data.host_config.network_mode)}</li>
                </ul>
            </div>
        `;
    }

    return html;
}

// Container actions (start, stop, restart, etc.)
async function startContainer(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/start`, {
            method: 'POST',
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to start container');
        }
        return true;
    } catch (error) {
        console.error(`Error starting container: ${error.message}`);
        if (window.showNotification) {
            window.showNotification(`Error starting container: ${error.message}`, 'error');
        }
        return false;
    }
}

async function restartContainer(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/restart`, {
            method: 'POST',
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to restart container');
        }
        return true;
    } catch (error) {
        console.error(`Error restarting container: ${error.message}`);
        if (window.showNotification) {
            window.showNotification(`Error restarting container: ${error.message}`, 'error');
        }
        return false;
    }
}

async function stopContainer(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/stop`, {
            method: 'POST',
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to stop container');
        }
        return true;
    } catch (error) {
        console.error(`Error stopping container: ${error.message}`);
        if (window.showNotification) {
            window.showNotification(`Error stopping container: ${error.message}`, 'error');
        }
        return false;
    }
}

async function killContainer(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/kill`, {
            method: 'POST',
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to kill container');
        }
        return true;
    } catch (error) {
        console.error(`Error killing container: ${error.message}`);
        if (window.showNotification) {
            window.showNotification(`Error killing container: ${error.message}`, 'error');
        }
        return false;
    }
}

async function pauseContainer(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/pause`, {
            method: 'POST',
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to pause container');
        }
        return true;
    } catch (error) {
        console.error(`Error pausing container: ${error.message}`);
        if (window.showNotification) {
            window.showNotification(`Error pausing container: ${error.message}`, 'error');
        }
        return false;
    }
}

async function resumeContainer(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/resume`, {
            method: 'POST',
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to resume container');
        }
        return true;
    } catch (error) {
        console.error(`Error resuming container: ${error.message}`);
        if (window.showNotification) {
            window.showNotification(`Error resuming container: ${error.message}`, 'error');
        }
        return false;
    }
}

// Bulk container actions
function getSelectedContainerIds() {
    const selectedCheckboxes = document.querySelectorAll('.container-checkbox:checked');
    return Array.from(selectedCheckboxes).map(cb => cb.dataset.containerId);
}

async function startSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    let successCount = 0;
    for (const containerId of selectedIds) {
        if (await startContainer(containerId)) {
            successCount++;
        }
    }

    if (successCount > 0 && window.showNotification) {
        const msg = successCount === 1 ? 'Container started successfully.' : `${successCount} containers started successfully.`;
        window.showNotification(msg, 'success');
    }

    if (window.resetSelection) {
        window.resetSelection();
    }
    setTimeout(() => {
        if (window.loadContainers) {
            window.loadContainers();
        }
    }, 300);
}

async function restartSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    let successCount = 0;
    for (const containerId of selectedIds) {
        if (await restartContainer(containerId)) {
            successCount++;
        }
    }

    if (successCount > 0 && window.showNotification) {
        const msg = successCount === 1 ? 'Container restarted successfully.' : `${successCount} containers restarted successfully.`;
        window.showNotification(msg, 'success');
    }

    if (window.resetSelection) {
        window.resetSelection();
    }
    setTimeout(() => {
        if (window.loadContainers) {
            window.loadContainers();
        }
    }, 300);
}

async function stopSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    let successCount = 0;
    for (const containerId of selectedIds) {
        if (await stopContainer(containerId)) {
            successCount++;
        }
    }

    if (successCount > 0 && window.showNotification) {
        const msg = successCount === 1 ? 'Container stopped successfully.' : `${successCount} containers stopped successfully.`;
        window.showNotification(msg, 'success');
    }

    if (window.resetSelection) {
        window.resetSelection();
    }
    setTimeout(() => {
        if (window.loadContainers) {
            window.loadContainers();
        }
    }, 300);
}

async function killSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    let successCount = 0;
    for (const containerId of selectedIds) {
        if (await killContainer(containerId)) {
            successCount++;
        }
    }

    if (successCount > 0 && window.showNotification) {
        const msg = successCount === 1 ? 'Container killed successfully.' : `${successCount} containers killed successfully.`;
        window.showNotification(msg, 'success');
    }

    if (window.resetSelection) {
        window.resetSelection();
    }
    setTimeout(() => {
        if (window.loadContainers) {
            window.loadContainers();
        }
    }, 300);
}

async function pauseSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    let successCount = 0;
    for (const containerId of selectedIds) {
        if (await pauseContainer(containerId)) {
            successCount++;
        }
    }

    if (successCount > 0 && window.showNotification) {
        const msg = successCount === 1 ? 'Container paused successfully.' : `${successCount} containers paused successfully.`;
        window.showNotification(msg, 'success');
    }

    if (window.resetSelection) {
        window.resetSelection();
    }
    setTimeout(() => {
        if (window.loadContainers) {
            window.loadContainers();
        }
    }, 300);
}

async function resumeSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    let successCount = 0;
    for (const containerId of selectedIds) {
        if (await resumeContainer(containerId)) {
            successCount++;
        }
    }

    if (successCount > 0 && window.showNotification) {
        const msg = successCount === 1 ? 'Container resumed successfully.' : `${successCount} containers resumed successfully.`;
        window.showNotification(msg, 'success');
    }

    if (window.resetSelection) {
        window.resetSelection();
    }
    setTimeout(() => {
        if (window.loadContainers) {
            window.loadContainers();
        }
    }, 300);
}

// View containers in a stack (filters containers table)
function viewStackContainers(stackName) {
    // Switch to containers section
    if (window.showSection) {
        window.showSection('containers', document.querySelector('.nav-item[onclick*="containers"]'));
    }

    // Wait for containers to load, then filter
    setTimeout(() => {
        const rows = document.querySelectorAll('.container-row');
        let visibleCount = 0;
        rows.forEach(row => {
            const stackCell = row.querySelector('td:nth-child(4)'); // Stack is 4th column
            if (stackCell) {
                const stackText = stackCell.textContent.trim();
                const matchesStack = stackText.toLowerCase().includes(stackName.toLowerCase());
                row.style.display = matchesStack ? '' : 'none';
                if (matchesStack) visibleCount++;
            }
        });

        // Track filter state
        window.AppState.isFilteredByStack = true;
        window.AppState.currentStackFilter = stackName;

        // Show clear filter button
        const clearFilterBtn = document.getElementById('clear-filter-btn');
        if (clearFilterBtn) clearFilterBtn.style.display = 'inline-block';

        // Uncheck select all when filtering
        const selectAllCheckbox = document.getElementById('select-all-containers');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        // Show notification
        if (window.showNotification) {
            window.showNotification(`Showing ${visibleCount} container(s) in stack "${stackName}"`, 'info');
        }
    }, 500);
}

// Clear stack filter
function clearStackFilter() {
    const rows = document.querySelectorAll('.container-row');
    rows.forEach(row => {
        row.style.display = '';
    });
    window.AppState.isFilteredByStack = false;
    window.AppState.currentStackFilter = null;

    // Hide clear filter button
    const clearFilterBtn = document.getElementById('clear-filter-btn');
    if (clearFilterBtn) clearFilterBtn.style.display = 'none';

    // Uncheck select all
    const selectAllCheckbox = document.getElementById('select-all-containers');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;

    // Clear any selections
    if (window.resetSelection) {
        window.resetSelection();
    }

    if (window.showNotification) {
        window.showNotification('Filter cleared - showing all containers', 'info');
    }
}

// View container by name (filters containers table)
function viewContainerByName(containerName) {
    // Switch to containers section
    if (window.showSection) {
        window.showSection('containers', document.querySelector('.nav-item[onclick*="containers"]'));
    }

    // Wait for containers to load, then filter
    setTimeout(() => {
        const rows = document.querySelectorAll('.container-row');
        let visibleCount = 0;
        rows.forEach(row => {
            const nameElement = row.querySelector('.container-name');
            if (nameElement) {
                // Get container name text (remove "(self)" if present)
                const nameText = nameElement.textContent.trim().replace(/\s*\(self\)$/, '');
                const matchesName = nameText.toLowerCase() === containerName.toLowerCase();
                row.style.display = matchesName ? '' : 'none';
                if (matchesName) visibleCount++;
            }
        });

        // Track filter state
        window.AppState.isFilteredByStack = true;
        window.AppState.currentStackFilter = containerName;

        // Show clear filter button
        const clearFilterBtn = document.getElementById('clear-filter-btn');
        if (clearFilterBtn) clearFilterBtn.style.display = 'inline-block';

        // Uncheck select all when filtering
        const selectAllCheckbox = document.getElementById('select-all-containers');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        // Show notification
        if (window.showNotification) {
            window.showNotification(`Showing container "${containerName}"`, 'info');
        }
    }, 500);
}

// View containers using a network (filters containers table)
function viewNetworkContainers(networkName) {
    // Switch to containers section
    if (window.showSection) {
        window.showSection('containers', document.querySelector('.nav-item[onclick*="containers"]'));
    }

    // Ensure containers are loaded, then filter
    const filterContainers = () => {
        const rows = document.querySelectorAll('.container-row');
        if (rows.length === 0) {
            // Containers not loaded yet, wait a bit more
            setTimeout(filterContainers, 200);
            return;
        }

        let visibleCount = 0;
        rows.forEach(row => {
            const networksAttr = row.getAttribute('data-networks');
            if (networksAttr) {
                const networks = networksAttr.split(',').map(n => n.trim());
                const matchesNetwork = networks.some(n => n.toLowerCase() === networkName.toLowerCase());
                row.style.display = matchesNetwork ? '' : 'none';
                if (matchesNetwork) visibleCount++;
            } else {
                row.style.display = 'none';
            }
        });

        // Track filter state
        window.AppState.isFilteredByStack = true;
        window.AppState.currentStackFilter = networkName;

        // Show clear filter button
        const clearFilterBtn = document.getElementById('clear-filter-btn');
        if (clearFilterBtn) clearFilterBtn.style.display = 'inline-block';

        // Uncheck select all when filtering
        const selectAllCheckbox = document.getElementById('select-all-containers');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;

        // Show notification
        if (window.showNotification) {
            window.showNotification(`Showing ${visibleCount} container(s) using network "${networkName}"`, 'info');
        }
    };

    // Start filtering after a short delay to allow containers to load
    setTimeout(filterContainers, 500);
}

// Backup functions
async function backupContainer() {
    if (!window.AppState.currentContainerId) {
        console.error('No container selected');
        return;
    }

    const backupModal = document.getElementById('backup-modal');
    const detailsModal = document.getElementById('details-modal');
    const statusEl = document.getElementById('backup-status');
    const stepEl = document.getElementById('backup-step');
    const progressBar = document.getElementById('backup-progress-bar');
    const percentageEl = document.getElementById('backup-percentage');

    if (!backupModal || !statusEl || !stepEl || !progressBar || !percentageEl) {
        console.error('Backup modal elements not found:', { backupModal, statusEl, stepEl, progressBar, percentageEl });
        console.error('Error: Backup modal elements not found. Please refresh the page.');
        return;
    }

    if (detailsModal) detailsModal.style.display = 'none';
    backupModal.style.display = 'block';
    statusEl.innerHTML = 'Starting backup...';
    stepEl.innerHTML = 'Preparing...';
    progressBar.style.width = '0%';
    percentageEl.innerHTML = '0%';

    try {
        const response = await fetch(`/api/backup/${window.AppState.currentContainerId}`, {
            method: 'POST',
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create backup');
        }

        // Start polling for progress if we have a progress_id
        if (data.progress_id) {
            const progressInterval = setInterval(async () => {
                try {
                    const progressResponse = await fetch(`/api/backup-progress/${data.progress_id}`);
                    if (!progressResponse.ok) {
                        clearInterval(progressInterval);
                        return;
                    }

                    let progress;
                    try {
                        progress = await progressResponse.json();
                    } catch (jsonError) {
                        console.error('Failed to parse progress JSON:', jsonError);
                        clearInterval(progressInterval);
                        return;
                    }

                    // Update UI
                    statusEl.innerHTML = progress.step || 'Processing...';
                    stepEl.innerHTML = progress.step || '';
                    progressBar.style.width = `${progress.progress}%`;
                    percentageEl.innerHTML = `${progress.progress}%`;

                    if (progress.status === 'complete') {
                        clearInterval(progressInterval);
                        setTimeout(() => {
                            backupModal.style.display = 'none';
                            if (detailsModal) detailsModal.style.display = 'block';

                            const detailsDiv = document.getElementById('container-details');
                            if (detailsDiv) {
                                detailsDiv.innerHTML = `
                                    <div class="success-message">
                                        <h3>✅ Backup Created Successfully!</h3>
                                        <p>Backup file: <strong>${window.escapeHtml(progress.backup_filename || data.backup_file)}</strong></p>
                                        <p><a href="/api/download/${progress.backup_filename || data.backup_file}">Download Backup</a></p>
                                    </div>
                                `;
                            }

                            // Reload backups list
                            if (window.loadBackups) {
                                window.loadBackups();
                            }
                        }, 500);
                    } else if (progress.status === 'error') {
                        clearInterval(progressInterval);
                        throw new Error(progress.error || 'Backup failed');
                    }
                } catch (error) {
                    clearInterval(progressInterval);
                    console.error('Progress polling error:', error);
                }
            }, 300); // Poll every 300ms

            // Timeout after 10 minutes
            setTimeout(() => {
                clearInterval(progressInterval);
            }, 600000);
        } else {
            // Fallback if no progress_id
            backupModal.style.display = 'none';
            if (detailsModal) detailsModal.style.display = 'block';

            const detailsDiv = document.getElementById('container-details');
            if (detailsDiv) {
                detailsDiv.innerHTML = `
                    <div class="success-message">
                        <h3>✅ Backup Created Successfully!</h3>
                        <p>Backup file: <strong>${window.escapeHtml(data.backup_file)}</strong></p>
                        <p><a href="/api/download/${data.backup_file}">Download Backup</a></p>
                    </div>
                `;
            }

            if (window.loadBackups) {
                window.loadBackups();
            }
        }
    } catch (error) {
        backupModal.style.display = 'none';
        if (detailsModal) detailsModal.style.display = 'block';
        const detailsDiv = document.getElementById('container-details');
        if (detailsDiv) {
            detailsDiv.innerHTML = `<div class="error">Error: ${window.escapeHtml(error.message)}</div>`;
        }
    }
}

// Backup container directly from card (without opening details modal)
async function backupContainerDirect(containerId, containerName) {
    if (!containerId) {
        console.error('No container selected');
        return;
    }

    // Check backup status first
    try {
        const statusResponse = await fetch('/api/backup/status');
        const statusData = await statusResponse.json();
        if (statusData.status === 'busy') {
            if (window.showNotification) {
                window.showNotification(`A backup for "${statusData.current_backup}" is already in progress. Please wait.`, 'warning');
            }
            return;
        }
    } catch (error) {
        console.error('Error checking backup status:', error);
    }

    if (window.AppState.isBackupInProgress) {
        if (window.showNotification) {
            window.showNotification('A backup is already in progress. Please wait for it to finish.', 'warning');
        }
        return;
    }

    if (window.AppState.backupAllInProgress) {
        if (window.showNotification) {
            window.showNotification('A bulk backup operation is in progress. Please wait for it to finish.', 'warning');
        }
        return;
    }

    window.AppState.isBackupInProgress = true;

    // Get the button that was clicked
    const button = event.target;
    const originalText = button.innerHTML;

    // Change button to show it's backing up
    button.innerHTML = '⏳ Backing up...';
    button.disabled = true;

    // Disable all buttons in this container's card to prevent conflicts
    const cardActions = button.closest('.container-actions');
    const containerCard = button.closest('.container-card');
    let containerInfo = null;

    if (containerCard) {
        containerInfo = containerCard.querySelector('.container-info');
        if (containerInfo) {
            // Disable clicking on container info (prevents opening modal)
            containerInfo.style.pointerEvents = 'none';
            containerInfo.style.opacity = '0.7';
            containerInfo.style.cursor = 'not-allowed';
        }
    }

    if (cardActions) {
        const allButtons = cardActions.querySelectorAll('button');
        allButtons.forEach(btn => {
            btn.disabled = true;
            if (btn !== button) {
                btn.classList.add('disabled');
            }
        });
    }

    // Also disable all other backup buttons
    const allBackupButtons = document.querySelectorAll('.btn-warning');
    allBackupButtons.forEach(btn => {
        if (btn !== button && btn.textContent.includes('Backup')) {
            btn.disabled = true;
            btn.classList.add('disabled');
        }
    });

    // Show backup modal for progress
    const backupModal = document.getElementById('backup-modal');
    const statusEl = document.getElementById('backup-status');
    const stepEl = document.getElementById('backup-step');
    const progressBar = document.getElementById('backup-progress-bar');
    const percentageEl = document.getElementById('backup-percentage');

    if (!backupModal || !statusEl || !stepEl || !progressBar || !percentageEl) {
        console.error('Backup modal elements not found:', { backupModal, statusEl, stepEl, progressBar, percentageEl });
        console.error('Error: Backup modal elements not found. Please refresh the page.');
        return;
    }

    backupModal.style.display = 'block';
    statusEl.innerHTML = 'Starting backup...';
    stepEl.innerHTML = 'Preparing...';
    progressBar.style.width = '0%';
    percentageEl.innerHTML = '0%';

    try {
        const response = await fetch(`/api/backup/${containerId}`, {
            method: 'POST',
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to create backup');
        }

        // Start polling for progress if we have a progress_id
        if (data.progress_id) {
            const progressInterval = setInterval(async () => {
                try {
                    const progressResponse = await fetch(`/api/backup-progress/${data.progress_id}`);
                    if (!progressResponse.ok) {
                        clearInterval(progressInterval);
                        return;
                    }

                    let progress;
                    try {
                        progress = await progressResponse.json();
                    } catch (jsonError) {
                        console.error('Failed to parse progress JSON:', jsonError);
                        clearInterval(progressInterval);
                        return;
                    }

                    // Update UI
                    statusEl.innerHTML = progress.step || 'Processing...';
                    stepEl.innerHTML = progress.step || '';
                    progressBar.style.width = `${progress.progress}%`;
                    percentageEl.innerHTML = `${progress.progress}%`;

                    if (progress.status === 'complete') {
                        clearInterval(progressInterval);
                        setTimeout(() => {
                            backupModal.style.display = 'none';

                            // Show success message on button
                            button.innerHTML = '✅ Done!';
                            button.classList.remove('btn-warning');
                            button.classList.add('btn-success');

                            // Reload backups list
                            if (window.loadBackups) {
                                window.loadBackups();
                            }

                            // Reset button after 2 seconds
                            setTimeout(() => {
                                button.innerHTML = originalText;
                                button.classList.remove('btn-success');
                                button.classList.add('btn-warning');
                            }, 2000);
                        }, 500);
                    } else if (progress.status === 'error') {
                        clearInterval(progressInterval);
                        throw new Error(progress.error || 'Backup failed');
                    }
                } catch (error) {
                    clearInterval(progressInterval);
                    console.error('Progress polling error:', error);
                }
            }, 300); // Poll every 300ms

            // Timeout after 10 minutes
            setTimeout(() => {
                clearInterval(progressInterval);
            }, 600000);
        } else {
            // Fallback if no progress_id
            backupModal.style.display = 'none';
            button.innerHTML = '✅ Done!';
            button.classList.remove('btn-warning');
            button.classList.add('btn-success');
            if (window.loadBackups) {
                window.loadBackups();
            }
            setTimeout(() => {
                button.innerHTML = originalText;
                button.classList.remove('btn-success');
                button.classList.add('btn-warning');
            }, 2000);
        }
    }
    catch (error) {
        backupModal.style.display = 'none';
        button.innerHTML = originalText;
        console.error('Error creating backup: ' + error.message);
    } finally {
        window.AppState.isBackupInProgress = false;
        // Re-enable all buttons
        setTimeout(() => {
            // Re-enable container info click
            if (containerInfo) {
                containerInfo.style.pointerEvents = 'auto';
                containerInfo.style.opacity = '1';
                containerInfo.style.cursor = 'pointer';
            }

            // Re-enable card buttons
            if (cardActions) {
                const allButtons = cardActions.querySelectorAll('button');
                allButtons.forEach(btn => {
                    btn.disabled = false;
                    btn.classList.remove('disabled');
                });
            }

            // Re-enable other backup buttons
            const allBackupButtons = document.querySelectorAll('.btn-warning');
            allBackupButtons.forEach(btn => {
                if (btn.textContent.includes('Backup')) {
                    btn.disabled = false;
                    btn.classList.remove('disabled');
                }
            });
        }, 2000); // Sync with button reset
    }
}

// Backup All Containers
async function backupAllContainers() {
    // Final safeguard: ensure there are containers to back up, excluding the self container
    const nonSelfCheckboxes = document.querySelectorAll('.container-checkbox:not([disabled])');
    if (nonSelfCheckboxes.length === 0) {
        console.warn('No eligible containers to back up.');
        // Visually disable the button again, just in case
        const backupAllBtn = document.getElementById('backup-all-btn');
        if (backupAllBtn) {
            backupAllBtn.disabled = true;
            backupAllBtn.style.opacity = '0.5';
            backupAllBtn.style.cursor = 'not-allowed';
        }
        return;
    }

    // Select all containers and then use the same backup logic as backupSelectedContainers
    const checkboxes = document.querySelectorAll('.container-checkbox');
    if (checkboxes.length === 0) {
        console.warn('No containers found to backup.');
        return;
    }

    // Check all containers
    checkboxes.forEach(cb => {
        if (!cb.disabled) {
            cb.checked = true;
        }
    });
    if (window.handleCheckboxClick) {
        window.handleCheckboxClick();
    }

    // Now use the same backup logic as backupSelectedContainers
    await backupSelectedContainers();
}

function cancelBackupAll() {
    if (window.showConfirmationModal) {
        window.showConfirmationModal('Are you sure you want to cancel the backup operation? Current backup will finish, but remaining containers will not be backed up.', () => {
            window.AppState.backupAllCancelled = true;
            const cancelBtn = document.getElementById('backup-all-cancel-btn');
            if (cancelBtn) cancelBtn.style.display = 'none';
        });
    }
}

function closeBackupAllModal() {
    if (window.AppState.backupAllInProgress) {
        if (window.showConfirmationModal) {
            window.showConfirmationModal('Backup operation is still in progress. Are you sure you want to close? The operation will continue in the background.', () => {
                const modal = document.getElementById('backup-all-modal');
                if (modal) modal.style.display = 'none';
            });
        }
    } else {
        const modal = document.getElementById('backup-all-modal');
        if (modal) modal.style.display = 'none';
    }
}

async function backupSelectedContainers() {
    const selectedIds = window.getSelectedContainerIds ? window.getSelectedContainerIds() : [];
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    // Deduplicate IDs to prevent showing containers twice
    const uniqueIds = [...new Set(selectedIds)];

    // Check backup status first
    try {
        const statusResponse = await fetch('/api/backup/status');
        const statusData = await statusResponse.json();
        if (statusData.status === 'busy') {
            if (window.showNotification) {
                window.showNotification(`A backup for "${statusData.current_backup}" is already in progress. Please wait.`, 'warning');
            }
            return;
        }
    } catch (error) {
        console.error('Error checking backup status:', error);
    }

    if (window.AppState.backupAllInProgress) {
        if (window.showNotification) {
            window.showNotification('A backup operation is already in progress.', 'warning');
        }
        return;
    }

    if (window.AppState.isBackupInProgress) {
        if (window.showNotification) {
            window.showNotification('A single backup is already in progress. Please wait for it to finish.', 'warning');
        }
        return;
    }

    window.AppState.backupAllInProgress = true;
    window.AppState.backupAllCancelled = false;

    // Show modal
    const modal = document.getElementById('backup-all-modal');
    const statusEl = document.getElementById('backup-all-status');
    const listEl = document.getElementById('backup-all-list');
    const closeBtn = document.getElementById('backup-all-close-btn');
    const cancelBtn = document.getElementById('backup-all-cancel-btn');

    if (!modal || !statusEl || !listEl) {
        console.error('Backup all modal elements not found');
        window.AppState.backupAllInProgress = false;
        return;
    }

    modal.style.display = 'block';
    if (closeBtn) closeBtn.style.display = 'none';
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    // Prepare list of selected containers
    const selectedContainers = [];
    uniqueIds.forEach(id => {
        const checkbox = document.querySelector(`.container-checkbox[data-container-id="${id}"]`);
        const row = checkbox ? checkbox.closest('tr') : null;
        const nameElement = row ? row.querySelector('.container-name') : null;
        const name = nameElement ? nameElement.textContent : id.substring(0, 12);
        selectedContainers.push({ id, name });
    });

    const totalContainers = selectedContainers.length;
    let completed = 0;
    let failed = 0;

    statusEl.innerHTML = `<span>Backing up ${totalContainers} selected container(s)...</span>`;

    // Initialize list
    listEl.innerHTML = selectedContainers.map(container => {
        return `
            <div id="backup-item-${container.id}" style="padding: 10px; margin-bottom: 8px; background: var(--bg-card); border-radius: 4px; border-left: 4px solid var(--border); border: 1px solid var(--border);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <strong style="color: var(--text-primary);">${window.escapeHtml(container.name)}</strong>
                        <span style="color: var(--text-light); font-size: 0.9em; margin-left: 10px;">⏳ Waiting...</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    try {
        // Backup each container sequentially
        for (let i = 0; i < selectedContainers.length; i++) {
            if (window.AppState.backupAllCancelled) {
                statusEl.innerHTML = `<span style="color: var(--danger);">❌ Backup cancelled by user.</span>`;
                break;
            }

            const container = selectedContainers[i];
            const itemEl = document.getElementById(`backup-item-${container.id}`);

            if (!itemEl) continue;

            // Update status to "In Progress" with progress display
            itemEl.innerHTML = `
                <div style="flex: 1;">
                    <div style="margin-bottom: 8px;">
                        <strong style="color: var(--text-primary);">${window.escapeHtml(container.name)}</strong>
                        <span style="color: var(--secondary); font-size: 0.9em; margin-left: 10px;">⏳ Backing up...</span>
                    </div>
                    <div style="font-size: 0.85em; color: var(--text-secondary); margin-bottom: 6px;" id="backup-step-${container.id}">Starting...</div>
                    <div style="background: var(--bg-secondary); border-radius: 3px; height: 18px; overflow: hidden; border: 1px solid var(--border); margin-bottom: 4px;">
                        <div id="backup-bar-${container.id}" style="background: var(--accent); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                    </div>
                    <div style="font-size: 0.8em; color: var(--text-secondary);" id="backup-pct-${container.id}">0%</div>
                </div>
            `;
            itemEl.style.borderLeftColor = 'var(--secondary)';
            // Scroll the active backup into view
            itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

            // Update overall status *before* starting the backup for the current container
            statusEl.innerHTML = `<span>Processing container ${i + 1} of ${totalContainers}...</span>`;

            try {
                // Call backup API with queue parameter for backup-all operations
                const backupResponse = await fetch(`/api/backup/${container.id}?queue=true`, {
                    method: 'POST',
                });

                const backupData = await backupResponse.json();

                if (!backupResponse.ok) {
                    if (backupResponse.status === 409) {
                        // Backup is already in progress, queue it
                        // This shouldn't happen with queue=true, but handle it anyway
                        itemEl.innerHTML = `
                            <div style="flex: 1;">
                                <div style="margin-bottom: 8px;">
                                    <strong style="color: var(--text-primary);">${window.escapeHtml(container.name)}</strong>
                                    <span style="color: var(--warning); font-size: 0.9em; margin-left: 10px;">⏳ Queued (Another backup is in progress)</span>
                                </div>
                            </div>
                        `;
                        itemEl.style.borderLeftColor = 'var(--warning)';
                        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                        i--; // Retry this container
                        continue;
                    }
                    throw new Error(backupData.error || 'Failed to create backup');
                }

                // Handle queued backups (202 status)
                if (backupResponse.status === 202 || backupData.status === 'queued') {
                    // Backup was queued, update UI and start polling
                    itemEl.innerHTML = `
                        <div style="flex: 1;">
                            <div style="margin-bottom: 8px;">
                                <strong style="color: var(--text-primary);">${window.escapeHtml(container.name)}</strong>
                                <span style="color: var(--warning); font-size: 0.9em; margin-left: 10px;">⏳ Queued (Waiting for previous backup to complete)</span>
                            </div>
                            <div style="font-size: 0.85em; color: var(--text-secondary); margin-bottom: 6px;" id="backup-step-${container.id}">Waiting in queue...</div>
                            <div style="background: var(--bg-secondary); border-radius: 3px; height: 18px; overflow: hidden; border: 1px solid var(--border); margin-bottom: 4px;">
                                <div id="backup-bar-${container.id}" style="background: var(--accent); height: 100%; width: 0%; transition: width 0.3s ease;"></div>
                            </div>
                            <div style="font-size: 0.8em; color: var(--text-secondary);" id="backup-pct-${container.id}">0%</div>
                        </div>
                    `;
                    itemEl.style.borderLeftColor = 'var(--warning)';

                    // Get progress elements for queued backup
                    const stepEl = document.getElementById(`backup-step-${container.id}`);
                    const progressBar = document.getElementById(`backup-bar-${container.id}`);
                    const pctEl = document.getElementById(`backup-pct-${container.id}`);

                    // Start polling for progress
                    if (backupData.progress_id && stepEl && progressBar && pctEl) {
                        let backupCompleted = false;
                        const progressInterval = setInterval(async () => {
                            if (backupCompleted) return;

                            try {
                                const progressResponse = await fetch(`/api/backup-progress/${backupData.progress_id}`);
                                if (!progressResponse.ok) {
                                    // Don't mark as completed if progress endpoint fails - keep polling
                                    console.warn(`Progress endpoint returned ${progressResponse.status}, continuing to poll...`);
                                    return;
                                }

                                let progress;
                                try {
                                    progress = await progressResponse.json();
                                } catch (jsonError) {
                                    console.error('Failed to parse progress JSON:', jsonError);
                                    return; // Continue polling
                                }

                                // Only mark as completed if status is actually 'complete' or 'error'
                                if (progress.status !== 'complete' && progress.status !== 'error') {
                                    // Still processing - continue polling
                                    return;
                                }

                                // Update UI
                                stepEl.textContent = progress.step || 'Processing...';
                                progressBar.style.width = `${progress.progress}%`;
                                pctEl.textContent = `${progress.progress}%`;

                                // Update border color when backup starts
                                if (progress.status === 'running' || progress.status === 'starting' || progress.status === 'waiting') {
                                    if (progress.status === 'waiting') {
                                        // Still waiting for lock
                                        itemEl.style.borderLeftColor = 'var(--warning)';
                                        const statusSpan = itemEl.querySelector('span');
                                        if (statusSpan) {
                                            statusSpan.textContent = '⏳ Queued (Waiting for previous backup to complete)';
                                            statusSpan.style.color = 'var(--warning)';
                                        }
                                    } else {
                                        // Backup has started
                                        itemEl.style.borderLeftColor = 'var(--secondary)';
                                        const statusSpan = itemEl.querySelector('span');
                                        if (statusSpan) {
                                            statusSpan.textContent = '⏳ Backing up...';
                                            statusSpan.style.color = 'var(--secondary)';
                                        }
                                        // Scroll the active backup into view when it starts
                                        itemEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }
                                }

                                if (progress.status === 'complete') {
                                    clearInterval(progressInterval);
                                    backupCompleted = true;
                                    stepEl.textContent = 'Backup completed!';
                                    progressBar.style.width = `100%`;
                                    pctEl.textContent = `100%`;
                                    itemEl.style.borderLeftColor = 'var(--accent)';
                                    const statusSpan = itemEl.querySelector('span');
                                    if (statusSpan) {
                                        statusSpan.textContent = '✅ Completed';
                                        statusSpan.style.color = 'var(--accent)';
                                    }
                                } else if (progress.status === 'error') {
                                    clearInterval(progressInterval);
                                    backupCompleted = true;
                                    throw new Error(progress.error || 'Backup failed');
                                }
                            } catch (error) {
                                if (!backupCompleted) {
                                    clearInterval(progressInterval);
                                    backupCompleted = true;
                                    console.error('Progress polling error:', error);
                                    throw error;
                                }
                            }
                        }, 300);

                        // Wait for backup to complete
                        await new Promise((resolve, reject) => {
                            const checkComplete = setInterval(() => {
                                if (backupCompleted) {
                                    clearInterval(checkComplete);
                                    clearInterval(progressInterval);
                                    resolve();
                                }
                            }, 100);

                            setTimeout(() => {
                                clearInterval(checkComplete);
                                clearInterval(progressInterval);
                                if (!backupCompleted) {
                                    backupCompleted = true;
                                    reject(new Error('Backup timed out'));
                                }
                            }, 600000); // 10-minute timeout
                        });
                    } else {
                        // No progress_id or elements - wait a bit and mark as completed anyway
                        console.warn('No progress tracking available for queued backup');
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                    // Mark as completed only after backup actually completes
                    completed++;
                    continue; // Move to next container
                }

                // Get progress elements
                const stepEl = document.getElementById(`backup-step-${container.id}`);
                const progressBar = document.getElementById(`backup-bar-${container.id}`);
                const pctEl = document.getElementById(`backup-pct-${container.id}`);

                // Poll for progress if we have a progress_id
                if (backupData.progress_id && stepEl && progressBar && pctEl) {
                    let backupCompleted = false;
                    const progressInterval = setInterval(async () => {
                        if (backupCompleted) return;

                        try {
                            const progressResponse = await fetch(`/api/backup-progress/${backupData.progress_id}`);
                            if (!progressResponse.ok) {
                                clearInterval(progressInterval);
                                backupCompleted = true;
                                return;
                            }

                            let progress;
                            try {
                                progress = await progressResponse.json();
                            } catch (jsonError) {
                                console.error('Failed to parse progress JSON:', jsonError);
                                clearInterval(progressInterval);
                                backupCompleted = true;
                                return;
                            }

                            // Update UI immediately
                            stepEl.textContent = progress.step || 'Processing...';
                            progressBar.style.width = `${progress.progress}%`;
                            pctEl.textContent = `${progress.progress}%`;

                            if (progress.status === 'complete') {
                                clearInterval(progressInterval);
                                backupCompleted = true;
                                stepEl.textContent = 'Backup completed!';
                                progressBar.style.width = `100%`;
                                pctEl.textContent = `100%`;
                            } else if (progress.status === 'error') {
                                clearInterval(progressInterval);
                                backupCompleted = true;
                                // This will be caught by the outer try-catch block for this container
                                throw new Error(progress.error || 'Backup failed');
                            }
                        } catch (error) {
                            if (!backupCompleted) {
                                clearInterval(progressInterval);
                                backupCompleted = true;
                                console.error('Progress polling error:', error);
                                // Re-throw to be caught by the outer container-specific catch block
                                throw error;
                            }
                        }
                    }, 300);

                    await new Promise((resolve, reject) => {
                        const checkComplete = setInterval(() => {
                            if (backupCompleted) {
                                clearInterval(checkComplete);
                                // Check the final status from the DOM to decide if it was a success or failure
                                const finalStatusEl = itemEl.querySelector('span');
                                if (finalStatusEl && finalStatusEl.textContent.includes('Failed')) {
                                    reject(new Error(finalStatusEl.textContent));
                                } else {
                                    resolve();
                                }
                            }
                        }, 100);

                        setTimeout(() => {
                            clearInterval(checkComplete);
                            clearInterval(progressInterval);
                            if (!backupCompleted) {
                                backupCompleted = true;
                                reject(new Error('Backup timed out'));
                            }
                        }, 600000); // 10-minute timeout
                    });
                } else {
                    // Fallback if no progress_id or elements not found
                    itemEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${window.escapeHtml(container.name)}</strong>
                                <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Completed</span>
                            </div>
                        </div>
                    `;
                    itemEl.style.borderLeftColor = 'var(--accent)';
                }
                // This part now runs only after the backup for the container is confirmed complete
                completed++;
                itemEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${window.escapeHtml(container.name)}</strong>
                            <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Completed</span>
                        </div>
                    </div>
                `;
                itemEl.style.borderLeftColor = 'var(--accent)';
            } catch (error) {
                // Failed - increment failed count
                failed++;
                itemEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${window.escapeHtml(container.name)}</strong>
                            <span style="color: var(--danger); font-size: 0.9em; margin-left: 10px;">❌ Failed: ${window.escapeHtml(error.message)}</span>
                        </div>
                    </div>
                `;
                itemEl.style.borderLeftColor = 'var(--danger)';
            }

        }

        // Final status
        if (!window.AppState.backupAllCancelled) {
            if (failed === 0) {
                statusEl.innerHTML = `<span style="color: var(--accent);">✅ All selected backups completed successfully!</span>`;
            } else {
                statusEl.innerHTML = `<span style="color: var(--warning);">⚠️ Backup process completed with ${failed} error(s).</span>`;
            }

            // Reload backups list
            if (window.loadBackups) {
                window.loadBackups();
            }
        }

        // Deselect items after backup
        if (window.resetSelection) {
            window.resetSelection();
        }

        if (closeBtn) closeBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'none';

    } catch (error) {
        statusEl.innerHTML = `<span style="color: var(--danger);">❌ Error: ${window.escapeHtml(error.message)}</span>`;
        if (closeBtn) closeBtn.style.display = 'inline-block';
        if (cancelBtn) cancelBtn.style.display = 'none';
    } finally {
        window.AppState.backupAllInProgress = false;
    }
}

// Delete container functions
async function deleteSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    // Store selected container IDs globally for bulk remove
    window.selectedContainerIdsForDelete = selectedIds;

    // Get first container name for display (or show count)
    const firstContainerId = selectedIds[0];
    const containerRow = document.querySelector(`.container-checkbox[data-container-id="${firstContainerId}"]`)?.closest('tr');
    let containerName = 'Container';
    if (containerRow) {
        const nameElement = containerRow.querySelector('.container-name');
        if (nameElement) {
            containerName = nameElement.textContent.trim().replace(/\s*\(self\)$/, '');
        }
    }

    // Show remove modal with checkboxes (applies to all selected containers)
    if (selectedIds.length === 1) {
        showDeleteOptions(firstContainerId, containerName);
    } else {
        // For multiple containers, show modal with count
        showDeleteOptions(firstContainerId, `${selectedIds.length} containers`);
    }
}

async function showDeleteOptions(containerId, containerName) {
    window.AppState.currentContainerId = containerId;

    // Check if we're deleting multiple containers
    const selectedIds = window.selectedContainerIdsForDelete || [containerId];
    const isMultiple = selectedIds.length > 1;

    const modal = document.getElementById('delete-container-modal');
    const modalContent = document.getElementById('delete-container-content');

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    // Show loading state
    modalContent.innerHTML = `
        <h3 style="color: #f1f5f9;">${isMultiple ? `Remove ${selectedIds.length} Containers` : `Remove Container: ${escapeHtml(containerName)}`}</h3>
        <div style="text-align: center; padding: 40px;">
            <div class="spinner"></div>
            <p style="margin-top: 15px; color: var(--text-secondary);">Loading container details...</p>
        </div>
    `;
    modal.style.display = 'block';

    // Fetch details for all selected containers
    const allVolumes = new Set();
    const allImages = new Set();
    const containerNames = [];

    try {
        for (const id of selectedIds) {
            try {
                const detailsResponse = await fetch(`/api/container/${id}/details`);
                if (detailsResponse.ok) {
                    const details = await detailsResponse.json();
                    containerNames.push(details.name || 'Unknown');

                    // Collect volumes
                    const mounts = details.mounts || [];
                    mounts.filter(m => m.Type === 'volume').forEach(m => {
                        if (m.Name) {
                            allVolumes.add(m.Name);
                        }
                    });

                    // Collect images
                    const imageInfo = details.image || 'unknown';
                    if (imageInfo && imageInfo !== 'unknown') {
                        allImages.add(imageInfo);
                    }
                }
            } catch (err) {
                console.error(`Failed to get details for container ${id}:`, err);
            }
        }
    } catch (err) {
        console.error('Error fetching container details:', err);
    }

    const hasVolumes = allVolumes.size > 0;
    const hasImage = allImages.size > 0;
    const volumesList = Array.from(allVolumes).sort();
    const imagesList = Array.from(allImages).sort();

    // Build info about what will be removed
    let infoHtml = '';
    if (selectedIds.length > 0) {
        infoHtml = '<div style="margin: 15px 0; padding: 15px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px; color: var(--text-secondary);">';
        if (isMultiple) {
            infoHtml += `<p style="color: var(--text-secondary); margin-bottom: 8px;"><strong style="color: var(--text-primary);">Containers:</strong> ${selectedIds.length} selected</p>`;
            infoHtml += `<p style="color: var(--text-secondary); margin-bottom: 8px; font-size: 0.9em;">Options below will apply to all selected containers.</p>`;
        } else {
            infoHtml += `<p style="color: var(--text-secondary); margin-bottom: 8px;"><strong style="color: var(--text-primary);">Container:</strong> ${escapeHtml(containerName)}</p>`;
        }
        infoHtml += '</div>';
    }

    const titleText = isMultiple
        ? `Remove ${selectedIds.length} Containers`
        : `Remove Container: ${escapeHtml(containerName)}`;
    const buttonText = isMultiple
        ? `Remove ${selectedIds.length} Containers`
        : `Remove Container`;

    // Build volumes checkboxes
    let volumesHtml = '';
    if (hasVolumes) {
        volumesHtml = `
            <div style="margin-bottom: 15px;">
                <p style="color: var(--text-primary); margin-bottom: 10px; font-weight: 600;">Select volumes to remove:</p>
                <div style="max-height: 200px; overflow-y: auto; padding: 10px; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border);">
                    ${volumesList.map((volume, index) => `
                        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: pointer;">
                            <input type="checkbox" class="volume-checkbox-item" data-volume="${escapeHtml(volume)}" checked style="width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;">
                            <span style="color: var(--text-primary); font-family: monospace; font-size: 0.9em;">${escapeHtml(volume)}</span>
                        </label>
                    `).join('')}
                </div>
                <p style="color: var(--warning); font-size: 0.85em; margin-top: 8px; margin-bottom: 0;">⚠️ Selected volumes will be permanently removed!</p>
            </div>
        `;
    } else {
        volumesHtml = '<p style="color: var(--text-secondary); margin-bottom: 15px;">No volumes to remove</p>';
    }

    // Build images checkboxes
    let imagesHtml = '';
    if (hasImage) {
        imagesHtml = `
            <div>
                <p style="color: var(--text-primary); margin-bottom: 10px; font-weight: 600;">Select images to remove:</p>
                <div style="max-height: 200px; overflow-y: auto; padding: 10px; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border);">
                    ${imagesList.map((image, index) => `
                        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: pointer;">
                            <input type="checkbox" class="image-checkbox-item" data-image="${escapeHtml(image)}" checked style="width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;">
                            <span style="color: var(--text-primary); font-family: monospace; font-size: 0.9em;">${escapeHtml(image)}</span>
                        </label>
                    `).join('')}
                </div>
                <p style="color: var(--warning); font-size: 0.85em; margin-top: 8px; margin-bottom: 0;">⚠️ Selected images will be permanently removed!</p>
            </div>
        `;
    } else {
        imagesHtml = '<p style="color: var(--text-secondary);">No images to remove</p>';
    }

    modalContent.innerHTML = `
        <h3 style="color: #f1f5f9;">${titleText}</h3>
        ${infoHtml}
        <div style="margin: 20px 0; padding: 15px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px;">
            <p style="color: var(--text-primary); margin-bottom: 15px; font-weight: 600;">Additional options ${isMultiple ? '(select which volumes/images to remove)' : ''}:</p>
            ${volumesHtml}
            ${imagesHtml}
        </div>
        <div style="margin-top: 20px; display: flex; gap: 10px;">
            <button class="btn btn-danger btn-full" onclick="deleteContainerWithOptions('${containerId}', '${escapeHtml(containerName)}')">
                ${buttonText}
            </button>
            <button class="btn btn-secondary btn-full" onclick="closeDeleteContainerModal()">Cancel</button>
        </div>
    `;
}

function closeDeleteContainerModal() {
    const modal = document.getElementById('delete-container-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

async function deleteContainerWithOptions(containerId, containerName) {
    // Get selected volumes and images from individual checkboxes
    const selectedVolumes = new Set();
    const selectedImages = new Set();

    document.querySelectorAll('.volume-checkbox-item:checked').forEach(cb => {
        selectedVolumes.add(cb.getAttribute('data-volume'));
    });

    document.querySelectorAll('.image-checkbox-item:checked').forEach(cb => {
        selectedImages.add(cb.getAttribute('data-image'));
    });

    // Check if we're deleting multiple containers
    const selectedIds = window.selectedContainerIdsForDelete || [containerId];
    const isMultiple = selectedIds.length > 1;

    // Build confirmation message
    let confirmMessage = isMultiple
        ? `Remove ${selectedIds.length} selected containers?`
        : `Remove container "${containerName}"?`;
    const warnings = [];

    if (selectedVolumes.size > 0) {
        warnings.push(`- ${selectedVolumes.size} volume(s): ${Array.from(selectedVolumes).join(', ')}`);
    }
    if (selectedImages.size > 0) {
        warnings.push(`- ${selectedImages.size} image(s): ${Array.from(selectedImages).join(', ')}`);
    }

    if (warnings.length > 0) {
        confirmMessage += `\n\n⚠️  WARNING: This will also permanently remove:\n${warnings.join('\n')}`;
    } else {
        confirmMessage += `\n\nThis will stop and remove the container(s) only. Volumes and images will be kept.`;
    }

    confirmMessage += `\n\nThis action cannot be undone!`;

    if (window.showConfirmationModal) {
        window.showConfirmationModal(confirmMessage, async () => {
            try {
                let totalDeletedVolumes = [];
                let totalDeletedImages = new Set();

                // First, remove all selected containers (without volumes/images)
                for (const id of selectedIds) {
                    try {
                        const response = await fetch(`/api/container/${id}/delete`, {
                            method: 'DELETE',
                        });
                        const data = await response.json();

                        if (!response.ok) {
                            throw new Error(data.error || `Failed to remove container ${id}`);
                        }
                    } catch (error) {
                        console.error(`Error removing container ${id}: ${error.message}`);
                        if (window.showNotification) {
                            window.showNotification(`Error removing container: ${error.message}`, 'error');
                        }
                    }
                }

                // Then remove selected volumes individually
                if (selectedVolumes.size > 0) {
                    try {
                        const volumesToDelete = Array.from(selectedVolumes);
                        const response = await fetch('/api/volumes/delete', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({ names: volumesToDelete })
                        });
                        const data = await response.json();

                        if (response.ok && data.deleted_count > 0) {
                            totalDeletedVolumes.push(...volumesToDelete.slice(0, data.deleted_count));
                        }
                    } catch (err) {
                        console.error('Error removing volumes:', err);
                    }
                }

                // Finally, remove selected images individually
                if (selectedImages.size > 0) {
                    try {
                        // Get all images to find IDs
                        const imageResponse = await fetch(`/api/images`);
                        if (imageResponse.ok) {
                            const imagesData = await imageResponse.json();

                            for (const imageName of selectedImages) {
                                try {
                                    // Try to find image by name (e.g., "nginx:latest")
                                    let imageToDelete = imagesData.images.find(img => img.name === imageName);

                                    // If not found by exact name, try by repository:tag
                                    if (!imageToDelete && imageName.includes(':')) {
                                        const [repo, tag] = imageName.split(':');
                                        imageToDelete = imagesData.images.find(img =>
                                            img.repository === repo && img.tag === tag
                                        );
                                    }

                                    // If still not found, try by repository only (for <none> tags)
                                    if (!imageToDelete) {
                                        imageToDelete = imagesData.images.find(img =>
                                            img.repository === imageName
                                        );
                                    }

                                    if (imageToDelete && !totalDeletedImages.has(imageToDelete.id)) {
                                        const deleteImageResponse = await fetch(`/api/image/${imageToDelete.id}/delete`, {
                                            method: 'DELETE',
                                        });
                                        if (deleteImageResponse.ok) {
                                            totalDeletedImages.add(imageToDelete.id);
                                        }
                                    }
                                } catch (err) {
                                    console.log(`Image removal failed for ${imageName} (non-critical):`, err);
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Error removing images:', err);
                    }
                }

                closeDeleteContainerModal();
                window.selectedContainerIdsForDelete = null; // Clear stored IDs

                let successMessage = isMultiple
                    ? `${selectedIds.length} containers removed`
                    : 'Container removed';
                if (totalDeletedVolumes.length > 0) {
                    successMessage += ` | Removed ${totalDeletedVolumes.length} volume(s): ${totalDeletedVolumes.join(', ')}`;
                }
                if (totalDeletedImages.size > 0) {
                    successMessage += ` | Removed ${totalDeletedImages.size} image(s)`;
                }

                if (window.showNotification) {
                    window.showNotification(successMessage, 'success');
                }
                if (window.loadContainers) {
                    window.loadContainers();
                }
                // Also refresh networks, volumes, and images since deleting containers affects them
                if (window.loadNetworks) {
                    window.loadNetworks();
                }
                if (window.loadVolumes) {
                    window.loadVolumes();
                }
                if (window.loadImages) {
                    window.loadImages();
                }
                if (window.resetSelection) {
                    window.resetSelection();
                }
            } catch (error) {
                console.error(`Error deleting containers: ${error.message}`);
                if (window.showNotification) {
                    window.showNotification(`Error deleting containers: ${error.message}`, 'error');
                }
            }
        });
    }
}

// Export functions to window for HTML access
window.loadContainers = loadContainers;
window.createContainerCard = createContainerCard;
window.renderContainers = renderContainers;
window.sortContainers = sortContainers;
window.toggleContainerSelection = toggleContainerSelection;
window.toggleSelectAll = toggleSelectAll;
window.updateButtonStates = updateButtonStates;
window.resetSelection = resetSelection;
window.handleCheckboxClick = handleCheckboxClick;
window.showContainerDetails = showContainerDetails;
window.showContainerInspect = showContainerInspect;
window.highlightJson = highlightJson;
window.copyInspectJson = copyInspectJson;
window.closeInspectModal = closeInspectModal;
window.formatContainerDetails = formatContainerDetails;
window.startContainer = startContainer;
window.restartContainer = restartContainer;
window.stopContainer = stopContainer;
window.killContainer = killContainer;
window.pauseContainer = pauseContainer;
window.resumeContainer = resumeContainer;
window.getSelectedContainerIds = getSelectedContainerIds;
window.startSelectedContainers = startSelectedContainers;
window.restartSelectedContainers = restartSelectedContainers;
window.stopSelectedContainers = stopSelectedContainers;
window.killSelectedContainers = killSelectedContainers;
window.pauseSelectedContainers = pauseSelectedContainers;
window.resumeSelectedContainers = resumeSelectedContainers;
window.viewStackContainers = viewStackContainers;
window.clearStackFilter = clearStackFilter;
window.viewContainerByName = viewContainerByName;
window.viewNetworkContainers = viewNetworkContainers;
window.backupContainer = backupContainer;
window.backupContainerDirect = backupContainerDirect;
window.backupAllContainers = backupAllContainers;
window.cancelBackupAll = cancelBackupAll;
window.closeBackupAllModal = closeBackupAllModal;
window.backupSelectedContainers = backupSelectedContainers;
window.deleteSelectedContainers = deleteSelectedContainers;
window.showDeleteOptions = showDeleteOptions;
window.closeDeleteContainerModal = closeDeleteContainerModal;
window.deleteContainerWithOptions = deleteContainerWithOptions;

