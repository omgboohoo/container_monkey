"""
Backup File Manager Module
Handles backup file operations (list, download, delete, upload, preview)
"""
import os
import json
import uuid
import shutil
import tarfile
import tempfile
import threading
import subprocess
from datetime import datetime
from typing import Dict, List, Any, Optional
from werkzeug.utils import secure_filename


class BackupFileManager:
    """Manages backup file operations"""
    
    def __init__(self, backup_dir: str, audit_log_manager=None, storage_settings_manager=None):
        """
        Initialize BackupFileManager
        
        Args:
            backup_dir: Base directory (backups go in backups/ subdirectory)
            audit_log_manager: Optional AuditLogManager instance for logging
            storage_settings_manager: Optional StorageSettingsManager instance for S3 storage
        """
        # Backup files go in backups/ subdirectory
        self.backup_dir = os.path.join(backup_dir, 'backups')
        os.makedirs(self.backup_dir, exist_ok=True)
        # Temp directory for S3 downloads (outside backups directory)
        self.temp_dir = os.path.join(backup_dir, 'temp')
        os.makedirs(self.temp_dir, exist_ok=True)
        self.download_all_progress = {}
        self.audit_log_manager = audit_log_manager
        self.storage_settings_manager = storage_settings_manager
    
    def list_backups(self) -> Dict[str, Any]:
        """List all available backups (containers and networks)"""
        try:
            backups = []
            
            # Check if S3 storage is enabled
            use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
            
            if use_s3:
                # List backups from S3
                try:
                    from s3_storage_manager import S3StorageManager
                    settings = self.storage_settings_manager.get_settings()
                    s3_manager = S3StorageManager(
                        bucket_name=settings['s3_bucket'],
                        region=settings['s3_region'],
                        access_key=settings['s3_access_key'],
                        secret_key=settings['s3_secret_key']
                    )
                    s3_result = s3_manager.list_files()
                    if s3_result.get('success'):
                        for file_info in s3_result.get('files', []):
                            filename = file_info['key']
                            if filename.endswith(('.zip', '.tar.gz')):
                                backup_type = 'scheduled' if filename.startswith('scheduled_') else 'manual'
                                backups.append({
                                    'filename': filename,
                                    'size': file_info['size'],
                                    'created': file_info['last_modified'],
                                    'type': 'container',
                                    'backup_type': backup_type,
                                    'storage_location': 's3'
                                })
                            elif filename.startswith('network_') and filename.endswith('.json'):
                                backups.append({
                                    'filename': filename,
                                    'size': file_info['size'],
                                    'created': file_info['last_modified'],
                                    'type': 'network',
                                    'backup_type': 'manual',
                                    'storage_location': 's3'
                                })
                except Exception as e:
                    print(f"⚠️  Error listing S3 backups: {e}")
                    # Fall through to local listing if S3 fails
            
            # Also list local backups (for migration or fallback)
            if os.path.exists(self.backup_dir):
                for filename in os.listdir(self.backup_dir):
                    file_path = os.path.join(self.backup_dir, filename)
                    if not os.path.isfile(file_path):
                        continue
                    
                    # Skip if already in backups list from S3
                    if any(b['filename'] == filename for b in backups):
                        continue
                    
                    stat = os.stat(file_path)
                    
                    if filename.endswith(('.zip', '.tar.gz')):
                        backup_type = 'scheduled' if filename.startswith('scheduled_') else 'manual'
                        backups.append({
                            'filename': filename,
                            'size': stat.st_size,
                            'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'type': 'container',
                            'backup_type': backup_type,
                            'storage_location': 'local'
                        })
                    elif filename.startswith('network_') and filename.endswith('.json'):
                        backups.append({
                            'filename': filename,
                            'size': stat.st_size,
                            'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'type': 'network',
                            'backup_type': 'manual',
                            'storage_location': 'local'
                        })
            
            backups.sort(key=lambda x: x['created'], reverse=True)
            return {'backups': backups}
        except Exception as e:
            return {'error': str(e)}
    
    def get_backup_path(self, filename: str) -> Optional[str]:
        """Get full path to a backup file (downloads from S3 if needed)"""
        filename = os.path.basename(filename)
        
        # Check if S3 storage is enabled
        use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
        
        if use_s3:
            # Check S3 first
            try:
                from s3_storage_manager import S3StorageManager
                settings = self.storage_settings_manager.get_settings()
                s3_manager = S3StorageManager(
                    bucket_name=settings['s3_bucket'],
                    region=settings['s3_region'],
                    access_key=settings['s3_access_key'],
                    secret_key=settings['s3_secret_key']
                )
                if s3_manager.file_exists(filename):
                    # Download to temp directory (outside backups directory)
                    temp_path = os.path.join(self.temp_dir, filename)
                    # Ensure directory exists
                    os.makedirs(os.path.dirname(temp_path), exist_ok=True)
                    print(f"📥 Downloading {filename} from S3 to {temp_path}")
                    download_result = s3_manager.download_file(filename, temp_path)
                    if download_result.get('success'):
                        if os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
                            print(f"✅ Successfully downloaded {filename} from S3 ({os.path.getsize(temp_path)} bytes)")
                            return temp_path
                        else:
                            print(f"⚠️  Download reported success but file not found or empty: {temp_path}")
                    else:
                        print(f"⚠️  S3 download failed: {download_result.get('error', 'Unknown error')}")
                else:
                    print(f"ℹ️  File {filename} not found in S3, checking local storage")
            except Exception as e:
                print(f"⚠️  Error downloading from S3: {e}")
                import traceback
                traceback.print_exc()
        
        # Fall back to local
        file_path = os.path.join(self.backup_dir, filename)
        if os.path.exists(file_path):
            return file_path
        return None
    
    def delete_backup(self, filename: str, user: Optional[str] = None) -> Dict[str, Any]:
        """Delete a backup file"""
        filename = os.path.basename(filename)
        
        # Check if S3 storage is enabled
        use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
        
        deleted = False
        
        if use_s3:
            # Delete from S3
            try:
                from s3_storage_manager import S3StorageManager
                settings = self.storage_settings_manager.get_settings()
                s3_manager = S3StorageManager(
                    bucket_name=settings['s3_bucket'],
                    region=settings['s3_region'],
                    access_key=settings['s3_access_key'],
                    secret_key=settings['s3_secret_key']
                )
                if s3_manager.file_exists(filename):
                    delete_result = s3_manager.delete_file(filename)
                    if delete_result.get('success'):
                        deleted = True
            except Exception as e:
                print(f"⚠️  Error deleting from S3: {e}")
        
        # Also try local deletion
        file_path = os.path.join(self.backup_dir, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                deleted = True
            except Exception as e:
                if not deleted:
                    return {'error': f'Failed to delete backup: {str(e)}'}
        
        if not deleted:
            return {'error': 'Backup file not found'}
        
        # Log backup deletion
        try:
            if self.audit_log_manager:
                self.audit_log_manager.log_event(
                    operation_type='delete_backup',
                    status='completed',
                    backup_filename=filename,
                    user=user
                )
        except Exception as e:
            print(f"⚠️  Error logging backup deletion: {e}")
        
        return {'success': True, 'message': 'Backup deleted'}
    
    def delete_all_backups(self, user: Optional[str] = None) -> Dict[str, Any]:
        """Delete all backup files (from both S3 and local storage)"""
        try:
            deleted_count = 0
            deleted_files = []
            
            # Check if S3 storage is enabled
            use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
            
            if use_s3:
                # Delete all backups from S3
                try:
                    from s3_storage_manager import S3StorageManager
                    settings = self.storage_settings_manager.get_settings()
                    s3_manager = S3StorageManager(
                        bucket_name=settings['s3_bucket'],
                        region=settings['s3_region'],
                        access_key=settings['s3_access_key'],
                        secret_key=settings['s3_secret_key']
                    )
                    
                    # List all files from S3
                    list_result = s3_manager.list_files()
                    if list_result.get('success'):
                        s3_files = list_result.get('files', [])
                        for file_info in s3_files:
                            filename = file_info.get('key', '')  # Use 'key' not 'name'
                            # Only delete backup files (tar.gz, zip, network JSON)
                            if filename.endswith(('.tar.gz', '.zip')) or (filename.startswith('network_') and filename.endswith('.json')):
                                try:
                                    delete_result = s3_manager.delete_file(filename)
                                    if delete_result.get('success'):
                                        deleted_count += 1
                                        deleted_files.append(filename)
                                        print(f"✅ Deleted {filename} from S3")
                                    else:
                                        print(f"⚠️  Failed to delete {filename} from S3: {delete_result.get('error', 'Unknown error')}")
                                except Exception as e:
                                    print(f"⚠️  Error deleting {filename} from S3: {e}")
                                    import traceback
                                    traceback.print_exc()
                    else:
                        print(f"⚠️  Error listing S3 files: {list_result.get('error', 'Unknown error')}")
                except Exception as e:
                    print(f"⚠️  Error deleting from S3: {e}")
                    import traceback
                    traceback.print_exc()
            
            # Also delete local backups
            if os.path.exists(self.backup_dir):
                for filename in os.listdir(self.backup_dir):
                    file_path = os.path.join(self.backup_dir, filename)
                    if os.path.isfile(file_path):
                        if filename.endswith(('.tar.gz', '.zip')) or (filename.startswith('network_') and filename.endswith('.json')):
                            try:
                                os.remove(file_path)
                                # Only count if not already counted from S3
                                if filename not in deleted_files:
                                    deleted_count += 1
                                    deleted_files.append(filename)
                            except Exception as e:
                                print(f"⚠️  Error deleting local file {filename}: {e}")
            
            # Log deletion of all backups
            if self.audit_log_manager and deleted_count > 0:
                self.audit_log_manager.log_event(
                    operation_type='delete_backup',
                    status='completed',
                    user=user,
                    details={'deleted_count': deleted_count, 'deleted_files': deleted_files, 'all': True}
                )
            
            if deleted_count == 0:
                return {'success': True, 'message': 'No backups found to delete', 'deleted_count': 0}
            
            return {
                'success': True,
                'message': f'Deleted {deleted_count} backup(s)',
                'deleted_count': deleted_count
            }
        except Exception as e:
            if self.audit_log_manager:
                self.audit_log_manager.log_event(
                    operation_type='delete_backup',
                    status='error',
                    error_message=str(e),
                    user=user,
                    details={'all': True}
                )
            return {'error': str(e)}
    
    def upload_backup(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """Upload a backup file"""
        try:
            if not filename.endswith('.tar.gz'):
                return {'error': 'Only .tar.gz files are allowed'}
            
            filename = secure_filename(filename)
            
            # Verify it's a valid backup first
            import io
            try:
                with tarfile.open(fileobj=io.BytesIO(file_content), mode='r:gz') as tar:
                    try:
                        metadata_file = tar.getmember('./backup_metadata.json')
                        metadata_str = tar.extractfile(metadata_file).read().decode('utf-8')
                        metadata = json.loads(metadata_str)
                    except KeyError:
                        return {'error': 'Invalid backup file: missing metadata'}
            except tarfile.TarError:
                return {'error': 'Invalid tar.gz file'}
            except Exception as e:
                return {'error': f'Error processing backup: {str(e)}'}
            
            # Check if S3 storage is enabled
            use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
            
            if use_s3:
                # Upload to S3
                try:
                    from s3_storage_manager import S3StorageManager
                    settings = self.storage_settings_manager.get_settings()
                    s3_manager = S3StorageManager(
                        bucket_name=settings['s3_bucket'],
                        region=settings['s3_region'],
                        access_key=settings['s3_access_key'],
                        secret_key=settings['s3_secret_key']
                    )
                    upload_result = s3_manager.upload_fileobj(io.BytesIO(file_content), filename)
                    if not upload_result.get('success'):
                        return {'error': f'S3 upload failed: {upload_result.get("error", "Unknown error")}'}
                    
                    return {
                        'success': True,
                        'filename': filename,
                        'metadata': metadata,
                        'message': 'Backup uploaded to S3 successfully'
                    }
                except Exception as e:
                    return {'error': f'S3 upload error: {str(e)}'}
            else:
                # Save locally
                file_path = os.path.join(self.backup_dir, filename)
                with open(file_path, 'wb') as f:
                    f.write(file_content)
                
                return {
                    'success': True,
                    'filename': filename,
                    'metadata': metadata,
                    'message': 'Backup uploaded successfully'
                }
        except Exception as e:
            return {'error': str(e)}
    
    def preview_backup(self, filename: str) -> Dict[str, Any]:
        """Get backup details (ports, volumes) before restore"""
        filename = os.path.basename(filename)
        file_path = os.path.join(self.backup_dir, filename)
        
        if not os.path.exists(file_path):
            return {'error': 'Backup file not found'}
        
        try:
            with tarfile.open(file_path, 'r:gz') as tar:
                # Read container config
                try:
                    config_file = tar.getmember('./container_config.json')
                except KeyError:
                    return {'error': 'Invalid backup: missing container config'}
                
                config_str = tar.extractfile(config_file).read().decode('utf-8')
                inspect_data = json.loads(config_str)
                
                # Extract port mappings
                port_mappings = []
                host_config = inspect_data.get('HostConfig', {}) or {}
                port_bindings = host_config.get('PortBindings', {}) or {}
                
                if port_bindings and isinstance(port_bindings, dict):
                    for container_port, host_bindings in port_bindings.items():
                        if host_bindings and isinstance(host_bindings, list) and len(host_bindings) > 0:
                            host_port = host_bindings[0].get('HostPort', '') if isinstance(host_bindings[0], dict) else ''
                            if host_port:
                                port_mappings.append({
                                    'container_port': container_port,
                                    'host_port': host_port
                                })
                
                # Extract volume info
                volumes_info = []
                existing_volumes = []
                
                try:
                    volumes_info_file = tar.getmember('./volumes_info.json')
                    volumes_info_str = tar.extractfile(volumes_info_file).read().decode('utf-8')
                    volumes_info_data = json.loads(volumes_info_str)
                    
                    for vol_info in volumes_info_data:
                        if vol_info.get('type') == 'volume':
                            vol_name = vol_info.get('name', '')
                            volumes_info.append({
                                'name': vol_name,
                                'destination': vol_info.get('destination', '')
                            })
                            
                            # Check if volume exists
                            vol_check = subprocess.run(['docker', 'volume', 'inspect', vol_name],
                                                     capture_output=True, text=True, timeout=5)
                            if vol_check.returncode == 0:
                                existing_volumes.append(vol_name)
                except KeyError:
                    # volumes_info.json is not in the archive
                    volumes_info = []
            
            return {
                'port_mappings': port_mappings,
                'volumes': volumes_info,
                'existing_volumes': existing_volumes
            }
        except Exception as e:
            return {'error': str(e)}
    
    def cleanup_old_download_sessions(self):
        """Clean up old download sessions that are older than 1 hour"""
        try:
            current_time = datetime.now()
            sessions_to_remove = []
            
            for session_id, progress in list(self.download_all_progress.items()):
                created_at_str = progress.get('created_at')
                if created_at_str:
                    try:
                        created_at = datetime.fromisoformat(created_at_str)
                        age = (current_time - created_at).total_seconds()
                        if age > 3600:
                            sessions_to_remove.append(session_id)
                    except (ValueError, TypeError):
                        sessions_to_remove.append(session_id)
            
            for session_id in sessions_to_remove:
                progress = self.download_all_progress[session_id]
                temp_dir = progress.get('temp_dir')
                if temp_dir and os.path.exists(temp_dir):
                    try:
                        shutil.rmtree(temp_dir)
                        print(f"🧹 Cleaned up old session temp dir: {temp_dir}")
                    except Exception as e:
                        print(f"⚠️ Error cleaning old temp dir {temp_dir}: {e}")
                del self.download_all_progress[session_id]
        except Exception as e:
            print(f"⚠️ Error in cleanup_old_download_sessions: {e}")
    
    def cleanup_old_temp_files(self, max_age_hours: int = 24):
        """Clean up old temp files from S3 downloads that are older than specified hours"""
        try:
            if not os.path.exists(self.temp_dir):
                return
            
            current_time = datetime.now()
            cleaned_count = 0
            
            for filename in os.listdir(self.temp_dir):
                file_path = os.path.join(self.temp_dir, filename)
                if not os.path.isfile(file_path):
                    continue
                
                try:
                    stat = os.stat(file_path)
                    file_age = (current_time - datetime.fromtimestamp(stat.st_mtime)).total_seconds()
                    age_hours = file_age / 3600
                    
                    if age_hours > max_age_hours:
                        os.remove(file_path)
                        cleaned_count += 1
                        print(f"🧹 Cleaned up old temp file: {filename} (age: {age_hours:.1f} hours)")
                except Exception as e:
                    print(f"⚠️ Error cleaning temp file {filename}: {e}")
            
            if cleaned_count > 0:
                print(f"✅ Cleaned up {cleaned_count} old temp file(s)")
        except Exception as e:
            print(f"⚠️ Error in cleanup_old_temp_files: {e}")
    
    def prepare_download_all(self) -> Dict[str, Any]:
        """Get list of files to download and create a session (from both S3 and local)"""
        self.cleanup_old_download_sessions()
        
        try:
            files_to_backup = []
            
            # Check if S3 storage is enabled
            use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
            
            if use_s3:
                # List backups from S3
                try:
                    from s3_storage_manager import S3StorageManager
                    settings = self.storage_settings_manager.get_settings()
                    s3_manager = S3StorageManager(
                        bucket_name=settings['s3_bucket'],
                        region=settings['s3_region'],
                        access_key=settings['s3_access_key'],
                        secret_key=settings['s3_secret_key']
                    )
                    s3_result = s3_manager.list_files()
                    if s3_result.get('success'):
                        for file_info in s3_result.get('files', []):
                            filename = file_info.get('key', '')
                            # Only include backup files (tar.gz, zip, network JSON)
                            if filename.endswith(('.tar.gz', '.zip')) or (filename.startswith('network_') and filename.endswith('.json')):
                                files_to_backup.append(filename)
                except Exception as e:
                    print(f"⚠️  Error listing S3 backups: {e}")
                    import traceback
                    traceback.print_exc()
            
            # Also list local backups (for migration or fallback)
            if os.path.exists(self.backup_dir):
                for filename in os.listdir(self.backup_dir):
                    file_path = os.path.join(self.backup_dir, filename)
                    if os.path.isfile(file_path):
                        if filename.endswith(('.zip', '.tar.gz')) or (filename.startswith('network_') and filename.endswith('.json')):
                            # Only add if not already in list from S3
                            if filename not in files_to_backup:
                                files_to_backup.append(filename)
            
            if not files_to_backup:
                return {'error': 'No backups found to download'}
            
            session_id = str(uuid.uuid4())
            
            self.download_all_progress[session_id] = {
                'total': len(files_to_backup),
                'completed': 0,
                'current_file': None,
                'status': 'preparing',
                'files': files_to_backup,
                'archive_path': None,
                'archive_filename': None,
                'temp_dir': None,
                'use_s3': use_s3,
                'created_at': datetime.now().isoformat()
            }
            
            return {
                'success': True,
                'session_id': session_id,
                'files': files_to_backup,
                'total': len(files_to_backup)
            }
        except Exception as e:
            return {'error': str(e)}
    
    def get_download_all_progress(self, session_id: str) -> Dict[str, Any]:
        """Get progress of download-all operation"""
        if session_id not in self.download_all_progress:
            return {'error': 'Session not found'}
        
        progress = self.download_all_progress[session_id]
        return {
            'total': progress['total'],
            'completed': progress['completed'],
            'current_file': progress['current_file'],
            'status': progress['status'],
            'archive_filename': progress.get('archive_filename')
        }
    
    def _create_archive_background(self, session_id: str, files_to_backup: List[str], archive_path: str, archive_filename: str):
        """Background thread function to create a tar.gz archive (downloads from S3 if needed)"""
        try:
            progress = self.download_all_progress[session_id]
            progress['status'] = 'archiving'
            progress['archive_path'] = archive_path
            progress['archive_filename'] = archive_filename
            
            use_s3 = progress.get('use_s3', False)
            s3_manager = None
            
            if use_s3:
                # Initialize S3 manager if needed
                try:
                    from s3_storage_manager import S3StorageManager
                    settings = self.storage_settings_manager.get_settings()
                    s3_manager = S3StorageManager(
                        bucket_name=settings['s3_bucket'],
                        region=settings['s3_region'],
                        access_key=settings['s3_access_key'],
                        secret_key=settings['s3_secret_key']
                    )
                except Exception as e:
                    print(f"⚠️  Error initializing S3 manager: {e}")
                    use_s3 = False
            
            tar_thread_complete = threading.Event()
            tar_thread_error = [None]
            
            def create_tar():
                try:
                    # Create a temp directory for S3 downloads
                    download_temp_dir = os.path.join(progress.get('temp_dir', tempfile.gettempdir()), 's3_downloads')
                    os.makedirs(download_temp_dir, exist_ok=True)
                    
                    with tarfile.open(archive_path, "w:gz") as tar:
                        for i, filename in enumerate(files_to_backup):
                            progress['current_file'] = filename
                            progress['completed'] = i
                            
                            file_path = None
                            
                            # Try S3 first if enabled
                            if use_s3 and s3_manager:
                                try:
                                    if s3_manager.file_exists(filename):
                                        # Download from S3 to temp location
                                        temp_file_path = os.path.join(download_temp_dir, filename)
                                        download_result = s3_manager.download_file(filename, temp_file_path)
                                        if download_result.get('success') and os.path.exists(temp_file_path):
                                            file_path = temp_file_path
                                            print(f"📥 Downloaded {filename} from S3 for archive")
                                        else:
                                            print(f"⚠️  Failed to download {filename} from S3: {download_result.get('error', 'Unknown error')}")
                                except Exception as e:
                                    print(f"⚠️  Error downloading {filename} from S3: {e}")
                            
                            # Fall back to local if not found in S3 or S3 disabled
                            if not file_path:
                                local_file_path = os.path.join(self.backup_dir, filename)
                                if os.path.exists(local_file_path):
                                    file_path = local_file_path
                            
                            if file_path and os.path.exists(file_path):
                                tar.add(file_path, arcname=filename)
                            else:
                                print(f"⚠️  Warning: File not found: {filename}")
                    
                    # Clean up temp S3 downloads
                    try:
                        if os.path.exists(download_temp_dir):
                            shutil.rmtree(download_temp_dir)
                            print(f"🧹 Cleaned up temp S3 downloads directory")
                    except Exception as e:
                        print(f"⚠️  Error cleaning temp S3 downloads: {e}")
                    
                    if os.path.exists(archive_path):
                        with tarfile.open(archive_path, 'r:gz') as verify_tar:
                            verify_tar.getmembers()
                        print(f"✅ Archive created successfully: {archive_path} ({os.path.getsize(archive_path)} bytes)")
                    else:
                        raise Exception("Archive file was not created")
                    
                    tar_thread_complete.set()
                except Exception as e:
                    tar_thread_error[0] = e
                    tar_thread_complete.set()
            
            tar_thread = threading.Thread(target=create_tar, daemon=True)
            tar_thread.start()
            
            if not tar_thread_complete.wait(timeout=1800):
                raise Exception("Archive creation timed out")
            
            if tar_thread_error[0]:
                raise tar_thread_error[0]
            
            progress['status'] = 'complete'
            progress['completed'] = len(files_to_backup)
            progress['current_file'] = None
            print(f"✅ Archive ready for download: {archive_filename}")
        except Exception as e:
            if session_id in self.download_all_progress:
                self.download_all_progress[session_id]['status'] = 'error'
                self.download_all_progress[session_id]['error'] = str(e)
            import traceback
            traceback.print_exc()
            print(f"❌ Error creating archive: {e}")
    
    def create_download_all_archive(self, session_id: str) -> Dict[str, Any]:
        """Start creating the tar.gz file in a background thread"""
        try:
            if session_id not in self.download_all_progress:
                return {'error': 'Session not found'}
            
            progress = self.download_all_progress[session_id]
            files_to_backup = progress['files']
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            archive_filename = f"all_backups_{timestamp}.tar.gz"
            temp_dir = tempfile.mkdtemp()
            archive_path = os.path.join(temp_dir, archive_filename)
            
            progress['temp_dir'] = temp_dir
            
            thread = threading.Thread(
                target=self._create_archive_background,
                args=(session_id, files_to_backup, archive_path, archive_filename)
            )
            thread.daemon = True
            thread.start()
            
            return {
                'success': True,
                'archive_filename': archive_filename,
                'session_id': session_id,
                'message': 'Archive creation started'
            }
        except Exception as e:
            if session_id in self.download_all_progress:
                self.download_all_progress[session_id]['status'] = 'error'
            return {'error': str(e)}
    
    def get_download_all_file(self, session_id: str) -> Optional[str]:
        """Get the archive file path for download"""
        if session_id not in self.download_all_progress:
            return None
        
        progress = self.download_all_progress[session_id]
        
        if progress['status'] != 'complete' or not progress['archive_path']:
            return None
        
        return progress['archive_path']
    
    def cleanup_download_session(self, session_id: str):
        """Clean up a download session"""
        if session_id in self.download_all_progress:
            progress = self.download_all_progress[session_id]
            temp_dir = progress.get('temp_dir')
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                    print(f"✅ Cleaned up temp directory: {temp_dir}")
                except Exception as e:
                    print(f"⚠️ Error cleaning up temp files: {e}")
            del self.download_all_progress[session_id]

