"""
Docker Utilities Module
Handles Docker client initialization and utility functions
"""
import os
import subprocess
import json
import re
from typing import Optional, Dict, Any

# Try direct Docker API client first
try:
    from docker_api import DockerAPIClient
    _use_direct_api = True
except ImportError:
    _use_direct_api = False

# Fallback to docker-py if direct API not available
if not _use_direct_api:
    # Clear problematic Docker environment variables BEFORE importing docker
    _docker_env_backup = {}
    for key in list(os.environ.keys()):
        if 'DOCKER' in key.upper():
            _docker_env_backup[key] = os.environ.pop(key)
    
    # Now import docker with clean environment
    import docker
    from docker import APIClient


# App name constants
APP_CONTAINER_NAME = 'container-monkey'
APP_IMAGE_NAMES = ['container-monkey', 'docker-monkey', 'docker-backup-ninja', 'backup-ninja', 'docker-backup-image']
APP_VOLUME_NAME = 'container-monkey'

# Global Docker client instances (will be initialized)
docker_client = None
docker_api_client = None
env_backup = {}
_docker_client_initialized = False

# These will be set after init_docker_client() is called
# Import them from here after initialization


def init_docker_client():
    """Initialize Docker client with multiple fallback strategies"""
    global docker_client, docker_api_client, _docker_client_initialized
    
    # Strategy 0: Try direct API client first (like Portainer)
    if _use_direct_api:
        try:
            api_client = DockerAPIClient()
            api_client.ping()
            docker_api_client = api_client
            _docker_client_initialized = True
            print("✅ Connected to Docker using direct API")
            return
        except Exception as e:
            print(f"⚠️  Direct API client failed: {e}")
            print("   Falling back to docker-py library...")
    
    if not _use_direct_api:
        # Continue with docker-py initialization
        pass
    else:
        return
    
    # Skip if already initialized (Flask reloader issue)
    if _docker_client_initialized and docker_client is not None:
        try:
            docker_client.ping()
            return
        except:
            # Connection lost, reinitialize
            docker_client = None
            _docker_client_initialized = False
    
    # First, clear ALL Docker-related environment variables that might interfere
    docker_env_vars = ['DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH', 
                       'DOCKER_CONTEXT', 'DOCKER_CONFIG', 'COMPOSE_HTTP_TIMEOUT',
                       'DOCKER_API_VERSION']
    env_backup.clear()
    
    # Store and remove all Docker env vars
    for key in docker_env_vars:
        if key in os.environ:
            env_backup[key] = os.environ.pop(key)
    
    # Also check for any env vars that might contain 'docker' in the value
    for key, value in list(os.environ.items()):
        if 'docker' in key.lower() and key not in docker_env_vars:
            # Check if value contains problematic schemes
            if value and ('http+docker' in str(value) or 'docker://' in str(value)):
                env_backup[key] = os.environ.pop(key)
    
    # Strategy 1: Try direct Unix socket connection (most reliable)
    if os.path.exists('/var/run/docker.sock'):
        try:
            # Ensure environment is clean before creating client
            for key in ['DOCKER_HOST', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH']:
                if key in os.environ:
                    del os.environ[key]
            
            # Use APIClient directly with explicit base_url
            api_client = APIClient(base_url='unix:///var/run/docker.sock')
            api_client.ping()
            
            # Create DockerClient - should work now with clean env
            client = docker.DockerClient(base_url='unix:///var/run/docker.sock')
            client.ping()  # Test connection
            docker_client = client
            _docker_client_initialized = True
            return
        except PermissionError as e:
            print("⚠️  Permission denied accessing Docker socket")
            print(f"   Error: {e}")
            print("   Run: ./add-to-docker-group.sh")
            print("   Or: sudo usermod -aG docker $USER")
            print("   Then run: newgrp docker")
        except docker.errors.DockerException as e:
            error_msg = str(e)
            if 'http+docker' in error_msg or 'Not supported URL scheme' in error_msg:
                print(f"⚠️  Docker connection failed: Environment variable conflict detected")
                print(f"   Error: {e}")
                print("   Attempting workaround...")
                try:
                    result = subprocess.run(['docker', 'ps'], capture_output=True, timeout=5)
                    if result.returncode == 0:
                        print("   Docker CLI works, but Python client has issues")
                        print("   This is likely a docker-py library issue")
                except:
                    pass
            else:
                print(f"⚠️  Docker connection failed: {e}")
        except Exception as e:
            error_msg = str(e)
            if 'http+docker' in error_msg or 'Not supported URL scheme' in error_msg:
                print(f"⚠️  Direct socket connection failed: Environment variable conflict")
                print(f"   Error: {e}")
                print("   The docker-py library is reading a bad DOCKER_HOST value")
                print("   Try: unset DOCKER_HOST")
            else:
                print(f"⚠️  Direct socket connection failed: {e}")
    
    # Strategy 2: Try from_env() with cleared env vars
    try:
        if 'DOCKER_HOST' in os.environ:
            del os.environ['DOCKER_HOST']
        
        client = docker.from_env()
        client.ping()
        docker_client = client
        _docker_client_initialized = True
        return
    except PermissionError as e:
        print("⚠️  Permission denied accessing Docker")
        print("   Run: ./add-to-docker-group.sh")
    except Exception as e:
        print(f"⚠️  Docker from_env() failed: {e}")
    
    # Strategy 3: Try with explicit socket path
    try:
        os.environ['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
        client = docker.from_env()
        client.ping()
        docker_client = client
        _docker_client_initialized = True
        return
    except Exception as e:
        print(f"⚠️  Docker connection with explicit socket failed: {e}")
        os.environ.update(env_backup)
    
    # All strategies failed - restore env vars only if we backed them up
    for key, value in env_backup.items():
        if key == 'DOCKER_HOST' and value and ('http+docker' in str(value) or 'docker://' in str(value)):
            continue
        os.environ[key] = value
    
    # Check if it's a permission issue
    if os.path.exists('/var/run/docker.sock'):
        import stat
        sock_stat = os.stat('/var/run/docker.sock')
        sock_mode = stat.filemode(sock_stat.st_mode)
        print(f"\n⚠️  Docker socket exists but access denied")
        print(f"   Socket permissions: {sock_mode}")
        print(f"   Socket owner: {sock_stat.st_uid}")
    else:
        print("\n⚠️  Docker socket not found at /var/run/docker.sock")
    
    print("\n❌ Could not connect to Docker daemon")
    print("   Troubleshooting steps:")
    print("   1. Add your user to docker group:")
    print("      ./add-to-docker-group.sh")
    print("   2. Apply group changes:")
    print("      newgrp docker")
    print("   3. Verify access:")
    print("      docker ps")
    print("\n   The application will run but Docker features will be unavailable.\n")
    docker_client = None


def setup_backup_directory():
    """Setup backup directory - always use Docker volume mount at /backups"""
    import shutil
    
    volume_mount_path = '/backups'
    
    # Always use the volume mount path (app always runs in Docker)
    backup_dir = volume_mount_path
    
    # Create subdirectories
    backups_subdir = os.path.join(backup_dir, 'backups')
    config_subdir = os.path.join(backup_dir, 'config')
    
    os.makedirs(backups_subdir, exist_ok=True)
    os.makedirs(config_subdir, exist_ok=True)
    
    # Migrate existing files from root to subdirectories (one-time migration)
    if os.path.exists(backup_dir):
        migrated = False
        
        # Move backup files (.tar.gz, network_*.json) to backups/
        for filename in os.listdir(backup_dir):
            if filename == 'backups' or filename == 'config':
                continue  # Skip directories we just created
            
            file_path = os.path.join(backup_dir, filename)
            if not os.path.isfile(file_path):
                continue
            
            # Check if it's a backup file
            is_backup_file = (
                filename.endswith(('.tar.gz', '.zip', '.tar')) or
                (filename.startswith('network_') and filename.endswith('.json'))
            )
            
            # Check if it's a config file
            is_config_file = (
                filename in ['users.db', 'scheduler_config.json'] or
                filename.endswith(('.db', '.db-journal'))
            )
            
            if is_backup_file:
                dest_path = os.path.join(backups_subdir, filename)
                if not os.path.exists(dest_path):
                    try:
                        shutil.move(file_path, dest_path)
                        print(f"📦 Migrated backup file: {filename} -> backups/")
                        migrated = True
                    except Exception as e:
                        print(f"⚠️  Warning: Could not migrate {filename}: {e}")
            
            elif is_config_file:
                dest_path = os.path.join(config_subdir, filename)
                if not os.path.exists(dest_path):
                    try:
                        shutil.move(file_path, dest_path)
                        print(f"⚙️  Migrated config file: {filename} -> config/")
                        migrated = True
                    except Exception as e:
                        print(f"⚠️  Warning: Could not migrate {filename}: {e}")
        
        if migrated:
            print("✅ Migration complete: Files moved to backups/ and config/ subdirectories")
    
    # Verify we can write to it
    try:
        test_file = os.path.join(backup_dir, '.write_test')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        print(f"📁 Backup directory: {backup_dir} (writable)")
        print(f"   Backups: {backups_subdir}")
        print(f"   Config: {config_subdir}")
    except Exception as e:
        print(f"❌ ERROR: Cannot write to backup directory {backup_dir}: {e}")
        print(f"   Make sure the Docker volume is mounted at {backup_dir}")
    
    return backup_dir


def reconstruct_docker_run_command(inspect_data: Dict[str, Any], port_overrides: Optional[Dict[str, str]] = None) -> str:
    """
    Reconstruct docker run command from inspect data
    port_overrides: Dict of container_port -> host_port to override existing mappings
                   e.g. {'80/tcp': '8080', '443/tcp': '4433'}
    """
    parts = ['docker run']
    
    config = inspect_data.get('Config', {}) or {}
    host_config = inspect_data.get('HostConfig', {}) or {}
    
    # Container name
    name = inspect_data.get('Name', 'container')
    if name:
        name = name.lstrip('/')
        parts.append(f'--name {name}')
    
    # Detached mode
    if config.get('AttachStdin') == False and config.get('AttachStdout') == False:
        parts.append('-d')
    
    # Interactive/TTY
    if config.get('Tty'):
        parts.append('-t')
    if config.get('OpenStdin'):
        parts.append('-i')
    
    # Port mappings
    exposed_ports = config.get('ExposedPorts', {}) or {}
    port_bindings = host_config.get('PortBindings', {}) or {}
    
    processed_ports = set()
    
    # 1. Handle overrides first (if any)
    if port_overrides:
        for container_port, host_port in port_overrides.items():
            if host_port:
                parts.append(f"-p {host_port}:{container_port}")
                processed_ports.add(container_port)
    
    # 2. Handle existing bindings (skipping overridden ones)
    if port_bindings and isinstance(port_bindings, dict):
        for container_port, host_bindings in port_bindings.items():
            if container_port in processed_ports:
                continue
                
            if host_bindings and isinstance(host_bindings, list) and len(host_bindings) > 0:
                host_port = host_bindings[0].get('HostPort', '') if isinstance(host_bindings[0], dict) else ''
                if host_port:
                    parts.append(f"-p {host_port}:{container_port}")
                    processed_ports.add(container_port)
    
    # Environment variables
    env_vars = config.get('Env', []) or []
    if env_vars and isinstance(env_vars, list):
        for env_var in env_vars:
            if env_var:
                parts.append(f'-e "{env_var}"')
    
    # Volumes
    binds = host_config.get('Binds', []) or []
    if binds and isinstance(binds, list):
        for bind in binds:
            if bind:
                parts.append(f'-v "{bind}"')
    
    # Network
    network_mode = host_config.get('NetworkMode', '')
    if network_mode and network_mode != 'default':
        if network_mode.startswith('container:'):
            parts.append(f'--network {network_mode}')
        else:
            parts.append(f'--network {network_mode}')
            
            # Network IP address (only if specific network is set)
            network_settings = inspect_data.get('NetworkSettings', {})
            networks = network_settings.get('Networks', {})
            if networks and network_mode in networks:
                network_info = networks[network_mode]
                ip_address = network_info.get('IPAddress', '')
                if ip_address:
                    parts.append(f'--ip {ip_address}')
    
    # Restart policy
    restart_policy = host_config.get('RestartPolicy', {}) or {}
    if restart_policy and isinstance(restart_policy, dict) and restart_policy.get('Name') != 'no':
        parts.append(f"--restart {restart_policy.get('Name', 'no')}")
    
    # Privileged
    if host_config.get('Privileged'):
        parts.append('--privileged')
    
    # Capabilities
    cap_add = host_config.get('CapAdd', []) or []
    if cap_add and isinstance(cap_add, list):
        for cap in cap_add:
            if cap:
                parts.append(f'--cap-add {cap}')
    
    cap_drop = host_config.get('CapDrop', []) or []
    if cap_drop and isinstance(cap_drop, list):
        for cap in cap_drop:
            if cap:
                parts.append(f'--cap-drop {cap}')
    
    # Working directory
    working_dir = config.get('WorkingDir', '')
    if working_dir:
        parts.append(f'-w "{working_dir}"')
    
    # User
    user = config.get('User', '')
    if user:
        parts.append(f'-u "{user}"')
    
    # Labels (preserve all labels, especially Docker Compose stack labels)
    labels = config.get('Labels', {}) or {}
    if labels and isinstance(labels, dict):
        for label_key, label_value in labels.items():
            if label_key and label_value is not None:
                label_val_str = str(label_value)
                if '"' in label_val_str or ' ' in label_val_str or '$' in label_val_str:
                    label_val_str = label_val_str.replace('\\', '\\\\').replace('"', '\\"')
                    parts.append(f'--label "{label_key}={label_val_str}"')
                else:
                    parts.append(f'--label {label_key}={label_val_str}')
    
    # Image
    image = config.get('Image', '')
    
    # Entrypoint (before image)
    entrypoint = config.get('Entrypoint', []) or []
    if entrypoint and isinstance(entrypoint, list):
        quoted_entry = []
        for e in entrypoint:
            e_str = str(e)
            if ' ' in e_str or any(x in e_str for x in ['$','\\','"',"'"]):
                e_str = e_str.replace('"', '\\"')
                quoted_entry.append(f'"{e_str}"')
            else:
                quoted_entry.append(e_str)
        parts.append(f'--entrypoint {" ".join(quoted_entry)}')
        
    if image:
        parts.append(image)
    
    # Command (must be last)
    cmd = config.get('Cmd', []) or []
    if cmd and isinstance(cmd, list):
        quoted_cmd = []
        for c in cmd:
            c_str = str(c)
            if ' ' in c_str or any(x in c_str for x in ['$','\\','"',"'"]):
                c_str = c_str.replace('"', '\\"')
                quoted_cmd.append(f'"{c_str}"')
            else:
                quoted_cmd.append(c_str)
        parts.append(' '.join(quoted_cmd))
    
    return ' \\\n  '.join(parts)


def generate_docker_compose(inspect_data: Dict[str, Any]) -> str:
    """Generate docker-compose.yml equivalent"""
    config = inspect_data.get('Config', {}) or {}
    host_config = inspect_data.get('HostConfig', {}) or {}
    name = inspect_data.get('Name', 'container')
    if name:
        name = name.lstrip('/')
    
    yaml_lines = ['version: "3.8"', '', 'services:', f'  {name}:']
    
    # Image
    image = config.get('Image', '')
    yaml_lines.append(f'    image: {image}')
    
    # Container name
    yaml_lines.append(f'    container_name: {name}')
    
    # Ports
    port_bindings = host_config.get('PortBindings', {}) or {}
    if port_bindings and isinstance(port_bindings, dict):
        yaml_lines.append('    ports:')
        for container_port, host_bindings in port_bindings.items():
            if host_bindings and isinstance(host_bindings, list) and len(host_bindings) > 0:
                host_port = host_bindings[0].get('HostPort', '') if isinstance(host_bindings[0], dict) else ''
                if host_port:
                    yaml_lines.append(f'      - "{host_port}:{container_port}"')
    
    # Environment variables
    env_vars = config.get('Env', []) or []
    if env_vars and isinstance(env_vars, list):
        yaml_lines.append('    environment:')
        for env_var in env_vars:
            if env_var:
                yaml_lines.append(f'      - {env_var}')
    
    # Volumes
    binds = host_config.get('Binds', []) or []
    mounts = inspect_data.get('Mounts', []) or []
    if (binds and isinstance(binds, list)) or (mounts and isinstance(mounts, list)):
        yaml_lines.append('    volumes:')
        if binds and isinstance(binds, list):
            for bind in binds:
                if bind:
                    yaml_lines.append(f'      - {bind}')
        if mounts and isinstance(mounts, list):
            for mount in mounts:
                if mount and isinstance(mount, dict) and mount.get('Type') == 'volume':
                    vol_name = mount.get('Name', '')
                    dest = mount.get('Destination', '')
                    if vol_name and dest:
                        yaml_lines.append(f'      - {vol_name}:{dest}')
    
    # Network
    network_mode = host_config.get('NetworkMode', '')
    if network_mode and network_mode != 'default' and not network_mode.startswith('container:'):
        yaml_lines.append(f'    networks:')
        yaml_lines.append(f'      - {network_mode}')
    
    # Restart policy
    restart_policy = host_config.get('RestartPolicy', {}) or {}
    if restart_policy and isinstance(restart_policy, dict) and restart_policy.get('Name') != 'no':
        yaml_lines.append(f"    restart: {restart_policy.get('Name', 'no')}")
    
    # Privileged
    if host_config.get('Privileged'):
        yaml_lines.append('    privileged: true')
    
    # Working directory
    working_dir = config.get('WorkingDir', '')
    if working_dir:
        yaml_lines.append(f'    working_dir: {working_dir}')
    
    # User
    user = config.get('User', '')
    if user:
        yaml_lines.append(f'    user: {user}')
    
    # Command
    cmd = config.get('Cmd', []) or []
    if cmd and isinstance(cmd, list):
        yaml_lines.append(f'    command: {json.dumps(cmd)}')
    
    return '\n'.join(yaml_lines)

