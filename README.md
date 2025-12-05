# Container Monkey 🐵

**Version 0.2.4**

The ultimate backup and recovery solution for Docker. Protect your containers, volumes, and networks with one-click backups. Restore instantly when disaster strikes. Move containers between servers effortlessly.

## Features

- **Container Management**: Start, stop, restart, delete containers with bulk operations
- **Volume Management**: Explore, download, and manage Docker volumes
- **Image Management**: View and delete Docker images, cleanup dangling images
- **Network Management**: Backup and restore Docker networks
- **Backup & Restore**: 
  - Full container backup with volumes, port mappings, and restore functionality
  - Sequential backup queue system for bulk operations
  - Real-time backup progress tracking
  - Backup completion verification (ensures tar.gz files are fully written)
- **Real-time Stats**: System-wide CPU and RAM utilization monitoring in top bar
- **Statistics Page**: Comprehensive container statistics including CPU, RAM, Network I/O, and Block I/O
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

Access the web UI at: http://localhost:666

**Default login credentials:**
- Username: `monkeysee`
- Password: `monkeydo`

### Cloud Deployment (build_image.sh)

For deploying to cloud servers:

1. **Build the image and create tar file:**
```bash
chmod +x build_image.sh
./build_image.sh
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
  -p 666:80 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v container-monkey:/backups \
  --restart always \
  container-monkey
```

Access the web UI at: http://your-server:666

**Default login credentials:**
- Username: `monkeysee`
- Password: `monkeydo`

### Manual Build

```bash
docker build -t container-monkey .
docker volume create container-monkey
docker run -d \
  --name container-monkey \
  -p 666:80 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v container-monkey:/backups \
  --restart unless-stopped \
  container-monkey
```

## Requirements

- Docker Engine installed and running
- Access to `/var/run/docker.sock` (or Docker context)
- Port 666 available on host (maps to container port 80)

## Configuration

### Environment Variables

- `FLASK_PORT`: Port to run the web server inside container (default: 80)
- `FLASK_ENV`: Flask environment mode (default: production)

### Volume Mounts

- `/var/run/docker.sock`: Docker socket (required)
- `container-monkey:/backups`: Backup storage volume (recommended)

## Usage

### Container Operations

1. **View Containers**: Navigate to the Containers section
2. **Start/Stop/Restart**: Use quick action buttons or bulk operations
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
4. **Delete**: Remove volumes (with confirmation)

### System Monitoring

- **Dashboard**: Overview of containers, images, volumes, networks
- **System Stats**: Real-time CPU and RAM utilization in top bar
- **Statistics Page**: View all containers with detailed stats including CPU %, RAM, Network I/O, and Block I/O
  - Refreshes automatically when visiting the page
  - Manual refresh button available
  - Shows running/stopped status for each container

## API Endpoints

The application provides a RESTful API. Key endpoints include:

- `GET /api/containers` - List all containers
- `POST /api/container/<id>/start` - Start container
- `POST /api/container/<id>/stop` - Stop container
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
  - `backup_file_manager.py` - Backup file management
  - `restore_manager.py` - Restore operations
  - `volume_manager.py` - Volume management
  - `image_manager.py` - Image management
  - `network_manager.py` - Network management
  - `stack_manager.py` - Docker stack management
  - `system_manager.py` - System monitoring and stats
- **Storage**: Docker volumes for backup persistence
- **Database**: SQLite for user management
- **Rate Limiting**: Flask-Limiter for API protection
- **Authentication**: Session-based with password hashing

## Security Notes

- Runs with Docker socket access (requires appropriate permissions)
- Built-in authentication with default credentials (username: `monkeysee`, password: `monkeydo`) - change in production
- Use nginx reverse proxy with TLS termination and IP-based access control
- Backups stored in Docker volume for persistence

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

