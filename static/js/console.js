// Console Module
// Handles console/terminal functionality and container logs

// Open attach console
function openAttachConsole(containerId, containerName) {
    const modal = document.getElementById('attach-console-modal');
    const containerNameEl = document.getElementById('console-container-name');
    if (!modal || !containerNameEl) return;

    containerNameEl.textContent = containerName;
    modal.style.display = 'block';

    // Wait for modal to be visible before initializing terminal
    setTimeout(() => {
        if (window.AppState.term) {
            window.AppState.term.dispose();
        }

        const terminalContainer = document.getElementById('terminal-container');
        if (!terminalContainer) return;
        terminalContainer.innerHTML = '';

        window.AppState.term = new Terminal({
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
            window.AppState.fitAddon = new FitAddon.FitAddon();
            window.AppState.term.loadAddon(window.AppState.fitAddon);
        }

        window.AppState.term.open(terminalContainer);

        if (window.AppState.fitAddon) {
            window.AppState.fitAddon.fit();
        }

        // Focus the terminal so typing works immediately
        window.AppState.term.focus();

        window.AppState.term.writeln('\x1b[1;32mWelcome to Container Monkey Console\x1b[0m');
        window.AppState.term.writeln('Connected to: ' + containerName);
        window.AppState.term.writeln('Type "exit" to close this session.');
        window.AppState.term.writeln('');

        const currentDir = window.AppState.containerCwd[containerId] ? window.AppState.containerCwd[containerId].split('/').pop() || '/' : '';
        const prompt = currentDir ? `${currentDir} $ ` : '$ ';
        window.AppState.term.write(`\r\n${prompt}`);

        let currentLine = '';

        window.AppState.term.onData(e => {
            switch (e) {
                case '\r': // Enter
                    window.AppState.term.write('\r\n');
                    if (currentLine.trim()) {
                        if (currentLine.trim() === 'exit') {
                            closeAttachConsoleModal();
                        } else if (currentLine.trim() === 'clear') {
                            window.AppState.term.clear();
                            const currentDir = window.AppState.containerCwd[containerId] ? window.AppState.containerCwd[containerId].split('/').pop() || '/' : '';
                            const prompt = currentDir ? `${currentDir} $ ` : '$ ';
                            window.AppState.term.write(prompt);
                        } else {
                            executeCommand(containerId, currentLine);
                        }
                    } else {
                        const currentDir = window.AppState.containerCwd[containerId] ? window.AppState.containerCwd[containerId].split('/').pop() || '/' : '';
                        const prompt = currentDir ? `${currentDir} $ ` : '$ ';
                        window.AppState.term.write(prompt);
                    }
                    currentLine = '';
                    break;
                case '\u007F': // Backspace (DEL)
                    if (currentLine.length > 0) {
                        window.AppState.term.write('\b \b');
                        currentLine = currentLine.substring(0, currentLine.length - 1);
                    }
                    break;
                case '\u0003': // Ctrl+C
                    const currentDir = window.AppState.containerCwd[containerId] ? window.AppState.containerCwd[containerId].split('/').pop() || '/' : '';
                    const prompt = currentDir ? `${currentDir} $ ` : '$ ';
                    window.AppState.term.write(`^C\r\n${prompt}`);
                    currentLine = '';
                    break;
                default:
                    // Simple printable character check
                    if (e.length === 1 && e.charCodeAt(0) >= 32) {
                        currentLine += e;
                        window.AppState.term.write(e);
                    }
            }
        });

        // Handle window resize
        window.addEventListener('resize', handleResize);
    }, 100);
}

// Handle resize
function handleResize() {
    if (window.AppState.fitAddon) {
        window.AppState.fitAddon.fit();
    }
}

// Execute command
async function executeCommand(containerId, command) {
    let cmdToExec = command.trim();
    const isCd = cmdToExec.startsWith('cd ');
    let currentDir = window.AppState.containerCwd[containerId] || '';

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
                        window.AppState.containerCwd[containerId] = actualDir;
                    }
                    window.AppState.term.write('\r\n');
                } else {
                    // Directory doesn't exist
                    window.AppState.term.write(`\x1b[1;31mcd: ${targetDir}: No such file or directory\x1b[0m\r\n`);
                }
            } catch (e) {
                window.AppState.term.write(`\x1b[1;31mConnection error: ${e.message}\x1b[0m\r\n`);
            }

            // Update prompt
            const displayDir = window.AppState.containerCwd[containerId] ? window.AppState.containerCwd[containerId].split('/').pop() || '/' : '';
            const prompt = displayDir ? `${displayDir} $ ` : '$ ';
            window.AppState.term.write(prompt);
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
                        window.AppState.containerCwd[containerId] = actualDir;
                    }
                }
            } catch (e) {
                // Ignore errors, just reset to root
                window.AppState.containerCwd[containerId] = '/';
            }

            const displayDir = window.AppState.containerCwd[containerId] ? window.AppState.containerCwd[containerId].split('/').pop() || '/' : '';
            const prompt = displayDir ? `${displayDir} $ ` : '$ ';
            window.AppState.term.write('\r\n' + prompt);
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
                window.AppState.term.write(output);
                // Ensure we end on a new line if output didn't have one
                if (!output.endsWith('\r\n')) {
                    window.AppState.term.write('\r\n');
                }
            }
        } else {
            // Command failed
            if (data.output) {
                window.AppState.term.write(data.output.replace(/\n/g, '\r\n'));
                if (!data.output.endsWith('\r\n')) {
                    window.AppState.term.write('\r\n');
                }
            } else if (data.error) {
                window.AppState.term.write(`\x1b[1;31mError: ${data.error}\x1b[0m\r\n`);
            }
        }
    } catch (e) {
        window.AppState.term.write(`\x1b[1;31mConnection error: ${e.message}\x1b[0m\r\n`);
    }

    // Update prompt
    const displayDir = window.AppState.containerCwd[containerId] ? window.AppState.containerCwd[containerId].split('/').pop() || '/' : '';
    const prompt = displayDir ? `${displayDir} $ ` : '$ ';
    window.AppState.term.write(prompt);
}

// Close attach console modal
function closeAttachConsoleModal() {
    const modal = document.getElementById('attach-console-modal');
    if (modal) modal.style.display = 'none';
    if (window.AppState.term) {
        window.AppState.term.dispose();
        window.AppState.term = null;
    }
    window.removeEventListener('resize', handleResize);
}

// Show logs
async function showLogs(containerId, containerName) {
    const modal = document.getElementById('logs-modal');
    const logsContainer = document.getElementById('logs-container');
    const containerNameEl = document.getElementById('logs-container-name');

    if (!modal || !logsContainer || !containerNameEl) return;

    window.AppState.currentLogsContainerId = containerId;
    containerNameEl.textContent = containerName;
    logsContainer.innerHTML = '<div class="spinner-container"><div class="spinner"></div></div>';
    modal.style.display = 'block';
    
    // Reset state
    window.AppState.logsLastContent = '';
    window.AppState.logsIsScrolledToBottom = true;
    
    // Setup scroll tracking (only once)
    setupLogsScrollTracking();

    // Load all logs initially (tail=0 means all logs)
    await loadLogsContent(containerId, logsContainer, true);
    
    // Start real-time streaming (poll every 2 seconds)
    startLogsAutoRefresh(containerId, logsContainer);
}

// Load logs content
async function loadLogsContent(containerId, logsContainer, isInitialLoad = false) {
    try {
        // Use 'all' for initial load to get all logs, or a large number for streaming updates
        // Fetch all logs each time and replace content
        const tail = isInitialLoad ? 'all' : 'all';
        const response = await fetch(`/api/container/${containerId}/logs?tail=${tail}`);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to load logs: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        const newLogs = data.logs || '';
        
        // Check if user is scrolled to bottom before updating (for streaming)
        if (!isInitialLoad) {
            const container = logsContainer;
            window.AppState.logsIsScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
        }
        
        // Replace content (always replace, not append)
        if (newLogs.trim() === '') {
            logsContainer.textContent = 'No logs available for this container.';
        } else {
            logsContainer.textContent = newLogs;
        }
        window.AppState.logsLastContent = newLogs;
        
        // Auto-scroll to bottom if initial load or if user was already at bottom
        if (isInitialLoad || window.AppState.logsIsScrolledToBottom) {
            setTimeout(() => {
                logsContainer.scrollTop = logsContainer.scrollHeight;
            }, isInitialLoad ? 100 : 10);
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        logsContainer.innerHTML = `<div class="error" style="color: #ef4444; padding: 10px;">Error: ${error.message}</div>`;
        if (isInitialLoad) {
            stopLogsAutoRefresh();
        }
    }
}

// Start logs auto refresh
function startLogsAutoRefresh(containerId, logsContainer) {
    // Clear any existing interval
    stopLogsAutoRefresh();
    
    // Show live indicator
    const liveIndicator = document.getElementById('logs-live-indicator');
    if (liveIndicator) {
        liveIndicator.style.display = 'inline-block';
    }
    
    // Poll every 3 seconds for new logs
    window.AppState.logsAutoRefreshInterval = setInterval(() => {
        if (window.AppState.currentLogsContainerId === containerId) {
            loadLogsContent(containerId, logsContainer, false);
        } else {
            stopLogsAutoRefresh();
        }
    }, 3000);
}

// Stop logs auto refresh
function stopLogsAutoRefresh() {
    if (window.AppState.logsAutoRefreshInterval) {
        clearInterval(window.AppState.logsAutoRefreshInterval);
        window.AppState.logsAutoRefreshInterval = null;
    }
    
    // Hide live indicator
    const liveIndicator = document.getElementById('logs-live-indicator');
    if (liveIndicator) {
        liveIndicator.style.display = 'none';
    }
}

// Setup logs scroll tracking
function setupLogsScrollTracking() {
    if (window.AppState.logsScrollTrackingSetup) return;
    
    const logsContainer = document.getElementById('logs-container');
    if (logsContainer) {
        logsContainer.addEventListener('scroll', () => {
            const container = logsContainer;
            window.AppState.logsIsScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
        });
        window.AppState.logsScrollTrackingSetup = true;
    }
}

// Close logs modal
function closeLogsModal() {
    stopLogsAutoRefresh();
    const modal = document.getElementById('logs-modal');
    if (modal) modal.style.display = 'none';
    window.AppState.currentLogsContainerId = null;
    window.AppState.logsLastContent = '';
}

// Export functions to window for HTML access
window.openAttachConsole = openAttachConsole;
window.handleResize = handleResize;
window.executeCommand = executeCommand;
window.closeAttachConsoleModal = closeAttachConsoleModal;
window.showLogs = showLogs;
window.loadLogsContent = loadLogsContent;
window.startLogsAutoRefresh = startLogsAutoRefresh;
window.stopLogsAutoRefresh = stopLogsAutoRefresh;
window.setupLogsScrollTracking = setupLogsScrollTracking;
window.closeLogsModal = closeLogsModal;

