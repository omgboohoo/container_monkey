# Release Notes - Version 0.2.2

## Bug Fixes
- **Fixed CPU/RAM stats display**: Stats were showing "--" in top bar and containers screen
  - Fixed async initialization issue where stats polling started before authentication completed
  - Improved error handling for stats API calls
  - Stats now properly wait for authentication before polling begins

- **Fixed recursive function call bug**: Fixed `check_environment` route handler that was calling itself recursively
  - Renamed imported function to `check_environment_helper` to avoid naming conflict

## Version Update
- Updated version number to 0.2.2 across application and website

