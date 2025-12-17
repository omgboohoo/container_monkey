// UI Utilities Module
// Contains helper functions for modals, notifications, sidebar, and other UI interactions

// Time display state
let timeDisplayInterval = null;

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show notification toast
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    container.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => {
            if (container.contains(notification)) {
                container.removeChild(notification);
            }
        }, 500);
    }, 5000);
}

// Close modal
function closeModal() {
    document.getElementById('details-modal').style.display = 'none';
    document.getElementById('backup-modal').style.display = 'none';
    window.AppState.currentContainerId = null;
}

// Close all modals (safety function to prevent stuck modals)
function closeAllModals() {
    const modals = [
        'details-modal',
        'inspect-modal',
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
        'default-credentials-modal',
        's3-config-modal',
        'settings-modal'
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

// Show confirmation modal
function showConfirmationModal(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirmation-modal');
    const messageEl = document.getElementById('confirmation-message');
    const confirmBtn = document.getElementById('confirmation-confirm-btn');
    const cancelBtn = document.getElementById('confirmation-cancel-btn');

    if (!modal || !messageEl || !confirmBtn || !cancelBtn) {
        console.error('Confirmation modal elements not found');
        return;
    }

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
    if (modal) {
        modal.style.display = 'none';
    }
}

function showAlertModal(message, title = 'Alert') {
    const modal = document.getElementById('confirmation-modal');
    const titleEl = document.getElementById('confirmation-title');
    const messageEl = document.getElementById('confirmation-message');
    const confirmBtn = document.getElementById('confirmation-confirm-btn');
    const cancelBtn = document.getElementById('confirmation-cancel-btn');

    if (!modal || !titleEl || !messageEl || !confirmBtn || !cancelBtn) {
        console.error('Confirmation modal elements not found');
        return;
    }

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

// Toggle sidebar collapse
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    const isCollapsed = sidebar.classList.toggle('collapsed');
    
    // Save state to localStorage
    localStorage.setItem('sidebarCollapsed', isCollapsed);
}

// Initialize sidebar state from localStorage
function initSidebarState() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    
    const savedState = localStorage.getItem('sidebarCollapsed');
    
    if (savedState === 'true') {
        sidebar.classList.add('collapsed');
    }
}

// Start time display
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

// Safety check: Detect if modals or spinners are blocking clicks
function checkForStuckElements() {
    // Check for visible spinners that shouldn't be visible
    const spinners = document.querySelectorAll('.spinner-container');
    spinners.forEach(spinner => {
        const display = window.getComputedStyle(spinner).display;
        const spinnerData = spinner.dataset;
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

// Setup click blocking detection
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

            // If blocking elements found, log and fix
            if (blockingElements.length > 0) {
                console.warn('Click blocked by:', blockingElements.map(b => `${b.type}:${b.id}`).join(', '));
                window.AppState.clickBlockedCount++;

                // Auto-fix after 2 blocked clicks
                if (window.AppState.clickBlockedCount > 2) {
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
                    window.AppState.clickBlockedCount = 0;
                }
            } else {
                // Reset counter if click went through
                if (now - window.AppState.lastClickTime > 1000) {
                    window.AppState.clickBlockedCount = 0;
                }
            }

            window.AppState.lastClickTime = now;
        }
    } catch (e) {
        console.error('Error in safety check click handler:', e);
    }
}, true);

// Run check every 10 seconds
setInterval(checkForStuckElements, 10000);

// Also check on page visibility change
document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
        checkForStuckElements();
    }
});

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
    if (event.target === backupAllModal && !window.AppState.backupAllInProgress) {
        backupAllModal.style.display = 'none';
    }
    if (event.target === defaultCredentialsModal) {
        // Will be handled by auth module
    }
    if (event.target === document.getElementById('attach-console-modal')) {
        // Will be handled by console module
    }
    if (event.target === document.getElementById('logs-modal')) {
        // Will be handled by logs module
    }
    if (event.target === document.getElementById('download-all-modal')) {
        // Will be handled by backups module
    }
    if (event.target === document.getElementById('delete-all-modal')) {
        // Will be handled by backups module
    }
    if (event.target === document.getElementById('upload-progress-modal')) {
        // Will be handled by backups module
    }
    if (event.target === document.getElementById('confirmation-modal')) {
        closeConfirmationModal();
    }
};

// Initialize sidebar on page load
document.addEventListener('DOMContentLoaded', function() {
    initSidebarState();
});

// Export functions to window for HTML access
window.escapeHtml = escapeHtml;
window.showNotification = showNotification;
window.closeModal = closeModal;
window.closeAllModals = closeAllModals;
window.hideAllSpinners = hideAllSpinners;
window.showConfirmationModal = showConfirmationModal;
window.closeConfirmationModal = closeConfirmationModal;
window.showAlertModal = showAlertModal;
window.toggleSidebar = toggleSidebar;
window.initSidebarState = initSidebarState;
window.startTimeDisplay = startTimeDisplay;
window.stopTimeDisplay = stopTimeDisplay;
window.checkForStuckElements = checkForStuckElements;

