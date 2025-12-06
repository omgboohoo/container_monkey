"""
Container Manager Module
Handles all container operations
"""
import json
import subprocess
import shlex
from typing import Dict, List, Optional, Any
from datetime import datetime
import docker_utils
from docker_utils import APP_CONTAINER_NAME, reconstruct_docker_run_command


class ContainerManager:
    """Manages container operations"""
    
    def __init__(self):
        """Initialize ContainerManager"""
        pass
    
    def list_containers(self) -> Dict[str, Any]:
        """List all containers"""
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                containers = docker_api_client.list_containers(all=True)
                container_list = []
                
                for container in containers:
                    names = container.get('Names', [])
                    if names is None:
                        names = ['']
                    
                    container_name = names[0].lstrip('/') if names else ''
                    if container_name.startswith('backup-temp-') or container_name.startswith('restore-temp-'):
                        continue
                    is_self = container_name == APP_CONTAINER_NAME
                    
                    ports = container.get('Ports', [])
                    if ports is None:
                        ports = []
                    
                    container_id = container.get('Id', '')
                    ip_address = 'N/A'
                    port_mappings = []
                    associated_volumes = []
                    image_info = {}
                    
                    try:
                        inspect_data = docker_api_client.inspect_container(container_id)
                        network_settings = inspect_data.get('NetworkSettings', {}) or {}
                        networks = network_settings.get('Networks', {}) or {}
                        network_names = list(networks.keys()) if isinstance(networks, dict) else []
                        
                        for network_name, network_info in networks.items():
                            if isinstance(network_info, dict):
                                ip = network_info.get('IPAddress', '')
                                if ip:
                                    ip_address = ip
                                    break
                        
                        host_config = inspect_data.get('HostConfig', {}) or {}
                        port_bindings = host_config.get('PortBindings', {}) or {}
                        if port_bindings and isinstance(port_bindings, dict):
                            for container_port, host_bindings in port_bindings.items():
                                if host_bindings and isinstance(host_bindings, list) and len(host_bindings) > 0:
                                    host_binding = host_bindings[0]
                                    if isinstance(host_binding, dict):
                                        host_port = host_binding.get('HostPort', '')
                                        host_ip = host_binding.get('HostIp', '0.0.0.0')
                                        if host_port:
                                            port_mappings.append({
                                                'host': f"{host_ip}:{host_port}",
                                                'container': container_port,
                                                'display': f"{host_port}:{container_port.split('/')[0]}"
                                            })
                        
                        mounts = inspect_data.get('Mounts', []) or []
                        if isinstance(mounts, list):
                            for mount in mounts:
                                if isinstance(mount, dict) and mount.get('Type') == 'volume':
                                    volume_name = mount.get('Name', '')
                                    if volume_name:
                                        associated_volumes.append({
                                            'name': volume_name,
                                            'destination': mount.get('Destination', ''),
                                            'driver': mount.get('Driver', ''),
                                        })
                        
                        config = inspect_data.get('Config', {}) or {}
                        image_name = config.get('Image', '')
                        image_id = inspect_data.get('Image', '')
                        if image_name:
                            image_info = {
                                'name': image_name,
                                'id': image_id[:12] if image_id else '',
                            }
                        
                        labels = config.get('Labels', {}) or {}
                        stack_name = labels.get('com.docker.compose.project', '') or labels.get('com.docker.stack.namespace', '')
                        stack_service = labels.get('com.docker.compose.service', '') or labels.get('com.docker.swarm.service.name', '')
                        stack_info = None
                        if stack_name:
                            stack_info = {
                                'name': stack_name,
                                'service': stack_service,
                                'display': stack_name
                            }
                    except:
                        network_names = []
                        stack_info = None
                        if ports and isinstance(ports, list):
                            for port_info in ports:
                                if isinstance(port_info, dict):
                                    host_port = port_info.get('PublicPort', '')
                                    container_port = port_info.get('PrivatePort', '')
                                    if host_port and container_port:
                                        port_mappings.append({
                                            'host': f"0.0.0.0:{host_port}",
                                            'container': f"{container_port}/{port_info.get('Type', 'tcp')}",
                                            'display': f"{host_port}:{container_port}"
                                        })
                    
                    status_text = container.get('Status', 'unknown')
                    is_running = status_text.lower().startswith('up') or 'running' in status_text.lower()
                    status_display = 'running' if is_running else 'stopped'
                    
                    if 'stack_info' not in locals():
                        stack_info = None
                    if 'network_names' not in locals():
                        network_names = []
                    
                    # Handle Created timestamp - Docker API returns Unix timestamp in seconds
                    created_timestamp = container.get('Created', 0)
                    if created_timestamp and isinstance(created_timestamp, (int, float)) and created_timestamp > 0:
                        # Convert seconds to milliseconds for JavaScript Date constructor
                        created_timestamp = int(created_timestamp * 1000)
                    
                    container_info = {
                        'id': container_id[:12] if container_id else '',
                        'name': names[0].lstrip('/') if names else '',
                        'image': container.get('Image', 'unknown'),
                        'status': status_display,
                        'status_text': status_text,
                        'created': created_timestamp,
                        'ports': ports,
                        'ip_address': ip_address,
                        'port_mappings': port_mappings,
                        'volumes': associated_volumes,
                        'image_info': image_info,
                        'stack_info': stack_info,
                        'networks': network_names,
                        'is_self': is_self,
                    }
                    container_list.append(container_info)
                
                return {'containers': container_list}
            except Exception as e:
                print(f"Direct API client error: {e}")
                import traceback
                traceback.print_exc()
                cli_containers = self._get_containers_via_cli()
                if cli_containers is not None:
                    return {'containers': cli_containers}
                return {'error': str(e)}
        
        cli_containers = self._get_containers_via_cli()
        if cli_containers is not None:
            return {'containers': cli_containers}
        
        return {
            'error': 'Docker client not available',
            'message': 'Docker daemon is not accessible. Please ensure Docker is running and you have permission to access it.',
            'help': 'Run ./add-to-docker-group.sh to fix permissions'
        }
    
    def _get_containers_via_cli(self) -> Optional[List[Dict[str, Any]]]:
        """Fallback: Get containers using docker CLI"""
        try:
            result = subprocess.run(
                ['docker', 'ps', '-a', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.CreatedAt}}\t{{.Ports}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                return None
            
            containers = []
            for line in result.stdout.strip().split('\n'):
                if not line:
                    continue
                parts = line.split('\t')
                if len(parts) >= 6:
                    container_id = parts[0]
                    container_name = parts[1].lstrip('/') if len(parts) > 1 else ''
                    
                    if container_name.startswith('backup-temp-') or container_name.startswith('restore-temp-'):
                        continue
                    is_self = container_name == APP_CONTAINER_NAME
                    
                    ports_str = parts[5] if len(parts) > 5 else ''
                    ip_address = 'N/A'
                    port_mappings = []
                    
                    try:
                        inspect_result = subprocess.run(
                            ['docker', 'inspect', container_id, '--format', '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if inspect_result.returncode == 0 and inspect_result.stdout.strip():
                            ip_address = inspect_result.stdout.strip()
                        
                        ports_result = subprocess.run(
                            ['docker', 'inspect', container_id, '--format', '{{json .HostConfig.PortBindings}}'],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if ports_result.returncode == 0:
                            port_bindings = json.loads(ports_result.stdout or '{}')
                            if port_bindings:
                                for container_port, host_bindings in port_bindings.items():
                                    if host_bindings and len(host_bindings) > 0:
                                        host_binding = host_bindings[0]
                                        host_port = host_binding.get('HostPort', '')
                                        host_ip = host_binding.get('HostIp', '0.0.0.0')
                                        if host_port:
                                            port_mappings.append({
                                                'host': f"{host_ip}:{host_port}",
                                                'container': container_port,
                                                'display': f"{host_port}:{container_port.split('/')[0]}"
                                            })
                    except:
                        pass
                    
                    status_text = parts[3] if len(parts) > 3 else 'unknown'
                    is_running = status_text.lower().startswith('up') or 'running' in status_text.lower()
                    status_display = 'running' if is_running else 'stopped'
                    
                    associated_volumes = []
                    image_info = {}
                    network_names = []
                    stack_info = None
                    
                    try:
                        inspect_result = subprocess.run(
                            ['docker', 'inspect', container_id],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if inspect_result.returncode == 0:
                            inspect_data = json.loads(inspect_result.stdout)
                            if inspect_data and len(inspect_data) > 0:
                                container_data = inspect_data[0]
                                mounts = container_data.get('Mounts', []) or []
                                if isinstance(mounts, list):
                                    for mount in mounts:
                                        if isinstance(mount, dict) and mount.get('Type') == 'volume':
                                            volume_name = mount.get('Name', '')
                                            if volume_name:
                                                associated_volumes.append({
                                                    'name': volume_name,
                                                    'destination': mount.get('Destination', ''),
                                                    'driver': mount.get('Driver', ''),
                                                })
                                config = container_data.get('Config', {}) or {}
                                image_name = config.get('Image', parts[2] if len(parts) > 2 else 'unknown')
                                image_id = container_data.get('Image', '')
                                if image_name:
                                    image_info = {
                                        'name': image_name,
                                        'id': image_id[:12] if image_id else '',
                                    }
                                network_settings = container_data.get('NetworkSettings', {}) or {}
                                networks = network_settings.get('Networks', {}) or {}
                                network_names = list(networks.keys()) if isinstance(networks, dict) else []
                                labels = config.get('Labels', {}) or {}
                                stack_name = labels.get('com.docker.compose.project', '') or labels.get('com.docker.stack.namespace', '')
                                stack_service = labels.get('com.docker.compose.service', '') or labels.get('com.docker.swarm.service.name', '')
                                if stack_name:
                                    stack_info = {
                                        'name': stack_name,
                                        'service': stack_service,
                                        'display': stack_name
                                    }
                    except:
                        pass
                    
                    # Parse CreatedAt timestamp from CLI format (e.g., "2024-01-15 10:30:45 +0000 UTC")
                    created_timestamp = 0
                    if len(parts) > 4 and parts[4]:
                        created_str = parts[4]
                        try:
                            # Try parsing Docker CLI format: "2024-01-15 10:30:45 +0000 UTC"
                            # Remove "UTC" if present and parse
                            created_str_clean = created_str.replace(' UTC', '').strip()
                            # Try multiple formats
                            for fmt in ['%Y-%m-%d %H:%M:%S %z', '%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S.%fZ', '%Y-%m-%dT%H:%M:%SZ']:
                                try:
                                    dt = datetime.strptime(created_str_clean, fmt)
                                    # Convert to milliseconds timestamp
                                    created_timestamp = int(dt.timestamp() * 1000)
                                    break
                                except ValueError:
                                    continue
                        except Exception:
                            # If parsing fails, try to get timestamp from inspect
                            try:
                                inspect_result = subprocess.run(
                                    ['docker', 'inspect', container_id, '--format', '{{.Created}}'],
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                if inspect_result.returncode == 0:
                                    created_str = inspect_result.stdout.strip()
                                    # Handle ISO format with nanoseconds (Docker returns 9 digits)
                                    # fromisoformat only handles up to 6 digits (microseconds)
                                    if '.' in created_str and created_str.endswith('Z'):
                                        # Replace nanoseconds with microseconds
                                        parts = created_str.split('.')
                                        if len(parts) == 2:
                                            decimal_part = parts[1].rstrip('Z')
                                            if len(decimal_part) > 6:
                                                decimal_part = decimal_part[:6]
                                            created_str = f"{parts[0]}.{decimal_part}Z"
                                    dt = datetime.fromisoformat(created_str.replace('Z', '+00:00'))
                                    created_timestamp = int(dt.timestamp() * 1000)
                            except Exception:
                                pass
                    
                    containers.append({
                        'id': container_id[:12],
                        'name': parts[1],
                        'image': parts[2],
                        'status': status_display,
                        'status_text': status_text,
                        'created': created_timestamp,
                        'ports': {},
                        'ip_address': ip_address,
                        'port_mappings': port_mappings,
                        'volumes': associated_volumes,
                        'image_info': image_info,
                        'stack_info': stack_info,
                        'networks': network_names,
                        'is_self': is_self,
                    })
            return containers
        except Exception:
            return None
    
    def start_container(self, container_id: str) -> Dict[str, Any]:
        """Start a container"""
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                result = subprocess.run(
                    ['docker', 'start', container_id],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode != 0:
                    return {'error': result.stderr}
                return {'success': True, 'message': 'Container started'}
            except Exception as e:
                return {'error': str(e)}
        return {'error': 'Docker client not available'}
    
    def stop_container(self, container_id: str) -> Dict[str, Any]:
        """Stop a container gracefully"""
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                result = subprocess.run(
                    ['docker', 'stop', container_id],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode != 0:
                    return {'error': result.stderr}
                return {'success': True, 'message': 'Container stopped gracefully'}
            except Exception as e:
                return {'error': str(e)}
        return {'error': 'Docker client not available'}
    
    def kill_container(self, container_id: str) -> Dict[str, Any]:
        """Kill a container immediately"""
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                result = subprocess.run(
                    ['docker', 'kill', container_id],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if result.returncode != 0:
                    return {'error': result.stderr}
                return {'success': True, 'message': 'Container killed'}
            except Exception as e:
                return {'error': str(e)}
        return {'error': 'Docker client not available'}
    
    def restart_container(self, container_id: str) -> Dict[str, Any]:
        """Restart a container"""
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                result = subprocess.run(
                    ['docker', 'restart', container_id],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode != 0:
                    return {'error': result.stderr}
                return {'success': True, 'message': 'Container restarted'}
            except Exception as e:
                return {'error': str(e)}
        return {'error': 'Docker client not available'}
    
    def delete_container(self, container_id: str, delete_volumes: bool = False) -> Dict[str, Any]:
        """Delete a container"""
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                volumes_to_delete = []
                if delete_volumes:
                    try:
                        inspect_data = docker_api_client.inspect_container(container_id)
                        mounts = inspect_data.get('Mounts', []) or []
                        if isinstance(mounts, list):
                            for mount in mounts:
                                if isinstance(mount, dict) and mount.get('Type') == 'volume':
                                    volume_name = mount.get('Name', '')
                                    if volume_name:
                                        volumes_to_delete.append(volume_name)
                    except:
                        pass
                
                subprocess.run(['docker', 'kill', container_id], 
                              capture_output=True, timeout=10)
                
                result = subprocess.run(
                    ['docker', 'rm', container_id],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                if result.returncode != 0:
                    return {'error': result.stderr}
                
                deleted_volumes = []
                if delete_volumes and volumes_to_delete:
                    for volume_name in volumes_to_delete:
                        try:
                            vol_result = subprocess.run(
                                ['docker', 'volume', 'rm', volume_name],
                                capture_output=True,
                                text=True,
                                timeout=10
                            )
                            if vol_result.returncode == 0:
                                deleted_volumes.append(volume_name)
                        except:
                            pass
                
                message = 'Container deleted'
                if deleted_volumes:
                    message += f'. Deleted {len(deleted_volumes)} volume(s): {", ".join(deleted_volumes)}'
                
                return {
                    'success': True,
                    'message': message,
                    'deleted_volumes': deleted_volumes
                }
            except Exception as e:
                return {'error': str(e)}
        return {'error': 'Docker client not available'}
    
    def container_logs(self, container_id: str, tail: int = 100) -> Dict[str, Any]:
        """Get container logs"""
        try:
            if len(container_id) < 64:
                result = subprocess.run(
                    ['docker', 'ps', '-a', '--format', '{{.ID}}\t{{.Names}}'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if result.returncode == 0:
                    for line in result.stdout.strip().split('\n'):
                        parts = line.split('\t')
                        if len(parts) >= 2:
                            full_id = parts[0]
                            name = parts[1]
                            if container_id in full_id or container_id == name:
                                container_id = full_id
                                break
            
            cmd = ['docker', 'logs', '--tail', str(tail) if tail > 0 else '0']
            if tail == 0:
                cmd.append('--all')
            cmd.append(container_id)
            
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return {'error': result.stderr or 'Failed to get logs'}
            
            return {'logs': result.stdout}
        except subprocess.TimeoutExpired:
            return {'error': 'Log retrieval timed out'}
        except Exception as e:
            return {'error': str(e)}
    
    def container_details(self, container_id: str) -> Dict[str, Any]:
        """Get detailed information about a container"""
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                inspect_data = docker_api_client.inspect_container(container_id)
                config = inspect_data.get('Config', {}) or {}
                host_config = inspect_data.get('HostConfig', {}) or {}
                state = inspect_data.get('State', {}) or {}
                
                env = config.get('Env', []) or []
                cmd = config.get('Cmd', []) or []
                entrypoint = config.get('Entrypoint', []) or []
                binds = host_config.get('Binds', []) or []
                cap_add = host_config.get('CapAdd', []) or []
                cap_drop = host_config.get('CapDrop', []) or []
                mounts = inspect_data.get('Mounts', []) or []
                
                details = {
                    'id': inspect_data.get('Id', ''),
                    'name': inspect_data.get('Name', '').lstrip('/'),
                    'image': config.get('Image', 'unknown'),
                    'image_id': inspect_data.get('Image', ''),
                    'status': 'running' if state.get('Running') else 'stopped',
                    'created': inspect_data.get('Created', ''),
                    'config': {
                        'env': env,
                        'cmd': cmd,
                        'entrypoint': entrypoint,
                        'working_dir': config.get('WorkingDir', ''),
                        'user': config.get('User', ''),
                        'labels': config.get('Labels', {}) or {},
                    },
                    'host_config': {
                        'binds': binds,
                        'port_bindings': host_config.get('PortBindings', {}) or {},
                        'network_mode': host_config.get('NetworkMode', ''),
                        'restart_policy': host_config.get('RestartPolicy', {}) or {},
                        'privileged': host_config.get('Privileged', False),
                        'cap_add': cap_add,
                        'cap_drop': cap_drop,
                    },
                    'network_settings': inspect_data.get('NetworkSettings', {}) or {},
                    'mounts': mounts,
                }
                return details
            except Exception as e:
                import traceback
                traceback.print_exc()
                return {'error': f'Failed to get container details: {str(e)}'}
        
        return {'error': 'Docker client not available'}
    
    def exec_container_command(self, container_id: str, command: str) -> Dict[str, Any]:
        """Execute a command in a container"""
        if not command:
            return {'output': ''}
        
        docker_api_client = docker_utils.docker_api_client
        if docker_api_client:
            try:
                exec_cmd = ['docker', 'exec', container_id, 'sh', '-c', command]
                result = subprocess.run(
                    exec_cmd,
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                output = result.stdout
                if result.stderr:
                    output += "\n" + result.stderr
                
                return {'output': output, 'exit_code': result.returncode}
            except subprocess.TimeoutExpired:
                return {'error': 'Command execution timed out'}
            except Exception as e:
                return {'error': str(e)}
        
        return {'error': 'Docker client not available'}
    
    def get_container_stats(self, container_id: str) -> Dict[str, Any]:
        """Get CPU and memory usage stats for a container"""
        container_id = container_id.split('/')[-1].split(':')[0]
        
        try:
            result = subprocess.run(
                ['docker', 'stats', '--no-stream', '--format', '{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}', container_id],
                capture_output=True,
                text=True,
                timeout=10  # Increased timeout to 10 seconds
            )
            
            if result.returncode != 0:
                # Check if container doesn't exist or is stopped
                if 'No such container' in result.stderr or 'is not running' in result.stderr:
                    return {
                        'cpu_percent': 0,
                        'memory_percent': 0,
                        'memory_usage': '0B / 0B',
                        'memory_used_mb': 0,
                        'memory_total_mb': 0,
                        'status': 'stopped',
                        'error': 'Container not found or not running'
                    }
                return {
                    'cpu_percent': 0,
                    'memory_percent': 0,
                    'memory_usage': '0B / 0B',
                    'memory_used_mb': 0,
                    'memory_total_mb': 0,
                    'status': 'stopped',
                    'error': result.stderr[:100] if result.stderr else 'Unknown error'
                }
            
            parts = result.stdout.strip().split('\t')
            
            cpu_percent = 0
            memory_percent = 0
            memory_usage = 'N/A'
            
            if len(parts) >= 1:
                cpu_str = parts[0].replace('%', '').strip()
                try:
                    cpu_percent = float(cpu_str)
                except:
                    cpu_percent = 0
            
            if len(parts) >= 2:
                memory_usage = parts[1].strip()
            
            if len(parts) >= 3:
                mem_perc_str = parts[2].replace('%', '').strip()
                try:
                    memory_percent = float(mem_perc_str)
                except:
                    memory_percent = 0
            
            memory_used_mb = 0
            memory_total_mb = 0
            
            if memory_usage and '/' in memory_usage:
                try:
                    used_str, total_str = memory_usage.split('/')
                    used_str = used_str.strip()
                    total_str = total_str.strip()
                    
                    def to_mb(value_str):
                        value_str = value_str.strip().upper()
                        if 'GIB' in value_str:
                            num = float(value_str.replace('GIB', '').strip())
                            return num * 1024
                        elif 'MIB' in value_str:
                            num = float(value_str.replace('MIB', '').strip())
                            return num
                        elif 'KIB' in value_str:
                            num = float(value_str.replace('KIB', '').strip())
                            return num / 1024
                        elif 'GB' in value_str:
                            num = float(value_str.replace('GB', '').strip())
                            return num * 1000
                        elif 'MB' in value_str:
                            num = float(value_str.replace('MB', '').strip())
                            return num
                        elif 'KB' in value_str:
                            num = float(value_str.replace('KB', '').strip())
                            return num / 1000
                        elif 'B' in value_str:
                            num = float(value_str.replace('B', '').strip())
                            return num / (1024 * 1024)
                        else:
                            return 0
                    
                    memory_used_mb = to_mb(used_str)
                    memory_total_mb = to_mb(total_str)
                except Exception as e:
                    print(f"Warning: Failed to parse memory usage: {e}")
                    memory_used_mb = 0
                    memory_total_mb = 0
            
            return {
                'cpu_percent': round(cpu_percent, 2),
                'memory_percent': round(memory_percent, 2),
                'memory_usage': memory_usage,
                'memory_used_mb': round(memory_used_mb, 2),
                'memory_total_mb': round(memory_total_mb, 2),
                'status': 'running'
            }
            
        except subprocess.TimeoutExpired:
            # Docker stats command timed out
            print(f"Warning: Docker stats timeout for container {container_id}")
            return {
                'cpu_percent': 0,
                'memory_percent': 0,
                'memory_usage': '0B / 0B',
                'memory_used_mb': 0,
                'memory_total_mb': 0,
                'status': 'timeout',
                'error': 'Stats request timed out'
            }
        except Exception as e:
            return {
                'cpu_percent': 0,
                'memory_percent': 0,
                'memory_usage': 'N/A',
                'memory_used_mb': 0,
                'memory_total_mb': 0,
                'status': 'error',
                'error': str(e)
            }
    
    def redeploy_container(self, container_id: str, port_overrides: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Redeploy a container with updated configuration"""
        container_id = container_id.split('/')[-1].split(':')[0]
        
        try:
            inspect_result = subprocess.run(
                ['docker', 'inspect', container_id],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if inspect_result.returncode != 0:
                return {'error': f'Container not found: {inspect_result.stderr}'}
            
            inspect_data = json.loads(inspect_result.stdout)[0]
            container_name = inspect_data.get('Name', 'container').lstrip('/')
            
            docker_run_cmd = reconstruct_docker_run_command(inspect_data, port_overrides)
            print(f"Redeploying {container_name} with command: {docker_run_cmd}")
            
            subprocess.run(['docker', 'stop', container_id], capture_output=True, timeout=30)
            subprocess.run(['docker', 'rm', container_id], capture_output=True, timeout=10)
            
            clean_cmd_str = docker_run_cmd.replace('\\\n', ' ').replace('\n', ' ')
            
            try:
                cmd_parts = shlex.split(clean_cmd_str)
                use_shell = False
            except Exception as e:
                print(f"Warning: shlex split failed ({e}), using shell=True execution")
                cmd_parts = clean_cmd_str
                use_shell = True
            
            print(f"Executing redeploy command (shell={use_shell}): {cmd_parts}")
            
            deploy_result = subprocess.run(
                cmd_parts,
                shell=use_shell,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if deploy_result.returncode != 0:
                error_msg = deploy_result.stderr if deploy_result.stderr else deploy_result.stdout
                return {
                    'error': f'Failed to redeploy: {error_msg}',
                    'command': docker_run_cmd
                }
            
            new_id = deploy_result.stdout.strip()
            
            return {
                'success': True,
                'message': f'Container {container_name} redeployed successfully',
                'id': new_id,
                'command': docker_run_cmd
            }
            
        except Exception as e:
            return {'error': str(e)}

