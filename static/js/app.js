// Authentication state
let isAuthenticated = false;
let currentUsername = '';

// Check authentication status on page load
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();
        
        if (data.logged_in) {
            isAuthenticated = true;
            currentUsername = data.username || 'monkey';
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('user-menu-container').style.display = 'block';
            document.getElementById('user-menu-username').textContent = currentUsername;
        } else {
            isAuthenticated = false;
            document.getElementById('login-modal').style.display = 'block';
            document.getElementById('user-menu-container').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        // Show login modal on error
        document.getElementById('login-modal').style.display = 'block';
    }
}

// Intercept fetch requests to handle 401 errors
const originalFetch = window.fetch;
window.fetch = async function(...args) {
    const response = await originalFetch(...args);
    
    // If we get a 401 and we're not already on the login page, show login modal
    if (response.status === 401 && !args[0].includes('/api/login') && !args[0].includes('/api/auth-status')) {
        if (!isAuthenticated) {
            document.getElementById('login-modal').style.display = 'block';
            document.getElementById('user-menu-container').style.display = 'none';
        }
    }
    
    return response;
};

// Handle login
async function handleLogin(event) {
    event.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    
    errorDiv.style.display = 'none';
    errorDiv.textContent = '';
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            isAuthenticated = true;
            currentUsername = data.username;
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('user-menu-container').style.display = 'block';
            document.getElementById('user-menu-username').textContent = currentUsername;
            document.getElementById('login-form').reset();
            
            // Reload page data
            if (document.querySelector('.content-section.active')) {
                const activeSection = document.querySelector('.content-section.active').id.replace('-section', '');
                showSection(activeSection);
            }
        } else {
            errorDiv.textContent = data.error || 'Login failed';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
        console.error('Login error:', error);
    }
}

// Handle logout
async function logout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST'
        });
        
        if (response.ok) {
            isAuthenticated = false;
            currentUsername = '';
            document.getElementById('login-modal').style.display = 'block';
            document.getElementById('user-menu-container').style.display = 'none';
            document.getElementById('user-menu-dropdown').classList.remove('show');
            
            // Clear any data
            location.reload();
        }
    } catch (error) {
        console.error('Logout error:', error);
    }
}

// Toggle user menu dropdown
function toggleUserMenu() {
    const dropdown = document.getElementById('user-menu-dropdown');
    dropdown.classList.toggle('show');
}

// Close user menu when clicking outside
document.addEventListener('click', function(event) {
    const userMenuContainer = document.getElementById('user-menu-container');
    if (userMenuContainer && !userMenuContainer.contains(event.target)) {
        document.getElementById('user-menu-dropdown').classList.remove('show');
    }
});

// Show change password modal
function showChangePasswordModal() {
    document.getElementById('change-password-modal').style.display = 'block';
    document.getElementById('user-menu-dropdown').classList.remove('show');
    document.getElementById('change-password-form').reset();
    document.getElementById('change-password-error').style.display = 'none';
    document.getElementById('change-password-success').style.display = 'none';
}

// Close change password modal
function closeChangePasswordModal() {
    document.getElementById('change-password-modal').style.display = 'none';
    document.getElementById('change-password-form').reset();
    document.getElementById('change-password-error').style.display = 'none';
    document.getElementById('change-password-success').style.display = 'none';
}

// Handle change password
async function handleChangePassword(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('current-password').value;
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;
    const errorDiv = document.getElementById('change-password-error');
    const successDiv = document.getElementById('change-password-success');
    const successMessage = document.getElementById('change-password-success-message');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    errorDiv.textContent = '';
    
    // Validate passwords match
    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'New passwords do not match';
        errorDiv.style.display = 'block';
        return;
    }
    
    if (newPassword.length < 3) {
        errorDiv.textContent = 'New password must be at least 3 characters long';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            successMessage.textContent = data.message || 'Password changed successfully.';
            successDiv.style.display = 'block';
            document.getElementById('change-password-form').reset();
            
            // Close modal after 2 seconds
            setTimeout(() => {
                closeChangePasswordModal();
            }, 2000);
        } else {
            errorDiv.textContent = data.error || 'Failed to change password';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
        console.error('Change password error:', error);
    }
}

// Show change username modal
function showChangeUsernameModal() {
    document.getElementById('change-username-modal').style.display = 'block';
    document.getElementById('user-menu-dropdown').classList.remove('show');
    document.getElementById('change-username-form').reset();
    document.getElementById('change-username-error').style.display = 'none';
    document.getElementById('change-username-success').style.display = 'none';
}

// Close change username modal
function closeChangeUsernameModal() {
    document.getElementById('change-username-modal').style.display = 'none';
    document.getElementById('change-username-form').reset();
    document.getElementById('change-username-error').style.display = 'none';
    document.getElementById('change-username-success').style.display = 'none';
}

// Handle change username
async function handleChangeUsername(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('current-password-username').value;
    const newUsername = document.getElementById('new-username').value.trim();
    const errorDiv = document.getElementById('change-username-error');
    const successDiv = document.getElementById('change-username-success');
    const successMessage = document.getElementById('change-username-success-message');
    
    errorDiv.style.display = 'none';
    successDiv.style.display = 'none';
    errorDiv.textContent = '';
    
    // Validate username
    if (newUsername.length < 3) {
        errorDiv.textContent = 'New username must be at least 3 characters long';
        errorDiv.style.display = 'block';
        return;
    }
    
    try {
        const response = await fetch('/api/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                current_password: currentPassword,
                new_username: newUsername
            })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            successMessage.textContent = data.message || 'Username changed successfully.';
            successDiv.style.display = 'block';
            document.getElementById('change-username-form').reset();
            
            // Update username in UI
            if (data.username && data.username !== currentUsername) {
                currentUsername = data.username;
                document.getElementById('user-menu-username').textContent = data.username;
            }
            
            // Close modal after 2 seconds
            setTimeout(() => {
                closeChangeUsernameModal();
            }, 2000);
        } else {
            errorDiv.textContent = data.error || 'Failed to change username';
            errorDiv.style.display = 'block';
        }
    } catch (error) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
        console.error('Change username error:', error);
    }
}

let currentContainerId = null;
// Container metadata map (containerId -> {is_self, name, ...})
let containerMetadata = new Map();
// Section switching (sidebar navigation)
function showSection(sectionName, navElement) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
        section.style.display = 'none';
    });
    
    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Show selected section
    const section = document.getElementById(`${sectionName}-section`);
    if (section) {
        section.style.display = 'block';
        section.classList.add('active');
    }
    
    // Add active class to clicked nav item
    if (navElement) {
        navElement.classList.add('active');
    } else {
        // Find the nav item by section name and activate it
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            const itemText = item.querySelector('.nav-text').textContent.toLowerCase().trim();
            if (itemText === sectionName.toLowerCase()) {
                item.classList.add('active');
            }
        });
    }
    
    // Load data for the section
    if (sectionName === 'dashboard') {
        loadDashboardStats();
    } else if (sectionName === 'containers') {
        loadContainers();
    } else if (sectionName === 'volumes') {
        loadVolumes();
    } else if (sectionName === 'images') {
        loadImages();
    } else if (sectionName === 'networks') {
        loadNetworks();
    } else if (sectionName === 'stacks') {
        loadStacks();
    } else if (sectionName === 'backups') {
        loadBackups();
    }
}

// Legacy function for compatibility (maps to showSection)
function showTab(tabName, event) {
    showSection(tabName, event ? event.target.closest('.nav-item') : null);
}

async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard-stats');
        const stats = await response.json();

        if (!response.ok) {
            throw new Error(stats.error || 'Failed to load dashboard stats');
        }

        // Update all stat elements in the dashboard
        document.querySelector('.dashboard-card .card-number').textContent = stats.cpu_ram_info;
        document.querySelector('.dashboard-card .card-subtext').textContent = stats.docker_sock_url;
        
        const cards = document.querySelectorAll('.dashboard-card');
        if (cards.length > 6) {
            cards[1].querySelector('.card-number').textContent = stats.containers_qty;
            cards[1].querySelector('.card-subtext').innerHTML = `
                <span class="status-dot running" title="Running"></span> ${stats.running_containers}
                <span class="status-dot stopped" style="margin-left: 8px;" title="Stopped"></span> ${stats.stopped_containers}
            `;
            cards[2].querySelector('.card-number').textContent = stats.images_qty;
            cards[2].querySelector('.card-subtext').innerHTML = `<i class="ph ph-database" style="margin-right: 4px;"></i> ${stats.total_images_size}`;
            cards[3].querySelector('.card-number').textContent = stats.volumes_qty;
            cards[3].querySelector('.card-subtext').innerHTML = `<i class="ph ph-database" style="margin-right: 4px;"></i> ${stats.total_volumes_size || 'N/A'}`;
            cards[4].querySelector('.card-number').textContent = stats.networks_qty;
            cards[5].querySelector('.card-number').textContent = stats.stacks_qty || 0;
            cards[6].querySelector('.card-number').textContent = stats.backups_qty;
            cards[6].querySelector('.card-subtext').innerHTML = `<i class="ph ph-database" style="margin-right: 4px;"></i> ${stats.total_backups_size}`;
        }

    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        // Optionally, display an error message on the dashboard
    }
}

// Load containers
let isLoadingContainers = false;
let containersData = []; // Store containers data for sorting
let currentSortColumn = null;
let currentSortDirection = 'asc'; // 'asc' or 'desc'

async function loadContainers() {
    // Prevent concurrent loads
    if (isLoadingContainers) {
        return;
    }
    
    // Clear any active filters when reloading
    isFilteredByStack = false;
    currentStackFilter = null;
    const clearFilterBtn = document.getElementById('clear-filter-btn');
    if (clearFilterBtn) clearFilterBtn.style.display = 'none';
    
    isLoadingContainers = true;
    const errorEl = document.getElementById('error');
    const containersList = document.getElementById('containers-list');
    const containersSpinner = document.getElementById('containers-spinner');
    const containersWrapper = document.getElementById('containers-table-wrapper');
    
    errorEl.style.display = 'none';
    containersList.innerHTML = ''; // Clear immediately
    
    // Show spinner and prevent scrollbars
    if (containersSpinner) containersSpinner.style.display = 'flex';
    if (containersWrapper) containersWrapper.style.overflow = 'hidden';
    
    try {
        const response = await fetch('/api/containers');
        const data = await response.json();
        
        if (!response.ok) {
            // Handle Docker client not available error specially
            if (response.status === 503 && data.error === 'Docker client not available') {
                errorEl.innerHTML = `
                    <h3>❌ Docker Client Not Available</h3>
                    <p><strong>${data.message || 'Docker daemon is not accessible'}</strong></p>
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
                if (containersSpinner) containersSpinner.style.display = 'none';
                if (containersWrapper) containersWrapper.style.overflow = '';
                isLoadingContainers = false;
                return;
            }
            throw new Error(data.error || 'Failed to load containers');
        }
        
        if (data.containers.length === 0) {
            containersList.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">No containers found</p>';
            updateButtonStates();
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
            containersData = uniqueContainers;
            
            // Render containers (will use current sort if any)
            renderContainers(containersData);
        }
        
        // Reset selection state (buttons and select-all checkbox)
        // Update button states after loading containers
        resetSelection();
        updateButtonStates();
        
    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (containersSpinner) containersSpinner.style.display = 'none';
        if (containersWrapper) containersWrapper.style.overflow = '';
        isLoadingContainers = false;
    }
}

// Create container row
function createContainerCard(container) {
    const tr = document.createElement('tr');
    tr.className = `container-row ${container.status.toLowerCase()}`;
    // Store network names as data attribute for filtering
    const networkNames = container.networks && Array.isArray(container.networks) ? container.networks.join(',') : '';
    tr.setAttribute('data-networks', networkNames);
    if (!container.is_self) {
        tr.style.cursor = 'pointer';
        tr.onclick = (event) => toggleContainerSelection(event, tr);
    }
    
    // Normalize status for display
    const statusLower = container.status.toLowerCase();
    const statusClass = statusLower === 'running' ? 'status-running' :
                       statusLower === 'stopped' ? 'status-stopped' :
                       'status-exited';
    const isRunning = statusLower === 'running';
    
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
    const createdDate = container.created ? new Date(container.created).toLocaleString() : 'Unknown';
    
    // Format stack info
    const stackInfo = container.stack_info || null;
    const stackDisplay = stackInfo ? escapeHtml(stackInfo.display || stackInfo.name || '') : '<span style="color: var(--text-light);">-</span>';
    
    tr.innerHTML = `
        <td class="checkbox-cell">
            <input type="checkbox" class="container-checkbox" data-container-id="${container.id}" onclick="event.stopPropagation(); handleCheckboxClick(this);" ${container.is_self ? 'disabled' : ''}>
        </td>
        <td>
            <div class="container-name" style="font-weight: 600; color: var(--text-primary);">${escapeHtml(container.name)} ${container.is_self ? '<span style="color: #999; font-size: 0.8em;">(self)</span>' : ''}</div>
            <div style="font-size: 0.8em; color: var(--text-secondary); font-family: monospace;">${container.id.substring(0, 12)}</div>
        </td>
        <td>
            <div class="container-status ${statusClass}">${statusDisplay}</div>
        </td>
        <td>
            <div style="color: var(--accent); font-size: 0.9em; font-weight: 500;">${stackDisplay}</div>
            ${stackInfo && stackInfo.service ? `<div style="font-size: 0.75em; color: var(--text-secondary); margin-top: 2px;">${escapeHtml(stackInfo.service)}</div>` : ''}
        </td>
        <td>
            <div style="color: var(--secondary); font-size: 0.9em;">${escapeHtml(imageName)}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">${createdDate}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">
                <div><strong>IP:</strong> ${escapeHtml(ipAddress)}</div>
                <div style="margin-top: 2px;">${portsDisplay}</div>
            </div>
        </td>
        <td class="stats-cell" data-container-id="${container.id}" style="font-family: monospace; font-size: 0.9em;">
            ${isRunning ? `
                <div class="cpu-stat" style="color: var(--secondary);">CPU: <span class="cpu-val">--</span></div>
                <div class="mem-stat" style="color: var(--accent);">MEM: <span class="mem-val">--</span></div>
            ` : '<span style="color: var(--text-light);">-</span>'}
        </td>
        <td style="white-space: nowrap;">
            <div class="btn-group" style="display: flex; gap: 2px;">
                <button class="btn-icon" onclick="event.stopPropagation(); showContainerDetails('${container.id}')" title="Container Details">
                    <i class="ph ph-info"></i>
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); showLogs('${container.id}', '${escapeHtml(container.name)}')" title="Container Logs">
                    <i class="ph ph-terminal-window"></i>
                </button>
                <button class="btn-icon" onclick="event.stopPropagation(); openAttachConsole('${container.id}', '${escapeHtml(container.name)}')" title="Exec Console">
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
    containersList.innerHTML = '';
    // Clear container metadata map
    containerMetadata.clear();
    
    containers.forEach(container => {
        // Store container metadata
        containerMetadata.set(container.id, {
            is_self: container.is_self || false,
            name: container.name || ''
        });
        const card = createContainerCard(container);
        containersList.appendChild(card);
    });
    
    // Update stats after rendering
    setTimeout(() => {
        updateAllContainerStats();
    }, 100);
}

// Sort containers
function sortContainers(column) {
    // Toggle sort direction if clicking the same column
    if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
    }
    
    // Update sort indicators
    document.querySelectorAll('.sort-indicator').forEach(indicator => {
        indicator.textContent = '';
    });
    
    const sortIndicator = document.getElementById(`sort-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = currentSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }
    
    // Sort containers
    const sorted = [...containersData].sort((a, b) => {
        let aVal, bVal;
        
        switch(column) {
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
            default:
                return 0;
        }
        
        if (aVal < bVal) return currentSortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return currentSortDirection === 'asc' ? 1 : -1;
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
        handleCheckboxClick(checkbox);
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
    updateButtonStates();
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

    // Handle buttons that depend on selection (Start, Stop, Backup Selected, etc.)
    bulkActionButtons.forEach(btn => {
        const isDisabled = !hasSelection;
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
    handleCheckboxClick();
}

// Handle checkbox clicks for bulk actions
function handleCheckboxClick(checkbox) {
    updateButtonStates();
}



// Show container details
async function showContainerDetails(containerId) {
    currentContainerId = containerId;
    const modal = document.getElementById('details-modal');
    const detailsDiv = document.getElementById('container-details');
    
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

// Format container details
function formatContainerDetails(data) {
    let html = `
        <div class="details-section">
            <h3>Basic Information</h3>
            <ul>
                <li><strong>Name:</strong> ${escapeHtml(data.name)}</li>
                <li><strong>Image:</strong> ${escapeHtml(data.image)}</li>
                <li><strong>Status:</strong> ${escapeHtml(data.status)}</li>
                <li><strong>Created:</strong> ${new Date(data.created).toLocaleString()}</li>
            </ul>
        </div>
    `;
    
    if (data.config.env && data.config.env.length > 0) {
        html += `
            <div class="details-section">
                <h3>Environment Variables</h3>
                <ul>
                    ${data.config.env.map(env => `<li>${escapeHtml(env)}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    if (data.host_config.binds && data.host_config.binds.length > 0) {
        html += `
            <div class="details-section">
                <h3>Volume Mounts</h3>
                <ul>
                    ${data.host_config.binds.map(bind => `<li>${escapeHtml(bind)}</li>`).join('')}
                </ul>
            </div>
        `;
    }
    
    if (data.host_config.port_bindings && Object.keys(data.host_config.port_bindings).length > 0) {
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
    
    if (data.host_config.network_mode) {
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

// Backup container (from details modal)
async function backupContainer() {
    if (!currentContainerId) {
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
    
    detailsModal.style.display = 'none';
    backupModal.style.display = 'block';
    statusEl.innerHTML = 'Starting backup...';
    stepEl.innerHTML = 'Preparing...';
    progressBar.style.width = '0%';
    percentageEl.innerHTML = '0%';
    
    try {
        const response = await fetch(`/api/backup/${currentContainerId}`, {
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
                    
                    const progress = await progressResponse.json();
                    
                    // Update UI
                    statusEl.innerHTML = progress.step || 'Processing...';
                    stepEl.innerHTML = progress.step || '';
                    progressBar.style.width = `${progress.progress}%`;
                    percentageEl.innerHTML = `${progress.progress}%`;
                    
                    if (progress.status === 'complete') {
                        clearInterval(progressInterval);
                        setTimeout(() => {
                            backupModal.style.display = 'none';
                            detailsModal.style.display = 'block';
                            
                            const detailsDiv = document.getElementById('container-details');
                            detailsDiv.innerHTML = `
                                <div class="success-message">
                                    <h3>✅ Backup Created Successfully!</h3>
                                    <p>Backup file: <strong>${escapeHtml(progress.backup_filename || data.backup_file)}</strong></p>
                                    <p><a href="/api/download/${progress.backup_filename || data.backup_file}">Download Backup</a></p>
                                </div>
                            `;
                            
                            // Reload backups list
                            loadBackups();
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
            detailsModal.style.display = 'block';
            
            const detailsDiv = document.getElementById('container-details');
            detailsDiv.innerHTML = `
                <div class="success-message">
                    <h3>✅ Backup Created Successfully!</h3>
                    <p>Backup file: <strong>${escapeHtml(data.backup_file)}</strong></p>
                    <p><a href="/api/download/${data.backup_file}">Download Backup</a></p>
                </div>
            `;
            
            loadBackups();
        }
    } catch (error) {
        backupModal.style.display = 'none';
        detailsModal.style.display = 'block';
        const detailsDiv = document.getElementById('container-details');
        detailsDiv.innerHTML = `<div class="error">Error: ${escapeHtml(error.message)}</div>`;
    }
}

let isBackupInProgress = false;

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
            showNotification(`A backup for "${statusData.current_backup}" is already in progress. Please wait.`, 'warning');
            return;
        }
    } catch (error) {
        console.error('Error checking backup status:', error);
    }
    
    if (isBackupInProgress) {
        showNotification('A backup is already in progress. Please wait for it to finish.', 'warning');
        return;
    }
    
    if (backupAllInProgress) {
        showNotification('A bulk backup operation is in progress. Please wait for it to finish.', 'warning');
        return;
    }
    
    isBackupInProgress = true;
    
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
                    
                    const progress = await progressResponse.json();
                    
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
                            loadBackups();
                            
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
            loadBackups();
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
        isBackupInProgress = false;
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
let backupAllCancelled = false;
let backupAllInProgress = false;

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
    handleCheckboxClick();
    
    // Now use the same backup logic as backupSelectedContainers
    await backupSelectedContainers();
}

function cancelBackupAll() {
    showConfirmationModal('Are you sure you want to cancel the backup operation? Current backup will finish, but remaining containers will not be backed up.', () => {
        backupAllCancelled = true;
        document.getElementById('backup-all-cancel-btn').style.display = 'none';
    });
}

function closeBackupAllModal() {
    if (backupAllInProgress) {
        showConfirmationModal('Backup operation is still in progress. Are you sure you want to close? The operation will continue in the background.', () => {
            document.getElementById('backup-all-modal').style.display = 'none';
        });
    } else {
        document.getElementById('backup-all-modal').style.display = 'none';
    }
}

// Close modal
function closeModal() {
    document.getElementById('details-modal').style.display = 'none';
    document.getElementById('backup-modal').style.display = 'none';
    currentContainerId = null;
}

// Load backups
async function loadBackups() {
    const errorEl = document.getElementById('backups-error');
    const backupsList = document.getElementById('backups-list');
    const backupsSpinner = document.getElementById('backups-spinner');
    const backupsWrapper = document.getElementById('backups-table-wrapper');
    
    errorEl.style.display = 'none';
    backupsList.innerHTML = '';
    
    // Show spinner and prevent scrollbars
    if (backupsSpinner) backupsSpinner.style.display = 'flex';
    if (backupsWrapper) backupsWrapper.style.overflow = 'hidden';
    
    try {
        const response = await fetch('/api/backups');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load backups');
        }
        
        if (data.backups.length === 0) {
            backupsList.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">No backups found</td></tr>';
        } else {
            data.backups.forEach(backup => {
                const row = createBackupRow(backup);
                backupsList.appendChild(row);
            });
        }
        
    } catch (error) {
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (backupsSpinner) backupsSpinner.style.display = 'none';
        if (backupsWrapper) backupsWrapper.style.overflow = '';
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
    
    // Build type display
    const typeDisplay = backupType === 'network' 
        ? '<span style="color: #667eea;">🌐 Network</span>' 
        : '<span style="color: #10b981;">📦 Container</span>';
    
    // Build actions column
    const actionsHtml = `
        <div class="btn-group" style="display: flex; gap: 4px; flex-wrap: nowrap;">
            <a href="/api/download/${backup.filename}" class="btn btn-success btn-sm" title="Download backup"><i class="ph ph-download-simple"></i> Download</a>
            ${backupType === 'container'
                ? `<button class="btn btn-primary btn-sm" onclick="showRestoreModal('${escapeHtml(backup.filename)}')" title="Restore container backup"><i class="ph ph-upload-simple"></i> Restore</button>`
                : `<button class="btn btn-primary btn-sm" onclick="restoreNetworkBackup('${escapeHtml(backup.filename)}')" title="Restore network backup"><i class="ph ph-upload-simple"></i> Restore</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="deleteBackup('${escapeHtml(backup.filename)}')" title="Delete backup"><i class="ph ph-trash"></i> Delete</button>
        </div>
    `;
    
    tr.innerHTML = `
        <td>
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(backup.filename)}</div>
        </td>
        <td>
            ${typeDisplay}
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
    
    return tr;
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

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    statusEl.innerHTML = `Starting upload for ${files.length} file(s)...`;

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

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const itemEl = document.getElementById(`upload-item-${i}`);
        const statusBadge = itemEl.querySelector('.status-badge');

        statusEl.innerHTML = `Uploading file ${i + 1} of ${files.length}: <strong>${escapeHtml(file.name)}</strong>`;
        statusBadge.textContent = 'Uploading...';
        statusBadge.className = 'status-badge uploading';
        itemEl.style.borderColor = 'var(--secondary)';

        if (!file.name.endsWith('.tar.gz')) {
            errorCount++;
            statusBadge.textContent = 'Skipped (not a .tar.gz)';
            statusBadge.className = 'status-badge skipped';
            itemEl.style.borderColor = 'var(--warning)';
            continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/api/upload-backup', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `Upload failed`);
            }
            successCount++;
            statusBadge.textContent = 'Success';
            statusBadge.className = 'status-badge success';
            itemEl.style.borderColor = 'var(--accent)';
        } catch (error) {
            errorCount++;
            statusBadge.textContent = `Error: ${error.message}`;
            statusBadge.className = 'status-badge error';
            itemEl.style.borderColor = 'var(--danger)';
        }
    }

    statusEl.innerHTML = `✅ Upload complete. ${successCount} succeeded, ${errorCount} failed.`;
    closeBtn.style.display = 'block';
    event.target.value = ''; // Reset file input
    loadBackups();
}

function closeUploadProgressModal() {
    const modal = document.getElementById('upload-progress-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Show restore modal
let currentRestoreFilename = null;
let currentRestorePreview = null;

async function showRestoreModal(filename) {
    currentRestoreFilename = filename;
    document.getElementById('restore-filename').textContent = filename;
    document.getElementById('restore-content').style.display = 'block';
    document.getElementById('restore-progress').style.display = 'none';
    
    // Show loading spinner, hide options and buttons during preview load
    const restoreLoading = document.getElementById('restore-loading');
    const restoreOptions = document.getElementById('restore-options');
    const modalActions = document.getElementById('restore-modal-actions');
    
    // Show spinner using backup-progress class (same style as restore-progress)
    restoreLoading.className = 'backup-progress';
    restoreLoading.style.display = 'block';
    restoreLoading.style.textAlign = 'center';
    restoreLoading.style.padding = '60px 20px';
    restoreLoading.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div><p style="margin-top: 20px;">Loading backup preview...</p>';
    restoreOptions.style.display = 'none';
    if (modalActions) modalActions.style.display = 'none';
    
    document.getElementById('restore-modal').style.display = 'block';
    
    try {
        // Fetch backup preview
        const response = await fetch(`/api/backup/${filename}/preview`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load backup preview');
        }
        
        currentRestorePreview = data;
        
        // Populate volumes section
        const volumesListEl = document.getElementById('restore-volumes-list');
        const volumesSectionEl = document.getElementById('restore-volumes-section');
        const overwriteCheckbox = document.getElementById('restore-overwrite-volumes');
        
        if (data.volumes && data.volumes.length > 0) {
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
                // Volumes exist - user can choose to overwrite or not
                overwriteCheckbox.checked = false; // Default to not overwrite
                overwriteCheckbox.disabled = false; // User can change
            } else {
                // No volumes exist - always restore (no choice needed)
                overwriteCheckbox.checked = true; // Default to restore
                overwriteCheckbox.disabled = true; // User cannot change
            }
        } else {
            volumesSectionEl.style.display = 'none';
        }
        
        // Populate ports section
        const portsListEl = document.getElementById('restore-ports-list');
        const portsSectionEl = document.getElementById('restore-ports-section');
        
        if (data.port_mappings && data.port_mappings.length > 0) {
            portsSectionEl.style.display = 'block';
            let portsHtml = '';
            data.port_mappings.forEach(port => {
                portsHtml += `
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; align-items: center;">
                        <div style="font-family: monospace; background: var(--bg-card); padding: 8px; border-radius: 4px; border: 1px solid var(--border); text-align: center; color: var(--text-primary);">${escapeHtml(port.container_port)}</div>
                        <input type="text" class="restore-port-input" data-container-port="${escapeHtml(port.container_port)}" value="${escapeHtml(port.host_port)}" placeholder="e.g. 8080" style="background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary); padding: 8px; border-radius: 4px; font-family: monospace;">
                    </div>
                `;
            });
            portsListEl.innerHTML = portsHtml;
        } else {
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
    document.getElementById('restore-modal').style.display = 'none';
    currentRestoreFilename = null;
    currentRestorePreview = null;
    // Reset modal state for next open
    const restoreLoading = document.getElementById('restore-loading');
    const restoreOptions = document.getElementById('restore-options');
    const modalActions = document.getElementById('restore-modal-actions');
    restoreLoading.style.display = 'none';
    restoreLoading.className = 'backup-progress'; // Restore original class
    restoreLoading.style.textAlign = 'center';
    restoreLoading.style.padding = '60px 20px';
    restoreLoading.innerHTML = '<div class="spinner" style="margin: 0 auto;"></div><p style="margin-top: 20px;">Loading backup preview...</p>'; // Restore original content
    restoreOptions.style.display = 'none';
    if (modalActions) modalActions.style.display = 'flex'; // Reset to visible for next open
}

async function submitRestore() {
    if (!currentRestoreFilename) {
        return;
    }
    
    // Get volume overwrite option
    const overwriteVolumes = document.getElementById('restore-overwrite-volumes').checked;
    
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
    
    // Hide options, show progress
    document.getElementById('restore-content').style.display = 'none';
    const restoreProgressEl = document.getElementById('restore-progress');
    restoreProgressEl.style.display = 'block';
    
    restoreProgressEl.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 200px;">
            <div class="spinner" style="margin: 0 auto;"></div>
            <p style="margin-top: 20px;"><strong>Restoring container...</strong></p>
            <p style="font-size: 0.9em; color: #cbd5e1; margin-top: 10px;">This may take a while for large backups.</p>
        </div>
    `;
    
    try {
        const response = await fetch('/api/restore-backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: currentRestoreFilename,
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
            // Handle other conflict errors
            if (response.status === 409) {
                throw new Error(`Conflict: ${data.error || 'Container name already exists'}`);
            }
            throw new Error(data.error || 'Restore failed');
        }
        
        // Success - update UI
        const restoreProgressEl = document.getElementById('restore-progress');
        if (restoreProgressEl) {
            restoreProgressEl.innerHTML = `
                <div class="success-message">
                    <h3>✅ Container Restored Successfully!</h3>
                    <p>Container name: <strong>${escapeHtml(data.container_name || 'Unknown')}</strong></p>
                    ${data.container_id ? `<p>Container ID: <strong>${escapeHtml(data.container_id)}</strong></p>` : ''}
                    <p>Refreshing containers list...</p>
                </div>
            `;
        }
        
        // Immediately switch to containers tab and refresh (with error handling)
        try {
            showTab('containers');
        } catch (tabError) {
            console.error('Error switching to containers tab:', tabError);
        }
        
        // Refresh containers with retries
        const refreshContainers = async (retries = 3) => {
            try {
                await loadContainers();
            } catch (loadError) {
                console.error('Error loading containers:', loadError);
                if (retries > 0) {
                    setTimeout(() => refreshContainers(retries - 1), 1000);
                }
            }
        };
        
        // Refresh immediately
        refreshContainers();
        
        // Refresh again after delays to ensure container appears
        setTimeout(() => refreshContainers(), 1000);
        setTimeout(() => refreshContainers(), 3000);
        
        // Close modal after showing success message
        setTimeout(() => {
            try {
                closeRestoreModal();
            } catch (closeError) {
                console.error('Error closing modal:', closeError);
            }
        }, 3000);
        
    } catch (error) {
        console.error('Restore error:', error);
        const restoreProgressEl = document.getElementById('restore-progress');
        if (restoreProgressEl) {
            restoreProgressEl.innerHTML = `
                <div class="error">
                    <h3>❌ Restore Failed</h3>
                    <p>${escapeHtml(error && error.message ? error.message : 'Unknown error occurred')}</p>
                    <p style="margin-top: 10px; font-size: 0.9em; color: #666;">
                        Note: The container may have been created successfully. Please check the containers tab.
                    </p>
                    <div style="margin-top: 15px;">
                        <button class="btn btn-primary btn-sm" onclick="showTab('containers'); loadContainers(); closeRestoreModal();" style="margin-right: 10px;">Check Containers</button>
                        <button class="btn btn-secondary btn-sm" onclick="closeRestoreModal()">Close</button>
                    </div>
                </div>
            `;
        } else {
            // Fallback if element doesn't exist
            console.error(`Restore Failed: ${error && error.message ? error.message : 'Unknown error occurred'}\n\nThe container may have been created - please check the containers tab.`);
            try {
                closeRestoreModal();
            } catch (e) {
                console.error('Error closing modal:', e);
            }
        }
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal when clicking outside
window.onclick = function(event) {
    // Safety check: ensure event exists
    if (!event || !event.target) {
        return;
    }
    
    const detailsModal = document.getElementById('details-modal');
    const backupModal = document.getElementById('backup-modal');
    const restoreModal = document.getElementById('restore-modal');
    const envCheckModal = document.getElementById('env-check-modal');
    const backupAllModal = document.getElementById('backup-all-modal');
    
    if (event.target === detailsModal) {
        detailsModal.style.display = 'none';
    }
    if (event.target === backupModal) {
        backupModal.style.display = 'none';
    }
    if (event.target === restoreModal) {
        restoreModal.style.display = 'none';
    }
    if (event.target === envCheckModal) {
        envCheckModal.style.display = 'none';
    }
    if (event.target === backupAllModal && !backupAllInProgress) {
        backupAllModal.style.display = 'none';
    }
    if (event.target === document.getElementById('attach-console-modal')) {
        closeAttachConsoleModal();
    }
    if (event.target === document.getElementById('logs-modal')) {
        closeLogsModal();
    }
    if (event.target === document.getElementById('download-all-modal')) {
        closeDownloadAllModal();
    }
    if (event.target === document.getElementById('upload-progress-modal')) {
        closeUploadProgressModal();
    }
    if (event.target === document.getElementById('confirmation-modal')) {
        closeConfirmationModal();
    }
}

// Container management functions
async function startContainer(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/start`, {
            method: 'POST',
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to start container');
        }
        
        // Small delay to ensure Docker has processed the change
        setTimeout(() => {
            loadContainers();
        }, 300);
    } catch (error) {
        console.error(`Error starting container: ${error.message}`);
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
        
        // Small delay to ensure Docker has processed the change
        setTimeout(() => {
            loadContainers();
        }, 300);
    } catch (error) {
        console.error(`Error restarting container: ${error.message}`);
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
        
        // Small delay to ensure Docker has processed the change
        setTimeout(() => {
            loadContainers();
        }, 300);
    } catch (error) {
        console.error(`Error stopping container: ${error.message}`);
    }
}

// Show delete options modal
async function showDeleteOptions(containerId, containerName) {
    currentContainerId = containerId;
    
    // Check if we're deleting multiple containers
    const selectedIds = window.selectedContainerIdsForDelete || [containerId];
    const isMultiple = selectedIds.length > 1;
    
    const modal = document.getElementById('delete-container-modal');
    const modalContent = document.getElementById('delete-container-content');
    
    // Show loading state
    modalContent.innerHTML = `
        <h3 style="color: #f1f5f9;">${isMultiple ? `Delete ${selectedIds.length} Containers` : `Delete Container: ${escapeHtml(containerName)}`}</h3>
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
    
    // Build info about what will be deleted
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
        ? `Delete ${selectedIds.length} Containers`
        : `Delete Container: ${escapeHtml(containerName)}`;
    const buttonText = isMultiple 
        ? `🗑️ Delete ${selectedIds.length} Containers`
        : `🗑️ Delete Container`;
    
    // Build volumes checkboxes
    let volumesHtml = '';
    if (hasVolumes) {
        volumesHtml = `
            <div style="margin-bottom: 15px;">
                <p style="color: var(--text-primary); margin-bottom: 10px; font-weight: 600;">Select volumes to delete:</p>
                <div style="max-height: 200px; overflow-y: auto; padding: 10px; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border);">
                    ${volumesList.map((volume, index) => `
                        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: pointer;">
                            <input type="checkbox" class="volume-checkbox-item" data-volume="${escapeHtml(volume)}" checked style="width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;">
                            <span style="color: var(--text-primary); font-family: monospace; font-size: 0.9em;">${escapeHtml(volume)}</span>
                        </label>
                    `).join('')}
                </div>
                <p style="color: var(--warning); font-size: 0.85em; margin-top: 8px; margin-bottom: 0;">⚠️ Selected volumes will be permanently deleted!</p>
            </div>
        `;
    } else {
        volumesHtml = '<p style="color: var(--text-secondary); margin-bottom: 15px;">No volumes to delete</p>';
    }
    
    // Build images checkboxes
    let imagesHtml = '';
    if (hasImage) {
        imagesHtml = `
            <div>
                <p style="color: var(--text-primary); margin-bottom: 10px; font-weight: 600;">Select images to delete:</p>
                <div style="max-height: 200px; overflow-y: auto; padding: 10px; background: var(--bg-card); border-radius: 4px; border: 1px solid var(--border);">
                    ${imagesList.map((image, index) => `
                        <label style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; cursor: pointer;">
                            <input type="checkbox" class="image-checkbox-item" data-image="${escapeHtml(image)}" checked style="width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;">
                            <span style="color: var(--text-primary); font-family: monospace; font-size: 0.9em;">${escapeHtml(image)}</span>
                        </label>
                    `).join('')}
                </div>
                <p style="color: var(--warning); font-size: 0.85em; margin-top: 8px; margin-bottom: 0;">⚠️ Selected images will be permanently deleted!</p>
            </div>
        `;
    } else {
        imagesHtml = '<p style="color: var(--text-secondary);">No images to delete</p>';
    }
    
    modalContent.innerHTML = `
        <h3 style="color: #f1f5f9;">${titleText}</h3>
        ${infoHtml}
        <div style="margin: 20px 0; padding: 15px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 8px;">
            <p style="color: var(--text-primary); margin-bottom: 15px; font-weight: 600;">Additional options ${isMultiple ? '(select which volumes/images to delete)' : ''}:</p>
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

// Close delete container modal
function closeDeleteContainerModal() {
    document.getElementById('delete-container-modal').style.display = 'none';
}

// Attach Console Functions
let term = null;
let fitAddon = null;
let containerCwd = {}; // Track working directory per container

function openAttachConsole(containerId, containerName) {
    const modal = document.getElementById('attach-console-modal');
    document.getElementById('console-container-name').textContent = containerName;
    modal.style.display = 'block';

    // Wait for modal to be visible before initializing terminal
    setTimeout(() => {
        if (term) {
            term.dispose();
        }

        const terminalContainer = document.getElementById('terminal-container');
        terminalContainer.innerHTML = '';

        term = new Terminal({
            cursorBlink: true,
            theme: {
                background: '#0a0f1c',
                foreground: '#f1f5f9',
                selection: '#3b82f6'
            },
            fontFamily: 'SF Mono, Monaco, Consolas, "Courier New", monospace',
            fontSize: 14,
            convertEol: true
        });
        
        // Initialize fit addon if available
        if (typeof FitAddon !== 'undefined') {
            fitAddon = new FitAddon.FitAddon();
            term.loadAddon(fitAddon);
        }
        
        term.open(terminalContainer);
        
        if (fitAddon) {
            fitAddon.fit();
        }

        term.writeln('\x1b[1;32mWelcome to Container Monkey Console\x1b[0m');
        term.writeln('Connected to: ' + containerName);
        term.writeln('Type "exit" to close this session.');
        term.writeln('');
        
        const currentDir = containerCwd[containerId] ? containerCwd[containerId].split('/').pop() || '/' : '';
        const prompt = currentDir ? `${currentDir} $ ` : '$ ';
        term.write(`\r\n${prompt}`);

        let currentLine = '';

        term.onData(e => {
            switch (e) {
                case '\r': // Enter
                    term.write('\r\n');
                    if (currentLine.trim()) {
                        if (currentLine.trim() === 'exit') {
                            closeAttachConsoleModal();
                        } else if (currentLine.trim() === 'clear') {
                            term.clear();
                            const currentDir = containerCwd[containerId] ? containerCwd[containerId].split('/').pop() || '/' : '';
                            const prompt = currentDir ? `${currentDir} $ ` : '$ ';
                            term.write(prompt);
                        } else {
                            executeCommand(containerId, currentLine);
                        }
                    } else {
                        const currentDir = containerCwd[containerId] ? containerCwd[containerId].split('/').pop() || '/' : '';
                        const prompt = currentDir ? `${currentDir} $ ` : '$ ';
                        term.write(prompt);
                    }
                    currentLine = '';
                    break;
                case '\u007F': // Backspace (DEL)
                    if (currentLine.length > 0) {
                        term.write('\b \b');
                        currentLine = currentLine.substring(0, currentLine.length - 1);
                    }
                    break;
                case '\u0003': // Ctrl+C
                    const currentDir = containerCwd[containerId] ? containerCwd[containerId].split('/').pop() || '/' : '';
                    const prompt = currentDir ? `${currentDir} $ ` : '$ ';
                    term.write(`^C\r\n${prompt}`);
                    currentLine = '';
                    break;
                default:
                    // Simple printable character check
                    if (e.length === 1 && e.charCodeAt(0) >= 32) {
                        currentLine += e;
                        term.write(e);
                    }
            }
        });
        
        // Handle window resize
        window.addEventListener('resize', handleResize);
    }, 100);
}

function handleResize() {
    if (fitAddon) {
        fitAddon.fit();
    }
}

async function executeCommand(containerId, command) {
    let cmdToExec = command;
    const isCd = command.trim().startsWith('cd ');
    let currentDir = containerCwd[containerId] || '';

    // Handle cd command to maintain pseudo-state of working directory
    if (isCd) {
        const targetDir = command.trim().substring(3).trim();
        if (targetDir) {
            if (currentDir) {
                cmdToExec = `cd "${currentDir}" && cd "${targetDir}" && pwd`;
            } else {
                cmdToExec = `cd "${targetDir}" && pwd`;
            }
        }
    } else {
        // Prepend current working directory
        if (currentDir) {
            cmdToExec = `cd "${currentDir}" && ${command}`;
        }
    }

    try {
        const response = await fetch(`/api/container/${containerId}/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ command: cmdToExec })
        });
        
        const data = await response.json();
        
        if (data.exit_code === 0) {
            if (isCd) {
                // If cd was successful, update our cwd tracker
                containerCwd[containerId] = data.output.trim();
            } else if (data.output) {
                // Fix newlines for terminal (LF -> CRLF)
                const output = data.output.replace(/\n/g, '\r\n');
                term.write(output);
                // Ensure we end on a new line if output didn't have one
                if (!output.endsWith('\r\n')) {
                    term.write('\r\n');
                }
            }
        } else {
            // Command failed
            if (data.output) {
                term.write(data.output.replace(/\n/g, '\r\n'));
                if (!data.output.endsWith('\r\n')) {
                    term.write('\r\n');
                }
            } else if (data.error) {
                term.write(`\x1b[1;31mError: ${data.error}\x1b[0m\r\n`);
            }
        }
    } catch (e) {
        term.write(`\x1b[1;31mConnection error: ${e.message}\x1b[0m\r\n`);
    }
    
    // Update prompt
    const displayDir = containerCwd[containerId] ? containerCwd[containerId].split('/').pop() || '/' : '';
    const prompt = displayDir ? `${displayDir} $ ` : '$ ';
    term.write(prompt);
}

function closeAttachConsoleModal() {
    document.getElementById('attach-console-modal').style.display = 'none';
    if (term) {
        term.dispose();
        term = null;
    }
    window.removeEventListener('resize', handleResize);
}

// Delete container with options from checkboxes
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
        ? `Delete ${selectedIds.length} selected containers?`
        : `Delete container "${containerName}"?`;
    const warnings = [];
    
    if (selectedVolumes.size > 0) {
        warnings.push(`- ${selectedVolumes.size} volume(s): ${Array.from(selectedVolumes).join(', ')}`);
    }
    if (selectedImages.size > 0) {
        warnings.push(`- ${selectedImages.size} image(s): ${Array.from(selectedImages).join(', ')}`);
    }
    
    if (warnings.length > 0) {
        confirmMessage += `\n\n⚠️  WARNING: This will also permanently delete:\n${warnings.join('\n')}`;
    } else {
        confirmMessage += `\n\nThis will stop and remove the container(s) only. Volumes and images will be kept.`;
    }
    
    confirmMessage += `\n\nThis action cannot be undone!`;
    
    showConfirmationModal(confirmMessage, async () => {
    
    try {
        let totalDeletedVolumes = [];
        let totalDeletedImages = new Set();
        
        // First, delete all selected containers (without volumes/images)
        for (const id of selectedIds) {
            try {
                const response = await fetch(`/api/container/${id}/delete`, {
                    method: 'DELETE',
                });
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || `Failed to delete container ${id}`);
                }
            } catch (error) {
                console.error(`Error deleting container ${id}: ${error.message}`);
            }
        }
        
        // Then delete selected volumes individually
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
                console.error('Error deleting volumes:', err);
            }
        }
        
        // Finally, delete selected images individually
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
                            console.log(`Image deletion failed for ${imageName} (non-critical):`, err);
                        }
                    }
                }
            } catch (err) {
                console.error('Error deleting images:', err);
            }
        }
        
        closeDeleteContainerModal();
        window.selectedContainerIdsForDelete = null; // Clear stored IDs
        
        let successMessage = isMultiple 
            ? `${selectedIds.length} containers deleted`
            : 'Container deleted';
        if (totalDeletedVolumes.length > 0) {
            successMessage += ` | Deleted ${totalDeletedVolumes.length} volume(s): ${totalDeletedVolumes.join(', ')}`;
        }
        if (totalDeletedImages.size > 0) {
            successMessage += ` | Deleted ${totalDeletedImages.size} image(s)`;
        }
        
        console.log(successMessage);
        loadContainers();
        // Also refresh networks, volumes, and images since deleting containers affects them
        loadNetworks();
        loadVolumes();
        loadImages();
        resetSelection();
    } catch (error) {
        console.error(`Error deleting containers: ${error.message}`);
    }
    });
}


async function deleteBackup(filename) {
    showConfirmationModal(`Delete backup "${filename}"?\n\nThis action cannot be undone.`, async () => {
    
    try {
        const response = await fetch(`/api/backup/${filename}`, {
            method: 'DELETE',
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete backup');
        }
        
        loadBackups();
    } catch (error) {
        console.error(`Error deleting backup: ${error.message}`);
    }
    });
}

// Download all backups
async function downloadAllBackups() {
    console.log('downloadAllBackups called');
    const modal = document.getElementById('download-all-modal');
    const statusEl = document.getElementById('download-all-status');
    const listEl = document.getElementById('download-all-list');
    const closeBtn = document.getElementById('download-all-close-btn');

    if (!modal || !statusEl || !listEl || !closeBtn) {
        console.error('Modal elements not found:', { modal, statusEl, listEl, closeBtn });
        console.error('Error: Modal elements not found. Please refresh the page.');
        return;
    }

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    statusEl.innerHTML = 'Preparing...';
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-light);">Loading files...</div>';

    try {
        // Step 1: Prepare and get file list
        const prepareResponse = await fetch('/api/backups/download-all-prepare', {
            method: 'POST'
        });

        if (!prepareResponse.ok) {
            const data = await prepareResponse.json();
            throw new Error(data.error || 'Failed to prepare download');
        }

        const prepareData = await prepareResponse.json();
        const sessionId = prepareData.session_id;
        const files = prepareData.files;
        const total = prepareData.total;

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

        statusEl.innerHTML = `Archiving ${total} file(s)...`;

        // Step 2: Start archive creation
        const createResponse = await fetch(`/api/backups/download-all-create/${sessionId}`, {
            method: 'POST'
        });

        if (!createResponse.ok) {
            const data = await createResponse.json();
            throw new Error(data.error || 'Failed to create archive');
        }

        // Flag to prevent multiple downloads
        let downloadTriggered = false;

        // Step 3: Poll for progress
        const progressInterval = setInterval(async () => {
            try {
                const progressResponse = await fetch(`/api/backups/download-all-progress/${sessionId}`);
                if (!progressResponse.ok) {
                    clearInterval(progressInterval);
                    return;
                }

                const progress = await progressResponse.json();

                // Update status
                if (progress.status === 'archiving') {
                    statusEl.innerHTML = `Archiving: ${progress.completed} / ${progress.total} files`;
                    
                    // Update current file
                    if (progress.current_file) {
                        const fileIndex = files.indexOf(progress.current_file);
                        if (fileIndex >= 0) {
                            const fileEl = document.getElementById(`download-file-${fileIndex}`);
                            if (fileEl) {
                                fileEl.innerHTML = `
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <div>
                                            <strong style="color: var(--text-primary);">${escapeHtml(progress.current_file)}</strong>
                                            <span style="color: var(--secondary); font-size: 0.9em; margin-left: 10px;">⏳ Archiving...</span>
                                        </div>
                                    </div>
                                `;
                                fileEl.style.borderLeftColor = 'var(--secondary)';
                            }
                        }
                    }

                    // Update completed files
                    for (let i = 0; i < progress.completed; i++) {
                        const fileEl = document.getElementById(`download-file-${i}`);
                        if (fileEl && files[i] !== progress.current_file) {
                            fileEl.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong style="color: var(--text-primary);">${escapeHtml(files[i])}</strong>
                                        <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Added</span>
                                    </div>
                                </div>
                            `;
                            fileEl.style.borderLeftColor = 'var(--accent)';
                        }
                    }
                } else if (progress.status === 'complete') {
                    // Clear interval first to prevent race conditions
                    clearInterval(progressInterval);
                    
                    // Prevent multiple downloads
                    if (downloadTriggered) {
                        return;
                    }
                    downloadTriggered = true;
                    
                    // Update all files as completed
                    files.forEach((filename, index) => {
                        const fileEl = document.getElementById(`download-file-${index}`);
                        if (fileEl) {
                            fileEl.innerHTML = `
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                        <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Added</span>
                                    </div>
                                </div>
                            `;
                            fileEl.style.borderLeftColor = 'var(--accent)';
                        }
                    });

                    statusEl.innerHTML = '✅ Archive file created! Starting download...';

                    // Step 4: Download the file
                    const downloadUrl = `/api/backups/download-all/${sessionId}`;
                    const a = document.createElement('a');
                    a.style.display = 'none';
                    a.href = downloadUrl;
                    a.setAttribute('download', progress.archive_filename || 'all_backups.tar.gz');
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    statusEl.innerHTML = '✅ Download complete!';
                    closeBtn.style.display = 'block';
                } else if (progress.status === 'error') {
                    clearInterval(progressInterval);
                    throw new Error('Failed to create archive file');
                }
            } catch (error) {
                clearInterval(progressInterval);
                console.error('Progress polling error:', error);
            }
        }, 200); // Poll every 200ms

        // Timeout after 30 minutes (for large archives)
        setTimeout(() => {
            clearInterval(progressInterval);
            if (!downloadTriggered) {
                statusEl.innerHTML = '❌ Archive creation timed out (30 minutes). Please try again with fewer files.';
                closeBtn.style.display = 'block';
            }
        }, 1800000); // 30 minutes

    } catch (error) {
        statusEl.innerHTML = `❌ Error: ${escapeHtml(error.message)}`;
        listEl.innerHTML = '';
        closeBtn.style.display = 'block';
    }
}

function closeDownloadAllModal() {
    document.getElementById('download-all-modal').style.display = 'none';
}

// Delete all backups
async function deleteAllBackups() {
    showConfirmationModal('Are you sure you want to DELETE ALL BACKUPS?\n\nThis will permanently remove ALL backup files (containers and networks).\n\nThis action CANNOT be undone!', () => {
        showConfirmationModal('Please confirm again: DELETE ALL BACKUPS?', async () => {
    
    try {
        const response = await fetch('/api/backups/delete-all', {
            method: 'DELETE',
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete all backups');
        }
        
        loadBackups();
    } catch (error) {
        console.error(`Error deleting all backups: ${error.message}`);
    }
        });
    });
}

// Logs Modal Functions
// Store current container ID for logs refresh
let currentLogsContainerId = null;

async function showLogs(containerId, containerName) {
    const modal = document.getElementById('logs-modal');
    const logsContainer = document.getElementById('logs-container');
    const containerNameEl = document.getElementById('logs-container-name');

    currentLogsContainerId = containerId;
    containerNameEl.textContent = containerName;
    logsContainer.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';
    modal.style.display = 'block';

    await loadLogsContent(containerId, logsContainer);
}

async function loadLogsContent(containerId, logsContainer) {
    try {
        const response = await fetch(`/api/container/${containerId}/logs`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load logs');
        }

        logsContainer.textContent = data.logs || 'No logs found.';
        // Scroll to the bottom
        setTimeout(() => {
            logsContainer.scrollTop = logsContainer.scrollHeight;
        }, 100);
    } catch (error) {
        logsContainer.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

async function refreshLogs() {
    if (!currentLogsContainerId) {
        return;
    }

    const logsContainer = document.getElementById('logs-container');
    const refreshBtn = document.getElementById('refresh-logs-btn');
    
    // Disable button and show loading state
    refreshBtn.disabled = true;
    const originalHtml = refreshBtn.innerHTML;
    refreshBtn.innerHTML = '<i class="ph ph-arrows-clockwise" style="animation: spin 1s linear infinite;"></i> Refreshing...';
    
    try {
        await loadLogsContent(currentLogsContainerId, logsContainer);
    } finally {
        // Re-enable button
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = originalHtml;
    }
}

function closeLogsModal() {
    document.getElementById('logs-modal').style.display = 'none';
    currentLogsContainerId = null;
}

// Load volumes
async function loadVolumes() {
    const errorEl = document.getElementById('volumes-error');
    const volumesList = document.getElementById('volumes-list');
    const volumesSpinner = document.getElementById('volumes-spinner');
    const volumesWrapper = document.getElementById('volumes-table-wrapper');
    
    errorEl.style.display = 'none';
    volumesList.innerHTML = '';
    
    // Show spinner and prevent scrollbars
    if (volumesSpinner) volumesSpinner.style.display = 'flex';
    if (volumesWrapper) volumesWrapper.style.overflow = 'hidden';
    
    try {
        const response = await fetch('/api/volumes');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load volumes');
        }
        
        if (data.volumes.length === 0) {
            volumesList.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #666;">No volumes found</td></tr>';
        } else {
            data.volumes.forEach(volume => {
                const row = createVolumeRow(volume);
                volumesList.appendChild(row);
            });
        }
        
    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (volumesSpinner) volumesSpinner.style.display = 'none';
        if (volumesWrapper) volumesWrapper.style.overflow = '';
    }
}

// Create volume row
function createVolumeRow(volume) {
    const tr = document.createElement('tr');
    tr.className = 'volume-row';
    tr.style.cursor = 'pointer';
    tr.onclick = (event) => toggleVolumeSelection(event, tr);

    const createdDate = volume.created ? new Date(volume.created).toLocaleString() : 'Unknown';

    tr.innerHTML = `
        <td class="checkbox-cell">
            <input type="checkbox" class="volume-checkbox" data-volume-name="${escapeHtml(volume.name)}" onclick="event.stopPropagation(); handleVolumeCheckboxClick(this);" ${volume.is_self ? 'disabled' : ''}>
        </td>
        <td>
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(volume.name)} ${volume.is_self ? '<span style="color: #999; font-size: 0.8em;">(self)</span>' : ''}</div>
            ${volume.in_use && !volume.is_self && volume.containers && volume.containers.length > 0 ? `<div style="font-size: 0.8em; color: #999; margin-top: 4px;"><em>In use by ${volume.containers.map(c => `<a href="#" onclick="event.stopPropagation(); viewContainerByName('${escapeHtml(c)}'); return false;" style="color: var(--secondary); text-decoration: underline; cursor: pointer;">${escapeHtml(c)}</a>`).join(', ')}</em></div>` : ''}
        </td>
        <td>
            <div style="color: var(--text-secondary);">${escapeHtml(volume.driver)}</div>
        </td>
        <td>
            <div style="font-family: monospace; color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(volume.mountpoint || 'N/A')}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">${createdDate}</div>
        </td>
        <td>
           <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(volume.size)}</div>
       </td>
        <td>
            <div class="btn-group">
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); exploreVolume('${escapeHtml(volume.name)}')" title="Explore Files">
                    <i class="ph ph-magnifying-glass"></i> Explore
                </button>
            </div>
        </td>
    `;

    return tr;
}

// Explore volume files
let currentVolumeName = null;
let currentVolumePath = '/';

async function exploreVolume(volumeName, path = '/') {
    currentVolumeName = volumeName;
    currentVolumePath = path;
    
    // Show modal
    const modal = document.getElementById('volume-explore-modal');
    const modalTitle = document.getElementById('volume-explore-title');
    const fileList = document.getElementById('volume-file-list');
    const loadingEl = document.getElementById('volume-explore-loading');
    
    modalTitle.textContent = `Exploring: ${volumeName}`;
    modal.style.display = 'block';
    loadingEl.style.display = 'flex';
    fileList.innerHTML = '';
    
    try {
        const response = await fetch(`/api/volume/${encodeURIComponent(volumeName)}/explore?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to explore volume');
        }
        
        loadingEl.style.display = 'none';
        
        // Debug logging
        console.log('Volume exploration response:', data);
        console.log('Files found:', data.files ? data.files.length : 0);
        
        // Show breadcrumb
        const breadcrumb = document.createElement('div');
        breadcrumb.className = 'volume-breadcrumb';
        breadcrumb.style.cssText = 'margin-bottom: 15px; padding: 10px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #cbd5e1;';
        
        const pathParts = path.split('/').filter(p => p);
        let breadcrumbHtml = '<a href="#" onclick="exploreVolume(\'' + escapeHtml(volumeName) + '\', \'/\'); return false;" style="color: #3b82f6; text-decoration: none;">📁 Root</a>';
        let currentPath = '';
        pathParts.forEach((part, index) => {
            currentPath += '/' + part;
            breadcrumbHtml += ' <span style="color: #94a3b8;">/</span> <a href="#" onclick="exploreVolume(\'' + escapeHtml(volumeName) + '\', \'' + escapeHtml(currentPath) + '\'); return false;" style="color: #3b82f6; text-decoration: none;">' + escapeHtml(part) + '</a>';
        });
        breadcrumb.innerHTML = breadcrumbHtml;
        fileList.appendChild(breadcrumb);
        
        // Show files
        console.log('Processing files:', data.files);
        if (data.files && data.files.length > 0) {
            console.log(`Displaying ${data.files.length} files`);
            data.files.forEach(file => {
                console.log('File:', file);
                const fileItem = document.createElement('div');
                fileItem.className = 'volume-file-item';
                fileItem.style.cssText = 'padding: 12px; margin: 5px 0; background: #1e293b; border: 1px solid #334155; border-radius: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; transition: all 0.2s ease;';
                fileItem.onmouseover = function() { this.style.background = '#334155'; this.style.borderColor = '#3b82f6'; };
                fileItem.onmouseout = function() { this.style.background = '#1e293b'; this.style.borderColor = '#334155'; };
                
                const icon = file.type === 'directory' ? '📁' : '📄';
                const size = file.size ? ` (${file.size} bytes)` : '';
                
                fileItem.innerHTML = `
                    <div onclick="${file.type === 'directory' ? `exploreVolume('${escapeHtml(volumeName)}', '${escapeHtml(file.path)}')` : `viewVolumeFile('${escapeHtml(volumeName)}', '${escapeHtml(file.path)}')`}" style="color: #f1f5f9; flex: 1; display: flex; align-items: center;">
                        <strong style="color: #f1f5f9;">${icon} ${escapeHtml(file.name)}</strong>
                        ${file.type === 'file' ? `<span style="color: #94a3b8; margin-left: 10px; font-size: 0.9em;">${size}</span>` : ''}
                    </div>
                    ${file.type === 'file' ? `
                        <button onclick="event.stopPropagation(); downloadVolumeFile('${escapeHtml(volumeName)}', '${escapeHtml(file.path)}', '${escapeHtml(file.name)}')" 
                                class="btn-icon" 
                                title="Download file">
                            ⬇️
                        </button>
                    ` : ''}
                `;
                
                fileList.appendChild(fileItem);
            });
        } else {
            console.log('No files found - showing empty message');
            const emptyMsg = document.createElement('p');
            emptyMsg.style.cssText = 'text-align: center; padding: 20px; color: #94a3b8;';
            emptyMsg.textContent = 'This directory is empty';
            fileList.appendChild(emptyMsg);
        }
    } catch (error) {
        loadingEl.style.display = 'none';
        fileList.innerHTML = `<div class="error">Error: ${escapeHtml(error.message)}</div>`;
    }
}

// Download volume file
function downloadVolumeFile(volumeName, filePath, fileName) {
    const downloadUrl = `/api/volume/${encodeURIComponent(volumeName)}/download?path=${encodeURIComponent(filePath)}`;
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// View volume file contents
async function viewVolumeFile(volumeName, filePath) {
    const modal = document.getElementById('volume-file-modal');
    const modalTitle = document.getElementById('volume-file-title');
    const fileContent = document.getElementById('volume-file-content');
    const loadingEl = document.getElementById('volume-file-loading');
    
    modalTitle.textContent = `File: ${filePath}`;
    modal.style.display = 'block';
    loadingEl.style.display = 'flex';
    fileContent.innerHTML = '';
    
    try {
        const response = await fetch(`/api/volume/${encodeURIComponent(volumeName)}/file?path=${encodeURIComponent(filePath)}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to read file');
        }
        
        loadingEl.style.display = 'none';
        
        // Display file content
        const pre = document.createElement('pre');
        pre.style.cssText = 'background: #0a0f1c; color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; max-height: 500px; overflow-y: auto; border: 1px solid #334155; font-family: "SF Mono", "Monaco", "Cascadia Code", "Roboto Mono", monospace; font-size: 0.875em; line-height: 1.6;';
        pre.textContent = data.content || '(empty file)';
        fileContent.appendChild(pre);
        
        // Show file info
        const info = document.createElement('div');
        info.style.cssText = 'margin-top: 10px; padding: 12px; background: #1e293b; border: 1px solid #334155; border-radius: 8px; font-size: 0.9em; color: #cbd5e1;';
        info.innerHTML = `<strong style="color: #3b82f6;">Size:</strong> ${data.size} bytes`;
        fileContent.appendChild(info);
    } catch (error) {
        loadingEl.style.display = 'none';
        fileContent.innerHTML = `<div class="error">Error: ${escapeHtml(error.message)}</div>`;
    }
}

// Close volume explore modal
function closeVolumeExploreModal() {
    document.getElementById('volume-explore-modal').style.display = 'none';
}

// Close volume file modal
function closeVolumeFileModal() {
    document.getElementById('volume-file-modal').style.display = 'none';
}

async function deleteVolume(volumeName) {
    showConfirmationModal(`Delete volume "${volumeName}"?\n\nThis will permanently remove the volume and all its data. This action cannot be undone.`, async () => {

    try {
        const response = await fetch(`/api/volume/${volumeName}/delete`, {
            method: 'DELETE',
        });
        const data = await response.json();

        if (!response.ok) {
            // Check if volume is in use
            if (data.in_use) {
                showAlertModal(
                    `Cannot delete volume "${volumeName}"\n\n${data.message || 'This volume is currently in use by one or more containers and cannot be deleted.\n\nPlease stop and remove the containers using this volume before attempting to delete it.'}`,
                    'Volume In Use'
                );
                return;
            }
            throw new Error(data.error || 'Failed to delete volume');
        }

        console.log('Volume deleted');
        loadVolumes();
    } catch (error) {
        console.error(`Error deleting volume: ${error.message}`);
        // Check error message for "in use" pattern as fallback
        if (error.message.toLowerCase().includes('in use') || error.message.toLowerCase().includes('is being used')) {
            showAlertModal(
                `Cannot delete volume "${volumeName}"\n\nThis volume is currently in use by one or more containers and cannot be deleted.\n\nPlease stop and remove the containers using this volume before attempting to delete it.`,
                'Volume In Use'
            );
        } else {
            showAlertModal(
                `Failed to delete volume "${volumeName}"\n\n${error.message}`,
                'Error'
            );
        }
    }
    });
}

function toggleVolumeSelection(event, row) {
    // Don't toggle if clicking on a button or link
    if (event.target.closest('button') || event.target.closest('a')) {
        return;
    }
    const checkbox = row.querySelector('.volume-checkbox');
    if (checkbox) {
        // Don't toggle if checkbox is disabled (e.g., app's own volume)
        if (checkbox.disabled) {
            return;
        }
        checkbox.checked = !checkbox.checked;
        handleVolumeCheckboxClick(checkbox);
    }
}

function handleVolumeCheckboxClick(checkbox) {
    const selectedCheckboxes = document.querySelectorAll('.volume-checkbox:checked');
    const deleteBtn = document.getElementById('delete-selected-volumes-btn');
    const hasSelection = selectedCheckboxes.length > 0;

    deleteBtn.disabled = !hasSelection;
}

function toggleAllVolumeSelections(source) {
    const checkboxes = document.querySelectorAll('.volume-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
    handleVolumeCheckboxClick();
}

async function deleteSelectedVolumes() {
    const selectedCheckboxes = document.querySelectorAll('.volume-checkbox:checked');
    const volumeNames = Array.from(selectedCheckboxes).map(cb => cb.dataset.volumeName);

    if (volumeNames.length === 0) {
        console.warn('No volumes selected.');
        return;
    }

    showConfirmationModal(`Are you sure you want to delete ${volumeNames.length} selected volumes? This action cannot be undone.`, async () => {

    try {
        const response = await fetch('/api/volumes/delete', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ names: volumeNames }),
        });
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete volumes');
        }

        console.log(data.message);
        
        // Check for volumes in use
        if (data.in_use_volumes && data.in_use_volumes.length > 0) {
            const inUseList = data.in_use_volumes.join(', ');
            showAlertModal(
                `Cannot delete ${data.in_use_volumes.length} volume(s): ${inUseList}\n\nThese volumes are currently in use by one or more containers and cannot be deleted.\n\nPlease stop and remove the containers using these volumes before attempting to delete them.`,
                'Volumes In Use'
            );
        }
        
        if (data.errors && data.errors.length > 0) {
            const inUseErrors = data.errors.filter(e => e.includes('is in use'));
            const otherErrors = data.errors.filter(e => !e.includes('is in use'));
            
            if (otherErrors.length > 0) {
                console.warn(`Some volumes could not be deleted:\n${otherErrors.join('\n')}`);
            }
        }
        
        if (data.deleted_count > 0) {
            console.log(`Successfully deleted ${data.deleted_count} volume(s)`);
        }
    } catch (error) {
        console.error(`Error deleting selected volumes: ${error.message}`);
        showAlertModal(
            `Failed to delete volumes\n\n${error.message}`,
            'Error'
        );
    } finally {
        loadVolumes();
    }
    });
}
// Load images
async function loadImages() {
    const errorEl = document.getElementById('images-error');
    const imagesList = document.getElementById('images-list');
    const imagesSpinner = document.getElementById('images-spinner');
    const imagesWrapper = document.getElementById('images-table-wrapper');
    
    errorEl.style.display = 'none';
    imagesList.innerHTML = '';
    
    // Show spinner and prevent scrollbars
    if (imagesSpinner) imagesSpinner.style.display = 'flex';
    if (imagesWrapper) imagesWrapper.style.overflow = 'hidden';
    
    try {
        const response = await fetch('/api/images');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load images');
        }
        
        if (data.images.length === 0) {
            imagesList.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">No images found</td></tr>';
        } else {
            data.images.forEach(image => {
                const row = createImageRow(image);
                imagesList.appendChild(row);
            });
        }
        
    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (imagesSpinner) imagesSpinner.style.display = 'none';
        if (imagesWrapper) imagesWrapper.style.overflow = '';
    }
}

// Create image row
function createImageRow(image) {
    const tr = document.createElement('tr');
    tr.className = 'image-row';
    
    const imageName = image.name === '<none>:<none>' ? '<span style="color: var(--text-light);"><none></span>' : image.name;
    const createdDate = image.created ? new Date(image.created).toLocaleString() : 'Unknown';
    
    // Check if image is in use or is self
    // Handle both boolean true and string "true" cases
    const inUse = image.in_use === true || image.in_use === 'true' || image.in_use === 1;
    const isDisabled = image.is_self || inUse;
    const disabledReason = image.is_self ? 'self' : (inUse ? 'in_use' : '');
    
    tr.innerHTML = `
        <td class="checkbox-cell">
            <input type="checkbox" class="image-checkbox" data-image-id="${image.id}" data-in-use="${inUse ? 'true' : 'false'}" onclick="handleImageCheckboxClick(this);" ${isDisabled ? 'disabled' : ''}>
        </td>
        <td>
            <div style="font-weight: 600; color: var(--text-primary);">${imageName} ${image.is_self ? '<span style="color: #999; font-size: 0.8em;">(self)</span>' : ''}</div>
            ${image.tags && image.tags.length > 1 ? `<div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">${image.tags.join(', ')}</div>` : ''}
            ${inUse && !image.is_self && image.containers && image.containers.length > 0 ? `<div style="font-size: 0.8em; color: #999; margin-top: 4px;"><em>In use by ${image.containers.map(c => `<a href="#" onclick="event.stopPropagation(); viewContainerByName('${escapeHtml(c)}'); return false;" style="color: var(--secondary); text-decoration: underline; cursor: pointer;">${escapeHtml(c)}</a>`).join(', ')}</em></div>` : ''}
        </td>
        <td>
            <div style="font-family: monospace; color: var(--text-secondary); font-size: 0.9em; background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; display: inline-block;">${escapeHtml(image.id.substring(0, 12))}</div>
        </td>
        <td>
            <div style="color: var(--text-secondary);">${escapeHtml(image.size)}</div>
        </td>
        <td>
            <div style="font-size: 0.85em; color: var(--text-secondary);">${createdDate}</div>
        </td>
    `;
    
    return tr;
}

function handleImageCheckboxClick(checkbox) {
    const selectedCheckboxes = document.querySelectorAll('.image-checkbox:checked');
    const deleteBtn = document.getElementById('delete-selected-images-btn');
    const hasSelection = selectedCheckboxes.length > 0;
    
    // Check if any selected images are in use or are self
    let hasInUseOrSelf = false;
    if (hasSelection) {
        selectedCheckboxes.forEach(cb => {
            const inUse = cb.dataset.inUse === 'true';
            const isSelf = cb.disabled && !inUse; // If disabled but not in_use, it's self
            if (inUse || isSelf) {
                hasInUseOrSelf = true;
            }
        });
    }
    
    deleteBtn.disabled = !hasSelection || hasInUseOrSelf;
}

function toggleAllImageSelections(source) {
    const checkboxes = document.querySelectorAll('.image-checkbox');
    checkboxes.forEach(cb => {
        // Only toggle if checkbox is not disabled
        if (!cb.disabled) {
            cb.checked = source.checked;
        }
    });
    handleImageCheckboxClick();
}

async function deleteSelectedImages() {
    const selectedCheckboxes = document.querySelectorAll('.image-checkbox:checked');
    const imageIds = Array.from(selectedCheckboxes).map(cb => cb.dataset.imageId);

    if (imageIds.length === 0) {
        console.warn('No images selected.');
        return;
    }

    // Check if any selected images are in use or are self
    const inUseImages = [];
    const selfImages = [];
    selectedCheckboxes.forEach(cb => {
        const inUse = cb.dataset.inUse === 'true';
        const isSelf = cb.disabled && !inUse;
        if (inUse) {
            inUseImages.push(cb.dataset.imageId);
        } else if (isSelf) {
            selfImages.push(cb.dataset.imageId);
        }
    });

    if (inUseImages.length > 0 || selfImages.length > 0) {
        let message = 'Cannot delete selected images:\n\n';
        if (inUseImages.length > 0) {
            message += `${inUseImages.length} image(s) are currently in use by containers.\n`;
        }
        if (selfImages.length > 0) {
            message += `${selfImages.length} image(s) are system images and cannot be deleted.\n`;
        }
        message += '\nPlease remove containers using these images before attempting to delete them.';
        showAlertModal(message, 'Cannot Delete Images');
        return;
    }

    showConfirmationModal(`Are you sure you want to delete ${imageIds.length} selected images? This action cannot be undone.`, async () => {

    for (const imageId of imageIds) {
        try {
            const response = await fetch(`/api/image/${imageId}/delete`, {
                method: 'DELETE',
            });
            if (!response.ok) {
                const data = await response.json();
                console.error(`Failed to delete image ${imageId}: ${data.error}`);
            }
        } catch (error) {
            console.error(`Error deleting image ${imageId}: ${error.message}`);
        }
    }
    loadImages();
    });
}

async function deleteImage(imageId, imageName) {
    showConfirmationModal(`Delete image "${imageName}"?\n\nThis will permanently remove the image. This action cannot be undone.`, async () => {
    
    try {
        const response = await fetch(`/api/image/${imageId}/delete`, {
            method: 'DELETE',
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete image');
        }
        
        console.log('Image deleted');
        loadImages();
    } catch (error) {
        console.error(`Error deleting image: ${error.message}`);
    }
    });
}

// Cleanup dangling images
async function cleanupDanglingImages() {
    showConfirmationModal('Clean up dangling images?\n\nThis will remove all <none> images that are not used by any container. This action cannot be undone.', async () => {
    
    try {
        const response = await fetch('/api/cleanup/dangling-images', {
            method: 'POST',
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to cleanup images');
        }
        
        console.log(data.message);
        loadImages();
    } catch (error) {
        console.error(`Error cleaning up dangling images: ${error.message}`);
    }
    });
}

// Load networks
async function loadNetworks() {
    const errorEl = document.getElementById('networks-error');
    const networksList = document.getElementById('networks-list');
    const networksSpinner = document.getElementById('networks-spinner');
    const networksWrapper = document.getElementById('networks-table-wrapper');
    
    errorEl.style.display = 'none';
    networksList.innerHTML = '';
    
    // Show spinner and prevent scrollbars
    if (networksSpinner) networksSpinner.style.display = 'flex';
    if (networksWrapper) networksWrapper.style.overflow = 'hidden';
    
    try {
        const response = await fetch('/api/networks');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load networks');
        }
        
        if (data.networks.length === 0) {
            networksList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">No networks found</td></tr>';
        } else {
            data.networks.forEach(network => {
                const row = createNetworkRow(network);
                networksList.appendChild(row);
            });
        }
        
    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (networksSpinner) networksSpinner.style.display = 'none';
        if (networksWrapper) networksWrapper.style.overflow = '';
    }
}

// Create network row
function createNetworkRow(network) {
    const tr = document.createElement('tr');
    tr.className = 'network-row';
    
    // Skip default networks (bridge, host, none) and Docker Swarm system networks
    // docker_gwbridge and ingress are automatically created by Docker Swarm and used by ingress-sbox
    const isDefault = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress'].includes(network.name) || 
                      (network.scope === 'swarm' && network.name.startsWith('docker_gwbridge'));
    
    // Check if network has containers using it
    const hasContainers = network.containers !== undefined && network.containers > 0;
    
    // Show container count for bridge, host, and none networks (can be used by user containers) and non-built-in networks
    // Hide for docker_gwbridge and ingress which only have Docker Swarm system containers
    const shouldShowContainerCount = !isDefault || network.name === 'bridge' || network.name === 'host' || network.name === 'none';
    const containerCount = (shouldShowContainerCount && network.containers !== undefined) ? network.containers : 0;
    const containerDisplay = shouldShowContainerCount && network.containers !== undefined ? network.containers : '-';
    
    // Build subnet/gateway display
    let subnetDisplay = '-';
    if (network.subnet) {
        subnetDisplay = escapeHtml(network.subnet);
        if (network.gateway) {
            subnetDisplay += ` / ${escapeHtml(network.gateway)}`;
        }
    }
    
    // Build actions column - buttons side by side
    let actionsHtml = '<div class="btn-group" style="display: flex; gap: 4px; flex-wrap: nowrap;">';
    
    // View Containers button if network has containers
    if (hasContainers && containerCount > 0) {
        actionsHtml += `<button class="btn btn-secondary btn-sm" onclick="viewNetworkContainers('${escapeHtml(network.name)}')" title="View containers using this network"><i class="ph ph-cube"></i> View Containers</button>`;
    }
    
    // Backup button for non-default networks
    if (!isDefault) {
        actionsHtml += `<button class="btn btn-warning btn-sm" onclick="backupNetwork('${escapeHtml(network.id)}', '${escapeHtml(network.name)}')" title="Backup network"><i class="ph ph-floppy-disk"></i> Backup</button>`;
    }
    
    // Delete button for non-default networks
    if (!isDefault) {
        if (hasContainers) {
            actionsHtml += `<button class="btn btn-danger btn-sm disabled" title="Cannot delete network with containers using it" disabled><i class="ph ph-trash"></i> Delete</button>`;
        } else {
            actionsHtml += `<button class="btn btn-danger btn-sm" onclick="deleteNetwork('${escapeHtml(network.id)}', '${escapeHtml(network.name)}')" title="Delete network"><i class="ph ph-trash"></i> Delete</button>`;
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

// Backup network
async function backupNetwork(networkId, networkName) {
    showConfirmationModal(`Backup network "${networkName}"?`, async () => {
    
    try {
        const response = await fetch(`/api/network/${networkId}/backup`, {
            method: 'POST',
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to backup network');
        }
        
        console.log(`Network backed up: ${data.filename}`);
        loadNetworks();
        // Refresh backups list if we're on the backups tab
        const backupsTab = document.getElementById('backups-tab');
        if (backupsTab && backupsTab.style.display !== 'none') {
            loadBackups();
        }
    } catch (error) {
        console.error(`Error backing up network: ${error.message}`);
    }
    });
}

// Delete network
async function deleteNetwork(networkId, networkName) {
    showConfirmationModal(`Delete network "${networkName}"?\n\nThis will remove the network. Containers using this network will be disconnected.\n\nThis action cannot be undone.`, async () => {
    
    try {
        const response = await fetch(`/api/network/${networkId}/delete`, {
            method: 'DELETE',
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete network');
        }
        
        console.log('Network deleted');
        loadNetworks();
    } catch (error) {
        console.error(`Error deleting network: ${error.message}`);
    }
    });
}

// Restore network backup from backups tab
async function restoreNetworkBackup(filename) {
    showConfirmationModal(`Restore network from backup "${filename}"?`, async () => {
    
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
                console.warn(`Network already exists: ${data.network_name || 'unknown'}`);
            } else {
                throw new Error(data.error || 'Restore failed');
            }
        } else {
            console.log(`Network restored: ${data.network_name}`);
            // Refresh networks and backups lists
            loadNetworks();
            loadBackups();
        }
    } catch (error) {
        console.error(`Error restoring network backup: ${error.message}`);
    }
    });
}

// Upload network backup
async function uploadNetworkBackup(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    
    if (!file.name.endsWith('.json')) {
        console.error('Please select a .json network backup file');
        return;
    }
    
    // Read file content
    const fileContent = await file.text();
    
    try {
        // Parse JSON to validate
        const networkConfig = JSON.parse(fileContent);
        
        if (!networkConfig.Name) {
            throw new Error('Invalid network backup: missing network name');
        }
        
        // Upload file to backup directory
        const formData = new FormData();
        formData.append('file', file);
        
        const uploadResponse = await fetch('/api/upload-network-backup', {
            method: 'POST',
            body: formData
        });
        
        const uploadData = await uploadResponse.json();
        
        if (!uploadResponse.ok) {
            throw new Error(uploadData.error || 'Upload failed');
        }
        
        // Now restore the network
        showConfirmationModal(`Network backup uploaded. Restore network "${networkConfig.Name}"?`, async () => {
            const restoreResponse = await fetch('/api/network/restore', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    filename: uploadData.filename || file.name
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
            
            loadNetworks();
        });
    } catch (error) {
        console.error(`Error uploading/restoring network backup: ${error.message}`);
    } finally {
        event.target.value = ''; // Reset file input
    }
}

// Load containers on page load
// Environment Check
async function checkEnvironment() {
    const modal = document.getElementById('env-check-modal');
    const resultsDiv = document.getElementById('env-check-results');
    
    modal.style.display = 'block';
    resultsDiv.innerHTML = '';
    resultsDiv.style.display = 'none';
    
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
                const color = isError ? '#ef4444' : '#10b981';
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
        loadingEl.style.display = 'none';
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = `<div class="error">Failed to run checks: ${escapeHtml(error.message)}</div>`;
    }
}

function closeEnvCheckModal() {
    document.getElementById('env-check-modal').style.display = 'none';
}


// --- Container Stats Polling ---
let statsPollInterval = null;

async function updateContainerStats(containerId) {
    try {
        const response = await fetch(`/api/container/${containerId}/stats`);
        const data = await response.json();
        
        if (!response.ok) {
            return;
        }
        
        // Find the stats element for this container (table cell)
        const statsCell = document.querySelector(`.stats-cell[data-container-id="${containerId}"]`);
        if (!statsCell) return;
        
        const cpuPercent = data.cpu_percent || 0;
        const memoryUsedMb = data.memory_used_mb || 0;
        const memoryTotalMb = data.memory_total_mb || 0;
        
        const cpuEl = statsCell.querySelector('.cpu-val');
        const memEl = statsCell.querySelector('.mem-val');
        
        if (cpuEl) {
            cpuEl.textContent = `${cpuPercent}%`;
        }
        
        if (memEl) {
            memEl.textContent = `${memoryUsedMb.toFixed(0)} MB / ${memoryTotalMb.toFixed(0)} MB`;
        }
        
    } catch (error) {
        console.error(`Failed to update stats for container ${containerId}:`, error);
    }
}

function updateAllContainerStats() {
    // Get all container stats elements (table cells)
    const statsElements = document.querySelectorAll('.stats-cell[data-container-id]');
    
    // Update stats for each container in parallel
    statsElements.forEach(statsEl => {
        const containerId = statsEl.getAttribute('data-container-id');
        if (containerId) {
            updateContainerStats(containerId);
        }
    });
}

// ===== STACKS MANAGEMENT =====

let selectedStacks = new Set();

async function loadStacks() {
    const errorEl = document.getElementById('stacks-error');
    const stacksList = document.getElementById('stacks-list');
    const stacksSpinner = document.getElementById('stacks-spinner');
    
    errorEl.style.display = 'none';
    stacksList.innerHTML = '';
    
    // Show spinner
    if (stacksSpinner) stacksSpinner.style.display = 'flex';
    
    try {
        const response = await fetch('/api/stacks');
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to load stacks');
        }
        
        if (data.stacks.length === 0) {
            stacksList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: var(--text-secondary);">No stacks found</td></tr>';
        } else {
            data.stacks.forEach(stack => {
                const row = createStackRow(stack);
                stacksList.appendChild(row);
            });
        }
        
    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner
        if (stacksSpinner) stacksSpinner.style.display = 'none';
    }
}

function createStackRow(stack) {
    const tr = document.createElement('tr');
    tr.className = 'stack-row';
    
    const typeBadge = stack.type === 'swarm' 
        ? '<span style="background: var(--accent); color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; font-weight: 600;">Swarm</span>'
        : '<span style="background: var(--secondary); color: white; padding: 2px 8px; border-radius: 3px; font-size: 0.8em; font-weight: 600;">Compose</span>';
    
    const servicesList = stack.services && stack.services.length > 0
        ? stack.services.map(s => `<span style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; margin-right: 4px;">${escapeHtml(s)}</span>`).join('')
        : '<span style="color: var(--text-light);">-</span>';
    
    const networksList = stack.networks && stack.networks.length > 0
        ? stack.networks.map(n => `<span style="background: var(--bg-secondary); padding: 2px 6px; border-radius: 3px; font-size: 0.85em; margin-right: 4px;">${escapeHtml(n)}</span>`).join('')
        : '<span style="color: var(--text-light);">-</span>';
    
    // Actions column: Delete for Swarm stacks, View Containers for Compose stacks
    const actionsCell = stack.type === 'swarm'
        ? `<td style="white-space: nowrap;">
            <button class="btn btn-danger btn-sm" onclick="deleteStack('${escapeHtml(stack.name)}', '${stack.type}')" title="Delete Swarm Stack">
                <i class="ph ph-trash"></i> Delete
            </button>
        </td>`
        : `<td style="white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="viewStackContainers('${escapeHtml(stack.name)}')" title="View Containers in Stack">
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

function handleStackCheckboxClick(checkbox) {
    const stackName = checkbox.getAttribute('data-stack-name');
    if (checkbox.checked) {
        selectedStacks.add(stackName);
    } else {
        selectedStacks.delete(stackName);
    }
    updateStackDeleteButton();
}

function toggleAllStackSelections(checkbox) {
    const checkboxes = document.querySelectorAll('.stack-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = checkbox.checked;
        const stackName = cb.getAttribute('data-stack-name');
        if (checkbox.checked) {
            selectedStacks.add(stackName);
        } else {
            selectedStacks.delete(stackName);
        }
    });
    updateStackDeleteButton();
}

function updateStackDeleteButton() {
    const deleteBtn = document.getElementById('delete-selected-stacks-btn');
    if (deleteBtn) {
        deleteBtn.disabled = selectedStacks.size === 0;
    }
}

// View containers in a stack (filters containers table)
let isFilteredByStack = false;
let currentStackFilter = null;

function viewStackContainers(stackName) {
    // Switch to containers section
    showSection('containers', document.querySelector('.nav-item[onclick*="containers"]'));
    
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
        isFilteredByStack = true;
        currentStackFilter = stackName;
        
        // Show clear filter button
        const clearFilterBtn = document.getElementById('clear-filter-btn');
        if (clearFilterBtn) clearFilterBtn.style.display = 'inline-block';
        
        // Uncheck select all when filtering
        const selectAllCheckbox = document.getElementById('select-all-containers');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        
        // Show notification
        showNotification(`Showing ${visibleCount} container(s) in stack "${stackName}"`, 'info');
    }, 500);
}

// Clear stack filter
function clearStackFilter() {
    const rows = document.querySelectorAll('.container-row');
    rows.forEach(row => {
        row.style.display = '';
    });
    isFilteredByStack = false;
    currentStackFilter = null;
    
    // Hide clear filter button
    const clearFilterBtn = document.getElementById('clear-filter-btn');
    if (clearFilterBtn) clearFilterBtn.style.display = 'none';
    
    // Uncheck select all
    const selectAllCheckbox = document.getElementById('select-all-containers');
    if (selectAllCheckbox) selectAllCheckbox.checked = false;
    
    // Clear any selections
    resetSelection();
    
    showNotification('Filter cleared - showing all containers', 'info');
}

// View container by name (filters containers table)
function viewContainerByName(containerName) {
    // Switch to containers section
    showSection('containers', document.querySelector('.nav-item[onclick*="containers"]'));
    
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
        isFilteredByStack = true;
        currentStackFilter = containerName;
        
        // Show clear filter button
        const clearFilterBtn = document.getElementById('clear-filter-btn');
        if (clearFilterBtn) clearFilterBtn.style.display = 'inline-block';
        
        // Uncheck select all when filtering
        const selectAllCheckbox = document.getElementById('select-all-containers');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        
        // Show notification
        showNotification(`Showing container "${containerName}"`, 'info');
    }, 500);
}

// View containers using a network (filters containers table)
function viewNetworkContainers(networkName) {
    // Switch to containers section
    showSection('containers', document.querySelector('.nav-item[onclick*="containers"]'));
    
    // Wait for containers to load, then filter
    setTimeout(() => {
        const rows = document.querySelectorAll('.container-row');
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
        isFilteredByStack = true;
        currentStackFilter = networkName;
        
        // Show clear filter button
        const clearFilterBtn = document.getElementById('clear-filter-btn');
        if (clearFilterBtn) clearFilterBtn.style.display = 'inline-block';
        
        // Uncheck select all when filtering
        const selectAllCheckbox = document.getElementById('select-all-containers');
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
        
        // Show notification
        showNotification(`Showing ${visibleCount} container(s) using network "${networkName}"`, 'info');
    }, 500);
}

async function deleteStack(stackName, stackType) {
    const stackTypeLabel = stackType === 'swarm' ? 'Swarm stack' : 'Compose stack';
    showConfirmationModal(
        `Delete ${stackTypeLabel} "${stackName}"?`,
        `This will ${stackType === 'swarm' ? 'remove the stack and all its services' : 'delete all containers in this stack'}. This action cannot be undone.`,
        async () => {
            try {
                const response = await fetch(`/api/stack/${encodeURIComponent(stackName)}/delete`, {
                    method: 'DELETE',
                });
                const data = await response.json();
                
                if (!response.ok) {
                    throw new Error(data.error || 'Failed to delete stack');
                }
                
                showNotification(`Stack "${stackName}" deleted successfully`, 'success');
                await loadStacks();
            } catch (error) {
                showNotification(`Failed to delete stack: ${error.message}`, 'error');
            }
        }
    );
}

async function deleteSelectedStacks() {
    if (selectedStacks.size === 0) {
        return;
    }
    
    const stackNames = Array.from(selectedStacks);
    const stackList = stackNames.map(name => `"${name}"`).join(', ');
    
    showConfirmationModal(
        `Delete ${selectedStacks.size} stack${selectedStacks.size !== 1 ? 's' : ''}?`,
        `This will delete: ${stackList}. This action cannot be undone.`,
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
                        console.error(`Failed to delete stack ${stackName}:`, data.error);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`Error deleting stack ${stackName}:`, error);
                }
            }
            
            if (successCount > 0) {
                showNotification(`Deleted ${successCount} stack${successCount !== 1 ? 's' : ''} successfully`, 'success');
            }
            if (errorCount > 0) {
                showNotification(`Failed to delete ${errorCount} stack${errorCount !== 1 ? 's' : ''}`, 'error');
            }
            
            await loadStacks();
        }
    );
}

function startStatsPolling() {
    // Clear any existing interval
    if (statsPollInterval) {
        clearInterval(statsPollInterval);
    }
    
    // Update immediately
    updateAllContainerStats();
    updateSystemStats();
    
    // Then update every 5 seconds
    statsPollInterval = setInterval(() => {
        updateAllContainerStats();
        updateSystemStats();
    }, 5000);
}

async function updateSystemStats() {
    try {
        const response = await fetch('/api/system-stats');
        const data = await response.json();
        
        if (!response.ok) {
            return;
        }
        
        const cpuEl = document.getElementById('system-cpu');
        const ramEl = document.getElementById('system-ram');
        
        if (cpuEl) {
            cpuEl.textContent = `${data.cpu_percent || 0}%`;
        }
        
        if (ramEl) {
            const memUsed = data.memory_used_mb || 0;
            const memTotal = data.memory_total_mb || 0;
            const memPercent = data.memory_percent || 0;
            ramEl.textContent = `${Math.round(memUsed)} MB / ${Math.round(memTotal)} MB (${memPercent.toFixed(1)}%)`;
        }
        
    } catch (error) {
        console.error('Failed to update system stats:', error);
    }
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check authentication status first
    checkAuthStatus();
    
    // Show dashboard section by default
    showSection('dashboard', document.querySelector('.nav-item'));
    
    // Start stats polling
    startStatsPolling();
});



// --- Bulk Container Actions ---

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

    for (const containerId of selectedIds) {
        await startContainer(containerId);
    }
    resetSelection();
    loadContainers();
}

async function restartSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    for (const containerId of selectedIds) {
        await restartContainer(containerId);
    }
    resetSelection();
    loadContainers();
}

async function stopSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    for (const containerId of selectedIds) {
        await stopContainer(containerId);
    }
    resetSelection();
    loadContainers();
}

async function backupSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    // Check backup status first
    try {
        const statusResponse = await fetch('/api/backup/status');
        const statusData = await statusResponse.json();
        if (statusData.status === 'busy') {
            showNotification(`A backup for "${statusData.current_backup}" is already in progress. Please wait.`, 'warning');
            return;
        }
    } catch (error) {
        console.error('Error checking backup status:', error);
    }

    if (backupAllInProgress) {
        showNotification('A backup operation is already in progress.', 'warning');
        return;
    }
    
    if (isBackupInProgress) {
        showNotification('A single backup is already in progress. Please wait for it to finish.', 'warning');
        return;
    }
    
    backupAllInProgress = true;
    backupAllCancelled = false;
    
    // Show modal
    const modal = document.getElementById('backup-all-modal');
    const statusEl = document.getElementById('backup-all-status');
    const listEl = document.getElementById('backup-all-list');
    const closeBtn = document.getElementById('backup-all-close-btn');
    const cancelBtn = document.getElementById('backup-all-cancel-btn');
    
    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    cancelBtn.style.display = 'inline-block';
    
    // Prepare list of selected containers
    const selectedContainers = [];
    selectedIds.forEach(id => {
        const checkbox = document.querySelector(`.container-checkbox[data-container-id="${id}"]`);
        const row = checkbox.closest('tr');
        const nameElement = row.querySelector('.container-name');
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
                        <strong style="color: var(--text-primary);">${escapeHtml(container.name)}</strong>
                        <span style="color: var(--text-light); font-size: 0.9em; margin-left: 10px;">⏳ Waiting...</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    try {
        // Backup each container sequentially
        for (let i = 0; i < selectedContainers.length; i++) {
            if (backupAllCancelled) {
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
                        <strong style="color: var(--text-primary);">${escapeHtml(container.name)}</strong>
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
                                    <strong style="color: var(--text-primary);">${escapeHtml(container.name)}</strong>
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
                                <strong style="color: var(--text-primary);">${escapeHtml(container.name)}</strong>
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
                                
                                const progress = await progressResponse.json();
                                
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
                            
                            const progress = await progressResponse.json();
                            
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
                                <strong style="color: var(--text-primary);">${escapeHtml(container.name)}</strong>
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
                            <strong style="color: var(--text-primary);">${escapeHtml(container.name)}</strong>
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
                            <strong style="color: var(--text-primary);">${escapeHtml(container.name)}</strong>
                            <span style="color: var(--danger); font-size: 0.9em; margin-left: 10px;">❌ Failed: ${escapeHtml(error.message)}</span>
                        </div>
                    </div>
                `;
                itemEl.style.borderLeftColor = 'var(--danger)';
            }
            
        }
        
        // Final status
        if (!backupAllCancelled) {
            if (failed === 0) {
                statusEl.innerHTML = `<span style="color: var(--accent);">✅ All selected backups completed successfully!</span>`;
            } else {
                statusEl.innerHTML = `<span style="color: var(--warning);">⚠️ Backup process completed with ${failed} error(s).</span>`;
            }
            
            // Reload backups list
            loadBackups();
        }
        
        // Deselect items after backup
        resetSelection();
        
        closeBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'none';
        
    } catch (error) {
        statusEl.innerHTML = `<span style="color: var(--danger);">❌ Error: ${escapeHtml(error.message)}</span>`;
        closeBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'none';
    } finally {
        backupAllInProgress = false;
    }
}

async function deleteSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
    if (selectedIds.length === 0) {
        console.warn('No containers selected.');
        return;
    }

    // Store selected container IDs globally for bulk delete
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
    
    // Show delete modal with checkboxes (applies to all selected containers)
    if (selectedIds.length === 1) {
        showDeleteOptions(firstContainerId, containerName);
    } else {
        // For multiple containers, show modal with count
        showDeleteOptions(firstContainerId, `${selectedIds.length} containers`);
    }
}

// --- Confirmation Modal ---

function showConfirmationModal(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirmation-modal');
    const messageEl = document.getElementById('confirmation-message');
    const confirmBtn = document.getElementById('confirmation-confirm-btn');
    const cancelBtn = document.getElementById('confirmation-cancel-btn');

    messageEl.innerText = message;

    modal.style.display = 'block';

    confirmBtn.onclick = () => {
        closeConfirmationModal();
        if (onConfirm) onConfirm();
    };

    cancelBtn.onclick = () => {
        closeConfirmationModal();
        if (onCancel) onCancel();
    };
}

function closeConfirmationModal() {
    const modal = document.getElementById('confirmation-modal');
    modal.style.display = 'none';
}

function showAlertModal(message, title = 'Alert') {
    const modal = document.getElementById('confirmation-modal');
    const titleEl = document.getElementById('confirmation-title');
    const messageEl = document.getElementById('confirmation-message');
    const confirmBtn = document.getElementById('confirmation-confirm-btn');
    const cancelBtn = document.getElementById('confirmation-cancel-btn');

    titleEl.innerText = title;
    messageEl.innerText = message;

    // Hide cancel button and change confirm button to OK
    cancelBtn.style.display = 'none';
    confirmBtn.innerText = 'OK';
    confirmBtn.className = 'btn btn-primary btn-sm';

    modal.style.display = 'block';

    confirmBtn.onclick = () => {
        closeConfirmationModal();
        // Reset button state
        cancelBtn.style.display = 'inline-block';
        confirmBtn.innerText = 'Confirm';
        confirmBtn.className = 'btn btn-danger btn-sm';
    };
}

// --- Notifications ---
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    container.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            container.removeChild(notification);
        }, 500);
    }, 5000);
}
