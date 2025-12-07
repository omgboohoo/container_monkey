"""
Restore Manager Module
Handles container restore operations from backup files
"""
import json
import os
import tempfile
import subprocess
import shlex
import re
import shutil
import glob
import tarfile
from typing import Dict, Optional, Callable


class RestoreManager:
    """Manages container restore operations from backup files"""
    
    def __init__(self, docker_api_client, backup_dir: str, app_container_name: str, app_volume_name: str,
                 reconstruct_docker_run_command_fn: Callable, generate_docker_compose_fn: Callable,
                 audit_log_manager=None):
        """
        Initialize RestoreManager
        
        Args:
            docker_api_client: Docker API client instance
            backup_dir: Directory containing backup files
            app_container_name: Name of the app container (to skip in restores)
            app_volume_name: Name of the app volume (to skip in restores)
            reconstruct_docker_run_command_fn: Function to reconstruct docker run command
            generate_docker_compose_fn: Function to generate docker-compose yaml
            audit_log_manager: Optional AuditLogManager instance for logging
        """
        self.docker_api_client = docker_api_client
        # Backup files are in backups/ subdirectory
        self.backup_dir = os.path.join(backup_dir, 'backups')
        os.makedirs(self.backup_dir, exist_ok=True)
        self.app_container_name = app_container_name
        self.app_volume_name = app_volume_name
        self.reconstruct_docker_run_command = reconstruct_docker_run_command_fn
        self.generate_docker_compose = generate_docker_compose_fn
        self.audit_log_manager = audit_log_manager
    
    def preview_backup(self, filename: str) -> Dict:
        """Preview backup contents without restoring"""
        backup_path = os.path.join(self.backup_dir, filename)
        
        if not os.path.exists(backup_path):
            return {'error': 'Backup file not found'}
        
        try:
            with tarfile.open(backup_path, 'r:gz') as tar:
                # Read container config
                try:
                    config_file = tar.getmember('./container_config.json')
                except KeyError:
                    return {'error': 'Invalid backup: missing container config'}
                
                config_str = tar.extractfile(config_file).read().decode('utf-8')
                inspect_data = json.loads(config_str)
                
                # Read metadata if available
                metadata = {}
                try:
                    metadata_file = tar.getmember('./backup_metadata.json')
                    metadata_str = tar.extractfile(metadata_file).read().decode('utf-8')
                    metadata = json.loads(metadata_str)
                except KeyError:
                    pass
                
                # Read volumes info
                volumes_info = []
                try:
                    volumes_info_file = tar.getmember('./volumes_info.json')
                    volumes_info_str = tar.extractfile(volumes_info_file).read().decode('utf-8')
                    volumes_info = json.loads(volumes_info_str)
                except KeyError:
                    pass
                
                # Read docker run command
                docker_run_cmd = None
                try:
                    run_command_file = tar.getmember('./docker_run_command.txt')
                    docker_run_cmd = tar.extractfile(run_command_file).read().decode('utf-8')
                except KeyError:
                    pass
                
                # Read docker-compose
                docker_compose = None
                try:
                    compose_file = tar.getmember('./docker-compose.yml')
                    docker_compose = tar.extractfile(compose_file).read().decode('utf-8')
                except KeyError:
                    pass
                
                # Check if image is backed up
                image_backed_up = False
                try:
                    image_member = tar.getmember('./image.tar')
                    # Check if it's a placeholder file
                    if image_member.size > 100:
                        image_backed_up = True
                except KeyError:
                    pass
                
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
                
                # Check for existing volumes
                existing_volumes = []
                for vol_info in volumes_info:
                    if vol_info.get('type') == 'volume':
                        vol_name = vol_info.get('name', '')
                        if vol_name:
                            import subprocess
                            vol_check = subprocess.run(['docker', 'volume', 'inspect', vol_name],
                                                     capture_output=True, text=True, timeout=5)
                            if vol_check.returncode == 0:
                                existing_volumes.append(vol_name)
                
                return {
                    'success': True,
                    'container_name': inspect_data.get('Name', '').lstrip('/'),
                    'image': metadata.get('image', inspect_data.get('Config', {}).get('Image', 'unknown')),
                    'image_backed_up': image_backed_up,
                    'status': metadata.get('status', 'unknown'),
                    'backup_date': metadata.get('backup_date', 'unknown'),
                    'volumes': volumes_info,
                    'existing_volumes': existing_volumes,
                    'port_mappings': port_mappings,
                    'docker_run_command': docker_run_cmd,
                    'docker_compose': docker_compose,
                    'config': inspect_data
                }
        except tarfile.TarError:
            return {'error': 'Invalid tar.gz file'}
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {'error': f'Failed to preview backup: {str(e)}'}
    
    def restore_backup(self, backup_file_path: str, new_name: str = '', overwrite_volumes: Optional[bool] = None, 
                      port_overrides: Optional[Dict[str, str]] = None, user: Optional[str] = None) -> Dict:
        """
        Restore a backup and deploy the container
        
        Args:
            backup_file_path: Path to the backup tar.gz file
            new_name: Optional new name for the container
            overwrite_volumes: Whether to overwrite existing volumes (None = prompt, True = overwrite, False = skip)
            port_overrides: Optional dict of port mappings to override (e.g., {'80/tcp': '8080'})
            user: Username performing the restore (for audit log)
            
        Returns:
            Dict with success status and container info
        """
        backup_filename = os.path.basename(backup_file_path)
        
        if not os.path.exists(backup_file_path):
            return {'error': 'Backup file not found'}
        
        # Log restore start
        if self.audit_log_manager:
            self.audit_log_manager.log_event(
                operation_type='restore',
                status='started',
                backup_filename=backup_filename,
                user=user,
                details={'new_name': new_name, 'overwrite_volumes': overwrite_volumes}
            )
        
        try:
            with tarfile.open(backup_file_path, 'r:gz') as tar:
                # Read container config
                try:
                    config_file = tar.getmember('./container_config.json')
                except KeyError:
                    return {'error': 'Invalid backup: missing container config'}
                
                config_str = tar.extractfile(config_file).read().decode('utf-8')
                inspect_data = json.loads(config_str)
                
                # Check stack info
                stack_info = None
                config = inspect_data.get('Config', {}) or {}
                labels = config.get('Labels', {}) or {}
                stack_project = labels.get('com.docker.compose.project', '')
                stack_service = labels.get('com.docker.compose.service', '')
                
                if stack_project:
                    stack_exists = False
                    try:
                        stack_services_result = subprocess.run(
                            ['docker', 'stack', 'services', stack_project, '--format', '{{.Name}}'],
                            capture_output=True, text=True, timeout=5
                        )
                        if stack_services_result.returncode == 0 and stack_services_result.stdout.strip():
                            stack_exists = True
                        else:
                            check_result = subprocess.run(
                                ['docker', 'ps', '-a', '--filter', f'label=com.docker.compose.project={stack_project}', '--format', '{{.ID}}'],
                                capture_output=True, text=True, timeout=5
                            )
                            if check_result.returncode == 0 and check_result.stdout.strip():
                                container_ids = [cid.strip() for cid in check_result.stdout.strip().split('\n') if cid.strip()]
                                stack_exists = len(container_ids) > 0
                    except Exception as e:
                        print(f"⚠️  Warning: Could not check stack existence: {e}")
                    
                    stack_info = {
                        'project': stack_project,
                        'service': stack_service,
                        'exists': stack_exists
                    }
                
                # Generate docker run command
                docker_run_cmd = None
                try:
                    docker_run_cmd = self.reconstruct_docker_run_command(inspect_data, port_overrides)
                    print("ℹ️  Using regenerated Docker run command")
                except Exception as e:
                    print(f"⚠️  Warning: Failed to regenerate run command: {e}")
                    try:
                        run_command_file = tar.getmember('./docker_run_command.txt')
                        docker_run_cmd = tar.extractfile(run_command_file).read().decode('utf-8')
                        print("ℹ️  Using stored Docker run command from backup")
                    except KeyError:
                        pass
                
                if not docker_run_cmd:
                    return {'error': 'Could not determine Docker run command'}
                
                # Modify container name if provided
                if new_name:
                    docker_run_cmd = re.sub(r'--name\s+\S+', f'--name {new_name}', docker_run_cmd)
                
                # Restore volumes if needed
                should_restore_volumes = './volumes_info.json' in [m.name for m in tar.getmembers()] and overwrite_volumes is not False
                
                if should_restore_volumes:
                    volumes_info_file = tar.getmember('./volumes_info.json')
                    volumes_info_str = tar.extractfile(volumes_info_file).read().decode('utf-8')
                    volumes_info = json.loads(volumes_info_str)
                    
                    temp_volumes_dir = tempfile.mkdtemp()
                    tar.extractall(path=temp_volumes_dir, members=[m for m in tar.getmembers() if 'volumes/' in m.name and not m.name.endswith('volumes/')])
                    
                    for vol_info in volumes_info:
                        if vol_info.get('type') == 'volume':
                            vol_name = vol_info.get('name', '')
                            vol_data_file = os.path.join(temp_volumes_dir, 'volumes', f"{vol_name}_data.tar.gz")
                            
                            if not os.path.exists(vol_data_file):
                                possible_paths = glob.glob(os.path.join(temp_volumes_dir, '**', f"{vol_name}_data.tar.gz"), recursive=True)
                                if possible_paths:
                                    vol_data_file = possible_paths[0]
                            
                            if os.path.exists(vol_data_file):
                                try:
                                    subprocess.run(['docker', 'volume', 'create', vol_name], capture_output=True, text=True, timeout=10)
                                    
                                    temp_restore_name = f"restore-temp-{vol_name}-{os.urandom(4).hex()}"
                                    try:
                                        subprocess.run(
                                            ['docker', 'run', '-d', '--name', temp_restore_name,
                                             '-v', f'{vol_name}:/restore-volume',
                                             'busybox', 'sleep', '3600'],
                                            capture_output=True, timeout=30
                                        )
                                        
                                        subprocess.run(
                                            ['docker', 'exec', temp_restore_name, 'sh', '-c', 'rm -rf /restore-volume/* /restore-volume/.[!.]* 2>/dev/null || true'],
                                            capture_output=True, timeout=10
                                        )
                                        
                                        subprocess.run(
                                            ['docker', 'cp', vol_data_file, f'{temp_restore_name}:/tmp/volume_data.tar.gz'],
                                            capture_output=True, text=True, timeout=60
                                        )
                                        
                                        extract_result = subprocess.run(
                                            ['docker', 'exec', temp_restore_name, 'tar', 'xzf', '/tmp/volume_data.tar.gz', '-C', '/restore-volume'],
                                            capture_output=True, text=True, timeout=1200
                                        )
                                        
                                        if extract_result.returncode != 0:
                                            raise Exception(f"Failed to restore volume {vol_name}: {extract_result.stderr}")
                                        
                                        subprocess.run(['docker', 'rm', '-f', temp_restore_name], capture_output=True, timeout=10)
                                        print(f"✅ Volume restored: {vol_name}")
                                    except Exception as e:
                                        subprocess.run(['docker', 'rm', '-f', temp_restore_name], capture_output=True, timeout=10)
                                        print(f"⚠️  Warning: Could not restore volume {vol_name}: {e}")
                                except Exception as e:
                                    print(f"⚠️  Warning: Could not restore volume {vol_name}: {e}")
                    
                    shutil.rmtree(temp_volumes_dir, ignore_errors=True)
                
                # Load image if available
                try:
                    image_member = tar.getmember('./image.tar')
                    temp_image_dir = tempfile.mkdtemp()
                    image_file = os.path.join(temp_image_dir, 'image.tar')
                    
                    with tar.extractfile(image_member) as source, open(image_file, 'wb') as dest:
                        header = source.read(30)
                        if not header.startswith(b'# Image export failed'):
                            dest.write(header)
                            shutil.copyfileobj(source, dest)
                    
                    if os.path.getsize(image_file) > 100:
                        result = subprocess.run(['docker', 'load', '-i', image_file], capture_output=True, text=True, timeout=1200)
                        if result.returncode == 0:
                            print(f"✅ Image loaded successfully")
                    
                    if os.path.exists(image_file):
                        os.remove(image_file)
                    if os.path.exists(temp_image_dir):
                        os.rmdir(temp_image_dir)
                except KeyError:
                    print("⚠️  Warning: No image.tar found in backup")
                
                # Create networks if needed
                network_settings = inspect_data.get('NetworkSettings', {}) or {}
                networks = network_settings.get('Networks', {}) or {}
                host_config = inspect_data.get('HostConfig', {}) or {}
                network_mode = host_config.get('NetworkMode', '')
                
                if networks and isinstance(networks, dict):
                    for network_name, network_info in networks.items():
                        if network_name not in ['bridge', 'host', 'none']:
                            check_result = subprocess.run(['docker', 'network', 'inspect', network_name],
                                                         capture_output=True, text=True, timeout=5)
                            if check_result.returncode != 0:
                                create_cmd = ['docker', 'network', 'create']
                                gateway = network_info.get('Gateway', '')
                                ip_prefix_len = network_info.get('IPPrefixLen', 0)
                                
                                if gateway and ip_prefix_len:
                                    gateway_parts = gateway.split('.')
                                    if len(gateway_parts) == 4:
                                        subnet_parts = gateway_parts[:3] + ['0']
                                        subnet = '.'.join(subnet_parts) + f'/{ip_prefix_len}'
                                        create_cmd.extend(['--subnet', subnet, '--gateway', gateway])
                                
                                create_cmd.append(network_name)
                                subprocess.run(create_cmd, capture_output=True, text=True, timeout=10)
                
                # Parse and execute docker run command
                docker_run_cmd = docker_run_cmd.replace('\\\n', ' ').replace('\n', ' ')
                try:
                    cmd_parts = shlex.split(docker_run_cmd)
                except ValueError:
                    cmd_parts = docker_run_cmd.split()
                
                while cmd_parts and cmd_parts[0] in ['docker', 'run']:
                    cmd_parts.pop(0)
                
                cmd_parts = [part for part in cmd_parts if part not in ['-d', '--detach']]
                
                # Remove --ip flag if on default network
                network_name = None
                ip_index = None
                for i, part in enumerate(cmd_parts):
                    if part == '--network' and i + 1 < len(cmd_parts):
                        network_name = cmd_parts[i + 1]
                    if part == '--ip' and i + 1 < len(cmd_parts):
                        ip_index = i
                if ip_index is not None:
                    if not network_name or network_name in ['bridge', 'default']:
                        del cmd_parts[ip_index:ip_index + 2]
                
                docker_cmd = ['docker', 'create'] + cmd_parts
                print(f"🔧 Executing: {' '.join(docker_cmd)}")
                
                result = subprocess.run(docker_cmd, capture_output=True, text=True, timeout=60)
                container_id_raw = result.stdout.strip() if result.stdout.strip() else None
                
                if result.returncode != 0:
                    error_msg = result.stderr.lower()
                    if 'already in use' in error_msg or 'name is already in use' in error_msg:
                        if new_name:
                            container_name = new_name
                        else:
                            container_name = inspect_data.get('Name', '').lstrip('/')
                        
                        find_result = subprocess.run(
                            ['docker', 'ps', '-a', '--filter', f'name=^{container_name}$', '--format', '{{.ID}}'],
                            capture_output=True, text=True, timeout=10
                        )
                        if find_result.returncode == 0 and find_result.stdout.strip():
                            container_id_raw = find_result.stdout.strip()
                        else:
                            return {'error': f'Container name conflict: {result.stderr}'}
                    else:
                        return {'error': f'Failed to restore container: {result.stderr}'}
                
                # Validate and clean container ID
                container_id = None
                if container_id_raw:
                    # Extract just the container ID (first line, first 64 chars max)
                    container_id_raw = container_id_raw.split('\n')[0].strip()
                    # Docker IDs are 64 hex characters, but we'll take the first valid ID-like string
                    import re
                    id_match = re.search(r'([a-f0-9]{12,64})', container_id_raw)
                    if id_match:
                        container_id = id_match.group(1)
                    else:
                        container_id = container_id_raw[:64]  # Fallback: take first 64 chars
                
                # Verify container exists and get short ID
                if container_id:
                    verify_result = subprocess.run(
                        ['docker', 'ps', '-a', '--filter', f'id={container_id}', '--format', '{{.ID}}'],
                        capture_output=True, text=True, timeout=10
                    )
                    if verify_result.returncode == 0 and verify_result.stdout.strip():
                        verified_id = verify_result.stdout.strip()
                        # Use short ID (12 chars) for display
                        container_id = verified_id[:12]
                
                container_name_final = new_name or inspect_data.get('Name', '').lstrip('/')
                
                response_data = {
                    'success': True,
                    'message': 'Container restored successfully',
                    'container_id': container_id,
                    'container_name': container_name_final
                }
                
                if stack_info:
                    response_data['stack_info'] = stack_info
                    if not stack_info.get('exists'):
                        response_data['stack_warning'] = f"Stack '{stack_info['project']}' does not exist. Container restored with stack labels but may need to be added back to the stack manually."
                
                # Log restore completion
                if self.audit_log_manager:
                    self.audit_log_manager.log_event(
                        operation_type='restore',
                        status='completed',
                        container_id=container_id,
                        container_name=container_name_final,
                        backup_filename=backup_filename,
                        user=user,
                        details={'new_name': new_name, 'overwrite_volumes': overwrite_volumes}
                    )
                
                return response_data
                
        except tarfile.TarError:
            error_msg = 'Invalid tar.gz file'
            if self.audit_log_manager:
                self.audit_log_manager.log_event(
                    operation_type='restore',
                    status='error',
                    backup_filename=backup_filename,
                    error_message=error_msg,
                    user=user
                )
            return {'error': error_msg}
        except subprocess.TimeoutExpired:
            error_msg = 'Restore operation timed out'
            if self.audit_log_manager:
                self.audit_log_manager.log_event(
                    operation_type='restore',
                    status='error',
                    backup_filename=backup_filename,
                    error_message=error_msg,
                    user=user
                )
            return {'error': error_msg}
        except Exception as e:
            import traceback
            traceback.print_exc()
            error_msg = f'Restore failed: {str(e)}'
            if self.audit_log_manager:
                self.audit_log_manager.log_event(
                    operation_type='restore',
                    status='error',
                    backup_filename=backup_filename,
                    error_message=error_msg,
                    user=user
                )
            return {'error': error_msg}

