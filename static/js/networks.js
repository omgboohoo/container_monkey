// Networks Module
// Handles network management: loading, displaying, backing up, deleting, restoring

// Load networks
async function loadNetworks() {
    const errorEl = document.getElementById('networks-error');
    const networksList = document.getElementById('networks-list');
    const networksSpinner = document.getElementById('networks-spinner');
    const networksWrapper = document.getElementById('networks-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';
    if (networksList) networksList.innerHTML = '';

    // Show spinner and prevent scrollbars
    if (networksSpinner) networksSpinner.style.display = 'flex';
    if (networksWrapper) {
        networksWrapper.style.overflow = 'hidden';
        networksWrapper.classList.add('loading-grid');
    }

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch('/api/networks');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load networks');
        }

        // Store all networks for sorting
        window.AppState.allNetworks = data.networks || [];

        // Apply current sort if any, then render
        let networksToDisplay = window.AppState.allNetworks;
        if (window.AppState.currentNetworkSortColumn) {
            networksToDisplay = sortNetworksData([...window.AppState.allNetworks], window.AppState.currentNetworkSortColumn, window.AppState.currentNetworkSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-network-${window.AppState.currentNetworkSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = window.AppState.currentNetworkSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderNetworks(networksToDisplay);

    } catch (error) {
        if (errorEl) {
            errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
            errorEl.style.display = 'block';
        }
    } finally {
        // Hide spinner and restore overflow
        if (networksSpinner) networksSpinner.style.display = 'none';
        if (networksWrapper) {
            networksWrapper.style.overflow = '';
            networksWrapper.classList.remove('loading-grid');
        }
    }
}

// Create network row
function createNetworkRow(network) {
    const tr = document.createElement('tr');
    tr.className = 'network-row';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    // Skip default networks (bridge, host, none) and Docker Swarm system networks
    const isDefault = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress'].includes(network.name) ||
        (network.scope === 'swarm' && network.name.startsWith('docker_gwbridge'));

    // Count ALL containers using this network
    const containerCount = network.containers !== undefined ? network.containers : 0;

    // Show container count for bridge, host, and none networks and non-built-in networks
    const shouldShowContainerCount = !isDefault || network.name === 'bridge' || network.name === 'host' || network.name === 'none';
    const containerDisplay = shouldShowContainerCount && containerCount > 0 ? containerCount : (shouldShowContainerCount ? '0' : '-');

    // Build subnet/gateway display
    let subnetDisplay = '-';
    if (network.subnet) {
        subnetDisplay = escapeHtml(network.subnet);
        if (network.gateway) {
            subnetDisplay += ` / ${escapeHtml(network.gateway)}`;
        }
    }

    // Build actions column
    let actionsHtml = '<div class="btn-group" style="display: flex; gap: 4px; flex-wrap: nowrap;">';

    // View Containers button if network has containers
    if (containerCount > 0) {
        actionsHtml += `<button class="btn btn-secondary btn-sm" onclick="if(window.viewNetworkContainers) window.viewNetworkContainers('${escapeHtml(network.name)}')" title="View containers using this network"><i class="ph ph-cube"></i> View Containers</button>`;
    }

    // Backup button for non-default networks
    if (!isDefault) {
        actionsHtml += `<button class="btn btn-warning btn-sm" onclick="if(window.backupNetwork) window.backupNetwork('${escapeHtml(network.id)}', '${escapeHtml(network.name)}')" title="Backup network"><i class="ph ph-floppy-disk"></i> Backup</button>`;
    }

    // Delete button for non-default networks
    if (!isDefault) {
        if (containerCount > 0) {
            actionsHtml += `<button class="btn btn-danger btn-sm" style="opacity: 0.5; cursor: not-allowed;" title="Cannot remove network with ${containerCount} container(s) using it" disabled><i class="ph ph-trash"></i> Remove</button>`;
        } else {
            actionsHtml += `<button class="btn btn-danger btn-sm" onclick="deleteNetwork('${escapeHtml(network.id)}', '${escapeHtml(network.name)}')" title="Remove network"><i class="ph ph-trash"></i> Remove</button>`;
        }
    }

    actionsHtml += '</div>';

    tr.innerHTML = `
        <td>
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(network.name)} ${isDefault ? '<span style="color: #999; font-size: 0.8em;">(Built-in)</span>' : ''}</div>
            <div style="font-size: 0.75em; color: var(--text-secondary); font-family: monospace; margin-top: 2px;">${escapeHtml(network.id.substring(0, 12))}</div>
        </td>
        <td>
            <div style="color: var(--text-secondary);">${escapeHtml(network.driver)}</div>
        </td>
        <td>
            <div style="color: var(--text-secondary);">${escapeHtml(network.scope)}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary); font-family: monospace;">${subnetDisplay}</div>
        </td>
        <td>
            <div style="color: var(--text-secondary);">${containerDisplay}</div>
        </td>
        <td>
            ${actionsHtml}
        </td>
    `;

    return tr;
}

// Sort networks
function sortNetworks(column) {
    if (window.AppState.currentNetworkSortColumn === column) {
        window.AppState.currentNetworkSortDirection = window.AppState.currentNetworkSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.AppState.currentNetworkSortColumn = column;
        window.AppState.currentNetworkSortDirection = 'asc';
    }

    document.querySelectorAll('#networks-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-network-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = window.AppState.currentNetworkSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortNetworksData([...window.AppState.allNetworks], column, window.AppState.currentNetworkSortDirection);
    renderNetworks(sorted);
}

// Helper function to sort network data
function sortNetworksData(networks, column, direction) {
    return networks.sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            case 'driver':
                aVal = (a.driver || '').toLowerCase();
                bVal = (b.driver || '').toLowerCase();
                break;
            case 'scope':
                aVal = (a.scope || '').toLowerCase();
                bVal = (b.scope || '').toLowerCase();
                break;
            case 'subnet':
                aVal = (a.subnet || '').toLowerCase();
                bVal = (b.subnet || '').toLowerCase();
                break;
            case 'containers':
                aVal = a.containers !== undefined ? a.containers : 0;
                bVal = b.containers !== undefined ? b.containers : 0;
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// Render networks to the table
function renderNetworks(networks) {
    const networksList = document.getElementById('networks-list');
    if (!networksList) return;

    networksList.innerHTML = '';

    if (networks.length === 0) {
        networksList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">No networks found</td></tr>';
    } else {
        networks.forEach(network => {
            const row = createNetworkRow(network);
            networksList.appendChild(row);
        });
    }
}

// Delete network
async function deleteNetwork(networkId, networkName) {
    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Remove network "${networkName}"?\n\nThis will remove the network. Containers using this network will be disconnected.\n\nThis action cannot be undone.`, async () => {
            try {
                const response = await fetch(`/api/network/${networkId}/delete`, {
                    method: 'DELETE',
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to remove network');
                }

                console.log('Network removed');
                if (window.showNotification) {
                    window.showNotification('Network removed successfully', 'success');
                }
                loadNetworks();
            } catch (error) {
                console.error(`Error removing network: ${error.message}`);
                if (window.showNotification) {
                    window.showNotification(`Error removing network: ${error.message}`, 'error');
                }
            }
        });
    }
}

// Note: backupNetwork and restoreNetworkBackup are in backups.js module

// Export functions to window for HTML access
window.loadNetworks = loadNetworks;
window.createNetworkRow = createNetworkRow;
window.sortNetworks = sortNetworks;
window.sortNetworksData = sortNetworksData;
window.renderNetworks = renderNetworks;
window.deleteNetwork = deleteNetwork;

