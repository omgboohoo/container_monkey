# Container Monkey

**Version 0.4.2**

The open-source backup and recovery solution for Docker. Protect your containers, volumes, and networks with one-click backups, automated scheduling, and instant restoration.

## Features

### Core Capabilities

- **One-Click Backup & Restore**: Full container backups including volumes, port mappings, and environment variables. Restore anywhere with a single click.
- **Instant Server Migration**: Instantly move containers and volumes from one server to another. Backup on one server, restore on another—seamless infrastructure mobility.
- **Automated Scheduling**: Set-and-forget backup schedules with daily or weekly options. Never lose data again.
- **Cloud Storage Integration**: Store backups in AWS S3 for off-site protection and shared vaults across multiple servers.
- **Multi-Server Support**: Deploy Container Monkey across your infrastructure. All instances can share the same S3 backup vault while maintaining server identification.

### Docker Management

- **Container Operations**: Start, stop, pause, resume, restart, kill, and manage containers with bulk operations support
- **Container Inspection**: View detailed container information and inspect raw container JSON (like `docker inspect`)
- **Volume Management**: Explore, download, and manage Docker volumes through an intuitive web interface
- **Image Management**: View and clean up Docker images, including automatic dangling image detection
- **Network Management**: Backup and restore Docker networks with full configuration preservation
- **Events Monitoring**: View and filter Docker events (containers, images, volumes, networks) with search and type/action filtering

### Operations & Monitoring

- **Real-Time Monitoring**: System-wide CPU and RAM utilization with detailed container statistics (CPU, RAM, Network I/O, Block I/O)
- **Web Console**: Interactive terminal access to containers directly from your browser
- **Audit Logging**: Comprehensive audit trail for all backup operations, restores, and lifecycle events

## Quick Start

### Local Development (build_deploy_local_docker.sh)

For local development and testing:

```bash
chmod +x build_deploy_local_docker.sh
./build_deploy_local_docker.sh
```

Access the web UI at: http://localhost:1066

**Default login credentials:**
- Username: `admin`
- Password: `c0Nta!nerM0nK3y#Q92x`

### Docker / Cloud Deployment

#### Pull Method (Recommended)

1. **Pull the image from GitHub Container Registry:**
```bash
docker pull ghcr.io/omgboohoo/container_monkey:latest
```

2. **Run the container:**
```bash
docker run -d \
  --name container_monkey \
  -p 1066:80 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v container_monkey:/backups \
  --restart always \
  ghcr.io/omgboohoo/container_monkey:latest
```

#### Manual Build

1. **Build the image and create tar file:**
```bash
docker build -t container_monkey ./
docker save -o container_monkey.tar container_monkey
```

2. **Upload the tar file to your server:**
```bash
scp container_monkey.tar user@your-server:/home/user/
```

3. **On the server, load the image:**
```bash
docker load -i container_monkey.tar
```

4. **Run the container:**
```bash
docker run -d \
  --name container_monkey \
  -p 1066:80 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v container_monkey:/backups \
  --restart always \
  container_monkey
```

Access the web UI at: http://your-server:1066

**Default login credentials:**
- Username: `admin`
- Password: `c0Nta!nerM0nK3y#Q92x`

## Requirements

- Docker Engine installed and running
- Access to `/var/run/docker.sock` (or Docker context)
- Port 1066 available on host (maps to container port 80)

## Configuration

### Environment Variables

- `FLASK_PORT`: Port to run the web server inside container (default: 80)

### Volume Mounts

- `/var/run/docker.sock`: Docker socket (required)
- `container_monkey:/backups`: Backup storage and database volume

## Usage

### Container Operations

1. **View Containers**: Navigate to the Containers section
2. **Start/Stop/Pause/Resume/Kill/Restart**: Use quick action buttons or bulk operations
   - **Start**: Start stopped containers
   - **Stop**: Gracefully stop containers (SIGTERM with default timeout)
   - **Pause**: Pause running containers (freeze process state)
   - **Resume**: Resume paused containers (unfreeze process state)
   - **Kill**: Immediately terminate containers (SIGKILL)
   - **Restart**: Gracefully stop then restart containers
3. **Backup**: Click backup button to create a full container backup
4. **Remove**: Remove containers with options to remove associated volumes/images
5. **View Logs**: Click logs icon to view real-time container logs
   - Displays all container logs when modal opens
   - Auto-refreshes every 3 seconds while modal is open
   - Live indicator shows when logs are streaming
   - Smart auto-scroll (only scrolls if user is at bottom)
6. **Exec Console**: Click console icon for interactive terminal access

### Backup & Restore

1. **Create Backup**: Click backup button on any container
2. **Backup All**: Select multiple containers and use "Backup All" for sequential processing
3. **View Backups**: Navigate to Backup Vault section
4. **Restore**: Click restore button, configure ports and volume options
5. **Download**: Download backups as tar files (single or bulk)
6. **Upload**: Upload backup files to restore
7. **Progress Tracking**: Real-time progress updates during backup operations
8. **Queue System**: Backups are queued and processed sequentially to ensure reliability

### Volume Management

1. **Explore Volumes**: Browse volume contents through the web UI
2. **Download Files**: Download individual files from volumes
3. **View Files**: View file contents directly in the browser
4. **Remove**: Remove volumes

### System Monitoring

- **Dashboard**: Overview of containers, images, volumes, networks, backup schedule
- **System Stats**: Real-time CPU and RAM utilization in top bar (includes Docker version)
- **Statistics Page**: View all containers with detailed stats including CPU %, RAM, Network I/O, Block I/O, and refresh countdown timer
- **Events Page**: Monitor Docker events in real-time with filtering and search capabilities
  - View Docker events for containers, images, volumes, and networks
  - Filter by event type (container, image, volume, network) and action (start, stop, create, destroy, etc.)
  - Search events by name, type, action, or timestamp
  - Color-coded events (green for start/create, red for stop/kill, yellow for destroy/remove)
  - Shows events from the last 24 hours by default

### Backup Audit Log

1. **View Audit Logs**: Navigate to Backup Audit Log section to view all backup-related operations
2. **Filter Operations**: Filter by operation type (Manual Backups, Scheduled Backups, Restores, Lifecycle Cleanup, Backup Removal)
3. **Filter Status**: Filter by status (Started, Completed, Error)
4. **Statistics**: View total logs, last 24 hours, and last 7 days activity
5. **Clear Logs**: Clear all audit logs with confirmation prompt (permanently removes all log entries)
6. **Comprehensive Tracking**: All backup operations, restores, cleanup, and removals are automatically logged with timestamps and details

## API Endpoints

The application provides a RESTful API. Key endpoints include:

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/auth-status` - Check authentication status
- `POST /api/change-password` - Change username/password

### Containers
- `GET /api/containers` - List all containers
- `POST /api/container/<id>/start` - Start container
- `POST /api/container/<id>/stop` - Stop container gracefully (SIGTERM)
- `POST /api/container/<id>/kill` - Kill container immediately (SIGKILL)
- `POST /api/container/<id>/restart` - Restart container
- `POST /api/container/<id>/pause` - Pause container
- `POST /api/container/<id>/resume` - Resume (unpause) container
- `DELETE /api/container/<id>/delete` - Remove container
- `GET /api/container/<id>/details` - Get container details
- `GET /api/container/<id>/inspect` - Get raw container inspect JSON (like `docker inspect`)
- `GET /api/container/<id>/logs` - Get container logs (supports `?tail=all` for all logs)
- `GET /api/container/<id>/stats` - Get container stats
- `POST /api/container/<id>/exec` - Execute command in container
- `POST /api/container/<id>/redeploy` - Redeploy container

### Backups
- `POST /api/backup/<container_id>` - Backup container (supports `?queue=true` for bulk operations)
- `GET /api/backups` - List all backups (from S3 and local)
- `GET /api/backup/<filename>/preview` - Preview backup contents
- `POST /api/restore-backup` - Restore backup
- `DELETE /api/backup/<filename>` - Remove backup (from S3 or local)
- `DELETE /api/backups/delete-all` - Remove all backups
- `GET /api/download/<filename>` - Download backup file (from S3 or local)
- `POST /api/upload-backup` - Upload backup file (to S3 or local) - accepts both .tar.gz container backups and .json network backups
- `POST /api/backups/download-all-prepare` - Prepare bulk download session
- `GET /api/backups/download-all-progress/<id>` - Get bulk download progress
- `POST /api/backups/download-all-create/<id>` - Create download session
- `GET /api/backups/download-all/<id>` - Download individual file from bulk download
- `GET /api/backup-progress/<progress_id>` - Get backup progress (exempt from rate limiting)
- `GET /api/backup/status` - Get backup system status (includes queue size)

### Scheduler
- `GET /api/scheduler/config` - Get scheduler configuration
- `POST /api/scheduler/config` - Update scheduler configuration
- `POST /api/scheduler/test` - Trigger scheduled backups immediately (for testing)
- `POST /api/scheduler/cleanup` - Manually trigger cleanup of old scheduled backups

### Storage Settings
- `GET /api/storage/settings` - Get storage settings (local/S3)
- `POST /api/storage/settings` - Update storage settings
- `POST /api/storage/test-s3` - Test S3 connection and permissions

### Volumes
- `GET /api/volumes` - List all volumes
- `GET /api/volume/<name>/explore` - Explore volume contents
- `GET /api/volume/<name>/file` - Get volume file contents
- `GET /api/volume/<name>/download` - Download volume file
- `DELETE /api/volume/<name>/delete` - Remove volume
- `POST /api/volumes/delete` - Remove multiple volumes

### Images
- `GET /api/images` - List all images
- `DELETE /api/image/<id>/delete` - Remove image
- `POST /api/cleanup/dangling-images` - Cleanup dangling images

### Networks
- `GET /api/networks` - List all networks
- `POST /api/network/<id>/backup` - Backup network (uploads to S3 if enabled)
- `POST /api/network/restore` - Restore network backup (downloads from S3 if needed)
- `DELETE /api/network/<id>/delete` - Remove network
- `GET /api/network-backups` - List network backups (from S3 and local)

### Stacks
- `GET /api/stacks` - List all Docker stacks
- `DELETE /api/stack/<name>/delete` - Remove stack

### Events
- `GET /api/events` - Get Docker events (supports `?since=<timestamp>` and `?until=<timestamp>` query parameters)

### System & Monitoring
- `GET /api/dashboard-stats` - Get dashboard statistics
- `GET /api/system-stats` - Get system CPU/RAM stats (includes Docker version)
- `GET /api/statistics` - Get comprehensive container statistics (CPU, RAM, Network I/O, Block I/O, Next Refresh countdown) - returns cached stats immediately
- `POST /api/statistics/refresh` - Trigger background refresh of statistics cache
- `GET /api/system-time` - Get current system time
- `GET /api/check-environment` - Check Docker environment
- `POST /api/cleanup/temp-containers` - Cleanup temporary containers

### Audit Logs
- `GET /api/audit-logs` - Get audit logs with optional filtering (operation_type, status, container_id, date range)
- `GET /api/audit-logs/statistics` - Get audit log statistics
- `DELETE /api/audit-logs/clear` - Clear all audit logs (removes all log entries)

### UI Settings
- `GET /api/ui/settings` - Get all UI settings
- `GET /api/ui/settings/<key>` - Get UI setting value (e.g., server_name)
- `POST /api/ui/settings/<key>` - Set UI setting value (e.g., server_name)

See PRD.md for complete API documentation.

## Architecture

The application has been refactored into a modular architecture with separate manager modules for better maintainability:

- **Backend**: Flask 3.0.0 (Python 3.11)
- **Frontend**: Vanilla JavaScript (ES6+) with modern CSS, organized into 19 focused modules
  - **Frontend Modules**:
    - `shared-state.js` - Centralized state management
    - `csrf.js` - CSRF token handling and API utilities
    - `ui-utils.js` - UI utilities (modals, notifications, spinners)
    - `auth.js` - Authentication and user management
    - `navigation.js` - Section navigation and dashboard
    - `containers.js` - Container management and operations
    - `backups.js` - Backup file management and restore
    - `volumes.js` - Volume exploration and management
    - `images.js` - Image management
    - `networks.js` - Network management
    - `stacks.js` - Stack management
    - `events.js` - Docker events viewing
    - `statistics.js` - Container statistics and monitoring
    - `audit-log.js` - Audit log management
    - `console.js` - Terminal console and logs
    - `scheduler.js` - Backup scheduler
    - `storage.js` - Storage settings (S3/local)
    - `settings.js` - UI settings
    - `app.js` - Main application coordinator
- **Docker API**: Direct Docker socket communication (`docker_api.py`) with fallback to docker-py
- **Backend Modular Managers**: 
  - `auth_manager.py` - Authentication and user management
  - `container_manager.py` - Container operations
  - `backup_manager.py` - Backup operations with queue support
  - `backup_file_manager.py` - Backup file management (S3 and local)
  - `restore_manager.py` - Restore operations
  - `volume_manager.py` - Volume management
  - `image_manager.py` - Image management
  - `network_manager.py` - Network management (S3 and local backups)
  - `stack_manager.py` - Docker stack management
  - `events_manager.py` - Docker events management and filtering
  - `system_manager.py` - System monitoring and stats
  - `scheduler_manager.py` - Scheduled backup management
  - `audit_log_manager.py` - Audit logging for backup operations
  - `storage_settings_manager.py` - Storage settings management (local vs S3)
  - `ui_settings_manager.py` - UI settings management (server name, etc.)
  - `s3_storage_manager.py` - S3 storage operations
  - `database_manager.py` - Unified database initialization and schema management
  - `stats_cache_manager.py` - Background caching and refresh of container statistics
  - `encryption_utils.py` - Encryption utilities for securing credentials
  - `error_utils.py` - Safe error logging utilities to prevent information disclosure
- **Storage**: Docker volumes for backup persistence with optional AWS S3 cloud storage (enables shared vaults across Container Monkey instances)
- **Database**: SQLite for user management, audit logs, storage settings, backup schedules, and UI settings
- **Rate Limiting**: Flask-Limiter for API protection
- **Authentication**: Session-based with password hashing
- **Encryption**: Fernet symmetric encryption for S3 credentials at rest
- **Documentation**: Includes `AWS_S3_SETUP.md` guide for S3 configuration

## Security Notes

- Runs with Docker socket access (requires appropriate permissions)
- Built-in authentication (configurable)
  - Session lifetime: 1 day (24 hours)
  - **Session Cookie Security**: Enhanced session cookie protection
    - `HttpOnly` flag prevents JavaScript access to cookies (XSS protection)
    - `SameSite='Lax'` provides CSRF protection
    - **Automatic HTTPS Detection**: Secure flag automatically enabled when HTTPS is detected
      - Checks `X-Forwarded-Proto` header from reverse proxy (nginx, Apache, etc.)
      - Since TLS is always behind a proxy, only checks the proxy header
      - Secure flag set automatically based on header value - no manual configuration required
    - Works with both HTTP and HTTPS deployments
  - **Strong Password Policy**: Enforced password complexity requirements
    - Minimum 12 characters
    - Must contain uppercase, lowercase, digit, and special character
    - Real-time password validation with visual feedback
- **CSRF Protection**: Flask-WTF CSRF protection for all state-changing requests
- **Encryption Key**: Unique random encryption key generated per installation, stored securely in Docker volume
- **Default Credentials Warning**: Modal warning appears when using default login credentials
- **Comprehensive Input Validation**: All user inputs are validated to prevent injection attacks
  - Container ID validation (hex ID or name format) on all container operations
  - Volume name validation for volume operations
  - Network ID validation for network management
  - Image ID validation for image operations
  - Stack name validation for stack management
  - Progress and session ID validation for backup operations
  - Query parameter validation (limit, offset, tail, since, until) with type checking
  - Filename validation for all backup file operations
  - Working directory path validation for container exec operations
  - UI setting key validation for settings management
- **Command Injection Prevention**: Container exec commands are properly sanitized to prevent command injection attacks
  - Commands sanitized using `shlex.quote()` to prevent shell injection
  - Working directory paths validated to prevent path traversal attacks
- **Secure Command Execution**: Uses Docker's native working directory support instead of shell-based operations
- **Error Handling Security**: Safe error logging prevents information disclosure in production
  - Full stack traces only shown in debug mode
  - Generic error messages returned to users to prevent information leakage
  - Prevents exposure of file paths, code structure, and internal system details
- **S3 Credentials Security**: S3 secret keys are never exposed in API responses
  - Secret keys returned as masked placeholders (`***`) in API responses
  - Users can update S3 settings without re-entering secret key (preserves existing)
  - Secret keys only transmitted when explicitly changed by user
  - Prevents credential exposure through API inspection or network monitoring
- Suggest use nginx reverse proxy with TLS termination and IP-based access control if public

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run locally
python app.py

# Build Docker image
docker build -t container_monkey .
```

## License

Copyright (C) 2025 Dan Bailey

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please check the project repository.

