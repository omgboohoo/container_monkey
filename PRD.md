# Product Requirements Document: Container Monkey

**Version 0.3.7**

## Overview

The open-source backup and recovery solution for Docker. Protect your containers, volumes, and networks with one-click backups, automated scheduling, and instant restoration.

## Tech Stack

### Backend
- **Framework**: Flask 3.0.0 (Python 3.11)
- **Architecture**: Modular design with separate manager modules for maintainability
- **Authentication**: Session-based authentication with SQLite user database (`auth_manager.py`)
- **Docker Integration**: Direct Docker socket API (`docker_api.py`) with fallback to docker-py library
- **Modular Managers**:
  - `auth_manager.py` - Authentication and user management
  - `container_manager.py` - Container lifecycle operations
  - `backup_manager.py` - Backup operations with queue support for sequential processing
  - `backup_file_manager.py` - Backup file management and operations (S3 and local)
  - `restore_manager.py` - Restore operations and conflict handling
  - `volume_manager.py` - Volume exploration and management
  - `image_manager.py` - Image management and cleanup
  - `network_manager.py` - Network backup and restore (S3 and local backups)
  - `stack_manager.py` - Docker stack management
  - `system_manager.py` - System monitoring and statistics
  - `scheduler_manager.py` - Scheduled backup management and lifecycle cleanup
  - `audit_log_manager.py` - Audit logging for backup operations
  - `storage_settings_manager.py` - Storage settings management (local vs S3)
  - `ui_settings_manager.py` - UI settings management (server name, etc.)
  - `s3_storage_manager.py` - S3 storage operations
  - `encryption_utils.py` - Encryption utilities for securing credentials
- **Storage**: Docker volumes for backup persistence
  - Organized directory structure: `backups/` subdirectory for backup files, `config/` subdirectory for configuration
  - Automatic migration of existing files to organized structure on startup
- **Database**: SQLite database (`monkey.db`) for user management, audit logs, storage settings, and UI settings (stored in `config/` subdirectory of backup volume)
- **Rate Limiting**: Flask-Limiter 3.5.0 for API protection (progress endpoint exempt)
- **Server**: Flask development server (container port 80, host port 1066 by default)

### Frontend
- **Language**: Vanilla JavaScript (ES6+)
- **Styling**: Modern CSS with CSS variables and flexbox/grid
- **Icons**: Phosphor Icons
- **Terminal**: XTerm.js for container console access
- **Architecture**: Single Page Application (SPA) with client-side routing

### Infrastructure
- **Container Runtime**: Docker Engine
- **Volume Management**: Docker volumes (`container-monkey` volume)
- **Socket Access**: `/var/run/docker.sock` for Docker API communication

## Key Functionality

### Container Management
- List, start, stop (graceful), kill (immediate), restart, delete containers
- Bulk operations on multiple containers
- Container logs streaming
- Interactive exec console
- Container details inspection

### Backup & Restore
- Full container backup (includes volumes, port mappings, environment variables)
- **Sequential backup queue system** for bulk operations (ensures backups complete before starting next)
- **Real-time progress tracking** with status updates (queued → waiting → starting → running → complete)
- **Backup completion verification** - ensures tar.gz files are fully written before marking complete
- Backup preview before restore
- Restore with port override and volume overwrite options
- Backup download/upload (single and bulk)
- Bulk backup operations with queue management
- **Backup Vault Checkbox Selection**: Checkbox-based selection system for bulk operations
  - Checkbox column with "Select All" functionality
  - Row selection by clicking backup rows
  - Download and Delete buttons work with selected backups only
  - Buttons disabled by default, enabled when backups are selected
  - Individual Download/Delete buttons removed from rows (Restore button kept)
- **Backup Type Tracking**: Backups tagged as Manual or Scheduled in backup vault
- **Storage Location Tracking**: Backup vault shows storage location (Local or S3) for each backup
- **Backup Vault Search Filter**: Real-time search filter to quickly find backups by filename, type, backup type, storage location, server name, or creation date
- **Sortable Backup Columns**: All backup vault columns are sortable (Filename, Type, Backup Type, Storage, Server, Size, Created) with visual sort indicators
- **Sequential Bulk Downloads**: Bulk download downloads files sequentially one at a time (not as single archive)
  - Real-time progress tracking with speed indicators for each file
  - Progress modal with auto-scroll to active download
  - Cancel functionality to stop downloads in progress
  - Better for large vaults on cloud servers
- **Multi-Server Backup Identification**: Server name tracking for shared S3 vaults
  - Customizable server name setting displayed in top bar
  - Server name included in every backup as metadata
  - Companion JSON files (`.tar.gz.json`) store server name alongside backups
  - Backup vault displays server name column showing origin server for each backup
  - Enables multiple Container Monkey instances sharing the same S3 bucket to identify backup origins
  - Performance optimized: reads lightweight JSON files instead of opening tar archives
  - Companion JSON files automatically deleted when backups are deleted
  - Backward compatible with backups created before server name tracking
- **S3 Storage Support**: Optional cloud storage for backups
  - Toggle between local and S3 storage from backup vault interface
  - S3 configuration modal with bucket name, region, access key, and secret key fields
  - Test connection button to verify S3 read/write permissions
  - S3 credentials encrypted at rest in database
  - All backups (manual, scheduled, uploaded) automatically use selected storage type
  - S3 backups download to temp directory for restore operations
  - Temp files automatically cleaned up after restore completes
  - Companion JSON files uploaded/downloaded with backups in S3 storage
- **Backup Scheduler**: Automated scheduled backups
  - Single schedule configuration (daily or weekly)
  - Select containers to include in scheduled backups
  - Daily schedule: backup at specific hour (0-23)
  - Weekly schedule: backup on specific day of week and hour
  - Lifecycle management: specify number of scheduled backups to keep per container
  - Manual backups never auto-deleted
  - Scheduled backups automatically cleaned up based on lifecycle (per container)
  - Cleanup runs after all backups complete (monitored, not fixed delay)
  - Real-time auto-save: configuration saves automatically as changes are made
  - Real-time system clock display on scheduler page
  - Scheduler enabled when one or more containers are selected
  - Works seamlessly with both local and S3 storage

### Volume Management
- Volume listing and exploration
- File browsing within volumes
- File download/view
- Volume deletion (single and bulk)

### Image Management
- Image listing with size information
- Image deletion
- Dangling image cleanup (button automatically disables when no dangling images exist)

### Network Management
- Network listing with container counts (includes all containers: running and stopped)
- Network backup and restore
- Network deletion (automatically disabled when networks have containers)
- View Containers button filters container view to show containers using selected network

### Stack Management
- Stack listing (Docker Swarm stacks and Compose-based stacks)
- Stack deletion

### System Monitoring
- Dashboard with resource overview and backup schedule next run time
- Real-time system CPU/RAM stats in top bar
- **Statistics Page**: Comprehensive container statistics view
  - All containers displayed in a grid format
  - Shows CPU %, RAM usage, Network I/O, and Block I/O for each container
  - Status badges (running/stopped) matching container viewer styling
  - Auto-refreshes when visiting the page
  - Request timeout protection: 60-second timeout prevents indefinite waiting
  - Request cancellation: Prevents duplicate requests by canceling previous requests
  - Race condition protection: Uses local abort controller reference to prevent null access errors
  - Proper timeout cleanup: Timeout cleared in multiple places to prevent race conditions
  - Accurate timeout detection: Only shows timeout errors for actual timeouts, not successful requests
  - Enhanced error handling: Clear error messages for timeout, network, and abort scenarios
  - Prevents stuck spinner: Loading spinner always hidden even if request fails

### Backup Audit Log
- View audit logs for all backup-related operations
- Filter by operation type (Manual Backups, Scheduled Backups, Restores, Lifecycle Cleanup, Backup Deletion)
- Filter by status (Started, Completed, Error)
- View statistics: total logs, last 24 hours, and last 7 days activity
- Clear all audit logs with confirmation prompt (permanently deletes all log entries)
- Comprehensive tracking: All backup operations, restores, cleanup, and deletions are automatically logged with timestamps and details

## API Endpoints

### Container Endpoints
```
GET    /api/containers                          # List all containers
POST   /api/container/<id>/start                # Start container
POST   /api/container/<id>/stop                 # Stop container gracefully (SIGTERM)
POST   /api/container/<id>/kill                 # Kill container immediately (SIGKILL)
POST   /api/container/<id>/restart              # Restart container
DELETE /api/container/<id>/delete               # Delete container
GET    /api/container/<id>/details              # Get container details
GET    /api/container/<id>/logs                 # Get container logs
GET    /api/container/<id>/stats                # Get container stats
POST   /api/container/<id>/exec                 # Execute command in container
POST   /api/container/<id>/redeploy             # Redeploy container
```

### Backup Endpoints
```
POST   /api/backup/<container_id>               # Create container backup
                                                      # Query params: ?queue=true for bulk operations
GET    /api/backups                             # List all backups (from S3 and local)
GET    /api/backup/<filename>/preview            # Preview backup contents
POST   /api/restore-backup                      # Restore backup (downloads from S3 if needed)
DELETE /api/backup/<filename>                   # Delete backup (from S3 or local)
GET    /api/download/<filename>                 # Download backup file (from S3 or local)
POST   /api/upload-backup                       # Upload backup file (to S3 or local) - accepts both .tar.gz container backups and .json network backups
POST   /api/backups/download-all-prepare        # Prepare bulk download session (includes S3 backups)
GET    /api/backups/download-all-progress/<id>  # Get bulk download progress
POST   /api/backups/download-all-create/<id>    # Create download session (downloads S3 backups to temp if needed)
GET    /api/backups/download-all/<id>           # Download individual file from bulk download (sequential downloads, not archive)
DELETE /api/backups/delete-all                  # Delete all backups (from S3 and local)
GET    /api/backup-progress/<progress_id>       # Get backup progress (exempt from rate limiting)
GET    /api/backup/status                       # Get backup status (includes queue size)
```

### Scheduler Endpoints
```
GET    /api/scheduler/config                    # Get scheduler configuration
POST   /api/scheduler/config                    # Update scheduler configuration
POST   /api/scheduler/test                      # Trigger scheduled backups immediately (for testing)
POST   /api/scheduler/cleanup                   # Manually trigger cleanup of old scheduled backups
```

### Storage Settings Endpoints
```
GET    /api/storage/settings                    # Get storage settings (local/S3)
POST   /api/storage/settings                    # Update storage settings
POST   /api/storage/test-s3                     # Test S3 connection and permissions
```

### Volume Endpoints
```
GET    /api/volumes                             # List all volumes
GET    /api/volume/<name>/explore               # Explore volume contents
GET    /api/volume/<name>/file                  # Get volume file contents
GET    /api/volume/<name>/download              # Download volume file
DELETE /api/volume/<name>/delete                # Delete volume
POST   /api/volumes/delete                     # Delete multiple volumes
```

### Image Endpoints
```
GET    /api/images                              # List all images
DELETE /api/image/<id>/delete                   # Delete image
POST   /api/cleanup/dangling-images             # Cleanup dangling images
```

### Stack Endpoints
```
GET    /api/stacks                              # List all Docker stacks
DELETE /api/stack/<name>/delete                  # Delete stack
```

### Network Endpoints
```
GET    /api/networks                            # List all networks
POST   /api/network/<id>/backup                 # Backup network (uploads to S3 if enabled)
POST   /api/network/restore                     # Restore network backup (downloads from S3 if needed)
DELETE /api/network/<id>/delete                 # Delete network
GET    /api/network-backups                     # List network backups (from S3 and local)
```

### System Endpoints
```
GET    /api/dashboard-stats                     # Get dashboard statistics
GET    /api/system-stats                        # Get system CPU/RAM stats
GET    /api/statistics                          # Get comprehensive container statistics (CPU, RAM, Network I/O, Block I/O)
GET    /api/system-time                         # Get current system time
GET    /api/check-environment                   # Check Docker environment
POST   /api/cleanup/temp-containers             # Cleanup temporary containers
```

### Authentication Endpoints
```
POST   /api/login                               # User login (username/password)
POST   /api/logout                              # User logout
GET    /api/auth-status                         # Check authentication status
POST   /api/change-password                     # Change username and/or password
```

### Audit Log Endpoints
```
GET    /api/audit-logs                          # Get audit logs with optional filtering (operation_type, status, container_id, date range)
GET    /api/audit-logs/statistics               # Get audit log statistics
DELETE /api/audit-logs/clear                    # Clear all audit logs
```

### UI Settings Endpoints
```
GET    /api/ui/settings                         # Get all UI settings
GET    /api/ui/settings/<key>                   # Get UI setting value (e.g., server_name)
POST   /api/ui/settings/<key>                   # Set UI setting value (e.g., server_name)
```

### UI Endpoints
```
GET    /                                        # Main application page
GET    /console/<container_id>                  # Container console page
```

## Data Models

### Container
- ID, name, image, status, ports, IP address, created date
- Mounts (volumes), environment variables, port mappings

### Backup
- Filename, size, creation date, container name
- Metadata: volumes, port mappings, environment variables

### Volume
- Name, driver, mount point, size (if available)

### Image
- ID, repository, tag, size, created date

### Network
- ID, name, driver, scope, IPAM configuration

### User
- ID, username (unique), password_hash, created_at timestamp

## Key Technical Decisions

1. **Modular Architecture**: Application refactored into separate manager modules (`auth_manager.py`, `container_manager.py`, `backup_manager.py`, `backup_file_manager.py`, `restore_manager.py`, `volume_manager.py`, `image_manager.py`, `network_manager.py`, `stack_manager.py`, `system_manager.py`, `scheduler_manager.py`, `audit_log_manager.py`, `storage_settings_manager.py`, `ui_settings_manager.py`, `s3_storage_manager.py`, `encryption_utils.py`) for better maintainability and separation of concerns
2. **Direct Docker Socket API**: Uses direct HTTP requests to Docker socket (`docker_api.py`) for better reliability than docker-py library
3. **Modular Backup System**: Backup functionality separated into `backup_manager.py` and `backup_file_manager.py` modules for maintainability
4. **Sequential Backup Queue**: Queue processor ensures backups complete fully (including tar.gz writing) before starting next
5. **Session-based Authentication**: SQLite database stores user credentials with password hashing for security (`auth_manager.py`)
6. **Volume-based Storage**: Backups stored in Docker volume for persistence across container restarts, with optional S3 cloud storage
7. **Encrypted Credentials**: S3 access keys and secret keys encrypted at rest in database using Fernet symmetric encryption
8. **Client-side Polling**: Stats updated via 5-second polling intervals for real-time updates
9. **Rate Limiting**: Flask-Limiter protects API endpoints (progress endpoint exempt for frequent polling)
10. **Progressive Enhancement**: Works without JavaScript for basic functionality, enhanced with JS
11. **Self-filtering**: Application filters itself from container/image/volume listings to avoid recursion
12. **Backup Completion Verification**: Ensures tar.gz files are fully written before marking backup complete
13. **S3 Integration**: Seamless integration with AWS S3 for cloud backup storage with encrypted credentials

## Performance Considerations

- Stats polling limited to 5-second intervals
- Backup operations run in background threads with progress tracking
- Sequential backup queue prevents resource contention and ensures reliability
- Large file downloads use streaming
- Bulk operations use queue system for sequential processing (prevents conflicts)
- Container metadata cached client-side
- Progress endpoint exempt from rate limiting to allow frequent status updates

## Security Considerations

- Requires Docker socket access (run with appropriate permissions)
- **Built-in authentication**: Session-based login system with SQLite user database (`auth_manager.py`)
  - Session lifetime: 1 day (24 hours)
- **Strong Password Policy**: Enforced password complexity requirements
  - Minimum 12 characters length
  - Must contain at least one uppercase letter (A-Z)
  - Must contain at least one lowercase letter (a-z)
  - Must contain at least one digit (0-9)
  - Must contain at least one special character (!@#$%^&*...)
  - Real-time password validation with visual feedback in change password modal
  - Password policy requirements clearly displayed to users
  - Backend validation ensures policy enforcement
- Default credentials: username `admin`, password `c0Nta!nerM0nK3y#Q92x` (should be changed in production)
  - **Security warning modal** appears automatically when default credentials are used
- **Encryption Key Management**: Unique random encryption key generated per installation
  - Key stored at `/backups/config/encryption.key` in Docker volume
  - Key file has restricted permissions (600 - owner read/write only)
  - No hardcoded encryption keys - fails securely if key cannot be accessed
- All API endpoints require authentication (except `/api/login`, `/api/logout`, `/api/auth-status`)
- **Command Injection Prevention**: 
  - Container exec commands sanitized using `shlex.quote()` to prevent shell injection
  - Commands with shell operators (`&&`, `|`, `;`) are safely escaped
  - Container ID validation ensures proper format before execution
  - Container redeploy uses secure command parsing without shell fallback
- **Secure Working Directory**: Uses Docker's native `-w` flag instead of shell-based directory changes
- File uploads validated and sanitized
- Container commands executed with user permissions
- Volume exploration limited to readable paths

