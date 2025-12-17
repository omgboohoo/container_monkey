// CSRF Token handling and API request helpers

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
        if (!window.AppState.isAuthenticated) {
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

// Export functions to window for HTML access
window.getCsrfToken = getCsrfToken;
window.apiRequest = apiRequest;

