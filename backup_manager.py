"""
Backup Manager Module
Handles all container backup operations with queue support
"""
import json
import os
import tempfile
import subprocess
import threading
import uuid
import tarfile
from datetime import datetime
from queue import Queue
from typing import Dict, Optional, Callable


class BackupManager:
    """Manages container backups with queue support"""
    
    def __init__(self, docker_api_client, backup_dir: str, app_container_name: str, app_volume_name: str,
                 reconstruct_docker_run_command_fn: Callable, generate_docker_compose_fn: Callable):
        """
        Initialize BackupManager
        
        Args:
            docker_api_client: Docker API client instance
            backup_dir: Directory to store backups
            app_container_name: Name of the app container (to skip in backups)
            app_volume_name: Name of the app volume (to skip in backups)
            reconstruct_docker_run_command_fn: Function to reconstruct docker run command
            generate_docker_compose_fn: Function to generate docker-compose yaml
        """
        self.docker_api_client = docker_api_client
        # Backup files go in backups/ subdirectory
        self.backup_dir = os.path.join(backup_dir, 'backups')
        os.makedirs(self.backup_dir, exist_ok=True)
        self.app_container_name = app_container_name
        self.app_volume_name = app_volume_name
        self.reconstruct_docker_run_command = reconstruct_docker_run_command_fn
        self.generate_docker_compose = generate_docker_compose_fn
        
        # Progress tracking
        self.backup_progress: Dict[str, Dict] = {}
        self.backup_lock = threading.Lock()
        self.current_backup_info: Dict = {}
        
        # Queue for backup all operations
        self.backup_queue = Queue()
        self.queue_processor_thread: Optional[threading.Thread] = None
        self.queue_processing = False
        self.queue_lock = threading.Lock()
    
    def start_queue_processor(self):
        """Start the queue processor thread if not already running"""
        with self.queue_lock:
            if not self.queue_processing:
                self.queue_processing = True
                self.queue_processor_thread = threading.Thread(
                    target=self._process_backup_queue,
                    daemon=True
                )
                self.queue_processor_thread.start()
                print(f"🔄 Queue processor thread started (thread: {self.queue_processor_thread.name})")
            else:
                # Check if thread is still alive
                if self.queue_processor_thread and not self.queue_processor_thread.is_alive():
                    print(f"⚠️  Queue processor thread died, restarting...")
                    self.queue_processing = True
                    self.queue_processor_thread = threading.Thread(
                        target=self._process_backup_queue,
                        daemon=True
                    )
                    self.queue_processor_thread.start()
                    print(f"🔄 Queue processor thread restarted (thread: {self.queue_processor_thread.name})")
                else:
                    print(f"ℹ️  Queue processor already running")
    
    def stop_queue_processor(self):
        """Stop the queue processor thread"""
        with self.queue_lock:
            self.queue_processing = False
    
    def _process_backup_queue(self):
        """Process backup queue sequentially"""
        print("🔄 Queue processor started")
        from queue import Empty
        iteration = 0
        while self.queue_processing:
            iteration += 1
            queue_size = self.backup_queue.qsize()
            if iteration % 10 == 0:
                print(f"🔄 Queue processor still running (iteration {iteration}, queue size: {queue_size})")
            elif queue_size > 0:
                print(f"📊 Queue has {queue_size} item(s) waiting")
            try:
                # Get next item from queue (blocking with timeout)
                try:
                    queue_item = self.backup_queue.get(timeout=1)
                    # Handle both old format (container_id, progress_id) and new format (container_id, progress_id, is_scheduled)
                    if len(queue_item) == 2:
                        container_id, progress_id = queue_item
                        is_scheduled = False
                    else:
                        container_id, progress_id, is_scheduled = queue_item
                    print(f"📦 Got queued backup from queue: {container_id[:12]}... (progress_id: {progress_id[:8]}, scheduled: {is_scheduled})")
                except Empty:
                    # Timeout - queue is empty, continue loop
                    continue
                except Exception as e:
                    # Unexpected exception
                    print(f"⚠️  Queue get exception: {type(e).__name__}: {e}")
                    import traceback
                    traceback.print_exc()
                    continue
                
                # Update status to indicate we're waiting for lock
                if progress_id in self.backup_progress:
                    self.backup_progress[progress_id]['status'] = 'waiting'
                    self.backup_progress[progress_id]['step'] = 'Waiting for previous backup to complete...'
                
                # Try to acquire lock (blocking - wait for current backup to finish)
                # This will block until the previous backup completes and releases the lock
                print(f"🔒 Acquiring lock for backup {container_id[:12]}...")
                self.backup_lock.acquire()
                print(f"✅ Lock acquired for backup {container_id[:12]}")
                
                try:
                    # Update status to indicate we're starting
                    if progress_id in self.backup_progress:
                        self.backup_progress[progress_id]['status'] = 'starting'
                        self.backup_progress[progress_id]['step'] = 'Starting backup...'
                    
                    # Update current backup info
                    inspect_data = self.docker_api_client.inspect_container(container_id)
                    container_name = inspect_data.get('Name', '').lstrip('/')
                    self.current_backup_info.update({
                        'container_id': container_id,
                        'container_name': container_name,
                        'progress_id': progress_id,
                        'start_time': datetime.now().isoformat()
                    })
                    
                    # Get is_scheduled from progress tracking
                    is_scheduled = self.backup_progress.get(progress_id, {}).get('is_scheduled', False)
                    
                    # Process the backup (don't release lock - we'll do it here)
                    print(f"🚀 Starting backup for {container_name} (scheduled: {is_scheduled})")
                    self._backup_container_background(progress_id, container_id, release_lock=False, is_scheduled=is_scheduled)
                    print(f"✅ Backup completed for {container_name}")
                finally:
                    # Release lock and clear info - this allows next backup in queue to proceed
                    if self.backup_lock.locked():
                        print(f"🔓 Releasing lock, ready for next backup")
                        self.backup_lock.release()
                    else:
                        print(f"⚠️  Lock was not held when trying to release")
                    self.current_backup_info.clear()
                    print(f"✅ Queue processor ready for next backup")
                
                # Mark task as done
                self.backup_queue.task_done()
                
            except Exception as e:
                print(f"❌ Error processing backup queue: {e}")
                import traceback
                traceback.print_exc()
                # Ensure lock is released on error
                if self.backup_lock.locked():
                    self.backup_lock.release()
                    print(f"🔓 Lock released after error")
                # Mark task as done even on error
                try:
                    self.backup_queue.task_done()
                except:
                    pass
    
    def queue_backup(self, container_id: str, is_scheduled: bool = False) -> str:
        """
        Queue a backup operation
        
        Args:
            container_id: Container ID to backup
            is_scheduled: Whether this is a scheduled backup
            
        Returns:
            progress_id: Progress tracking ID
        """
        progress_id = str(uuid.uuid4())
        
        # Initialize progress tracking
        self.backup_progress[progress_id] = {
            'status': 'queued',
            'step': 'Waiting in queue...',
            'progress': 0,
            'total_steps': 6,
            'current_step': 0,
            'container_id': container_id,
            'error': None,
            'is_scheduled': is_scheduled
        }
        
        # Add to queue (include is_scheduled)
        print(f"📥 Adding backup to queue: {container_id[:12]}... (progress_id: {progress_id[:8]}, scheduled: {is_scheduled})")
        self.backup_queue.put((container_id, progress_id, is_scheduled))
        queue_size = self.backup_queue.qsize()
        print(f"📊 Queue size after adding: {queue_size}")
        
        # Start queue processor if not running
        self.start_queue_processor()
        
        # Verify queue processor is running
        if self.queue_processor_thread and not self.queue_processor_thread.is_alive():
            print(f"⚠️  Queue processor thread is not alive, restarting...")
            self.queue_processing = False
            self.start_queue_processor()
        
        return progress_id
    
    def start_backup(self, container_id: str, queue_if_busy: bool = False, is_scheduled: bool = False) -> Dict:
        """
        Start a backup operation (immediate or optionally queued)
        
        Args:
            container_id: Container ID to backup
            queue_if_busy: If True, queue the backup when lock is held. If False, raise exception.
            is_scheduled: If True, tag this backup as scheduled (for lifecycle management)
            
        Returns:
            Dict with success status and progress_id
            
        Raises:
            Exception: If backup cannot start and queue_if_busy is False
        """
        if not self.docker_api_client:
            raise Exception('Docker client not available')
        
        # Try to acquire lock (non-blocking)
        if not self.backup_lock.acquire(blocking=False):
            # If lock is held
            if queue_if_busy:
                # Queue the backup
                progress_id = self.queue_backup(container_id, is_scheduled=is_scheduled)
                status = self.get_status()
                return {
                    'success': True,
                    'message': 'Backup queued',
                    'progress_id': progress_id,
                    'queued': True,
                    'current_backup': status.get('current_backup', 'Unknown')
                }
            else:
                # Return busy status (caller should handle 409 response)
                status = self.get_status()
                raise Exception(f'A backup is already in progress: {status.get("current_backup", "Unknown")}')
        
        try:
            # Inspect container
            inspect_data = self.docker_api_client.inspect_container(container_id)
            container_name = inspect_data.get('Name', '').lstrip('/')
            
            if container_name == self.app_container_name:
                self.backup_lock.release()
                raise Exception(f'Cannot backup {self.app_container_name} - skipping self')
            
            # Create progress tracking
            progress_id = str(uuid.uuid4())
            self.backup_progress[progress_id] = {
                'status': 'starting',
                'step': 'Starting backup...',
                'progress': 0,
                'total_steps': 6,
                'current_step': 0,
                'container_id': container_id,
                'error': None,
                'is_scheduled': is_scheduled
            }
            
            self.current_backup_info.update({
                'container_id': container_id,
                'container_name': container_name,
                'progress_id': progress_id,
                'start_time': datetime.now().isoformat()
            })
            
            # Start backup in background thread
            thread = threading.Thread(
                target=self._backup_container_background,
                args=(progress_id, container_id, True, is_scheduled)
            )
            thread.daemon = True
            thread.start()
            
            # Ensure queue processor is running (in case backups get queued later)
            self.start_queue_processor()
            
            return {
                'success': True,
                'message': 'Backup started',
                'progress_id': progress_id,
                'queued': False
            }
            
        except Exception as e:
            self.backup_lock.release()
            self.current_backup_info.clear()
            raise
    
    def get_progress(self, progress_id: str) -> Optional[Dict]:
        """Get backup progress"""
        if progress_id not in self.backup_progress:
            return None
        
        progress = self.backup_progress[progress_id]
        return {
            'status': progress['status'],
            'step': progress['step'],
            'current_step': progress['current_step'],
            'total_steps': progress['total_steps'],
            'progress': int((progress['current_step'] / progress['total_steps']) * 100),
            'error': progress.get('error'),
            'backup_filename': progress.get('backup_filename')
        }
    
    def get_status(self) -> Dict:
        """Get backup system status"""
        if self.backup_lock.locked():
            return {
                'status': 'busy',
                'current_backup': self.current_backup_info.get('container_name', 'Unknown'),
                'progress_id': self.current_backup_info.get('progress_id'),
                'queue_size': self.backup_queue.qsize()
            }
        return {
            'status': 'idle',
            'queue_size': self.backup_queue.qsize()
        }
    
    def _backup_container_background(self, progress_id: str, container_id: str, release_lock: bool = True, is_scheduled: bool = False):
        """
        Background thread function to create backup with progress updates
        Only marks complete once tar.gz streaming is fully finished
        
        Args:
            progress_id: Progress tracking ID
            container_id: Container ID to backup
            release_lock: Whether to release the lock when done (False when called from queue processor)
            is_scheduled: Whether this is a scheduled backup (affects filename prefix and metadata)
        """
        try:
            self.backup_progress[progress_id]['status'] = 'running'
            self.backup_progress[progress_id]['step'] = 'Inspecting container...'
            self.backup_progress[progress_id]['current_step'] = 1
            
            # Get container details
            inspect_data = self.docker_api_client.inspect_container(container_id)
            container_name_raw = inspect_data.get('Name', container_id).lstrip('/')
            container_name = container_name_raw.replace('/', '_')
            
            # Skip backing up self
            if container_name_raw == self.app_container_name:
                self.backup_progress[progress_id]['status'] = 'error'
                self.backup_progress[progress_id]['error'] = f'Cannot backup {self.app_container_name} - skipping self'
                self.backup_progress[progress_id]['step'] = f'Skipped: {self.app_container_name}'
                return
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            # Prefix scheduled backups with "scheduled_" to distinguish from manual backups
            prefix = "scheduled_" if is_scheduled else ""
            backup_filename = f"{prefix}{container_name}_{timestamp}.tar.gz"
            backup_path = os.path.join(self.backup_dir, backup_filename)
            self.backup_progress[progress_id]['backup_filename'] = backup_filename
            
            self.backup_progress[progress_id]['step'] = 'Saving container configuration...'
            self.backup_progress[progress_id]['current_step'] = 2
            
            # Create temporary directory for backup contents
            with tempfile.TemporaryDirectory() as temp_dir:
                # Save container configuration
                config_file = os.path.join(temp_dir, 'container_config.json')
                with open(config_file, 'w') as f:
                    json.dump(inspect_data, f, indent=2)
                
                # Save docker run command reconstruction
                run_command_file = os.path.join(temp_dir, 'docker_run_command.txt')
                run_command = self.reconstruct_docker_run_command(inspect_data)
                with open(run_command_file, 'w') as f:
                    f.write(run_command)
                
                # Save docker-compose equivalent
                compose_file = os.path.join(temp_dir, 'docker-compose.yml')
                compose_yaml = self.generate_docker_compose(inspect_data)
                with open(compose_file, 'w') as f:
                    f.write(compose_yaml)
                
                # Export container image
                self.backup_progress[progress_id]['step'] = 'Exporting container image...'
                self.backup_progress[progress_id]['current_step'] = 3
                image_file = os.path.join(temp_dir, 'image.tar')
                image_name = 'unknown'
                try:
                    # Get image name/tag from container config
                    config = inspect_data.get('Config', {}) or {}
                    image_name = config.get('Image', '')
                    if not image_name:
                        # Fallback: try to get from Image field
                        image_name = inspect_data.get('Image', '')
                    
                    if image_name and image_name != 'unknown':
                        print(f"Exporting image: {image_name}")
                        self.docker_api_client.export_image_stream(image_name, image_file)
                        
                        # Verify image file was created and has content
                        if os.path.exists(image_file) and os.path.getsize(image_file) > 0:
                            print(f"✅ Image exported successfully: {image_name} ({os.path.getsize(image_file)} bytes)")
                        else:
                            raise Exception("Image file is empty or was not created")
                    else:
                        raise Exception(f"Could not determine image name for container")
                except Exception as e:
                    print(f"⚠️  Warning: Could not export image '{image_name}': {e}")
                    import traceback
                    traceback.print_exc()
                    # Create a placeholder file with error info
                    with open(image_file, 'wb') as f:
                        error_msg = f"# Image export failed for '{image_name}': {e}\n".encode()
                        f.write(error_msg)
                
                # Backup volumes if any (including full data)
                self.backup_progress[progress_id]['step'] = 'Preparing volume backups...'
                self.backup_progress[progress_id]['current_step'] = 4
                volumes_dir = os.path.join(temp_dir, 'volumes')
                os.makedirs(volumes_dir, exist_ok=True)
                
                mounts = inspect_data.get('Mounts')
                if not mounts:
                    mounts = []
                if not isinstance(mounts, list):
                    mounts = []
                
                # Get original mount specifications from HostConfig.Binds
                host_config = inspect_data.get('HostConfig', {}) or {}
                binds = host_config.get('Binds', []) or []
                bind_map = {}  # Map volume name to original destination path
                for bind in binds:
                    if bind and ':' in bind:
                        parts = bind.split(':')
                        if len(parts) >= 2:
                            volume_name = parts[0]
                            destination = parts[1]
                            bind_map[volume_name] = destination
                
                volume_info = []
                volume_count = 0
                # Calculate total volumes excluding self
                total_volumes = len([m for m in mounts if m and isinstance(m, dict) and m.get('Type') == 'volume' and m.get('Name', '') != self.app_volume_name])
                for mount in mounts:
                    if not mount or not isinstance(mount, dict):
                        continue
                    if mount.get('Type') == 'volume':
                        volume_name = mount.get('Name', '')
                        # Skip self volume
                        if volume_name == self.app_volume_name:
                            continue  # Skip self volume
                        # Use original destination from Binds if available, otherwise fall back to Mounts
                        volume_dest = bind_map.get(volume_name, mount.get('Destination', ''))
                        volume_info.append({
                            'name': volume_name,
                            'destination': volume_dest,
                            'driver': mount.get('Driver', ''),
                            'type': 'volume',
                        })
                        
                        # Backup volume metadata
                        try:
                            vol_meta_file = os.path.join(volumes_dir, f"{volume_name}_metadata.json")
                            with open(vol_meta_file, 'w') as f:
                                json.dump({
                                    'name': volume_name,
                                    'destination': volume_dest,
                                    'driver': mount.get('Driver', ''),
                                    'options': mount.get('Options', {}) or {},
                                }, f, indent=2)
                        except Exception as e:
                            print(f"Warning: Could not backup volume metadata {volume_name}: {e}")
                        
                        # Backup volume DATA (full contents)
                        try:
                            volume_count += 1
                            self.backup_progress[progress_id]['step'] = f'Backing up volume {volume_count}/{total_volumes}: {volume_name}...'
                            vol_data_file = os.path.join(volumes_dir, f"{volume_name}_data.tar.gz")
                            print(f"Backing up volume data: {volume_name} -> {vol_data_file}")
                            self.docker_api_client.backup_volume_data(volume_name, vol_data_file)
                            print(f"✅ Volume data backed up: {volume_name}")
                        except Exception as e:
                            print(f"⚠️  Warning: Could not backup volume data {volume_name}: {e}")
                            # Create placeholder file
                            with open(vol_data_file, 'w') as f:
                                f.write(f"# Volume data backup failed: {e}\n")
                    
                    elif mount.get('Type') == 'bind':
                        # For bind mounts, backup the actual directory contents
                        bind_source = mount.get('Source', '')
                        bind_dest = mount.get('Destination', '')
                        volume_info.append({
                            'type': 'bind',
                            'source': bind_source,
                            'destination': bind_dest,
                        })
                        
                        # Backup bind mount directory if it exists
                        if bind_source and os.path.exists(bind_source):
                            try:
                                bind_backup_file = os.path.join(volumes_dir, f"bind_{os.path.basename(bind_source)}_data.tar.gz")
                                print(f"Backing up bind mount: {bind_source} -> {bind_backup_file}")
                                
                                # Create tar.gz of the bind mount directory
                                result = subprocess.run(
                                    ['tar', '-czf', bind_backup_file, '-C', os.path.dirname(bind_source), os.path.basename(bind_source)],
                                    capture_output=True,
                                    text=True,
                                    timeout=300
                                )
                                
                                if result.returncode != 0:
                                    raise Exception(f"tar failed: {result.stderr}")
                                
                                print(f"✅ Bind mount backed up: {bind_source}")
                            except Exception as e:
                                print(f"⚠️  Warning: Could not backup bind mount {bind_source}: {e}")
                                # Save metadata at least
                                bind_meta_file = os.path.join(volumes_dir, f"bind_{os.path.basename(bind_source)}_metadata.json")
                                with open(bind_meta_file, 'w') as f:
                                    json.dump({
                                        'type': 'bind',
                                        'source': bind_source,
                                        'destination': bind_dest,
                                        'backup_failed': str(e),
                                    }, f, indent=2)
                
                volumes_info_file = os.path.join(temp_dir, 'volumes_info.json')
                with open(volumes_info_file, 'w') as f:
                    json.dump(volume_info, f, indent=2)
                
                # Create backup metadata
                config = inspect_data.get('Config', {}) or {}
                image_name = config.get('Image', 'unknown')
                if not image_name or image_name == 'unknown':
                    image_name = inspect_data.get('Image', 'unknown')
                
                metadata = {
                    'container_id': inspect_data.get('Id', container_id),
                    'container_name': inspect_data.get('Name', '').lstrip('/'),
                    'backup_date': datetime.now().isoformat(),
                    'backup_type': 'scheduled' if is_scheduled else 'manual',
                    'image': image_name,
                    'image_backed_up': os.path.exists(image_file) and os.path.getsize(image_file) > 100,
                    'status': 'running' if inspect_data.get('State', {}).get('Running') else 'stopped',
                }
                metadata_file = os.path.join(temp_dir, 'backup_metadata.json')
                with open(metadata_file, 'w') as f:
                    json.dump(metadata, f, indent=2)
                
                # Create tar.gz file - ensure it's fully written before marking complete
                self.backup_progress[progress_id]['step'] = 'Creating tar.gz file...'
                self.backup_progress[progress_id]['current_step'] = 5
                print(f"Creating tar.gz file: {backup_path}")
                
                # Create tar.gz and ensure it's fully written
                tar_thread_complete = threading.Event()
                tar_thread_error = [None]
                
                def create_tar():
                    """Create tar.gz in a separate thread to track completion"""
                    try:
                        with tarfile.open(backup_path, 'w:gz') as tar:
                            tar.add(temp_dir, arcname=os.path.basename('.'))
                        
                        # Ensure file is flushed and closed
                        # The 'with' statement should handle this, but we verify
                        if os.path.exists(backup_path):
                            # Verify file is complete by checking it can be opened
                            with tarfile.open(backup_path, 'r:gz') as verify_tar:
                                verify_tar.getmembers()  # This will fail if tar is incomplete
                            
                            print(f"✅ tar.gz file created successfully: {backup_path} ({os.path.getsize(backup_path)} bytes)")
                        else:
                            raise Exception("Tar file was not created")
                        
                        tar_thread_complete.set()
                    except Exception as e:
                        tar_thread_error[0] = e
                        tar_thread_complete.set()
                
                # Start tar creation thread
                tar_thread = threading.Thread(target=create_tar, daemon=True)
                tar_thread.start()
                
                # Wait for tar thread to complete (with timeout)
                if not tar_thread_complete.wait(timeout=600):  # 10 minute timeout
                    raise Exception("Tar.gz creation timed out")
                
                # Check for errors
                if tar_thread_error[0]:
                    raise tar_thread_error[0]
            
            # Only mark complete after tar.gz is fully written
            self.backup_progress[progress_id]['status'] = 'complete'
            self.backup_progress[progress_id]['step'] = 'Backup completed!'
            self.backup_progress[progress_id]['current_step'] = 6
            print(f"✅ Backup completed: {backup_filename}")
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            self.backup_progress[progress_id]['status'] = 'error'
            self.backup_progress[progress_id]['error'] = str(e)
            print(f"❌ Backup failed: {e}")
        finally:
            # Release lock and clear current backup info
            # This allows the next item in queue to proceed
            # Only release if we're responsible for the lock (not when called from queue processor)
            if release_lock:
                if self.backup_lock.locked():
                    print(f"🔓 Releasing lock after backup completion/failure")
                    self.backup_lock.release()
                else:
                    print(f"⚠️  Lock was not held when trying to release")
            else:
                print(f"ℹ️  Lock will be released by queue processor")
            # Only clear current_backup_info if we're releasing the lock
            if release_lock:
                self.current_backup_info.clear()
