// Images Module
// Handles image management: loading, displaying, deleting, cleanup

// Load images
async function loadImages() {
    const errorEl = document.getElementById('images-error');
    const imagesList = document.getElementById('images-list');
    const imagesSpinner = document.getElementById('images-spinner');
    const imagesWrapper = document.getElementById('images-table-wrapper');

    if (errorEl) errorEl.style.display = 'none';
    if (imagesList) imagesList.innerHTML = '';

    // Show spinner and prevent scrollbars
    if (imagesSpinner) imagesSpinner.style.display = 'flex';
    if (imagesWrapper) {
        imagesWrapper.style.overflow = 'hidden';
        imagesWrapper.classList.add('loading-grid');
    }

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const response = await fetch('/api/images');
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to load images');
        }

        // Store all images for sorting
        window.AppState.allImages = data.images || [];

        // Check for dangling images (images with <none> tag)
        const cleanupBtn = document.getElementById('cleanup-dangling-images-btn');
        const hasDanglingImages = window.AppState.allImages.some(image => {
            return (image.tag && image.tag === '<none>') ||
                (image.repository && image.repository === '<none>') ||
                image.name === '<none>:<none>';
        });

        if (cleanupBtn) {
            cleanupBtn.disabled = !hasDanglingImages;
        }

        // Apply current sort if any, then render
        let imagesToDisplay = window.AppState.allImages;
        if (window.AppState.currentImageSortColumn) {
            imagesToDisplay = sortImagesData([...window.AppState.allImages], window.AppState.currentImageSortColumn, window.AppState.currentImageSortDirection);
            // Restore sort indicator
            const sortIndicator = document.getElementById(`sort-image-${window.AppState.currentImageSortColumn}`);
            if (sortIndicator) {
                sortIndicator.textContent = window.AppState.currentImageSortDirection === 'asc' ? ' ▲' : ' ▼';
                sortIndicator.style.color = 'var(--accent)';
            }
        }

        renderImages(imagesToDisplay);

    } catch (error) {
        if (errorEl) {
            errorEl.innerHTML = `<h3>Error</h3><p>${escapeHtml(error.message)}</p>`;
            errorEl.style.display = 'block';
        }
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

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    const imageName = image.name === '<none>:<none>' ? '<span style="color: var(--text-light);"><none></span>' : image.name;
    const createdDate = image.created ? new Date(image.created).toLocaleString() : 'Unknown';

    // Check if image is in use or is self
    const inUse = image.in_use === true || image.in_use === 'true' || image.in_use === 1;
    const isDisabled = image.is_self || inUse;

    tr.innerHTML = `
        <td class="checkbox-cell">
            <input type="checkbox" class="image-checkbox" data-image-id="${image.id}" data-in-use="${inUse ? 'true' : 'false'}" onclick="handleImageCheckboxClick(this);" ${isDisabled ? 'disabled' : ''}>
        </td>
        <td style="vertical-align: top;">
            <div style="font-weight: 600; color: var(--text-primary);">${imageName} ${image.is_self ? '<span style="color: #999; font-size: 0.8em;">(self)</span>' : ''}</div>
            ${image.tags && image.tags.length > 1 ? `<div style="font-size: 0.8em; color: var(--text-secondary); margin-top: 4px;">${image.tags.join(', ')}</div>` : ''}
            ${inUse && image.containers && image.containers.length > 0 ? `<div style="font-size: 0.8em; color: #999; margin-top: 4px;"><em>In use by ${image.containers.map(c => `<a href="#" onclick="event.stopPropagation(); if(window.viewContainerByName) window.viewContainerByName('${escapeHtml(c)}'); return false;" style="color: var(--secondary); text-decoration: underline; cursor: pointer;">${escapeHtml(c)}</a>`).join(', ')}</em></div>` : ''}
        </td>
        <td style="vertical-align: top;">
            <div style="color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(image.id.substring(0, 12))}</div>
        </td>
        <td style="vertical-align: top;">
            <div style="color: var(--text-secondary); font-size: 0.9em;">${escapeHtml(image.size)}</div>
        </td>
        <td style="vertical-align: top;">
            <div style="font-size: 0.9em; color: var(--text-secondary);">${createdDate}</div>
        </td>
    `;

    return tr;
}

// Sort images
function sortImages(column) {
    if (window.AppState.currentImageSortColumn === column) {
        window.AppState.currentImageSortDirection = window.AppState.currentImageSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        window.AppState.currentImageSortColumn = column;
        window.AppState.currentImageSortDirection = 'asc';
    }

    document.querySelectorAll('#images-table .sort-indicator').forEach(indicator => {
        indicator.textContent = '';
        indicator.style.color = '';
    });

    const sortIndicator = document.getElementById(`sort-image-${column}`);
    if (sortIndicator) {
        sortIndicator.textContent = window.AppState.currentImageSortDirection === 'asc' ? ' ▲' : ' ▼';
        sortIndicator.style.color = 'var(--accent)';
    }

    const sorted = sortImagesData([...window.AppState.allImages], column, window.AppState.currentImageSortDirection);
    renderImages(sorted);
}

// Helper function to sort image data
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

// Render images to the table
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

// Image selection management
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

    if (deleteBtn) {
        deleteBtn.disabled = !hasSelection || hasInUseOrSelf;
    }
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

// Delete selected images
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
        let message = 'Cannot remove selected images:\n\n';
        if (inUseImages.length > 0) {
            message += `${inUseImages.length} image(s) are currently in use by containers.\n`;
        }
        if (selfImages.length > 0) {
            message += `${selfImages.length} image(s) are system images and cannot be removed.\n`;
        }
        message += '\nPlease remove containers using these images before attempting to remove them.';
        if (window.showAlertModal) {
            window.showAlertModal(message, 'Cannot Remove Images');
        }
        return;
    }

    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Are you sure you want to remove ${imageIds.length} selected images? This action cannot be undone.`, async () => {
            let successCount = 0;
            let errors = [];

            for (const imageId of imageIds) {
                try {
                    const response = await fetch(`/api/image/${imageId}/delete`, {
                        method: 'DELETE',
                    });
                    if (!response.ok) {
                        const data = await response.json();
                        console.error(`Failed to remove image ${imageId}: ${data.error}`);
                        errors.push(data.error || `Failed to remove image ${imageId}`);
                    } else {
                        successCount++;
                    }
                } catch (error) {
                    console.error(`Error removing image ${imageId}: ${error.message}`);
                    errors.push(error.message);
                }
            }

            if (successCount > 0) {
                if (window.showNotification) {
                    window.showNotification(selectedCheckboxes.length === 1 ? 'Image removed successfully' : `${successCount} images removed successfully`, 'success');
                }
            }

            if (errors.length > 0) {
                if (window.showNotification) {
                    window.showNotification(`Failed to remove ${errors.length} image(s)`, 'error');
                }
            }

            loadImages();
        });
    }
}

// Delete single image
async function deleteImage(imageId, imageName) {
    if (window.showConfirmationModal) {
        window.showConfirmationModal(`Remove image "${imageName}"?\n\nThis will permanently remove the image. This action cannot be undone.`, async () => {
            try {
                const response = await fetch(`/api/image/${imageId}/delete`, {
                    method: 'DELETE',
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to remove image');
                }

                console.log('Image removed');
                if (window.showNotification) {
                    window.showNotification('Image removed successfully', 'success');
                }
                loadImages();
            } catch (error) {
                console.error(`Error removing image: ${error.message}`);
                if (window.showNotification) {
                    window.showNotification(`Error removing image: ${error.message}`, 'error');
                }
            }
        });
    }
}

// Cleanup dangling images
async function cleanupDanglingImages() {
    const cleanupBtn = document.getElementById('cleanup-dangling-images-btn');
    if (cleanupBtn && cleanupBtn.disabled) {
        return; // Don't proceed if button is disabled
    }

    if (window.showConfirmationModal) {
        window.showConfirmationModal('Clean up dangling images?\n\nThis will remove all <none> images that are not used by any container. This action cannot be undone.', async () => {
            // Get list of dangling images before cleanup
            const danglingImages = (window.AppState.allImages || []).filter(image => {
                return (image.tag && image.tag === '<none>') ||
                    (image.repository && image.repository === '<none>') ||
                    image.name === '<none>:<none>';
            });

            if (danglingImages.length === 0) {
                if (window.showNotification) {
                    window.showNotification('No dangling images found to clean up.', 'info');
                }
                return;
            }

            // Show progress modal
            cleanupDanglingImagesInternal(danglingImages);
        });
    }
}

// Cleanup dangling images - internal function that performs the actual cleanup with progress
async function cleanupDanglingImagesInternal(danglingImages) {
    const modal = document.getElementById('cleanup-images-modal');
    const statusEl = document.getElementById('cleanup-images-status');
    const listEl = document.getElementById('cleanup-images-list');
    const closeBtn = document.getElementById('cleanup-images-close-btn');

    if (!modal || !statusEl || !listEl || !closeBtn) {
        console.error('Modal elements not found');
        return;
    }

    modal.style.display = 'block';
    closeBtn.style.display = 'none';
    statusEl.innerHTML = 'Preparing...';
    listEl.innerHTML = '<div style="text-align: center; color: var(--text-light);">Loading images...</div>';

    const escapeHtml = window.escapeHtml || ((text) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    });

    try {
        const total = danglingImages.length;

        // Display image list
        listEl.innerHTML = danglingImages.map((image, index) => {
            const imageName = image.name || `${image.repository || '<none>'}:${image.tag || '<none>'}`;
            const imageId = image.id ? image.id.substring(0, 12) : 'unknown';
            return `
                <div id="cleanup-image-${index}" style="padding: 10px; margin-bottom: 8px; background: var(--bg-card); border-radius: 4px; border-left: 4px solid var(--border); border: 1px solid var(--border);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${escapeHtml(imageName)}</strong>
                            <span style="color: var(--text-light); font-size: 0.85em; margin-left: 10px;">(${escapeHtml(imageId)})</span>
                            <span style="color: var(--text-light); font-size: 0.9em; margin-left: 10px;">⏳ Waiting...</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        statusEl.innerHTML = `Cleaning up ${total} dangling image(s)...`;

        // Delete images sequentially, one at a time
        let completed = 0;
        let failed = 0;

        for (let i = 0; i < danglingImages.length; i++) {
            const image = danglingImages[i];
            const imageEl = document.getElementById(`cleanup-image-${i}`);
            const imageName = image.name || `${image.repository || '<none>'}:${image.tag || '<none>'}`;
            const imageId = image.id || '';
            
            // Update status to deleting
            if (imageEl) {
                imageEl.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <strong style="color: var(--text-primary);">${escapeHtml(imageName)}</strong>
                            <span style="color: var(--text-light); font-size: 0.85em; margin-left: 10px;">(${escapeHtml(imageId ? imageId.substring(0, 12) : 'unknown')})</span>
                            <span style="color: var(--secondary); font-size: 0.9em; margin-left: 10px;">🗑️ Removing...</span>
                        </div>
                    </div>
                `;
                imageEl.style.borderLeftColor = 'var(--secondary)';
                // Scroll the active deletion into view
                imageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            statusEl.innerHTML = `Removing ${i + 1} / ${total}: ${escapeHtml(imageName)}`;

            try {
                const response = await fetch(`/api/image/${encodeURIComponent(imageId)}/delete`, {
                    method: 'DELETE',
                });
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to remove image');
                }

                // Mark as completed
                completed++;
                if (imageEl) {
                    imageEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${escapeHtml(imageName)}</strong>
                                <span style="color: var(--text-light); font-size: 0.85em; margin-left: 10px;">(${escapeHtml(imageId ? imageId.substring(0, 12) : 'unknown')})</span>
                                <span style="color: var(--accent); font-size: 0.9em; margin-left: 10px;">✅ Removed</span>
                            </div>
                        </div>
                    `;
                    imageEl.style.borderLeftColor = 'var(--accent)';
                }

                // Small delay between deletions
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (error) {
                console.error(`Error removing ${imageName}:`, error);
                failed++;
                if (imageEl) {
                    imageEl.innerHTML = `
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <strong style="color: var(--text-primary);">${escapeHtml(imageName)}</strong>
                                <span style="color: var(--text-light); font-size: 0.85em; margin-left: 10px;">(${escapeHtml(imageId ? imageId.substring(0, 12) : 'unknown')})</span>
                                <span style="color: var(--danger); font-size: 0.9em; margin-left: 10px;">❌ Failed</span>
                            </div>
                        </div>
                    `;
                    imageEl.style.borderLeftColor = 'var(--danger)';
                }
            }
        }

        // Final status
        if (failed === 0) {
            statusEl.innerHTML = `✅ Successfully cleaned up ${completed} dangling image(s)!`;
        } else {
            statusEl.innerHTML = `⚠️ Completed: ${completed} image(s) removed, ${failed} failed`;
        }
        
        closeBtn.style.display = 'block';

        // Reload images to update button state
        loadImages();

    } catch (error) {
        statusEl.innerHTML = `❌ Error: ${escapeHtml(error.message)}`;
        listEl.innerHTML = '';
        closeBtn.style.display = 'block';
        console.error(`Error cleaning up dangling images: ${error.message}`);
    }
}

function closeCleanupImagesModal() {
    const modal = document.getElementById('cleanup-images-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Export functions to window for HTML access
window.loadImages = loadImages;
window.createImageRow = createImageRow;
window.sortImages = sortImages;
window.sortImagesData = sortImagesData;
window.renderImages = renderImages;
window.handleImageCheckboxClick = handleImageCheckboxClick;
window.toggleAllImageSelections = toggleAllImageSelections;
window.deleteSelectedImages = deleteSelectedImages;
window.deleteImage = deleteImage;
window.cleanupDanglingImages = cleanupDanglingImages;
window.cleanupDanglingImagesInternal = cleanupDanglingImagesInternal;
window.closeCleanupImagesModal = closeCleanupImagesModal;

