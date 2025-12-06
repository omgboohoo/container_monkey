# Release Notes

## Version 0.2.10

### UI/Design Improvements
- **Updated logo and branding to match website**:
  - Changed top bar icon from `ph ph-cube` to `ph-fill ph-cube` to match website styling
  - Updated icon color to blue (#38bdf8) matching website primary color
  - Removed gradient styling from logo text (now plain white text like website)
  - Adjusted logo sizing and spacing to match website proportions
  - Updated favicon color from black to blue (#38bdf8) to match website

### Technical Changes
- Updated `templates/index.html`:
  - Changed logo icon class to `ph-fill ph-cube`
  - Removed `text-gradient` class from logo text
  - Updated favicon SVG color to blue (#38bdf8)
- Updated `static/css/style.css`:
  - Changed icon color to #38bdf8 (blue)
  - Updated font sizes to match website (1.25rem for text, 1.75rem for icon)
  - Adjusted gap spacing to 0.35rem to match website
  - Removed gradient styling from icon and text

### Version Update
- Updated version number to 0.2.10 across application, website, README.md, and PRD.md

---

## Version 0.2.9

### UI/Design Improvements
- **Updated branding and visual consistency**:
  - Removed monkey emojis from website navbar and footer
  - Removed monkey emojis from app UI and markdown files
  - Applied gradient text styling to "Container Monkey" text to match "Secure Your Docker Environment" hero text
  - Increased Container Monkey text size on website for better visibility
  - Added Phosphor cube icon (`ph-cube`) to the left of "Container Monkey" text on both website and app
  - Improved icon alignment and spacing (reduced gap by 50%)
  - Updated favicon to accurately match Phosphor cube icon style for better brand consistency

### Content Updates
- Updated hero subtitle text to use "open-source" (with hyphen) for proper terminology
- Increased hero subtitle max-width from 600px to 750px for better readability

### Technical Changes
- Updated `website/index.html`:
  - Removed emoji elements from navbar and footer
  - Added Phosphor cube icon with proper CSS styling
  - Updated favicon SVG to match Phosphor icon style
- Updated `website/css/styles.css`:
  - Added icon styling with gradient matching text
  - Improved alignment and spacing for logo elements
- Updated `templates/index.html`:
  - Removed emoji from top bar title
  - Added Phosphor cube icon with matching styling
  - Updated favicon to match website
- Updated `static/css/style.css`:
  - Added icon styling to match website design
  - Improved logo alignment and spacing

### Version Update
- Updated version number to 0.2.9 across application, website, README.md, and PRD.md

---

## Version 0.2.8

### Bug Fixes
- **Fixed JSON parsing errors on authentication failure**: Resolved "Unexpected token '<', "<!doctype "... is not valid JSON" errors when session expires
  - Updated `loadContainers()`, `loadSchedulerContainers()`, and `loadSchedulerConfig()` functions to check response status before parsing JSON
  - Added graceful error handling for HTML error responses (when server returns HTML instead of JSON)
  - Improved error messages to guide users when authentication is required
  - Prevents application crashes when session expires or authentication fails

- **Fixed spinnerData ReferenceError**: Resolved "ReferenceError: spinnerData is not defined" in console
  - Fixed scope issue in `checkForStuckElements()` function where `spinnerData` was declared inside if block but used in else block
  - Moved `spinnerData` declaration outside if/else block to ensure proper scope
  - Eliminates console errors during spinner cleanup operations

### Technical Changes
- Updated `static/js/app.js`:
  - Enhanced error handling in API response parsing to check status before JSON parsing
  - Fixed variable scope issue in spinner cleanup function
  - Improved error messages for authentication failures

### Version Update
- Updated version number to 0.2.8 across application, website, README.md, and PRD.md

---

## Version 0.2.7

### New Features
- **Separated Stop and Kill Operations**: Enhanced container control with distinct graceful stop and immediate kill actions
  - **Stop Button**: Now performs graceful shutdown (SIGTERM with default timeout)
  - **Kill Button**: New button for immediate container termination (SIGKILL)
  - Both operations available in bulk actions for multiple containers
  - Improved user control over container lifecycle management

### Container Management Improvements
- **Graceful Stop Implementation**: Stop operation now uses `docker stop` without timeout flag, allowing containers to shut down gracefully
- **Kill Operation**: New `kill_container()` method provides immediate termination when needed
- **Backend API**: Added `/api/container/<container_id>/kill` endpoint for kill operations
- **Frontend Updates**: Added Kill button between Stop and Restart buttons in container management interface

### Bug Fixes
- **Fixed scheduler error when deleting scheduled containers**: Resolved issue where deleting a container that was part of scheduled tasks caused "Error loading containers" on scheduler page
  - Added automatic removal of deleted containers from scheduler's selected containers list
  - Added validation when loading scheduler config to filter out non-existent containers
  - Scheduler automatically stops if no containers remain after cleanup
  - Prevents errors when viewing scheduler page after container deletion
  - Improved scheduler reliability and error handling

### Technical Changes
- Updated `container_manager.py`:
  - Modified `stop_container()` to perform graceful stop (removed `-t 0` flag)
  - Added `kill_container()` method for immediate termination
  - Updated `delete_container()` to use kill instead of stop for immediate cleanup
- Updated `scheduler_manager.py`:
  - Added `remove_container()` method to remove containers from scheduled tasks
  - Enhanced `get_config()` method with container validation to filter out non-existent containers
  - Automatic cleanup of invalid container IDs from scheduler configuration
- Updated `app.py`:
  - Added kill route for kill endpoint
  - Delete container endpoint now calls scheduler cleanup to remove deleted containers from scheduled tasks
  - Scheduler config endpoint validates containers when loading
- Added `killContainer()` and `killSelectedContainers()` functions in frontend JavaScript

### Version Update
- Updated version number to 0.2.7 across application, website, README.md, and PRD.md

---

## Version 0.2.6

### Bug Fixes
- **Fixed scheduler date format ambiguity**: Resolved date display confusion in backup scheduler
  - Changed all scheduler date displays to unambiguous DD-MM-YYYY HH:MM:SS format
  - Updated "Next backup" display to use DD-MM-YYYY format (e.g., "06-12-2025 01:00:00")
  - Fixed real-time clock display to use DD-MM-YYYY HH:MM:SS format instead of ambiguous locale format
  - All backend scheduler logs now use DD-MM-YYYY HH:MM:SS format for consistency
  - Eliminates confusion between MM/DD/YYYY and DD/MM/YYYY date formats

- **Enhanced scheduler debugging**: Added comprehensive logging to help diagnose scheduler issues
  - Added periodic scheduler check logs every 5 minutes showing current time vs next run time
  - Added detailed logging when backup time is reached
  - Added logging when waiting for scheduled backup (when less than 5 minutes away)
  - Added logging when calculating next run time with current time comparison
  - All logs use DD-MM-YYYY HH:MM:SS format for easy comparison

- **Improved scheduler reliability**: Added thread health checking and better initialization
  - Added verification that scheduler thread is alive when starting scheduler
  - Automatically restarts scheduler thread if it dies unexpectedly
  - Ensures next_run is calculated when scheduler starts
  - Better error handling and recovery for scheduler thread failures

### Storage Improvements
- **Reorganized directory structure**: Improved organization of files in the Docker volume
  - Created `backups/` subdirectory for all backup files (container backups and network backups)
  - Created `config/` subdirectory for configuration files (users.db and scheduler_config.json)
  - Automatic migration of existing files from volume root to appropriate subdirectories on startup
  - Cleaner volume structure with clear separation between backups and configuration
  - All managers updated to use the new organized structure
  - Migration is idempotent and safe to run multiple times

### Version Update
- Updated version number to 0.2.6 across application, website, README.md, and PRD.md

---

## Version 0.2.5

### New Features
- **Backup Scheduler**: Added comprehensive backup scheduling system
  - Single schedule configuration (not per-container)
  - Daily schedule: backup at specific hour (0-23)
  - Weekly schedule: backup on specific day of week and hour
  - Select containers to include in scheduled backups via checkbox interface
  - Lifecycle management: specify number of scheduled backups to keep (default: 7)
  - Scheduler automatically enabled when one or more containers are selected
  - Test Scheduler button with progress modal for immediate testing
  - Real-time system clock display on scheduler page
  - Next backup time display in scheduler status
  - Cleanup runs automatically after scheduled backups complete (monitored, not fixed delay)

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

- **Fixed backup vault slow loading**: Significantly improved backup vault load time
  - Removed slow tar file reading for backup type detection
  - Now uses fast filename-based detection (`scheduled_` prefix)
  - Backup vault loads instantly even with many backups

- **Fixed UI button blocking issues**: Comprehensive fixes for buttons becoming unclickable
  - Added automatic detection and fixing of stuck spinners and modals
  - Added ESC key handler to close all modals and hide spinners
  - Added debug function (`debugBlockingElements()`) accessible via Ctrl+Shift+D
  - Automatic detection of spinners visible >30 seconds
  - Improved click blocking detection with detailed logging
  - Safety checks when loading scheduler page to prevent stuck spinners

### UI Improvements
- **Fixed backup vault grid layout**: Adjusted column widths to prevent action buttons from being squashed
  - Size column reduced from 24% to 10%
  - Created column reduced from 28% to 15%
  - Actions column now properly sized at 30% with minimum width
  - All columns now have appropriate min-width constraints
  - Backup Type column added with proper sizing

- **Test Scheduler Progress Modal**: Added progress tracking for test scheduler
  - Shows spinner and progress bar when testing scheduler
  - Displays backup completion status
  - Monitors backup queue to track progress
  - Auto-refreshes backup vault when complete

- **Confirmation Modal Improvements**: Fixed modal width for long backup names
  - Increased max-width from 500px to 600px
  - Added word wrapping for long filenames
  - Prevents scrollbars on confirmation dialogs

### Backend Changes
- Added `scheduler_manager.py` module for scheduled backup management
- Enhanced `backup_manager.py` to support `is_scheduled` parameter
- Updated `backup_file_manager.py` to detect and display backup type (using fast filename-based detection)
- Added scheduler API endpoints: `/api/scheduler/config`, `/api/scheduler/test`, `/api/scheduler/cleanup`
- Scheduler runs in background thread, checking every minute for due backups
- Scheduler cleanup monitors backup completion and runs automatically after all backups finish
- Removed unnecessary tar file reading in `backup_file_manager.py` for better performance
- Enhanced error handling in scheduler cleanup process

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
