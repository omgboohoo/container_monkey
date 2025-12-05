# Release Notes

## Version 0.2.5

### New Features
- **Backup Scheduler**: Added comprehensive backup scheduling system
  - Single schedule configuration (not per-container)
  - Daily schedule: backup at specific hour (0-23)
  - Weekly schedule: backup on specific day of week and hour
  - Select containers to include in scheduled backups via checkbox interface
  - Lifecycle management: specify number of scheduled backups to keep (default: 7)
  - Scheduler automatically enabled when one or more containers are selected
  - Test Scheduler button for immediate testing without waiting for scheduled time
  - Real-time system clock display on scheduler page
  - Next backup time display in scheduler status

### Backup Management Improvements
- **Backup Type Tracking**: Backup vault now shows whether backups are Manual or Scheduled
  - Manual backups: Never auto-deleted, preserved indefinitely
  - Scheduled backups: Automatically cleaned up based on lifecycle setting
  - Backup type displayed in vault grid with visual indicators
  - Scheduled backups prefixed with `scheduled_` in filename
  - Backup metadata includes `backup_type` field

### Bug Fixes
- **Fixed container creation date display**: Resolved issue where all containers showed creation date as "21/01/1970"
  - Fixed Unix timestamp conversion (seconds to milliseconds) in Docker API responses
  - Fixed CLI fallback timestamp parsing for Docker `CreatedAt` format
  - Added proper handling for ISO 8601 timestamps with nanosecond precision
  - Frontend now correctly handles both timestamp formats (seconds and milliseconds)

### UI Improvements
- **Fixed backup vault grid layout**: Adjusted column widths to prevent action buttons from being squashed
  - Size column reduced from 24% to 10%
  - Created column reduced from 28% to 15%
  - Actions column now properly sized at 30% with minimum width
  - All columns now have appropriate min-width constraints
  - Backup Type column added with proper sizing

### Backend Changes
- Added `scheduler_manager.py` module for scheduled backup management
- Enhanced `backup_manager.py` to support `is_scheduled` parameter
- Updated `backup_file_manager.py` to detect and display backup type
- Added scheduler API endpoints: `/api/scheduler/config`, `/api/scheduler/test`, `/api/scheduler/cleanup`
- Scheduler runs in background thread, checking every minute for due backups
- Automatic cleanup of old scheduled backups after each scheduled backup run

### Documentation
- Updated README.md and PRD.md with Backup Scheduler feature documentation
- Added scheduler API endpoints to API documentation
- Updated version number to 0.2.5 across all files

### Version Update
- Updated version number to 0.2.5 across application, website, README.md, and PRD.md

---

## Version 0.2.4

### New Features
- **Statistics Page**: Added comprehensive statistics page accessible from the sidebar
  - Displays all containers in a grid format with detailed metrics
  - Shows CPU %, RAM usage, Network I/O, and Block I/O for each container
  - Status badges match the container viewer styling
  - Auto-refreshes when visiting the page
  - Manual refresh button for on-demand updates
  - Network I/O shows bytes received/sent (e.g., `73.8kB / 285kB`)
  - Block I/O shows bytes read/written (e.g., `0B / 438kB`)

### UI Improvements
- **Removed CPU/RAM stats from container grid**: Simplified container viewer by removing per-container CPU/RAM displays
- **System stats remain**: Top bar continues to show system-wide CPU and RAM utilization
- **Improved focus**: Container grid now focuses on container management without stats clutter

### Backend Changes
- Added `/api/statistics` endpoint for comprehensive container statistics
- Enhanced `get_statistics()` function in `system_manager.py` to collect Network I/O and Block I/O data
- Statistics endpoint uses `docker stats` command to gather real-time metrics

### Documentation
- Updated README.md and PRD.md to reflect Statistics page addition
- Removed references to per-container stats in container viewer
- Added Statistics page documentation to both files

### Version Update
- Updated version number to 0.2.4 across application, website, README.md, and PRD.md

---

## Version 0.2.3

### Bug Fixes
- **Fixed container stats polling issues**: Resolved multiple issues with CPU/RAM stats display for containers
  - Fixed stats not updating after logout/login - stats now properly restart after authentication
  - Fixed stats stopping when navigating between sections - container stats only poll when containers section is visible
  - Fixed stats showing "--" with many containers - increased polling interval from 5 seconds to 1 minute to allow time for all containers to update
  - Separated system stats (top bar) and container stats polling intervals for better performance
  - System stats continue updating every 5 seconds (top bar)
  - Container stats update every 1 minute, only when containers section is visible

### Performance Improvements
- Optimized container stats polling to prevent overlapping requests
- Container stats polling now checks section visibility before updating
- Reduced unnecessary API calls when containers section is not active

### Version Update
- Updated version number to 0.2.3 across application, website, README.md, and PRD.md

---

## Version 0.2.2

### Bug Fixes
- **Fixed CPU/RAM stats display**: Stats were showing "--" in top bar and containers screen
  - Fixed async initialization issue where stats polling started before authentication completed
  - Improved error handling for stats API calls
  - Stats now properly wait for authentication before polling begins

- **Fixed recursive function call bug**: Fixed `check_environment` route handler that was calling itself recursively
  - Renamed imported function to `check_environment_helper` to avoid naming conflict

### Version Update
- Updated version number to 0.2.2 across application and website

---

## Version 0.2.1

### License Change
- **Changed license from MIT to GPLv3**: The project is now licensed under the GNU General Public License version 3
- Updated LICENSE file with GPLv3 text
- Updated all documentation and website references to reflect GPLv3 license
- Updated website footer and license modal to display GPLv3 information

### Version Update
- Updated version number to 0.2.1 across all files
- Updated website badge and footer version display

### Documentation
- Updated README.md license section with GPLv3 information
- Updated PRD.md version number
- Updated website (website/index.html) with GPLv3 license information

---

## Version 0.2.0

### Major Refactoring
- **Modular Architecture**: Refactored application into separate manager modules for better maintainability and separation of concerns:
  - `auth_manager.py` - Authentication and user management
  - `container_manager.py` - Container lifecycle operations
  - `backup_manager.py` - Backup operations with queue support
  - `backup_file_manager.py` - Backup file management
  - `restore_manager.py` - Restore operations and conflict handling
  - `volume_manager.py` - Volume exploration and management
  - `image_manager.py` - Image management and cleanup
  - `network_manager.py` - Network backup and restore
  - `stack_manager.py` - Docker stack management
  - `system_manager.py` - System monitoring and statistics
  - `docker_utils.py` - Docker utilities and initialization

### Bug Fixes
- Fixed backup endpoint to read queue parameter from query string instead of JSON body
- Restored queued backup response handling with proper 202 status codes
- Fixed backup process showing "Backing Up" error when backing up containers

### Security Updates
- Changed default login credentials from `monkey/monkey` to `monkeysee/monkeydo`
- Updated all documentation with new credentials

### Documentation
- Updated README.md and PRD.md to reflect modular architecture
- Updated version numbers to 0.2.0 across all files
- Added comprehensive architecture documentation

### Cleanup
- Removed old backup files (`app.py.backup`, `app_refactored.py`)
- Cleaned up unused files from project root

### Technical Improvements
- Better code organization and separation of concerns
- Improved maintainability with modular design
- Enhanced error handling in backup operations

