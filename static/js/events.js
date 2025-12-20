// Events Module
// Handles Docker events: loading, filtering, sorting, displaying

const eventTypeActions = {
    'container': ['create', 'start', 'stop', 'kill', 'die', 'destroy', 'remove', 'attach', 'detach', 'pause', 'unpause', 'restart', 'update', 'rename', 'resize', 'exec_create', 'exec_start', 'exec_die'],
    'image': ['pull', 'push', 'tag', 'untag', 'delete', 'remove', 'import', 'load', 'save'],
    'volume': ['create', 'destroy', 'remove', 'mount', 'unmount'],
    'network': ['create', 'destroy', 'remove', 'connect', 'disconnect'],
    'plugin': ['enable', 'disable', 'install', 'remove', 'upgrade'],
    'service': ['create', 'update', 'remove'],
    'node': ['create', 'update', 'remove'],
    'secret': ['create', 'update', 'remove'],
    'config': ['create', 'update', 'remove']
};

// Load events
async function loadEvents() {
    const errorEl = document.getElementById('events-error');
    const eventsList = document.getElementById('events-list');
    const eventsSpinner = document.getElementById('events-spinner');
    const eventsWrapper = document.getElementById('events-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';
    if (eventsList) eventsList.innerHTML = '';

    // Show spinner and prevent scrollbars
    if (eventsSpinner) eventsSpinner.style.display = 'flex';
    if (eventsWrapper) {
        eventsWrapper.style.overflow = 'hidden';
        eventsWrapper.classList.add('loading-grid');
    }

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch('/api/events');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load events');
        }

        // Store all events for sorting and filtering
        window.AppState.allEvents = data.events || [];

        // Update action filter based on available event types
        updateEventsActionFilter();

        // Apply filters, then sort, then render
        applyEventsFiltersAndSort();

    } catch (error) {
        if (errorEl) {
            errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
            errorEl.style.display = 'block';
        }
    } finally {
        // Hide spinner and restore overflow
        if (eventsSpinner) eventsSpinner.style.display = 'none';
        if (eventsWrapper) {
            eventsWrapper.style.overflow = '';
            eventsWrapper.classList.remove('loading-grid');
        }
    }
}

// Filter events
function filterEvents() {
    // Apply filters and sort, then render
    applyEventsFiltersAndSort();
}

// Apply filters and sort, then render
function applyEventsFiltersAndSort() {
    // Get filter values
    const typeFilter = document.getElementById('events-filter-type')?.value || '';
    const actionFilter = document.getElementById('events-filter-action')?.value || '';
    const searchQuery = (document.getElementById('events-search')?.value || '').toLowerCase().trim();

    // Filter events
    let filteredEvents = [...window.AppState.allEvents];
    
    if (typeFilter) {
        filteredEvents = filteredEvents.filter(event => {
            const eventType = (event.type || '').toLowerCase();
            return eventType === typeFilter.toLowerCase();
        });
    }

    if (actionFilter) {
        filteredEvents = filteredEvents.filter(event => {
            const eventAction = (event.action || '').toLowerCase();
            return eventAction === actionFilter.toLowerCase();
        });
    }

    // Apply search filter
    if (searchQuery) {
        filteredEvents = filteredEvents.filter(event => {
            const name = (event.name || '').toLowerCase();
            const type = (event.type || '').toLowerCase();
            const action = (event.action || '').toLowerCase();
            const timeFormatted = (event.time_formatted || '').toLowerCase();
            
            return name.includes(searchQuery) ||
                   type.includes(searchQuery) ||
                   action.includes(searchQuery) ||
                   timeFormatted.includes(searchQuery);
        });
    }

    // Apply current sort if any
    let eventsToDisplay = filteredEvents;
    if (window.AppState.currentEventsSortColumn) {
        eventsToDisplay = sortEventsData([...filteredEvents], window.AppState.currentEventsSortColumn, window.AppState.currentEventsSortDirection);
        // Restore sort indicator
        const sortIndicator = document.getElementById(`sort-events-${window.AppState.currentEventsSortColumn}`);
        if (sortIndicator) {
            sortIndicator.textContent = window.AppState.currentEventsSortDirection === 'asc' ? ' ▲' : ' ▼';
            sortIndicator.style.color = 'var(--accent)';
        }
    }

    renderEvents(eventsToDisplay);
}

// Sort events
function sortEvents(column) {
    // Toggle direction if same column, otherwise default to desc for time, asc for others
    if (window.AppState.currentEventsSortColumn === column) {
        window.AppState.currentEventsSortDirection = window.AppState.currentEventsSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.AppState.currentEventsSortColumn = column;
        window.AppState.currentEventsSortDirection = column === 'time' ? 'desc' : 'asc';
    }

    // Clear all sort indicators
    document.querySelectorAll('#events-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    // Apply filters and sort, then render
    applyEventsFiltersAndSort();
}

// Helper function to sort event data
function sortEventsData(events, column, direction) {
    return events.sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'time':
                // Use timeNano for sub-second precision if available, otherwise use time
                // timeNano is in nanoseconds, so we can compare directly
                aVal = a.timeNano !== undefined && a.timeNano !== null ? a.timeNano : (a.time || 0) * 1e9;
                bVal = b.timeNano !== undefined && b.timeNano !== null ? b.timeNano : (b.time || 0) * 1e9;
                break;
            case 'type':
                aVal = (a.type || '').toLowerCase();
                bVal = (b.type || '').toLowerCase();
                break;
            case 'action':
                aVal = (a.action || '').toLowerCase();
                bVal = (b.action || '').toLowerCase();
                break;
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

// Render events to the table
function renderEvents(events) {
    const eventsList = document.getElementById('events-list');
    if (!eventsList) return;

    eventsList.innerHTML = '';

    if (events.length === 0) {
        eventsList.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-secondary);">No events found</td></tr>';
        return;
    }

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    events.forEach(event => {
        const tr = document.createElement('tr');
        tr.className = 'event-row';

        // Determine color based on event type/action
        let actionColor = 'var(--text-secondary)';
        if (event.action) {
            const actionLower = event.action.toLowerCase();
            if (actionLower.includes('start') || actionLower.includes('create')) {
                actionColor = 'var(--accent)';
            } else if (actionLower.includes('stop') || actionLower.includes('kill') || actionLower.includes('die')) {
                actionColor = 'var(--danger)';
            } else if (actionLower.includes('destroy') || actionLower.includes('remove')) {
                actionColor = 'var(--warning)';
            }
        }

        tr.innerHTML = `
            <td>
                <div style="font-size: 0.9em; color: var(--text-secondary); font-family: monospace;">
                    ${escapeHtml(event.time_formatted || 'N/A')}
                </div>
            </td>
            <td>
                <div style="color: var(--text-secondary); font-size: 0.9em; text-transform: capitalize;">
                    ${escapeHtml(event.type || 'unknown')}
                </div>
            </td>
            <td>
                <div style="color: ${actionColor}; font-size: 0.9em; text-transform: capitalize; font-weight: 500;">
                    ${escapeHtml(event.action || 'unknown')}
                </div>
            </td>
            <td>
                <div style="font-weight: 500; color: var(--text-primary); font-size: 0.9em;">
                    ${escapeHtml(event.name || 'N/A')}
                </div>
            </td>
        `;

        eventsList.appendChild(tr);
    });
}

// Update events action filter based on selected type
function updateEventsActionFilter() {
    const typeFilter = document.getElementById('events-filter-type')?.value || '';
    const actionFilter = document.getElementById('events-filter-action');
    
    if (!actionFilter) return;
    
    // Store current selection
    const currentValue = actionFilter.value;
    
    // Clear existing options except "All Actions"
    actionFilter.innerHTML = '<option value="">All Actions</option>';
    
    if (typeFilter) {
        // Get actions for selected type
        const actions = eventTypeActions[typeFilter.toLowerCase()] || [];
        
        // Add actions as options
        actions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ');
            actionFilter.appendChild(option);
        });
        
        // Restore selection if it's still valid
        if (currentValue && actions.includes(currentValue)) {
            actionFilter.value = currentValue;
        } else {
            actionFilter.value = '';
        }
    } else {
        // Show all actions when no type filter is selected
        const allActions = new Set();
        Object.values(eventTypeActions).forEach(actions => {
            actions.forEach(action => allActions.add(action));
        });
        
        // Sort actions alphabetically
        const sortedActions = Array.from(allActions).sort();
        
        sortedActions.forEach(action => {
            const option = document.createElement('option');
            option.value = action;
            option.textContent = action.charAt(0).toUpperCase() + action.slice(1).replace(/_/g, ' ');
            actionFilter.appendChild(option);
        });
        
        // Restore selection if it's still valid
        if (currentValue && sortedActions.includes(currentValue)) {
            actionFilter.value = currentValue;
        } else {
            actionFilter.value = '';
        }
    }
}

// Export functions to window for HTML access
window.loadEvents = loadEvents;
window.filterEvents = filterEvents;
window.applyEventsFiltersAndSort = applyEventsFiltersAndSort;
window.sortEvents = sortEvents;
window.sortEventsData = sortEventsData;
window.renderEvents = renderEvents;
window.updateEventsActionFilter = updateEventsActionFilter;

