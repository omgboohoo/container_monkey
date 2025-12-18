"""
Network Manager Module
Handles all Docker network operations
"""
import os
import json
import subprocess
from datetime import datetime
from typing import Dict, Any, Optional
from error_utils import safe_log_error


class NetworkManager:
    """Manages Docker network operations"""
    
    def __init__(self, backup_dir: str, storage_settings_manager=None, ui_settings_manager=None):
        """
        Initialize NetworkManager
        
        Args:
            backup_dir: Base directory (network backups go in backups/ subdirectory)
            storage_settings_manager: Optional StorageSettingsManager instance for S3 storage
            ui_settings_manager: Optional UISettingsManager instance for getting server name
        """
        # Network backups go in backups/ subdirectory
        self.backup_dir = os.path.join(backup_dir, 'backups')
        os.makedirs(self.backup_dir, exist_ok=True)
        self.storage_settings_manager = storage_settings_manager
        self.ui_settings_manager = ui_settings_manager
    
    def list_networks(self) -> Dict[str, Any]:
        """List all Docker networks with detailed information"""
        try:
            result = subprocess.run(
                ['docker', 'network', 'ls', '--format', '{{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return {'error': result.stderr}
            
            # Get all containers (running and stopped) to count network usage
            container_network_map = {}  # network_name -> count
            try:
                containers_result = subprocess.run(
                    ['docker', 'ps', '-a', '--format', '{{.ID}}'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if containers_result.returncode == 0:
                    container_ids = [cid.strip() for cid in containers_result.stdout.strip().split('\n') if cid.strip()]
                    for container_id in container_ids:
                        try:
                            inspect_result = subprocess.run(
                                ['docker', 'inspect', container_id, '--format', '{{range $net, $conf := .NetworkSettings.Networks}}{{$net}} {{end}}'],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if inspect_result.returncode == 0:
                                networks = inspect_result.stdout.strip().split()
                                for network_name in networks:
                                    if network_name:
                                        container_network_map[network_name] = container_network_map.get(network_name, 0) + 1
                        except:
                            pass
            except:
                pass
            
            networks = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue
                parts = line.split('\t')
                if len(parts) >= 4:
                    network_id = parts[0]
                    network_name = parts[1]
                    
                    network_info = {
                        'id': network_id,
                        'name': network_name,
                        'driver': parts[2],
                        'scope': parts[3],
                        'subnet': '',
                        'gateway': '',
                        'ip_range': '',
                        'containers': container_network_map.get(network_name, 0),
                    }
                    
                    try:
                        inspect_result = subprocess.run(
                            ['docker', 'network', 'inspect', network_id, '--format', '{{json .}}'],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        
                        if inspect_result.returncode == 0:
                            inspect_data = json.loads(inspect_result.stdout)
                            
                            net_data = None
                            if isinstance(inspect_data, list) and len(inspect_data) > 0:
                                net_data = inspect_data[0]
                            elif isinstance(inspect_data, dict):
                                net_data = inspect_data
                                
                            if net_data:
                                ipam = net_data.get('IPAM', {}) or {}
                                configs = ipam.get('Config', []) or []
                                if configs and len(configs) > 0:
                                    config = configs[0]
                                    network_info['subnet'] = config.get('Subnet', '')
                                    network_info['gateway'] = config.get('Gateway', '')
                                    network_info['ip_range'] = config.get('IPRange', '')
                    except:
                        pass
                    
                    networks.append(network_info)
            
            return {'networks': networks}
        except Exception as e:
            return {'error': str(e)}
    
    def backup_network(self, network_id: str) -> Dict[str, Any]:
        """Backup a Docker network configuration"""
        try:
            inspect_result = subprocess.run(
                ['docker', 'network', 'inspect', network_id],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if inspect_result.returncode != 0:
                return {'error': inspect_result.stderr}
            
            network_data = json.loads(inspect_result.stdout)
            if not network_data or len(network_data) == 0:
                return {'error': 'Network not found'}
            
            network_info = network_data[0]
            network_name = network_info.get('Name', network_id)
            
            default_networks = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress']
            if network_name in default_networks:
                return {
                    'error': f'Cannot backup default network "{network_name}". Default networks are built-in and cannot be backed up or restored.'
                }
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            backup_filename = f"network_{network_name}_{timestamp}.json"
            backup_path = os.path.join(self.backup_dir, backup_filename)
            
            # Get server name from settings
            server_name = 'My Server Name'  # Default
            if self.ui_settings_manager:
                server_name = self.ui_settings_manager.get_setting('server_name', 'My Server Name')
                if not server_name or server_name == '':
                    server_name = 'My Server Name'
            
            # Add server name to network info
            network_info['server_name'] = server_name
            
            # Write to local file first
            with open(backup_path, 'w') as f:
                json.dump(network_info, f, indent=2)
            
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
                    print(f"☁️ Uploading {backup_filename} to S3...")
                    upload_result = s3_manager.upload_file(backup_path, backup_filename)
                    if upload_result.get('success'):
                        print(f"✅ Successfully uploaded {backup_filename} to S3.")
                        # Remove local file after successful S3 upload
                        os.remove(backup_path)
                        print(f"🗑️ Removed local backup file: {backup_path}")
                    else:
                        print(f"⚠️  S3 upload failed: {upload_result.get('error', 'Unknown error')}")
                        # Keep local file if S3 upload fails
                except Exception as e:
                    print(f"⚠️  Error uploading to S3: {e}")
                    # Keep local file if S3 upload fails
            
            return {
                'success': True,
                'filename': backup_filename,
                'message': f'Network {network_name} backed up successfully'
            }
        except Exception as e:
            return {'error': str(e)}
    
    def delete_network(self, network_id: str) -> Dict[str, Any]:
        """Delete a Docker network"""
        network_id = network_id.split('/')[-1]
        
        try:
            result = subprocess.run(
                ['docker', 'network', 'rm', network_id],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return {'error': result.stderr}
            
            return {'success': True, 'message': 'Network deleted'}
        except Exception as e:
            return {'error': str(e)}
    
    def restore_network(self, filename: str) -> Dict[str, Any]:
        """Restore a network from backup file (downloads from S3 if needed)"""
        if not filename:
            return {'error': 'Filename required'}
        
        filename = os.path.basename(filename)
        file_path = os.path.join(self.backup_dir, filename)
        
        # Check if S3 storage is enabled
        use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
        
        # If file doesn't exist locally, try downloading from S3
        if not os.path.exists(file_path) and use_s3:
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
                    # Download from S3 to temp location
                    temp_dir = os.path.join(self.backup_dir, 'temp')
                    os.makedirs(temp_dir, exist_ok=True)
                    temp_path = os.path.join(temp_dir, filename)
                    print(f"📥 Downloading {filename} from S3 to {temp_path}")
                    download_result = s3_manager.download_file(filename, temp_path)
                    if download_result.get('success') and os.path.exists(temp_path):
                        file_path = temp_path
                        print(f"✅ Successfully downloaded {filename} from S3")
                    else:
                        return {'error': f'Failed to download backup from S3: {download_result.get("error", "Unknown error")}'}
            except Exception as e:
                print(f"⚠️  Error downloading from S3: {e}")
                return {'error': f'Failed to download backup from S3: {str(e)}'}
        
        if not os.path.exists(file_path):
            return {'error': 'Backup file not found'}
        
        try:
            with open(file_path, 'r') as f:
                network_config = json.load(f)
            
            # Clean up temp file if it was downloaded from S3
            if file_path.startswith(os.path.join(self.backup_dir, 'temp')):
                try:
                    os.remove(file_path)
                    print(f"🧹 Cleaned up temporary file: {file_path}")
                except Exception as e:
                    print(f"⚠️  Error cleaning up temp file: {e}")
            
            network_name = network_config.get('Name', '')
            if not network_name:
                return {'error': 'Invalid network backup: missing name'}
            
            default_networks = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress']
            if network_name in default_networks:
                return {
                    'error': f'Cannot restore default network "{network_name}". Default networks are built-in and already exist.'
                }
            
            check_result = subprocess.run(
                ['docker', 'network', 'inspect', network_name],
                capture_output=True,
                text=True,
                timeout=5
            )
            
            if check_result.returncode == 0:
                return {
                    'error': f'Network {network_name} already exists',
                    'network_name': network_name
                }
            
            driver = network_config.get('Driver', 'bridge')
            ipam = network_config.get('IPAM', {})
            
            cmd = ['docker', 'network', 'create']
            
            if driver and driver != 'bridge':
                cmd.extend(['--driver', driver])
            
            if ipam and ipam.get('Config'):
                for config in ipam['Config']:
                    if config.get('Subnet'):
                        cmd.extend(['--subnet', config['Subnet']])
                    if config.get('Gateway'):
                        cmd.extend(['--gateway', config['Gateway']])
                    if config.get('IPRange'):
                        cmd.extend(['--ip-range', config['IPRange']])
            
            cmd.append(network_name)
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return {'error': f'Failed to create network: {result.stderr}'}
            
            return {
                'success': True,
                'message': f'Network {network_name} restored successfully',
                'network_name': network_name
            }
        except Exception as e:
            safe_log_error(e, context="restore_network")
            return {'error': 'Restore failed'}
    
    def list_network_backups(self) -> Dict[str, Any]:
        """List all network backup files"""
        try:
            backups = []
            
            if not os.path.exists(self.backup_dir):
                return {'backups': []}
            
            for filename in os.listdir(self.backup_dir):
                if filename.startswith('network_') and filename.endswith('.json'):
                    file_path = os.path.join(self.backup_dir, filename)
                    if os.path.isfile(file_path):
                        stat = os.stat(file_path)
                        backups.append({
                            'filename': filename,
                            'size': stat.st_size,
                            'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            'type': 'network'
                        })
            
            backups.sort(key=lambda x: x['created'], reverse=True)
            return {'backups': backups}
        except Exception as e:
            return {'error': str(e)}
    
    def upload_network_backup(self, file_content: bytes, filename: str) -> Dict[str, Any]:
        """Upload a network backup file"""
        try:
            filename = os.path.basename(filename)
            if not filename.startswith('network_') or not filename.endswith('.json'):
                return {'error': 'Invalid filename. Network backups must start with "network_" and end with ".json"'}
            
            # Parse JSON to validate and extract/add server name
            try:
                network_data = json.loads(file_content.decode('utf-8'))
                if not network_data.get('Name'):
                    return {'error': 'Invalid network backup: missing network name'}
            except (json.JSONDecodeError, UnicodeDecodeError) as e:
                return {'error': f'Invalid JSON file: {str(e)}'}
            
            # Get server name from uploaded file or current server settings
            server_name = network_data.get('server_name')
            if not server_name and self.ui_settings_manager:
                server_name = self.ui_settings_manager.get_setting('server_name', 'Unknown Server')
            if not server_name:
                server_name = 'Unknown Server'
            
            # Add/update server name in network data
            network_data['server_name'] = server_name
            
            # Re-encode the updated JSON
            file_content = json.dumps(network_data, indent=2).encode('utf-8')
            
            # Check if S3 storage is enabled
            use_s3 = self.storage_settings_manager and self.storage_settings_manager.is_s3_enabled()
            
            if use_s3:
                # Upload to S3
                try:
                    from s3_storage_manager import S3StorageManager
                    import io
                    settings = self.storage_settings_manager.get_settings()
                    s3_manager = S3StorageManager(
                        bucket_name=settings['s3_bucket'],
                        region=settings['s3_region'],
                        access_key=settings['s3_access_key'],
                        secret_key=settings['s3_secret_key']
                    )
                    
                    # Check if file already exists in S3
                    if s3_manager.file_exists(filename):
                        return {'error': 'File already exists'}
                    
                    upload_result = s3_manager.upload_fileobj(io.BytesIO(file_content), filename)
                    if not upload_result.get('success'):
                        return {'error': f'S3 upload failed: {upload_result.get("error", "Unknown error")}'}
                    
                    return {
                        'success': True,
                        'filename': filename,
                        'message': 'Network backup uploaded to S3 successfully'
                    }
                except Exception as e:
                    return {'error': f'S3 upload error: {str(e)}'}
            else:
                # Save locally
                file_path = os.path.join(self.backup_dir, filename)
                
                if os.path.exists(file_path):
                    return {'error': 'File already exists'}
                
                with open(file_path, 'wb') as f:
                    f.write(file_content)
                
                return {
                    'success': True,
                    'filename': filename,
                    'message': 'Network backup uploaded successfully'
                }
        except Exception as e:
            return {'error': str(e)}









