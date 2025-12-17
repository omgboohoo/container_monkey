# Release Notes

## Version 0.4.0

### Major Code Refactoring - Frontend Modularization
- **Complete Frontend Refactoring**: Refactored massive monolithic `app.js` (8,868 lines) into 19 manageable, focused modules
  - **Modular Architecture**: Code now organized into logical modules for better maintainability and development
  - **Module Breakdown**:
    - `shared-state.js` (108 lines) - Centralized state management (`window.AppState`)
    - `csrf.js` (116 lines) - CSRF token handling and API request utilities
    - `ui-utils.js` (508 lines) - UI utilities (modals, notifications, spinners, time display)
    - `auth.js` (470 lines) - Authentication, login, logout, password/username management
    - `navigation.js` (216 lines) - Section navigation and dashboard
    - `containers.js` (2,097 lines) - Container management, operations, and backup functions
    - `backups.js` (1,691 lines) - Backup file management, restore, upload, download
    - `volumes.js` (546 lines) - Volume exploration and management
    - `images.js` (532 lines) - Image management and cleanup
    - `networks.js` (262 lines) - Network management and backup/restore
    - `stacks.js` (496 lines) - Stack management and filtering
    - `events.js` (312 lines) - Docker events viewing and filtering
    - `statistics.js` (638 lines) - Container statistics and system stats polling
    - `audit-log.js` (295 lines) - Audit log management and pagination
    - `console.js` (440 lines) - Terminal console and container logs
    - `scheduler.js` (469 lines) - Backup scheduler configuration
    - `storage.js` (324 lines) - Storage settings (S3/local)
    - `settings.js` (182 lines) - UI settings (server name)
    - `app.js` (32 lines) - Main application coordinator
  - **Benefits**:
    - Improved code organization and maintainability
    - Easier to locate and modify specific functionality
    - Better separation of concerns
    - Reduced cognitive load when working on specific features
    - All functions properly exported to `window` for HTML access
    - Centralized state management through `window.AppState`
  - **Total**: 9,734 lines across 19 modules (vs 8,868 lines in single file)
  - **Backward Compatible**: All functionality preserved, no breaking changes

### Image Management Enhancements
- **Progress Modal for Cleanup Dangling Images**: Added beautiful progress modal for cleaning up dangling images
  - Shows all dangling images being cleaned up with real-time status updates
  - Sequential deletion: images are removed one by one (matching backup removal behavior)
  - Auto-scrolling: modal automatically scrolls to keep the current image being processed in view
  - Visual status indicators: ⏳ Waiting → 🗑️ Removing → ✅ Removed / ❌ Failed
  - Accurate progress counter: displays "Removing X / Y: image-name" for each image
  - Final summary shows total images cleaned up
  - Same elegant design and behavior as the backup removal progress modal
- **Rate Limit Exemption for Image Deletion**: Image delete endpoint now exempt from rate limiting
  - Allows bulk cleanup operations to delete many images without hitting rate limits
  - Prevents interruption during cleanup of 100+ dangling images
  - Endpoint: `/api/image/<image_id>/delete` now has `@limiter.exempt` decorator

### Security Enhancements
- **Enhanced Input Validation**: Improved validation and sanitization of user inputs across all endpoints
  - Added comprehensive container ID validation to prevent injection attacks
  - Enhanced path traversal protection for volume file operations
  - Improved XSS protection in template rendering
  - Strengthened authentication requirements for sensitive routes
- **Path Security**: Enhanced file path validation with support for encoded attack patterns
- **Comprehensive Parameter Validation**: Added validation for all route parameters and query strings
  - Volume name validation across all volume operations
  - Network ID validation for network management endpoints
  - Image ID validation for image deletion operations
  - Stack name validation for stack management
  - Progress and session ID validation for backup operations
  - Query parameter validation (limit, offset, tail, since, until) with proper type checking and bounds
  - Filename validation for all backup file operations
  - Container ID list validation in scheduler configuration
- **Additional Security Hardening**: Enhanced validation for container operations and UI settings
  - Working directory path validation for container exec operations to prevent path traversal attacks
  - UI setting key validation to prevent injection and ensure safe database operations
  - Comprehensive path sanitization with URL encoding detection for working directories

### Version Update
- Updated version number to 0.4.0 across application, website, README.md, and PRD.md

---

## Version 0.3.13

### Container Management Enhancements
- **Real-Time Container Logs Streaming**: Enhanced container logs modal with live log streaming
  - Logs now automatically refresh every 3 seconds while modal is open
  - Displays all container logs when modal is first opened (using `tail='all'`)
  - Added "Live" indicator with pulsing animation to show when logs are streaming
  - Smart auto-scroll: automatically scrolls to bottom when new logs arrive, but only if user is already at bottom
  - Removed manual refresh button (no longer needed with auto-refresh)
  - Backend updated to properly handle `tail='all'` parameter for fetching all logs
  - Improved error handling with clearer error messages
- **Container Inspect Feature**: Added quick action to inspect containers and view raw JSON
  - New "Inspect" button in container quick actions (magnifying glass icon)
  - Displays full container inspect JSON in a modal (similar to `docker inspect`)
  - Syntax-highlighted JSON display with dark theme
  - Copy to clipboard functionality for easy sharing
  - Shows complete container configuration, network settings, mounts, and all Docker inspect data
- **Static IP Display for Stopped Containers**: IP addresses now displayed for stopped containers with static IP configuration
  - Shows static IP address from `IPAMConfig.IPv4Address` for stopped containers
  - Works for containers created with `--ip` flag or docker-compose static IP configuration
  - IP address column displays configured static IP even when container is powered off
- **Restart Button Fix**: Fixed restart button not enabling when running containers are selected
  - Restart button now properly enables when any container (running, stopped, or paused) is selected
  - Button state management improved with explicit ID-based handling

### UI Improvements
- **Container Table Column Separation**: Separated IP address and ports into distinct columns
  - IP address now has its own sortable column with click-to-sort functionality
  - Ports displayed in a separate column next to IP address
  - Improved table organization and easier data scanning
  - IP column supports ascending/descending sort with visual indicators
- **Restore Modal Enhancements**: Improved restore modal display and functionality
  - Fixed port mapping display order to show "Host Port → Container Port" (standard Docker format)
  - Restore loading message now displays text and filename on separate lines for better readability
  - Port mapping inputs now have consistent focus styling matching login inputs
- **Universal Text Input Focus Styling**: Consolidated all text input focus styles into a single universal CSS rule
  - All text inputs, password inputs, and textareas now share consistent focus styling
  - Blue border, background change, and glow effect applied universally
  - Removed duplicate modal-specific focus style rules for cleaner codebase
  - Search boxes (backup vault, audit log, events) now have proper focus styling

### Bug Fixes
- **Backup Vault Search Fix**: Fixed search functionality for backup filenames
  - Simplified search to read filename directly from displayed grid text
  - Search now reliably finds all backups including those with special characters in filenames
  - Case-insensitive search works correctly for all backup filenames

### Version Update
- Updated version number to 0.3.13 across application, website, README.md, and PRD.md

---

## Version 0.3.12

### UI Improvements
- **Responsive Design Enhancements**: Improved UI for smaller displays
  - Section titles now match menu item size (0.95em) for better consistency
  - Reduced gap between section titles and icons by 50% (from 12px to 6px)
  - Made buttons more compact across the app (reduced padding and min-height)
- **Status Column Styling**: Updated status pills for better readability
  - Status text now uses smaller font size (0.8em) with lowercase text
  - Reduced padding on status pills for more compact display
- **Button Text Styling**: Changed button text from all caps to title case
  - Buttons now use capitalize text-transform instead of uppercase
  - More readable and professional appearance
- **Modal Button Cleanup**: Removed icons from all modal buttons
  - Confirmation dialogs no longer show icons on buttons
  - Delete container modal buttons are icon-free
  - Restore modal, environment check modal, and security warning modal buttons updated
  - Cleaner, more consistent modal interface
- **Login Modal**: Removed redundant "Login" heading text

### Version Update
- Updated version number to 0.3.12 across application, website, README.md, and PRD.md

---

## Version 0.3.11

### Container Management Enhancements
- **Pause/Resume Functionality**: Added pause and resume operations for containers
  - New Pause button to pause running containers
  - New Resume button to resume paused containers
  - Pause button only enabled when running containers are selected
  - Resume button only enabled when paused containers are selected
  - API endpoints: `/api/container/<container_id>/pause` and `/api/container/<container_id>/resume`
- **Enhanced Button State Logic**: Improved container action button states
  - Start button: Only enabled when stopped containers are selected
  - Stop button: Only enabled when running containers are selected
  - Kill button: Only enabled when running containers are selected (disabled if stopped containers selected)
  - Restart button: Enabled when any containers are selected
  - Pause button: Only enabled when running containers are selected
  - Resume button: Only enabled when paused containers are selected
  - Remove button: Enabled when any containers are selected
- **Paused Container Status Display**: Added visual indicator for paused containers
  - Paused containers display with orange status pill
  - Status text shows "PAUSED" for paused containers
  - Container status detection updated to recognize paused state from Docker API

### Code Cleanup
- **Code Comments**: Cleaned up and updated code comments
  - Updated comments in `docker_api.py` and `docker_utils.py`
  - Updated comments in `static/js/app.js`

### Events Page
- **New Events Menu Item**: Added Events page to left sidebar navigation
  - Accessible via new "Events" menu item with bell icon
  - Displays Docker events from the last 24 hours by default
  - Shows event time, type, action, and name in a sortable table
- **Event Filtering**: Added comprehensive filtering capabilities
  - Search field to filter events by name, type, action, or timestamp
  - Type filter dropdown (Container, Image, Volume, Network, Plugin, Service, Node, Secret, Config)
  - Action filter dropdown that dynamically updates based on selected type
  - Prevents invalid combinations (e.g., can't "start" a volume)
  - All filters work together with AND logic
- **Event Display**: Enhanced event visualization
  - Color-coded actions (green for start/create, red for stop/kill, yellow for destroy)
  - Sortable columns (Time, Type, Action, Name)
  - Newest events shown first by default
  - Real-time filtering as you type
- **Performance Optimizations**: Efficient event fetching
  - Uses Docker Events API with time-based filtering
  - Response size limits and timeouts to prevent performance issues
  - Efficient parsing of newline-delimited JSON stream
- **UI Consistency**: Matches existing application design patterns
  - Consistent styling with other sections (search field, filters, table)
  - Proper focus states and hover effects on search input

---

## Version 0.3.10

### Top Bar Enhancements
- **CPU Count Display**: Added CPU core count display to the top bar
  - Shows the total number of CPU cores available on the system
  - Updates automatically every 5 seconds along with other system stats
  - Displays as "Cores: X" in the top bar statistics
- **Docker Version Display**: Added Docker version display to the top bar
  - Shows the installed Docker version (e.g., "24.0.7")
  - Automatically retrieved from `docker --version` command
  - Updates on system stats refresh
  - Displays as "Docker: X.X.X" in the top bar statistics

### Container Details Modal Enhancements
- **Labels Section**: Added Labels section to container details modal
  - Displays all container labels as key-value pairs
  - Appears after Environment Variables section
  - Shows labels like maintainer, org.label-schema.*, etc.
- **Start Time Field**: Added Start Time to Basic Information section
  - Shows when the container was last started
  - Displays formatted timestamp (e.g., "14/12/2025, 10:11:23")
  - Only shown if container has been started
- **Full Container ID**: Added complete container ID to Basic Information
  - Displays the full 64-character container ID hash
  - Styled with monospace font for better readability
  - Shows complete ID instead of shortened 12-character version

### UI Improvements
- **Modal Scrollbar Positioning**: Fixed scrollbar position on container details modal
  - Scrollbar now appears on inner content section (#container-details) instead of outer modal edge
  - Better visual consistency and user experience
  - Other modals remain unchanged
- **Modal Close Button**: Fixed close button positioning on container details modal
  - Close button (X) now properly positioned in top right corner
  - Matches positioning of other modals
  - Uses absolute positioning to work correctly with flex layout
- **Restore Modal Scrollbar**: Fixed scrollbar position on backup vault restore modal
  - Scrollbar now appears on inner content section (#restore-content) instead of outer modal edge
  - Matches the behavior of the container details modal for consistency
  - Restore Container and Cancel buttons remain fixed at bottom outside scrollable area
  - Better user experience when viewing long backup previews with many volumes or port mappings
- **Server Name Panel Centering**: Fixed horizontal centering of server name text in top bar
  - Server name text is now properly centered within its panel
  - Icon positioned absolutely on the left so it doesn't affect text centering
  - Text uses full width with center alignment for perfect visual balance

### Volume Management Enhancements
- **Stack Column in Volumes Table**: Added Stack column to volumes table
  - Displays which Docker stack (Compose project or Swarm stack) each volume belongs to
  - Shows "-" if volume doesn't belong to any stack
  - Stack information determined by checking container labels of containers using each volume
  - Column is sortable like other volume columns
  - Positioned between Name and Driver columns for logical grouping

### Version Update
- Updated version number to 0.3.10 across application, website, README.md, and PRD.md

---

## Version 0.3.9

### Performance Improvements
- **Statistics Page Background Caching**: Significantly improved statistics page load times
  - **Background Refresh**: Stats are now built in a background thread every 5 minutes (starting when app first runs)
  - **Instant Display**: When visiting the statistics page, cached stats are displayed immediately (no waiting)
  - **Better UX**: Users see data instantly instead of waiting for slow stats generation
  - **Non-Blocking**: Stats generation no longer blocks the UI or API requests
  - **Incremental Updates**: Grid updates incrementally as new stats arrive, preserving existing data while refreshing

### Statistics Page Enhancements
- **Next Refresh Column**: Added "Next Refresh" column showing countdown until next automatic refresh
  - **Countdown Display**: Shows countdown timer from 5:00 to 0:00 (MM:SS format) indicating time until next background refresh
  - **Real-Time Updates**: Countdown updates every second to show current time remaining
  - **Visual Feedback**: Users can see exactly when the next automatic refresh will occur
  - **Reset on Refresh**: Countdown resets to 5:00 when stats are refreshed (automatic or manual)
- **Refresh Button**: Added manual refresh button to statistics page
  - **Always Available**: Button is enabled by default, allowing users to trigger refresh on demand
  - **Manual Control**: Users control when to refresh stats instead of automatic refresh on page visit
  - **State Management**: Button disables when refresh is triggered and re-enables when complete
  - **Error Handling**: Button re-enables on errors to allow retry

### Version Update
- Updated version number to 0.3.9 across application, website, README.md, and PRD.md

---

## Version 0.3.8

### UI Improvements
- **Monkey Emoji Cube Spinner**: Replaced all loading spinners with the animated monkey emoji cube from the website
  - **3D Rotation Animation**: Spinner now rotates in 3D space with smooth floating motion
  - **Monkey Emoji Display**: Features the 🐵 emoji on both front and back faces of the cube
  - **Wireframe Edges**: Includes subtle 3D wireframe edges matching the website's cube design
  - **Consistent Branding**: Matches the visual style of the Container Monkey website
  - **All Loading States**: Applied to all loading indicators throughout the application (containers, volumes, images, networks, backups, etc.)

- **Download Modal Header**: Simplified download modal header text
  - **Removed Redundant Info**: Removed speed and file size information from header (already shown in individual file progress items below)
  - **Cleaner Display**: Header now only shows file count and current filename (e.g., "Downloading 2 / 2: filename.tar.gz")
  - **Less Clutter**: Reduces visual redundancy while maintaining all necessary information in the detailed progress list

### Version Update
- Updated version number to 0.3.8 across application, website, README.md, and PRD.md

---

## Version 0.3.7

### New Features
- **Backup Vault Checkbox Selection**: Added checkbox-based selection system to backup vault
  - **Checkbox Column**: Added checkbox column header with "Select All" functionality
  - **Row Selection**: Clicking on a backup row toggles its checkbox
  - **Bulk Operations**: Download and Remove buttons now work with selected backups only
  - **Button States**: Download and Remove buttons are disabled by default and enable when backups are selected
  - **Consistent UX**: Matches the selection pattern used in other grids (containers, volumes, images, etc.)

### UI Improvements
- **Backup Vault Enhancements**:
  - **Removed Individual Actions**: Removed individual Download and Remove buttons from each backup row (kept Restore button)
  - **Renamed Bulk Actions**: Changed "Download All" to "Download" and "Delete All" to "Remove"
  - **Column Width Optimization**: Created and Actions columns auto-size to smallest possible width, Filename column expands to take remaining space
  - **Selection Management**: Added selection state management with visual feedback

- **Download All Improvements**:
  - **Sequential Downloads**: Changed from creating a single archive to downloading files sequentially, one at a time
  - **Better for Large Vaults**: More practical for large vaults on cloud servers - no large archive file creation
  - **Progress Tracking**: Modal list automatically scrolls to follow the active download
  - **Fetch-Based Downloads**: Uses fetch() API with blob downloads for better control and reliability
  - **Real-Time Speed Tracking**: Shows download speed (KB/s or MB/s) updating in real-time for each file
  - **Progress Display**: Shows percentage, bytes downloaded, and current/average speed for each file
  - **Cancel Functionality**: Added cancel button to stop downloads in progress
  - **Wider Modal**: Increased download modal width by 50% (from 700px to 1050px) for better visibility
  - **Confirmation Dialog**: Added confirmation dialog before starting downloads with count of selected files

- **Remove Progress Modal**:
  - **Visual Feedback**: Progress modal shows real-time removal progress when removing multiple backups
  - **Status Tracking**: Each backup shows status (Waiting → Removing → Removed/Failed) with color-coded indicators
  - **Auto-Scroll**: Modal list automatically scrolls to follow the active removal
  - **Progress Summary**: Final summary displays success/failure counts
  - **Better UX**: Provides clear feedback during bulk removal operations instead of silent background processing

- **Backup Container Modal**:
  - **Auto-Scroll**: Modal list automatically scrolls to follow the active backup being processed
  - **Better Visibility**: Makes it easier to track progress in long lists of containers

- **Upload Progress Modal**:
  - **Auto-Scroll**: Modal list automatically scrolls to follow the active upload being processed
  - **Real-Time Speed Tracking**: Shows upload speed (KB/s or MB/s) updating in real-time for each file
  - **Progress Display**: Shows percentage, bytes uploaded, and current/average speed for each file
  - **Cancel Functionality**: Added cancel button to stop uploads in progress
  - **Wider Modal**: Increased upload modal width by 50% (from 700px to 1050px) for better visibility
  - **Simplified Status Bar**: Removed redundant speed/progress from status bar (shown on individual file items)
  - **Consistent UX**: Matches the auto-scroll behavior of download and remove progress modals

### Bug Fixes
- **Statistics Page Timeout Issues**: Fixed statistics page failing to display data after long waits and false timeout errors
  - **Request Timeout**: Added 60-second timeout to prevent indefinite waiting for statistics data
  - **Request Cancellation**: Prevents duplicate requests by canceling previous requests when page is reloaded
  - **Race Condition Fix**: Fixed "Cannot read properties of null" error by using local abort controller reference and proper cleanup
  - **False Timeout Detection**: Removed incorrect abort status check after successful fetch that caused false timeout errors
  - **Proper Timeout Cleanup**: Timeout cleared in multiple places (after response, in catch block, and finally block) to prevent race conditions
  - **Better Error Handling**: Improved error messages for timeout, network, and abort scenarios
  - **User Feedback**: Clear error messages displayed when requests timeout instead of showing nothing
  - **Prevents Stuck Spinner**: Ensures loading spinner is always hidden even if request fails
- **Upload Rate Limiting**: Removed rate limiting on upload endpoint to support bulk backup uploads
  - **Exempted from Rate Limits**: Upload endpoint now exempt from default rate limiting (50/hour limit)
  - **Bulk Upload Support**: Allows users to upload many backups without hitting rate limit errors
  - **Improved Error Handling**: Better error messages for upload failures, including rate limit detection
- **Upload CSRF Token**: Fixed CSRF token handling in upload functionality
  - **XMLHttpRequest Support**: Added CSRF token header to XMLHttpRequest uploads for proper authentication
  - **Error Handling**: Added CSRF error detection and page refresh for token renewal
- **Login Modal Spacing**: Fixed login modal bottom margin to match rest of modal
  - **Consistent Padding**: Increased bottom padding from 8px to 32px to match modal-content default padding

### UI Improvements
- **Scheduler Cleanup**: Removed Force Backup button from scheduler interface
  - **Simplified Interface**: Removed manual trigger button as scheduler runs automatically based on configuration
  - **Automatic Operation**: Scheduler continues to work as intended without manual intervention

### Version Update
- Updated version number to 0.3.7 across application, website, README.md, and PRD.md

---

## Version 0.3.6

### New Features
- **Server Name Management**: Server name configuration and display
  - **Server Name Setting**: Customizable server name displayed in top bar right panel
  - **Persistent Storage**: Settings saved to database and persist across container restarts
  - **Default Value**: Server name defaults to "My Server Name" if not set
  - **Top Bar Display**: Server name shown in styled panel on right side of top bar (after stats, before user menu)
  - **Clickable Panel**: Clicking server name opens Server Name modal for quick editing
  - **Server Name Modal**: Clean modal interface for managing server name (renamed from Settings modal)
  - **Streamlined Access**: Removed Settings menu item from sidebar; access via server name panel only

- **Multi-Server Backup Identification**: Server name tracking for shared S3 vaults
  - **Server Name in Backups**: Every backup includes server name metadata for identification
  - **Companion JSON Files**: Each backup has a companion `.tar.gz.json` file containing server name
  - **Backup Vault Server Column**: New "Server" column in backup vault displays origin server name
  - **Shared S3 Vault Support**: Enables multiple Container Monkey instances sharing the same S3 bucket to identify which server created each backup
  - **Performance Optimized**: Server name read from lightweight JSON files instead of opening tar archives
  - **Automatic Cleanup**: Companion JSON files automatically removed when backups are removed
  - **Backward Compatible**: Old backups without server name metadata display "Unknown Server"
  - **S3 Integration**: Companion JSON files uploaded/downloaded with backups in S3 storage
  - **Upload Support**: Uploaded backups automatically get companion JSON files with server name from metadata or current server settings

### UI Improvements
- **Top Bar Layout Refinements**:
  - **Server Name Panel**: Moved server name display to right side of top bar (after stats, before user menu)
  - **Centered Stats**: CPU/RAM/time stats now centered in top bar for better visual balance
  - **Three-Column Layout**: Logo (left), Stats (center), Server Name + User Menu (right)
  - **Clickable Server Name**: Click server name panel to open Server Name modal for quick editing

- **Server Name Modal**:
  - **Simplified Interface**: Removed redundant "Server Name" label (title already indicates purpose)
  - **Renamed from Settings**: Modal renamed from "Settings" to "Server Name" to reflect its sole purpose
  - **Removed Sidebar Menu**: Settings menu item removed from sidebar (access via server name panel only)
  - **Clean Input Focus**: Fixed corrupted border appearance when input field is active/focused

- **Backup Vault Enhancements**:
  - **Server Column**: New sortable "Server" column showing origin server for each backup
  - **Server Search**: Server name included in backup vault search/filter functionality
  - **Centered Empty State**: "No backups found" message now properly centered in grid

- **Modal Input Fixes**: Improved input field focus states across all modals
  - **Settings Modal**: Fixed corrupted border on server name input when focused
  - **S3 Config Modal**: Fixed corrupted borders on all S3 configuration inputs (bucket, region, access key, secret key)
  - **Proper Overflow Handling**: Form containers allow focus borders to display without clipping

- **Dashboard Improvements**:
  - **Panel Hover Fix**: Dashboard panel hover transform no longer gets cut off at top
  - **Proper Overflow**: Added padding and overflow settings to prevent hover effects from being clipped

- **Server Name Modal UX Improvements**:
  - **Auto-Focus**: Input field automatically receives focus when modal opens
  - **Select All Text**: All text in input field is automatically selected for easy replacement

### Configuration Changes
- **Default Port Update**: Changed default host port from 666 to 1066
  - Updated in README.md, PRD.md, website/index.html, build_deploy_local_docker.sh, and docker.txt
  - Container port remains 80; only host port mapping changed

### Version Update
- Updated version number to 0.3.6 across application, website, README.md, and PRD.md

---

## Version 0.3.5

### UI Improvements
- **Collapsible Sidebar Menu**: Added collapsible sidebar with toggle button
  - **Toggle Control**: Collapse/expand button positioned at the border between sidebar and content
  - **Icon-Only Mode**: When collapsed, sidebar shows only icons for a compact view
  - **State Persistence**: Sidebar state saved to localStorage and restored on page load
  - **Smooth Animations**: Transitions for expanding/collapsing sidebar
  - **Content Adjustment**: Main content area automatically adjusts margin when sidebar collapses

- **Typography Consistency**: Unified font sizes and styles across all data grids
  - **Uniform Table Headers**: All table headers use consistent font size (0.8em), weight (600), uppercase, and letter spacing
  - **Uniform Table Cells**: All table cells use consistent font size (0.95em) and weight (400)
  - **Bold Name Columns**: Name columns in all tables are bold (font-weight: 600) for better readability
  - **Consistent Styling**: Applied uniform typography to containers, volumes, images, stacks, backups, networks, statistics, audit log, and scheduler tables

- **Loading Grid Improvements**: Enhanced loading state for empty grids
  - **Increased Height**: Empty grids now display at twice the normal height (400px) when loading for better visibility
  - **Centered Spinner**: Loading spinner is now perfectly centered vertically within the expanded grid area
  - **Consistent Experience**: Applied to all grid sections (containers, volumes, images, networks, stacks, backups, statistics, audit log, and scheduler containers)
  - **Better Visual Feedback**: Larger loading area provides clearer indication that data is being fetched

- **Login Modal Fixes**: Improved login modal interaction and styling
  - **Button Hover Fix**: Login button hover effect no longer gets cut off at the top - added proper overflow handling and padding
  - **Input Focus Styling**: Fixed weird active highlight on username/password fields when in focus
  - **Password Manager Compatibility**: Overrode password manager injected styles to ensure consistent focus appearance
  - **Autofill Styling**: Proper handling of browser autofill states to maintain consistent visual design
  - **Better Overflow Handling**: Modal content and form elements now properly handle button hover transforms without clipping

- **Section Header Icon Alignment**: Fixed vertical alignment of icons in page section headers
  - **Centered Icons**: All section header icons are now perfectly vertically centered with their title text
  - **Consistent Spacing**: Replaced inline margin styles with flexbox gap for consistent spacing
  - **Better Visual Balance**: Icons and text now align properly across all page sections (Dashboard, Containers, Volumes, Images, Networks, Stacks, Backup Vault, Backup Scheduler, Audit Log, Statistics)
  - **Flexbox Layout**: Section headers now use flexbox for improved alignment and consistency

- **Sidebar Menu Reordering**: Improved navigation menu organization
  - **Logical Grouping**: Reordered sidebar menu items for better workflow
  - **New Order**: Dashboard → Stacks → Containers → Images → Volumes → Networks → Backup Vault → Backup Scheduler → Audit Log → Statistics
  - **Better Navigation Flow**: Core Docker resources (Stacks, Containers, Images, Volumes, Networks) are now grouped together after Dashboard
  - **Improved UX**: Menu order now follows a more intuitive progression from high-level overview to specific resources

### Version Update
- Updated version number to 0.3.5 across application, website, README.md, and PRD.md

---

## Version 0.3.4

### UI Improvements
- **Action Feedback**: Replaced console logs with toast notifications for all container, image, network, volume, and backup operations for better user feedback.
- **S3 Configuration Modal UX**: Enhanced user experience for S3 storage configuration
  - **Immediate Feedback**: Modal now closes immediately when saving settings
  - **Toast Notifications**: Replaced in-modal status messages with toast notifications for consistent feedback
  - **Fixed Layout**: Prevented modal from resizing/jumping during save operations due to dynamic error messages
  - **Better Visibility**: Success/Error/Info messages appear as toast notifications at the top of the screen

- **Login Modal UX**: Improved authentication error handling
  - **Toast Notifications**: Login errors (e.g., "Invalid username or password") now appear as toast notifications instead of in-modal error messages
  - **Cleaner Interface**: Login modal remains clean without error text disrupting the form layout
  - **Consistent Feedback**: Authentication errors use the same toast notification system as other application feedback
  - **Branding**: Added Container Monkey logo and name to login modal header, matching the top bar design
  - **Vertical Centering**: Login modal now appears vertically centered on screen for better visual balance
  - **Password Manager Compatibility**: Fixed scrollbar issues when password managers fill credentials
    - **No Horizontal Scrollbars**: Modal content and form elements prevent horizontal overflow
    - **No Vertical Scrollbars**: Form fields and containers prevent vertical scrollbars during autofill
    - **Smooth Experience**: Login form remains stable and scrollbar-free when password managers interact

- **Modal Improvements**: Enhanced modal positioning and consistency across the application
  - **Vertical Centering**: All modals now appear vertically centered on screen for improved visual presentation
  - **Consistent Layout**: Standardized modal positioning across all dialogs (login, password change, confirmation, restore, backup progress, etc.)
  - **Better UX**: Centered modals provide better focus and reduce visual fatigue
  - **Overflow Prevention**: All modals prevent horizontal scrolling and unnecessary vertical scrolling

- **Top Bar Improvements**: Enhanced consistency and visual design
  - **Unified Typography**: CPU, RAM, and time displays now use consistent font (monospace), weight (500), and color
  - **Clock Icon**: Added Phosphor clock icon to time display, matching CPU and RAM icon style
  - **Consistent Structure**: Time display integrated into top-bar-stats container with matching stat-item structure
  - **Visual Harmony**: All top bar statistics now have uniform appearance and spacing

- **Notification System**:
  - **Improved Positioning**: Notifications now appear vertically centered over the top bar (10px from top)
  - **Enhanced Visibility**: Increased z-index to ensuring notifications appear above all other interface elements (including modals and user menus)
  - **Consistent Styling**: Standardized notification appearance across the application

- **Data Grid/Table Improvements**: Enhanced table scrolling and layout for better single-page experience
  - **Vertical Scrollbars**: All data grids/tables now have independent vertical scrollbars
  - **Fixed UI Elements**: Headers, buttons, and controls remain fixed while tables scroll independently
  - **Sticky Table Headers**: Table column headers remain visible when scrolling through table content
  - **Optimized Layout**: Tables fill available vertical space efficiently with reduced bottom margins
  - **Backup Scheduler Table**: Fixed table layout to match other sections, removed unnecessary card wrapper
  - **Container ID Column**: Added Container ID column to backup scheduler container selection table

- **Audit Log Pagination**: Replaced "Load More" button with traditional pagination
  - **Page Navigation**: Previous/Next buttons for easy navigation between pages
  - **Page Information**: Displays current page, total pages, and item range (e.g., "Page 1 of 5 (1-10 of 50)")
  - **Right-Aligned Controls**: Pagination controls aligned to the right for better visual balance
  - **Automatic Reset**: Filters and search automatically reset to page 1 when changed

### Version Update
- Updated version number to 0.3.4 across application, website, README.md, and PRD.md

---

## Version 0.3.3

### Security Improvements
- **Strong Password Policy**: Implemented comprehensive password complexity requirements
  - Minimum password length increased from 3 to 12 characters
  - Requires at least one uppercase letter (A-Z)
  - Requires at least one lowercase letter (a-z)
  - Requires at least one digit (0-9)
  - Requires at least one special character (!@#$%^&*...)
  - Real-time password validation with visual feedback in change password modal
  - Password policy requirements displayed clearly in modal
  - Visual indicators show which requirements are met as user types
  - Backend validation ensures policy enforcement even if frontend is bypassed
  - Specific error messages indicate which requirements are missing

- **CSRF Protection**: Added comprehensive CSRF (Cross-Site Request Forgery) protection
  - Implemented Flask-WTF CSRF protection for all state-changing requests (POST, PUT, DELETE)
  - Automatic CSRF token injection into all API requests via fetch interceptor
  - Cookie-based CSRF token management for seamless user experience
  - CSRF tokens automatically included in all POST/PUT/DELETE requests
  - Login endpoint exempted from CSRF (creates new session)
  - Automatic error handling and page refresh on CSRF validation failures
  - No code changes required for existing API calls - protection is automatic

- **Session Cookie Security**: Enhanced session cookie protection against XSS and CSRF attacks
  - **HttpOnly Protection**: Session cookies use HttpOnly flag to prevent JavaScript access (XSS protection)
    - Configured via `SESSION_COOKIE_HTTPONLY = True`
    - Prevents client-side JavaScript from accessing session cookies
  - **SameSite Protection**: Session cookies use `SameSite='Lax'` to provide CSRF protection by limiting cross-site cookie sends
    - Configured via `SESSION_COOKIE_SAMESITE = 'Lax'`
  - **Automatic HTTPS Detection**: Session cookies automatically use Secure flag when HTTPS is detected
    - Simple `before_request` hook checks `X-Forwarded-Proto` header from reverse proxy
    - Secure flag automatically set to `True` when header is `https`, `False` for HTTP
    - Works seamlessly with reverse proxy setups (nginx, Apache, etc.) with TLS termination
    - Since TLS is always behind a proxy, only checks the `X-Forwarded-Proto` header
    - No configuration needed - automatically adapts to connection protocol
  - Works with both HTTP and HTTPS deployments (with or without reverse proxy)
  - Protects against session hijacking via XSS attacks
  - Reduces CSRF attack surface by preventing cross-site POST requests from sending session cookies

- **Command Injection Prevention**: Fixed critical command injection vulnerabilities
  - **Container Exec Terminal**: Fixed command injection in container exec console
    - Commands now properly escaped using `shlex.quote()` to prevent shell injection
    - Added container ID validation to ensure proper format
    - Prevents attackers from chaining malicious commands (e.g., `ls; rm -rf /`)
    - Commands with shell operators (`&&`, `|`, `;`) are safely escaped
  - **Container Redeploy**: Fixed unsafe shell execution fallback
    - Removed dangerous `shell=True` fallback when command parsing fails
    - Function now fails securely instead of executing unsafe shell commands
    - Added command structure validation before execution
    - Explicitly sets `shell=False` for all subprocess calls
  - **Working Directory Support**: Enhanced security for directory operations
    - Container exec now uses Docker's native `-w` flag for working directory
    - Eliminates need for shell-based directory changes (`cd` commands)
    - More secure than shell-based path manipulation
    - Frontend updated to use working directory API instead of shell operators

- **Information Disclosure Prevention**: Fixed error message information disclosure vulnerabilities
  - Replaced all `traceback.print_exc()` calls with safe error logging
  - Created `error_utils.py` module with `safe_log_error()` function
  - Full stack traces only shown in debug mode (controlled by `DEBUG_MODE` environment variable)
  - Production mode returns generic error messages to prevent information disclosure
  - Prevents attackers from learning about file paths, code structure, and internal system details
  - Error messages sanitized across all manager modules (25+ instances fixed)
  - Maintains full debugging capability in development while securing production deployments

- **S3 Credentials Security**: Fixed critical security vulnerability exposing S3 secret keys in API responses
  - **Secret Key Exposure Prevention**: S3 secret keys are no longer returned in API responses
    - GET `/api/storage/settings` endpoint now returns masked placeholder (`***`) instead of actual secret key
    - POST `/api/storage/settings` response also excludes secret key for security
    - Secret keys are never exposed in API responses, even when masked in UI
  - **Preserve Existing Credentials**: Users can update S3 settings without re-entering secret key
    - Empty or masked secret key values preserve existing encrypted credentials
    - Secret key is only updated when explicitly provided by user
    - Validation ensures secret key is required only when configuring S3 for the first time
  - **Frontend Security**: Updated UI to handle masked secret keys securely
    - Form shows placeholder text when secret key exists but is masked
    - Users can leave secret key field blank to preserve existing credentials
    - Test connection still requires explicit secret key entry for validation
  - Prevents credential exposure through API inspection, network monitoring, or client-side code analysis

### Technical Changes
- **Password Policy Implementation**:
  - Updated `auth_manager.py` to enforce strong password requirements
  - Added regex-based password complexity validation
  - Frontend validation provides real-time feedback via `validatePasswordStrength()`
  - Visual indicators update dynamically as user types password
  - Password policy requirements clearly displayed in change password modal
  - Backend returns specific error messages for missing requirements

- **CSRF Implementation**: 
  - Added Flask-WTF dependency for CSRF protection
  - CSRF tokens injected into page templates via `window.csrfToken`
  - Fetch interceptor automatically adds CSRF tokens to state-changing requests
  - Token fallback to cookie if window token unavailable
  - All API endpoints now protected against CSRF attacks

- **Container Exec Security**:
  - `exec_container_command()` now accepts optional `working_dir` parameter
  - Uses Docker's `-w` flag for secure working directory handling
  - Frontend `executeCommand()` function refactored to use working directory API
  - Improved path resolution for `cd` commands (absolute, relative, parent directory)
  - No longer relies on shell operators for directory navigation

- **Container Redeploy Security**:
  - Removed unsafe `shell=True` fallback in `redeploy_container()`
  - Added secure error handling when command parsing fails
  - Command structure validation before execution

- **Session Cookie Security Implementation**:
  - Standard Flask session cookie configuration in `app.py`
  - HttpOnly flag set via `SESSION_COOKIE_HTTPONLY = True`
  - SameSite protection set via `SESSION_COOKIE_SAMESITE = 'Lax'`
  - **Automatic HTTPS Detection**: Implemented via `before_request` hook
    - `configure_session_cookie()` function checks `X-Forwarded-Proto` header per-request
    - Dynamically sets `SESSION_COOKIE_SECURE` config based on header value
    - Simple and reliable - no middleware or custom session interface needed
    - Secure flag set to `True` when `X-Forwarded-Proto: https` detected, `False` for HTTP
    - No manual configuration required - works automatically
  - Configuration works seamlessly with HTTP, HTTPS, and reverse proxy setups

- **Error Handling Security**:
  - Created `error_utils.py` module for centralized safe error logging
  - `safe_log_error()` function respects debug mode settings
  - Checks `DEBUG_MODE` environment variable and Flask debug configuration
  - Updated all manager modules to use safe error logging
  - Generic error messages returned to users in production mode
  - Full tracebacks available in debug mode for development

- **S3 Credentials Security Implementation**:
  - Updated `/api/storage/settings` GET endpoint to return masked secret key placeholder
  - Modified POST endpoint to handle masked secret keys and preserve existing credentials
  - Frontend updated to show placeholder text and allow preserving existing secret keys
  - Secret keys are only transmitted when explicitly changed by user
  - All API responses exclude actual secret key values for security

### UI Improvements
- **Password Change Modal UX**: Improved user experience for password change operations
  - Password validation errors now shown as toast notifications instead of in-modal error messages
  - Prevents scrollbar issues when error messages are displayed
  - Success messages also shown as toast notifications for consistency
  - Modal closes immediately on successful password change (no 2-second delay)
  - Better visual feedback with notifications positioned at top center of screen
  - Cleaner modal interface without error message clutter

### Version Update
- Updated version number to 0.3.3 across application, website, README.md, and PRD.md

---

## Version 0.3.2

### Security Improvements
- **Removed Hardcoded Encryption Key**:
  - Previously used hardcoded encryption key for S3 credentials stored in database
  - Now generates unique random encryption key per installation
  - Key stored securely at `/backups/config/encryption.key` in Docker volume
  - Key file has restricted permissions (600 - owner read/write only)
  - Automatic key generation on first run

- **Default Credentials Warning**: Added security warning modal for default login credentials
  - Modal appears automatically when logging in with default credentials (`admin` / `c0Nta!nerM0nK3y#Q92x`)
  - Clear explanation of security risks
  - Direct link to change password functionality
  - Encourages users to change credentials immediately after first login
  - Non-blocking but persistent reminder

- **Reduced Session Lifetime**: Improved security by reducing session cookie lifetime
  - Changed from 7 days to 1 day
  - Users must re-authenticate after 24 hours of inactivity
  - Reduces risk of unauthorized access from stolen session cookies

### Technical Changes
- **Encryption Key Management**: Complete refactor of encryption utilities
  - Removed `STATIC_ENCRYPTION_KEY_STRING` constant
  - New `EncryptionKeyError` exception for better error handling
  - Key generation uses `secrets.token_urlsafe(32)` for cryptographically secure randomness
  - Key persistence in Docker volume ensures it survives container restarts
  - Backward compatibility: Existing installations will need to re-enter S3 credentials (encrypted with old key)

### Migration Notes
- **Existing Installations**: If upgrading from 0.3.1 or earlier:
  - New encryption key will be generated automatically on first run
  - Existing S3 credentials encrypted with old key will need to be re-entered
  - Key file location: `/backups/config/encryption.key`

### Version Update
- Updated version number to 0.3.2 across application, website, README.md, and PRD.md

---

## Version 0.3.1

### UI Improvements
- **Unified Backup Upload**: Combined upload backup and upload network backup into a single upload function
  - Single "Upload Backup" button accepts both `.tar.gz` container backups and `.json` network backups
  - Removed separate "Upload Network Backup" button for cleaner interface
  - Network restore prompt appears after successful JSON upload

- **Backup Vault Search & Sort**: Enhanced backup vault with powerful search and sorting capabilities
  - **Search Filter**: Real-time search across filename, type, backup type, storage location, and creation date
    - Positioned in header row (left of storage toggle)
    - Case-insensitive with instant filtering
    - Filter persists during sorting operations
  - **Sortable Columns**: All backup vault columns are sortable (Filename, Type, Backup Type, Storage, Size, Created)
    - Visual sort indicators (▲/▼) show active column and direction
    - Sort state persists when reloading backups
    - Size sorts numerically, Created sorts by date/time
  - **Layout Improvements**: 
    - Search box matches button height (36px) for consistent alignment with storage toggle and action buttons
    - Optimized column widths: Actions column sized to fit buttons only, all other columns (except Filename) shrink to content width
    - Filename column expands to fill remaining table space for better readability

- **Sortable Grid Columns**: Added column sorting to all major grids
  - **Volumes**: Sortable by Name, Driver, Mountpoint, Created, Size
  - **Images**: Sortable by Name/Tags, ID, Size, Created
  - **Networks**: Sortable by Name, Driver, Scope, Subnet/Gateway, Containers
  - **Stacks**: Sortable by Stack Name, Type, Services, Containers, Networks
  - All grids feature visual sort indicators and persistent sort state
  - Numeric columns (Size, Containers, Services) sort numerically
  - Date columns sort chronologically

### Backend Changes
- Updated `/api/upload-backup` endpoint to handle both `.tar.gz` and `.json` files
  - Automatically routes to appropriate handler based on file extension
- Removed `/api/upload-network-backup` endpoint (functionality merged into `/api/upload-backup`)

### Frontend Changes
- Added search and sort functions for backup vault (`filterBackups()`, `sortBackups()`, `renderBackups()`)
- Added sort functions for volumes, images, networks, and stacks grids
- Added data storage arrays and sort state management for all grids
- Removed `uploadNetworkBackup()` function (functionality merged into `uploadBackup()`)

### Version Update
- Updated version number to 0.3.1 across application, website, README.md, and PRD.md

---

## Version 0.3.0

### New Features
- **S3 Storage Support**: Added comprehensive AWS S3 storage integration for backups
  - Toggle switch on backup vault screen to switch between Local and S3 storage
  - S3 configuration modal with fields for bucket name, region, access key ID, and secret access key
  - Test connection button to verify S3 read/write permissions before saving
  - Settings automatically saved to `monkey.db` database
  - All backups (uploaded, manual, scheduled) automatically use selected storage type
  - Storage location column in backup vault showing Local or S3 for each backup
  - S3 credentials encrypted at rest in database using Fernet symmetric encryption with static key
  - Temp files downloaded from S3 stored in separate temp directory (not visible in vault)
  - Automatic cleanup of temp files after restore operations complete
  - Old temp files (>24 hours) cleaned up on application startup

- **Storage Settings Management**:
  - New `storage_settings` table in database for storing storage configuration
  - `StorageSettingsManager` module for managing storage settings with encryption
  - `S3StorageManager` module for S3 operations (upload, download, list, remove, test)
  - `encryption_utils` module for encrypting/decrypting S3 credentials
  - Settings persist across app restarts and populate modal when switching back to S3

### UI Improvements
- **Storage Toggle Switch**: Modern toggle switch UI for Local/S3 storage selection
  - Beautiful animated toggle switch matching app design
  - Smooth transitions and hover effects
  - Clear visual indication of current storage type
- **S3 Configuration Modal**: Professional modal interface for S3 settings
  - Form fields for all required S3 configuration
  - Test connection button with loading state
  - Success/error message display
  - Auto-populates saved settings (including obscured secret key) when switching back to S3
- **Local Storage Confirmation Modal**: Proper modal dialog for switching to local storage
  - Replaces browser confirm dialog with styled modal
  - Clear messaging about storage behavior
  - Professional UI matching app design
- **Backup Vault Table**: Added Storage column showing Local or S3 for each backup
  - Auto-sized columns for better layout
  - Clear visual indicators with icons (cloud for S3, hard drive for Local)
- **Force Backup Button**: Added "Force Backup" button on Backup Scheduler page
  - Triggers scheduled backups immediately
  - Runs in background with progress tracking
  - Shows loading state and notifications
- **Backup Grid Auto-Refresh**: Backup grid automatically refreshes after network backup upload
- **Consistent Button Spacing**: Standardized button spacing across all sections
  - Backup Scheduler and Backup Vault buttons now match Container page spacing (8px gap)
  - All buttons wrapped in `btn-group` for consistent styling
- **Improved Backup Vault Table**: Filename column now properly wraps long filenames
  - Added word-wrap and overflow-wrap CSS properties
  - Long filenames like scheduled backups no longer spill out of column
- **Clarified Lifecycle Setting**: Updated label to "Lifecycle (backups per container to keep)" for clarity
- **Simplified Top Bar**: Removed tagline "Secure Your Docker Environment" from under logo for cleaner look

### Backend Changes
- Added `s3_storage_manager.py` module for S3 operations using boto3
- Added `storage_settings_manager.py` module for storage settings management
- Added `encryption_utils.py` module for credential encryption
- Updated `backup_manager.py` to upload backups to S3 when enabled
- Updated `backup_file_manager.py` to list/download/remove from S3 when enabled
- Updated `restore_manager.py` to handle S3 backups via temp file downloads
- Updated `network_manager.py` to support S3 storage for network backups
- Added storage settings API endpoints: `/api/storage/settings` (GET/POST), `/api/storage/test-s3`
- Added `storage_settings` table to database schema
- Temp directory (`/backups/temp/`) for S3 downloads during restore operations
- Automatic cleanup of temp files after restore and on startup
- **Remove All** functionality now removes backups from both S3 and local storage
- **Download All** functionality now includes S3 backups in archive (downloads from S3 to temp location)
- Network backups now upload to S3 when S3 storage is enabled
- Network backup restore downloads from S3 when needed
- S3 credentials preserved when switching from S3 to local storage

### Security Improvements
- **Encrypted S3 Credentials**: S3 access keys and secret keys encrypted at rest in database
  - Uses Fernet symmetric encryption with PBKDF2 key derivation
  - Static encryption key ensures consistency across app restarts
  - Credentials automatically encrypted when saving, decrypted when reading
  - Migration support for existing unencrypted credentials

### Bug Fixes
- **Fixed S3 modal prepopulation**: S3 configuration modal now properly populates all fields (including secret key) when switching back to S3
- **Fixed remove all with S3**: Remove All button now correctly removes backups from S3 storage
- **Fixed download all with S3**: Download All now includes S3 backups in archive (downloads from S3 to temp location before archiving)
- **Fixed network backups S3 support**: Network backups now properly upload to and restore from S3 when enabled
- **Fixed S3 credentials preservation**: S3 credentials are now preserved when switching from S3 to local storage
- **Fixed temp file cleanup**: Temporary S3 download files properly cleaned up after restore operations
- **Fixed duplicate containers in backup queue**: Backup All modal now shows each container only once instead of duplicates
  - Added deduplication logic to prevent containers from appearing twice in the queue

### Security Updates
- **Updated default credentials**: Changed default login from `monkeysee/monkeydo` to `admin/c0Nta!nerM0nK3y#Q92x` for improved security and to stop google password nag

### Dependencies
- Added `boto3==1.34.0` for AWS S3 integration
- Added `cryptography==42.0.0` for credential encryption

### Documentation
- Added `AWS_S3_SETUP.md` guide with step-by-step instructions for setting up S3 bucket, IAM user, and inline policy

### Version Update
- Updated version number to 0.3.0 across application, website, README.md, and PRD.md

---

## Version 0.2.15

### Bug Fixes
- **Fixed unresponsive buttons issue**: Resolved critical UI issue where buttons would stop working and require a page refresh
  - Fixed notification container overlay blocking clicks on underlying elements by setting `pointer-events: none` on the container
  - Notification items remain interactive (`pointer-events: auto`)
  - Reduced stuck spinner detection threshold from 30s to 5s to quickly clear blocking loading overlays
  - Enhanced spinner cleanup to target all types of loading spinners
  - Added error handling to safety check click listeners to prevent crashes

### Code Cleanup
- **Removed unused code**: Cleaned up unused imports and methods
  - Removed unused `wraps` import from `app.py`
  - Removed unused `database_manager` variable assignment (initialization still occurs)
  - Removed unused `get_connection()` method from `DatabaseManager` class
  - Cleaner, more maintainable codebase

### Database Improvements
- **Simplified database initialization**: Removed migration code from database manager
  - Database manager now simply creates `monkey.db` with required tables if it doesn't exist
  - Cleaner, simpler codebase without migration complexity
  - Default user is created automatically if no users exist

### UI Improvements
- **Content title update**: Audit Log section header now displays "Backup Audit Log" for consistency with menu item
- **Improved restore workflow**: After restoring a backup, users now stay on the Backup Vault page
  - No automatic navigation to containers page after successful restore
  - Better workflow continuity when managing backups
- **Content section title updates**: Simplified section titles for cleaner interface
  - "Available Backups" changed to "Backup Vault" for consistency
  - "Docker Stacks" simplified to "Stacks"
  - "Docker Images" simplified to "Images"
  - "Docker Networks" simplified to "Networks"
  - "Docker Volumes" simplified to "Volumes"
  - More concise and modern interface
- **Fixed unnecessary scrollbar**: Resolved issue where vertical scrollbar appeared even when content didn't exceed viewport
  - Removed bottom padding from content sections to prevent overflow
  - Changed main-content from min-height to fixed height with overflow control
  - Reduced top padding from 32px to 24px for better fit
  - Reduced section-header margin-bottom from 32px to 24px
  - Added min-height: 0 to content-section for proper flex behavior
  - Scrollbar now only appears when content actually exceeds screen size

### Version Update
- Updated version number to 0.2.15 across application, website, README.md, and PRD.md

---

## Version 0.2.14

### Database Improvements
- **Unified database architecture**: Consolidated all data into a single `monkey.db` database
  - Created unified `monkey.db` database replacing separate `users.db` and `audit_log.db` files
  - Added `backup_schedules` table to store scheduler configuration in database instead of JSON
  - Automatic migration from old databases (`users.db`, `audit_log.db`) and JSON config (`scheduler_config.json`)
  - Migration is idempotent and safe to run multiple times
  - All managers now use the unified database for better scalability and future multi-user support
  - Database schema includes: `users` table, `audit_logs` table, and `backup_schedules` table

### Version Update
- Updated version number to 0.2.14 across application, website, README.md, and PRD.md

---

## Version 0.2.13

### Bug Fixes
- **Fixed weekly backup schedule calculation**: Corrected day-of-week calculation bug in weekly backup scheduler
  - Fixed mismatch between app's day-of-week numbering (Sunday=0) and Python's weekday() numbering (Monday=0)
  - Weekly backups now correctly calculate the next scheduled date
  - Example: If today is Sunday and schedule is set to Monday, next backup correctly shows Monday (not Tuesday)

### Version Update
- Updated version number to 0.2.13 across application, website, README.md, and PRD.md

---

## Version 0.2.12

### Backup Audit Log Feature
- **Comprehensive audit logging**: New Backup Audit Log section tracks all backup-related operations
  - Logs manual backups (started, completed, error)
  - Logs scheduled backups (started, completed, error)
  - Logs restore operations (started, completed, error)
  - Logs lifecycle cleanup operations
  - Logs backup deletion operations (individual and bulk)
  - All logs include timestamps, container info, backup filenames, status, and error messages

- **Audit Log UI**:
  - New "Backup Audit Log" menu item in sidebar
  - Filterable table with operation type and status filters
  - Statistics cards showing total logs, last 24 hours, and last 7 days activity
  - Pagination support with "Load More" button
  - Clear Logs button with confirmation modal to permanently remove all audit logs
  - Clean, organized display of all backup-related activities

- **Database storage**: Audit logs stored in SQLite database (`audit_log.db`) in config directory
  - Efficient querying with indexed fields (timestamp, operation_type, container_id, status)
  - Persistent storage across container restarts
  - Automatic database and table creation on first run

- **Integration**: Audit logging automatically integrated into all backup operations
  - No manual intervention required
  - Logs created automatically for all backup, restore, cleanup, and deletion operations
  - Error tracking for failed operations

### UI Improvements
- **Reduced sidebar spacing**: Menu items now have reduced spacing (50% less) to fit all items without scrollbar
- **Audit log layout**: Statistics panels displayed in single row, filters and refresh button aligned horizontally
- **Menu item renamed**: "Audit Log" renamed to "Backup Audit Log" for clarity

### Backup Scheduler Improvements
- **Real-time auto-save**: Scheduler configuration now saves automatically as users make changes
  - Removed "Save Schedule" button - changes are saved automatically 500ms after last change
  - Removed "Test Scheduler" button - scheduled backups run automatically based on configuration
  - All scheduler settings (schedule type, hour, day of week, lifecycle, container selections) auto-save in real-time
  - Debounced save prevents excessive API calls (500ms delay after last change)
  - Container checkboxes automatically checked when loading scheduler page if they're in the schedule
  - Silent save operation - no status messages, just seamless background saving

- **Improved scheduler UX**:
  - Scheduler configuration loads before container list to ensure checkboxes are properly checked
  - Auto-save prevents accidental loss of configuration changes
  - Streamlined interface with fewer buttons for cleaner UI

- **Enhanced dashboard schedule panel**: Dashboard Backup Schedule panel now shows detailed information
  - Displays scheduled containers count on first line
  - Shows "Scheduled Containers" label on second line
  - Displays next run date/time with clock icon on third line (format: DD-MM-YYYY HH:MM)
  - Shows "No schedule configured" when no schedule is set
  - Next run time updates automatically when dashboard stats refresh

### Bug Fixes
- **Fixed images table layout**: Fixed issue where "In use by" text for images was appearing on its own grid row
  - Added `vertical-align: top` to image table cells for proper multi-line content alignment
  - "In use by" text now displays correctly within the same cell as image name

- **Fixed "In use by" display**: "In use by" text now shows for all images including the app's own image
  - Removed condition that prevented showing "In use by" for self images
  - Users can now see which containers are using the container_monkey image

- **Improved cleanup dangling images button**: Cleanup Dangling Images button now automatically disables when there are no dangling images
  - Button state updates automatically when images are loaded
  - Prevents unnecessary cleanup attempts when no dangling images exist
  - Button re-enables automatically if dangling images appear

### Network Management Improvements
- **Enhanced network container counting**: Network container count now includes ALL containers (running and stopped)
  - Backend now inspects all containers to accurately count network usage
  - Container count reflects total containers using each network regardless of state
  - More accurate representation of network dependencies

- **Improved network remove protection**: Remove button automatically disabled/ghosted when networks have containers
  - Remove button shows disabled state (opacity 0.5, cursor not-allowed) when container count > 0
  - Prevents accidental removal of networks in use
  - Tooltip shows container count when button is disabled

- **View Containers button**: Added "View Containers" button for networks with containers
  - Button appears automatically when network has containers (count > 0)
  - Clicking button filters container view to show only containers using that network
  - Seamless navigation from network to filtered container view
  - Clear filter button appears to restore full container list

### UI/UX Improvements
- **Exec console auto-focus**: Terminal window automatically receives focus when exec console opens
  - Users can start typing immediately without clicking on the terminal
  - Improved workflow for interactive container console access

- **Container ID display**: Container IDs in all grids now prefixed with "ID: " for clarity
  - Applied to containers grid, statistics grid, and scheduler containers grid
  - Makes container IDs easier to identify at a glance

- **Consistent grid text colors**: Image and created date columns use consistent grey color
  - Matches styling used in other grids throughout the application
  - Improved visual consistency across all grid views

- **Statistics grid color improvements**: Statistics grid now uses consistent color scheme
  - Container names displayed in white for better visibility
  - All other columns (Image, CPU, RAM, Network I/O, Block I/O) use grey text
  - Improved readability and visual hierarchy

### Technical Changes
- Added `audit_log_manager.py` module for audit log management
- Updated `backup_manager.py` to log manual and scheduled backup operations
- Updated `scheduler_manager.py` to log lifecycle cleanup operations
- Updated `restore_manager.py` to log restore operations
- Updated `backup_file_manager.py` to log backup deletion operations
- Added API endpoints: `/api/audit-logs`, `/api/audit-logs/statistics`, and `/api/audit-logs/clear`
- Added `clear_all_logs()` method to `audit_log_manager.py` for clearing all audit logs
- Updated CSS for reduced sidebar spacing and improved audit log layout
- Updated JavaScript for audit log display, filtering, and clear functionality
- Updated `static/js/app.js`:
  - Added `autoSaveSchedulerConfig()` function with debouncing (500ms delay)
  - Modified `saveSchedulerConfig()` to support silent saves
  - Updated `loadSchedulerConfig()` to call `loadSchedulerContainers()` after config loads
  - Added `schedulerLoadingConfig` flag to prevent auto-save during initial load
  - Removed `testScheduler()`, `updateSchedulerTestProgress()`, and `closeSchedulerTestModal()` functions
  - Updated `createImageRow()` to show "In use by" for all images and fixed cell alignment
  - Added auto-save triggers to all scheduler form controls and container checkboxes
  - Updated `loadImages()` to detect dangling images and enable/disable cleanup button accordingly
  - Added safety check in `cleanupDanglingImages()` to prevent execution when button is disabled
  - Updated `createNetworkRow()` to use container count for all containers (running and stopped)
  - Modified remove button styling to show disabled state when containers > 0
  - Added "View Containers" button that appears when container count > 0
  - Improved `viewNetworkContainers()` function to ensure containers are loaded before filtering
  - Updated `loadDashboardStats()` to format and display scheduler next run date/time with clock icon
  - Added `term.focus()` to `openAttachConsole()` to auto-focus terminal window
  - Updated container ID displays in all grids to include "ID: " prefix
  - Changed image and created column colors to use `var(--text-secondary)` for consistency
  - Updated `createStatisticsRow()` to use white for container names and grey for all other columns
- Updated `templates/index.html`:
  - Removed "Test Scheduler" and "Save Schedule" buttons from scheduler header
  - Added `onchange` and `oninput` handlers to scheduler form controls for auto-save
  - Removed scheduler test modal (no longer needed)
  - Added `id="cleanup-dangling-images-btn"` to cleanup dangling images button for state management
  - Updated Backup Schedule dashboard panel to show "Scheduled Containers" label and next run date/time
  - Added `id="scheduler-next-run-dashboard"` for dynamic next run time updates
- Updated `app.py`:
  - Added `scheduler_next_run` to dashboard stats API endpoint and initial page render
  - Dashboard now includes next scheduled backup time from scheduler config
- Updated `network_manager.py`:
  - Modified `list_networks()` to count ALL containers (running and stopped) for each network
  - Added logic to inspect all containers and build network-to-container mapping
  - Network container count now accurately reflects total containers using each network
- Updated `static/css/style.css`:
  - No CSS changes required

### Version Update
- Updated version number to 0.2.12 across application, website, README.md, and PRD.md

---

## Version 0.2.11

### UI/Design Improvements
- **Unified button styling across entire application**:
  - Updated all buttons to use consistent outline style matching GitHub button design
  - Changed all button backgrounds to transparent with subtle overlay (`rgba(255, 255, 255, 0.03)`)
  - Applied consistent border styling using `var(--border)` across all buttons
  - Added backdrop blur effect for glass morphism look on all buttons
  - Updated border radius from pill-shaped (999px) to rounded corners (8px) for consistency
  - Standardized hover effects across all button variants (background lightens, border color changes)
  - "Buy me a Coffee" button now matches GitHub button style (previously had blue-purple gradient)
  - Changed coffee button icon to filled variant (`ph-fill ph-coffee`)

- **Added GitHub button to sidebar**:
  - Added GitHub link button below "Buy me a Coffee" button in sidebar footer
  - Styled with outline button design matching website's GitHub button
  - Uses filled GitHub logo icon (`ph-fill ph-github-logo`)

- **Enhanced top bar branding**:
  - Added tagline "Secure Your Docker Environment" below logo in top bar
  - Tagline text aligned with "Container Monkey" text (excluding icon)
  - "Docker Environment" text styled with logo blue color (#38bdf8) for visual consistency
  - Matches website hero tagline styling

- **Updated favicon to match logo**:
  - Updated favicon design to match logo with filled faces
  - Left face: Blue fill (#38bdf8) with blue stroke outline
  - Top and right faces: Black fill with blue stroke outline
  - Maintains blue stroke outlines on all faces for consistency
  - Updated in both website and app templates

- **Improved sidebar navigation**:
  - Reduced gap between menu items by 50% (from 4px to 2px) for more compact layout

- **Enhanced dashboard**:
  - Added new "Backup Schedule" panel showing total quantity of containers included in backup schedule
  - Panel displays scheduled containers count with clock icon
  - Clicking panel navigates to Backup Scheduler section

### Technical Changes
- Updated `templates/index.html`:
  - Updated "Buy me a Coffee" button icon to `ph-fill ph-coffee`
  - Added GitHub button link in sidebar footer
  - Added Backup Schedule dashboard panel
  - Added tagline "Secure Your Docker Environment" to top bar
  - Updated favicon SVG to match logo with filled faces and blue outlines
- Updated `static/css/style.css`:
  - Updated `.coffee-link` styles to match GitHub button's outline design (removed gradient, added transparent background)
  - Added `.github-link` styles matching website's `.btn-outline` design
  - Reduced `.nav-item` margin from 4px to 2px
  - Updated all button variants (`.btn-primary`, `.btn-success`, `.btn-secondary`, `.btn-danger`, `.btn-warning`) to use outline style matching GitHub button
  - Changed `.btn` border-radius from 999px to 8px for consistent corner radius
  - Applied transparent background with backdrop blur to all buttons including coffee button
  - Added `--gradient-primary` CSS variable for gradient effects
  - Added `.text-gradient` class for gradient text styling
  - Added `.top-bar-title-wrapper` and `.top-bar-tagline` styles for tagline layout
  - Added `.tagline-accent` class for blue accent color matching logo
- Updated `website/index.html`:
  - Updated favicon SVG to match logo with filled faces and blue outlines
- Updated `app.py`:
  - Added `scheduled_containers_qty` to dashboard stats API endpoint
  - Added scheduled containers count to initial page render
- Updated `static/js/app.js`:
  - Updated `loadDashboardStats()` to display scheduled containers count
  - Adjusted card count check to accommodate new Backup Schedule panel

### Version Update
- Updated version number to 0.2.11 across application, website, README.md, and PRD.md

---

## Version 0.2.10

### UI/Design Improvements
- **Updated logo and branding to match website**:
  - Changed top bar icon from `ph ph-cube` to `ph-fill ph-cube` to match website styling
  - Updated icon color to blue (#38bdf8) matching website primary color
  - Removed gradient styling from logo text (now plain white text like website)
  - Adjusted logo sizing and spacing to match website proportions
  - Updated favicon color from black to blue (#38bdf8) to match website

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
- **Fixed scheduler error when removing scheduled containers**: Resolved issue where removing a container that was part of scheduled tasks caused "Error loading containers" on scheduler page
  - Added automatic removal of removed containers from scheduler's selected containers list
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
  - Remove container endpoint now calls scheduler cleanup to remove containers from scheduled tasks
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
  - Manual backups: Never auto-removed, preserved indefinitely
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

