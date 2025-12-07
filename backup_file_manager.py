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
    
    def __init__(self, backup_dir: str, audit_log_manager=None):
        """
        Initialize BackupFileManager
        
        Args:
            backup_dir: Base directory (backups go in backups/ subdirectory)
            audit_log_manager: Optional AuditLogManager instance for logging
        """
        # Backup files go in backups/ subdirectory
        self.backup_dir = os.path.join(backup_dir, 'backups')
        os.makedirs(self.backup_dir, exist_ok=True)
        self.download_all_progress = {}
        self.audit_log_manager = audit_log_manager
    
    def list_backups(self) -> Dict[str, Any]:
        """List all available backups (containers and networks)"""
        try:
            backups = []
            
            if not os.path.exists(self.backup_dir):
                return {'backups': []}
            
            for filename in os.listdir(self.backup_dir):
                file_path = os.path.join(self.backup_dir, filename)
                if not os.path.isfile(file_path):
                    continue
                    
                stat = os.stat(file_path)
                
                if filename.endswith(('.zip', '.tar.gz')):
                    # Determine backup type: scheduled backups have "scheduled_" prefix
                    # This is reliable since we set the prefix when creating backups
                    backup_type = 'scheduled' if filename.startswith('scheduled_') else 'manual'
                    
                    # Note: We used to read metadata from inside tar.gz files, but that's slow
                    # The filename prefix is reliable and much faster, so we use that instead
                    # If we need metadata in the future, we can read it lazily on-demand
                    
                    backups.append({
                        'filename': filename,
                        'size': stat.st_size,
                        'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'type': 'container',
                        'backup_type': backup_type
                    })
                elif filename.startswith('network_') and filename.endswith('.json'):
                    backups.append({
                        'filename': filename,
                        'size': stat.st_size,
                        'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'type': 'network',
                        'backup_type': 'manual'  # Network backups are always manual
                    })
            
            backups.sort(key=lambda x: x['created'], reverse=True)
            return {'backups': backups}
        except Exception as e:
            return {'error': str(e)}
    
    def get_backup_path(self, filename: str) -> Optional[str]:
        """Get full path to a backup file"""
        filename = os.path.basename(filename)
        file_path = os.path.join(self.backup_dir, filename)
        if os.path.exists(file_path):
            return file_path
        return None
    
    def delete_backup(self, filename: str, user: Optional[str] = None) -> Dict[str, Any]:
        """Delete a backup file"""
        filename = os.path.basename(filename)
        file_path = os.path.join(self.backup_dir, filename)
        
        if not os.path.exists(file_path):
            return {'error': 'Backup file not found'}
        
        try:
            os.remove(file_path)
            
            # Log backup deletion
            if self.audit_log_manager:
                self.audit_log_manager.log_event(
                    operation_type='delete_backup',
                    status='completed',
                    backup_filename=filename,
                    user=user
                )
            
            return {'success': True, 'message': 'Backup deleted'}
        except Exception as e:
            # Log deletion error
            if self.audit_log_manager:
                self.audit_log_manager.log_event(
                    operation_type='delete_backup',
                    status='error',
                    backup_filename=filename,
                    error_message=str(e),
                    user=user
                )
            return {'error': str(e)}
    
    def delete_all_backups(self, user: Optional[str] = None) -> Dict[str, Any]:
        """Delete all backup files"""
        try:
            if not os.path.exists(self.backup_dir):
                return {'success': True, 'message': 'Backup directory empty', 'deleted_count': 0}
            
            deleted_count = 0
            deleted_files = []
            for filename in os.listdir(self.backup_dir):
                file_path = os.path.join(self.backup_dir, filename)
                if os.path.isfile(file_path):
                    if filename.endswith(('.tar.gz', '.zip')) or (filename.startswith('network_') and filename.endswith('.json')):
                        try:
                            os.remove(file_path)
                            deleted_count += 1
                            deleted_files.append(filename)
                        except Exception:
                            pass
            
            # Log deletion of all backups
            if self.audit_log_manager and deleted_count > 0:
                self.audit_log_manager.log_event(
                    operation_type='delete_backup',
                    status='completed',
                    user=user,
                    details={'deleted_count': deleted_count, 'deleted_files': deleted_files, 'all': True}
                )
            
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
            file_path = os.path.join(self.backup_dir, filename)
            
            with open(file_path, 'wb') as f:
                f.write(file_content)
            
            # Verify it's a valid backup
            try:
                with tarfile.open(file_path, 'r:gz') as tar:
                    try:
                        metadata_file = tar.getmember('./backup_metadata.json')
                    except KeyError:
                        os.remove(file_path)
                        return {'error': 'Invalid backup file: missing metadata'}
                    
                    metadata_str = tar.extractfile(metadata_file).read().decode('utf-8')
                    metadata = json.loads(metadata_str)
                
                return {
                    'success': True,
                    'filename': filename,
                    'metadata': metadata,
                    'message': 'Backup uploaded successfully'
                }
            except tarfile.TarError:
                os.remove(file_path)
                return {'error': 'Invalid tar.gz file'}
            except Exception as e:
                os.remove(file_path)
                return {'error': f'Error processing backup: {str(e)}'}
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
    
    def prepare_download_all(self) -> Dict[str, Any]:
        """Get list of files to download and create a session"""
        self.cleanup_old_download_sessions()
        
        try:
            if not os.path.exists(self.backup_dir):
                return {'error': 'Backup directory not found'}
            
            files_to_backup = []
            for filename in os.listdir(self.backup_dir):
                file_path = os.path.join(self.backup_dir, filename)
                if os.path.isfile(file_path):
                    if filename.endswith(('.zip', '.tar.gz')) or (filename.startswith('network_') and filename.endswith('.json')):
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
        """Background thread function to create a tar.gz archive"""
        try:
            progress = self.download_all_progress[session_id]
            progress['status'] = 'archiving'
            progress['archive_path'] = archive_path
            progress['archive_filename'] = archive_filename
            
            tar_thread_complete = threading.Event()
            tar_thread_error = [None]
            
            def create_tar():
                try:
                    with tarfile.open(archive_path, "w:gz") as tar:
                        for i, filename in enumerate(files_to_backup):
                            file_path = os.path.join(self.backup_dir, filename)
                            if os.path.exists(file_path):
                                progress['current_file'] = filename
                                progress['completed'] = i
                                tar.add(file_path, arcname=filename)
                            else:
                                print(f"⚠️  Warning: File not found: {file_path}")
                    
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

