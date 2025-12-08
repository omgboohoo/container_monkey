"""
Scheduler Manager Module
Handles scheduled backup operations with simple single-schedule approach
"""
import json
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any


class SchedulerManager:
    """Manages scheduled backups with a single schedule configuration"""
    
    def __init__(self, backup_manager, backup_dir: str, db_path: str, audit_log_manager=None):
        """
        Initialize SchedulerManager
        
        Args:
            backup_manager: BackupManager instance
            backup_dir: Directory where backups are stored
            db_path: Path to unified database (monkey.db)
            audit_log_manager: Optional AuditLogManager instance for logging
        """
        self.backup_manager = backup_manager
        self.backup_dir = backup_dir
        self.db_path = db_path
        self.audit_log_manager = audit_log_manager
        
        # Schedule configuration
        self.schedule_type = 'daily'  # 'daily' or 'weekly'
        self.hour = 2  # 0-23
        self.day_of_week = 0  # 0-6 (Sunday=0), only used for weekly
        self.lifecycle = 7  # Number of scheduled backups to keep
        self.selected_containers = []  # List of container IDs
        
        # Scheduler state
        self.scheduler_thread: Optional[threading.Thread] = None
        self.scheduler_running = False
        self.last_run: Optional[datetime] = None
        self.next_run: Optional[datetime] = None
        
        # Load configuration from database
        self.load_config()
    
    def load_config(self):
        """Load scheduler configuration from database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get the most recent schedule (should only be one, but get latest just in case)
            cursor.execute('''
                SELECT schedule_type, hour, day_of_week, lifecycle, selected_containers, last_run, next_run
                FROM backup_schedules
                ORDER BY updated_at DESC
                LIMIT 1
            ''')
            
            row = cursor.fetchone()
            conn.close()
            
            if row:
                schedule_type, hour, day_of_week, lifecycle, selected_containers_json, last_run, next_run = row
                self.schedule_type = schedule_type or 'daily'
                self.hour = hour or 2
                self.day_of_week = day_of_week
                self.lifecycle = lifecycle or 7
                self.selected_containers = json.loads(selected_containers_json) if selected_containers_json else []
                
                if last_run:
                    try:
                        self.last_run = datetime.fromisoformat(last_run) if isinstance(last_run, str) else last_run
                    except:
                        self.last_run = None
                
                if next_run:
                    try:
                        self.next_run = datetime.fromisoformat(next_run) if isinstance(next_run, str) else next_run
                    except:
                        self.next_run = None
                
                print(f"✅ Loaded scheduler config: {self.schedule_type} at {self.hour:02d}:00, {len(self.selected_containers)} containers")
            else:
                # No config in database, use defaults and save them
                print("ℹ️  No scheduler config found in database, using defaults")
                self.save_config()
        except Exception as e:
            print(f"⚠️  Error loading scheduler config: {e}")
    
    def save_config(self):
        """Save scheduler configuration to database"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if a schedule already exists
            cursor.execute('SELECT COUNT(*) FROM backup_schedules')
            exists = cursor.fetchone()[0] > 0
            
            selected_containers_json = json.dumps(self.selected_containers)
            
            if exists:
                # Update existing schedule
                cursor.execute('''
                    UPDATE backup_schedules
                    SET schedule_type = ?, hour = ?, day_of_week = ?, lifecycle = ?,
                        selected_containers = ?, last_run = ?, next_run = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = (SELECT id FROM backup_schedules ORDER BY updated_at DESC LIMIT 1)
                ''', (
                    self.schedule_type,
                    self.hour,
                    self.day_of_week,
                    self.lifecycle,
                    selected_containers_json,
                    self.last_run.isoformat() if self.last_run else None,
                    self.next_run.isoformat() if self.next_run else None
                ))
            else:
                # Insert new schedule
                cursor.execute('''
                    INSERT INTO backup_schedules 
                    (schedule_type, hour, day_of_week, lifecycle, selected_containers, last_run, next_run)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                ''', (
                    self.schedule_type,
                    self.hour,
                    self.day_of_week,
                    self.lifecycle,
                    selected_containers_json,
                    self.last_run.isoformat() if self.last_run else None,
                    self.next_run.isoformat() if self.next_run else None
                ))
            
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"⚠️  Error saving scheduler config: {e}")
    
    def update_config(self, schedule_type: str, hour: int, day_of_week: Optional[int], lifecycle: int, selected_containers: List[str]):
        """
        Update scheduler configuration
        
        Args:
            schedule_type: 'daily' or 'weekly'
            hour: Hour of day (0-23)
            day_of_week: Day of week (0-6, Sunday=0), None for daily
            lifecycle: Number of scheduled backups to keep
            selected_containers: List of container IDs to backup
        """
        self.schedule_type = schedule_type
        self.hour = hour
        self.day_of_week = day_of_week if schedule_type == 'weekly' else None
        self.lifecycle = lifecycle
        self.selected_containers = selected_containers
        self.calculate_next_run()
        self.save_config()
        
        # Stop scheduler if it was running (to restart with new config)
        if self.scheduler_running:
            self.stop_scheduler()
        
        # Start scheduler if containers are selected (regardless of previous state)
        if self.is_enabled():
            self.start_scheduler()
    
    def calculate_next_run(self):
        """Calculate next scheduled run time"""
        now = datetime.now()
        
        if self.schedule_type == 'daily':
            # Next run is today at specified hour, or tomorrow if hour has passed
            next_run = now.replace(hour=self.hour, minute=0, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            print(f"📅 Calculated next run: {next_run.strftime('%d-%m-%Y %H:%M:%S')} (current: {now.strftime('%d-%m-%Y %H:%M:%S')}, hour: {self.hour:02d}:00)")
        else:  # weekly
            # Find next occurrence of specified day and hour
            # Convert app's day_of_week (Sunday=0) to Python's weekday (Monday=0)
            # App: Sunday=0, Monday=1, ..., Saturday=6
            # Python: Monday=0, Tuesday=1, ..., Sunday=6
            # Conversion: python_weekday = (app_day_of_week + 6) % 7
            target_weekday = (self.day_of_week + 6) % 7
            days_ahead = (target_weekday - now.weekday()) % 7
            if days_ahead == 0:
                # Today is the scheduled day, check if hour has passed
                next_run = now.replace(hour=self.hour, minute=0, second=0, microsecond=0)
                if next_run <= now:
                    days_ahead = 7
            if days_ahead > 0:
                next_run = now + timedelta(days=days_ahead)
                next_run = next_run.replace(hour=self.hour, minute=0, second=0, microsecond=0)
            else:
                next_run = now.replace(hour=self.hour, minute=0, second=0, microsecond=0)
        
        self.next_run = next_run
        self.save_config()
        return next_run
    
    def is_enabled(self) -> bool:
        """Check if scheduler is enabled (has selected containers)"""
        return len(self.selected_containers) > 0
    
    def get_config(self, validate_containers: bool = False, existing_container_ids: Optional[List[str]] = None) -> Dict[str, Any]:
        """
        Get current scheduler configuration
        
        Args:
            validate_containers: If True, filter out non-existent containers
            existing_container_ids: List of existing container IDs for validation
        """
        selected_containers = self.selected_containers
        
        # Validate and filter out non-existent containers if requested
        if validate_containers and existing_container_ids is not None:
            original_count = len(selected_containers)
            selected_containers = [cid for cid in selected_containers if cid in existing_container_ids]
            if len(selected_containers) < original_count:
                removed_count = original_count - len(selected_containers)
                print(f"🧹 Removed {removed_count} non-existent container(s) from scheduler config")
                self.selected_containers = selected_containers
                self.save_config()
                # Recalculate next run if scheduler is still enabled
                if self.is_enabled():
                    self.calculate_next_run()
                # Stop scheduler if no containers left
                elif self.scheduler_running:
                    self.stop_scheduler()
        
        return {
            'schedule_type': self.schedule_type,
            'hour': self.hour,
            'day_of_week': self.day_of_week,
            'lifecycle': self.lifecycle,
            'selected_containers': selected_containers,
            'enabled': self.is_enabled(),
            'last_run': self.last_run.isoformat() if self.last_run else None,
            'next_run': self.next_run.isoformat() if self.next_run else None
        }
    
    def start_scheduler(self):
        """Start the scheduler thread"""
        if not self.is_enabled():
            print("ℹ️  Scheduler disabled (no containers selected)")
            return
        
        if self.scheduler_running:
            # Check if thread is still alive
            if self.scheduler_thread and self.scheduler_thread.is_alive():
                print("ℹ️  Scheduler already running")
                return
            else:
                print("⚠️  Scheduler flag is True but thread is dead, restarting...")
                self.scheduler_running = False
        
        # Ensure next_run is calculated
        if not self.next_run:
            self.calculate_next_run()
        
        self.scheduler_running = True
        self.scheduler_thread = threading.Thread(target=self._scheduler_loop, daemon=True)
        self.scheduler_thread.start()
        print(f"✅ Scheduler started: {self.schedule_type} at {self.hour:02d}:00, {len(self.selected_containers)} containers")
        print(f"   Next run scheduled for: {self.next_run.strftime('%d-%m-%Y %H:%M:%S') if self.next_run else 'Not calculated'}")
    
    def stop_scheduler(self):
        """Stop the scheduler thread"""
        if not self.scheduler_running:
            return
        
        self.scheduler_running = False
        if self.scheduler_thread:
            self.scheduler_thread.join(timeout=2)
        print("🛑 Scheduler stopped")
    
    def _scheduler_loop(self):
        """Main scheduler loop - checks every minute if backup is due"""
        print("🔄 Scheduler loop started")
        
        while self.scheduler_running:
            try:
                if not self.is_enabled():
                    time.sleep(60)
                    continue
                
                now = datetime.now()
                
                # Debug logging every 5 minutes to verify scheduler is running
                if now.minute % 5 == 0 and now.second < 5:
                    print(f"🕐 Scheduler check: Current time: {now.strftime('%d-%m-%Y %H:%M:%S')}, Next run: {self.next_run.strftime('%d-%m-%Y %H:%M:%S') if self.next_run else 'None'}")
                
                # Check if it's time to run backups
                if self.next_run and now >= self.next_run:
                    print(f"⏰ Scheduled backup time reached: {now.strftime('%d-%m-%Y %H:%M:%S')}")
                    print(f"   Next run was: {self.next_run.strftime('%d-%m-%Y %H:%M:%S')}")
                    self._run_scheduled_backups()
                    self.last_run = now
                    self.calculate_next_run()
                    print(f"📅 Next scheduled backup: {self.next_run.strftime('%d-%m-%Y %H:%M:%S')}")
                elif self.next_run and now < self.next_run:
                    # Log when we're waiting (only occasionally to avoid spam)
                    time_until = (self.next_run - now).total_seconds()
                    if time_until < 300:  # Log when less than 5 minutes away
                        print(f"⏳ Waiting for scheduled backup: {time_until/60:.1f} minutes until {self.next_run.strftime('%d-%m-%Y %H:%M:%S')}")
                
                # Sleep for 1 minute
                time.sleep(60)
            except Exception as e:
                print(f"❌ Error in scheduler loop: {e}")
                import traceback
                traceback.print_exc()
                time.sleep(60)
    
    def _run_scheduled_backups(self):
        """Run backups for all selected containers"""
        print(f"🚀 Starting scheduled backups for {len(self.selected_containers)} containers")
        
        # Track progress IDs for this scheduled backup run
        scheduled_progress_ids = []
        
        for container_id in self.selected_containers:
            try:
                print(f"📦 Queuing scheduled backup for container {container_id[:12]}...")
                # Use queue_if_busy=True to queue if manual backup is running
                result = self.backup_manager.start_backup(container_id, queue_if_busy=True, is_scheduled=True)
                progress_id = result.get('progress_id')
                if progress_id:
                    scheduled_progress_ids.append(progress_id)
                    print(f"   Progress ID: {progress_id[:8]}...")
            except Exception as e:
                print(f"❌ Error queuing scheduled backup for {container_id[:12]}: {e}")
        
        # Monitor backups and cleanup when all complete
        if scheduled_progress_ids:
            threading.Thread(
                target=self._monitor_and_cleanup,
                args=(scheduled_progress_ids,),
                daemon=True
            ).start()
        else:
            print("⚠️  No scheduled backups were queued, skipping cleanup")
    
    def _monitor_and_cleanup(self, progress_ids):
        """Monitor scheduled backups and cleanup when all complete"""
        print(f"👀 Monitoring {len(progress_ids)} scheduled backups for completion...")
        
        max_wait_time = 3600  # Maximum 1 hour wait time
        check_interval = 5  # Check every 5 seconds
        start_time = time.time()
        
        # Check every 5 seconds until all backups complete
        while True:
            # Check for timeout
            if time.time() - start_time > max_wait_time:
                print(f"⏰ Timeout waiting for scheduled backups to complete (waited {max_wait_time}s)")
                print("🧹 Running lifecycle cleanup anyway...")
                self.cleanup_old_backups()
                break
            
            completed_count = 0
            error_count = 0
            
            for progress_id in progress_ids:
                try:
                    progress = self.backup_manager.get_progress(progress_id)
                    if not progress:
                        # Progress not found, assume completed/cleaned up
                        completed_count += 1
                        continue
                    
                    status = progress.get('status', '')
                    if status == 'complete':
                        completed_count += 1
                    elif status == 'error':
                        error_count += 1
                        completed_count += 1  # Count errors as "done" for cleanup purposes
                except Exception as e:
                    print(f"⚠️  Error checking progress for {progress_id[:8]}...: {e}")
                    # If we can't check progress, assume it's done to avoid infinite loop
                    completed_count += 1
            
            # If all backups are done (complete or error), run cleanup
            if completed_count >= len(progress_ids):
                print(f"✅ All scheduled backups completed ({completed_count - error_count} successful, {error_count} errors)")
                print("🧹 Running lifecycle cleanup...")
                self.cleanup_old_backups()
                break
            
            # Wait before checking again
            time.sleep(check_interval)
    
    def remove_container(self, container_id: str):
        """Remove a container from selected containers list"""
        if container_id in self.selected_containers:
            self.selected_containers.remove(container_id)
            self.save_config()
            print(f"🗑️  Removed container {container_id[:12]} from scheduler")
            
            # If no containers left, stop scheduler
            if not self.is_enabled() and self.scheduler_running:
                self.stop_scheduler()
                print("🛑 Scheduler stopped (no containers selected)")
            
            # Recalculate next run if scheduler is still enabled
            if self.is_enabled():
                self.calculate_next_run()
    
    def cleanup_old_backups(self):
        """Cleanup old scheduled backups based on lifecycle"""
        try:
            # Scheduled backups are in backups/ subdirectory
            backups_dir = os.path.join(self.backup_dir, 'backups')
            if not os.path.exists(backups_dir):
                print("ℹ️  Backup directory does not exist, skipping cleanup")
                return
            
            scheduled_backups = []
            for filename in os.listdir(backups_dir):
                if filename.startswith('scheduled_') and filename.endswith('.tar.gz'):
                    file_path = os.path.join(backups_dir, filename)
                    if os.path.isfile(file_path):
                        stat = os.stat(file_path)
                        scheduled_backups.append({
                            'filename': filename,
                            'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'file_path': file_path
                        })
            
            # Group scheduled backups by container
            container_backups = {}
            for backup in scheduled_backups:
                filename = backup['filename']
                # Extract container name from filename (remove scheduled_ prefix and timestamp)
                # Format: scheduled_container-name_YYYYMMDD_HHMMSS.tar.gz
                if filename.startswith('scheduled_'):
                    parts = filename.replace('scheduled_', '').replace('.tar.gz', '').rsplit('_', 2)
                    if len(parts) >= 2:
                        container_name = '_'.join(parts[:-2])  # Everything except last 2 parts (timestamp)
                        if container_name not in container_backups:
                            container_backups[container_name] = []
                        container_backups[container_name].append({
                            'filename': filename,
                            'created': backup['created'],
                            'file_path': backup['file_path']
                        })
            
            # Cleanup backups for each container
            deleted_count = 0
            deleted_backups = []
            for container_name, container_backup_list in container_backups.items():
                # Sort by created date (newest first)
                container_backup_list.sort(key=lambda x: x['created'], reverse=True)
                
                # Keep only lifecycle number of backups
                if len(container_backup_list) > self.lifecycle:
                    backups_to_delete = container_backup_list[self.lifecycle:]
                    for backup_to_delete in backups_to_delete:
                        try:
                            file_path = backup_to_delete['file_path']
                            if os.path.exists(file_path):
                                os.remove(file_path)
                                deleted_count += 1
                                deleted_backups.append(backup_to_delete['filename'])
                                print(f"🗑️  Deleted old scheduled backup: {backup_to_delete['filename']}")
                        except Exception as e:
                            print(f"⚠️  Error deleting backup {backup_to_delete['filename']}: {e}")
            
            # Log cleanup operation
            if self.audit_log_manager and deleted_count > 0:
                self.audit_log_manager.log_event(
                    operation_type='cleanup',
                    status='completed',
                    details={
                        'deleted_count': deleted_count,
                        'lifecycle': self.lifecycle,
                        'deleted_backups': deleted_backups
                    }
                )
            
            if deleted_count > 0:
                print(f"✅ Cleanup complete: Deleted {deleted_count} old scheduled backups")
            else:
                print(f"ℹ️  No old scheduled backups to cleanup")
        except Exception as e:
            print(f"❌ Error during cleanup: {e}")
            import traceback
            traceback.print_exc()

