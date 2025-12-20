// Statistics Module
// Handles container statistics and system stats polling

// Load statistics
async function loadStatistics() {
    const errorEl = document.getElementById('statistics-error');
    const statisticsList = document.getElementById('statistics-list');
    const statisticsSpinner = document.getElementById('statistics-spinner');
    const statisticsWrapper = document.getElementById('statistics-table-wrapper');

    // Cancel any pending requests and polling
    if (window.AppState.statisticsAbortController) {
        window.AppState.statisticsAbortController.abort();
    }
    if (window.AppState.statisticsPollInterval) {
        clearInterval(window.AppState.statisticsPollInterval);
        window.AppState.statisticsPollInterval = null;
    }
    if (window.AppState.statisticsRefreshTimeInterval) {
        clearInterval(window.AppState.statisticsRefreshTimeInterval);
        window.AppState.statisticsRefreshTimeInterval = null;
    }
    
    // Create new abort controller and store reference
    const abortController = new AbortController();
    window.AppState.statisticsAbortController = abortController;

    // Clear error message and hide error element
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }
    if (statisticsList) statisticsList.innerHTML = '';

    // Show spinner initially
    if (statisticsSpinner) statisticsSpinner.style.display = 'flex';
    if (statisticsWrapper) {
        statisticsWrapper.style.overflow = 'hidden';
        statisticsWrapper.classList.add('loading-grid');
    }

    try {
        // Load cached stats immediately (fast)
        const cachedResponse = await fetch('/api/statistics', {
            signal: abortController.signal
        });
        
        if (cachedResponse.ok) {
            const cachedData = await cachedResponse.json();
            
            // Check for error in response
            if (cachedData.error) {
                if (errorEl) {
                    errorEl.textContent = `Error: ${cachedData.error}`;
                    errorEl.style.display = 'block';
                }
                if (statisticsSpinner) statisticsSpinner.style.display = 'none';
                if (statisticsWrapper) {
                    statisticsWrapper.style.overflow = '';
                    statisticsWrapper.classList.remove('loading-grid');
                }
                return;
            }
            
            // Always display data (even if empty - updateStatisticsGrid handles empty case)
            if (cachedData.containers !== undefined) {
                updateStatisticsGrid(cachedData.containers);
                window.AppState.lastStatisticsCacheTimestamp = cachedData.cache_timestamp;
                
                // Start periodic refresh time updates
                startRefreshTimeUpdates();
                
                // Hide spinner after cached data is displayed
                if (statisticsSpinner) statisticsSpinner.style.display = 'none';
                if (statisticsWrapper) {
                    statisticsWrapper.style.overflow = '';
                    statisticsWrapper.classList.remove('loading-grid');
                }
            } else {
                // No containers field - show error
                if (errorEl) {
                    errorEl.textContent = 'Error: Invalid response format';
                    errorEl.style.display = 'block';
                }
                if (statisticsSpinner) statisticsSpinner.style.display = 'none';
                if (statisticsWrapper) {
                    statisticsWrapper.style.overflow = '';
                    statisticsWrapper.classList.remove('loading-grid');
                }
            }
        } else {
            // Response not OK - try to get error message
            try {
                const errorData = await cachedResponse.json();
                if (errorEl) {
                    errorEl.textContent = `Error: ${errorData.error || `Failed to load statistics (${cachedResponse.status})`}`;
                    errorEl.style.display = 'block';
                }
            } catch (e) {
                if (errorEl) {
                    errorEl.textContent = `Error: Failed to load statistics (${cachedResponse.status})`;
                    errorEl.style.display = 'block';
                }
            }
            if (statisticsSpinner) statisticsSpinner.style.display = 'none';
            if (statisticsWrapper) {
                statisticsWrapper.style.overflow = '';
                statisticsWrapper.classList.remove('loading-grid');
            }
            return;
        }

    } catch (error) {
        // Ignore errors if this request was cancelled (new request started)
        if (window.AppState.statisticsAbortController !== abortController) {
            return;
        }
        
        // Handle errors
        if (error.name === 'AbortError') {
            // Request was cancelled, ignore
            return;
        } else {
            const errorMessage = error.message || error.toString() || 'Unknown error occurred';
            if (errorEl) {
                errorEl.textContent = `Error: ${errorMessage}`;
                errorEl.style.display = 'block';
            }
        }
        
        // Hide spinner on error
        if (statisticsSpinner) statisticsSpinner.style.display = 'none';
        if (statisticsWrapper) {
            statisticsWrapper.style.overflow = '';
            statisticsWrapper.classList.remove('loading-grid');
        }
    }
}

// Manual refresh function triggered by refresh button
async function refreshStatistics() {
    const refreshBtn = document.getElementById('statistics-refresh-btn');
    const errorEl = document.getElementById('statistics-error');
    if (!refreshBtn || refreshBtn.disabled) {
        return;
    }
    
    // Clear any previous errors
    if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.textContent = '';
    }
    
    // Disable button and show loading state
    refreshBtn.disabled = true;
    const originalHtml = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<i class="ph ph-arrows-clockwise" style="animation: spin 1s linear infinite;"></i> Refreshing...';
    
    try {
        // Trigger background refresh
        const response = await fetch('/api/statistics/refresh', {
            method: 'POST'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to trigger refresh (${response.status})`);
        }
        
        // Start polling for updated stats
        let pollCount = 0;
        const maxPolls = 60; // Poll for up to 2 minutes
        
        const pollInterval = setInterval(async () => {
            pollCount++;
            
            // Stop polling if max attempts reached
            if (pollCount > maxPolls) {
                clearInterval(pollInterval);
                // Enable button even if refresh didn't complete
                if (refreshBtn) {
                    refreshBtn.disabled = false;
                    refreshBtn.innerHTML = originalHtml;
                }
                if (errorEl) {
                    errorEl.textContent = 'Refresh timed out. Stats may still be updating in the background.';
                    errorEl.style.display = 'block';
                }
                return;
            }
            
            try {
                const statsResponse = await fetch('/api/statistics');
                
                if (statsResponse.ok) {
                    const data = await statsResponse.json();
                    
                    // Skip if there's an error in the response
                    if (data.error) {
                        return; // Continue polling
                    }
                    
                    // Check if we have new data (different timestamp)
                    if (data.cache_timestamp && data.cache_timestamp !== window.AppState.lastStatisticsCacheTimestamp) {
                        // Update grid with fresh data
                        if (data.containers !== undefined) {
                            updateStatisticsGrid(data.containers, true);
                            window.AppState.lastStatisticsCacheTimestamp = data.cache_timestamp;
                            
                            // Stop polling and enable button
                            clearInterval(pollInterval);
                            if (refreshBtn) {
                                refreshBtn.disabled = false;
                                refreshBtn.innerHTML = originalHtml;
                            }
                        }
                    }
                } else if (statsResponse.status === 429) {
                    // Rate limited - wait a bit longer before next poll
                    // Continue polling but with longer delay
                }
            } catch (e) {
                // Ignore polling errors, continue polling
                if (e.name !== 'AbortError') {
                    // Log but continue
                    console.warn('Polling error:', e);
                }
            }
        }, 2000); // Poll every 2 seconds
        
    } catch (error) {
        // Re-enable button on error and show error message
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = originalHtml;
        }
        if (errorEl) {
            errorEl.textContent = `Error: ${error.message || error.toString() || 'Failed to refresh statistics'}`;
            errorEl.style.display = 'block';
        }
        console.error('Error refreshing statistics:', error);
    }
}

// Update statistics grid with container data (supports incremental updates)
function updateStatisticsGrid(containers, preserveRefreshTimes = false) {
    const statisticsList = document.getElementById('statistics-list');
    if (!statisticsList) return;
    
    if (!containers || containers.length === 0) {
        statisticsList.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #666;">No containers found</td></tr>';
        return;
    }
    
    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });
    
    if (preserveRefreshTimes) {
        // Incremental update: update refresh times for containers that have new data,
        // add new containers, and remove deleted containers
        const existingRows = statisticsList.querySelectorAll('tr.statistics-row');
        const containerIdToRow = {};
        const containerIdsInData = new Set();
        
        // Build map of existing rows by container ID
        existingRows.forEach(row => {
            const containerId = row.getAttribute('data-container-id');
            if (containerId) {
                containerIdToRow[containerId] = row;
            }
        });
        
        // Track which containers are in the new data and update/add them
        containers.forEach(container => {
            const containerId = container.id;
            containerIdsInData.add(containerId);
            const existingRow = containerIdToRow[containerId];
            
            if (existingRow) {
                // Update existing row refresh time
                if (container.refresh_timestamp) {
                    const refreshCell = existingRow.querySelector('td:last-child');
                    if (refreshCell) {
                        refreshCell.dataset.refreshTimestamp = container.refresh_timestamp;
                        refreshCell.textContent = formatRefreshTime(container.refresh_timestamp);
                    }
                }
            } else {
                // Add new container row
                const row = createStatisticsRow(container);
                statisticsList.appendChild(row);
            }
        });
        
        // Remove containers that are no longer in the data
        existingRows.forEach(row => {
            const containerId = row.getAttribute('data-container-id');
            if (containerId && !containerIdsInData.has(containerId)) {
                row.remove();
            }
        });
    } else {
        // Full refresh: clear and rebuild
        statisticsList.innerHTML = '';
        
        // Use DocumentFragment for efficient batch DOM operations
        const fragment = document.createDocumentFragment();
        containers.forEach(container => {
            const row = createStatisticsRow(container);
            fragment.appendChild(row);
        });
        // Single DOM operation - much faster than appending one by one
        statisticsList.appendChild(fragment);
    }
}

// Format refresh timestamp as countdown from 5 minutes
function formatRefreshTime(timestamp) {
    if (!timestamp) return '-';
    
    try {
        const refreshDate = new Date(timestamp);
        const now = new Date();
        const refreshIntervalMs = 5 * 60 * 1000; // 5 minutes in milliseconds
        const nextRefreshTime = refreshDate.getTime() + refreshIntervalMs;
        const remainingMs = nextRefreshTime - now.getTime();
        
        if (remainingMs <= 0) {
            return '0:00';
        }
        
        const remainingSeconds = Math.floor(remainingMs / 1000);
        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    } catch (e) {
        return '-';
    }
}

// Start periodic updates of refresh time displays
function startRefreshTimeUpdates() {
    // Clear any existing interval
    if (window.AppState.statisticsRefreshTimeInterval) {
        clearInterval(window.AppState.statisticsRefreshTimeInterval);
    }
    
    // Track last known cache timestamp for detecting updates
    let lastKnownTimestamp = window.AppState.lastStatisticsCacheTimestamp;
    
    // Update refresh times every second
    window.AppState.statisticsRefreshTimeInterval = setInterval(async () => {
        const statisticsList = document.getElementById('statistics-list');
        if (!statisticsList) {
            clearInterval(window.AppState.statisticsRefreshTimeInterval);
            window.AppState.statisticsRefreshTimeInterval = null;
            return;
        }
        
        const rows = statisticsList.querySelectorAll('tr.statistics-row');
        let countdownReachedZero = false;
        
        rows.forEach(row => {
            const refreshCell = row.querySelector('td:last-child');
            if (refreshCell && refreshCell.dataset.refreshTimestamp) {
                const countdown = formatRefreshTime(refreshCell.dataset.refreshTimestamp);
                refreshCell.textContent = countdown;
                
                // Check if countdown has reached zero
                if (countdown === '0:00') {
                    countdownReachedZero = true;
                }
            }
        });
        
        // If countdown reached zero, poll for updated stats
        if (countdownReachedZero) {
            try {
                const response = await fetch('/api/statistics');
                if (response.ok) {
                    const data = await response.json();
                    
                    // Skip if there's an error in the response
                    if (data.error) {
                        return; // Continue, will retry on next interval
                    }
                    
                    // Check if we have new data (different timestamp)
                    if (data.cache_timestamp && data.cache_timestamp !== lastKnownTimestamp) {
                        if (data.containers !== undefined) {
                            // Update grid with fresh data
                            updateStatisticsGrid(data.containers, true);
                            window.AppState.lastStatisticsCacheTimestamp = data.cache_timestamp;
                            lastKnownTimestamp = data.cache_timestamp;
                        }
                    }
                } else if (response.status === 429) {
                    // Rate limited - skip this check, will retry on next interval
                }
            } catch (e) {
                // Ignore polling errors, will retry on next interval
            }
        }
    }, 1000); // Update every second
}

// Create statistics row
function createStatisticsRow(container) {
    const tr = document.createElement('tr');
    tr.className = 'statistics-row';
    tr.setAttribute('data-container-id', container.id);

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    const statusLower = (container.status || '').toLowerCase();
    const statusTextLower = (container.status_text || '').toLowerCase();
    const isPaused = statusLower === 'paused' || statusTextLower.includes('paused');
    const statusClass = isPaused ? 'status-paused' :
        statusLower === 'running' ? 'status-running' : 'status-stopped';
    const statusText = isPaused ? 'Paused' :
        statusLower === 'running' ? 'Running' : 'Stopped';

    // Format RAM display
    // Show RAM for both running and paused containers (paused containers still use RAM)
    let ramDisplay = '-';
    if ((container.status === 'running' || container.status === 'paused') && container.memory_used_mb > 0) {
        const usedMB = container.memory_used_mb.toFixed(1);
        const totalMB = container.memory_total_mb > 0 ? container.memory_total_mb.toFixed(1) : '';
        const percent = container.memory_percent > 0 ? container.memory_percent.toFixed(1) : '';
        if (totalMB) {
            ramDisplay = `${usedMB} MB / ${totalMB} MB`;
            if (percent) {
                ramDisplay += ` (${percent}%)`;
            }
        } else {
            ramDisplay = `${usedMB} MB`;
        }
    }

    // Format CPU display
    // Only show CPU for running containers (paused containers have 0% CPU)
    let cpuDisplay = '-';
    if (container.status === 'running' && container.cpu_percent > 0) {
        cpuDisplay = `${container.cpu_percent.toFixed(2)}%`;
    }

    // Format Network I/O display
    const networkIO = container.network_io && container.network_io !== '-' ? escapeHtml(container.network_io) : '-';

    // Format Block I/O display
    const blockIO = container.block_io && container.block_io !== '-' ? escapeHtml(container.block_io) : '-';

    // Format refresh timestamp
    const refreshTime = formatRefreshTime(container.refresh_timestamp);

    tr.innerHTML = `
        <td>
            <div style="font-weight: 500; color: #fff;">${escapeHtml(container.name)}</div>
            <div style="font-size: 0.9em; color: var(--text-secondary);">ID: ${container.id}</div>
        </td>
        <td style="color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(container.image)}</td>
        <td>
            <div class="container-status ${statusClass}">${statusText}</div>
        </td>
        <td style="color: var(--text-secondary); font-size: 0.9em;">${cpuDisplay}</td>
        <td style="color: var(--text-secondary); font-size: 0.9em;">${ramDisplay}</td>
        <td style="color: var(--text-secondary); font-size: 0.9em;">${networkIO}</td>
        <td style="color: var(--text-secondary); font-size: 0.9em;">${blockIO}</td>
        <td style="color: var(--text-secondary); font-size: 0.9em;" data-refresh-timestamp="${container.refresh_timestamp || ''}">${refreshTime}</td>
    `;

    return tr;
}

// System stats polling (top bar)
function startStatsPolling() {
    // Clear any existing interval
    if (window.AppState.systemStatsInterval) {
        clearInterval(window.AppState.systemStatsInterval);
        window.AppState.systemStatsInterval = null;
    }

    // Update system stats immediately (always needed for top bar)
    updateSystemStats();

    // System stats (top bar) - update every 5 seconds
    // Apply cached stats immediately if available
    if (window.AppState.systemStatsCache) {
        applyCachedSystemStats();
    }

    window.AppState.systemStatsInterval = setInterval(() => {
        updateSystemStats();
    }, 5000);
}

async function updateSystemStats() {
    try {
        // Add timeout to fetch request (10 seconds)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('/api/system-stats', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        const data = await response.json();

        // If we get a 401, stop polling (session expired)
        if (response.status === 401) {
            console.warn('Authentication expired, stopping stats polling');
            if (window.AppState.systemStatsInterval) {
                clearInterval(window.AppState.systemStatsInterval);
                window.AppState.systemStatsInterval = null;
            }
            return;
        }

        if (!response.ok || data.error) {
            window.AppState.consecutiveSystemStatsErrors++;
            console.error('System stats API error:', response.status, data.error || response.statusText);

            // If we have cached stats, use them
            if (window.AppState.systemStatsCache && window.AppState.consecutiveSystemStatsErrors < 5) {
                applyCachedSystemStats();
            }

            // If too many consecutive errors, restart polling after a delay
            if (window.AppState.consecutiveSystemStatsErrors >= 10) {
                console.warn('Too many system stats errors, restarting polling...');
                window.AppState.consecutiveSystemStatsErrors = 0;
                if (window.AppState.systemStatsInterval) {
                    clearInterval(window.AppState.systemStatsInterval);
                    window.AppState.systemStatsInterval = null;
                }
                setTimeout(() => {
                    startStatsPolling();
                }, 5000);
            }
            return;
        }

        // Reset error counter on success
        window.AppState.consecutiveSystemStatsErrors = 0;

        // Update cache
        window.AppState.systemStatsCache = {
            cpu_percent: data.cpu_percent || 0,
            cpu_count: data.cpu_count || 0,
            memory_used_mb: data.memory_used_mb || 0,
            memory_total_mb: data.memory_total_mb || 0,
            memory_percent: data.memory_percent || 0,
            docker_version: data.docker_version || 'N/A',
            timestamp: Date.now()
        };

        const cpuEl = document.getElementById('system-cpu');
        const cpuCountEl = document.getElementById('system-cpu-count');
        const ramEl = document.getElementById('system-ram');
        const dockerVersionEl = document.getElementById('system-docker-version');

        if (cpuEl) {
            cpuEl.textContent = `${data.cpu_percent || 0}%`;
        }

        if (cpuCountEl) {
            cpuCountEl.textContent = data.cpu_count || 0;
        }

        if (ramEl) {
            const memUsed = data.memory_used_mb || 0;
            const memTotal = data.memory_total_mb || 0;
            const memPercent = data.memory_percent || 0;
            ramEl.textContent = `${Math.round(memUsed)} MB / ${Math.round(memTotal)} MB (${memPercent.toFixed(1)}%)`;
        }

        if (dockerVersionEl) {
            dockerVersionEl.textContent = data.docker_version || 'N/A';
        }

    } catch (error) {
        window.AppState.consecutiveSystemStatsErrors++;
        console.error('Failed to update system stats:', error);

        // If fetch was aborted (timeout), use cached stats
        if (error.name === 'AbortError') {
            console.warn('System stats request timed out, using cached values');
            if (window.AppState.systemStatsCache) {
                applyCachedSystemStats();
            }
        }

        // If too many consecutive errors, restart polling
        if (window.AppState.consecutiveSystemStatsErrors >= 10) {
            console.warn('Too many system stats errors, restarting polling...');
            window.AppState.consecutiveSystemStatsErrors = 0;
            if (window.AppState.systemStatsInterval) {
                clearInterval(window.AppState.systemStatsInterval);
                window.AppState.systemStatsInterval = null;
            }
            setTimeout(() => {
                startStatsPolling();
            }, 5000);
        }
    }
}

function applyCachedSystemStats() {
    if (!window.AppState.systemStatsCache) return;

    const cpuEl = document.getElementById('system-cpu');
    const cpuCountEl = document.getElementById('system-cpu-count');
    const ramEl = document.getElementById('system-ram');
    const dockerVersionEl = document.getElementById('system-docker-version');

    if (cpuEl) {
        cpuEl.textContent = `${window.AppState.systemStatsCache.cpu_percent}%`;
    }

    if (cpuCountEl) {
        cpuCountEl.textContent = window.AppState.systemStatsCache.cpu_count || 0;
    }

    if (ramEl) {
        const memUsed = window.AppState.systemStatsCache.memory_used_mb || 0;
        const memTotal = window.AppState.systemStatsCache.memory_total_mb || 0;
        const memPercent = window.AppState.systemStatsCache.memory_percent || 0;
        ramEl.textContent = `${Math.round(memUsed)} MB / ${Math.round(memTotal)} MB (${memPercent.toFixed(1)}%)`;
    }

    if (dockerVersionEl) {
        dockerVersionEl.textContent = window.AppState.systemStatsCache.docker_version || 'N/A';
    }
}

// Export functions to window for HTML access
window.loadStatistics = loadStatistics;
window.refreshStatistics = refreshStatistics;
window.updateStatisticsGrid = updateStatisticsGrid;
window.formatRefreshTime = formatRefreshTime;
window.startRefreshTimeUpdates = startRefreshTimeUpdates;
window.createStatisticsRow = createStatisticsRow;
window.startStatsPolling = startStatsPolling;
window.updateSystemStats = updateSystemStats;
window.applyCachedSystemStats = applyCachedSystemStats;

