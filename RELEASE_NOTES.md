# Release Notes

## Version 0.4.2

### Dashboard Improvements
- **Fixed Scheduled Container Panel**: Dashboard scheduled container panel now hides next backup time when no containers are scheduled

### Backup Vault Enhancements
- **Server Filter Dropdown**: Added server filter dropdown for filtering backups by server name in shared S3 vaults (alphabetical list with "All" option)
- **Enhanced Search Functionality**: Backup vault search now searches across multiple fields including filename, created date, type, backup type, storage location, and server name for comprehensive filtering

### Network Management Improvements
- **Network Table Enhancements**: Network ID, subnet, and gateway now in separate sortable columns with monospace font and consistent sizing

### Images Table Improvements
- **Table Updates**: Column header changed to "Tags", ID column styling matches Size column, consistent text sizing (0.9em)

### UI Consistency Improvements
- **Table Styling Standardization**: All table headers use title case, consistent font size (0.9em) across all grids

### Statistics Screen Fixes
- **Real-time Updates**: Statistics screen updates immediately for all container operations (restore, delete, state changes)

---

## Version 0.4.1

### Backup Management Improvements
- **Removed Scheduled Backup Filename Prefix**: Scheduled backups use `container-name_YYYYMMDD_HHMMSS.tar.gz` format, status stored in companion JSON metadata
- **Self-Contained Backup Archives**: Companion JSON included inside tar.gz archives for full metadata preservation
- **Duplicate File Protection**: Upload prevents overwriting existing backups (checks S3 and local storage)
- **Network Backup Server Name Tracking**: Network backups include server name metadata for shared S3 vault identification

### UI Improvements
- **Auto-Clear Selection After Download**: Backup vault checkboxes automatically cleared after download completes

---

## Version 0.4.0

### Major Code Refactoring - Frontend Modularization
- **Complete Frontend Refactoring**: Refactored monolithic `app.js` (8,868 lines) into 19 focused modules
  - Modules: shared-state, csrf, ui-utils, auth, navigation, containers, backups, volumes, images, networks, stacks, events, statistics, audit-log, console, scheduler, storage, settings, app
  - Improved code organization, maintainability, and separation of concerns
  - Backward compatible with all functionality preserved

### Image Management Enhancements
- **Progress Modal for Cleanup Dangling Images**: Progress modal with real-time status updates, auto-scrolling, and visual indicators
- **Rate Limit Exemption**: Image delete endpoint exempt from rate limiting for bulk cleanup operations

### Security Enhancements
- **Enhanced Input Validation**: Comprehensive validation for all endpoints (container IDs, paths, parameters, query strings)
- **Path Security**: Enhanced file path validation with support for encoded attack patterns
- **Additional Security Hardening**: Working directory path validation, UI setting key validation, comprehensive path sanitization

---

## Version 0.3.13

### Container Management Enhancements
- **Real-Time Container Logs Streaming**: Auto-refresh every 3 seconds with "Live" indicator and smart auto-scroll
- **Container Inspect Feature**: New "Inspect" button displays full container JSON with syntax highlighting and copy functionality
- **Static IP Display**: IP addresses displayed for stopped containers with static IP configuration
- **Restart Button Fix**: Restart button now enables when any container state is selected

### UI Improvements
- **Container Table Column Separation**: IP address and ports in distinct sortable columns
- **Restore Modal Enhancements**: Fixed port mapping display order, improved loading message layout
- **Universal Text Input Focus Styling**: Consolidated focus styles across all inputs

### Bug Fixes
- **Backup Vault Search Fix**: Fixed search functionality for backup filenames with special characters

---

## Version 0.3.12

### UI Improvements
- **Responsive Design**: Improved UI for smaller displays (reduced spacing, compact buttons)
- **Status Column Styling**: Smaller font size (0.8em) with lowercase text
- **Button Text Styling**: Changed from all caps to title case
- **Modal Button Cleanup**: Removed icons from all modal buttons
- **Login Modal**: Removed redundant "Login" heading

---

## Version 0.3.11

### Container Management Enhancements
- **Pause/Resume Functionality**: Added pause and resume operations with proper button state logic
- **Paused Container Status Display**: Orange status pill for paused containers

### Code Cleanup
- **Code Comments**: Cleaned up and updated code comments

### Events Page
- **New Events Menu Item**: Added Events page with Docker events from last 24 hours
- **Event Filtering**: Search, type, and action filters with dynamic dropdowns
- **Event Display**: Color-coded actions, sortable columns, real-time filtering

---

## Version 0.3.10

### Top Bar Enhancements
- **CPU Count Display**: Added CPU core count to top bar
- **Docker Version Display**: Shows installed Docker version

### Container Details Modal Enhancements
- **Labels Section**: Displays all container labels as key-value pairs
- **Start Time Field**: Shows when container was last started
- **Full Container ID**: Displays complete 64-character container ID

### UI Improvements
- **Modal Scrollbar Positioning**: Fixed scrollbar positions on container details and restore modals
- **Server Name Panel Centering**: Fixed horizontal centering of server name text

### Volume Management Enhancements
- **Stack Column**: Added Stack column to volumes table showing Docker stack association

---

## Version 0.3.9

### Performance Improvements
- **Statistics Page Background Caching**: Stats built in background thread every 5 minutes, cached stats displayed instantly

### Statistics Page Enhancements
- **Next Refresh Column**: Countdown timer showing time until next automatic refresh
- **Refresh Button**: Manual refresh button with proper state management

---

## Version 0.3.8

### UI Improvements
- **Monkey Emoji Cube Spinner**: Replaced all loading spinners with animated monkey emoji cube (3D rotation animation)
- **Download Modal Header**: Simplified header text, removed redundant info

---

## Version 0.3.7

### New Features
- **Backup Vault Checkbox Selection**: Checkbox-based selection system with bulk operations

### UI Improvements
- **Backup Vault Enhancements**: Removed individual action buttons, renamed bulk actions, optimized column widths
- **Download All Improvements**: Sequential downloads with progress tracking, real-time speed display, cancel functionality
- **Remove Progress Modal**: Real-time removal progress with status tracking
- **Upload Progress Modal**: Real-time upload speed tracking, cancel functionality, wider modal

### Bug Fixes
- **Statistics Page Timeout Issues**: Fixed timeout handling, request cancellation, race conditions
- **Upload Rate Limiting**: Removed rate limiting on upload endpoint for bulk uploads
- **Upload CSRF Token**: Fixed CSRF token handling in upload functionality
- **Login Modal Spacing**: Fixed bottom margin consistency

### UI Improvements
- **Scheduler Cleanup**: Removed Force Backup button

---

## Version 0.3.6

### New Features
- **Server Name Management**: Customizable server name displayed in top bar, persistent storage in database
- **Multi-Server Backup Identification**: Server name tracking for shared S3 vaults via companion JSON files

### UI Improvements
- **Top Bar Layout**: Three-column layout (Logo, Stats, Server Name + User Menu)
- **Server Name Modal**: Simplified interface, renamed from Settings
- **Backup Vault Enhancements**: Server column, server search, centered empty state
- **Modal Input Fixes**: Improved focus states across all modals
- **Dashboard Improvements**: Fixed panel hover overflow

### Configuration Changes
- **Default Port Update**: Changed default host port from 666 to 1066

---

## Version 0.3.5

### UI Improvements
- **Collapsible Sidebar Menu**: Toggle button with icon-only mode, state persistence
- **Typography Consistency**: Unified font sizes and styles across all data grids
- **Loading Grid Improvements**: Increased height and centered spinner for better visibility
- **Login Modal Fixes**: Fixed button hover, input focus styling, password manager compatibility
- **Section Header Icon Alignment**: Fixed vertical alignment using flexbox
- **Sidebar Menu Reordering**: Logical grouping of menu items

---

## Version 0.3.4

### UI Improvements
- **Action Feedback**: Replaced console logs with toast notifications
- **S3 Configuration Modal UX**: Immediate feedback, toast notifications, fixed layout
- **Login Modal UX**: Toast notifications for errors, branding, vertical centering, password manager compatibility
- **Modal Improvements**: Vertical centering, overflow prevention
- **Top Bar Improvements**: Unified typography, clock icon
- **Notification System**: Improved positioning and visibility
- **Data Grid/Table Improvements**: Independent scrollbars, sticky headers, optimized layout
- **Audit Log Pagination**: Replaced "Load More" with traditional pagination

---

## Version 0.3.3

### Security Improvements
- **Strong Password Policy**: Minimum 12 characters, requires uppercase, lowercase, digit, and special character
- **CSRF Protection**: Flask-WTF CSRF protection for all state-changing requests with automatic token injection
- **Session Cookie Security**: HttpOnly, SameSite='Lax', automatic HTTPS detection via X-Forwarded-Proto header
- **Command Injection Prevention**: Fixed vulnerabilities in container exec terminal and container redeploy
- **Information Disclosure Prevention**: Safe error logging, full stack traces only in debug mode
- **S3 Credentials Security**: Secret keys masked in API responses, preserve existing credentials option

### UI Improvements
- **Password Change Modal UX**: Toast notifications for errors, immediate modal close on success

---

## Version 0.3.2

### Security Improvements
- **Removed Hardcoded Encryption Key**: Unique random encryption key per installation stored at `/backups/config/encryption.key`
- **Default Credentials Warning**: Security warning modal for default login credentials
- **Reduced Session Lifetime**: Changed from 7 days to 1 day

### Migration Notes
- **Existing Installations**: New encryption key generated automatically, existing S3 credentials need re-entry

---

## Version 0.3.1

### UI Improvements
- **Unified Backup Upload**: Single upload function for both container and network backups
- **Backup Vault Search & Sort**: Real-time search, sortable columns with visual indicators
- **Sortable Grid Columns**: Added sorting to volumes, images, networks, and stacks grids

### Backend Changes
- Updated `/api/upload-backup` to handle both `.tar.gz` and `.json` files
- Removed `/api/upload-network-backup` endpoint

---

## Version 0.3.0

### New Features
- **S3 Storage Support**: AWS S3 storage integration with toggle switch, configuration modal, encrypted credentials
- **Storage Settings Management**: Database storage for settings, S3StorageManager module, encryption utilities

### UI Improvements
- **Storage Toggle Switch**: Modern animated toggle switch
- **S3 Configuration Modal**: Professional modal interface with test connection
- **Backup Vault Table**: Storage column showing Local or S3
- **Force Backup Button**: Immediate scheduled backup trigger
- **Consistent Button Spacing**: Standardized across all sections

### Backend Changes
- Added S3 storage manager, storage settings manager, encryption utils
- Updated backup managers to support S3
- Added storage settings API endpoints
- Temp directory for S3 downloads

### Security Improvements
- **Encrypted S3 Credentials**: Fernet symmetric encryption with PBKDF2 key derivation

### Bug Fixes
- Fixed S3 modal prepopulation, remove all with S3, download all with S3, network backups S3 support, temp file cleanup, duplicate containers in backup queue

### Security Updates
- **Updated default credentials**: Changed to `admin/c0Nta!nerM0nK3y#Q92x`

### Dependencies
- Added `boto3==1.34.0` and `cryptography==42.0.0`

### Documentation
- Added `AWS_S3_SETUP.md` guide

---

## Version 0.2.15

### Bug Fixes
- **Fixed unresponsive buttons**: Fixed notification container overlay blocking clicks, reduced stuck spinner threshold

### Code Cleanup
- **Removed unused code**: Cleaned up unused imports and methods

### Database Improvements
- **Simplified database initialization**: Removed migration code, cleaner implementation

### UI Improvements
- **Content title updates**: Simplified section titles, fixed unnecessary scrollbar

---

## Version 0.2.14

### Database Improvements
- **Unified database architecture**: Consolidated all data into single `monkey.db` database with automatic migration

---

## Version 0.2.13

### Bug Fixes
- **Fixed weekly backup schedule calculation**: Corrected day-of-week calculation bug

---

## Version 0.2.12

### Backup Audit Log Feature
- **Comprehensive audit logging**: Tracks all backup-related operations (manual, scheduled, restore, cleanup, deletion)
- **Audit Log UI**: Filterable table, statistics cards, pagination, clear logs functionality
- **Database storage**: SQLite database with indexed fields

### UI Improvements
- **Reduced sidebar spacing**: Menu items with 50% less spacing
- **Menu item renamed**: "Audit Log" renamed to "Backup Audit Log"

### Backup Scheduler Improvements
- **Real-time auto-save**: Scheduler configuration saves automatically with 500ms debounce
- **Enhanced dashboard schedule panel**: Shows scheduled containers count and next run date/time

### Bug Fixes
- **Fixed images table layout**: Fixed "In use by" text alignment
- **Fixed "In use by" display**: Now shows for all images
- **Improved cleanup dangling images button**: Auto-disables when no dangling images

### Network Management Improvements
- **Enhanced network container counting**: Includes all containers (running and stopped)
- **Improved network remove protection**: Remove button disabled when networks have containers
- **View Containers button**: Added for networks with containers

### UI/UX Improvements
- **Exec console auto-focus**: Terminal receives focus when opened
- **Container ID display**: Prefixed with "ID: " for clarity
- **Consistent grid text colors**: Improved visual consistency

---

## Version 0.2.11

### UI/Design Improvements
- **Unified button styling**: Consistent outline style matching GitHub button design
- **Added GitHub button**: Added to sidebar footer
- **Enhanced top bar branding**: Added tagline "Secure Your Docker Environment"
- **Updated favicon**: Matches logo with filled faces
- **Improved sidebar navigation**: Reduced gap between menu items
- **Enhanced dashboard**: Added Backup Schedule panel

---

## Version 0.2.10

### UI/Design Improvements
- **Updated logo and branding**: Changed icon to `ph-fill ph-cube`, updated color to blue (#38bdf8), removed gradient styling

---

## Version 0.2.9

### UI/Design Improvements
- **Updated branding**: Removed monkey emojis, added Phosphor cube icon, updated favicon

### Content Updates
- Updated hero subtitle text to use "open-source" with hyphen

---

## Version 0.2.8

### Bug Fixes
- **Fixed JSON parsing errors**: Fixed authentication failure handling
- **Fixed spinnerData ReferenceError**: Fixed variable scope issue

---

## Version 0.2.7

### New Features
- **Separated Stop and Kill Operations**: Stop performs graceful shutdown, Kill provides immediate termination

### Bug Fixes
- **Fixed scheduler error**: Automatic removal of deleted containers from scheduler

---

## Version 0.2.6

### Bug Fixes
- **Fixed scheduler date format**: Changed to unambiguous DD-MM-YYYY HH:MM:SS format
- **Enhanced scheduler debugging**: Added comprehensive logging
- **Improved scheduler reliability**: Added thread health checking

### Storage Improvements
- **Reorganized directory structure**: Created `backups/` and `config/` subdirectories with automatic migration

---

## Version 0.2.5

### New Features
- **Backup Scheduler**: Daily/weekly scheduling, container selection, lifecycle management, real-time clock display

### Backup Management Improvements
- **Backup Type Tracking**: Backup vault shows Manual or Scheduled backups

### Bug Fixes
- **Fixed container creation date display**: Fixed Unix timestamp conversion
- **Fixed backup vault slow loading**: Fast filename-based detection
- **Fixed UI button blocking**: Automatic detection and fixing of stuck spinners

### UI Improvements
- **Fixed backup vault grid layout**: Adjusted column widths
- **Test Scheduler Progress Modal**: Progress tracking for test scheduler
- **Confirmation Modal Improvements**: Fixed width for long backup names

---

## Version 0.2.4

### New Features
- **Statistics Page**: Comprehensive statistics page with CPU %, RAM, Network I/O, and Block I/O

### UI Improvements
- **Removed CPU/RAM stats from container grid**: Simplified container viewer

---

## Version 0.2.3

### Bug Fixes
- **Fixed container stats polling**: Fixed stats not updating after logout/login, stopping when navigating, showing "--" with many containers

### Performance Improvements
- Optimized container stats polling to prevent overlapping requests

---

## Version 0.2.2

### Bug Fixes
- **Fixed CPU/RAM stats display**: Fixed async initialization issue
- **Fixed recursive function call bug**: Renamed imported function to avoid conflict

---

## Version 0.2.1

### License Change
- **Changed license from MIT to GPLv3**: Updated LICENSE file and all documentation

---

## Version 0.2.0

### Major Refactoring
- **Modular Architecture**: Refactored into separate manager modules (auth, container, backup, volume, image, network, stack, system, docker_utils)

### Bug Fixes
- Fixed backup endpoint queue parameter handling
- Fixed backup process error messages

### Security Updates
- Changed default login credentials from `monkey/monkey` to `monkeysee/monkeydo`

### Cleanup
- Removed old backup files and unused files

### Technical Improvements
- Better code organization and separation of concerns
- Improved maintainability with modular design
