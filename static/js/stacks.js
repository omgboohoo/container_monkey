// Stacks Module
// Handles stack management: loading, displaying, filtering, deleting

// Load stacks
async function loadStacks() {
    const errorEl = document.getElementById('stacks-error');
    const stacksList = document.getElementById('stacks-list');
    const stacksSpinner = document.getElementById('stacks-spinner');
    const stacksWrapper = document.getElementById('stacks-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';
    if (stacksList) stacksList.innerHTML = '';

    // Show spinner
    if (stacksSpinner) stacksSpinner.style.display = 'flex';
    if (stacksWrapper) stacksWrapper.classList.add('loading-grid');

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch('/api/stacks');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load stacks');
        }

        // Store all stacks for sorting
        window.AppState.allStacks = data.stacks || [];

        // Apply current sort if any, then render
        let stacksToDisplay = window.AppState.allStacks;
        if (window.AppState.currentStackSortColumn) {
            stacksToDisplay = sortStacksData([...window.AppState.allStacks], window.AppState.currentStackSortColumn, window.AppState.currentStackSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-stack-${window.AppState.currentStackSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = window.AppState.currentStackSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderStacks(stacksToDisplay);

    } catch (error) {
        if (errorEl) {
            errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
            errorEl.style.display = 'block';
        }
    } finally {
        // Hide spinner
        if (stacksSpinner) stacksSpinner.style.display = 'none';
        if (stacksWrapper) stacksWrapper.classList.remove('loading-grid');
    }
}

// Create stack row
function createStackRow(stack) {
    const tr = document.createElement('tr');
    tr.className = 'stack-row';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    const typeBadge = stack.type === 'swarm'
        ? '<span style="background: var(--accent); color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; font-weight: 600;">Swarm</span>'
        : '<span style="background: var(--secondary); color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; font-weight: 600;">Compose</span>';

    const servicesList = stack.services && stack.services.length > 0
        ? stack.services.map(s => `<span style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; margin-right: 4px;">${escapeHtml(s)}</span>`).join('')
        : '<span style="color: var(--text-light);">-</span>';

    const networksList = stack.networks && stack.networks.length > 0
        ? stack.networks.map(n => `<span style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; margin-right: 4px;">${escapeHtml(n)}</span>`).join('')
        : '<span style="color: var(--text-light);">-</span>';

    // Actions column: Remove for Swarm stacks, View Containers for Compose stacks
    const actionsCell = stack.type === 'swarm'
        ? `<td style="white-space: nowrap;">
            <button class="btn btn-danger btn-sm" onclick="if(window.deleteStack) window.deleteStack('${escapeHtml(stack.name)}', '${stack.type}')" title="Remove Swarm Stack">
                <i class="ph ph-trash"></i> Remove
            </button>
        </td>`
        : `<td style="white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="if(window.viewStackContainers) window.viewStackContainers('${escapeHtml(stack.name)}')" title="View Containers in Stack">
                <i class="ph ph-cube"></i> View Containers
            </button>
        </td>`;

    tr.innerHTML = `
        <td>
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(stack.name)}</div>
        </td>
        <td>${typeBadge}</td>
        <td>
            <div style="font-size: 0.9em;">
                <strong>${stack.services_count}</strong> service${stack.services_count !== 1 ? 's' : ''}
                ${stack.services && stack.services.length > 0 ? `<div style="margin-top: 4px;">${servicesList}</div>` : ''}
            </div>
        </td>
        <td>
            <div style="font-size: 0.9em; color: var(--text-secondary);">
                <strong>${stack.containers_count}</strong> container${stack.containers_count !== 1 ? 's' : ''}
            </div>
        </td>
        <td>
            <div style="font-size: 0.85em;">
                ${networksList}
            </div>
        </td>
        ${actionsCell}
    `;

    return tr;
}

// Sort stacks
function sortStacks(column) {
    if (window.AppState.currentStackSortColumn === column) {
        window.AppState.currentStackSortDirection = window.AppState.currentStackSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.AppState.currentStackSortColumn = column;
        window.AppState.currentStackSortDirection = 'asc';
    }

    document.querySelectorAll('#stacks-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-stack-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = window.AppState.currentStackSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortStacksData([...window.AppState.allStacks], column, window.AppState.currentStackSortDirection);
    renderStacks(sorted);
}

// Helper function to sort stack data
function sortStacksData(stacks, column, direction) {
    return stacks.sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            case 'type':
                aVal = (a.type || '').toLowerCase();
                bVal = (b.type || '').toLowerCase();
                break;
            case 'services':
                aVal = a.services_count !== undefined ? a.services_count : 0;
                bVal = b.services_count !== undefined ? b.services_count : 0;
                break;
            case 'containers':
                aVal = a.containers_count !== undefined ? a.containers_count : 0;
                bVal = b.containers_count !== undefined ? b.containers_count : 0;
                break;
            case 'networks':
                aVal = (a.networks && a.networks.length) ? a.networks.length : 0;
                bVal = (b.networks && b.networks.length) ? b.networks.length : 0;
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// Render stacks to the table
function renderStacks(stacks) {
    const stacksList = document.getElementById('stacks-list');
    if (!stacksList) return;

    stacksList.innerHTML = '';

    if (stacks.length === 0) {
        stacksList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666; font-weight: normal;">No stacks found</td></tr>';
    } else {
        stacks.forEach(stack => {
            const row = createStackRow(stack);
            stacksList.appendChild(row);
        });
    }
}

// Handle stack checkbox click
function handleStackCheckboxClick(checkbox) {
    const stackName = checkbox.getAttribute('data-stack-name');
    if (checkbox.checked) {
        window.AppState.selectedStacks.add(stackName);
    } else {
        window.AppState.selectedStacks.delete(stackName);
    }
    updateStackDeleteButton();
}

// Toggle all stack selections
function toggleAllStackSelections(checkbox) {
    const checkboxes = document.querySelectorAll('.stack-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const stackName = cb.getAttribute('data-stack-name');
        if (checkbox.checked) {
            window.AppState.selectedStacks.add(stackName);
        } else {
            window.AppState.selectedStacks.delete(stackName);
        }
    });
    updateStackDeleteButton();
}

// Update stack delete button state
function updateStackDeleteButton() {
    const deleteBtn = document.getElementById('delete-selected-stacks-btn');
    if (deleteBtn) {
        deleteBtn.disabled = window.AppState.selectedStacks.size === 0;
    }
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

// Delete stack
async function deleteStack(stackName, stackType) {
    const stackTypeLabel = stackType === 'swarm' ? 'Swarm stack' : 'Compose stack';
    if (window.showConfirmationModal) {
        window.showConfirmationModal(
            `Remove ${stackTypeLabel} "${stackName}"?`,
            `This will ${stackType === 'swarm' ? 'remove the stack and all its services' : 'remove all containers in this stack'}. This action cannot be undone.`,
            async () => {
                try {
                    const response = await fetch(`/api/stack/${encodeURIComponent(stackName)}/delete`, {
                        method: 'DELETE',
                    });
                    const data = await response.json();

                    if (!response.ok) {
                        throw new Error(data.error || 'Failed to remove stack');
                    }

                    if (window.showNotification) {
                        window.showNotification(`Stack "${stackName}" removed successfully`, 'success');
                    }
                    await loadStacks();
                } catch (error) {
                    if (window.showNotification) {
                        window.showNotification(`Failed to remove stack: ${error.message}`, 'error');
                    }
                }
            }
        );
    }
}

// Delete selected stacks
async function deleteSelectedStacks() {
    if (window.AppState.selectedStacks.size === 0) {
        return;
    }

    const stackNames = Array.from(window.AppState.selectedStacks);
    const stackList = stackNames.map(name => `"${name}"`).join(', ');

    if (window.showConfirmationModal) {
        window.showConfirmationModal(
            `Remove ${window.AppState.selectedStacks.size} stack${window.AppState.selectedStacks.size !== 1 ? 's' : ''}?`,
            `This will remove: ${stackList}. This action cannot be undone.`,
            async () => {
                let successCount = 0;
                let errorCount = 0;

                for (const stackName of stackNames) {
                    try {
                        const response = await fetch(`/api/stack/${encodeURIComponent(stackName)}/delete`, {
                            method: 'DELETE',
                        });
                        const data = await response.json();

                        if (response.ok) {
                            successCount++;
                        } else {
                            errorCount++;
                            console.error(`Failed to remove stack ${stackName}: ${data.error}`);
                        }
                    } catch (error) {
                        errorCount++;
                        console.error(`Error removing stack ${stackName}: ${error.message}`);
                    }
                }

                if (successCount > 0) {
                    if (window.showNotification) {
                        window.showNotification(`${successCount} stack(s) removed successfully`, 'success');
                    }
                }
                if (errorCount > 0) {
                    if (window.showNotification) {
                        window.showNotification(`Failed to remove ${errorCount} stack(s)`, 'error');
                    }
                }

                // Clear selection
                window.AppState.selectedStacks.clear();
                await loadStacks();
            }
        );
    }
}

// Export functions to window for HTML access
window.loadStacks = loadStacks;
window.createStackRow = createStackRow;
window.sortStacks = sortStacks;
window.sortStacksData = sortStacksData;
window.renderStacks = renderStacks;
window.handleStackCheckboxClick = handleStackCheckboxClick;
window.toggleAllStackSelections = toggleAllStackSelections;
window.updateStackDeleteButton = updateStackDeleteButton;
window.viewStackContainers = viewStackContainers;
window.clearStackFilter = clearStackFilter;
window.viewContainerByName = viewContainerByName;
window.viewNetworkContainers = viewNetworkContainers;
window.deleteStack = deleteStack;
window.deleteSelectedStacks = deleteSelectedStacks;

