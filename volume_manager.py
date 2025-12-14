"""
Volume Manager Module
Handles all Docker volume operations
"""
import os
import subprocess
import json
from typing import Dict, List, Any, Optional
import docker_utils
from docker_utils import APP_VOLUME_NAME
from system_manager import format_size
from error_utils import safe_log_error


class VolumeManager:
    """Manages Docker volume operations"""
    
    def __init__(self):
        """Initialize VolumeManager"""
        pass
    
    def list_volumes(self) -> Dict[str, Any]:
        """List all Docker volumes"""
        docker_api_client = docker_utils.docker_api_client
        if not docker_api_client:
            return {'error': 'Docker client not available'}
        
        try:
            volumes_list = docker_api_client.list_volumes()
            
            volumes_in_use = {}
            container_stacks = {}  # Map container_name to stack name
            try:
                containers_result = subprocess.run(
                    ['docker', 'ps', '-a', '--format', '{{.ID}}\t{{.Names}}'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if containers_result.returncode == 0:
                    for line in containers_result.stdout.strip().split('\n'):
                        if not line.strip():
                            continue
                        parts = line.split('\t')
                        if len(parts) >= 2:
                            container_id = parts[0]
                            container_name = parts[1].lstrip('/')
                            
                            # Get stack information from container labels
                            try:
                                labels_result = subprocess.run(
                                    ['docker', 'inspect', '--format', '{{json .Config.Labels}}', container_id],
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                if labels_result.returncode == 0:
                                    labels_data = json.loads(labels_result.stdout)
                                    if isinstance(labels_data, dict):
                                        stack_name = labels_data.get('com.docker.compose.project', '') or labels_data.get('com.docker.stack.namespace', '')
                                        if stack_name:
                                            container_stacks[container_name] = stack_name
                            except:
                                pass
                            
                            try:
                                inspect_result = subprocess.run(
                                    ['docker', 'inspect', '--format', '{{json .Mounts}}', container_id],
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                if inspect_result.returncode == 0:
                                    mounts_data = json.loads(inspect_result.stdout)
                                    if isinstance(mounts_data, list):
                                        for mount in mounts_data:
                                            if isinstance(mount, dict) and mount.get('Type') == 'volume':
                                                volume_name = mount.get('Name', '')
                                                if volume_name:
                                                    if volume_name not in volumes_in_use:
                                                        volumes_in_use[volume_name] = []
                                                    volumes_in_use[volume_name].append(container_name)
                            except:
                                pass
            except:
                pass
            
            volumes_with_details = []
            for vol_summary in volumes_list:
                volume_name = vol_summary.get('Name')
                if not volume_name:
                    continue

                mountpoint = vol_summary.get('Mountpoint')
                size_str = "N/A"
                
                if mountpoint and os.path.exists(mountpoint):
                    try:
                        du_result = subprocess.run(
                            ['du', '-sb', mountpoint],
                            capture_output=True, text=True, timeout=5
                        )
                        if du_result.returncode == 0:
                            size_bytes = int(du_result.stdout.split()[0])
                            size_str = format_size(size_bytes)
                    except Exception as e:
                        print(f"Could not get size for volume {volume_name} at {mountpoint}: {e}")

                is_self = volume_name == APP_VOLUME_NAME
                containers_using = volumes_in_use.get(volume_name, [])
                in_use = len(containers_using) > 0
                
                # Determine stack by checking containers that use this volume
                stack_name = None
                if containers_using:
                    for container_name in containers_using:
                        if container_name in container_stacks:
                            stack_name = container_stacks[container_name]
                            break  # Use first stack found
                
                vol_details = {
                    'name': volume_name,
                    'driver': vol_summary.get('Driver'),
                    'mountpoint': mountpoint,
                    'is_self': is_self,
                    'size': size_str,
                    'created': vol_summary.get('CreatedAt', ''),
                    'labels': vol_summary.get('Labels', {}) or {},
                    'options': vol_summary.get('Options', {}) or {},
                    'in_use': in_use,
                    'containers': containers_using,
                    'stack': stack_name,
                }
                volumes_with_details.append(vol_details)

            volumes_needing_size = [v for v in volumes_with_details if v['size'] == 'N/A']
            if volumes_needing_size:
                try:
                    df_result = subprocess.run(
                        ['docker', 'system', 'df', '-v'],
                        capture_output=True, text=True, timeout=10
                    )
                    if df_result.returncode == 0:
                        output_lines = df_result.stdout.split('\n')
                        in_volumes_section = False
                        size_map = {}
                        
                        for line in output_lines:
                            line = line.strip()
                            if 'LOCAL VOLUMES' in line.upper() or 'VOLUME NAME' in line.upper():
                                in_volumes_section = True
                                continue
                            if in_volumes_section:
                                if not line or line.startswith('-') or 'SIZE' in line.upper():
                                    continue
                                parts = line.split()
                                if len(parts) >= 3:
                                    vol_name = parts[0]
                                    size_str = parts[2]
                                    size_map[vol_name] = size_str
                                elif len(parts) == 2:
                                    vol_name = parts[0]
                                    if any(unit in parts[1].upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                                        size_str = parts[1]
                                        size_map[vol_name] = size_str
                                if line and not any(c.isalnum() for c in line):
                                    break
                        
                        for vol in volumes_needing_size:
                            if vol['name'] in size_map:
                                vol['size'] = size_map[vol['name']]
                except Exception as e:
                    print(f"Warning: Could not get volume sizes via 'docker system df -v': {e}")
                
                volumes_still_needing_size = [v for v in volumes_needing_size if v['size'] == 'N/A']
                docker_api_client = docker_utils.docker_api_client
                if volumes_still_needing_size and docker_api_client:
                    for vol in volumes_still_needing_size:
                        try:
                            inspect_data = docker_api_client.inspect_volume(vol['name'])
                            usage_data = inspect_data.get('UsageData')
                            if usage_data and 'Size' in usage_data:
                                size_bytes = usage_data['Size']
                                vol['size'] = format_size(size_bytes)
                        except Exception:
                            pass

            return {'volumes': volumes_with_details}
        except Exception as e:
            safe_log_error(e, context="list_volumes")
            return {'error': 'Failed to list volumes'}
    
    def explore_volume(self, volume_name: str, path: str = '/') -> Dict[str, Any]:
        """Explore files in a Docker volume"""
        if '..' in path or not path.startswith('/'):
            path = '/'
        
        try:
            temp_container_name = f"explore-temp-{volume_name}-{os.urandom(4).hex()}"
            
            try:
                create_result = subprocess.run(
                    ['docker', 'run', '-d', '--name', temp_container_name,
                     '-v', f'{volume_name}:/volume',
                     'busybox', 'sleep', '3600'],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if create_result.returncode != 0:
                    raise Exception(f"Failed to create temp container: {create_result.stderr}")
                
                volume_path = f'/volume{path}'
                if not volume_path.endswith('/') and path != '/':
                    volume_path += '/'
                
                ls_result = subprocess.run(
                    ['docker', 'exec', temp_container_name, 'sh', '-c', 
                     f'cd {volume_path} && ls -la 2>&1'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                files = []
                
                if ls_result.returncode == 0 and ls_result.stdout:
                    lines = ls_result.stdout.strip().split('\n')
                    for line in lines:
                        if not line.strip() or line.startswith('total'):
                            continue
                        
                        parts = line.split()
                        if len(parts) >= 9:
                            file_type = 'directory' if parts[0].startswith('d') else 'file'
                            file_name = ' '.join(parts[8:])
                            
                            if file_name not in ['.', '..']:
                                if path == '/':
                                    file_path = f"/{file_name}"
                                else:
                                    file_path = f"{path.rstrip('/')}/{file_name}"
                                
                                files.append({
                                    'name': file_name,
                                    'path': file_path,
                                    'type': file_type,
                                    'size': parts[4] if len(parts) > 4 else '0',
                                    'permissions': parts[0],
                                    'modified': ' '.join(parts[5:8]) if len(parts) > 7 else ''
                                })
                
                if not files:
                    find_result = subprocess.run(
                        ['docker', 'exec', temp_container_name, 'sh', '-c',
                         f'find {volume_path} -maxdepth 1 ! -path {volume_path} -print'],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if find_result.returncode == 0 and find_result.stdout:
                        for line in find_result.stdout.strip().split('\n'):
                            if not line.strip():
                                continue
                            file_path_full = line.strip()
                            file_name = os.path.basename(file_path_full)
                            
                            if file_name:
                                check_type = subprocess.run(
                                    ['docker', 'exec', temp_container_name, 'test', '-d', file_path_full],
                                    capture_output=True,
                                    timeout=5
                                )
                                file_type = 'directory' if check_type.returncode == 0 else 'file'
                                
                                rel_path = file_path_full.replace('/volume', '')
                                if not rel_path.startswith('/'):
                                    rel_path = '/' + rel_path
                                
                                files.append({
                                    'name': file_name,
                                    'path': rel_path,
                                    'type': file_type,
                                    'size': '0',
                                    'permissions': '',
                                    'modified': ''
                                })
                
                if not files and ls_result.returncode != 0:
                    raise Exception(f"Failed to list files: {ls_result.stderr}")
                
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
                
                return {
                    'volume': volume_name,
                    'path': path,
                    'files': files
                }
                
            except subprocess.TimeoutExpired:
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
                raise Exception("Volume exploration timed out")
            except Exception as e:
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
                raise
                
        except Exception as e:
            return {'error': str(e)}
    
    def get_volume_file(self, volume_name: str, file_path: str) -> Dict[str, Any]:
        """Get file contents from a Docker volume"""
        if not file_path:
            return {'error': 'File path required'}
        
        if '..' in file_path:
            return {'error': 'Invalid file path'}
        
        try:
            temp_container_name = f"read-temp-{volume_name}-{os.urandom(4).hex()}"
            
            try:
                create_result = subprocess.run(
                    ['docker', 'run', '-d', '--name', temp_container_name,
                     '-v', f'{volume_name}:/volume',
                     'busybox', 'sleep', '3600'],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if create_result.returncode != 0:
                    raise Exception(f"Failed to create temp container: {create_result.stderr}")
                
                read_result = subprocess.run(
                    ['docker', 'exec', temp_container_name, 'cat', f'/volume{file_path}'],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
                
                if read_result.returncode != 0:
                    return {'error': f"Failed to read file: {read_result.stderr}"}
                
                return {
                    'volume': volume_name,
                    'path': file_path,
                    'content': read_result.stdout,
                    'size': len(read_result.stdout)
                }
                
            except subprocess.TimeoutExpired:
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
                raise Exception("File read timed out")
            except Exception as e:
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
                raise
                
        except Exception as e:
            return {'error': str(e)}
    
    def download_volume_file(self, volume_name: str, file_path: str) -> bytes:
        """Download a file from a Docker volume (returns file content as bytes)"""
        if not file_path:
            raise Exception('File path required')
        
        if '..' in file_path:
            raise Exception('Invalid file path')
        
        temp_container_name = f"download-temp-{volume_name}-{os.urandom(4).hex()}"
        
        try:
            create_result = subprocess.run(
                ['docker', 'run', '-d', '--name', temp_container_name,
                 '-v', f'{volume_name}:/volume',
                 'busybox', 'sleep', '3600'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if create_result.returncode != 0:
                raise Exception(f"Failed to create temp container: {create_result.stderr}")
            
            read_result = subprocess.run(
                ['docker', 'exec', temp_container_name, 'cat', f'/volume{file_path}'],
                capture_output=True,
                timeout=30
            )
            
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            
            if read_result.returncode != 0:
                raise Exception(f"Failed to read file: {read_result.stderr.decode('utf-8', errors='ignore')}")
            
            return read_result.stdout
            
        except subprocess.TimeoutExpired:
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise Exception("File download timed out")
        except Exception as e:
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise
    
    def delete_volume(self, volume_name: str) -> Dict[str, Any]:
        """Delete a Docker volume"""
        volume_name = os.path.basename(volume_name)
        
        try:
            result = subprocess.run(
                ['docker', 'volume', 'rm', volume_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                error_msg = result.stderr
                if 'in use' in error_msg.lower() or 'is being used' in error_msg.lower():
                    return {
                        'error': error_msg,
                        'in_use': True,
                        'message': f'Volume "{volume_name}" is in use by one or more containers and cannot be deleted.'
                    }
                
                return {'error': error_msg}
            
            return {'success': True, 'message': 'Volume deleted'}
        except Exception as e:
            return {'error': str(e)}
    
    def delete_volumes(self, volume_names: List[str]) -> Dict[str, Any]:
        """Delete multiple Docker volumes"""
        deleted_count = 0
        errors = []
        in_use_volumes = []
        
        for volume_name in volume_names:
            result = self.delete_volume(volume_name)
            if result.get('success'):
                deleted_count += 1
            elif result.get('in_use'):
                in_use_volumes.append(volume_name)
                errors.append(f"{volume_name}: {result.get('message', 'Volume is in use')}")
            else:
                errors.append(f"{volume_name}: {result.get('error', 'Unknown error')}")
        
        message = f'Deleted {deleted_count} volume(s)'
        if in_use_volumes:
            message += f'. {len(in_use_volumes)} volume(s) are in use and were not deleted.'
        if errors and deleted_count == 0:
            message = 'Failed to delete volumes'
        
        return {
            'success': deleted_count > 0,
            'message': message,
            'deleted_count': deleted_count,
            'errors': errors if errors else None,
            'in_use_volumes': in_use_volumes if in_use_volumes else None
        }

