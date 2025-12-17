// Shared state object for all modules
// This ensures global variables are accessible across modules
window.AppState = {
    // Authentication state
    isAuthenticated: false,
    currentUsername: '',
    
    // Statistics state
    statisticsAbortController: null,
    statisticsPollInterval: null,
    statisticsRefreshTimeInterval: null,
    lastStatisticsCacheTimestamp: null,
    
    // Container state
    currentContainerId: null,
    containerMetadata: new Map(),
    isLoadingContainers: false,
    containersData: [],
    currentSortColumn: null,
    currentSortDirection: 'asc',
    
    // Backup state
    isBackupInProgress: false,
    backupAllCancelled: false,
    backupAllInProgress: false,
    allBackups: [],
    currentBackupSortColumn: null,
    currentBackupSortDirection: 'asc',
    
    // Volume state
    allVolumes: [],
    currentVolumeSortColumn: null,
    currentVolumeSortDirection: 'asc',
    currentVolumeName: null,
    currentVolumePath: '/',
    
    // Image state
    allImages: [],
    currentImageSortColumn: null,
    currentImageSortDirection: 'asc',
    
    // Network state
    allNetworks: [],
    currentNetworkSortColumn: null,
    currentNetworkSortDirection: 'asc',
    
    // Stack state
    allStacks: [],
    currentStackSortColumn: null,
    currentStackSortDirection: 'asc',
    selectedStacks: new Set(),
    isFilteredByStack: false,
    currentStackFilter: null,
    
    // Events state
    allEvents: [],
    currentEventsSortColumn: null,
    currentEventsSortDirection: 'desc',
    
    // Audit log state
    auditLogCurrentPage: 1,
    auditLogTotalPages: 1,
    auditLogTotal: 0,
    auditLogLimit: 10,
    auditLogSearchTimeout: null,
    
    // Upload state
    uploadCancelled: false,
    currentUploadXHR: null,
    
    // Restore state
    currentRestoreFilename: null,
    currentRestorePreview: null,
    
    // Download state
    downloadCancelled: false,
    currentDownloadAbortController: null,
    
    // Logs state
    currentLogsContainerId: null,
    logsAutoRefreshInterval: null,
    logsLastContent: '',
    logsIsScrolledToBottom: true,
    logsScrollTrackingSetup: false,
    
    // Console state
    term: null,
    fitAddon: null,
    containerCwd: {},
    
    // System stats state
    systemStatsInterval: null,
    systemStatsCache: null,
    consecutiveSystemStatsErrors: 0,
    
    // Storage settings
    currentStorageSettings: null,
    
    // Scheduler state
    schedulerConfig: null,
    schedulerLoadingConfig: false,
    schedulerAutoSaveTimer: null,
    
    // UI state
    clickBlockedCount: 0,
    lastClickTime: 0
};

