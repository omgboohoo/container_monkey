# Release Notes

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
  - `S3StorageManager` module for S3 operations (upload, download, list, delete, test)
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
- Updated `backup_file_manager.py` to list/download/delete from S3 when enabled
- Updated `restore_manager.py` to handle S3 backups via temp file downloads
- Updated `network_manager.py` to support S3 storage for network backups
- Added storage settings API endpoints: `/api/storage/settings` (GET/POST), `/api/storage/test-s3`
- Added `storage_settings` table to database schema
- Temp directory (`/backups/temp/`) for S3 downloads during restore operations
- Automatic cleanup of temp files after restore and on startup
- **Delete All** functionality now deletes backups from both S3 and local storage
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
- **Fixed delete all with S3**: Delete All button now correctly deletes backups from S3 storage
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
  - Clear Logs button with confirmation modal to permanently delete all audit logs
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
  - Users can now see which containers are using the container-monkey image

- **Improved cleanup dangling images button**: Cleanup Dangling Images button now automatically disables when there are no dangling images
  - Button state updates automatically when images are loaded
  - Prevents unnecessary cleanup attempts when no dangling images exist
  - Button re-enables automatically if dangling images appear

### Network Management Improvements
- **Enhanced network container counting**: Network container count now includes ALL containers (running and stopped)
  - Backend now inspects all containers to accurately count network usage
  - Container count reflects total containers using each network regardless of state
  - More accurate representation of network dependencies

- **Improved network delete protection**: Delete button automatically disabled/ghosted when networks have containers
  - Delete button shows disabled state (opacity 0.5, cursor not-allowed) when container count > 0
  - Prevents accidental deletion of networks in use
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
  - Modified delete button styling to show disabled state when containers > 0
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

