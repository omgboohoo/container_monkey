// Authentication state
let isAuthenticated = false;
let currentUsername = '';

// Statistics loading abort controller
let statisticsAbortController = null;
let statisticsPollInterval = null;
let statisticsRefreshTimeInterval = null; // For updating refresh time displays
let lastStatisticsCacheTimestamp = null;

// CSRF Token helper functions
function getCsrfToken() {
    // Try to get from window (injected by template)
    if (window.csrfToken) {
        return window.csrfToken;
    }

    // Fallback: get from cookie
    const name = 'X-CSRFToken';
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        const [key, value] = cookie.trim().split('=');
        if (key === name) {
            return decodeURIComponent(value);
        }
    }
    return null;
}

// Helper function for API requests that need CSRF protection
async function apiRequest(url, options = {}) {
    const token = getCsrfToken();
    const method = options.method || 'GET';

    // Only add CSRF token for state-changing methods
    const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());

    const defaultOptions = {
        credentials: 'include',  // Important for cookies
        ...options
    };

    // Add CSRF token header if needed
    if (needsCsrf && token) {
        defaultOptions.headers = {
            ...defaultOptions.headers,
            'X-CSRFToken': token
        };
    }

    return fetch(url, defaultOptions);
}

// Global error handler to ensure modals don't get stuck
window.addEventListener('error', function (event) {
    console.error('Global error:', event.error);
    // Don't close modals on every error, but log it
});

window.addEventListener('unhandledrejection', function (event) {
    console.error('Unhandled promise rejection:', event.reason);
    // Close modals if they might be stuck
    const visibleModals = document.querySelectorAll('.modal[style*="block"]');
    if (visibleModals.length > 0) {
        console.warn('Unhandled rejection detected with visible modals, checking for stuck modals...');
    }
});

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

// Intercept fetch requests to handle 401 errors and add CSRF tokens
const originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
    // Handle both string URL and Request object
    const urlString = typeof url === 'string' ? url : (url.url || '');

    // Auto-add CSRF token for state-changing methods
    const method = options.method || (typeof url === 'object' && url.method ? url.method : 'GET') || 'GET';
    const needsCsrf = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method.toUpperCase());
    const isApiCall = urlString.startsWith('/api/');
    const isExempt = urlString.includes('/api/login') || urlString.includes('/api/auth-status');

    if (needsCsrf && isApiCall && !isExempt) {
        const token = getCsrfToken();
        if (token) {
            options.headers = {
                ...options.headers,
                'X-CSRFToken': token
            };
        }
        // Ensure credentials are included for cookies
        options.credentials = options.credentials || 'include';
    }

    const response = await originalFetch(url, options);

    // If we get a 401 and we're not already on the login page, show login modal
    if (response.status === 401 && !urlString.includes('/api/login') && !urlString.includes('/api/auth-status')) {
        if (!isAuthenticated) {
            document.getElementById('login-modal').style.display = 'block';
            document.getElementById('user-menu-container').style.display = 'none';
        }
    }

    // Handle CSRF errors
    if (response.status === 400) {
        const clonedResponse = response.clone();
        try {
            const data = await clonedResponse.json();
            if (data.csrf_error) {
                console.error('CSRF token error - refreshing page');
                // Refresh CSRF token by reloading page
                location.reload();
            }
        } catch (e) {
            // Not JSON, ignore
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

            // Load server name after login
            await loadServerName();

            // Check if default credentials were used
            if (data.is_default_credentials) {
                showDefaultCredentialsModal();
            }

            // Reload page data
            // Stats polling will be started automatically by loadContainers() if containers section is active
            // For other sections, start stats polling immediately
            if (document.querySelector('.content-section.active')) {
                const activeSection = document.querySelector('.content-section.active').id.replace('-section', '');
                showSection(activeSection);

                // Start stats polling for non-containers sections (containers section will start it after loading)
                if (activeSection !== 'containers') {
                    startStatsPolling();
                }
            } else {
                // No active section, start stats polling
                startStatsPolling();
            }
        } else {
            showNotification(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        showNotification('Network error. Please try again.', 'error');
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

// Toggle sidebar collapse
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    
    // Save state to localStorage
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

// Initialize sidebar state from localStorage
function initSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const savedState = localStorage.getItem('sidebarCollapsed');
    
    if (savedState === 'true') {
        sidebar.classList.add('collapsed');
    }
}

// Initialize sidebar on page load
document.addEventListener('DOMContentLoaded', function() {
    initSidebarState();
});

// Close user menu when clicking outside
document.addEventListener('click', function (event) {
    const userMenuContainer = document.getElementById('user-menu-container');
    if (userMenuContainer && !userMenuContainer.contains(event.target)) {
        document.getElementById('user-menu-dropdown').classList.remove('show');
    }
});

// Show change password modal
function showDefaultCredentialsModal() {
    document.getElementById('default-credentials-modal').style.display = 'block';
}

function closeDefaultCredentialsModal() {
    document.getElementById('default-credentials-modal').style.display = 'none';
}

function showChangePasswordModal() {
    document.getElementById('change-password-modal').style.display = 'block';
    document.getElementById('user-menu-dropdown').classList.remove('show');
    document.getElementById('change-password-form').reset();
    document.getElementById('change-password-error').style.display = 'none';
    document.getElementById('change-password-success').style.display = 'none';
    resetPasswordPolicyIndicators();
}

// Close change password modal
function closeChangePasswordModal() {
    document.getElementById('change-password-modal').style.display = 'none';
    document.getElementById('change-password-form').reset();
    document.getElementById('change-password-error').style.display = 'none';
    document.getElementById('change-password-success').style.display = 'none';
    // Reset password policy indicators
    resetPasswordPolicyIndicators();
}

// Validate password strength and update visual indicators
function validatePasswordStrength(password) {
    const result = {
        valid: true,
        error: ''
    };

    // Check length
    const hasLength = password.length >= 12;
    updatePolicyIndicator('policy-length', hasLength);

    // Check uppercase
    const hasUpper = /[A-Z]/.test(password);
    updatePolicyIndicator('policy-upper', hasUpper);

    // Check lowercase
    const hasLower = /[a-z]/.test(password);
    updatePolicyIndicator('policy-lower', hasLower);

    // Check digit
    const hasDigit = /\d/.test(password);
    updatePolicyIndicator('policy-digit', hasDigit);

    // Check special character
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>\[\]\\/_+=\-~`]/.test(password);
    updatePolicyIndicator('policy-special', hasSpecial);

    // Validate all requirements
    if (!hasLength) {
        result.valid = false;
        result.error = 'Password must be at least 12 characters long';
        return result;
    }

    const missingRequirements = [];
    if (!hasUpper) missingRequirements.push('uppercase letter');
    if (!hasLower) missingRequirements.push('lowercase letter');
    if (!hasDigit) missingRequirements.push('digit');
    if (!hasSpecial) missingRequirements.push('special character');

    if (missingRequirements.length > 0) {
        result.valid = false;
        result.error = `Password must contain at least one ${missingRequirements.join(', ')}`;
        return result;
    }

    return result;
}

// Update password policy indicator
function updatePolicyIndicator(elementId, isValid) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const icon = element.querySelector('i');
    const text = element.querySelector('span');

    if (isValid) {
        icon.className = 'ph ph-check-circle';
        icon.style.color = 'var(--success)';
        text.style.color = 'var(--text-primary)';
        text.style.textDecoration = 'line-through';
    } else {
        icon.className = 'ph ph-circle';
        icon.style.color = 'var(--text-light)';
        text.style.color = 'var(--text-light)';
        text.style.textDecoration = 'none';
    }
}

// Reset password policy indicators
function resetPasswordPolicyIndicators() {
    ['policy-length', 'policy-upper', 'policy-lower', 'policy-digit', 'policy-special'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            const icon = element.querySelector('i');
            const text = element.querySelector('span');
            if (icon) {
                icon.className = 'ph ph-circle';
                icon.style.color = 'var(--text-light)';
            }
            if (text) {
                text.style.color = 'var(--text-light)';
                text.style.textDecoration = 'none';
            }
        }
    });
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

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        // Show password validation errors as toast notifications instead of in modal
        showNotification(passwordValidation.error, 'error');
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
            // Show success as toast notification
            showNotification(data.message || 'Password changed successfully.', 'success');
            document.getElementById('change-password-form').reset();

            // Close modal immediately on success
            closeChangePasswordModal();
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
    // Cleanup statistics polling if leaving statistics section
    if (statisticsPollInterval) {
        clearInterval(statisticsPollInterval);
        statisticsPollInterval = null;
    }
    if (statisticsRefreshTimeInterval) {
        clearInterval(statisticsRefreshTimeInterval);
        statisticsRefreshTimeInterval = null;
    }
    if (statisticsAbortController) {
        statisticsAbortController.abort();
        statisticsAbortController = null;
    }
    
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
            const sectionNameLower = sectionName.toLowerCase();
            // Handle spaces/dashes in section names (e.g., "audit log" vs "audit-log")
            if (itemText === sectionNameLower || itemText.replace(/\s+/g, '-') === sectionNameLower || itemText === sectionNameLower.replace(/-/g, ' ')) {
                item.classList.add('active');
            }
        });
    }

    // Load data for the section
    if (sectionName === 'dashboard') {
        loadDashboardStats();
    } else if (sectionName === 'containers') {
        loadContainers();
        // Container stats polling will be started by loadContainers() after containers load
    } else if (sectionName === 'volumes') {
        loadVolumes();
    } else if (sectionName === 'images') {
        loadImages();
    } else if (sectionName === 'networks') {
        loadNetworks();
    } else if (sectionName === 'stacks') {
        loadStacks();
    } else if (sectionName === 'backups') {
        loadStorageSettings();
        loadBackups();
    } else if (sectionName === 'statistics') {
        loadStatistics();
    } else if (sectionName === 'audit-log') {
        loadAuditLogs();
    } else if (sectionName === 'backup-scheduler') {
        // Safety check: ensure no spinners are blocking
        hideAllSpinners();
        // Load config first - it will call loadSchedulerContainers() after config loads
        loadSchedulerConfig();
        loadStatistics();
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
        if (cards.length > 7) {
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
            cards[7].querySelector('.card-number').textContent = stats.scheduled_containers_qty || 0;
            const schedulerNextRunEl = document.getElementById('scheduler-next-run-dashboard');
            if (schedulerNextRunEl && stats.scheduler_next_run) {
                const nextRunDate = new Date(stats.scheduler_next_run);
                const year = nextRunDate.getFullYear();
                const month = String(nextRunDate.getMonth() + 1).padStart(2, '0');
                const day = String(nextRunDate.getDate()).padStart(2, '0');
                const hours = String(nextRunDate.getHours()).padStart(2, '0');
                const minutes = String(nextRunDate.getMinutes()).padStart(2, '0');
                schedulerNextRunEl.innerHTML = `<i class="ph ph-clock" style="margin-right: 4px;"></i>${day}-${month}-${year} ${hours}:${minutes}`;
            } else if (schedulerNextRunEl) {
                schedulerNextRunEl.textContent = 'No schedule configured';
            }
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
                    if (containersSpinner) containersSpinner.style.display = 'none';
                    if (containersWrapper) containersWrapper.style.overflow = '';
                    isLoadingContainers = false;
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

        // Restart stats polling after containers are loaded
        startStatsPolling();

    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (containersSpinner) containersSpinner.style.display = 'none';
        if (containersWrapper) {
            containersWrapper.style.overflow = '';
            containersWrapper.classList.remove('loading-grid');
        }
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
    } else {
        // For self container, ensure buttons are still clickable
        tr.style.pointerEvents = 'auto';
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
            <div style="font-size: 0.85em; color: var(--text-secondary);">
                <div><strong>IP:</strong> ${escapeHtml(ipAddress)}</div>
                <div style="margin-top: 2px;">${portsDisplay}</div>
            </div>
        </td>
        <td style="white-space: nowrap;">
            <div class="btn-group" style="display: flex; gap: 2px; pointer-events: auto;">
                <button class="btn-icon" onclick="event.stopPropagation(); event.preventDefault(); showContainerDetails('${container.id}'); return false;" title="Container Details" style="pointer-events: auto;">
                    <i class="ph ph-info"></i>
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

// Close all modals (safety function to prevent stuck modals)
function closeAllModals() {
    const modals = [
        'details-modal',
        'backup-modal',
        'restore-modal',
        'env-check-modal',
        'backup-all-modal',
        'attach-console-modal',
        'logs-modal',
        'download-all-modal',
        'delete-all-modal',
        'upload-progress-modal',
        'confirmation-modal',
        'change-password-modal',
        'change-username-modal',
        'delete-container-modal',
        'default-credentials-modal'
    ];

    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'none';
        }
    });
}

// Hide all loading spinners (safety function to prevent stuck spinners blocking clicks)
function hideAllSpinners() {
    const spinnerIds = [
        'containers-spinner',
        'backups-spinner',
        'statistics-spinner',
        'volumes-spinner',
        'images-spinner',
        'networks-spinner',
        'stacks-spinner',
        'scheduler-containers-spinner'
    ];

    spinnerIds.forEach(spinnerId => {
        const spinner = document.getElementById(spinnerId);
        if (spinner) {
            spinner.style.display = 'none';
            delete spinner.dataset.shownAt; // Clear timestamp
        }
    });

    // Also hide any spinners found by class
    const allSpinners = document.querySelectorAll('.spinner-container');
    allSpinners.forEach(spinner => {
        spinner.style.display = 'none';
        delete spinner.dataset.shownAt;
    });
}

// Debug function to check for blocking elements (can be called from console)
window.debugBlockingElements = function () {
    console.log('=== Checking for blocking elements ===');

    // Check spinners
    const spinners = document.querySelectorAll('.spinner-container');
    const visibleSpinners = [];
    spinners.forEach(spinner => {
        const display = window.getComputedStyle(spinner).display;
        if (display === 'flex' || display === 'block') {
            visibleSpinners.push({
                id: spinner.id || 'no-id',
                display: display,
                zIndex: window.getComputedStyle(spinner).zIndex,
                rect: spinner.getBoundingClientRect()
            });
        }
    });
    console.log('Visible spinners:', visibleSpinners);

    // Check modals
    const modals = document.querySelectorAll('.modal');
    const visibleModals = [];
    modals.forEach(modal => {
        const display = window.getComputedStyle(modal).display;
        if (display === 'block') {
            visibleModals.push({
                id: modal.id || 'no-id',
                display: display,
                zIndex: window.getComputedStyle(modal).zIndex,
                rect: modal.getBoundingClientRect(),
                hasContent: !!modal.querySelector('.modal-content')
            });
        }
    });
    console.log('Visible modals:', visibleModals);

    // Check for high z-index elements
    const allElements = document.querySelectorAll('*');
    const highZIndex = [];
    allElements.forEach(el => {
        const zIndex = parseInt(window.getComputedStyle(el).zIndex);
        if (zIndex > 100 && window.getComputedStyle(el).display !== 'none') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 100 && rect.height > 100) { // Only large elements
                highZIndex.push({
                    tag: el.tagName,
                    id: el.id || 'no-id',
                    class: el.className || 'no-class',
                    zIndex: zIndex,
                    pointerEvents: window.getComputedStyle(el).pointerEvents,
                    rect: rect
                });
            }
        }
    });
    console.log('High z-index elements:', highZIndex);

    // Fix any stuck elements
    if (visibleSpinners.length > 0 || (visibleModals.length > 0 && visibleModals.some(m => !m.hasContent))) {
        console.log('Found blocking elements, fixing...');
        hideAllSpinners();
        closeAllModals();
        console.log('Fixed! Try clicking buttons now.');
    } else {
        console.log('No obvious blocking elements found.');
    }

    return { spinners: visibleSpinners, modals: visibleModals, highZIndex: highZIndex };
};

// Load backups
// Store all backups for filtering and sorting
let allBackups = [];
let currentBackupSortColumn = null;
let currentBackupSortDirection = 'asc'; // 'asc' or 'desc'

// Store data for sorting - Volumes, Images, Networks, Stacks
let allVolumes = [];
let currentVolumeSortColumn = null;
let currentVolumeSortDirection = 'asc';

let allImages = [];
let currentImageSortColumn = null;
let currentImageSortDirection = 'asc';

let allNetworks = [];
let currentNetworkSortColumn = null;
let currentNetworkSortDirection = 'asc';

let allStacks = [];
let currentStackSortColumn = null;
let currentStackSortDirection = 'asc';

async function loadBackups() {
    const errorEl = document.getElementById('backups-error');
    const backupsList = document.getElementById('backups-list');
    const backupsSpinner = document.getElementById('backups-spinner');
    const backupsWrapper = document.getElementById('backups-table-wrapper');

    errorEl.style.display = 'none';
    backupsList.innerHTML = '';

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
        allBackups = data.backups || [];

        // Apply current sort if any, then render
        let backupsToDisplay = allBackups;
        if (currentBackupSortColumn) {
            backupsToDisplay = sortBackupsData([...allBackups], currentBackupSortColumn, currentBackupSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-backup-${currentBackupSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = currentBackupSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderBackups(backupsToDisplay);

    } catch (error) {
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (backupsSpinner) backupsSpinner.style.display = 'none';
        if (backupsWrapper) {
            backupsWrapper.style.overflow = '';
            backupsWrapper.classList.remove('loading-grid');
        }
    }
}

// Load statistics (with caching and background refresh)
async function loadStatistics() {
    const errorEl = document.getElementById('statistics-error');
    const statisticsList = document.getElementById('statistics-list');
    const statisticsSpinner = document.getElementById('statistics-spinner');
    const statisticsWrapper = document.getElementById('statistics-table-wrapper');

    // Cancel any pending requests and polling
    if (statisticsAbortController) {
        statisticsAbortController.abort();
    }
    if (statisticsPollInterval) {
        clearInterval(statisticsPollInterval);
        statisticsPollInterval = null;
    }
    if (statisticsRefreshTimeInterval) {
        clearInterval(statisticsRefreshTimeInterval);
        statisticsRefreshTimeInterval = null;
    }
    
    // Create new abort controller and store reference
    const abortController = new AbortController();
    statisticsAbortController = abortController;

    // Clear error message and hide error element
    errorEl.style.display = 'none';
    errorEl.textContent = '';
    statisticsList.innerHTML = '';

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
                errorEl.textContent = `Error: ${cachedData.error}`;
                errorEl.style.display = 'block';
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
                lastStatisticsCacheTimestamp = cachedData.cache_timestamp;
                
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
                errorEl.textContent = 'Error: Invalid response format';
                errorEl.style.display = 'block';
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
                errorEl.textContent = `Error: ${errorData.error || `Failed to load statistics (${cachedResponse.status})`}`;
            } catch (e) {
                errorEl.textContent = `Error: Failed to load statistics (${cachedResponse.status})`;
            }
            errorEl.style.display = 'block';
            if (statisticsSpinner) statisticsSpinner.style.display = 'none';
            if (statisticsWrapper) {
                statisticsWrapper.style.overflow = '';
                statisticsWrapper.classList.remove('loading-grid');
            }
            return;
        }

    } catch (error) {
        // Ignore errors if this request was cancelled (new request started)
        if (statisticsAbortController !== abortController) {
            return;
        }
        
        // Handle errors
        if (error.name === 'AbortError') {
            // Request was cancelled, ignore
            return;
        } else {
            const errorMessage = error.message || error.toString() || 'Unknown error occurred';
            errorEl.textContent = `Error: ${errorMessage}`;
            errorEl.style.display = 'block';
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
                    if (data.cache_timestamp && data.cache_timestamp !== lastStatisticsCacheTimestamp) {
                        // Update grid with fresh data
                        if (data.containers !== undefined) {
                            updateStatisticsGrid(data.containers, preserveRefreshTimes=true);
                            lastStatisticsCacheTimestamp = data.cache_timestamp;
                            
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
    
    if (preserveRefreshTimes) {
        // Incremental update: update refresh times for containers that have new data
        const existingRows = statisticsList.querySelectorAll('tr.statistics-row');
        const containerIdToRow = {};
        
        // Build map of existing rows by container ID
        existingRows.forEach(row => {
            const containerId = row.getAttribute('data-container-id');
            if (containerId) {
                containerIdToRow[containerId] = row;
            }
        });
        
        // Update refresh times for containers with new data
        containers.forEach(container => {
            const containerId = container.id;
            const existingRow = containerIdToRow[containerId];
            
            if (existingRow && container.refresh_timestamp) {
                // Update refresh time cell
                const refreshCell = existingRow.querySelector('td:last-child');
                if (refreshCell) {
                    refreshCell.dataset.refreshTimestamp = container.refresh_timestamp;
                    refreshCell.textContent = formatRefreshTime(container.refresh_timestamp);
                }
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
    if (statisticsRefreshTimeInterval) {
        clearInterval(statisticsRefreshTimeInterval);
    }
    
    // Track last known cache timestamp for detecting updates
    let lastKnownTimestamp = lastStatisticsCacheTimestamp;
    
    // Update refresh times every second
    statisticsRefreshTimeInterval = setInterval(async () => {
        const statisticsList = document.getElementById('statistics-list');
        if (!statisticsList) {
            clearInterval(statisticsRefreshTimeInterval);
            statisticsRefreshTimeInterval = null;
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
                            updateStatisticsGrid(data.containers, preserveRefreshTimes=true);
                            lastStatisticsCacheTimestamp = data.cache_timestamp;
                            lastKnownTimestamp = data.cache_timestamp;
                        }
                    }
                } else if (response.status === 429) {
                    // Rate limited - skip this check, will retry on next interval
                    // This shouldn't happen now that endpoint is exempt, but handle gracefully
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

    const statusClass = container.status === 'running' ? 'status-running' : 'status-stopped';
    const statusText = container.status === 'running' ? 'Running' : 'Stopped';

    // Format RAM display
    let ramDisplay = '-';
    if (container.status === 'running' && container.memory_used_mb > 0) {
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
            <div style="font-size: 0.85em; color: var(--text-secondary);">ID: ${container.id}</div>
        </td>
        <td style="color: var(--text-secondary);">${escapeHtml(container.image)}</td>
        <td>
            <div class="container-status ${statusClass}">${statusText}</div>
        </td>
        <td style="color: var(--text-secondary);">${cpuDisplay}</td>
        <td style="color: var(--text-secondary);">${ramDisplay}</td>
        <td style="color: var(--text-secondary);">${networkIO}</td>
        <td style="color: var(--text-secondary);">${blockIO}</td>
        <td style="color: var(--text-secondary); font-size: 0.9em;" data-refresh-timestamp="${container.refresh_timestamp || ''}">${refreshTime}</td>
    `;

    return tr;
}

// Audit Log functions
let auditLogCurrentPage = 1;
let auditLogTotalPages = 1;
let auditLogTotal = 0;
const auditLogLimit = 10;

async function loadAuditLogs(reset = true) {
    const errorEl = document.getElementById('audit-log-error');
    const auditLogList = document.getElementById('audit-log-list');
    const auditLogSpinner = document.getElementById('audit-log-spinner');
    const auditLogWrapper = document.getElementById('audit-log-table-wrapper');

    errorEl.style.display = 'none';

    if (reset) {
        auditLogCurrentPage = 1;
    }

    // Calculate offset from current page
    const auditLogOffset = (auditLogCurrentPage - 1) * auditLogLimit;

    // Show spinner
    if (auditLogSpinner) auditLogSpinner.style.display = 'flex';
    if (auditLogWrapper) {
        auditLogWrapper.style.overflow = 'hidden';
        auditLogWrapper.classList.add('loading-grid');
    }

    // Clear existing logs
    auditLogList.innerHTML = '';

    try {
        const operationTypeEl = document.getElementById('audit-filter-operation');
        const statusEl = document.getElementById('audit-filter-status');
        const searchInput = document.getElementById('audit-log-search');
        const operationType = (operationTypeEl && operationTypeEl.value) || '';
        const status = (statusEl && statusEl.value) || '';
        const searchTerm = (searchInput && searchInput.value.trim()) || '';

        let url = `/api/audit-logs?limit=${auditLogLimit}&offset=${auditLogOffset}`;
        if (operationType) url += `&operation_type=${encodeURIComponent(operationType)}`;
        if (status) url += `&status=${encodeURIComponent(status)}`;
        if (searchTerm) url += `&search=${encodeURIComponent(searchTerm)}`;

        const response = await fetch(url);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load audit logs');
        }

        auditLogTotal = data.total || 0;
        auditLogTotalPages = Math.ceil(auditLogTotal / auditLogLimit);

        if (!data.logs || data.logs.length === 0) {
            auditLogList.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #666;">No audit logs found</td></tr>';
            updateAuditLogPagination();
        } else {
            data.logs.forEach(log => {
                const row = createAuditLogRow(log);
                auditLogList.appendChild(row);
            });

            updateAuditLogPagination();
        }

    } catch (error) {
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner
        if (auditLogSpinner) auditLogSpinner.style.display = 'none';
        if (auditLogWrapper) {
            auditLogWrapper.style.overflow = '';
            auditLogWrapper.classList.remove('loading-grid');
        }
    }
}

function updateAuditLogPagination() {
    const prevBtn = document.getElementById('audit-prev-btn');
    const nextBtn = document.getElementById('audit-next-btn');
    const pageInfo = document.getElementById('audit-page-info');

    if (auditLogTotalPages <= 1) {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        pageInfo.textContent = '';
    } else {
        prevBtn.style.display = auditLogCurrentPage > 1 ? 'inline-flex' : 'none';
        nextBtn.style.display = auditLogCurrentPage < auditLogTotalPages ? 'inline-flex' : 'none';
        
        const start = auditLogTotal === 0 ? 0 : (auditLogCurrentPage - 1) * auditLogLimit + 1;
        const end = Math.min(auditLogCurrentPage * auditLogLimit, auditLogTotal);
        pageInfo.textContent = `Page ${auditLogCurrentPage} of ${auditLogTotalPages} (${start}-${end} of ${auditLogTotal})`;
    }
}

async function loadAuditLogsPage(direction) {
    if (direction === 'next' && auditLogCurrentPage < auditLogTotalPages) {
        auditLogCurrentPage++;
        await loadAuditLogs(false);
    } else if (direction === 'prev' && auditLogCurrentPage > 1) {
        auditLogCurrentPage--;
        await loadAuditLogs(false);
    }
}

async function clearAuditLogs() {
    showConfirmationModal(
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
                showNotification(`Successfully cleared ${data.deleted_count || 0} audit log(s)`, 'success');

                // Reload audit logs (will show empty state)
                await loadAuditLogs(true);
            } catch (error) {
                showNotification(`Error clearing audit logs: ${error.message}`, 'error');
            }
        }
    );
}

// Debounce function for search
let auditLogSearchTimeout = null;

function filterAuditLogs() {
    auditLogCurrentPage = 1; // Reset to first page when filtering
    const searchInput = document.getElementById('audit-log-search');
    if (!searchInput) return;

    const searchTerm = searchInput.value.trim();

    // Clear existing timeout
    if (auditLogSearchTimeout) {
        clearTimeout(auditLogSearchTimeout);
    }

    // Debounce the search - wait 300ms after user stops typing
    auditLogSearchTimeout = setTimeout(() => {
        // Reload audit logs with search term
        loadAuditLogs(true);
    }, 300);
}

function createAuditLogRow(log) {
    const tr = document.createElement('tr');

    // Format timestamp
    const timestamp = new Date(log.timestamp);
    const formattedTime = timestamp.toLocaleString();

    // Format operation type
    const operationLabels = {
        'backup_manual': 'Manual Backup',
        'backup_scheduled': 'Scheduled Backup',
        'restore': 'Restore',
        'cleanup': 'Lifecycle Cleanup',
        'delete_backup': 'Delete Backup'
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
            details.push(`Deleted: ${log.details.deleted_count}`);
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
            ${containerId ? `<div style="font-size: 0.85em; color: var(--text-secondary);">${escapeHtml(containerId)}</div>` : ''}
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

// Create total summary row
function createTotalRow(label, value) {
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

    // Build backup type display (manual/scheduled)
    const backupTypeValue = backup.backup_type || 'manual';
    const backupTypeDisplay = backupTypeValue === 'scheduled'
        ? '<span style="color: #f59e0b; font-weight: 500;"><i class="ph ph-clock-clockwise" style="margin-right: 4px;"></i>Scheduled</span>'
        : '<span style="color: var(--text-secondary);"><i class="ph ph-hand" style="margin-right: 4px;"></i>Manual</span>';

    // Build actions column (only restore button, download/delete handled by bulk actions)
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

    // Add data attributes for filtering
    tr.setAttribute('data-filename', backup.filename.toLowerCase());
    tr.setAttribute('data-type', backupType);
    tr.setAttribute('data-backup-type', backupTypeValue);
    tr.setAttribute('data-storage', storageLocation);
    tr.setAttribute('data-server', serverName.toLowerCase());
    tr.setAttribute('data-size', backup.size.toString());
    tr.setAttribute('data-created', createdDate.toLowerCase());

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
        const filename = row.getAttribute('data-filename') || '';
        const type = row.getAttribute('data-type') || '';
        const backupType = row.getAttribute('data-backup-type') || '';
        const storage = row.getAttribute('data-storage') || '';
        const server = row.getAttribute('data-server') || '';
        const created = row.getAttribute('data-created') || '';

        // Check if search term matches any field
        const matches = filename.includes(searchTerm) ||
            type.includes(searchTerm) ||
            backupType.includes(searchTerm) ||
            storage.includes(searchTerm) ||
            server.includes(searchTerm) ||
            created.includes(searchTerm);

        if (matches) {
            row.style.display = '';
            visibleCount++;
        } else {
            row.style.display = 'none';
        }
    });

    // Show "no results" message if no rows match (but only if there are backups to filter)
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
    if (currentBackupSortColumn === column) {
        currentBackupSortDirection = currentBackupSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentBackupSortColumn = column;
        currentBackupSortDirection = 'asc';
    }

    // Update sort indicators (only for backup table)
    document.querySelectorAll('#backups-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-backup-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = currentBackupSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    // Sort and re-render backups
    const sorted = sortBackupsData([...allBackups], column, currentBackupSortDirection);
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
    const backupsWrapper = document.getElementById('backups-table-wrapper');

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

// Sort Volumes
function sortVolumes(column) {
    if (currentVolumeSortColumn === column) {
        currentVolumeSortDirection = currentVolumeSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentVolumeSortColumn = column;
        currentVolumeSortDirection = 'asc';
    }

    document.querySelectorAll('#volumes-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-volume-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = currentVolumeSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortVolumesData([...allVolumes], column, currentVolumeSortDirection);
    renderVolumes(sorted);
}

function sortVolumesData(volumes, column, direction) {
    return volumes.sort((a, b) => {
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
            case 'mountpoint':
                aVal = (a.mountpoint || '').toLowerCase();
                bVal = (b.mountpoint || '').toLowerCase();
                break;
            case 'created':
                aVal = new Date(a.created || 0).getTime();
                bVal = new Date(b.created || 0).getTime();
                break;
            case 'size':
                // Parse size string (e.g., "1.5 GB" -> bytes)
                const parseSize = (sizeStr) => {
                    if (!sizeStr || sizeStr === 'N/A') return 0;
                    const match = sizeStr.match(/^([\d.]+)\s*(KB|MB|GB|TB|B)$/i);
                    if (!match) return 0;
                    const value = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 };
                    return value * (multipliers[unit] || 1);
                };
                aVal = parseSize(a.size);
                bVal = parseSize(b.size);
                break;
            default:
                return 0;
        }

        if (aVal < bVal) return direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function renderVolumes(volumes) {
    const volumesList = document.getElementById('volumes-list');
    if (!volumesList) return;

    volumesList.innerHTML = '';

    if (volumes.length === 0) {
        volumesList.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #666;">No volumes found</td></tr>';
    } else {
        volumes.forEach(volume => {
            const row = createVolumeRow(volume);
            volumesList.appendChild(row);
        });
    }
}

// Sort Images
function sortImages(column) {
    if (currentImageSortColumn === column) {
        currentImageSortDirection = currentImageSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentImageSortColumn = column;
        currentImageSortDirection = 'asc';
    }

    document.querySelectorAll('#images-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-image-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = currentImageSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortImagesData([...allImages], column, currentImageSortDirection);
    renderImages(sorted);
}

function sortImagesData(images, column, direction) {
    return images.sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            case 'id':
                aVal = (a.id || '').toLowerCase();
                bVal = (b.id || '').toLowerCase();
                break;
            case 'size':
                // Parse size string (e.g., "1.5 GB" -> bytes)
                const parseSize = (sizeStr) => {
                    if (!sizeStr) return 0;
                    const match = sizeStr.match(/^([\d.]+)\s*(KB|MB|GB|TB|B)$/i);
                    if (!match) return 0;
                    const value = parseFloat(match[1]);
                    const unit = match[2].toUpperCase();
                    const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024, TB: 1024 * 1024 * 1024 * 1024 };
                    return value * (multipliers[unit] || 1);
                };
                aVal = parseSize(a.size);
                bVal = parseSize(b.size);
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

function renderImages(images) {
    const imagesList = document.getElementById('images-list');
    if (!imagesList) return;

    imagesList.innerHTML = '';

    if (images.length === 0) {
        imagesList.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 40px; color: #666;">No images found</td></tr>';
    } else {
        images.forEach(image => {
            const row = createImageRow(image);
            imagesList.appendChild(row);
        });
    }
}

// Sort Networks
function sortNetworks(column) {
    if (currentNetworkSortColumn === column) {
        currentNetworkSortDirection = currentNetworkSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentNetworkSortColumn = column;
        currentNetworkSortDirection = 'asc';
    }

    document.querySelectorAll('#networks-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-network-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = currentNetworkSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortNetworksData([...allNetworks], column, currentNetworkSortDirection);
    renderNetworks(sorted);
}

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

// Sort Stacks
function sortStacks(column) {
    if (currentStackSortColumn === column) {
        currentStackSortDirection = currentStackSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentStackSortColumn = column;
        currentStackSortDirection = 'asc';
    }

    document.querySelectorAll('#stacks-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-stack-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = currentStackSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortStacksData([...allStacks], column, currentStackSortDirection);
    renderStacks(sorted);
}

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

// Global cancellation flag and current XHR for uploads
let uploadCancelled = false;
let currentUploadXHR = null;

// Cancel upload function
function cancelUploadAll() {
    uploadCancelled = true;
    if (currentUploadXHR) {
        currentUploadXHR.abort();
        currentUploadXHR = null;
    }
    
    // Mark all unprocessed files as cancelled immediately
    const listEl = document.getElementById('upload-progress-list');
    if (listEl) {
        const allItems = listEl.querySelectorAll('[id^="upload-item-"]');
        allItems.forEach((itemEl) => {
            const statusBadge = itemEl.querySelector('.status-badge');
            if (statusBadge) {
                const currentStatus = statusBadge.textContent.trim();
                // Mark files that are still waiting or uploading as cancelled
                if (currentStatus === 'Waiting...' || currentStatus.startsWith('Uploading...')) {
                    statusBadge.textContent = 'Cancelled';
                    statusBadge.className = 'status-badge skipped';
                    itemEl.style.borderColor = 'var(--warning)';
                }
            }
        });
    }
    
    const statusEl = document.getElementById('upload-progress-status');
    if (statusEl) {
        statusEl.innerHTML = '❌ Upload cancelled by user';
    }
    const cancelBtn = document.getElementById('upload-progress-cancel-btn');
    const closeBtn = document.getElementById('upload-progress-close-btn');
    if (cancelBtn) cancelBtn.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'block';
}

// Upload backup (handles both .tar.gz container backups and .json network backups)
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
    uploadCancelled = false;
    currentUploadXHR = null;

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    cancelBtn.style.display = 'block';
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
    const jsonFilesToRestore = []; // Track JSON files that need restore prompt

    for (let i = 0; i < files.length; i++) {
        // Check for cancellation
        if (uploadCancelled) {
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
                currentUploadXHR = xhr;
                
                // Track upload progress
                let uploadedBytes = 0;
                const startTime = Date.now();
                let lastUpdateTime = startTime;
                let lastUploadedBytes = 0;
                let currentSpeed = 0;
                
                // Update progress function
                const updateProgress = () => {
                    // Check for cancellation
                    if (uploadCancelled) {
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
                    
                    // Update status bar (no progress/speed since it's shown on each file item)
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
                    currentUploadXHR = null;
                    if (uploadCancelled) {
                        reject(new Error('Upload cancelled'));
                    } else {
                        reject(new Error('Network error during upload'));
                    }
                });
                
                xhr.addEventListener('abort', () => {
                    currentUploadXHR = null;
                    reject(new Error('Upload cancelled'));
                });
                
                // Start upload
                xhr.open('POST', '/api/upload-backup');
                
                // Add CSRF token header
                const csrfToken = getCsrfToken();
                if (csrfToken) {
                    xhr.setRequestHeader('X-CSRFToken', csrfToken);
                }
                
                xhr.send(formData);
            });
            
            // Clear XHR reference when promise resolves/rejects
            uploadPromise.finally(() => {
                currentUploadXHR = null;
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
            if (uploadCancelled || error.message === 'Upload cancelled' || error.message === 'Upload aborted') {
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
    if (uploadCancelled) {
        statusEl.innerHTML = `⏸️ Upload cancelled. ${successCount} succeeded, ${errorCount} failed.`;
    } else {
        statusEl.innerHTML = `✅ Upload complete. ${successCount} succeeded, ${errorCount} failed.`;
    }
    
    if (cancelBtn) cancelBtn.style.display = 'none';
    closeBtn.style.display = 'block';
    event.target.value = ''; // Reset file input
    currentUploadXHR = null;
    
    // Only reload backups and prompt for restore if not cancelled
    if (!uploadCancelled) {
        loadBackups();
        
        // Prompt to restore network backups if any were uploaded
        if (jsonFilesToRestore.length > 0) {
            for (const jsonFile of jsonFilesToRestore) {
                const networkName = jsonFile.networkName || 'unknown';

                showConfirmationModal(`Network backup uploaded. Restore network "${networkName}"?`, async () => {
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

                    loadNetworks();
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
        closeRestoreModal();
        showNotification(
            `✅ Container Restored Successfully!\nName: ${escapeHtml(data.container_name || 'Unknown')}`,
            'success'
        );

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
window.onclick = function (event) {
    // Safety check: ensure event exists
    if (!event || !event.target) {
        return;
    }

    const detailsModal = document.getElementById('details-modal');
    const backupModal = document.getElementById('backup-modal');
    const restoreModal = document.getElementById('restore-modal');
    const envCheckModal = document.getElementById('env-check-modal');
    const backupAllModal = document.getElementById('backup-all-modal');
    const defaultCredentialsModal = document.getElementById('default-credentials-modal');

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
    if (event.target === defaultCredentialsModal) {
        closeDefaultCredentialsModal();
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
    if (event.target === document.getElementById('delete-all-modal')) {
        closeDeleteAllModal();
    }
    if (event.target === document.getElementById('upload-progress-modal')) {
        closeUploadProgressModal();
    }
    if (event.target === document.getElementById('confirmation-modal')) {
        closeConfirmationModal();
    }
}

// Close modals on ESC key press
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        closeAllModals();
        hideAllSpinners(); // Also hide spinners that might be blocking
    }
    // Ctrl+Shift+D to debug blocking elements
    if (event.key === 'D' && event.ctrlKey && event.shiftKey) {
        event.preventDefault();
        window.debugBlockingElements();
    }
});

// Safety check: Detect if modals or spinners are blocking clicks
// This helps identify when elements get stuck and block button clicks
let clickBlockedCount = 0;
let lastClickTime = 0;

document.addEventListener('click', function (event) {
    try {
        const now = Date.now();
        const target = event.target;
        const isInteractive = target.tagName === 'BUTTON' ||
            target.tagName === 'A' ||
            target.closest('button') ||
            target.closest('a') ||
            target.closest('.nav-item');

        if (isInteractive) {
            // Check for any blocking elements
            const blockingElements = [];

            // Check for visible spinners
            const visibleSpinners = document.querySelectorAll('.spinner-container');
            visibleSpinners.forEach(spinner => {
                const display = window.getComputedStyle(spinner).display;
                if (display === 'flex' || display === 'block') {
                    const spinnerRect = spinner.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();

                    // Check if spinner overlaps with click target
                    if (!(targetRect.right < spinnerRect.left ||
                        targetRect.left > spinnerRect.right ||
                        targetRect.bottom < spinnerRect.top ||
                        targetRect.top > spinnerRect.bottom)) {
                        blockingElements.push({ type: 'spinner', element: spinner, id: spinner.id || 'unknown' });
                    }
                }
            });

            // Check for visible modals (excluding login)
            const modals = document.querySelectorAll('.modal');
            modals.forEach(modal => {
                const display = window.getComputedStyle(modal).display;
                if (display === 'block' && modal.id !== 'login-modal') {
                    const modalRect = modal.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();

                    // Check if modal overlaps with click target but target is not inside modal content
                    const modalContent = modal.querySelector('.modal-content');
                    const isInsideContent = modalContent && modalContent.contains(target);

                    if (!isInsideContent &&
                        !(targetRect.right < modalRect.left ||
                            targetRect.left > modalRect.right ||
                            targetRect.bottom < modalRect.top ||
                            targetRect.top > modalRect.bottom)) {
                        blockingElements.push({ type: 'modal', element: modal, id: modal.id || 'unknown' });
                    }
                }
            });

            // Check for elements with pointer-events: none that might be blocking
            let checkElement = target;
            while (checkElement && checkElement !== document.body) {
                const computedStyle = window.getComputedStyle(checkElement);
                if (computedStyle.pointerEvents === 'none') {
                    // Check if parent has higher z-index blocking
                    const parent = checkElement.parentElement;
                    if (parent) {
                        const parentZIndex = parseInt(window.getComputedStyle(parent).zIndex) || 0;
                        if (parentZIndex > 100) {
                            blockingElements.push({ type: 'pointer-events', element: checkElement, id: checkElement.id || checkElement.className || 'unknown' });
                        }
                    }
                }
                checkElement = checkElement.parentElement;
            }

            // If blocking elements found, log and fix
            if (blockingElements.length > 0) {
                console.warn('Click blocked by:', blockingElements.map(b => `${b.type}:${b.id}`).join(', '));
                console.warn('Target:', target.tagName, target.className, target.id);
                console.warn('Target rect:', target.getBoundingClientRect());

                clickBlockedCount++;

                // Auto-fix after 2 blocked clicks
                if (clickBlockedCount > 2) {
                    console.warn('Auto-fixing blocking elements...');

                    blockingElements.forEach(blocker => {
                        if (blocker.type === 'spinner') {
                            console.warn('Hiding spinner:', blocker.id);
                            blocker.element.style.display = 'none';
                        } else if (blocker.type === 'modal') {
                            const content = blocker.element.querySelector('.modal-content');
                            if (!content || content.offsetHeight === 0) {
                                console.warn('Closing stuck modal:', blocker.id);
                                blocker.element.style.display = 'none';
                            }
                        }
                    });

                    // Also hide all spinners as safety measure
                    hideAllSpinners();
                    clickBlockedCount = 0;
                }
            } else {
                // Reset counter if click went through
                if (now - lastClickTime > 1000) {
                    clickBlockedCount = 0;
                }
            }

            lastClickTime = now;
        }
    } catch (e) {
        console.error('Error in safety check click handler:', e);
    }
}, true);

// Additional safety: Check for stuck elements on page load and periodically
function checkForStuckElements() {
    // Check for visible spinners that shouldn't be visible
    const spinners = document.querySelectorAll('.spinner-container');
    spinners.forEach(spinner => {
        const display = window.getComputedStyle(spinner).display;
        const spinnerData = spinner.dataset; // Declare outside if/else block
        if (display === 'flex' || display === 'block') {
            // Check if spinner has been visible for more than 5 seconds
            if (!spinnerData.shownAt) {
                spinnerData.shownAt = Date.now();
            } else if (Date.now() - parseInt(spinnerData.shownAt) > 5000) {
                console.warn('Spinner has been visible for >5s, hiding:', spinner.id || 'unknown');
                spinner.style.display = 'none';
                delete spinnerData.shownAt;
            }
        } else {
            delete spinnerData.shownAt;
        }
    });
}

// Run check every 10 seconds
setInterval(checkForStuckElements, 10000);

// Also check on page visibility change
document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
        // Page became visible, check for stuck elements
        setTimeout(checkForStuckElements, 1000);
    }
});

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
        return true;
    } catch (error) {
        console.error(`Error starting container: ${error.message}`);
        showNotification(`Error starting container: ${error.message}`, 'error');
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
        showNotification(`Error restarting container: ${error.message}`, 'error');
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
        showNotification(`Error stopping container: ${error.message}`, 'error');
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
        showNotification(`Error killing container: ${error.message}`, 'error');
        return false;
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

        // Focus the terminal so typing works immediately
        term.focus();

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
    let cmdToExec = command.trim();
    const isCd = cmdToExec.startsWith('cd ');
    let currentDir = containerCwd[containerId] || '';

    // Handle cd command to maintain pseudo-state of working directory
    if (isCd) {
        const targetDir = cmdToExec.substring(3).trim();
        if (targetDir) {
            // Resolve path (handle absolute, relative, and parent directory)
            let newDir;
            if (targetDir.startsWith('/')) {
                // Absolute path
                newDir = targetDir;
            } else if (targetDir === '..') {
                // Parent directory
                if (currentDir) {
                    const parts = currentDir.split('/').filter(p => p);
                    parts.pop();
                    newDir = '/' + parts.join('/');
                } else {
                    newDir = '/';
                }
            } else if (targetDir === '.' || targetDir === '') {
                // Current directory or empty (stay where we are)
                newDir = currentDir || '/';
            } else if (currentDir) {
                // Relative path - resolve it
                let combined = currentDir.endsWith('/')
                    ? currentDir + targetDir
                    : currentDir + '/' + targetDir;
                // Normalize path
                const parts = combined.split('/').filter(p => p && p !== '.');
                const resolved = [];
                for (const part of parts) {
                    if (part === '..') {
                        if (resolved.length > 0) {
                            resolved.pop();
                        }
                    } else {
                        resolved.push(part);
                    }
                }
                newDir = '/' + resolved.join('/');
            } else {
                newDir = '/' + targetDir;
            }

            // Execute pwd command with the new working directory to verify and get actual path
            try {
                const response = await fetch(`/api/container/${containerId}/exec`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        command: 'pwd',
                        working_dir: newDir
                    })
                });

                const data = await response.json();

                if (data.exit_code === 0) {
                    // Update our cwd tracker with the actual resolved directory
                    const pwdOutput = data.output.trim();
                    const lines = pwdOutput.split('\n');
                    const actualDir = lines[lines.length - 1]; // Get last line (pwd output)
                    if (actualDir && actualDir.startsWith('/')) {
                        containerCwd[containerId] = actualDir;
                    }
                    term.write('\r\n');
                } else {
                    // Directory doesn't exist
                    term.write(`\x1b[1;31mcd: ${targetDir}: No such file or directory\x1b[0m\r\n`);
                }
            } catch (e) {
                term.write(`\x1b[1;31mConnection error: ${e.message}\x1b[0m\r\n`);
            }

            // Update prompt
            const displayDir = containerCwd[containerId] ? containerCwd[containerId].split('/').pop() || '/' : '';
            const prompt = displayDir ? `${displayDir} $ ` : '$ ';
            term.write(prompt);
            return;
        } else {
            // cd without arguments goes to home directory
            try {
                const response = await fetch(`/api/container/${containerId}/exec`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        command: 'pwd',
                        working_dir: '~'
                    })
                });

                const data = await response.json();
                if (data.exit_code === 0) {
                    const pwdOutput = data.output.trim();
                    const lines = pwdOutput.split('\n');
                    const actualDir = lines[lines.length - 1];
                    if (actualDir && actualDir.startsWith('/')) {
                        containerCwd[containerId] = actualDir;
                    }
                }
            } catch (e) {
                // Ignore errors, just reset to root
                containerCwd[containerId] = '/';
            }

            const displayDir = containerCwd[containerId] ? containerCwd[containerId].split('/').pop() || '/' : '';
            const prompt = displayDir ? `${displayDir} $ ` : '$ ';
            term.write('\r\n' + prompt);
            return;
        }
    }

    // For non-cd commands, execute with current working directory using Docker's -w flag
    try {
        const response = await fetch(`/api/container/${containerId}/exec`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: cmdToExec,
                working_dir: currentDir || undefined
            })
        });

        const data = await response.json();

        if (data.exit_code === 0) {
            if (data.output) {
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

            showNotification(successMessage, 'success');
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

            showNotification('Backup deleted successfully', 'success');
            loadBackups();
        } catch (error) {
            console.error(`Error deleting backup: ${error.message}`);
            showNotification(`Error deleting backup: ${error.message}`, 'error');
        }
    });
}

// Download selected backups - wrapper with confirmation
async function downloadAllBackups() {
    const selectedBackups = getSelectedBackups();
    
    if (selectedBackups.length === 0) {
        showNotification('Please select at least one backup to download.', 'warning');
        return;
    }

    // Show confirmation
    const warningMessage = `Download ${selectedBackups.length} selected backup file(s)?\n\nDo you want to proceed?`;
    
    showConfirmationModal(warningMessage, () => {
        // User confirmed, proceed with download
        downloadAllBackupsInternal(selectedBackups);
    });
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

// Global cancellation flag for downloads
let downloadCancelled = false;
let currentDownloadAbortController = null;

// Cancel download function
function cancelDownloadAll() {
    downloadCancelled = true;
    if (currentDownloadAbortController) {
        currentDownloadAbortController.abort();
        currentDownloadAbortController = null;
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
    console.log('downloadAllBackupsInternal called');
    const modal = document.getElementById('download-all-modal');
    const statusEl = document.getElementById('download-all-status');
    const listEl = document.getElementById('download-all-list');
    const closeBtn = document.getElementById('download-all-close-btn');
    const cancelBtn = document.getElementById('download-all-cancel-btn');

    if (!modal || !statusEl || !listEl || !closeBtn || !cancelBtn) {
        console.error('Modal elements not found:', { modal, statusEl, listEl, closeBtn, cancelBtn });
        console.error('Error: Modal elements not found. Please refresh the page.');
        return;
    }

    // Reset cancellation flag
    downloadCancelled = false;
    currentDownloadAbortController = null;

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    cancelBtn.style.display = 'block';
    statusEl.innerHTML = 'Preparing...';
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-light);">Loading files...</div>';

    try {
        // Use selected files directly instead of fetching all
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

        // Step 2: Download files sequentially, one at a time
        let completed = 0;
        let failed = 0;

        for (let i = 0; i < files.length; i++) {
            // Check for cancellation
            if (downloadCancelled) {
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
                currentDownloadAbortController = new AbortController();
                const response = await fetch(downloadUrl, {
                    signal: currentDownloadAbortController.signal
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
                    
                    // Calculate speed based on recent progress (last second)
                    if (recentElapsed > 0.1) { // Update speed every ~100ms
                        currentSpeed = (downloadedBytes - lastDownloadedBytes) / recentElapsed;
                        lastUpdateTime = Date.now();
                        lastDownloadedBytes = downloadedBytes;
                    }
                    
                    // Calculate average speed
                    const avgSpeed = elapsed > 0 ? downloadedBytes / elapsed : 0;
                    
                    // Build status text (speed/size info shown in individual file items below)
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
                        if (downloadCancelled) {
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
                    if (downloadCancelled || readError.name === 'AbortError') {
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

                // No fixed delay needed - fetch() ensures file is complete before triggering download
                // Chrome can process blob downloads sequentially without being overwhelmed

            } catch (error) {
                // Check if error is due to cancellation
                if (downloadCancelled || error.name === 'AbortError' || error.message === 'Download cancelled') {
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
        if (downloadCancelled) {
            statusEl.innerHTML = `⏸️ Download cancelled. ${completed} file(s) downloaded, ${failed} failed`;
        } else if (failed === 0) {
            statusEl.innerHTML = `✅ Successfully downloaded ${completed} file(s)!`;
        } else {
            statusEl.innerHTML = `⚠️ Completed: ${completed} file(s) downloaded, ${failed} failed`;
        }
        
        cancelBtn.style.display = 'none';
        closeBtn.style.display = 'block';
        currentDownloadAbortController = null;

    } catch (error) {
        statusEl.innerHTML = `❌ Error: ${escapeHtml(error.message)}`;
        listEl.innerHTML = '';
        closeBtn.style.display = 'block';
    }
}

function closeDownloadAllModal() {
    document.getElementById('download-all-modal').style.display = 'none';
}

// Delete selected backups
async function deleteAllBackups() {
    const selectedBackups = getSelectedBackups();
    
    if (selectedBackups.length === 0) {
        showNotification('Please select at least one backup to delete.', 'warning');
        return;
    }

    const confirmMessage = selectedBackups.length === 1
        ? `Delete backup "${selectedBackups[0]}"?\n\nThis action cannot be undone.`
        : `Delete ${selectedBackups.length} selected backups?\n\nThis will permanently remove the selected backup files.\n\nThis action CANNOT be undone!`;

    showConfirmationModal(confirmMessage, async () => {
        // User confirmed, proceed with deletion with progress modal
        deleteAllBackupsInternal(selectedBackups);
    });
}

// Delete selected backups - internal function that performs the actual deletion with progress
async function deleteAllBackupsInternal(selectedBackups) {
    const modal = document.getElementById('delete-all-modal');
    const statusEl = document.getElementById('delete-all-status');
    const listEl = document.getElementById('delete-all-list');
    const closeBtn = document.getElementById('delete-all-close-btn');

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
        const files = selectedBackups;
        const total = files.length;

        if (!files || files.length === 0) {
            throw new Error('No files to delete');
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

        statusEl.innerHTML = `Deleting ${total} backup file(s)...`;

        // Delete files sequentially, one at a time
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
                            <span style="color: var(--secondary); font-size: 0.9em; margin-left: 10px;">🗑️ Deleting...</span>
                        </div>
                    </div>
                `;
                fileEl.style.borderLeftColor = 'var(--secondary)';
                // Scroll the active deletion into view
                fileEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            statusEl.innerHTML = `Deleting ${i + 1} / ${total}: ${escapeHtml(filename)}`;

            try {
                const response = await fetch(`/api/backup/${encodeURIComponent(filename)}`, {
                    method: 'DELETE',
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to delete backup');
                }

                // Mark as completed
                completed++;
                if (fileEl) {
                    fileEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${escapeHtml(filename)}</strong>
                                <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Deleted</span>
                            </div>
                        </div>
                    `;
                    fileEl.style.borderLeftColor = 'var(--accent)';
                }

                // Small delay between deletions
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`Error deleting ${filename}:`, error);
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
        if (failed === 0) {
            statusEl.innerHTML = `✅ Successfully deleted ${completed} backup file(s)!`;
        } else {
            statusEl.innerHTML = `⚠️ Completed: ${completed} backup(s) deleted, ${failed} failed`;
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
    document.getElementById('delete-all-modal').style.display = 'none';
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
    if (volumesWrapper) {
        volumesWrapper.style.overflow = 'hidden';
        volumesWrapper.classList.add('loading-grid');
    }

    try {
        const response = await fetch('/api/volumes');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load volumes');
        }

        // Store all volumes for sorting
        allVolumes = data.volumes || [];

        // Apply current sort if any, then render
        let volumesToDisplay = allVolumes;
        if (currentVolumeSortColumn) {
            volumesToDisplay = sortVolumesData([...allVolumes], currentVolumeSortColumn, currentVolumeSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-volume-${currentVolumeSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = currentVolumeSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderVolumes(volumesToDisplay);

    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (volumesSpinner) volumesSpinner.style.display = 'none';
        if (volumesWrapper) {
            volumesWrapper.style.overflow = '';
            volumesWrapper.classList.remove('loading-grid');
        }
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
    loadingEl.style.display = 'block';
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
                fileItem.onmouseover = function () { this.style.background = '#334155'; this.style.borderColor = '#3b82f6'; };
                fileItem.onmouseout = function () { this.style.background = '#1e293b'; this.style.borderColor = '#334155'; };

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
                showNotification(`Successfully deleted ${data.deleted_count} volume(s)`, 'success');
            }
        } catch (error) {
            console.error(`Error deleting selected volumes: ${error.message}`);
            showNotification(`Failed to delete volumes: ${error.message}`, 'error');
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
    if (imagesWrapper) {
        imagesWrapper.style.overflow = 'hidden';
        imagesWrapper.classList.add('loading-grid');
    }

    try {
        const response = await fetch('/api/images');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load images');
        }

        // Store all images for sorting
        allImages = data.images || [];

        // Check for dangling images (images with <none> tag)
        const cleanupBtn = document.getElementById('cleanup-dangling-images-btn');
        const hasDanglingImages = allImages.some(image => {
            // Dangling images have <none> tag (tag field) or repository is <none>
            return (image.tag && image.tag === '<none>') ||
                (image.repository && image.repository === '<none>') ||
                image.name === '<none>:<none>';
        });

        if (cleanupBtn) {
            cleanupBtn.disabled = !hasDanglingImages;
        }

        // Apply current sort if any, then render
        let imagesToDisplay = allImages;
        if (currentImageSortColumn) {
            imagesToDisplay = sortImagesData([...allImages], currentImageSortColumn, currentImageSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-image-${currentImageSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = currentImageSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderImages(imagesToDisplay);

    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner and restore overflow
        if (imagesSpinner) imagesSpinner.style.display = 'none';
        if (imagesWrapper) {
            imagesWrapper.style.overflow = '';
            imagesWrapper.classList.remove('loading-grid');
        }
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
        <td style="vertical-align: top;">
            <div style="font-weight: 600; color: var(--text-primary);">${imageName} ${image.is_self ? '<span style="color: #999; font-size: 0.8em;">(self)</span>' : ''}</div>
            ${image.tags && image.tags.length > 1 ? `<div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">${image.tags.join(', ')}</div>` : ''}
            ${inUse && image.containers && image.containers.length > 0 ? `<div style="font-size: 0.8em; color: #999; margin-top: 4px;"><em>In use by ${image.containers.map(c => `<a href="#" onclick="event.stopPropagation(); viewContainerByName('${escapeHtml(c)}'); return false;" style="color: var(--secondary); text-decoration: underline; cursor: pointer;">${escapeHtml(c)}</a>`).join(', ')}</em></div>` : ''}
        </td>
        <td style="vertical-align: top;">
            <div style="font-family: monospace; color: var(--text-secondary); font-size: 0.9em; background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; display: inline-block;">${escapeHtml(image.id.substring(0, 12))}</div>
        </td>
        <td style="vertical-align: top;">
            <div style="color: var(--text-secondary);">${escapeHtml(image.size)}</div>
        </td>
        <td style="vertical-align: top;">
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

        let successCount = 0;
        let errors = [];

        for (const imageId of imageIds) {
            try {
                const response = await fetch(`/api/image/${imageId}/delete`, {
                    method: 'DELETE',
                });
                if (!response.ok) {
                    const data = await response.json();
                    console.error(`Failed to delete image ${imageId}: ${data.error}`);
                    errors.push(data.error || `Failed to delete image ${imageId}`);
                } else {
                    successCount++;
                }
            } catch (error) {
                console.error(`Error deleting image ${imageId}: ${error.message}`);
                errors.push(error.message);
            }
        }

        if (successCount > 0) {
            showNotification(selectedCheckboxes.length === 1 ? 'Image deleted successfully' : `${successCount} images deleted successfully`, 'success');
        }

        if (errors.length > 0) {
            showNotification(`Failed to delete ${errors.length} image(s)`, 'error');
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
            showNotification('Image deleted successfully', 'success');
            loadImages();
        } catch (error) {
            console.error(`Error deleting image: ${error.message}`);
            showNotification(`Error deleting image: ${error.message}`, 'error');
        }
    });
}

// Cleanup dangling images
async function cleanupDanglingImages() {
    const cleanupBtn = document.getElementById('cleanup-dangling-images-btn');
    if (cleanupBtn && cleanupBtn.disabled) {
        return; // Don't proceed if button is disabled
    }

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
            showNotification(data.message, 'success');
            // Reload images to update button state
            loadImages();
        } catch (error) {
            console.error(`Error cleaning up dangling images: ${error.message}`);
            showNotification(`Error cleaning up dangling images: ${error.message}`, 'error');
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
    if (networksWrapper) {
        networksWrapper.style.overflow = 'hidden';
        networksWrapper.classList.add('loading-grid');
    }

    try {
        const response = await fetch('/api/networks');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load networks');
        }

        // Store all networks for sorting
        allNetworks = data.networks || [];

        // Apply current sort if any, then render
        let networksToDisplay = allNetworks;
        if (currentNetworkSortColumn) {
            networksToDisplay = sortNetworksData([...allNetworks], currentNetworkSortColumn, currentNetworkSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-network-${currentNetworkSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = currentNetworkSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderNetworks(networksToDisplay);

    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
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

    // Skip default networks (bridge, host, none) and Docker Swarm system networks
    // docker_gwbridge and ingress are automatically created by Docker Swarm and used by ingress-sbox
    const isDefault = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress'].includes(network.name) ||
        (network.scope === 'swarm' && network.name.startsWith('docker_gwbridge'));

    // Count ALL containers using this network (including stopped containers)
    // network.containers from backend includes all containers (running and stopped)
    const containerCount = network.containers !== undefined ? network.containers : 0;

    // Show container count for bridge, host, and none networks (can be used by user containers) and non-built-in networks
    // Hide for docker_gwbridge and ingress which only have Docker Swarm system containers
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

    // Build actions column - buttons side by side
    let actionsHtml = '<div class="btn-group" style="display: flex; gap: 4px; flex-wrap: nowrap;">';

    // View Containers button if network has containers (count > 0)
    if (containerCount > 0) {
        actionsHtml += `<button class="btn btn-secondary btn-sm" onclick="viewNetworkContainers('${escapeHtml(network.name)}')" title="View containers using this network"><i class="ph ph-cube"></i> View Containers</button>`;
    }

    // Backup button for non-default networks
    if (!isDefault) {
        actionsHtml += `<button class="btn btn-warning btn-sm" onclick="backupNetwork('${escapeHtml(network.id)}', '${escapeHtml(network.name)}')" title="Backup network"><i class="ph ph-floppy-disk"></i> Backup</button>`;
    }

    // Delete button for non-default networks - disabled/ghosted when containers > 0
    if (!isDefault) {
        if (containerCount > 0) {
            actionsHtml += `<button class="btn btn-danger btn-sm" style="opacity: 0.5; cursor: not-allowed;" title="Cannot delete network with ${containerCount} container(s) using it" disabled><i class="ph ph-trash"></i> Delete</button>`;
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
            showNotification(`Network backed up successfully: ${data.filename}`, 'success');
            loadNetworks();
            // Refresh backups list if we're on the backups tab
            const backupsTab = document.getElementById('backups-tab');
            if (backupsTab && backupsTab.style.display !== 'none') {
                loadBackups();
            }
        } catch (error) {
            console.error(`Error backing up network: ${error.message}`);
            showNotification(`Error backing up network: ${error.message}`, 'error');
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
            showNotification('Network deleted successfully', 'success');
            loadNetworks();
        } catch (error) {
            console.error(`Error deleting network: ${error.message}`);
            showNotification(`Error deleting network: ${error.message}`, 'error');
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


// --- System Stats Polling (Top Bar) ---
let systemStatsInterval = null; // Interval for system stats (top bar)
let systemStatsCache = null; // Cache for system stats
let consecutiveSystemStatsErrors = 0;

// ===== STACKS MANAGEMENT =====

let selectedStacks = new Set();

async function loadStacks() {
    const errorEl = document.getElementById('stacks-error');
    const stacksList = document.getElementById('stacks-list');
    const stacksSpinner = document.getElementById('stacks-spinner');
    const stacksWrapper = document.getElementById('stacks-table-wrapper');

    errorEl.style.display = 'none';
    stacksList.innerHTML = '';

    // Show spinner
    if (stacksSpinner) stacksSpinner.style.display = 'flex';
    if (stacksWrapper) stacksWrapper.classList.add('loading-grid');

    try {
        const response = await fetch('/api/stacks');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load stacks');
        }

        // Store all stacks for sorting
        allStacks = data.stacks || [];

        // Apply current sort if any, then render
        let stacksToDisplay = allStacks;
        if (currentStackSortColumn) {
            stacksToDisplay = sortStacksData([...allStacks], currentStackSortColumn, currentStackSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-stack-${currentStackSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = currentStackSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderStacks(stacksToDisplay);

    } catch (error) {
        errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
        errorEl.style.display = 'block';
    } finally {
        // Hide spinner
        if (stacksSpinner) stacksSpinner.style.display = 'none';
        if (stacksWrapper) stacksWrapper.classList.remove('loading-grid');
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
    };

    // Start filtering after a short delay to allow containers to load
    setTimeout(filterContainers, 500);
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
    if (systemStatsInterval) {
        clearInterval(systemStatsInterval);
        systemStatsInterval = null;
    }

    // Update system stats immediately (always needed for top bar)
    updateSystemStats();

    // System stats (top bar) - update every 5 seconds
    // Apply cached stats immediately if available
    if (systemStatsCache) {
        applyCachedSystemStats();
    }

    systemStatsInterval = setInterval(() => {
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
            if (systemStatsInterval) {
                clearInterval(systemStatsInterval);
                systemStatsInterval = null;
            }
            return;
        }

        if (!response.ok || data.error) {
            consecutiveSystemStatsErrors++;
            console.error('System stats API error:', response.status, data.error || response.statusText);

            // If we have cached stats, use them
            if (systemStatsCache && consecutiveSystemStatsErrors < 5) {
                applyCachedSystemStats();
            }

            // If too many consecutive errors, restart polling after a delay
            if (consecutiveSystemStatsErrors >= 10) {
                console.warn('Too many system stats errors, restarting polling...');
                consecutiveSystemStatsErrors = 0;
                if (systemStatsInterval) {
                    clearInterval(systemStatsInterval);
                    systemStatsInterval = null;
                }
                setTimeout(() => {
                    startStatsPolling();
                }, 5000);
            }
            return;
        }

        // Reset error counter on success
        consecutiveSystemStatsErrors = 0;

        // Update cache
        systemStatsCache = {
            cpu_percent: data.cpu_percent || 0,
            memory_used_mb: data.memory_used_mb || 0,
            memory_total_mb: data.memory_total_mb || 0,
            memory_percent: data.memory_percent || 0,
            timestamp: Date.now()
        };

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
        consecutiveSystemStatsErrors++;
        console.error('Failed to update system stats:', error);

        // If fetch was aborted (timeout), use cached stats
        if (error.name === 'AbortError') {
            console.warn('System stats request timed out, using cached values');
            if (systemStatsCache) {
                applyCachedSystemStats();
            }
        }

        // If too many consecutive errors, restart polling
        if (consecutiveSystemStatsErrors >= 10) {
            console.warn('Too many system stats errors, restarting polling...');
            consecutiveSystemStatsErrors = 0;
            if (systemStatsInterval) {
                clearInterval(systemStatsInterval);
                systemStatsInterval = null;
            }
            setTimeout(() => {
                startStatsPolling();
            }, 5000);
        }
    }
}

function applyCachedSystemStats() {
    if (!systemStatsCache) return;

    const cpuEl = document.getElementById('system-cpu');
    const ramEl = document.getElementById('system-ram');

    if (cpuEl) {
        cpuEl.textContent = `${systemStatsCache.cpu_percent}%`;
    }

    if (ramEl) {
        const memUsed = systemStatsCache.memory_used_mb || 0;
        const memTotal = systemStatsCache.memory_total_mb || 0;
        const memPercent = systemStatsCache.memory_percent || 0;
        ramEl.textContent = `${Math.round(memUsed)} MB / ${Math.round(memTotal)} MB (${memPercent.toFixed(1)}%)`;
    }
}


// Initialize on page load
document.addEventListener('DOMContentLoaded', async function () {
    // Check authentication status first and wait for it to complete
    await checkAuthStatus();

    // Load server name only if user is authenticated
    if (isAuthenticated) {
        await loadServerName();
    }

    // Start time display - always visible in top bar
    startTimeDisplay();

    // Show dashboard section by default
    showSection('dashboard', document.querySelector('.nav-item'));

    // Start stats polling only after auth check is complete
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

    let successCount = 0;
    for (const containerId of selectedIds) {
        if (await startContainer(containerId)) {
            successCount++;
        }
    }

    if (successCount > 0) {
        const msg = successCount === 1 ? 'Container started successfully.' : `${successCount} containers started successfully.`;
        showNotification(msg, 'success');
    }

    resetSelection();
    setTimeout(() => loadContainers(), 300);
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

    if (successCount > 0) {
        const msg = successCount === 1 ? 'Container restarted successfully.' : `${successCount} containers restarted successfully.`;
        showNotification(msg, 'success');
    }

    resetSelection();
    setTimeout(() => loadContainers(), 300);
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

    if (successCount > 0) {
        const msg = successCount === 1 ? 'Container stopped successfully.' : `${successCount} containers stopped successfully.`;
        showNotification(msg, 'success');
    }

    resetSelection();
    setTimeout(() => loadContainers(), 300);
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

    if (successCount > 0) {
        const msg = successCount === 1 ? 'Container killed successfully.' : `${successCount} containers killed successfully.`;
        showNotification(msg, 'success');
    }

    resetSelection();
    setTimeout(() => loadContainers(), 300);
}

async function backupSelectedContainers() {
    const selectedIds = getSelectedContainerIds();
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
    uniqueIds.forEach(id => {
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

// --- Backup Scheduler ---
let schedulerConfig = null;
let schedulerLoadingConfig = false; // Flag to prevent auto-save during initial load

async function loadSchedulerConfig() {
    schedulerLoadingConfig = true; // Prevent auto-save during load
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

        schedulerConfig = await response.json();

        // Update UI with config
        document.getElementById('schedule-type').value = schedulerConfig.schedule_type || 'daily';
        document.getElementById('schedule-hour').value = schedulerConfig.hour || 2;
        document.getElementById('day-of-week').value = schedulerConfig.day_of_week || 0;
        document.getElementById('schedule-lifecycle').value = schedulerConfig.lifecycle || 7;

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
        schedulerLoadingConfig = false; // Re-enable auto-save after load completes
    }
}

async function loadSchedulerContainers() {
    const spinner = document.getElementById('scheduler-containers-spinner');
    const list = document.getElementById('scheduler-containers-list');
    const wrapper = document.getElementById('scheduler-containers-table-wrapper');

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
        const selectedIds = schedulerConfig ? (schedulerConfig.selected_containers || []) : [];

        // Update select all checkbox
        const selectAllCheckbox = document.getElementById('scheduler-select-all');
        if (selectAllCheckbox) {
            const visibleContainers = containers.filter(c => !c.is_self);
            const allSelected = visibleContainers.length > 0 && visibleContainers.every(c => selectedIds.includes(c.id));
            selectAllCheckbox.checked = allSelected;
            selectAllCheckbox.indeterminate = !allSelected && visibleContainers.some(c => selectedIds.includes(c.id));
        }

        if (containers.length === 0) {
            list.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 40px; color: var(--text-secondary);">No containers found</td></tr>';
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
                        checkbox.checked = !checkbox.checked;
                        updateSelectAllCheckbox();
                    }
                };

                const statusLower = container.status.toLowerCase();
                const statusClass = statusLower === 'running' ? 'status-running' : 'status-stopped';
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

                list.appendChild(tr);
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

function toggleSelectAllSchedulerContainers() {
    const selectAllCheckbox = document.getElementById('scheduler-select-all');
    const checkboxes = document.querySelectorAll('.scheduler-container-checkbox');
    const isChecked = selectAllCheckbox.checked;

    checkboxes.forEach(checkbox => {
        checkbox.checked = isChecked;
    });
    updateSelectAllCheckbox();
    autoSaveSchedulerConfig();
}

function updateSelectAllCheckbox() {
    const selectAllCheckbox = document.getElementById('scheduler-select-all');
    const checkboxes = document.querySelectorAll('.scheduler-container-checkbox');

    if (checkboxes.length === 0) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }

    const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
    selectAllCheckbox.checked = checkedCount === checkboxes.length;
    selectAllCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

function updateScheduleUI() {
    const scheduleType = document.getElementById('schedule-type').value;
    const dayOfWeekContainer = document.getElementById('day-of-week-container');

    if (scheduleType === 'weekly') {
        dayOfWeekContainer.style.display = 'block';
    } else {
        dayOfWeekContainer.style.display = 'none';
    }

    // Auto-save when schedule type changes
    autoSaveSchedulerConfig();
}

function updateSchedulerStatus() {
    const statusIcon = document.getElementById('scheduler-status-icon');
    const statusText = document.getElementById('scheduler-status-text');
    const nextRun = document.getElementById('scheduler-next-run');

    if (!statusIcon || !statusText) return;

    if (!schedulerConfig) {
        statusIcon.textContent = '⏸️';
        statusText.textContent = 'Scheduler disabled (no containers selected)';
        if (nextRun) nextRun.style.display = 'none';
        return;
    }

    const enabled = schedulerConfig.enabled;
    const selectedCount = schedulerConfig.selected_containers ? schedulerConfig.selected_containers.length : 0;

    if (enabled && selectedCount > 0) {
        statusIcon.textContent = '✅';
        statusText.textContent = `Scheduler enabled: ${selectedCount} container(s) selected`;

        if (schedulerConfig.next_run && nextRun) {
            const nextRunDate = new Date(schedulerConfig.next_run);
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


// Debounce timer for auto-save
let schedulerAutoSaveTimer = null;

function autoSaveSchedulerConfig() {
    // Don't auto-save during initial config load
    if (schedulerLoadingConfig) {
        return;
    }

    // Clear existing timer
    if (schedulerAutoSaveTimer) {
        clearTimeout(schedulerAutoSaveTimer);
    }

    // Debounce: wait 500ms after last change before saving
    schedulerAutoSaveTimer = setTimeout(() => {
        saveSchedulerConfig(true); // true = silent save (no notification)
    }, 500);
}

async function saveSchedulerConfig(silent = false) {
    const errorEl = document.getElementById('scheduler-error');
    errorEl.style.display = 'none';

    try {
        const scheduleType = document.getElementById('schedule-type').value;
        const hour = parseInt(document.getElementById('schedule-hour').value);
        const dayOfWeek = scheduleType === 'weekly' ? parseInt(document.getElementById('day-of-week').value) : null;
        const lifecycle = parseInt(document.getElementById('schedule-lifecycle').value);

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
        schedulerConfig = result.config;

        updateSchedulerStatus();

        if (!silent) {
            showNotification('Scheduler configuration saved successfully!', 'success');
        }
    } catch (error) {
        console.error('Error saving scheduler config:', error);
        showError('scheduler-error', `Error saving scheduler config: ${error.message}`);
    }
}

function showError(elementId, message) {
    const errorEl = document.getElementById(elementId);
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    }
}

let timeDisplayInterval = null;

function startTimeDisplay() {
    // Clear any existing interval
    if (timeDisplayInterval) {
        clearInterval(timeDisplayInterval);
    }

    // Update time immediately
    updateTimeDisplay();

    // Update every second
    timeDisplayInterval = setInterval(updateTimeDisplay, 1000);
}

function stopTimeDisplay() {
    if (timeDisplayInterval) {
        clearInterval(timeDisplayInterval);
        timeDisplayInterval = null;
    }
}

function updateTimeDisplay() {
    const timeEl = document.getElementById('current-time');
    if (timeEl) {
        const now = new Date();
        // Use DD-MM-YYYY HH:MM:SS format
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const formatted = `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
        timeEl.textContent = formatted;
    }
}

// Storage Settings Functions
let currentStorageSettings = null;

async function loadStorageSettings() {
    try {
        const response = await fetch('/api/storage/settings');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load storage settings');
        }

        currentStorageSettings = data;
        const toggle = document.getElementById('storage-toggle');
        if (toggle) {
            toggle.checked = data.storage_type === 's3';
        }
    } catch (error) {
        console.error('Error loading storage settings:', error);
    }
}

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

function showLocalStorageConfirmModal() {
    const modal = document.getElementById('local-storage-confirm-modal');
    if (!modal) return;
    modal.style.display = 'block';
}

function closeLocalStorageConfirmModal() {
    const modal = document.getElementById('local-storage-confirm-modal');
    const toggle = document.getElementById('storage-toggle');

    if (modal) {
        modal.style.display = 'none';
    }

    // Reset toggle if user cancelled
    if (toggle && currentStorageSettings && currentStorageSettings.storage_type === 's3') {
        toggle.checked = true;
    }
}

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

async function showS3ConfigModal() {
    const modal = document.getElementById('s3-config-modal');
    const errorEl = document.getElementById('s3-config-error');
    const successEl = document.getElementById('s3-config-success');

    if (!modal) return;

    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    // Always reload settings from database to get latest values
    try {
        const response = await fetch('/api/storage/settings');
        const data = await response.json();

        if (response.ok && data) {
            // Populate form fields with saved settings
            document.getElementById('s3-bucket').value = data.s3_bucket || '';
            document.getElementById('s3-region').value = data.s3_region || '';
            document.getElementById('s3-access-key').value = data.s3_access_key || '';
            // Secret key is masked for security - leave field empty or show placeholder
            // User must enter secret key if they want to change it
            const secretKeyField = document.getElementById('s3-secret-key');
            if (data.s3_secret_key === '***') {
                // Secret key exists but is masked - show placeholder
                secretKeyField.value = '';
                secretKeyField.placeholder = 'Enter new secret key (leave blank to keep existing)';
            } else {
                secretKeyField.value = '';
                secretKeyField.placeholder = '';
            }

            // Update currentStorageSettings (without secret key for security)
            currentStorageSettings = data;
        }
    } catch (error) {
        console.error('Error loading storage settings:', error);
        // If loading fails, try to use cached settings
        if (currentStorageSettings) {
            document.getElementById('s3-bucket').value = currentStorageSettings.s3_bucket || '';
            document.getElementById('s3-region').value = currentStorageSettings.s3_region || '';
            document.getElementById('s3-access-key').value = currentStorageSettings.s3_access_key || '';
            // Don't populate secret key from cache for security
            const secretKeyField = document.getElementById('s3-secret-key');
            secretKeyField.value = '';
            if (currentStorageSettings.s3_secret_key === '***') {
                secretKeyField.placeholder = 'Enter new secret key (leave blank to keep existing)';
            }
        }
    }

    modal.style.display = 'block';
}

function closeS3ConfigModal() {
    const modal = document.getElementById('s3-config-modal');
    const toggle = document.getElementById('storage-toggle');

    if (modal) {
        modal.style.display = 'none';
    }

    // Reset toggle if settings weren't saved
    if (toggle && currentStorageSettings && currentStorageSettings.storage_type === 'local') {
        toggle.checked = false;
    }
}

async function testS3Connection() {
    const bucket = document.getElementById('s3-bucket').value.trim();
    const region = document.getElementById('s3-region').value.trim();
    const accessKey = document.getElementById('s3-access-key').value.trim();
    const secretKey = document.getElementById('s3-secret-key').value.trim();

    // For testing, secret key is required
    if (!bucket || !region || !accessKey || !secretKey) {
        showNotification('Please fill in all fields (including secret key for testing)', 'warning');
        return;
    }

    // Show loading state
    const testBtn = event.target.closest('button');
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
            showNotification(data.message || 'S3 connection test successful!', 'success');
        } else {
            showNotification(data.message || 'S3 connection test failed', 'error');
        }
    } catch (error) {
        showNotification(`Error testing connection: ${error.message}`, 'error');
    } finally {
        testBtn.disabled = false;
        testBtn.innerHTML = originalText;
    }
}

// Deprecated: use showNotification directly
function showS3Error(message) {
    showNotification(message, 'error');
}

async function saveS3Config(event) {
    event.preventDefault();

    const bucket = document.getElementById('s3-bucket').value.trim();
    const region = document.getElementById('s3-region').value.trim();
    const accessKey = document.getElementById('s3-access-key').value.trim();
    const secretKey = document.getElementById('s3-secret-key').value.trim();

    // Validate required fields (secret key can be empty if preserving existing)
    if (!bucket || !region || !accessKey) {
        showNotification('Please fill in bucket, region, and access key', 'warning');
        return;
    }

    // If secret key is empty, send masked value to preserve existing
    const secretKeyToSend = secretKey || '***';

    // Close modal immediately as requested
    closeS3ConfigModal();
    showNotification('Saving S3 configuration...', 'info');

    await saveStorageSettings('s3', bucket, region, accessKey, secretKeyToSend);
}

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
        if (storageType === 's3') {
            showNotification('S3 settings saved successfully!', 'success');
        } else {
            showNotification('Switched to local storage successfully', 'success');
        }

        // Refresh backup list
        loadBackups();

    } catch (error) {
        console.error('Error saving storage settings:', error);
        showNotification(`Error saving settings: ${error.message}`, 'error');

        // If it was an S3 save that failed, helpful to let the user know they might need to try again
        if (storageType === 's3') {
            // We could re-open the modal here, but keeping it simple as per "close immediately"
        }
    }
}

// --- Settings Functions ---

async function loadServerName() {
    try {
        const response = await apiRequest('/api/ui/settings/server_name');
        const serverNameDisplay = document.getElementById('server-name-display');
        if (!serverNameDisplay) return;

        if (response.ok) {
            const data = await response.json();
            // Check if value is null, undefined, or empty - only then use default
            let serverName = data.value;
            if (serverName === null || serverName === undefined || serverName === '') {
                serverName = 'My Server Name';
            } else {
                serverName = serverName.trim() || 'My Server Name';
            }
            
            // Update only the text span, preserve the icon
            const span = serverNameDisplay.querySelector('span');
            if (span) {
                span.textContent = serverName;
            } else {
                serverNameDisplay.textContent = serverName;
            }
            
            // Show the panel
            serverNameDisplay.style.display = 'flex';
        } else {
            // If error, use default and show
            const span = serverNameDisplay.querySelector('span');
            if (span) {
                span.textContent = 'My Server Name';
            } else {
                serverNameDisplay.textContent = 'My Server Name';
            }
            serverNameDisplay.style.display = 'flex';
        }
    } catch (error) {
        console.error('Error loading server name:', error);
        // On error, show default
        const serverNameDisplay = document.getElementById('server-name-display');
        if (serverNameDisplay) {
            const span = serverNameDisplay.querySelector('span');
            if (span) {
                span.textContent = 'My Server Name';
            } else {
                serverNameDisplay.textContent = 'My Server Name';
            }
            serverNameDisplay.style.display = 'flex';
        }
    }
}

function showSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;

    // Hide error/success messages
    document.getElementById('settings-error').style.display = 'none';
    document.getElementById('settings-success').style.display = 'none';

    // Load current settings
    loadSettingsForm();

    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';

    // Focus and select all text in the input field
    setTimeout(() => {
        const serverNameInput = document.getElementById('server-name');
        if (serverNameInput) {
            serverNameInput.focus();
            serverNameInput.select();
        }
    }, 100); // Small delay to ensure modal is fully rendered
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

async function loadSettingsForm() {
    try {
        const response = await apiRequest('/api/ui/settings/server_name');
        if (response.ok) {
            const data = await response.json();
            const serverNameInput = document.getElementById('server-name');
            if (serverNameInput) {
                serverNameInput.value = data.value || 'My Server Name';
            }
        } else {
            // Use default if not set
            const serverNameInput = document.getElementById('server-name');
            if (serverNameInput) {
                serverNameInput.value = 'My Server Name';
            }
        }
    } catch (error) {
        console.error('Error loading settings:', error);
        // Use default on error
        const serverNameInput = document.getElementById('server-name');
        if (serverNameInput) {
            serverNameInput.value = 'My Server Name';
        }
    }
}

async function saveSettings(event) {
    event.preventDefault();

    const serverName = document.getElementById('server-name').value.trim() || 'My Server Name';

    // Hide previous messages
    document.getElementById('settings-error').style.display = 'none';
    document.getElementById('settings-success').style.display = 'none';

    try {
        const response = await apiRequest('/api/ui/settings/server_name', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                value: serverName
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to save settings');
        }

        // Update display in top bar
        await loadServerName();

        // Show toast notification
        showNotification('Server name saved successfully', 'success');

        // Close modal immediately
        closeSettingsModal();

    } catch (error) {
        console.error('Error saving settings:', error);
        showNotification(`Error saving settings: ${error.message}`, 'error');
    }
}

// Close settings modal when clicking outside (set up in DOMContentLoaded)
document.addEventListener('DOMContentLoaded', function() {
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.addEventListener('click', function(e) {
            if (e.target === settingsModal) {
                closeSettingsModal();
            }
        });
    }
});

