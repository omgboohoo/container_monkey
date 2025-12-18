# Product Requirements Document: Container Monkey

**Version 0.4.1**

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
  - `events_manager.py` - Docker events management, filtering, and formatting
  - `system_manager.py` - System monitoring and statistics
  - `scheduler_manager.py` - Scheduled backup management and lifecycle cleanup
  - `audit_log_manager.py` - Audit logging for backup operations
  - `storage_settings_manager.py` - Storage settings management (local vs S3)
  - `ui_settings_manager.py` - UI settings management (server name, etc.)
  - `s3_storage_manager.py` - S3 storage operations
  - `database_manager.py` - Unified database initialization and schema management
  - `stats_cache_manager.py` - Background caching and refresh of container statistics
  - `encryption_utils.py` - Encryption utilities for securing credentials
  - `error_utils.py` - Safe error logging utilities to prevent information disclosure
- **Storage**: Docker volumes for backup persistence
  - Organized directory structure: `backups/` subdirectory for backup files, `config/` subdirectory for configuration
  - Automatic migration of existing files to organized structure on startup
- **Database**: SQLite database (`monkey.db`) for user management, audit logs, storage settings, and UI settings (stored in `config/` subdirectory of backup volume)
  - Unified database schema managed by `DatabaseManager` class
  - Tables: `users`, `audit_logs`, `backup_schedules`, `storage_settings`, `ui_settings`
  - Indexes on audit_logs for performance (timestamp, operation_type, container_id, status)
  - Automatic default user creation on first run
- **Rate Limiting**: Flask-Limiter 3.5.0 for API protection
  - Default limits: 200 requests per day, 50 requests per hour per IP
  - Progress endpoint (`/api/backup-progress/<progress_id>`) exempt from rate limiting for frequent polling
  - Login endpoint limited to 5 requests per minute
- **CSRF Protection**: Flask-WTF 1.2.1 CSRF protection for all state-changing requests
  - CSRF token cookie name: `X-CSRFToken`
  - CSRF token headers: `X-CSRFToken`, `X-CSRF-Token`
  - No time limit on CSRF tokens
  - Login endpoint exempt (creates new session)
- **Session Security**: Enhanced session cookie protection
  - `HttpOnly` flag prevents JavaScript access (XSS protection)
  - `SameSite='Lax'` provides CSRF protection
  - Automatic HTTPS detection via `X-Forwarded-Proto` header from reverse proxy
  - Secure flag dynamically set based on proxy header (works with nginx, Apache, etc.)
  - Session lifetime: 1 day (24 hours)
- **Server**: Flask development server (container port 80, host port 1066 by default)

### Frontend
- **Language**: Vanilla JavaScript (ES6+)
- **Styling**: Modern CSS with CSS variables and flexbox/grid
- **Icons**: Phosphor Icons
- **Terminal**: XTerm.js for container console access
- **Architecture**: Single Page Application (SPA) with client-side routing
- **Modular Structure**: Frontend code organized into 19 focused modules for maintainability
  - **Core Modules**:
    - `shared-state.js` - Centralized state management (`window.AppState`) for all modules
    - `csrf.js` - CSRF token handling, API request utilities, and global fetch interception
    - `ui-utils.js` - UI utilities (modals, notifications, spinners, time display, sidebar)
    - `auth.js` - Authentication, login, logout, password/username management
    - `navigation.js` - Section navigation, dashboard, and tab switching
    - `app.js` - Main application coordinator and initialization
  - **Feature Modules**:
    - `containers.js` - Container management, operations, backup functions, filtering
    - `backups.js` - Backup file management, restore, upload, download operations
    - `volumes.js` - Volume exploration, file browsing, download, management
    - `images.js` - Image listing, removal, dangling image cleanup
    - `networks.js` - Network management, backup/restore operations
    - `stacks.js` - Stack management, container filtering by stack
    - `events.js` - Docker events viewing, filtering, and sorting
    - `statistics.js` - Container statistics, system stats polling, refresh management
    - `audit-log.js` - Audit log management, pagination, filtering
    - `console.js` - Terminal console (XTerm.js), container logs streaming
    - `scheduler.js` - Backup scheduler configuration, environment checks
    - `storage.js` - Storage settings (S3/local), S3 configuration
    - `settings.js` - UI settings (server name, etc.)
  - **Module Loading Order**: Critical dependency order ensures proper initialization
    1. `shared-state.js` (defines `window.AppState`)
    2. `csrf.js` (core API utilities)
    3. `ui-utils.js` (UI helpers)
    4. `auth.js` (authentication)
    5. `navigation.js` (section switching)
    6. Domain modules (containers, backups, etc.)
    7. `app.js` (main coordinator)
  - **State Management**: Centralized through `window.AppState` object
  - **Function Export**: All functions exported to `window` object for HTML `onclick` access

### Infrastructure
- **Container Runtime**: Docker Engine
- **Volume Management**: Docker volumes (`container_monkey` volume)
- **Socket Access**: `/var/run/docker.sock` for Docker API communication

## Key Functionality

### Container Management
- List, start, stop (graceful), pause, resume, kill (immediate), restart, remove containers
- Bulk operations on multiple containers with intelligent button state management
  - Start button: Only enabled when stopped containers are selected
  - Stop button: Only enabled when running containers are selected
  - Kill button: Only enabled when running containers are selected (disabled if stopped containers selected)
  - Restart button: Enabled when any containers are selected (works on any container status)
  - Pause button: Only enabled when running containers are selected
  - Resume button: Only enabled when paused containers are selected
- Container logs streaming with real-time updates
  - Displays all container logs when modal first opens (using `tail='all'`)
  - Auto-refreshes every 3 seconds while modal is open
  - Live indicator with pulsing animation shows when logs are streaming
  - Smart auto-scroll: automatically scrolls to bottom when new logs arrive, but only if user is already at bottom
  - No manual refresh button needed (auto-refresh handles updates)
- Interactive exec console
- Container details inspection (formatted view)
- Container JSON inspection (raw Docker inspect output with syntax highlighting)
  - Quick action "Inspect" button in container actions
  - Copy to clipboard functionality

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
  - Download and Remove buttons work with selected backups only
  - Buttons disabled by default, enabled when backups are selected
  - Individual Download/Remove buttons removed from rows (Restore button kept)
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
  - Companion JSON files automatically removed when backups are removed
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
- Volume removal (single and bulk)

### Image Management
- Image listing with size information
- Image removal
- Dangling image cleanup (button automatically disables when no dangling images exist)

### Network Management
- Network listing with container counts (includes all containers: running and stopped)
- Network backup and restore
- Network removal (automatically disabled when networks have containers)
- View Containers button filters container view to show containers using selected network

### Stack Management
- Stack listing (Docker Swarm stacks and Compose-based stacks)
- Stack removal

### Events Management
- Docker events viewing and filtering
- Events from last 24 hours displayed by default
- Search functionality to filter events by name, type, action, or timestamp
- Type filter dropdown (Container, Image, Volume, Network, Plugin, Service, Node, Secret, Config)
- Action filter dropdown that dynamically updates based on selected type
- Prevents invalid action/type combinations (e.g., can't "start" a volume)
- Sortable columns (Time, Type, Action, Name)
- Color-coded actions for visual distinction (green for start/create, red for stop/kill, yellow for destroy)
- Real-time filtering as you type
- Efficient event fetching with time-based filtering and response size limits

### System Monitoring
- Dashboard with resource overview and backup schedule next run time
- Real-time system CPU/RAM stats in top bar (polled every 5 seconds)
- **Statistics Page**: Comprehensive container statistics view with background caching, refresh countdown, and manual refresh button
  - All containers displayed in a grid format
  - Shows CPU %, RAM usage, Network I/O, Block I/O, and Next Refresh countdown for each container
  - Status badges (running/stopped) matching container viewer styling
  - **Background Caching**: `StatsCacheManager` handles background refresh every 5 minutes (300 seconds)
    - Background thread refreshes stats automatically
    - Cached stats returned immediately on API request
    - Manual refresh triggers background update and polls for completion
    - Thread-safe with locking to prevent concurrent refreshes
    - Automatic thread restart on failure
  - Next Refresh column shows countdown timer (5:00 to 0:00) indicating time until next automatic refresh
  - Countdown updates every second in real-time
  - Manual refresh button (enabled by default, allows on-demand refresh)
  - No automatic refresh on page visit - users see cached data immediately and can refresh manually if needed
  - Request cancellation: Prevents duplicate requests by canceling previous requests
  - Enhanced error handling: Clear error messages for network and abort scenarios
  - Prevents stuck spinner: Loading spinner always hidden even if request fails

### Backup Audit Log
- View audit logs for all backup-related operations
- Filter by operation type (Manual Backups, Scheduled Backups, Restores, Lifecycle Cleanup, Backup Removal)
- Filter by status (Started, Completed, Error)
- View statistics: total logs, last 24 hours, and last 7 days activity
- Clear all audit logs with confirmation prompt (permanently removes all log entries)
- Comprehensive tracking: All backup operations, restores, cleanup, and removals are automatically logged with timestamps and details

## API Endpoints

### Container Endpoints
```
GET    /api/containers                          # List all containers
POST   /api/container/<id>/start                # Start container
POST   /api/container/<id>/stop                 # Stop container gracefully (SIGTERM)
POST   /api/container/<id>/kill                 # Kill container immediately (SIGKILL)
POST   /api/container/<id>/restart              # Restart container
POST   /api/container/<id>/pause                # Pause container
POST   /api/container/<id>/resume               # Resume (unpause) container
DELETE /api/container/<id>/delete               # Remove container
GET    /api/container/<id>/details              # Get container details
GET    /api/container/<id>/inspect               # Get raw container inspect JSON (like docker inspect)
GET    /api/container/<id>/logs                  # Get container logs (supports ?tail=all for all logs)
GET    /api/container/<id>/stats                 # Get container stats
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
DELETE /api/backup/<filename>                   # Remove backup (from S3 or local)
GET    /api/download/<filename>                 # Download backup file (from S3 or local)
POST   /api/upload-backup                       # Upload backup file (to S3 or local) - accepts both .tar.gz container backups and .json network backups
POST   /api/backups/download-all-prepare        # Prepare bulk download session (includes S3 backups)
GET    /api/backups/download-all-progress/<id>  # Get bulk download progress
POST   /api/backups/download-all-create/<id>    # Create download session (downloads S3 backups to temp if needed)
GET    /api/backups/download-all/<id>           # Download individual file from bulk download (sequential downloads, not archive)
DELETE /api/backups/delete-all                  # Remove all backups (from S3 and local)
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
DELETE /api/volume/<name>/delete                # Remove volume
POST   /api/volumes/delete                     # Remove multiple volumes
```

### Image Endpoints
```
GET    /api/images                              # List all images
DELETE /api/image/<id>/delete                   # Remove image
POST   /api/cleanup/dangling-images             # Cleanup dangling images
```

### Stack Endpoints
```
GET    /api/stacks                              # List all Docker stacks
DELETE /api/stack/<name>/delete                  # Remove stack
```

### Network Endpoints
```
GET    /api/networks                            # List all networks
POST   /api/network/<id>/backup                 # Backup network (uploads to S3 if enabled)
POST   /api/network/restore                     # Restore network backup (downloads from S3 if needed)
DELETE /api/network/<id>/delete                 # Remove network
GET    /api/network-backups                     # List network backups (from S3 and local)
```

### Events Endpoints
```
GET    /api/events                               # Get Docker events
                                                      # Query params: ?since=<unix_timestamp> (default: last 24 hours)
                                                      # Query params: ?until=<unix_timestamp> (default: now)
```

### System Endpoints
```
GET    /api/dashboard-stats                     # Get dashboard statistics
GET    /api/system-stats                        # Get system CPU/RAM stats
GET    /api/statistics                          # Get comprehensive container statistics (CPU, RAM, Network I/O, Block I/O, Next Refresh) - returns cached stats immediately
POST   /api/statistics/refresh                  # Trigger background refresh of statistics cache
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
- Companion JSON files (`.tar.gz.json`) store server name and backup type (Manual/Scheduled)
- Storage location tracked (Local/S3)

### Volume
- Name, driver, mount point, size (if available)

### Image
- ID, repository, tag, size, created date

### Network
- ID, name, driver, scope, IPAM configuration

### Database Schema (SQLite - monkey.db)

#### users table
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `username` TEXT UNIQUE NOT NULL
- `password_hash` TEXT NOT NULL
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

#### audit_logs table
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `operation_type` TEXT NOT NULL (Manual Backup, Scheduled Backup, Restore, Lifecycle Cleanup, Backup Removal)
- `container_id` TEXT
- `container_name` TEXT
- `backup_filename` TEXT
- `status` TEXT NOT NULL (Started, Completed, Error)
- `error_message` TEXT
- `user` TEXT
- `details` TEXT
- Indexes: timestamp, operation_type, container_id, status

#### backup_schedules table
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `schedule_type` TEXT NOT NULL DEFAULT 'daily' (daily/weekly)
- `hour` INTEGER NOT NULL DEFAULT 2 (0-23)
- `day_of_week` INTEGER (0-6, for weekly schedules)
- `lifecycle` INTEGER NOT NULL DEFAULT 7 (number of scheduled backups to keep per container)
- `selected_containers` TEXT NOT NULL DEFAULT '[]' (JSON array of container IDs)
- `last_run` TIMESTAMP
- `next_run` TIMESTAMP
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

#### storage_settings table
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `storage_type` TEXT NOT NULL DEFAULT 'local' (local/s3)
- `s3_bucket` TEXT
- `s3_region` TEXT
- `s3_access_key` TEXT
- `s3_secret_key` TEXT (encrypted at rest using Fernet)
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

#### ui_settings table
- `id` INTEGER PRIMARY KEY AUTOINCREMENT
- `setting_key` TEXT UNIQUE NOT NULL (e.g., 'server_name')
- `setting_value` TEXT NOT NULL
- `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
- `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP

## Key Technical Decisions

1. **Modular Architecture**: Application refactored into separate manager modules (`auth_manager.py`, `container_manager.py`, `backup_manager.py`, `backup_file_manager.py`, `restore_manager.py`, `volume_manager.py`, `image_manager.py`, `network_manager.py`, `stack_manager.py`, `events_manager.py`, `system_manager.py`, `scheduler_manager.py`, `audit_log_manager.py`, `storage_settings_manager.py`, `ui_settings_manager.py`, `s3_storage_manager.py`, `database_manager.py`, `stats_cache_manager.py`, `encryption_utils.py`, `error_utils.py`) for better maintainability and separation of concerns
2. **Direct Docker Socket API**: Uses direct HTTP requests to Docker socket (`docker_api.py`) for better reliability than docker-py library
3. **Modular Backup System**: Backup functionality separated into `backup_manager.py` and `backup_file_manager.py` modules for maintainability
4. **Sequential Backup Queue**: Queue processor ensures backups complete fully (including tar.gz writing) before starting next
5. **Session-based Authentication**: SQLite database stores user credentials with password hashing for security (`auth_manager.py`)
6. **Unified Database Management**: `DatabaseManager` handles all database initialization, schema creation, and default data setup in a single unified database (`monkey.db`)
7. **Volume-based Storage**: Backups stored in Docker volume for persistence across container restarts, with optional S3 cloud storage
8. **Encrypted Credentials**: S3 access keys and secret keys encrypted at rest in database using Fernet symmetric encryption (`encryption_utils.py`)
9. **Background Stats Caching**: `StatsCacheManager` provides background thread-based caching of container statistics with 5-minute refresh interval, enabling instant API responses
10. **Rate Limiting**: Flask-Limiter protects API endpoints with default limits (200/day, 50/hour), progress endpoint exempt for frequent polling
11. **CSRF Protection**: Flask-WTF CSRF protection on all state-changing requests with automatic token management
12. **Dynamic Session Security**: Session cookie Secure flag automatically set based on `X-Forwarded-Proto` header from reverse proxy (supports HTTP and HTTPS deployments)
13. **Safe Error Handling**: `error_utils.py` provides safe error logging that prevents information disclosure in production (full stack traces only in debug mode)
14. **Progressive Enhancement**: Works without JavaScript for basic functionality, enhanced with JS
15. **Self-filtering**: Application filters itself from container/image/volume listings to avoid recursion
16. **Backup Completion Verification**: Ensures tar.gz files are fully written before marking backup complete
17. **S3 Integration**: Seamless integration with AWS S3 for cloud backup storage with encrypted credentials

## Performance Considerations

- **System Stats Polling**: Limited to 5-second intervals for top bar CPU/RAM stats
- **Statistics Caching**: Background thread-based caching (`StatsCacheManager`) refreshes container statistics every 5 minutes, enabling instant API responses without blocking
- **Backup Operations**: Run in background threads with progress tracking
- **Sequential Backup Queue**: Prevents resource contention and ensures reliability
- **Large File Downloads**: Use streaming for efficient memory usage
- **Bulk Operations**: Use queue system for sequential processing (prevents conflicts)
- **Container Metadata**: Cached client-side to reduce API calls
- **Progress Endpoint**: Exempt from rate limiting to allow frequent status updates during long-running operations
- **Database Indexes**: Indexes on audit_logs table (timestamp, operation_type, container_id, status) for fast queries
- **Request Cancellation**: Statistics refresh uses AbortController to cancel duplicate requests

## Security Considerations

- Requires Docker socket access (run with appropriate permissions)
- **Built-in authentication**: Session-based login system with SQLite user database (`auth_manager.py`)
  - Session lifetime: 1 day (24 hours)
  - Session cookie security: `HttpOnly`, `SameSite='Lax'`, dynamic `Secure` flag based on HTTPS detection
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
- **CSRF Protection**: Flask-WTF CSRF protection on all state-changing API endpoints
  - CSRF tokens required in headers (`X-CSRFToken` or `X-CSRF-Token`)
  - Login endpoint exempt (creates new session)
  - CSRF errors return 400 status with clear error message
- **Encryption Key Management**: Unique random encryption key generated per installation
  - Key stored at `/backups/config/encryption.key` in Docker volume
  - Key file has restricted permissions (600 - owner read/write only)
  - No hardcoded encryption keys - fails securely if key cannot be accessed
- **S3 Credentials Security**: S3 secret keys never exposed in API responses
  - Secret keys returned as masked placeholders (`***`) in API responses
  - Users can update S3 settings without re-entering secret key (preserves existing)
  - Secret keys only transmitted when explicitly changed by user
  - Prevents credential exposure through API inspection or network monitoring
- All API endpoints require authentication (except `/api/login`, `/api/logout`, `/api/auth-status`, `/api/backup-progress/<progress_id>`)
- **Comprehensive Input Validation**: All route parameters and user inputs are validated to prevent injection attacks
  - Container ID validation (hex ID or name format) on all container operations
  - Volume name validation for volume exploration, file access, and deletion
  - Network ID validation for network backup and deletion operations
  - Image ID validation for image deletion operations
  - Stack name validation for stack deletion operations
  - Progress and session ID validation (UUID-like format) for backup operations
  - Query parameter validation (limit, offset, tail, since, until) with type checking and bounds
  - Filename validation for all backup file operations (download, delete, preview, restore)
  - Working directory path validation for container exec operations (prevents path traversal)
  - UI setting key validation for settings management
- **Command Injection Prevention**: 
  - Container exec commands sanitized using `shlex.quote()` to prevent shell injection
  - Commands with shell operators (`&&`, `|`, `;`) are safely escaped
  - Container ID validation ensures proper format before execution
  - Container redeploy uses secure command parsing without shell fallback
- **Secure Working Directory**: Uses Docker's native `-w` flag with comprehensive path validation
  - Working directory paths validated to prevent path traversal attacks
  - URL-encoded attack patterns detected and blocked
  - Ensures absolute paths only
- **Path Traversal Protection**: Enhanced file path validation across all operations
  - Volume file paths validated with encoded pattern detection
  - Backup file paths validated with realpath checks
  - All file operations restricted to allowed directories
- **Error Handling Security**: `error_utils.py` prevents information disclosure
  - Full stack traces only shown in debug mode
  - Generic error messages returned to users in production
  - Prevents exposure of file paths, code structure, and internal system details
- File uploads validated and sanitized with secure filename checks
- Container commands executed with user permissions
- Volume exploration limited to readable paths with path validation
- Rate limiting protects against brute force attacks (login endpoint: 5 requests/minute)

