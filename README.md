# Container Monkey

**Version 0.3.6**

The open-source backup and recovery solution for Docker. Protect your containers, volumes, and networks with one-click backups, automated scheduling, and instant restoration.

## Features

- **Container Management**: Start, stop (graceful), kill (immediate), restart, delete containers with bulk operations
- **Volume Management**: Explore, download, and manage Docker volumes
- **Image Management**: View and delete Docker images, cleanup dangling images
- **Network Management**: Backup and restore Docker networks, view containers using each network
- **Backup & Restore**: Full container backup with volumes, port mappings, and restore functionality
- **Backup Scheduler**: Automated scheduled backups with daily or weekly schedules, force backup option
- **S3 Storage Support**: Store backups in AWS S3, toggle between local and S3 storage, enables shared vaults across Container Monkey instances
- **Multi-Server Identification**: Server name tracking allows multiple Container Monkey instances sharing the same S3 bucket to identify which server created each backup
- **Backup Audit Log**: Comprehensive audit logging for all backup operations, restores, and lifecycle management
- **Real-time Stats**: System-wide CPU and RAM utilization monitoring in top bar
- **Statistics Page**: Comprehensive container statistics including CPU, RAM, Network I/O, and Block I/O
- **Backup Type Tracking**: Backup vault shows whether backups are Manual or Scheduled and storage location (Local/S3)
- **Backup Vault Search**: Real-time search filter to quickly find backups by filename, type, storage, server name, or date
- **Sortable Backup Columns**: All backup vault columns are sortable with visual indicators for easy organization
- **Web Console**: Interactive terminal access to containers
- **Logs Viewer**: Real-time container logs viewing
- **Bulk Operations**: Select multiple containers/volumes/images for batch operations
- **User Management**: Change username and password
- **Rate Limiting**: Built-in API rate limiting for security

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

1. **Build the image and create tar file:**
```bash
sudo docker build -t container-monkey ./
sudo docker save -o container-monkey.tar container-monkey
```

2. **Upload the tar file to your server:**
```bash
scp container-monkey.tar user@your-server:/home/ubuntu/
```

3. **On the server, load the image:**
```bash
sudo docker load -i /home/ubuntu/container-monkey.tar
```

4. **Run the container:**
```bash
sudo docker run -d \
  --name container-monkey \
  -p 1066:80 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v container-monkey:/backups \
  --restart always \
  container-monkey
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
- `FLASK_ENV`: Flask environment mode (default: production)

### Volume Mounts

- `/var/run/docker.sock`: Docker socket (required)
- `container-monkey:/backups`: Backup storage and database volume

## Usage

### Container Operations

1. **View Containers**: Navigate to the Containers section
2. **Start/Stop/Kill/Restart**: Use quick action buttons or bulk operations
   - **Start**: Start stopped containers
   - **Stop**: Gracefully stop containers (SIGTERM with default timeout)
   - **Kill**: Immediately terminate containers (SIGKILL)
   - **Restart**: Gracefully stop then restart containers
3. **Backup**: Click backup button to create a full container backup
4. **Delete**: Delete containers with options to remove associated volumes/images
5. **View Logs**: Click logs icon to view real-time container logs
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
4. **Delete**: Remove volumes

### System Monitoring

- **Dashboard**: Overview of containers, images, volumes, networks, backup schedule
- **System Stats**: Real-time CPU and RAM utilization in top bar
- **Statistics Page**: View all containers with detailed stats including CPU %, RAM, Network I/O, and Block I/O

### Backup Audit Log

1. **View Audit Logs**: Navigate to Backup Audit Log section to view all backup-related operations
2. **Filter Operations**: Filter by operation type (Manual Backups, Scheduled Backups, Restores, Lifecycle Cleanup, Backup Deletion)
3. **Filter Status**: Filter by status (Started, Completed, Error)
4. **Statistics**: View total logs, last 24 hours, and last 7 days activity
5. **Clear Logs**: Clear all audit logs with confirmation prompt (permanently deletes all log entries)
6. **Comprehensive Tracking**: All backup operations, restores, cleanup, and deletions are automatically logged with timestamps and details

## API Endpoints

The application provides a RESTful API. Key endpoints include:

- `GET /api/containers` - List all containers
- `POST /api/container/<id>/start` - Start container
- `POST /api/container/<id>/stop` - Stop container gracefully (SIGTERM)
- `POST /api/container/<id>/kill` - Kill container immediately (SIGKILL)
- `POST /api/backup/<container_id>` - Backup container (supports `?queue=true` for bulk operations)
- `GET /api/backup-progress/<progress_id>` - Get backup progress (exempt from rate limiting)
- `GET /api/backup/status` - Get backup system status
- `POST /api/restore-backup` - Restore backup
- `GET /api/volumes` - List volumes
- `GET /api/images` - List images
- `GET /api/networks` - List networks
- `GET /api/backups` - List backups
- `GET /api/system-stats` - System CPU/RAM stats
- `GET /api/statistics` - Comprehensive container statistics (CPU, RAM, Network I/O, Block I/O)
- `GET /api/scheduler/config` - Get scheduler configuration
- `POST /api/scheduler/config` - Update scheduler configuration
- `POST /api/scheduler/test` - Trigger scheduled backups immediately (for testing)
- `POST /api/scheduler/cleanup` - Manually trigger cleanup of old scheduled backups
- `GET /api/audit-logs` - Get audit logs with optional filtering (operation_type, status, container_id, date range)
- `GET /api/audit-logs/statistics` - Get audit log statistics
- `DELETE /api/audit-logs/clear` - Clear all audit logs
- `POST /api/change-password` - Change username/password

See PRD.md for complete API documentation.

## Architecture

The application has been refactored into a modular architecture with separate manager modules for better maintainability:

- **Backend**: Flask 3.0.0 (Python 3.11)
- **Frontend**: Vanilla JavaScript (ES6+) with modern CSS
- **Docker API**: Direct Docker socket communication (`docker_api.py`) with fallback to docker-py
- **Modular Managers**: 
  - `auth_manager.py` - Authentication and user management
  - `container_manager.py` - Container operations
  - `backup_manager.py` - Backup operations with queue support
  - `backup_file_manager.py` - Backup file management (S3 and local)
  - `restore_manager.py` - Restore operations
  - `volume_manager.py` - Volume management
  - `image_manager.py` - Image management
  - `network_manager.py` - Network management (S3 and local backups)
  - `stack_manager.py` - Docker stack management
  - `system_manager.py` - System monitoring and stats
  - `scheduler_manager.py` - Scheduled backup management
  - `audit_log_manager.py` - Audit logging for backup operations
  - `storage_settings_manager.py` - Storage settings management (local vs S3)
  - `s3_storage_manager.py` - S3 storage operations
  - `encryption_utils.py` - Encryption utilities for securing credentials
- **Storage**: Docker volumes for backup persistence with optional AWS S3 cloud storage (enables shared vaults across Container Monkey instances)
- **Database**: SQLite for user management, audit logs, and storage settings
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
- **Command Injection Prevention**: Container exec commands are properly sanitized to prevent command injection attacks
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
docker build -t container-monkey .
```

## License

Copyright (C) 2025 Dan Bailey

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the [LICENSE](LICENSE) file for details.

## Support

For issues and feature requests, please check the project repository.

