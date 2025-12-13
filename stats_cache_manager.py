"""
Stats Cache Manager
Handles background caching and incremental updates of container statistics
"""
import threading
import time
from typing import Dict, Any, Optional, Callable, List
from datetime import datetime
from system_manager import get_statistics
from error_utils import safe_log_error


class StatsCacheManager:
    """Manages caching of statistics with background refresh"""
    
    def __init__(self, refresh_interval_seconds: int = 300):  # 5 minutes default
        """
        Initialize stats cache manager
        
        Args:
            refresh_interval_seconds: How often to refresh stats in background (default 300 = 5 minutes)
        """
        self.refresh_interval = refresh_interval_seconds
        self.cached_stats: Optional[Dict[str, Any]] = None
        self.cache_timestamp: Optional[datetime] = None
        self.is_refreshing = False
        self.refresh_lock = threading.Lock()
        self.background_thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.update_callbacks: List[Callable[[Dict[str, Any]], None]] = []
        
        # Start background refresh thread
        self.start_background_refresh()
    
    def start_background_refresh(self):
        """Start the background thread that refreshes stats periodically"""
        if self.background_thread and self.background_thread.is_alive():
            return
        
        self.stop_event.clear()
        self.background_thread = threading.Thread(
            target=self._background_refresh_loop,
            daemon=True,
            name="StatsCacheRefresh"
        )
        self.background_thread.start()
        print("✅ Stats cache background refresh started")
    
    def stop_background_refresh(self):
        """Stop the background refresh thread"""
        self.stop_event.set()
        if self.background_thread:
            self.background_thread.join(timeout=2)
    
    def _background_refresh_loop(self):
        """Background loop that refreshes stats periodically"""
        try:
            # Do initial refresh immediately
            self._refresh_stats()
            
            # Then refresh every interval
            while not self.stop_event.is_set():
                self.stop_event.wait(self.refresh_interval)
                if not self.stop_event.is_set():
                    self._refresh_stats()
        except Exception as e:
            print(f"Error in stats cache background thread: {e}")
            safe_log_error(e, context="stats_cache_background_thread")
            # Thread crashed - try to restart it after a delay
            import threading
            def restart_thread():
                time.sleep(10)  # Wait 10 seconds before restarting
                if not self.stop_event.is_set():
                    print("🔄 Restarting stats cache background thread...")
                    self.start_background_refresh()
            restart_thread_obj = threading.Thread(target=restart_thread, daemon=True, name="StatsCacheRestart")
            restart_thread_obj.start()
    
    def _refresh_stats(self):
        """Internal method to refresh stats (thread-safe)"""
        with self.refresh_lock:
            if self.is_refreshing:
                return  # Already refreshing
            
            self.is_refreshing = True
        
        try:
            # Get fresh stats
            stats = get_statistics()
            
            # Only cache if stats don't contain an error
            # If there's an error, keep the old cache (if any) so we don't lose good data
            if stats and 'error' not in stats:
                # Update cache
                with self.refresh_lock:
                    self.cached_stats = stats
                    self.cache_timestamp = datetime.now()
                    self.is_refreshing = False
                
                # Notify callbacks of update
                for callback in self.update_callbacks:
                    try:
                        callback(stats)
                    except Exception as e:
                        print(f"Warning: Stats update callback failed: {e}")
            else:
                # Error in stats - log it but don't update cache
                error_msg = stats.get('error', 'Unknown error') if stats else 'No stats returned'
                print(f"Warning: Stats refresh returned error, keeping existing cache: {error_msg}")
                with self.refresh_lock:
                    self.is_refreshing = False
            
        except Exception as e:
            print(f"Error refreshing stats cache: {e}")
            safe_log_error(e, context="stats_cache_refresh")
            with self.refresh_lock:
                self.is_refreshing = False
    
    def get_cached_stats(self) -> Optional[Dict[str, Any]]:
        """Get cached statistics (returns None if not yet cached)"""
        with self.refresh_lock:
            if self.cached_stats:
                # Return a copy to avoid external modifications
                return self.cached_stats.copy()
            return None
    
    def get_cache_timestamp(self) -> Optional[datetime]:
        """Get timestamp of when cache was last updated"""
        with self.refresh_lock:
            return self.cache_timestamp
    
    def trigger_refresh(self) -> bool:
        """
        Trigger a refresh of stats in background
        
        Returns:
            True if refresh was started, False if already refreshing
        """
        with self.refresh_lock:
            if self.is_refreshing:
                return False
        
        # Start refresh in background thread
        refresh_thread = threading.Thread(
            target=self._refresh_stats,
            daemon=True,
            name="StatsCacheManualRefresh"
        )
        refresh_thread.start()
        return True
    
    def register_update_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Register a callback to be called when stats are updated"""
        self.update_callbacks.append(callback)
    
    def unregister_update_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Unregister an update callback"""
        if callback in self.update_callbacks:
            self.update_callbacks.remove(callback)

