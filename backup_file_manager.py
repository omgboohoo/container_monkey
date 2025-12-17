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
from error_utils import safe_log_error


class BackupFileManager:
    """Manages backup file operations"""
    
    def __init__(self, backup_dir: str, audit_log_manager=None, storage_settings_manager=None, ui_settings_manager=None):
        """
        Initialize BackupFileManager
        
        Args:
            backup_dir: Base directory (backups go in backups/ subdirectory)
            audit_log_manager: Optional AuditLogManager instance for logging
            storage_settings_manager: Optional StorageSettingsManager instance for S3 storage
            ui_settings_manager: Optional UISettingsManager instance for getting server name
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
        self.ui_settings_manager = ui_settings_manager
    
    def _read_companion_json(self, filename: str, storage_location: str, s3_manager=None) -> str:
        """Read server name from companion JSON file"""
        companion_json_filename = f"{filename}.json"
        server_name = 'Unknown Server'  # Default
        
        try:
            if storage_location == 's3' and s3_manager:
                # Try to download companion JSON from S3
                try:
                    download_result = s3_manager.download_fileobj(companion_json_filename)
                    if download_result.get('success'):
                        json_content = download_result.get('content', b'')
                        if json_content:
                            metadata = json.loads(json_content.decode('utf-8'))
                            server_name = metadata.get('server_name', 'Unknown Server')
                except Exception as e:
                    # Companion JSON doesn't exist or error reading - use default
                    pass
            else:
                # Read from local file
                companion_json_path = os.path.join(self.backup_dir, companion_json_filename)
                if os.path.exists(companion_json_path):
                    with open(companion_json_path, 'r') as f:
                        metadata = json.load(f)
                        server_name = metadata.get('server_name', 'Unknown Server')
        except Exception as e:
            # Error reading companion JSON - use default
            pass
        
        return server_name if server_name else 'Unknown Server'
    
    def list_backups(self) -> Dict[str, Any]:
        """List all available backups (containers and networks)"""
        try:
            backups = []
            s3_manager = None
            
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
                            # Skip companion JSON files
                            if filename.endswith('.json') and not filename.startswith('network_'):
                                continue
                            
                            if filename.endswith(('.zip', '.tar.gz')):
                                backup_type = 'scheduled' if filename.startswith('scheduled_') else 'manual'
                                server_name = self._read_companion_json(filename, 's3', s3_manager)
                                backups.append({
                                    'filename': filename,
                                    'size': file_info['size'],
                                    'created': file_info['last_modified'],
                                    'type': 'container',
                                    'backup_type': backup_type,
                                    'storage_location': 's3',
                                    'server_name': server_name
                                })
                            elif filename.startswith('network_') and filename.endswith('.json'):
                                backups.append({
                                    'filename': filename,
                                    'size': file_info['size'],
                                    'created': file_info['last_modified'],
                                    'type': 'network',
                                    'backup_type': 'manual',
                                    'storage_location': 's3',
                                    'server_name': 'Unknown Server'  # Network backups don't have server name
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
                    
                    # Skip companion JSON files
                    if filename.endswith('.json') and not filename.startswith('network_'):
                        continue
                    
                    # Skip if already in backups list from S3
                    if any(b['filename'] == filename for b in backups):
                        continue
                    
                    stat = os.stat(file_path)
                    
                    if filename.endswith(('.zip', '.tar.gz')):
                        backup_type = 'scheduled' if filename.startswith('scheduled_') else 'manual'
                        server_name = self._read_companion_json(filename, 'local')
                        backups.append({
                            'filename': filename,
                            'size': stat.st_size,
                            'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'type': 'container',
                            'backup_type': backup_type,
                            'storage_location': 'local',
                            'server_name': server_name
                        })
                    elif filename.startswith('network_') and filename.endswith('.json'):
                        backups.append({
                            'filename': filename,
                            'size': stat.st_size,
                            'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'type': 'network',
                            'backup_type': 'manual',
                            'storage_location': 'local',
                            'server_name': 'Unknown Server'  # Network backups don't have server name
                        })
            
            backups.sort(key=lambda x: x['created'], reverse=True)
            return {'backups': backups}
        except Exception as e:
            return {'error': str(e)}
    
    def get_backup_path(self, filename: str) -> Optional[str]:
        """Get full path to a backup file (downloads from S3 if needed)
        
        Security: Validates filename and ensures resolved path stays within backup directory
        """
        # Sanitize filename - remove any directory components
        filename = os.path.basename(filename)
        
        # Additional security: validate filename doesn't contain dangerous characters
        if not filename or '..' in filename or '/' in filename or '\\' in filename:
            return None
        
        # Use secure_filename for additional sanitization
        filename = secure_filename(filename)
        if not filename:
            return None
        
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
                            # Security: Validate temp path is within temp_dir
                            resolved_temp_path = os.path.realpath(temp_path)
                            resolved_temp_dir = os.path.realpath(self.temp_dir)
                            if not resolved_temp_path.startswith(resolved_temp_dir):
                                print(f"⚠️  Security: Temp path outside allowed directory: {resolved_temp_path}")
                                return None
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
                safe_log_error(e, context="get_backup_path_s3")
        
        # Fall back to local
        file_path = os.path.join(self.backup_dir, filename)
        
        # Security: Validate resolved path stays within backup directory
        # Use realpath to resolve symlinks and normalize path
        try:
            resolved_file_path = os.path.realpath(file_path)
            resolved_backup_dir = os.path.realpath(self.backup_dir)
            
            # Ensure the resolved path is within the backup directory
            if not resolved_file_path.startswith(resolved_backup_dir):
                print(f"⚠️  Security: File path outside backup directory: {resolved_file_path}")
                return None
            
            # Additional check: ensure it's actually a file (not a directory)
            if os.path.exists(resolved_file_path) and os.path.isfile(resolved_file_path):
                return resolved_file_path
        except (OSError, ValueError) as e:
            # If path resolution fails, it's likely invalid
            safe_log_error(e, context="get_backup_path_validation")
            return None
        
        return None
    
    def delete_backup(self, filename: str, user: Optional[str] = None) -> Dict[str, Any]:
        """Delete a backup file and its companion JSON"""
        filename = os.path.basename(filename)
        companion_json_filename = f"{filename}.json"
        
        # Check if S3 storage is enabled
        use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
        
        deleted = False
        s3_manager = None
        
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
                        # Also delete companion JSON from S3
                        if s3_manager.file_exists(companion_json_filename):
                            s3_manager.delete_file(companion_json_filename)
            except Exception as e:
                print(f"⚠️  Error deleting from S3: {e}")
        
        # Also try local deletion
        file_path = os.path.join(self.backup_dir, filename)
        if os.path.exists(file_path):
            try:
                os.remove(file_path)
                deleted = True
                # Also delete companion JSON locally
                companion_json_path = os.path.join(self.backup_dir, companion_json_filename)
                if os.path.exists(companion_json_path):
                    try:
                        os.remove(companion_json_path)
                    except Exception as e:
                        print(f"⚠️  Error deleting companion JSON {companion_json_filename}: {e}")
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
                            # Only delete backup files (tar.gz, zip, network JSON) - skip companion JSON files
                            if filename.endswith('.json') and not filename.startswith('network_'):
                                # This is a companion JSON file - delete it
                                try:
                                    delete_result = s3_manager.delete_file(filename)
                                    if delete_result.get('success'):
                                        print(f"✅ Deleted companion JSON {filename} from S3")
                                except Exception as e:
                                    print(f"⚠️  Error deleting companion JSON {filename} from S3: {e}")
                            elif filename.endswith(('.tar.gz', '.zip')) or (filename.startswith('network_') and filename.endswith('.json')):
                                try:
                                    delete_result = s3_manager.delete_file(filename)
                                    if delete_result.get('success'):
                                        deleted_count += 1
                                        deleted_files.append(filename)
                                        print(f"✅ Deleted {filename} from S3")
                                        
                                        # Also delete companion JSON if it exists
                                        if filename.endswith(('.tar.gz', '.zip')):
                                            companion_json_filename = f"{filename}.json"
                                            if s3_manager.file_exists(companion_json_filename):
                                                try:
                                                    s3_manager.delete_file(companion_json_filename)
                                                    print(f"✅ Deleted companion JSON {companion_json_filename} from S3")
                                                except Exception as e:
                                                    print(f"⚠️  Error deleting companion JSON {companion_json_filename} from S3: {e}")
                                    else:
                                        print(f"⚠️  Failed to delete {filename} from S3: {delete_result.get('error', 'Unknown error')}")
                                except Exception as e:
                                    print(f"⚠️  Error deleting {filename} from S3: {e}")
                                    safe_log_error(e, context=f"delete_backup_s3_{filename}")
                    else:
                        print(f"⚠️  Error listing S3 files: {list_result.get('error', 'Unknown error')}")
                except Exception as e:
                    print(f"⚠️  Error deleting from S3: {e}")
                    safe_log_error(e, context="delete_all_backups_s3")
            
            # Also delete local backups
            if os.path.exists(self.backup_dir):
                for filename in os.listdir(self.backup_dir):
                    file_path = os.path.join(self.backup_dir, filename)
                    if os.path.isfile(file_path):
                        # Skip companion JSON files (they'll be deleted with their backup)
                        if filename.endswith('.json') and not filename.startswith('network_'):
                            continue
                        
                        if filename.endswith(('.tar.gz', '.zip')) or (filename.startswith('network_') and filename.endswith('.json')):
                            try:
                                os.remove(file_path)
                                # Only count if not already counted from S3
                                if filename not in deleted_files:
                                    deleted_count += 1
                                    deleted_files.append(filename)
                                
                                # Also delete companion JSON if it exists
                                if filename.endswith(('.tar.gz', '.zip')):
                                    companion_json_filename = f"{filename}.json"
                                    companion_json_path = os.path.join(self.backup_dir, companion_json_filename)
                                    if os.path.exists(companion_json_path):
                                        try:
                                            os.remove(companion_json_path)
                                            print(f"✅ Deleted companion JSON {companion_json_filename}")
                                        except Exception as e:
                                            print(f"⚠️  Error deleting companion JSON {companion_json_filename}: {e}")
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
            
            # Get server name from metadata or current server settings
            server_name = metadata.get('server_name')
            if not server_name and self.ui_settings_manager:
                server_name = self.ui_settings_manager.get_setting('server_name', 'Unknown Server')
            if not server_name:
                server_name = 'Unknown Server'
            
            # Create companion JSON file
            companion_json_filename = f"{filename}.json"
            companion_metadata = {'server_name': server_name}
            
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
                    
                    # Upload companion JSON to S3
                    companion_json_bytes = json.dumps(companion_metadata, indent=2).encode('utf-8')
                    companion_upload_result = s3_manager.upload_fileobj(io.BytesIO(companion_json_bytes), companion_json_filename)
                    if companion_upload_result.get('success'):
                        print(f"✅ Uploaded companion JSON to S3: {companion_json_filename}")
                    
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
                
                # Create companion JSON file locally
                companion_json_path = os.path.join(self.backup_dir, companion_json_filename)
                try:
                    with open(companion_json_path, 'w') as f:
                        json.dump(companion_metadata, f, indent=2)
                    print(f"✅ Created companion JSON: {companion_json_filename}")
                except Exception as e:
                    print(f"⚠️  Error creating companion JSON: {e}")
                
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
                    safe_log_error(e, context="prepare_download_all_s3")
            
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
                self.download_all_progress[session_id]['error'] = 'Failed to create archive'
            safe_log_error(e, context="create_download_all_archive")
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

