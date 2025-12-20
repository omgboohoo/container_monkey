// Volumes Module
// Handles volume management: loading, displaying, exploring, deleting

// Load volumes
async function loadVolumes() {
    const errorEl = document.getElementById('volumes-error');
    const volumesList = document.getElementById('volumes-list');
    const volumesSpinner = document.getElementById('volumes-spinner');
    const volumesWrapper = document.getElementById('volumes-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';
    if (volumesList) volumesList.innerHTML = '';

    // Show spinner and prevent scrollbars
    if (volumesSpinner) volumesSpinner.style.display = 'flex';
    if (volumesWrapper) {
        volumesWrapper.style.overflow = 'hidden';
        volumesWrapper.classList.add('loading-grid');
    }

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch('/api/volumes');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load volumes');
        }

        // Store all volumes for sorting
        window.AppState.allVolumes = data.volumes || [];

        // Apply current sort if any, then render
        let volumesToDisplay = window.AppState.allVolumes;
        if (window.AppState.currentVolumeSortColumn) {
            volumesToDisplay = sortVolumesData([...window.AppState.allVolumes], window.AppState.currentVolumeSortColumn, window.AppState.currentVolumeSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-volume-${window.AppState.currentVolumeSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = window.AppState.currentVolumeSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderVolumes(volumesToDisplay);

    } catch (error) {
        if (errorEl) {
            errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
            errorEl.style.display = 'block';
        }
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

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    const createdDate = volume.created ? new Date(volume.created).toLocaleString() : 'Unknown';

    tr.innerHTML = `
        <td class="checkbox-cell">
            <input type="checkbox" class="volume-checkbox" data-volume-name="${escapeHtml(volume.name)}" onclick="event.stopPropagation(); handleVolumeCheckboxClick(this);" ${volume.is_self ? 'disabled' : ''}>
        </td>
        <td>
            <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(volume.name)} ${volume.is_self ? '<span style="color: #999; font-size: 0.8em;">(self)</span>' : ''}</div>
            ${volume.in_use && !volume.is_self && volume.containers && volume.containers.length > 0 ? `<div style="font-size: 0.8em; color: #999; margin-top: 4px;"><em>In use by ${volume.containers.map(c => `<a href="#" onclick="event.stopPropagation(); if(window.viewContainerByName) window.viewContainerByName('${escapeHtml(c)}'); return false;" style="color: var(--secondary); text-decoration: underline; cursor: pointer;">${escapeHtml(c)}</a>`).join(', ')}</em></div>` : ''}
        </td>
        <td>
            <div style="color: var(--text-secondary); font-size: 0.9em;">${volume.stack ? escapeHtml(volume.stack) : '-'}</div>
        </td>
        <td>
            <div style="color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(volume.driver)}</div>
        </td>
        <td>
            <div style="font-family: monospace; color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(volume.mountpoint || 'N/A')}</div>
        </td>
        <td>
            <div style="font-size: 0.9em; color: var(--text-secondary);">${createdDate}</div>
        </td>
        <td>
           <div style="font-weight: 600; color: var(--text-primary); font-size: 0.9em;">${escapeHtml(volume.size)}</div>
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

// Sort volumes
function sortVolumes(column) {
    if (window.AppState.currentVolumeSortColumn === column) {
        window.AppState.currentVolumeSortDirection = window.AppState.currentVolumeSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.AppState.currentVolumeSortColumn = column;
        window.AppState.currentVolumeSortDirection = 'asc';
    }

    document.querySelectorAll('#volumes-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-volume-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = window.AppState.currentVolumeSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortVolumesData([...window.AppState.allVolumes], column, window.AppState.currentVolumeSortDirection);
    renderVolumes(sorted);
}

// Helper function to sort volume data
function sortVolumesData(volumes, column, direction) {
    return volumes.sort((a, b) => {
        let aVal, bVal;

        switch (column) {
            case 'name':
                aVal = (a.name || '').toLowerCase();
                bVal = (b.name || '').toLowerCase();
                break;
            case 'stack':
                aVal = (a.stack || '-').toLowerCase();
                bVal = (b.stack || '-').toLowerCase();
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

// Render volumes to the table
function renderVolumes(volumes) {
    const volumesList = document.getElementById('volumes-list');
    if (!volumesList) return;

    volumesList.innerHTML = '';

    if (volumes.length === 0) {
        volumesList.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #666;">No volumes found</td></tr>';
    } else {
        volumes.forEach(volume => {
            const row = createVolumeRow(volume);
            volumesList.appendChild(row);
        });
    }
}

// Explore volume files
async function exploreVolume(volumeName, path = '/') {
    window.AppState.currentVolumeName = volumeName;
    window.AppState.currentVolumePath = path;

    const modal = document.getElementById('volume-explore-modal');
    const modalTitle = document.getElementById('volume-explore-title');
    const fileList = document.getElementById('volume-file-list');
    const loadingEl = document.getElementById('volume-explore-loading');

    if (!modal || !modalTitle || !fileList || !loadingEl) {
        console.error('Volume explore modal elements not found');
        return;
    }

    modalTitle.textContent = `Exploring: ${volumeName}`;
    modal.style.display = 'block';
    loadingEl.style.display = 'block';
    fileList.innerHTML = '';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch(`/api/volume/${encodeURIComponent(volumeName)}/explore?path=${encodeURIComponent(path)}`);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to explore volume');
        }

        loadingEl.style.display = 'none';

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
        if (data.files && data.files.length > 0) {
            data.files.forEach(file => {
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

    if (!modal || !modalTitle || !fileContent || !loadingEl) {
        console.error('Volume file modal elements not found');
        return;
    }

    modalTitle.textContent = `File: ${filePath}`;
    modal.style.display = 'block';
    loadingEl.style.display = 'flex';
    fileContent.innerHTML = '';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

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
    const modal = document.getElementById('volume-explore-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Close volume file modal
function closeVolumeFileModal() {
    const modal = document.getElementById('volume-file-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Delete volume
async function deleteVolume(volumeName) {
    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Remove volume "${volumeName}"?\n\nThis will permanently remove the volume and all its data. This action cannot be undone.`, async () => {
            try {
                const response = await fetch(`/api/volume/${volumeName}/delete`, {
                    method: 'DELETE',
                });
                const data = await response.json();

                if (!response.ok) {
                    // Check if volume is in use
                    if (data.in_use) {
                        if (window.showAlertModal) {
                            window.showAlertModal(
                                `Cannot remove volume "${volumeName}"\n\n${data.message || 'This volume is currently in use by one or more containers and cannot be removed.\n\nPlease stop and remove the containers using this volume before attempting to remove it.'}`,
                                'Volume In Use'
                            );
                        }
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
                    if (window.showAlertModal) {
                        window.showAlertModal(
                            `Cannot remove volume "${volumeName}"\n\nThis volume is currently in use by one or more containers and cannot be removed.\n\nPlease stop and remove the containers using this volume before attempting to remove it.`,
                            'Volume In Use'
                        );
                    }
                } else {
                    if (window.showAlertModal) {
                        window.showAlertModal(
                            `Failed to remove volume "${volumeName}"\n\n${error.message}`,
                            'Error'
                        );
                    }
                }
            }
        });
    }
}

// Volume selection management
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

    if (deleteBtn) {
        deleteBtn.disabled = !hasSelection;
    }
}

function toggleAllVolumeSelections(source) {
    const checkboxes = document.querySelectorAll('.volume-checkbox');
    checkboxes.forEach(cb => cb.checked = source.checked);
    handleVolumeCheckboxClick();
}

// Delete selected volumes
async function deleteSelectedVolumes() {
    const selectedCheckboxes = document.querySelectorAll('.volume-checkbox:checked');
    const volumeNames = Array.from(selectedCheckboxes).map(cb => cb.dataset.volumeName);

    if (volumeNames.length === 0) {
        console.warn('No volumes selected.');
        return;
    }

    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Are you sure you want to remove ${volumeNames.length} selected volumes? This action cannot be undone.`, async () => {
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
                    throw new Error(data.error || 'Failed to remove volumes');
                }

                console.log(data.message);

                // Check for volumes in use
                if (data.in_use_volumes && data.in_use_volumes.length > 0) {
                    const inUseList = data.in_use_volumes.join(', ');
                    if (window.showAlertModal) {
                        window.showAlertModal(
                            `Cannot remove ${data.in_use_volumes.length} volume(s): ${inUseList}\n\nThese volumes are currently in use by one or more containers and cannot be removed.\n\nPlease stop and remove the containers using these volumes before attempting to remove them.`,
                            'Volumes In Use'
                        );
                    }
                }

                if (data.errors && data.errors.length > 0) {
                    const inUseErrors = data.errors.filter(e => e.includes('is in use'));
                    const otherErrors = data.errors.filter(e => !e.includes('is in use'));

                    if (otherErrors.length > 0) {
                        console.warn(`Some volumes could not be removed:\n${otherErrors.join('\n')}`);
                    }
                }

                if (data.deleted_count > 0) {
                    console.log(`Successfully removed ${data.deleted_count} volume(s)`);
                    if (window.showNotification) {
                        window.showNotification(`Successfully removed ${data.deleted_count} volume(s)`, 'success');
                    }
                }
            } catch (error) {
                console.error(`Error removing selected volumes: ${error.message}`);
                if (window.showNotification) {
                    window.showNotification(`Failed to remove volumes: ${error.message}`, 'error');
                }
                if (window.showAlertModal) {
                    window.showAlertModal(
                        `Failed to remove volumes\n\n${error.message}`,
                        'Error'
                    );
                }
            } finally {
                loadVolumes();
            }
        });
    }
}

// Export functions to window for HTML access
window.loadVolumes = loadVolumes;
window.createVolumeRow = createVolumeRow;
window.sortVolumes = sortVolumes;
window.sortVolumesData = sortVolumesData;
window.renderVolumes = renderVolumes;
window.exploreVolume = exploreVolume;
window.downloadVolumeFile = downloadVolumeFile;
window.viewVolumeFile = viewVolumeFile;
window.closeVolumeExploreModal = closeVolumeExploreModal;
window.closeVolumeFileModal = closeVolumeFileModal;
window.deleteVolume = deleteVolume;
window.toggleVolumeSelection = toggleVolumeSelection;
window.handleVolumeCheckboxClick = handleVolumeCheckboxClick;
window.toggleAllVolumeSelections = toggleAllVolumeSelections;
window.deleteSelectedVolumes = deleteSelectedVolumes;

