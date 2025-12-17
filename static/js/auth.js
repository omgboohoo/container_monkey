// Authentication Module
// Handles login, logout, password/username changes, and user menu

// Check authentication status on page load
async function checkAuthStatus() {
    try {
        const response = await fetch('/api/auth-status');
        const data = await response.json();

        if (data.logged_in) {
            window.AppState.isAuthenticated = true;
            window.AppState.currentUsername = data.username || 'monkey';
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('user-menu-container').style.display = 'block';
            document.getElementById('user-menu-username').textContent = window.AppState.currentUsername;
        } else {
            window.AppState.isAuthenticated = false;
            document.getElementById('login-modal').style.display = 'block';
            document.getElementById('user-menu-container').style.display = 'none';
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
        // Show login modal on error
        document.getElementById('login-modal').style.display = 'block';
    }
}

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
            window.AppState.isAuthenticated = true;
            window.AppState.currentUsername = data.username;
            document.getElementById('login-modal').style.display = 'none';
            document.getElementById('user-menu-container').style.display = 'block';
            document.getElementById('user-menu-username').textContent = window.AppState.currentUsername;
            document.getElementById('login-form').reset();

            // Load server name after login (from settings module)
            if (window.loadServerName) {
                await window.loadServerName();
            }

            // Check if default credentials were used
            if (data.is_default_credentials) {
                showDefaultCredentialsModal();
            }

            // Reload page data
            // Stats polling will be started automatically by loadContainers() if containers section is active
            // For other sections, start stats polling immediately
            if (document.querySelector('.content-section.active')) {
                const activeSection = document.querySelector('.content-section.active').id.replace('-section', '');
                if (window.showSection) {
                    window.showSection(activeSection);
                }

                // Start stats polling for non-containers sections (containers section will start it after loading)
                if (activeSection !== 'containers' && window.startStatsPolling) {
                    window.startStatsPolling();
                }
            } else {
                // No active section, start stats polling
                if (window.startStatsPolling) {
                    window.startStatsPolling();
                }
            }
        } else {
            if (window.showNotification) {
                window.showNotification(data.error || 'Login failed', 'error');
            }
        }
    } catch (error) {
        if (window.showNotification) {
            window.showNotification('Network error. Please try again.', 'error');
        }
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
            window.AppState.isAuthenticated = false;
            window.AppState.currentUsername = '';
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
    if (dropdown) {
        dropdown.classList.toggle('show');
    }
}

// Close user menu when clicking outside
document.addEventListener('click', function (event) {
    const userMenuContainer = document.getElementById('user-menu-container');
    if (userMenuContainer && !userMenuContainer.contains(event.target)) {
        const dropdown = document.getElementById('user-menu-dropdown');
        if (dropdown) {
            dropdown.classList.remove('show');
        }
    }
});

// Show change password modal
function showDefaultCredentialsModal() {
    const modal = document.getElementById('default-credentials-modal');
    if (modal) {
        modal.style.display = 'block';
    }
}

function closeDefaultCredentialsModal() {
    const modal = document.getElementById('default-credentials-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function showChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    const dropdown = document.getElementById('user-menu-dropdown');
    const form = document.getElementById('change-password-form');
    const errorDiv = document.getElementById('change-password-error');
    const successDiv = document.getElementById('change-password-success');

    if (!modal) return;

    if (dropdown) dropdown.classList.remove('show');
    if (form) form.reset();
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
    
    resetPasswordPolicyIndicators();
    modal.style.display = 'block';
}

// Close change password modal
function closeChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    const form = document.getElementById('change-password-form');
    const errorDiv = document.getElementById('change-password-error');
    const successDiv = document.getElementById('change-password-success');

    if (!modal) return;

    modal.style.display = 'none';
    if (form) form.reset();
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
    
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
        if (icon) {
            icon.className = 'ph ph-check-circle';
            icon.style.color = 'var(--success)';
        }
        if (text) {
            text.style.color = 'var(--text-primary)';
            text.style.textDecoration = 'line-through';
        }
    } else {
        if (icon) {
            icon.className = 'ph ph-circle';
            icon.style.color = 'var(--text-light)';
        }
        if (text) {
            text.style.color = 'var(--text-light)';
            text.style.textDecoration = 'none';
        }
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

    if (!errorDiv || !successDiv) return;

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
        if (window.showNotification) {
            window.showNotification(passwordValidation.error, 'error');
        }
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
            if (window.showNotification) {
                window.showNotification(data.message || 'Password changed successfully.', 'success');
            }
            const form = document.getElementById('change-password-form');
            if (form) form.reset();

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
    const modal = document.getElementById('change-username-modal');
    const dropdown = document.getElementById('user-menu-dropdown');
    const form = document.getElementById('change-username-form');
    const errorDiv = document.getElementById('change-username-error');
    const successDiv = document.getElementById('change-username-success');

    if (!modal) return;

    if (dropdown) dropdown.classList.remove('show');
    if (form) form.reset();
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
    
    modal.style.display = 'block';
}

// Close change username modal
function closeChangeUsernameModal() {
    const modal = document.getElementById('change-username-modal');
    const form = document.getElementById('change-username-form');
    const errorDiv = document.getElementById('change-username-error');
    const successDiv = document.getElementById('change-username-success');

    if (!modal) return;

    modal.style.display = 'none';
    if (form) form.reset();
    if (errorDiv) errorDiv.style.display = 'none';
    if (successDiv) successDiv.style.display = 'none';
}

// Handle change username
async function handleChangeUsername(event) {
    event.preventDefault();
    const currentPassword = document.getElementById('current-password-username').value;
    const newUsername = document.getElementById('new-username').value.trim();
    const errorDiv = document.getElementById('change-username-error');
    const successDiv = document.getElementById('change-username-success');
    const successMessage = document.getElementById('change-username-success-message');

    if (!errorDiv || !successDiv || !successMessage) return;

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
            const form = document.getElementById('change-username-form');
            if (form) form.reset();

            // Update username in UI
            if (data.username && data.username !== window.AppState.currentUsername) {
                window.AppState.currentUsername = data.username;
                const usernameEl = document.getElementById('user-menu-username');
                if (usernameEl) {
                    usernameEl.textContent = data.username;
                }
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

// Export functions to window for HTML access
window.checkAuthStatus = checkAuthStatus;
window.handleLogin = handleLogin;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.showDefaultCredentialsModal = showDefaultCredentialsModal;
window.closeDefaultCredentialsModal = closeDefaultCredentialsModal;
window.showChangePasswordModal = showChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.handleChangePassword = handleChangePassword;
window.showChangeUsernameModal = showChangeUsernameModal;
window.closeChangeUsernameModal = closeChangeUsernameModal;
window.handleChangeUsername = handleChangeUsername;
window.validatePasswordStrength = validatePasswordStrength;
window.updatePolicyIndicator = updatePolicyIndicator;
window.resetPasswordPolicyIndicators = resetPasswordPolicyIndicators;

