// Main Application Coordinator
// This file coordinates all modules and handles initialization

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', async function () {
    // Check authentication status first and wait for it to complete
    if (window.checkAuthStatus) {
        await window.checkAuthStatus();
    }

    // Load server name only if user is authenticated
    if (window.AppState.isAuthenticated && window.loadServerName) {
        await window.loadServerName();
    }

    // Start time display - always visible in top bar
    if (window.startTimeDisplay) {
        window.startTimeDisplay();
    }

    // Show dashboard section by default
    if (window.showSection) {
        const firstNavItem = document.querySelector('.nav-item');
        window.showSection('dashboard', firstNavItem);
    }

    // Start stats polling only after auth check is complete
    if (window.startStatsPolling) {
        window.startStatsPolling();
    }
});

