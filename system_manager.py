"""
System Manager Module
Handles system statistics, utilities, and cleanup operations
"""
import os
import subprocess
import time
import math
import re
import psutil
from typing import Dict, Any, Optional
import docker_utils
from docker_utils import APP_CONTAINER_NAME, APP_VOLUME_NAME
from error_utils import safe_log_error


def format_size(size_bytes: Optional[int]) -> str:
    """Formats a size in bytes to a human-readable string."""
    if size_bytes is None or size_bytes < 0:
        return "N/A"
    if size_bytes == 0:
        return "0 B"
    size_name = ("B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB")
    i = int(math.floor(math.log(size_bytes, 1024)))
    p = math.pow(1024, i)
    s = round(size_bytes / p, 2)
    return f"{s} {size_name[i]}"


def parse_size_string(size_str: str) -> int:
    """Parses a Docker size string (e.g., '1.345GB', '184.3kB') to bytes."""
    if not size_str or size_str == "N/A":
        return 0
    
    size_str = size_str.strip().upper()
    size_str = size_str.replace(' ', '')
    
    match = re.match(r'^([\d.]+)([KMGT]?B?)$', size_str)
    if not match:
        return 0
    
    number_str, unit = match.groups()
    try:
        number = float(number_str)
    except ValueError:
        return 0
    
    unit = unit.upper()
    if unit == 'B' or unit == '':
        return int(number)
    elif unit == 'KB':
        return int(number * 1024)
    elif unit == 'MB':
        return int(number * 1024 * 1024)
    elif unit == 'GB':
        return int(number * 1024 * 1024 * 1024)
    elif unit == 'TB':
        return int(number * 1024 * 1024 * 1024 * 1024)
    else:
        return 0


def get_dashboard_stats(backup_dir: str, backup_file_manager=None) -> Dict[str, Any]:
    """
    Get dashboard statistics
    
    Args:
        backup_dir: Path to backup directory
        backup_file_manager: Optional BackupFileManager instance to get backups from both local and S3
        
    Returns:
        Dict with dashboard statistics
    """
    cpu_ram_info = "N/A"
    try:
        with open('/proc/cpuinfo') as f:
            for line in f:
                if 'model name' in line:
                    cpu_info = line.split(':')[1].strip()
                    break
        with open('/proc/meminfo') as f:
            for line in f:
                if 'MemTotal' in line:
                    mem_total_kb = int(line.split()[1])
                    mem_total_gb = mem_total_kb / (1024 * 1024)
                    break
        cpu_ram_info = f"{cpu_info} / {mem_total_gb:.2f} GB"
    except:
        pass

    # Get stacks count
    stacks_qty = 0
    try:
        # Get Swarm stacks
        swarm_stacks_result = subprocess.run(
            ['docker', 'stack', 'ls', '--format', '{{.Name}}'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if swarm_stacks_result.returncode == 0:
            swarm_stacks = [s.strip() for s in swarm_stacks_result.stdout.strip().split('\n') if s.strip()]
            stacks_qty += len(swarm_stacks)
        
        # Get Compose-based stacks (unique project names from containers)
        compose_stacks = set()
        docker_api_client = docker_utils.docker_api_client
        all_containers = docker_api_client.list_containers(all=True)
        for container in all_containers:
            try:
                container_id = container.get('Id', '')
                if container_id:
                    inspect_data = docker_api_client.inspect_container(container_id)
                    config = inspect_data.get('Config', {}) or {}
                    labels = config.get('Labels', {}) or {}
                    stack_project = labels.get('com.docker.compose.project', '')
                    if stack_project and stack_project != APP_CONTAINER_NAME and stack_project != APP_VOLUME_NAME:
                        compose_stacks.add(stack_project)
            except:
                pass
        
        stacks_qty += len(compose_stacks)
    except Exception as e:
        print(f"Warning: Could not get stacks count: {e}")

    docker_api_client = docker_utils.docker_api_client
    all_containers = docker_api_client.list_containers(all=True)
    containers_qty = len(all_containers)
    running_containers = len([c for c in all_containers if c.get('State') == 'running'])
    stopped_containers = containers_qty - running_containers

    all_images = docker_api_client.list_images()
    images_qty = len(all_images)
    total_images_size_bytes = sum(img.get('Size', 0) for img in all_images)
    total_images_size_str = format_size(total_images_size_bytes)

    all_volumes = docker_api_client.list_volumes()
    volumes_qty = len(all_volumes)
    
    # Calculate total volumes size
    total_volumes_size_bytes = 0
    try:
        df_result = subprocess.run(
            ['docker', 'system', 'df', '-v'],
            capture_output=True, text=True, timeout=10
        )
        if df_result.returncode == 0:
            output_lines = df_result.stdout.split('\n')
            in_volumes_section = False
            
            for line in output_lines:
                line = line.strip()
                if 'LOCAL VOLUMES' in line.upper() or 'VOLUME NAME' in line.upper():
                    in_volumes_section = True
                    continue
                if in_volumes_section:
                    if ('BUILD CACHE' in line.upper() or 
                        ('CONTAINER' in line.upper() and 'ID' in line.upper()) or 
                        ('IMAGE' in line.upper() and 'REPOSITORY' in line.upper()) or
                        (':' in line and 'USAGE' in line.upper())):
                        break
                    if not line or line.startswith('-') or 'VOLUME NAME' in line.upper():
                        continue
                    parts = line.split()
                    if len(parts) >= 3:
                        vol_name = parts[0]
                        if vol_name.upper() in ['BUILD', 'CACHE', 'CONTAINER', 'IMAGE', 'LOCAL', 'VOLUMES']:
                            break
                        size_str = parts[2]
                        if any(unit in size_str.upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                            size_bytes = parse_size_string(size_str)
                            if size_bytes > 0:
                                total_volumes_size_bytes += size_bytes
                    elif len(parts) == 2:
                        if parts[0].upper() not in ['BUILD', 'CACHE', 'CONTAINER', 'IMAGE']:
                            if any(unit in parts[1].upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                                size_bytes = parse_size_string(parts[1])
                                if size_bytes > 0:
                                    total_volumes_size_bytes += size_bytes
    except Exception as e:
        print(f"Warning: Could not get total volumes size: {e}")
    
    # Fallback: if df didn't work, try direct du on mountpoints
    if total_volumes_size_bytes == 0:
        try:
            for vol in all_volumes:
                mountpoint = vol.get('Mountpoint')
                if mountpoint and os.path.exists(mountpoint):
                    try:
                        du_result = subprocess.run(
                            ['du', '-sb', mountpoint],
                            capture_output=True, text=True, timeout=2
                        )
                        if du_result.returncode == 0:
                            size_bytes = int(du_result.stdout.split()[0])
                            total_volumes_size_bytes += size_bytes
                    except Exception:
                        pass
        except Exception:
            pass
    
    total_volumes_size_str = format_size(total_volumes_size_bytes)

    networks_qty = len(docker_api_client.list_networks())
    docker_sock_url = docker_api_client.socket_path if docker_api_client else "N/A"

    backups_qty = 0
    total_backups_size_bytes = 0
    
    # Use backup_file_manager if provided to get backups from both local and S3
    if backup_file_manager:
        try:
            backups_result = backup_file_manager.list_backups()
            if backups_result.get('backups'):
                backups = backups_result['backups']
                backups_qty = len(backups)
                total_backups_size_bytes = sum(b.get('size', 0) for b in backups)
        except Exception as e:
            print(f"Warning: Could not get backups from backup_file_manager: {e}")
            # Fall through to local-only counting
    
    # Fallback to local-only counting if backup_file_manager not provided or failed
    if backups_qty == 0:
        # Get backup files count
        # Backup files are in backups/ subdirectory
        backups_subdir = os.path.join(backup_dir, 'backups')
        if os.path.exists(backups_subdir):
            backup_files = [name for name in os.listdir(backups_subdir) 
                           if os.path.isfile(os.path.join(backups_subdir, name)) 
                           and (name.endswith(('.zip', '.tar.gz')) 
                                or (name.startswith('network_') and name.endswith('.json')))]
            backups_qty = len(backup_files)
        
        # Get backup vault size from the app's volume
        try:
            df_result = subprocess.run(
                ['docker', 'system', 'df', '-v'],
                capture_output=True, text=True, timeout=10
            )
            if df_result.returncode == 0:
                output_lines = df_result.stdout.split('\n')
                in_volumes_section = False
                
                for line in output_lines:
                    line = line.strip()
                    if 'LOCAL VOLUMES' in line.upper() or 'VOLUME NAME' in line.upper():
                        in_volumes_section = True
                        continue
                    if in_volumes_section:
                        if ('BUILD CACHE' in line.upper() or 
                            ('CONTAINER' in line.upper() and 'ID' in line.upper()) or 
                            ('IMAGE' in line.upper() and 'REPOSITORY' in line.upper()) or
                            (':' in line and 'USAGE' in line.upper())):
                            break
                        if not line or line.startswith('-') or 'VOLUME NAME' in line.upper():
                            continue
                        parts = line.split()
                        if len(parts) >= 3:
                            vol_name = parts[0]
                            if vol_name.upper() in ['BUILD', 'CACHE', 'CONTAINER', 'IMAGE', 'LOCAL', 'VOLUMES']:
                                break
                            if vol_name == APP_VOLUME_NAME:
                                size_str = parts[2]
                                if any(unit in size_str.upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                                    total_backups_size_bytes = parse_size_string(size_str)
                                    break
        except Exception as e:
            print(f"Warning: Could not get backup vault size from volume: {e}")
        
        # Fallback: try direct du on the backup directory mountpoint
        if total_backups_size_bytes == 0 and os.path.exists(backups_subdir):
            try:
                du_result = subprocess.run(
                    ['du', '-sb', backups_subdir],
                    capture_output=True, text=True, timeout=5
                )
                if du_result.returncode == 0:
                    total_backups_size_bytes = int(du_result.stdout.split()[0])
            except Exception as e:
                print(f"Warning: Could not get backup vault size via du: {e}")

    total_backups_size_str = format_size(total_backups_size_bytes)

    return {
        'cpu_ram_info': cpu_ram_info,
        'stacks_qty': stacks_qty,
        'containers_qty': containers_qty,
        'running_containers': running_containers,
        'stopped_containers': stopped_containers,
        'images_qty': images_qty,
        'total_images_size': total_images_size_str,
        'volumes_qty': volumes_qty,
        'total_volumes_size': total_volumes_size_str,
        'networks_qty': networks_qty,
        'docker_sock_url': docker_sock_url,
        'backups_qty': backups_qty,
        'total_backups_size': total_backups_size_str,
    }


def get_system_stats() -> Dict[str, Any]:
    """Get system-wide CPU and RAM usage"""
    try:
        # Get system CPU usage (percentage) with error handling
        try:
            cpu_percent = psutil.cpu_percent(interval=0.1)
            # If CPU percent is None (first call), try again with a short interval
            if cpu_percent is None:
                cpu_percent = psutil.cpu_percent(interval=0.1)
        except Exception as cpu_error:
            print(f"Warning: Failed to get CPU stats: {cpu_error}")
            cpu_percent = 0
        
        # Get CPU count
        cpu_count = 0
        try:
            cpu_count = psutil.cpu_count(logical=True)
        except Exception as cpu_count_error:
            print(f"Warning: Failed to get CPU count: {cpu_count_error}")
            # Fallback: try reading from /proc/cpuinfo
            try:
                with open('/proc/cpuinfo') as f:
                    cpu_count = len([line for line in f if line.startswith('processor')])
            except:
                cpu_count = 0
        
        # Get system memory info with error handling
        try:
            memory = psutil.virtual_memory()
            memory_used_mb = memory.used / 1024 / 1024
            memory_total_mb = memory.total / 1024 / 1024
            memory_percent = memory.percent
        except Exception as mem_error:
            print(f"Warning: Failed to get memory stats: {mem_error}")
            memory_used_mb = 0
            memory_total_mb = 0
            memory_percent = 0
        
        # Get Docker version
        docker_version = "N/A"
        try:
            result = subprocess.run(
                ['docker', '--version'],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                # Extract version from output like "Docker version 24.0.7, build afdd53b"
                version_output = result.stdout.strip()
                # Try to extract just the version number
                version_match = re.search(r'version\s+([\d.]+)', version_output, re.IGNORECASE)
                if version_match:
                    docker_version = version_match.group(1)
                else:
                    docker_version = version_output.replace('Docker version ', '').split(',')[0].strip()
        except Exception as docker_version_error:
            print(f"Warning: Failed to get Docker version: {docker_version_error}")
        
        return {
            'cpu_percent': cpu_percent if cpu_percent is not None else 0,
            'cpu_count': cpu_count,
            'memory_used_mb': memory_used_mb,
            'memory_total_mb': memory_total_mb,
            'memory_percent': memory_percent,
            'docker_version': docker_version
        }
    except Exception as e:
        print(f"Error in get_system_stats: {e}")
        safe_log_error(e, context="get_system_stats")
        return {'error': 'Failed to retrieve system statistics'}


def get_statistics() -> Dict[str, Any]:
    """
    Get comprehensive statistics for all containers including CPU, RAM, and disk usage
    
    Returns:
        Dict with container statistics and totals
    """
    docker_api_client = docker_utils.docker_api_client
    if not docker_api_client:
        return {'error': 'Docker client not available'}
    
    try:
        # Get all containers
        containers = docker_api_client.list_containers(all=True)
        container_stats_list = []
        
        # Get container sizes from docker system df
        container_sizes = {}
        try:
            df_result = subprocess.run(
                ['docker', 'system', 'df', '-v'],
                capture_output=True, text=True, timeout=15
            )
            if df_result.returncode == 0:
                output_lines = df_result.stdout.split('\n')
                in_containers_section = False
                
                for line in output_lines:
                    line = line.strip()
                    if 'CONTAINER ID' in line.upper() or 'CONTAINERS' in line.upper():
                        in_containers_section = True
                        continue
                    if in_containers_section:
                        if ('IMAGE' in line.upper() and 'REPOSITORY' in line.upper()) or \
                           ('LOCAL VOLUMES' in line.upper()) or \
                           (':' in line and 'USAGE' in line.upper()):
                            break
                        if not line or line.startswith('-') or 'CONTAINER ID' in line.upper():
                            continue
                        parts = line.split()
                        if len(parts) >= 3:
                            container_id = parts[0]
                            size_str = parts[2]
                            if any(unit in size_str.upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                                container_sizes[container_id] = size_str
        except Exception as e:
            print(f"Warning: Could not get container sizes from df: {e}")
        
        # Get total volumes and images sizes
        total_volumes_size_bytes = 0
        total_images_size_bytes = 0
        
        try:
            df_result = subprocess.run(
                ['docker', 'system', 'df'],
                capture_output=True, text=True, timeout=10
            )
            if df_result.returncode == 0:
                output_lines = df_result.stdout.split('\n')
                for line in output_lines:
                    line = line.strip()
                    if 'LOCAL VOLUMES' in line.upper():
                        parts = line.split()
                        for i, part in enumerate(parts):
                            if any(unit in part.upper() for unit in ['B', 'K', 'M', 'G', 'T']) and i > 0:
                                total_volumes_size_bytes = parse_size_string(part)
                                break
                    elif 'IMAGES' in line.upper():
                        parts = line.split()
                        for i, part in enumerate(parts):
                            if any(unit in part.upper() for unit in ['B', 'K', 'M', 'G', 'T']) and i > 0:
                                total_images_size_bytes = parse_size_string(part)
                                break
        except Exception as e:
            print(f"Warning: Could not get totals from df: {e}")
        
        # Fallback: calculate images size from API
        if total_images_size_bytes == 0:
            try:
                all_images = docker_api_client.list_images()
                total_images_size_bytes = sum(img.get('Size', 0) for img in all_images)
            except:
                pass
        
        # Process each container
        for container in containers:
            names = container.get('Names', [])
            if names is None:
                names = ['']
            
            container_name = names[0].lstrip('/') if names else ''
            if container_name.startswith('backup-temp-') or container_name.startswith('restore-temp-'):
                continue
            
            container_id = container.get('Id', '')
            container_id_short = container_id[:12] if container_id else ''
            
            # Get container size
            container_size_str = '0B'
            container_size_bytes = 0
            if container_id_short in container_sizes:
                container_size_str = container_sizes[container_id_short]
                container_size_bytes = parse_size_string(container_size_str)
            elif container_id in container_sizes:
                container_size_str = container_sizes[container_id]
                container_size_bytes = parse_size_string(container_size_str)
            
            # Get CPU and RAM stats
            cpu_percent = 0
            memory_percent = 0
            memory_used_mb = 0
            memory_total_mb = 0
            network_io = '-'
            block_io = '-'
            status_text = container.get('Status', 'unknown')
            is_running = status_text.lower().startswith('up') or 'running' in status_text.lower()
            
            if is_running:
                try:
                    result = subprocess.run(
                        ['docker', 'stats', '--no-stream', '--format', '{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}', container_id_short],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    if result.returncode == 0:
                        parts = result.stdout.strip().split('\t')
                        
                        if len(parts) >= 1:
                            cpu_str = parts[0].replace('%', '').strip()
                            try:
                                cpu_percent = float(cpu_str)
                            except:
                                cpu_percent = 0
                        
                        if len(parts) >= 2:
                            memory_usage = parts[1].strip()
                            if '/' in memory_usage:
                                try:
                                    used_str, total_str = memory_usage.split('/')
                                    used_str = used_str.strip().upper()
                                    total_str = total_str.strip().upper()
                                    
                                    def to_mb(value_str):
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
                                        else:
                                            return 0
                                    
                                    memory_used_mb = to_mb(used_str)
                                    memory_total_mb = to_mb(total_str)
                                except:
                                    pass
                        
                        if len(parts) >= 3:
                            mem_perc_str = parts[2].replace('%', '').strip()
                            try:
                                memory_percent = float(mem_perc_str)
                            except:
                                memory_percent = 0
                        
                        if len(parts) >= 4:
                            network_io = parts[3].strip()
                        
                        if len(parts) >= 5:
                            block_io = parts[4].strip()
                except:
                    pass
            
            # Add refresh timestamp (current time when stats were collected)
            from datetime import datetime
            refresh_timestamp = datetime.now().isoformat()
            
            container_stats_list.append({
                'id': container_id_short,
                'name': container_name,
                'image': container.get('Image', 'unknown'),
                'status': 'running' if is_running else 'stopped',
                'cpu_percent': round(cpu_percent, 2),
                'memory_percent': round(memory_percent, 2),
                'memory_used_mb': round(memory_used_mb, 2),
                'memory_total_mb': round(memory_total_mb, 2),
                'network_io': network_io,
                'block_io': block_io,
                'disk_size': container_size_str,
                'disk_size_bytes': container_size_bytes,
                'refresh_timestamp': refresh_timestamp,
            })
        
        # Calculate total container disk size
        total_containers_size_bytes = sum(c['disk_size_bytes'] for c in container_stats_list)
        
        return {
            'containers': container_stats_list,
            'totals': {
                'containers_disk': format_size(total_containers_size_bytes),
                'containers_disk_bytes': total_containers_size_bytes,
                'volumes_disk': format_size(total_volumes_size_bytes),
                'volumes_disk_bytes': total_volumes_size_bytes,
                'images_disk': format_size(total_images_size_bytes),
                'images_disk_bytes': total_images_size_bytes,
            }
        }
    except Exception as e:
        print(f"Error in get_statistics: {e}")
        safe_log_error(e, context="get_statistics")
        return {'error': 'Failed to retrieve statistics'}


def check_environment() -> Dict[str, Any]:
    """Check the server environment for Docker readiness"""
    results = {
        'docker_socket': False,
        'docker_cli': False,
        'busybox': False,
        'details': []
    }
    
    # 1. Check Docker Socket
    if os.path.exists('/var/run/docker.sock') and os.access('/var/run/docker.sock', os.R_OK | os.W_OK):
        results['docker_socket'] = True
        results['details'].append("✅ Docker socket found and accessible.")
    else:
        results['details'].append("❌ /var/run/docker.sock not found or not accessible!")

    # 2. Check Docker CLI
    try:
        cli_result = subprocess.run(['docker', '--version'], capture_output=True, text=True, timeout=5)
        if cli_result.returncode == 0:
            results['docker_cli'] = True
            results['details'].append(f"✅ Docker CLI found: {cli_result.stdout.strip()}")
        else:
            results['details'].append(f"❌ Docker CLI check failed: {cli_result.stderr}")
    except Exception as e:
        results['details'].append(f"❌ Docker CLI check error: {str(e)}")

    # 3. Check Busybox
    try:
        bb_result = subprocess.run(
            ['docker', 'run', '--rm', 'busybox', 'echo', 'working'],
            capture_output=True,
            text=True,
            timeout=30
        )
        if bb_result.returncode == 0:
            results['busybox'] = True
            results['details'].append("✅ Busybox is available and working.")
        else:
            results['details'].append(f"❌ Busybox check failed: {bb_result.stderr}")
            results['details'].append("   If you have no internet access, you may need to manually load the busybox image.")
    except Exception as e:
        results['details'].append(f"❌ Busybox check error: {str(e)}")
        
    return results


def cleanup_temp_containers_helper() -> Dict[str, Any]:
    """Helper function to clean up orphaned temporary containers"""
    try:
        result = subprocess.run(
            ['docker', 'ps', '-a', '--format', '{{.Names}}'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return {'error': result.stderr, 'removed': 0}
        
        temp_containers = []
        for line in result.stdout.strip().split('\n'):
            container_name = line.strip()
            if container_name and (container_name.startswith('backup-temp-') or 
                                   container_name.startswith('restore-temp-')):
                temp_containers.append(container_name)
        
        if not temp_containers:
            return {'message': 'No orphaned temp containers found', 'removed': 0}
        
        # Remove each temp container
        removed_count = 0
        errors = []
        for container_name in temp_containers:
            try:
                # Stop first, then remove
                subprocess.run(['docker', 'stop', container_name], 
                            capture_output=True, timeout=10)
                time.sleep(0.2)
                rm_result = subprocess.run(['docker', 'rm', container_name], 
                                          capture_output=True, timeout=10)
                if rm_result.returncode == 0:
                    removed_count += 1
                else:
                    errors.append(f"{container_name}: {rm_result.stderr}")
            except Exception as e:
                errors.append(f"{container_name}: {str(e)}")
        
        message = f'Removed {removed_count} orphaned temp container(s)'
        if errors:
            message += f' ({len(errors)} errors)'
        
        return {
            'message': message,
            'removed': removed_count,
            'errors': errors if errors else None
        }
    except Exception as e:
        return {'error': str(e), 'removed': 0}


def cleanup_dangling_images() -> Dict[str, Any]:
    """Clean up dangling Docker images"""
    try:
        result = subprocess.run(
            ['docker', 'image', 'prune', '-f'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return {'error': result.stderr}
        
        output = result.stdout + '\n' + result.stderr
        reclaimed_space = '0B'
        
        if 'Total reclaimed space' in output:
            try:
                for line in output.split('\n'):
                    if 'Total reclaimed space' in line:
                        if ':' in line:
                            reclaimed_space = line.split(':', 1)[1].strip()
                        else:
                            reclaimed_space = line.split('Total reclaimed space')[1].strip()
                        break
            except Exception as e:
                print(f"Warning: Failed to parse reclaimed space: {e}")
                reclaimed_space = '0B'
        
        deleted_count = 0
        if output:
            deleted_count = len([line for line in output.split('\n') 
                                if line.strip().startswith('deleted:') 
                                or line.strip().startswith('untagged:')])
        
        return {
            'success': True,
            'message': f'Cleaned up {deleted_count} dangling image(s)',
            'reclaimed_space': reclaimed_space,
            'deleted_count': deleted_count
        }
    except Exception as e:
        return {'error': str(e)}

