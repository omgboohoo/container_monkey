// Navigation Module
// Handles section switching and dashboard loading

// Section switching (sidebar navigation)
function showSection(sectionName, navElement) {
    // Cleanup statistics polling if leaving statistics section
    if (window.AppState.statisticsPollInterval) {
        clearInterval(window.AppState.statisticsPollInterval);
        window.AppState.statisticsPollInterval = null;
    }
    if (window.AppState.statisticsRefreshTimeInterval) {
        clearInterval(window.AppState.statisticsRefreshTimeInterval);
        window.AppState.statisticsRefreshTimeInterval = null;
    }
    if (window.AppState.statisticsAbortController) {
        window.AppState.statisticsAbortController.abort();
        window.AppState.statisticsAbortController = null;
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
            const itemText = item.querySelector('.nav-text');
            if (itemText) {
                const itemTextLower = itemText.textContent.toLowerCase().trim();
                const sectionNameLower = sectionName.toLowerCase();
                // Handle spaces/dashes in section names (e.g., "audit log" vs "audit-log")
                if (itemTextLower === sectionNameLower || 
                    itemTextLower.replace(/\s+/g, '-') === sectionNameLower || 
                    itemTextLower === sectionNameLower.replace(/-/g, ' ')) {
                    item.classList.add('active');
                }
            }
        });
    }

    // Load data for the section
    if (sectionName === 'dashboard') {
        if (window.loadDashboardStats) {
            window.loadDashboardStats();
        }
    } else if (sectionName === 'containers') {
        if (window.loadContainers) {
            window.loadContainers();
        }
        // Container stats polling will be started by loadContainers() after containers load
    } else if (sectionName === 'volumes') {
        if (window.loadVolumes) {
            window.loadVolumes();
        }
    } else if (sectionName === 'images') {
        if (window.loadImages) {
            window.loadImages();
        }
    } else if (sectionName === 'networks') {
        if (window.loadNetworks) {
            window.loadNetworks();
        }
    } else if (sectionName === 'stacks') {
        if (window.loadStacks) {
            window.loadStacks();
        }
    } else if (sectionName === 'backups') {
        if (window.loadStorageSettings) {
            window.loadStorageSettings();
        }
        if (window.loadBackups) {
            window.loadBackups();
        }
    } else if (sectionName === 'statistics') {
        if (window.loadStatistics) {
            window.loadStatistics();
        }
    } else if (sectionName === 'audit-log') {
        if (window.loadAuditLogs) {
            window.loadAuditLogs();
        }
    } else if (sectionName === 'backup-scheduler') {
        // Safety check: ensure no spinners are blocking
        if (window.hideAllSpinners) {
            window.hideAllSpinners();
        }
        // Load config first - it will call loadSchedulerContainers() after config loads
        if (window.loadSchedulerConfig) {
            window.loadSchedulerConfig();
        }
        if (window.loadStatistics) {
            window.loadStatistics();
        }
    } else if (sectionName === 'events') {
        if (window.loadEvents) {
            window.loadEvents();
        }
    }
}

// Legacy function for compatibility (maps to showSection)
function showTab(tabName, event) {
    showSection(tabName, event ? event.target.closest('.nav-item') : null);
}

// Load dashboard stats
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/dashboard-stats');
        const stats = await response.json();

        if (!response.ok) {
            throw new Error(stats.error || 'Failed to load dashboard stats');
        }

        // Update all stat elements in the dashboard
        const dashboardCard = document.querySelector('.dashboard-card');
        if (dashboardCard) {
            const cardNumber = dashboardCard.querySelector('.card-number');
            const cardSubtext = dashboardCard.querySelector('.card-subtext');
            if (cardNumber) cardNumber.textContent = stats.cpu_ram_info;
            if (cardSubtext) cardSubtext.textContent = stats.docker_sock_url;
        }

        const cards = document.querySelectorAll('.dashboard-card');
        if (cards.length > 7) {
            if (cards[1]) {
                const cardNumber = cards[1].querySelector('.card-number');
                const cardSubtext = cards[1].querySelector('.card-subtext');
                if (cardNumber) cardNumber.textContent = stats.containers_qty;
                if (cardSubtext) {
                    cardSubtext.innerHTML = `
                        <span class="status-dot running" title="Running"></span> ${stats.running_containers}
                        <span class="status-dot stopped" style="margin-left: 8px;" title="Stopped"></span> ${stats.stopped_containers}
                    `;
                }
            }
            if (cards[2]) {
                const cardNumber = cards[2].querySelector('.card-number');
                const cardSubtext = cards[2].querySelector('.card-subtext');
                if (cardNumber) cardNumber.textContent = stats.images_qty;
                if (cardSubtext) {
                    cardSubtext.innerHTML = `<i class="ph ph-database" style="margin-right: 4px;"></i> ${stats.total_images_size}`;
                }
            }
            if (cards[3]) {
                const cardNumber = cards[3].querySelector('.card-number');
                const cardSubtext = cards[3].querySelector('.card-subtext');
                if (cardNumber) cardNumber.textContent = stats.volumes_qty;
                if (cardSubtext) {
                    cardSubtext.innerHTML = `<i class="ph ph-database" style="margin-right: 4px;"></i> ${stats.total_volumes_size || 'N/A'}`;
                }
            }
            if (cards[4]) {
                const cardNumber = cards[4].querySelector('.card-number');
                if (cardNumber) cardNumber.textContent = stats.networks_qty;
            }
            if (cards[5]) {
                const cardNumber = cards[5].querySelector('.card-number');
                if (cardNumber) cardNumber.textContent = stats.stacks_qty || 0;
            }
            if (cards[6]) {
                const cardNumber = cards[6].querySelector('.card-number');
                const cardSubtext = cards[6].querySelector('.card-subtext');
                if (cardNumber) cardNumber.textContent = stats.backups_qty;
                if (cardSubtext) {
                    cardSubtext.innerHTML = `<i class="ph ph-database" style="margin-right: 4px;"></i> ${stats.total_backups_size}`;
                }
            }
            if (cards[7]) {
                const cardNumber = cards[7].querySelector('.card-number');
                if (cardNumber) cardNumber.textContent = stats.scheduled_containers_qty || 0;
            }
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

// Export functions to window for HTML access
window.showSection = showSection;
window.showTab = showTab;
window.loadDashboardStats = loadDashboardStats;

