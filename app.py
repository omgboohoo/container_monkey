from flask import Flask, render_template, jsonify, send_file, request, after_this_request, session, redirect, url_for
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
import json
import os
import zipfile
import tempfile
import shutil
import subprocess
import shlex
import re
import uuid
import threading
import time
from datetime import datetime, timedelta
from flask import Response
from pathlib import Path
import math
import psutil
import sqlite3
import secrets
from typing import Optional

# Try direct Docker API client first
try:
    from docker_api import DockerAPIClient
    _use_direct_api = True
except ImportError:
    _use_direct_api = False

# Import backup manager
from backup_manager import BackupManager

# Fallback to docker-py if direct API not available
if not _use_direct_api:
    # Clear problematic Docker environment variables BEFORE importing docker
    # This prevents docker-py from reading bad env vars during import
    _docker_env_backup = {}
    for key in list(os.environ.keys()):
        if 'DOCKER' in key.upper():
            _docker_env_backup[key] = os.environ.pop(key)
    
    # Now import docker with clean environment
    import docker
    from docker import APIClient

app = Flask(__name__)
# Generate a random secret key on each start
app.config['SECRET_KEY'] = secrets.token_hex(32)
# Set session to persist for 7 days
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# Initialize rate limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# App name - used to filter out self from listings and backups
APP_CONTAINER_NAME = 'container-monkey'
APP_IMAGE_NAMES = ['container-monkey', 'docker-monkey', 'docker-backup-ninja', 'backup-ninja', 'docker-backup-image']  # All possible image names (keep old ones for migration)
APP_VOLUME_NAME = 'container-monkey'

def setup_backup_directory():
    """Setup backup directory - always use Docker volume mount at /backups"""
    volume_mount_path = '/backups'
    
    # Always use the volume mount path (app always runs in Docker)
    backup_dir = volume_mount_path
    
    # Ensure backup directory exists
    os.makedirs(backup_dir, exist_ok=True)
    
    # Verify we can write to it
    try:
        test_file = os.path.join(backup_dir, '.write_test')
        with open(test_file, 'w') as f:
            f.write('test')
        os.remove(test_file)
        print(f"📁 Backup directory: {backup_dir} (writable)")
    except Exception as e:
        print(f"❌ ERROR: Cannot write to backup directory {backup_dir}: {e}")
        print(f"   Make sure the Docker volume is mounted at {backup_dir}")
    
    return backup_dir

app.config['BACKUP_DIR'] = setup_backup_directory()

# Database setup
def init_database():
    """Initialize SQLite database in storage volume if it doesn't exist"""
    # Use the same directory as backups (storage volume)
    db_dir = app.config['BACKUP_DIR']
    db_path = os.path.join(db_dir, 'users.db')
    
    # Check if database already exists
    if os.path.exists(db_path):
        print(f"✅ Database already exists at {db_path}")
        return db_path
    
    # Create database and table
    print(f"📦 Creating database at {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Insert default user (username: monkey, password: monkey)
    default_password_hash = generate_password_hash('monkey')
    try:
        cursor.execute('''
            INSERT INTO users (username, password_hash)
            VALUES (?, ?)
        ''', ('monkey', default_password_hash))
        conn.commit()
        print(f"✅ Created default user (username: monkey, password: monkey)")
    except sqlite3.IntegrityError:
        # User already exists (shouldn't happen on first run, but handle gracefully)
        print(f"ℹ️  Default admin user already exists")
    
    conn.close()
    return db_path

# Initialize database on startup
DB_PATH = init_database()

# Login required decorator
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'logged_in' not in session or not session['logged_in']:
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(url_for('index'))
        return f(*args, **kwargs)
    return decorated_function

# Protect all routes except auth routes
@app.before_request
def require_login():
    # Skip auth check for auth routes
    auth_routes = ['/api/login', '/api/logout', '/api/auth-status']
    if request.path in auth_routes:
        return None
    
    # Skip auth check for static files
    if request.path.startswith('/static/'):
        return None
    
    # Allow index route through (login modal will handle auth)
    if request.path == '/':
        return None
    
    # Require login for all API routes
    if request.path.startswith('/api/'):
        if 'logged_in' not in session or not session['logged_in']:
            return jsonify({'error': 'Authentication required'}), 401
    
    return None

# Initialize Docker client
docker_client = None
docker_api_client = None
env_backup = {}
_docker_client_initialized = False

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
    
    # Continue with docker-py initialization if direct API failed or not available
    
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
    # Use low-level API client to bypass environment variable issues
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
            # Don't restore env vars - keep them cleared for this session
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
                # Try with completely clean environment using subprocess approach
                try:
                    result = subprocess.run(['docker', 'ps'], capture_output=True, timeout=5)
                    if result.returncode == 0:
                        # Docker CLI works, try using it as fallback
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
        # Ensure DOCKER_HOST is not set (we already cleared it)
        if 'DOCKER_HOST' in os.environ:
            del os.environ['DOCKER_HOST']
        
        # from_env() should default to unix:///var/run/docker.sock
        client = docker.from_env()
        client.ping()
        docker_client = client
        _docker_client_initialized = True
        # Don't restore env vars - keep them cleared
        return
    except PermissionError as e:
        print("⚠️  Permission denied accessing Docker")
        print("   Run: ./add-to-docker-group.sh")
    except Exception as e:
        print(f"⚠️  Docker from_env() failed: {e}")
    
    # Strategy 3: Try with explicit socket path
    try:
        # Explicitly set to Unix socket
        os.environ['DOCKER_HOST'] = 'unix:///var/run/docker.sock'
        client = docker.from_env()
        client.ping()
        docker_client = client
        _docker_client_initialized = True
        # Don't restore env vars - keep them cleared
        return
    except Exception as e:
        print(f"⚠️  Docker connection with explicit socket failed: {e}")
        # Restore env vars
        os.environ.update(env_backup)
    
    # All strategies failed - restore env vars only if we backed them up
    # But keep DOCKER_HOST cleared if it had problematic values
    for key, value in env_backup.items():
        if key == 'DOCKER_HOST' and value and ('http+docker' in str(value) or 'docker://' in str(value)):
            # Don't restore problematic DOCKER_HOST values
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

# Initialize Docker client on startup
init_docker_client()

# Initialize backup manager after Docker client is ready
# (Will be initialized after helper functions are defined)
def init_backup_manager():
    """Initialize backup manager with Docker client and helper functions"""
    global backup_manager
    if docker_api_client:
        backup_manager = BackupManager(
            docker_api_client=docker_api_client,
            backup_dir=app.config['BACKUP_DIR'],
            app_container_name=APP_CONTAINER_NAME,
            app_volume_name=APP_VOLUME_NAME,
            reconstruct_docker_run_command_fn=reconstruct_docker_run_command,
            generate_docker_compose_fn=generate_docker_compose
        )
        print("✅ Backup manager initialized")


def get_dashboard_stats():
    """Helper function to get dashboard stats"""
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
        # Exclude the app's own compose project
        compose_stacks = set()
        all_containers = docker_api_client.list_containers(all=True)
        for container in all_containers:
            try:
                container_id = container.get('Id', '')
                if container_id:
                    inspect_data = docker_api_client.inspect_container(container_id)
                    config = inspect_data.get('Config', {}) or {}
                    labels = config.get('Labels', {}) or {}
                    stack_project = labels.get('com.docker.compose.project', '')
                    # Skip the app's own compose project
                    if stack_project and stack_project != APP_CONTAINER_NAME and stack_project != APP_VOLUME_NAME:
                        compose_stacks.add(stack_project)
            except:
                pass
        
        # Add compose stacks that aren't already Swarm stacks
        stacks_qty += len(compose_stacks)
    except Exception as e:
        print(f"Warning: Could not get stacks count: {e}")

    all_containers = docker_api_client.list_containers(all=True)
    containers_qty = len(all_containers)
    running_containers = len([c for c in all_containers if c.get('State') == 'running'])
    stopped_containers = containers_qty - running_containers

    all_images = docker_api_client.list_images()
    # Filter out the app's own image from the count
    images_qty = len(all_images)
    total_images_size_bytes = sum(img.get('Size', 0) for img in all_images)
    
    total_images_size_str = _format_size(total_images_size_bytes)

    all_volumes = docker_api_client.list_volumes()
    # Filter out the app's own volume from the count
    volumes_qty = len(all_volumes)
    
    # Calculate total volumes size
    total_volumes_size_bytes = 0
    try:
        # Get volume sizes from docker system df -v (most efficient way)
        df_result = subprocess.run(
            ['docker', 'system', 'df', '-v'],
            capture_output=True, text=True, timeout=10
        )
        if df_result.returncode == 0:
            # Parse the output - volumes section comes after "Local Volumes"
            output_lines = df_result.stdout.split('\n')
            in_volumes_section = False
            
            for line in output_lines:
                line = line.strip()
                if 'LOCAL VOLUMES' in line.upper() or 'VOLUME NAME' in line.upper():
                    in_volumes_section = True
                    continue
                if in_volumes_section:
                    # Stop if we hit another section (Build cache, Containers, Images, etc.)
                    # Check for section headers that indicate we've moved past volumes
                    if ('BUILD CACHE' in line.upper() or 
                        ('CONTAINER' in line.upper() and 'ID' in line.upper()) or 
                        ('IMAGE' in line.upper() and 'REPOSITORY' in line.upper()) or
                        (':' in line and 'USAGE' in line.upper())):
                        break
                    # Skip header lines and separators
                    if not line or line.startswith('-') or 'VOLUME NAME' in line.upper():
                        continue
                    # Format: "VOLUME_NAME    LINKS    SIZE"
                    # Only parse lines that look like volume entries
                    parts = line.split()
                    if len(parts) >= 3:
                        # First part should be the volume name (not a section header word)
                        vol_name = parts[0]
                        if vol_name.upper() in ['BUILD', 'CACHE', 'CONTAINER', 'IMAGE', 'LOCAL', 'VOLUMES']:
                            break  # This is a section header, stop parsing
                        size_str = parts[2]  # SIZE is the third column
                        # Verify it looks like a size string before parsing (contains B, K, M, G, or T)
                        if any(unit in size_str.upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                            size_bytes = _parse_size_string(size_str)
                            if size_bytes > 0:  # Only add if we successfully parsed
                                total_volumes_size_bytes += size_bytes
                    elif len(parts) == 2:
                        # Check if first part looks like a volume name (not a header)
                        if parts[0].upper() not in ['BUILD', 'CACHE', 'CONTAINER', 'IMAGE']:
                            # Check if second part looks like a size
                            if any(unit in parts[1].upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                                size_bytes = _parse_size_string(parts[1])
                                if size_bytes > 0:  # Only add if we successfully parsed
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
    
    total_volumes_size_str = _format_size(total_volumes_size_bytes)

    networks_qty = len(docker_api_client.list_networks())
    docker_sock_url = docker_api_client.socket_path if docker_api_client else "N/A"

    backup_dir = app.config['BACKUP_DIR']
    backups_qty = 0
    total_backups_size_bytes = 0
    
    # Get backup files count
    if os.path.exists(backup_dir):
        backup_files = [name for name in os.listdir(backup_dir) if os.path.isfile(os.path.join(backup_dir, name)) and (name.endswith(('.zip', '.tar.gz')) or (name.startswith('network_') and name.endswith('.json')))]
        backups_qty = len(backup_files)
    
    # Get backup vault size from the app's volume (where backups are stored)
    # The backup directory is stored in the docker-backup-ninja volume
    try:
        # Get volume sizes from docker system df -v
        df_result = subprocess.run(
            ['docker', 'system', 'df', '-v'],
            capture_output=True, text=True, timeout=10
        )
        if df_result.returncode == 0:
            # Parse the output to find the app's volume size
            output_lines = df_result.stdout.split('\n')
            in_volumes_section = False
            
            for line in output_lines:
                line = line.strip()
                if 'LOCAL VOLUMES' in line.upper() or 'VOLUME NAME' in line.upper():
                    in_volumes_section = True
                    continue
                if in_volumes_section:
                    # Stop if we hit another section
                    if ('BUILD CACHE' in line.upper() or 
                        ('CONTAINER' in line.upper() and 'ID' in line.upper()) or 
                        ('IMAGE' in line.upper() and 'REPOSITORY' in line.upper()) or
                        (':' in line and 'USAGE' in line.upper())):
                        break
                    # Skip header lines
                    if not line or line.startswith('-') or 'VOLUME NAME' in line.upper():
                        continue
                    # Format: "VOLUME_NAME    LINKS    SIZE"
                    parts = line.split()
                    if len(parts) >= 3:
                        vol_name = parts[0]
                        if vol_name.upper() in ['BUILD', 'CACHE', 'CONTAINER', 'IMAGE', 'LOCAL', 'VOLUMES']:
                            break
                        # Check if this is the app's volume
                        if vol_name == APP_VOLUME_NAME:
                            size_str = parts[2]
                            if any(unit in size_str.upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                                total_backups_size_bytes = _parse_size_string(size_str)
                                break  # Found it, no need to continue
    except Exception as e:
        print(f"Warning: Could not get backup vault size from volume: {e}")
    
    # Fallback: try direct du on the backup directory mountpoint
    if total_backups_size_bytes == 0 and os.path.exists(backup_dir):
        try:
            du_result = subprocess.run(
                ['du', '-sb', backup_dir],
                capture_output=True, text=True, timeout=5
            )
            if du_result.returncode == 0:
                total_backups_size_bytes = int(du_result.stdout.split()[0])
        except Exception as e:
            print(f"Warning: Could not get backup vault size via du: {e}")

    total_backups_size_str = _format_size(total_backups_size_bytes)

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

# Authentication routes
@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    """Handle user login"""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        password = data.get('password', '')
        
        if not username or not password:
            return jsonify({'error': 'Username and password are required'}), 400
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT password_hash FROM users WHERE username = ?', (username,))
        result = cursor.fetchone()
        conn.close()
        
        if result and check_password_hash(result[0], password):
            session.permanent = True
            session['logged_in'] = True
            session['username'] = username
            return jsonify({'success': True, 'username': username})
        else:
            return jsonify({'error': 'Invalid username or password'}), 401
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/logout', methods=['POST'])
def logout():
    """Handle user logout"""
    session.clear()
    return jsonify({'success': True})

@app.route('/api/change-password', methods=['POST'])
@login_required
def change_password():
    """Handle password and username change"""
    try:
        data = request.get_json()
        current_password = data.get('current_password', '')
        new_password = data.get('new_password', '')
        new_username = data.get('new_username', '').strip()
        
        if not current_password:
            return jsonify({'error': 'Current password is required'}), 400
        
        username = session.get('username')
        if not username:
            return jsonify({'error': 'Not authenticated'}), 401
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT password_hash FROM users WHERE username = ?', (username,))
        result = cursor.fetchone()
        
        if not result or not check_password_hash(result[0], current_password):
            conn.close()
            return jsonify({'error': 'Current password is incorrect'}), 401
        
        updates = []
        params = []
        
        # Update username if provided
        if new_username:
            if len(new_username) < 3:
                conn.close()
                return jsonify({'error': 'New username must be at least 3 characters long'}), 400
            
            # Check if new username already exists
            cursor.execute('SELECT id FROM users WHERE username = ?', (new_username,))
            if cursor.fetchone():
                conn.close()
                return jsonify({'error': 'Username already exists'}), 400
            
            updates.append('username = ?')
            params.append(new_username)
        
        # Update password if provided
        if new_password:
            if len(new_password) < 3:
                conn.close()
                return jsonify({'error': 'New password must be at least 3 characters long'}), 400
            
            new_password_hash = generate_password_hash(new_password)
            updates.append('password_hash = ?')
            params.append(new_password_hash)
        
        if not updates:
            conn.close()
            return jsonify({'error': 'No changes provided'}), 400
        
        # Update database
        params.append(username)
        update_query = f'UPDATE users SET {", ".join(updates)} WHERE username = ?'
        cursor.execute(update_query, params)
        conn.commit()
        
        # Update session if username changed
        if new_username:
            session['username'] = new_username
        
        conn.close()
        
        messages = []
        if new_username:
            messages.append('Username changed successfully')
        if new_password:
            messages.append('Password changed successfully')
        
        return jsonify({
            'success': True, 
            'message': ' and '.join(messages),
            'username': new_username if new_username else username
        })
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/auth-status')
def auth_status():
    """Check authentication status"""
    if 'logged_in' in session and session['logged_in']:
        return jsonify({'logged_in': True, 'username': session.get('username', '')})
    return jsonify({'logged_in': False})

@app.route('/')
def index():
    """Main page showing list of containers"""
    stats = get_dashboard_stats()
    return render_template('index.html', **stats)

@app.route('/api/dashboard-stats')
def dashboard_stats():
    """API endpoint for dashboard stats"""
    stats = get_dashboard_stats()
    return jsonify(stats)

@app.route('/api/system-stats')
def system_stats():
    """Get system-wide CPU and RAM usage"""
    try:
        # Get system CPU usage (percentage)
        cpu_percent = psutil.cpu_percent(interval=0.1)
        
        # Get system memory info
        memory = psutil.virtual_memory()
        memory_used_mb = memory.used / 1024 / 1024  # Convert bytes to MB
        memory_total_mb = memory.total / 1024 / 1024  # Convert bytes to MB
        memory_percent = memory.percent
        
        return jsonify({
            'cpu_percent': round(cpu_percent, 1),
            'memory_used_mb': round(memory_used_mb, 1),
            'memory_total_mb': round(memory_total_mb, 1),
            'memory_percent': round(memory_percent, 1)
        })
    except Exception as e:
        # Return zeros on error to prevent frontend issues
        return jsonify({
            'cpu_percent': 0,
            'memory_used_mb': 0,
            'memory_total_mb': 0,
            'memory_percent': 0,
            'error': str(e)
        }), 500

@app.route('/console/<container_id>')
def console_page(container_id):
    """Console page for viewing container logs"""
    # Get container name
    container_name = container_id
    if docker_api_client:
        try:
            inspect_data = docker_api_client.inspect_container(container_id)
            container_name = inspect_data.get('Name', container_id).lstrip('/')
        except:
            pass
    
    return render_template('console.html', container_id=container_id, container_name=container_name)


def _get_containers_via_cli():
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
                
                # Filter out temporary backup/restore containers and self
                if container_name.startswith('backup-temp-') or container_name.startswith('restore-temp-'):
                    continue  # Skip temporary containers
                is_self = container_name == APP_CONTAINER_NAME
                
                ports_str = parts[5] if len(parts) > 5 else ''
                
                # Try to get IP address
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
                    
                    # Get port mappings
                    ports_result = subprocess.run(
                        ['docker', 'inspect', container_id, '--format', '{{json .HostConfig.PortBindings}}'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if ports_result.returncode == 0:
                        import json
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
                
                # Determine actual running state from status text
                status_text = parts[3] if len(parts) > 3 else 'unknown'
                is_running = status_text.lower().startswith('up') or 'running' in status_text.lower()
                status_display = 'running' if is_running else 'stopped'
                
                # Get volumes and image info
                associated_volumes = []
                image_info = {}
                try:
                    inspect_result = subprocess.run(
                        ['docker', 'inspect', container_id],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if inspect_result.returncode == 0:
                        import json
                        inspect_data = json.loads(inspect_result.stdout)
                        if inspect_data and len(inspect_data) > 0:
                            container_data = inspect_data[0]
                            # Get volumes
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
                            # Get image info
                            config = container_data.get('Config', {}) or {}
                            image_name = config.get('Image', parts[2] if len(parts) > 2 else 'unknown')
                            image_id = container_data.get('Image', '')
                            if image_name:
                                image_info = {
                                    'name': image_name,
                                    'id': image_id[:12] if image_id else '',
                                }
                            
                            # Get network names
                            network_settings = container_data.get('NetworkSettings', {}) or {}
                            networks = network_settings.get('Networks', {}) or {}
                            network_names = list(networks.keys()) if isinstance(networks, dict) else []
                            
                            # Get stack information from labels
                            # Check both Compose labels and Swarm stack labels
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
                    pass
                
                # Initialize stack_info and network_names if not set
                if 'stack_info' not in locals():
                    stack_info = None
                if 'network_names' not in locals():
                    network_names = []
                
                containers.append({
                    'id': container_id[:12],
                    'name': parts[1],
                    'image': parts[2],
                    'status': status_display,
                    'status_text': status_text,
                    'created': parts[4],
                    'ports': {},
                    'ip_address': ip_address,
                    'port_mappings': port_mappings,
                    'volumes': associated_volumes,
                    'image_info': image_info,
                    'stack_info': stack_info,
                    'networks': network_names,  # List of network names this container is connected to
                    'is_self': is_self,
                })
        return containers
    except Exception:
        return None


@app.route('/api/container/<container_id>/redeploy', methods=['POST'])
def redeploy_container(container_id):
    """Redeploy a container with updated configuration (e.g. ports)"""
    # Security: prevent directory traversal
    container_id = container_id.split('/')[-1].split(':')[0]
    
    data = request.get_json() or {}
    port_overrides = data.get('port_overrides')
    
    try:
        # 1. Inspect container to get current config
        inspect_result = subprocess.run(
            ['docker', 'inspect', container_id],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if inspect_result.returncode != 0:
            return jsonify({'error': f'Container not found: {inspect_result.stderr}'}), 404
            
        inspect_data = json.loads(inspect_result.stdout)[0]
        container_name = inspect_data.get('Name', 'container').lstrip('/')
        
        # 2. Reconstruct run command with overrides
        docker_run_cmd = reconstruct_docker_run_command(inspect_data, port_overrides)
        print(f"Redeploying {container_name} with command: {docker_run_cmd}")
        
        # 3. Stop and remove existing container
        subprocess.run(['docker', 'stop', container_id], capture_output=True, timeout=30)
        subprocess.run(['docker', 'rm', container_id], capture_output=True, timeout=10)
        
        # 4. Execute new run command
        # We need to handle the command execution carefully
        # reconstruct_docker_run_command returns a string with backslashes and newlines
        # Parsing it into a list for shell=False is safer and avoids shell parsing issues
        import shlex
        
        # Remove line continuations and newlines
        clean_cmd_str = docker_run_cmd.replace('\\\n', ' ').replace('\n', ' ')
        
        # Split into arguments, respecting quotes
        try:
            cmd_parts = shlex.split(clean_cmd_str)
        except Exception as e:
            # Fallback if splitting fails
            print(f"Warning: shlex split failed ({e}), using shell=True execution")
            cmd_parts = clean_cmd_str
            use_shell = True
        else:
            use_shell = False
            
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
            return jsonify({
                'error': f'Failed to redeploy: {error_msg}',
                'command': docker_run_cmd
            }), 500
            
        # Get new ID
        new_id = deploy_result.stdout.strip()
        
        return jsonify({
            'success': True,
            'message': f'Container {container_name} redeployed successfully',
            'id': new_id,
            'command': docker_run_cmd
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/container/<container_id>/stats')
def get_container_stats(container_id):
    """Get CPU and memory usage stats for a container"""
    # Security: prevent directory traversal
    container_id = container_id.split('/')[-1].split(':')[0]
    
    try:
        # Use docker stats with --no-stream to get a single snapshot
        # Format: CPU percentage and memory usage
        result = subprocess.run(
            ['docker', 'stats', '--no-stream', '--format', '{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}', container_id],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if result.returncode != 0:
            # Container might be stopped
            return jsonify({
                'cpu_percent': 0,
                'memory_percent': 0,
                'memory_usage': '0B / 0B',
                'memory_used_mb': 0,
                'memory_total_mb': 0,
                'status': 'stopped'
            })
        
        # Parse output: "0.00%\t1.234MiB / 2.456MiB\t50.00%"
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
        
        # Parse memory usage to extract used and total in MB
        memory_used_mb = 0
        memory_total_mb = 0
        
        if memory_usage and '/' in memory_usage:
            try:
                # Format: "1.234MiB / 2.456MiB" or "1234KiB / 2456KiB"
                used_str, total_str = memory_usage.split('/')
                used_str = used_str.strip()
                total_str = total_str.strip()
                
                # Convert to MB
                def to_mb(value_str):
                    """Convert Docker memory string to MB"""
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
        
        return jsonify({
            'cpu_percent': round(cpu_percent, 2),
            'memory_percent': round(memory_percent, 2),
            'memory_usage': memory_usage,
            'memory_used_mb': round(memory_used_mb, 2),
            'memory_total_mb': round(memory_total_mb, 2),
            'status': 'running'
        })
        
    except Exception as e:
        return jsonify({
            'cpu_percent': 0,
            'memory_percent': 0,
            'memory_usage': 'N/A',
            'memory_used_mb': 0,
            'memory_total_mb': 0,
            'status': 'error',
            'error': str(e)
        })


@app.route('/api/check-environment', methods=['GET'])
def check_environment():
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
        # Try to pull/run busybox
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
        
    return jsonify(results)


@app.route('/api/containers')
def list_containers():
    """API endpoint to list all running containers"""
    # Try direct API client first (like Portainer)
    if docker_api_client:
        try:
            containers = docker_api_client.list_containers(all=True)
            container_list = []
            
            for container in containers:
                names = container.get('Names', [])
                if names is None:
                    names = ['']
                
                # Filter out temporary backup/restore containers and self
                container_name = names[0].lstrip('/') if names else ''
                if container_name.startswith('backup-temp-') or container_name.startswith('restore-temp-'):
                    continue  # Skip temporary containers
                is_self = container_name == APP_CONTAINER_NAME
                
                ports = container.get('Ports', [])
                if ports is None:
                    ports = []
                
                # Get IP address and port details, volumes, and image info
                container_id = container.get('Id', '')
                ip_address = 'N/A'
                port_mappings = []
                associated_volumes = []
                image_info = {}
                
                # Try to get IP from network settings and collect volumes/image
                try:
                    inspect_data = docker_api_client.inspect_container(container_id)
                    network_settings = inspect_data.get('NetworkSettings', {}) or {}
                    networks = network_settings.get('Networks', {}) or {}
                    network_names = list(networks.keys()) if isinstance(networks, dict) else []
                    
                    # Get IP from first network
                    for network_name, network_info in networks.items():
                        if isinstance(network_info, dict):
                            ip = network_info.get('IPAddress', '')
                            if ip:
                                ip_address = ip
                                break
                    
                    # Get port mappings
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
                    
                    # Get associated volumes from mounts
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
                    
                    # Get image information
                    config = inspect_data.get('Config', {}) or {}
                    image_name = config.get('Image', '')
                    image_id = inspect_data.get('Image', '')
                    if image_name:
                        image_info = {
                            'name': image_name,
                            'id': image_id[:12] if image_id else '',
                        }
                    
                    # Get stack information from labels
                    # Check both Compose labels and Swarm stack labels
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
                    # Fallback: parse ports from container list
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
                
                # Determine actual running state
                status_text = container.get('Status', 'unknown')
                is_running = status_text.lower().startswith('up') or 'running' in status_text.lower()
                status_display = 'running' if is_running else 'stopped'
                
                # Get stack info (fallback if inspect failed)
                if 'stack_info' not in locals():
                    stack_info = None
                
                container_info = {
                    'id': container_id[:12] if container_id else '',
                    'name': names[0].lstrip('/') if names else '',
                    'image': container.get('Image', 'unknown'),
                    'status': status_display,
                    'status_text': status_text,  # Keep original status text
                    'created': container.get('Created', 0),
                    'ports': ports,
                    'ip_address': ip_address,
                    'port_mappings': port_mappings,
                    'volumes': associated_volumes,
                    'image_info': image_info,
                    'stack_info': stack_info,
                    'networks': network_names,  # List of network names this container is connected to
                    'is_self': is_self,
                }
                container_list.append(container_info)
            
            return jsonify({'containers': container_list})
        except Exception as e:
            print(f"Direct API client error: {e}")
            import traceback
            traceback.print_exc()
            # Try CLI fallback
            cli_containers = _get_containers_via_cli()
            if cli_containers is not None:
                return jsonify({'containers': cli_containers})
            return jsonify({'error': str(e)}), 500
    
    # No API client available - try CLI fallback
    cli_containers = _get_containers_via_cli()
    if cli_containers is not None:
        return jsonify({'containers': cli_containers})
    
    return jsonify({
        'error': 'Docker client not available',
        'message': 'Docker daemon is not accessible. Please ensure Docker is running and you have permission to access it.',
        'help': 'Run ./add-to-docker-group.sh to fix permissions'
    }), 503


@app.route('/api/container/<container_id>/start', methods=['POST'])
def start_container(container_id):
    """Start a container"""
    if docker_api_client:
        try:
            result = subprocess.run(
                ['docker', 'start', container_id],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode != 0:
                return jsonify({'error': result.stderr}), 500
            return jsonify({'success': True, 'message': 'Container started'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'error': 'Docker client not available'}), 500


@app.route('/api/container/<container_id>/stop', methods=['POST'])
def stop_container(container_id):
    """Stop a container (force stop by default for speed)"""
    if docker_api_client:
        try:
            # Use force stop (-t 0) for immediate termination instead of graceful shutdown
            # This is much faster than waiting for graceful shutdown
            result = subprocess.run(
                ['docker', 'stop', '-t', '0', container_id],
                capture_output=True,
                text=True,
                timeout=10
            )
            if result.returncode != 0:
                return jsonify({'error': result.stderr}), 500
            return jsonify({'success': True, 'message': 'Container stopped'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'error': 'Docker client not available'}), 500


@app.route('/api/container/<container_id>/restart', methods=['POST'])
def restart_container(container_id):
    """Restart a container"""
    if docker_api_client:
        try:
            result = subprocess.run(
                ['docker', 'restart', container_id],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode != 0:
                return jsonify({'error': result.stderr}), 500
            return jsonify({'success': True, 'message': 'Container restarted'})
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'error': 'Docker client not available'}), 500


@app.route('/api/container/<container_id>/exec', methods=['POST'])
def exec_container_command(container_id):
    """Execute a command in a container and return output"""
    data = request.get_json() or {}
    command = data.get('command', '')
    
    if not command:
        return jsonify({'output': ''})
    
    if docker_api_client:
        try:
            # We use subprocess directly here as it's easier to capture output than via API socket
            # This is a one-off command execution, not an interactive session
            # For interactive sessions, we would need WebSocket support which is more complex
            
            # Security: Ensure we don't allow arbitrary command injection on host
            # Docker exec isolates the command to the container, but we should be careful
            
            # Use sh -c to execute the command so we can handle pipes/redirection inside container
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
                
            return jsonify({'output': output, 'exit_code': result.returncode})
        except subprocess.TimeoutExpired:
             return jsonify({'error': 'Command execution timed out'}), 500
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Docker client not available'}), 500


@app.route('/api/container/<container_id>/delete', methods=['DELETE'])
def delete_container(container_id):
    """Delete a container"""
    delete_volumes = request.args.get('delete_volumes', 'false').lower() == 'true'
    
    if docker_api_client:
        try:
            
            # Get container info to find associated volumes
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
                    pass  # If we can't get volumes, just delete container
            
            # Stop container first if running (force stop for speed)
            subprocess.run(['docker', 'stop', '-t', '0', container_id], 
                          capture_output=True, timeout=10)
            
            # Delete container
            result = subprocess.run(
                ['docker', 'rm', container_id],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode != 0:
                return jsonify({'error': result.stderr}), 500
            
            # Delete associated volumes if requested
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
            
            return jsonify({
                'success': True, 
                'message': message,
                'deleted_volumes': deleted_volumes
            })
        except Exception as e:
            return jsonify({'error': str(e)}), 500
    return jsonify({'error': 'Docker client not available'}), 500


@app.route('/api/container/<container_id>/logs')
def container_logs(container_id):
    """Get container logs"""
    tail = request.args.get('tail', 100, type=int)
    
    # Use CLI for logs as it's more reliable
    try:
        # Get full container ID if short ID provided
        if len(container_id) < 64:
            # Try to find full ID
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
        
        # Get logs
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
            return jsonify({'error': result.stderr or 'Failed to get logs'}), 500
        
        return jsonify({'logs': result.stdout})
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Log retrieval timed out'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/container/<container_id>/details')
def container_details(container_id):
    """Get detailed information about a container"""
    # Try direct API client first (like Portainer)
    if docker_api_client:
        try:
            inspect_data = docker_api_client.inspect_container(container_id)
            # Format the response to match expected structure
            config = inspect_data.get('Config', {}) or {}
            host_config = inspect_data.get('HostConfig', {}) or {}
            state = inspect_data.get('State', {}) or {}
            
            # Ensure lists are not None
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
            return jsonify(details)
        except Exception as e:
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Failed to get container details: {str(e)}'}), 500
    
    # No API client available
    return jsonify({'error': 'Docker client not available'}), 500


@app.route('/api/backup/<container_id>', methods=['POST'])
def backup_container(container_id):
    """Create a backup of a container"""
    if not backup_manager:
        return jsonify({'error': 'Backup manager not available'}), 500

    # Check if this is a backup-all operation (queue if busy)
    queue_if_busy = request.args.get('queue', 'false').lower() == 'true'

    try:
        result = backup_manager.start_backup(container_id, queue_if_busy=queue_if_busy)
        
        # If backup was queued, return appropriate response
        if result.get('queued'):
            return jsonify({
                'success': True,
                'message': 'Backup queued',
                'progress_id': result['progress_id'],
                'status': 'queued',
                'current_backup': result.get('current_backup', 'Unknown')
            }), 202  # Accepted status for queued operations
        
        return jsonify(result)
    except Exception as e:
        error_msg = str(e)
        # Check if it's a "busy" error
        if 'already in progress' in error_msg:
            status = backup_manager.get_status()
            return jsonify({
                'error': error_msg,
                'status': 'busy',
                'current_backup': status.get('current_backup', 'Unknown')
            }), 409
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Backup failed: {error_msg}'}), 500

@app.route('/api/backup-progress/<progress_id>')
@limiter.exempt  # Exempt from rate limiting - progress polling needs frequent updates
def get_backup_progress(progress_id):
    """Get progress of backup operation"""
    if not backup_manager:
        return jsonify({'error': 'Backup manager not available'}), 500
    
    progress = backup_manager.get_progress(progress_id)
    if not progress:
        return jsonify({'error': 'Progress session not found'}), 404
    
    return jsonify(progress)

@app.route('/api/backup/status')
def backup_status():
    """Check if a backup is currently in progress"""
    if not backup_manager:
        return jsonify({'status': 'idle'})
    
    status = backup_manager.get_status()
    return jsonify(status)
def _format_size(size_bytes):
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

def _parse_size_string(size_str):
    """Parses a Docker size string (e.g., '1.345GB', '184.3kB') to bytes."""
    if not size_str or size_str == "N/A":
        return 0
    
    size_str = size_str.strip().upper()
    
    # Remove any spaces
    size_str = size_str.replace(' ', '')
    
    # Extract number and unit
    import re
    match = re.match(r'^([\d.]+)([KMGT]?B?)$', size_str)
    if not match:
        return 0
    
    number_str, unit = match.groups()
    try:
        number = float(number_str)
    except ValueError:
        return 0
    
    # Convert to bytes
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

@app.route('/api/volumes')
def list_volumes():
    """List all Docker volumes"""
    if not docker_api_client:
        return jsonify({'error': 'Docker client not available'}), 500
        
    try:
        volumes_list = docker_api_client.list_volumes()
        
        # Get all containers to check which volumes are in use
        # Map volume names to list of container names
        volumes_in_use = {}  # {volume_name: [container_names]}
        try:
            # Get all containers
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
                        container_name = parts[1].lstrip('/')  # Remove leading slash
                        
                        # Inspect container to get volumes
                        try:
                            inspect_result = subprocess.run(
                                ['docker', 'inspect', '--format', '{{json .Mounts}}', container_id],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if inspect_result.returncode == 0:
                                import json
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
            pass  # If we can't check containers, continue without in_use info
        
        volumes_with_details = []
        for vol_summary in volumes_list:
            volume_name = vol_summary.get('Name')
            if not volume_name:
                continue

            mountpoint = vol_summary.get('Mountpoint')
            size_str = "N/A"
            
            # Get volume size using du command on the mountpoint
            if mountpoint and os.path.exists(mountpoint):
                try:
                    # Use du -sb to get size in bytes
                    du_result = subprocess.run(
                        ['du', '-sb', mountpoint],
                        capture_output=True, text=True, timeout=5
                    )
                    if du_result.returncode == 0:
                        size_bytes = int(du_result.stdout.split()[0])
                        size_str = _format_size(size_bytes)
                except Exception as e:
                    print(f"Could not get size for volume {volume_name} at {mountpoint}: {e}")

            is_self = volume_name == APP_VOLUME_NAME
            containers_using = volumes_in_use.get(volume_name, [])
            in_use = len(containers_using) > 0
            
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
            }
            volumes_with_details.append(vol_details)

        # Batch fallback: For volumes that still have N/A, try to get sizes from docker system df -v
        # This is more efficient than creating containers for each volume
        volumes_needing_size = [v for v in volumes_with_details if v['size'] == 'N/A']
        if volumes_needing_size:
            try:
                # Get volume sizes from docker system df -v
                df_result = subprocess.run(
                    ['docker', 'system', 'df', '-v'],
                    capture_output=True, text=True, timeout=10
                )
                if df_result.returncode == 0:
                    # Parse the output - volumes section comes after "Local Volumes"
                    output_lines = df_result.stdout.split('\n')
                    in_volumes_section = False
                    size_map = {}
                    
                    for line in output_lines:
                        line = line.strip()
                        if 'LOCAL VOLUMES' in line.upper() or 'VOLUME NAME' in line.upper():
                            in_volumes_section = True
                            continue
                        if in_volumes_section:
                            # Skip header lines and separators
                            if not line or line.startswith('-') or 'SIZE' in line.upper():
                                continue
                            # Format: "VOLUME_NAME    LINKS    SIZE"
                            # Split by whitespace - columns are: name, links, size
                            parts = line.split()
                            if len(parts) >= 3:
                                vol_name = parts[0]
                                size_str = parts[2]  # SIZE is the third column
                                size_map[vol_name] = size_str
                            elif len(parts) == 2:
                                # Some volumes might have empty links, try second column as size
                                vol_name = parts[0]
                                # Check if second part looks like a size (contains B, K, M, G, T)
                                if any(unit in parts[1].upper() for unit in ['B', 'K', 'M', 'G', 'T']):
                                    size_str = parts[1]
                                    size_map[vol_name] = size_str
                            # Stop if we hit another section
                            if line and not any(c.isalnum() for c in line):
                                break
                    
                    # Update volumes with sizes from df output
                    for vol in volumes_needing_size:
                        if vol['name'] in size_map:
                            vol['size'] = size_map[vol['name']]
            except Exception as e:
                print(f"Warning: Could not get volume sizes via 'docker system df -v': {e}")
            
            # Final fallback: Try Docker API inspect for volumes that still need size
            volumes_still_needing_size = [v for v in volumes_needing_size if v['size'] == 'N/A']
            if volumes_still_needing_size and docker_api_client:
                for vol in volumes_still_needing_size:
                    try:
                        inspect_data = docker_api_client.inspect_volume(vol['name'])
                        usage_data = inspect_data.get('UsageData')
                        if usage_data and 'Size' in usage_data:
                            size_bytes = usage_data['Size']
                            vol['size'] = _format_size(size_bytes)
                    except Exception as e:
                        # Silently fail - UsageData is often not populated
                        pass

        return jsonify({'volumes': volumes_with_details})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/volume/<volume_name>/explore')
def explore_volume(volume_name):
    """Explore files in a Docker volume"""
    path = request.args.get('path', '/')
    
    # Security: prevent directory traversal
    if '..' in path or not path.startswith('/'):
        path = '/'
    
    try:
        import json
        
        # Create a temporary container to explore the volume
        temp_container_name = f"explore-temp-{volume_name}-{os.urandom(4).hex()}"
        
        try:
            # Create temporary container with volume mounted
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
            
            # List files in the volume
            # Normalize path - ensure it starts with /volume
            volume_path = f'/volume{path}'
            if not volume_path.endswith('/') and path != '/':
                volume_path += '/'
            
            # Use 'ls -la' to get detailed file info
            ls_result = subprocess.run(
                ['docker', 'exec', temp_container_name, 'sh', '-c', 
                 f'cd {volume_path} && ls -la 2>&1'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            files = []
            
            if ls_result.returncode == 0 and ls_result.stdout:
                # Parse ls -la output
                lines = ls_result.stdout.strip().split('\n')
                for line in lines:
                    if not line.strip() or line.startswith('total'):
                        continue
                    
                    # Parse ls -la format: permissions links owner group size date time name
                    # Example: drwxr-xr-x    2 root     root          4096 Nov 22 14:04 .
                    parts = line.split()
                    if len(parts) >= 9:
                        file_type = 'directory' if parts[0].startswith('d') else 'file'
                        # Filename is everything after the date/time (parts[5:8])
                        file_name = ' '.join(parts[8:])  # Handle spaces in filenames
                        
                        if file_name not in ['.', '..']:
                            # Build relative path
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
            
            # If ls failed or returned no files, try find as fallback
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
                            # Check if it's a directory
                            check_type = subprocess.run(
                                ['docker', 'exec', temp_container_name, 'test', '-d', file_path_full],
                                capture_output=True,
                                timeout=5
                            )
                            file_type = 'directory' if check_type.returncode == 0 else 'file'
                            
                            # Build relative path
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
            
            # If still no files and ls had an error, raise it
            if not files and ls_result.returncode != 0:
                raise Exception(f"Failed to list files: {ls_result.stderr}")
            
            # Clean up temp container
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            
            # Debug logging
            print(f"Volume exploration: {volume_name}, path: {path}, found {len(files)} files")
            if not files:
                print(f"Warning: No files found in volume {volume_name} at path {path}")
                print(f"LS result: returncode={ls_result.returncode if 'ls_result' in locals() else 'N/A'}")
                if 'ls_result' in locals() and ls_result.stdout:
                    print(f"LS output: {ls_result.stdout[:200]}")
            
            return jsonify({
                'volume': volume_name,
                'path': path,
                'files': files
            })
            
        except subprocess.TimeoutExpired:
            # Clean up on timeout
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise Exception("Volume exploration timed out")
        except Exception as e:
            # Ensure cleanup
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/volume/<volume_name>/file')
def get_volume_file(volume_name):
    """Get file contents from a Docker volume"""
    file_path = request.args.get('path', '')
    
    if not file_path:
        return jsonify({'error': 'File path required'}), 400
    
    # Security: prevent directory traversal
    if '..' in file_path:
        return jsonify({'error': 'Invalid file path'}), 400
    
    try:
        
        # Create a temporary container to read the file
        temp_container_name = f"read-temp-{volume_name}-{os.urandom(4).hex()}"
        
        try:
            # Create temporary container with volume mounted
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
            
            # Read file contents
            read_result = subprocess.run(
                ['docker', 'exec', temp_container_name, 'cat', f'/volume{file_path}'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            # Clean up temp container
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            
            if read_result.returncode != 0:
                return jsonify({'error': f"Failed to read file: {read_result.stderr}"}), 500
            
            return jsonify({
                'volume': volume_name,
                'path': file_path,
                'content': read_result.stdout,
                'size': len(read_result.stdout)
            })
            
        except subprocess.TimeoutExpired:
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise Exception("File read timed out")
        except Exception as e:
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/volume/<volume_name>/download')
def download_volume_file(volume_name):
    """Download a file from a Docker volume"""
    file_path = request.args.get('path', '')
    
    if not file_path:
        return jsonify({'error': 'File path required'}), 400
    
    # Security: prevent directory traversal
    if '..' in file_path:
        return jsonify({'error': 'Invalid file path'}), 400
    
    try:
        
        # Create a temporary container to read the file
        temp_container_name = f"download-temp-{volume_name}-{os.urandom(4).hex()}"
        
        try:
            # Create temporary container with volume mounted
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
            
            # Read file contents as binary
            read_result = subprocess.run(
                ['docker', 'exec', temp_container_name, 'cat', f'/volume{file_path}'],
                capture_output=True,
                timeout=30
            )
            
            # Clean up temp container
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            
            if read_result.returncode != 0:
                return jsonify({'error': f"Failed to read file: {read_result.stderr.decode('utf-8', errors='ignore')}"}), 500
            
            # Get filename from path
            filename = os.path.basename(file_path) or 'file'
            
            # Create response with file content
            from flask import Response
            response = Response(
                read_result.stdout,
                mimetype='application/octet-stream',
                headers={
                    'Content-Disposition': f'attachment; filename="{filename}"',
                    'Content-Length': str(len(read_result.stdout))
                }
            )
            return response
            
        except subprocess.TimeoutExpired:
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise Exception("File download timed out")
        except Exception as e:
            subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                          capture_output=True, timeout=10)
            raise
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/volume/<volume_name>/delete', methods=['DELETE'])
def delete_volume(volume_name):
    """Delete a Docker volume"""
    # Security: prevent directory traversal
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
            # Check if volume is in use
            if 'in use' in error_msg.lower() or 'is being used' in error_msg.lower():
                return jsonify({
                    'error': error_msg,
                    'in_use': True,
                    'message': f'Volume "{volume_name}" is in use by one or more containers and cannot be deleted.'
                }), 400
            
            return jsonify({'error': error_msg}), 500
        
        return jsonify({'success': True, 'message': 'Volume deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/volumes/delete', methods=['POST'])
def delete_volumes():
    """Delete multiple Docker volumes"""
    data = request.get_json()
    volume_names = data.get('names', [])
    
    deleted_count = 0
    errors = []
    in_use_volumes = []
    
    for volume_name in volume_names:
        try:
            # Security: prevent directory traversal
            volume_name = os.path.basename(volume_name)
            
            result = subprocess.run(
                ['docker', 'volume', 'rm', volume_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                deleted_count += 1
            else:
                error_msg = result.stderr
                # Check if volume is in use
                if 'in use' in error_msg.lower() or 'is being used' in error_msg.lower():
                    in_use_volumes.append(volume_name)
                    errors.append(f"Volume {volume_name} is in use by containers")
                else:
                    errors.append(f"Failed to delete volume {volume_name}: {error_msg}")
        except Exception as e:
            errors.append(f"Failed to delete volume {volume_name}: {str(e)}")
            
    return jsonify({
        'success': True,
        'message': f'Deleted {deleted_count} volume(s)',
        'deleted_count': deleted_count,
        'errors': errors,
        'in_use_volumes': in_use_volumes
    })


@app.route('/api/networks')
def list_networks():
    """List all Docker networks with detailed information"""
    try:
        import json
        
        # Get network list
        result = subprocess.run(
            ['docker', 'network', 'ls', '--format', '{{.ID}}\t{{.Name}}\t{{.Driver}}\t{{.Scope}}'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr}), 500
        
        networks = []
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) >= 4:
                network_id = parts[0]
                network_name = parts[1]
                
                # Get detailed network information
                network_info = {
                    'id': network_id,
                    'name': network_name,
                    'driver': parts[2],
                    'scope': parts[3],
                    'subnet': '',
                    'gateway': '',
                    'ip_range': '',
                    'containers': 0,
                }
                
                # Inspect network to get IPAM details
                try:
                    inspect_result = subprocess.run(
                        ['docker', 'network', 'inspect', network_id, '--format', '{{json .}}'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    
                    if inspect_result.returncode == 0:
                        inspect_data = json.loads(inspect_result.stdout)
                        
                        # Handle both list (standard inspect) and dict (format json .) responses
                        net_data = None
                        if isinstance(inspect_data, list) and len(inspect_data) > 0:
                            net_data = inspect_data[0]
                        elif isinstance(inspect_data, dict):
                            net_data = inspect_data
                            
                        if net_data:
                            # Get IPAM configuration
                            ipam = net_data.get('IPAM', {}) or {}
                            configs = ipam.get('Config', []) or []
                            if configs and len(configs) > 0:
                                config = configs[0]
                                network_info['subnet'] = config.get('Subnet', '')
                                network_info['gateway'] = config.get('Gateway', '')
                                network_info['ip_range'] = config.get('IPRange', '')
                            
                            # Count containers
                            containers = net_data.get('Containers', {}) or {}
                            if isinstance(containers, dict):
                                network_info['containers'] = len(containers)
                            elif isinstance(containers, list):
                                network_info['containers'] = len(containers)
                except:
                    # If inspection fails, continue with basic info
                    pass
                
                networks.append(network_info)
        
        return jsonify({'networks': networks})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/network/<network_id>/backup', methods=['POST'])
def backup_network(network_id):
    """Backup a Docker network configuration"""
    try:
        
        # Get network details
        inspect_result = subprocess.run(
            ['docker', 'network', 'inspect', network_id],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if inspect_result.returncode != 0:
            return jsonify({'error': inspect_result.stderr}), 500
        
        import json
        network_data = json.loads(inspect_result.stdout)
        if not network_data or len(network_data) == 0:
            return jsonify({'error': 'Network not found'}), 404
        
        network_info = network_data[0]
        network_name = network_info.get('Name', network_id)
        
        # Prevent backing up default Docker networks (bridge, host, none) and Docker Swarm system networks
        default_networks = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress']
        if network_name in default_networks:
            return jsonify({
                'error': f'Cannot backup default network "{network_name}". Default networks are built-in and cannot be backed up or restored.'
            }), 400
        
        # Create backup filename
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_filename = f"network_{network_name}_{timestamp}.json"
        backup_path = os.path.join(app.config['BACKUP_DIR'], backup_filename)
        
        # Save network configuration
        with open(backup_path, 'w') as f:
            json.dump(network_info, f, indent=2)
        
        return jsonify({
            'success': True,
            'filename': backup_filename,
            'message': f'Network {network_name} backed up successfully'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/network/<network_id>/delete', methods=['DELETE'])
def delete_network(network_id):
    """Delete a Docker network"""
    # Security: prevent directory traversal
    network_id = network_id.split('/')[-1]
    
    try:
        result = subprocess.run(
            ['docker', 'network', 'rm', network_id],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr}), 500
        
        return jsonify({'success': True, 'message': 'Network deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/network/restore', methods=['POST'])
def restore_network():
    """Restore a network from backup file"""
    data = request.get_json()
    filename = data.get('filename')
    
    if not filename:
        return jsonify({'error': 'Filename required'}), 400
    
    # Security: prevent directory traversal
    filename = os.path.basename(filename)
    file_path = os.path.join(app.config['BACKUP_DIR'], filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Backup file not found'}), 404
    
    try:
        import json
        
        # Read network configuration
        with open(file_path, 'r') as f:
            network_config = json.load(f)
        
        network_name = network_config.get('Name', '')
        if not network_name:
            return jsonify({'error': 'Invalid network backup: missing name'}), 400
        
        # Prevent restoring default Docker networks (bridge, host, none) and Docker Swarm system networks
        default_networks = ['bridge', 'host', 'none', 'docker_gwbridge', 'ingress']
        if network_name in default_networks:
            return jsonify({
                'error': f'Cannot restore default network "{network_name}". Default networks are built-in and already exist.'
            }), 400
        
        # Check if network already exists
        check_result = subprocess.run(
            ['docker', 'network', 'inspect', network_name],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        if check_result.returncode == 0:
            return jsonify({
                'error': f'Network {network_name} already exists',
                'network_name': network_name
            }), 409
        
        # Create network with same configuration
        driver = network_config.get('Driver', 'bridge')
        ipam = network_config.get('IPAM', {})
        
        # Build docker network create command
        cmd = ['docker', 'network', 'create']
        
        # Add driver
        if driver and driver != 'bridge':
            cmd.extend(['--driver', driver])
        
        # Add subnet if specified
        if ipam and ipam.get('Config'):
            for config in ipam['Config']:
                if config.get('Subnet'):
                    cmd.extend(['--subnet', config['Subnet']])
                if config.get('Gateway'):
                    cmd.extend(['--gateway', config['Gateway']])
                if config.get('IPRange'):
                    cmd.extend(['--ip-range', config['IPRange']])
        
        # Add network name
        cmd.append(network_name)
        
        # Create network
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return jsonify({'error': f'Failed to create network: {result.stderr}'}), 500
        
        return jsonify({
            'success': True,
            'message': f'Network {network_name} restored successfully',
            'network_name': network_name
        })
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Restore failed: {str(e)}'}), 500


@app.route('/api/stacks')
def list_stacks():
    """List all Docker stacks (Swarm stacks and Compose-based stacks)"""
    try:
        stacks = []
        stack_names = set()
        
        # 1. Get Docker Swarm stacks
        try:
            swarm_stacks_result = subprocess.run(
                ['docker', 'stack', 'ls', '--format', '{{.Name}}\t{{.Services}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if swarm_stacks_result.returncode == 0:
                for line in swarm_stacks_result.stdout.strip().split('\n'):
                    if line and '\t' in line:
                        parts = line.split('\t')
                        stack_name = parts[0].strip()
                        services_count = parts[1].strip() if len(parts) > 1 else '0'
                        stack_names.add(stack_name)
                        
                        # Get detailed info for Swarm stack
                        stack_info = {
                            'name': stack_name,
                            'type': 'swarm',
                            'services_count': int(services_count) if services_count.isdigit() else 0,
                            'containers_count': 0,
                            'networks': []
                        }
                        
                        # Get services in this stack
                        try:
                            services_result = subprocess.run(
                                ['docker', 'stack', 'services', stack_name, '--format', '{{.Name}}'],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if services_result.returncode == 0:
                                service_names = [s.strip() for s in services_result.stdout.strip().split('\n') if s.strip()]
                                stack_info['services'] = service_names
                                
                                # Count containers for each service
                                # Count all tasks (running and stopped) to show actual container count
                                total_containers = 0
                                for service_name in service_names:
                                    try:
                                        # Get service replica count (desired)
                                        service_inspect = subprocess.run(
                                            ['docker', 'service', 'inspect', service_name, '--format', '{{.Spec.Mode.Replicated.Replicas}}'],
                                            capture_output=True,
                                            text=True,
                                            timeout=5
                                        )
                                        if service_inspect.returncode == 0:
                                            replicas_str = service_inspect.stdout.strip()
                                            if replicas_str and replicas_str.isdigit():
                                                total_containers += int(replicas_str)
                                            else:
                                                # Fallback: count actual tasks
                                                service_ps = subprocess.run(
                                                    ['docker', 'service', 'ps', service_name, '--format', '{{.ID}}', '--no-trunc'],
                                                    capture_output=True,
                                                    text=True,
                                                    timeout=5
                                                )
                                                if service_ps.returncode == 0:
                                                    tasks = [t.strip() for t in service_ps.stdout.strip().split('\n') if t.strip()]
                                                    total_containers += len(tasks)
                                    except:
                                        pass
                                stack_info['containers_count'] = total_containers
                        except:
                            pass
                        
                        # Get networks for this stack
                        try:
                            networks_result = subprocess.run(
                                ['docker', 'network', 'ls', '--filter', f'label=com.docker.stack.namespace={stack_name}', '--format', '{{.Name}}'],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if networks_result.returncode == 0:
                                network_names = [n.strip() for n in networks_result.stdout.strip().split('\n') if n.strip()]
                                stack_info['networks'] = network_names
                        except:
                            pass
                        
                        stacks.append(stack_info)
        except Exception as e:
            print(f"⚠️  Warning: Could not list Swarm stacks: {e}")
        
        # 2. Get Compose-based stacks (containers with compose labels but not Swarm stacks)
        try:
            # Get all containers with compose project labels
            compose_containers_result = subprocess.run(
                ['docker', 'ps', '-a', '--format', '{{.ID}}\t{{.Label "com.docker.compose.project"}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if compose_containers_result.returncode == 0:
                compose_stacks = {}
                for line in compose_containers_result.stdout.strip().split('\n'):
                    if line and '\t' in line:
                        parts = line.split('\t')
                        container_id = parts[0].strip()
                        stack_name = parts[1].strip() if len(parts) > 1 else ''
                        
                        if stack_name and stack_name not in stack_names:  # Not already a Swarm stack
                            if stack_name not in compose_stacks:
                                compose_stacks[stack_name] = {
                                    'containers': [],
                                    'services': set(),
                                    'networks': set()
                                }
                            
                            compose_stacks[stack_name]['containers'].append(container_id)
                            
                            # Get service name from container
                            try:
                                inspect_result = subprocess.run(
                                    ['docker', 'inspect', container_id, '--format', '{{index .Config.Labels "com.docker.compose.service"}}'],
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                if inspect_result.returncode == 0:
                                    service_name = inspect_result.stdout.strip()
                                    if service_name:
                                        compose_stacks[stack_name]['services'].add(service_name)
                            except:
                                pass
                            
                            # Get network from container
                            try:
                                network_result = subprocess.run(
                                    ['docker', 'inspect', container_id, '--format', '{{range $net, $conf := .NetworkSettings.Networks}}{{$net}}{{end}}'],
                                    capture_output=True,
                                    text=True,
                                    timeout=5
                                )
                                if network_result.returncode == 0:
                                    network_name = network_result.stdout.strip()
                                    if network_name:
                                        compose_stacks[stack_name]['networks'].add(network_name)
                            except:
                                pass
                
                # Convert compose stacks to stack info format
                # Filter out the app's own compose project (it's not a "stack" from user perspective)
                for stack_name, stack_data in compose_stacks.items():
                    # Skip the app's own compose project
                    if stack_name == APP_CONTAINER_NAME or stack_name == APP_VOLUME_NAME:
                        continue
                    stacks.append({
                        'name': stack_name,
                        'type': 'compose',
                        'services_count': len(stack_data['services']),
                        'containers_count': len(stack_data['containers']),
                        'services': list(stack_data['services']),
                        'networks': list(stack_data['networks'])
                    })
        except Exception as e:
            print(f"⚠️  Warning: Could not list Compose stacks: {e}")
        
        # Sort stacks by name
        stacks.sort(key=lambda x: x['name'].lower())
        
        return jsonify({'stacks': stacks})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/api/stack/<stack_name>/delete', methods=['DELETE'])
def delete_stack(stack_name):
    """Delete a Docker stack"""
    # Security: prevent directory traversal
    stack_name = stack_name.split('/')[-1]
    
    try:
        # First check if it's a Swarm stack
        check_result = subprocess.run(
            ['docker', 'stack', 'ls', '--format', '{{.Name}}'],
            capture_output=True,
            text=True,
            timeout=5
        )
        
        is_swarm_stack = False
        if check_result.returncode == 0:
            swarm_stacks = [s.strip() for s in check_result.stdout.strip().split('\n') if s.strip()]
            is_swarm_stack = stack_name in swarm_stacks
        
        if is_swarm_stack:
            # Delete Swarm stack
            result = subprocess.run(
                ['docker', 'stack', 'rm', stack_name],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode != 0:
                return jsonify({'error': f'Failed to delete Swarm stack: {result.stderr}'}), 500
            
            return jsonify({
                'success': True,
                'message': f'Swarm stack {stack_name} deleted successfully'
            })
        else:
            # Compose-based stack - delete all containers with this stack label
            containers_result = subprocess.run(
                ['docker', 'ps', '-a', '--filter', f'label=com.docker.compose.project={stack_name}', '--format', '{{.ID}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if containers_result.returncode == 0:
                container_ids = [cid.strip() for cid in containers_result.stdout.strip().split('\n') if cid.strip()]
                
                if not container_ids:
                    return jsonify({'error': f'No containers found for stack {stack_name}'}), 404
                
                # Delete all containers
                deleted_count = 0
                errors = []
                for container_id in container_ids:
                    try:
                        delete_result = subprocess.run(
                            ['docker', 'rm', '-f', container_id],
                            capture_output=True,
                            text=True,
                            timeout=30
                        )
                        if delete_result.returncode == 0:
                            deleted_count += 1
                        else:
                            errors.append(f"Container {container_id[:12]}: {delete_result.stderr}")
                    except Exception as e:
                        errors.append(f"Container {container_id[:12]}: {str(e)}")
                
                if errors:
                    return jsonify({
                        'success': True,
                        'message': f'Deleted {deleted_count} containers from stack {stack_name}',
                        'warnings': errors
                    }), 200
                
                return jsonify({
                    'success': True,
                    'message': f'Compose stack {stack_name} deleted successfully ({deleted_count} containers removed)'
                })
            else:
                return jsonify({'error': f'Could not find containers for stack {stack_name}'}), 404
                
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': f'Delete failed: {str(e)}'}), 500


@app.route('/api/network-backups')
def list_network_backups():
    """List all network backup files"""
    try:
        backups = []
        backup_dir = app.config['BACKUP_DIR']
        
        if os.path.exists(backup_dir):
            for filename in os.listdir(backup_dir):
                if filename.startswith('network_') and filename.endswith('.json'):
                    file_path = os.path.join(backup_dir, filename)
                    stat = os.stat(file_path)
                    backups.append({
                        'filename': filename,
                        'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                        'size': stat.st_size
                    })
        
        backups.sort(key=lambda x: x['created'], reverse=True)
        return jsonify({'backups': backups})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/images')
def list_images():
    """List all Docker images"""
    try:
        result = subprocess.run(
            ['docker', 'images', '--format', '{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}'],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr}), 500
        
        # Get all containers to check which images are in use
        # Map image short IDs to list of container names
        images_in_use = {}  # {image_short_id: [container_names]}
        try:
            # Get all containers with their image IDs and names
            containers_result = subprocess.run(
                ['docker', 'ps', '-a', '--format', '{{.ID}}\t{{.Image}}\t{{.Names}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            if containers_result.returncode == 0:
                for line in containers_result.stdout.strip().split('\n'):
                    if not line.strip():
                        continue
                    parts = line.split('\t')
                    if len(parts) >= 3:
                        container_id = parts[0]
                        container_name = parts[2].lstrip('/')  # Remove leading slash
                        
                        # Inspect container to get actual image ID (full SHA256)
                        try:
                            inspect_result = subprocess.run(
                                ['docker', 'inspect', '--format', '{{.Image}}', container_id],
                                capture_output=True,
                                text=True,
                                timeout=5
                            )
                            if inspect_result.returncode == 0:
                                image_id = inspect_result.stdout.strip()
                                if image_id:
                                    # Remove sha256: prefix if present
                                    if image_id.startswith('sha256:'):
                                        image_id = image_id[7:]  # Remove 'sha256:' prefix
                                    # Store short ID (first 12 chars) for matching
                                    # docker images shows short IDs, so we normalize to that
                                    short_id = image_id[:12] if len(image_id) >= 12 else image_id
                                    if short_id not in images_in_use:
                                        images_in_use[short_id] = []
                                    images_in_use[short_id].append(container_name)
                        except:
                            pass
        except:
            pass  # If we can't check containers, continue without in_use info
        
        images = []
        for line in result.stdout.strip().split('\n'):
            if not line.strip():
                continue
            parts = line.split('\t')
            if len(parts) >= 5:
                repository = parts[0]
                repo_tags = parts[0] + ":" + parts[1]
                is_self = any(name in repo_tags for name in APP_IMAGE_NAMES)
                image_id = parts[2]
                
                # Check if image is in use by containers
                # docker images returns short IDs (12 chars), so compare directly
                short_id = image_id[:12] if len(image_id) >= 12 else image_id
                in_use = short_id in images_in_use
                containers_using = images_in_use.get(short_id, []) if in_use else []
                
                images.append({
                    'repository': repository,
                    'tag': parts[1],
                    'id': image_id,
                    'size': parts[3],
                    'created': parts[4],
                    'name': f"{repository}:{parts[1]}" if parts[1] != '<none>' else repository,
                    'is_self': is_self,
                    'in_use': in_use,
                    'containers': containers_using,
                })
        
        return jsonify({'images': images})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/image/<image_id>/delete', methods=['DELETE'])
def delete_image(image_id):
    """Delete a Docker image"""
    # Security: prevent directory traversal
    image_id = image_id.split('/')[-1].split(':')[0]  # Get just the image ID
    
    try:
        result = subprocess.run(
            ['docker', 'rmi', '-f', image_id],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr}), 500
        
        return jsonify({'success': True, 'message': 'Image deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/backups')
def list_backups():
    """List all available backups (containers and networks)"""
    try:
        backups = []
        backup_dir = app.config['BACKUP_DIR']
        
        if not os.path.exists(backup_dir):
            return jsonify({'backups': []})
        
        for filename in os.listdir(backup_dir):
            file_path = os.path.join(backup_dir, filename)
            if not os.path.isfile(file_path):
                continue
                
            stat = os.stat(file_path)
            
            if filename.endswith(('.zip', '.tar.gz')):
                # Container backup
                backups.append({
                    'filename': filename,
                    'size': stat.st_size,
                    'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'type': 'container'
                })
            elif filename.startswith('network_') and filename.endswith('.json'):
                # Network backup
                backups.append({
                    'filename': filename,
                    'size': stat.st_size,
                    'created': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'type': 'network'
                })
        
        # Sort by creation time, newest first
        backups.sort(key=lambda x: x['created'], reverse=True)
        return jsonify({'backups': backups})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/download/<filename>')
def download_backup(filename):
    """Download a backup file"""
    # Security: prevent directory traversal
    filename = os.path.basename(filename)
    file_path = os.path.join(app.config['BACKUP_DIR'], filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Backup file not found'}), 404
    
    return send_file(file_path, as_attachment=True, download_name=filename)


@app.route('/api/backup/<filename>', methods=['DELETE'])
def delete_backup(filename):
    """Delete a backup file"""
    # Security: prevent directory traversal
    filename = os.path.basename(filename)
    file_path = os.path.join(app.config['BACKUP_DIR'], filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Backup file not found'}), 404
    
    try:
        os.remove(file_path)
        return jsonify({'success': True, 'message': 'Backup deleted'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# In-memory progress tracking for download-all
download_all_progress = {}

# Initialize backup manager (will be set after docker client is initialized)
backup_manager: Optional[BackupManager] = None

def cleanup_old_download_sessions():
    """Clean up old download sessions that are older than 1 hour"""
    try:
        current_time = datetime.now()
        sessions_to_remove = []
        
        for session_id, progress in list(download_all_progress.items()):
            created_at_str = progress.get('created_at')
            if created_at_str:
                try:
                    created_at = datetime.fromisoformat(created_at_str)
                    age = (current_time - created_at).total_seconds()
                    # Clean up sessions older than 1 hour
                    if age > 3600:
                        sessions_to_remove.append(session_id)
                except (ValueError, TypeError):
                    # If we can't parse the date, clean it up
                    sessions_to_remove.append(session_id)
        
        for session_id in sessions_to_remove:
            progress = download_all_progress[session_id]
            temp_dir = progress.get('temp_dir')
            if temp_dir and os.path.exists(temp_dir):
                try:
                    shutil.rmtree(temp_dir)
                    print(f"🧹 Cleaned up old session temp dir: {temp_dir}")
                except Exception as e:
                    print(f"⚠️ Error cleaning old temp dir {temp_dir}: {e}")
            del download_all_progress[session_id]
    except Exception as e:
        print(f"⚠️ Error in cleanup_old_download_sessions: {e}")

@app.route('/api/backups/download-all-prepare', methods=['POST'])
def prepare_download_all():
    """Get list of files to download and create a session"""
    # Clean up old sessions before creating new one
    cleanup_old_download_sessions()
    
    try:
        backup_dir = app.config['BACKUP_DIR']
        if not os.path.exists(backup_dir):
            return jsonify({'error': 'Backup directory not found'}), 404
            
        # Get list of files to backup
        files_to_backup = []
        for filename in os.listdir(backup_dir):
            file_path = os.path.join(backup_dir, filename)
            if os.path.isfile(file_path):
                # valid backup files
                if filename.endswith(('.zip', '.tar.gz')) or (filename.startswith('network_') and filename.endswith('.json')):
                    files_to_backup.append(filename)
        
        if not files_to_backup:
            return jsonify({'error': 'No backups found to download'}), 404

        # Create session ID
        session_id = str(uuid.uuid4())
        
        # Initialize progress
        download_all_progress[session_id] = {
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
        
        return jsonify({
            'success': True,
            'session_id': session_id,
            'files': files_to_backup,
            'total': len(files_to_backup)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/backups/download-all-progress/<session_id>')
@limiter.exempt  # Exempt from rate limiting - progress polling needs frequent updates
def get_download_all_progress(session_id):
    """Get progress of download-all operation"""
    if session_id not in download_all_progress:
        return jsonify({'error': 'Session not found'}), 404
    
    progress = download_all_progress[session_id]
    return jsonify({
        'total': progress['total'],
        'completed': progress['completed'],
        'current_file': progress['current_file'],
        'status': progress['status'],
        'archive_filename': progress.get('archive_filename')
    })

def _create_archive_background(session_id, backup_dir, files_to_backup, archive_path, archive_filename):
    """Background thread function to create a tar.gz archive with progress updates
    Ensures tar.gz is fully written before marking complete"""
    try:
        progress = download_all_progress[session_id]
        progress['status'] = 'archiving'
        progress['archive_path'] = archive_path
        progress['archive_filename'] = archive_filename
        
        # Create tar.gz in a thread to track completion
        tar_thread_complete = threading.Event()
        tar_thread_error = [None]
        
        def create_tar():
            """Create tar.gz in a separate thread to track completion"""
            try:
                import tarfile
                with tarfile.open(archive_path, "w:gz") as tar:
                    for i, filename in enumerate(files_to_backup):
                        file_path = os.path.join(backup_dir, filename)
                        if os.path.exists(file_path):
                            progress['current_file'] = filename
                            progress['completed'] = i
                            tar.add(file_path, arcname=filename)
                        else:
                            print(f"⚠️  Warning: File not found: {file_path}")
                
                # Ensure file is flushed and closed
                # The 'with' statement should handle this, but we verify
                if os.path.exists(archive_path):
                    # Verify file is complete by checking it can be opened
                    with tarfile.open(archive_path, 'r:gz') as verify_tar:
                        verify_tar.getmembers()  # This will fail if tar is incomplete
                    
                    print(f"✅ Archive created successfully: {archive_path} ({os.path.getsize(archive_path)} bytes)")
                else:
                    raise Exception("Archive file was not created")
                
                tar_thread_complete.set()
            except Exception as e:
                tar_thread_error[0] = e
                tar_thread_complete.set()
        
        # Start tar creation thread
        tar_thread = threading.Thread(target=create_tar, daemon=True)
        tar_thread.start()
        
        # Wait for tar thread to complete (with timeout)
        if not tar_thread_complete.wait(timeout=1800):  # 30 minute timeout
            raise Exception("Archive creation timed out")
        
        # Check for errors
        if tar_thread_error[0]:
            raise tar_thread_error[0]
        
        # Final update - only mark complete after tar.gz is fully written
        progress['status'] = 'complete'
        progress['completed'] = len(files_to_backup)
        progress['current_file'] = None
        print(f"✅ Archive ready for download: {archive_filename}")

    except Exception as e:
        if session_id in download_all_progress:
            download_all_progress[session_id]['status'] = 'error'
            download_all_progress[session_id]['error'] = str(e)
        import traceback
        traceback.print_exc()
        print(f"❌ Error creating archive: {e}")

@app.route('/api/backups/download-all-create/<session_id>', methods=['POST'])
def create_download_all_archive(session_id):
    """Start creating the tar.gz file in a background thread"""
    try:
        if session_id not in download_all_progress:
            return jsonify({'error': 'Session not found'}), 404
        
        progress = download_all_progress[session_id]
        backup_dir = app.config['BACKUP_DIR']
        files_to_backup = progress['files']
        
        # Create a temporary file for the tar.gz
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        archive_filename = f"all_backups_{timestamp}.tar.gz"
        temp_dir = tempfile.mkdtemp()
        archive_path = os.path.join(temp_dir, archive_filename)
        
        # Store temp_dir in progress for cleanup
        progress['temp_dir'] = temp_dir
        
        # Start archive creation in background thread
        thread = threading.Thread(
            target=_create_archive_background,
            args=(session_id, backup_dir, files_to_backup, archive_path, archive_filename)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'success': True,
            'archive_filename': archive_filename,
            'session_id': session_id,
            'message': 'Archive creation started'
        })
        
    except Exception as e:
        if session_id in download_all_progress:
            download_all_progress[session_id]['status'] = 'error'
        return jsonify({'error': str(e)}), 500

@app.route('/api/backups/download-all/<session_id>')
def download_all_backups(session_id):
    """Download the created tar.gz file"""
    try:
        if session_id not in download_all_progress:
            return jsonify({'error': 'Session not found'}), 404
        
        progress = download_all_progress[session_id]
        
        if progress['status'] != 'complete' or not progress['archive_path']:
            return jsonify({'error': 'Archive file not ready'}), 400
        
        archive_path = progress['archive_path']
        archive_filename = progress['archive_filename']
        
        # Cleanup progress and temp directory after request
        @after_this_request
        def cleanup(response):
            try:
                # Clean up temp directory
                temp_dir = progress.get('temp_dir') or os.path.dirname(archive_path)
                if temp_dir and os.path.exists(temp_dir):
                    shutil.rmtree(temp_dir)
                    print(f"✅ Cleaned up temp directory: {temp_dir}")
                # Clean up progress entry
                if session_id in download_all_progress:
                    del download_all_progress[session_id]
            except Exception as e:
                print(f"⚠️ Error cleaning up temp files: {e}")
            return response
            
        return send_file(archive_path, as_attachment=True, download_name=archive_filename)
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/backups/delete-all', methods=['DELETE'])
def delete_all_backups():
    """Delete all backup files"""
    try:
        backup_dir = app.config['BACKUP_DIR']
        if not os.path.exists(backup_dir):
            return jsonify({'success': True, 'message': 'Backup directory empty', 'deleted_count': 0})
        
        deleted_count = 0
        for filename in os.listdir(backup_dir):
            file_path = os.path.join(backup_dir, filename)
            if os.path.isfile(file_path):
                # Only delete valid backup files (zips and network jsons)
                if filename.endswith(('.tar.gz', '.zip')) or (filename.startswith('network_') and filename.endswith('.json')):
                    try:
                        os.remove(file_path)
                        deleted_count += 1
                    except Exception:
                        pass
        
        return jsonify({
            'success': True, 
            'message': f'Deleted {deleted_count} backup(s)',
            'deleted_count': deleted_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/upload-network-backup', methods=['POST'])
def upload_network_backup():
    """Upload a network backup file"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.json'):
        return jsonify({'error': 'Only .json files are allowed'}), 400
    
    # Save uploaded file
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['BACKUP_DIR'], filename)
    file.save(file_path)
    
    # Verify it's a valid network backup by checking for Name field
    try:
        import json
        with open(file_path, 'r') as f:
            network_config = json.load(f)
        
        if 'Name' not in network_config:
            os.remove(file_path)
            return jsonify({'error': 'Invalid network backup: missing Name field'}), 400
        
        return jsonify({
            'success': True,
            'filename': filename,
            'network_name': network_config.get('Name', ''),
            'message': 'Network backup uploaded successfully'
        })
    except json.JSONDecodeError:
        os.remove(file_path)
        return jsonify({'error': 'Invalid JSON file'}), 400
    except Exception as e:
        os.remove(file_path)
        return jsonify({'error': f'Error processing backup: {str(e)}'}), 500


@app.route('/api/upload-backup', methods=['POST'])
def upload_backup():
    """Upload a backup file"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.tar.gz'):
        return jsonify({'error': 'Only .tar.gz files are allowed'}), 400
    
    # Save uploaded file
    filename = secure_filename(file.filename)
    file_path = os.path.join(app.config['BACKUP_DIR'], filename)
    file.save(file_path)
    
    # Verify it's a valid backup by checking for metadata
    try:
        import tarfile
        with tarfile.open(file_path, 'r:gz') as tar:
            # Check if metadata file exists in the tar archive
            try:
                metadata_file = tar.getmember('./backup_metadata.json')
            except KeyError:
                os.remove(file_path)
                return jsonify({'error': 'Invalid backup file: missing metadata'}), 400

            # Read metadata
            metadata_str = tar.extractfile(metadata_file).read().decode('utf-8')
            metadata = json.loads(metadata_str)

        return jsonify({
            'success': True,
            'filename': filename,
            'metadata': metadata,
            'message': 'Backup uploaded successfully'
        })
    except tarfile.TarError:
        os.remove(file_path)
        return jsonify({'error': 'Invalid tar.gz file'}), 400
    except Exception as e:
        os.remove(file_path)
        return jsonify({'error': f'Error processing backup: {str(e)}'}), 500


@app.route('/api/backup/<filename>/preview')
def preview_backup(filename):
    """Get backup details (ports, volumes) before restore"""
    # Security: prevent directory traversal
    filename = os.path.basename(filename)
    file_path = os.path.join(app.config['BACKUP_DIR'], filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Backup file not found'}), 404
    
    try:
        import tarfile
        with tarfile.open(file_path, 'r:gz') as tar:
            # Read container config
            try:
                config_file = tar.getmember('./container_config.json')
            except KeyError:
                return jsonify({'error': 'Invalid backup: missing container config'}), 400

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
                # volumes_info.json is not in the archive, so there are no volumes to report.
                volumes_info = []

            return jsonify({
                'port_mappings': port_mappings,
                'volumes': volumes_info,
                'existing_volumes': existing_volumes
            })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/restore-backup', methods=['POST'])
def restore_backup():
    """Restore a backup and deploy the container"""
    data = request.get_json()
    filename = data.get('filename')
    new_name = data.get('new_name', '')
    overwrite_volumes = data.get('overwrite_volumes', None)  # None means check first, True/False explicit
    port_overrides = data.get('port_overrides', None)  # Dict of container_port -> host_port
    
    if not filename:
        return jsonify({'error': 'Filename required'}), 400
    
    # Security: prevent directory traversal
    filename = os.path.basename(filename)
    file_path = os.path.join(app.config['BACKUP_DIR'], filename)
    
    if not os.path.exists(file_path):
        return jsonify({'error': 'Backup file not found'}), 404
    
    try:
        import tarfile
        with tarfile.open(file_path, 'r:gz') as tar:
            # Check for existing volumes ONLY if overwrite not explicitly specified
            # If overwrite_volumes is True or False, user has made a choice - proceed accordingly
            if overwrite_volumes is None:
                try:
                    volumes_info_file = tar.getmember('./volumes_info.json')
                    volumes_info_str = tar.extractfile(volumes_info_file).read().decode('utf-8')
                    volumes_info = json.loads(volumes_info_str)
                    
                    existing_volumes = []
                    for vol_info in volumes_info:
                        if vol_info.get('type') == 'volume':
                            vol_name = vol_info.get('name', '')
                            # Check if volume exists
                            vol_check = subprocess.run(['docker', 'volume', 'inspect', vol_name],
                                                     capture_output=True, text=True, timeout=5)
                            if vol_check.returncode == 0:
                                existing_volumes.append(vol_name)
                    
                    if existing_volumes:
                        return jsonify({
                            'status': 'volume_conflict',
                            'message': 'Volumes already exist',
                            'existing_volumes': existing_volumes
                        }), 409
                except KeyError:
                    # No volumes_info.json, so no conflict is possible.
                    pass

            # Read container config
            try:
                config_file = tar.getmember('./container_config.json')
            except KeyError:
                return jsonify({'error': 'Invalid backup: missing container config'}), 400

            config_str = tar.extractfile(config_file).read().decode('utf-8')
            inspect_data = json.loads(config_str)
            
            # Check if container belongs to a Docker Compose stack
            stack_info = None
            config = inspect_data.get('Config', {}) or {}
            labels = config.get('Labels', {}) or {}
            stack_project = labels.get('com.docker.compose.project', '')
            stack_service = labels.get('com.docker.compose.service', '')
            stack_network = labels.get('com.docker.compose.project.working_dir', '')
            
            if stack_project:
                # Check if stack exists
                # A stack can exist without containers (services scaled to 0), so we check for:
                # 1. Docker Swarm stack services (if Swarm mode)
                # 2. Containers with stack label (Docker Compose standalone)
                stack_exists = False
                try:
                    # First, try checking for Docker Swarm stack services
                    # This is the proper way for Swarm stacks (works even with 0 containers)
                    try:
                        stack_services_result = subprocess.run(
                            ['docker', 'stack', 'services', stack_project, '--format', '{{.Name}}'],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if stack_services_result.returncode == 0 and stack_services_result.stdout.strip():
                            stack_exists = True
                    except:
                        # Not Swarm mode or stack doesn't exist, try container-based check
                        pass
                    
                    # Fallback: Check for containers with stack label (Docker Compose standalone)
                    # This works for Compose-based setups where stacks are just label groupings
                    if not stack_exists:
                        check_result = subprocess.run(
                            ['docker', 'ps', '-a', '--filter', f'label=com.docker.compose.project={stack_project}', '--format', '{{.ID}}'],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if check_result.returncode == 0 and check_result.stdout.strip():
                            # Count how many containers belong to this stack
                            container_ids = [cid.strip() for cid in check_result.stdout.strip().split('\n') if cid.strip()]
                            stack_exists = len(container_ids) > 0
                except Exception as e:
                    print(f"⚠️  Warning: Could not check stack existence: {e}")
                
                stack_info = {
                    'project': stack_project,
                    'service': stack_service,
                    'exists': stack_exists,
                    'network': stack_network
                }
                
                if not stack_exists:
                    print(f"⚠️  Warning: Stack '{stack_project}' does not exist. Container will be restored with stack labels but may need to be added back to the stack manually.")
            
            # Read docker run command or generate it
            docker_run_cmd = None
            
            # Always try to regenerate the command first to get the latest improvements (fixes IP restore issues)
            try:
                generated_cmd = reconstruct_docker_run_command(inspect_data, port_overrides)
                docker_run_cmd = generated_cmd
                print("ℹ️  Using regenerated Docker run command (includes latest fixes)")
                if port_overrides:
                    print(f"   Applied port overrides: {port_overrides}")
            except Exception as e:
                print(f"⚠️  Warning: Failed to regenerate run command: {e}")
                # Fallback to file if available
                try:
                    run_command_file = tar.getmember('./docker_run_command.txt')
                    docker_run_cmd = tar.extractfile(run_command_file).read().decode('utf-8')
                    print("ℹ️  Using stored Docker run command from backup")
                except KeyError:
                    pass  # File not in archive, we'll rely on the generated command.
            
            # If we still don't have a command (shouldn't happen unless config is missing), fail
            if not docker_run_cmd:
                return jsonify({'error': 'Could not determine Docker run command'}), 400
            
            # Modify container name if provided
            if new_name:
                # Replace container name in docker run command
                # Replace --name <old_name> with --name <new_name>
                docker_run_cmd = re.sub(r'--name\s+\S+', f'--name {new_name}', docker_run_cmd)
            
            # Extract and restore volumes BEFORE creating container
            volumes_dir = None
            # Only restore volumes if we have them AND (overwrite is True OR overwrite is None/default)
            # If overwrite_volumes is explicitly False, we skip volume restore (using existing volumes)
            should_restore_volumes = './volumes_info.json' in [m.name for m in tar.getmembers()] and overwrite_volumes is not False

            if should_restore_volumes:
                volumes_info_file = tar.getmember('./volumes_info.json')
                volumes_info_str = tar.extractfile(volumes_info_file).read().decode('utf-8')
                volumes_info = json.loads(volumes_info_str)
                
                # Extract volumes directory from tar
                temp_volumes_dir = tempfile.mkdtemp()
                volumes_dir = temp_volumes_dir
                
                # Extract all volume files (members are named like ./volumes/file.tar.gz)
                tar.extractall(path=temp_volumes_dir, members=[m for m in tar.getmembers() if 'volumes/' in m.name and not m.name.endswith('volumes/')])
                
                # Restore volume data
                for vol_info in volumes_info:
                    if vol_info.get('type') == 'volume':
                        vol_name = vol_info.get('name', '')
                        # Find the volume data file (it should be in volumes/ subdirectory after extraction)
                        vol_data_file = os.path.join(temp_volumes_dir, 'volumes', f"{vol_name}_data.tar.gz")
                        
                        # If not found at expected path, search for it
                        if not os.path.exists(vol_data_file):
                            import glob
                            possible_paths = glob.glob(os.path.join(temp_volumes_dir, '**', f"{vol_name}_data.tar.gz"), recursive=True)
                            if possible_paths:
                                vol_data_file = possible_paths[0]
                                print(f"   Found volume file at: {vol_data_file}")
                        
                        if os.path.exists(vol_data_file):
                            try:
                                # Create volume if it doesn't exist (ignore if already exists)
                                vol_create_result = subprocess.run(['docker', 'volume', 'create', vol_name],
                                             capture_output=True, text=True, timeout=10)
                                if vol_create_result.returncode != 0:
                                    # Check if error is just "volume already exists"
                                    if 'already exists' not in vol_create_result.stderr.lower():
                                        print(f"⚠️  Warning: Could not create volume {vol_name}: {vol_create_result.stderr}")
                                
                                # Restore volume data using temporary container
                                temp_restore_name = f"restore-temp-{vol_name}-{os.urandom(4).hex()}"
                                try:
                                    # Create temp container with volume
                                    create_result = subprocess.run(
                                        ['docker', 'run', '-d', '--name', temp_restore_name,
                                         '-v', f'{vol_name}:/restore-volume',
                                         'busybox', 'sleep', '3600'],
                                        capture_output=True,
                                        timeout=30
                                    )
                                    
                                    if create_result.returncode != 0:
                                        raise Exception(f"Failed to create temp container (busybox missing?): {create_result.stderr.decode()}")
                                    
                                    # Verify volume is mounted correctly
                                    mount_check = subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'mount'],
                                        capture_output=True,
                                        text=True,
                                        timeout=10
                                    )
                                    print(f"   Volume mount check: {mount_check.stdout}")
                                    
                                    # Ensure volume is clean before restoring (remove any existing files)
                                    clean_result = subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'sh', '-c', 'rm -rf /restore-volume/* /restore-volume/.[!.]* 2>/dev/null || true'],
                                        capture_output=True,
                                        timeout=10
                                    )
                                    
                                    # Copy tar.gz into container first, then extract (more reliable than stdin)
                                    print(f"📦 Copying volume data file ({os.path.getsize(vol_data_file)} bytes) to container...")
                                    copy_result = subprocess.run(
                                        ['docker', 'cp', vol_data_file, f'{temp_restore_name}:/tmp/volume_data.tar.gz'],
                                        capture_output=True,
                                        text=True,
                                        timeout=60
                                    )
                                    
                                    if copy_result.returncode != 0:
                                        raise Exception(f"Failed to copy volume data to container: {copy_result.stderr}")
                                    
                                    # Verify file was copied
                                    check_copy = subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'ls', '-lh', '/tmp/volume_data.tar.gz'],
                                        capture_output=True,
                                        text=True,
                                        timeout=10
                                    )
                                    print(f"   File copied: {check_copy.stdout.strip()}")
                                    
                                    # List contents of tar before extracting (for debugging)
                                    list_tar = subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'tar', 'tzf', '/tmp/volume_data.tar.gz'],
                                        capture_output=True,
                                        text=True,
                                        timeout=30
                                    )
                                    print(f"   Tar contents: {list_tar.stdout.strip()}")
                                    
                                    # Extract tar.gz into volume
                                    # The backup creates tar with: tar czf - -C /backup-volume .
                                    # This creates entries like ./ and ./db.sqlite
                                    print(f"📂 Extracting to /restore-volume...")
                                    
                                    # Method 1: Direct extraction (simplest and should work)
                                    extract_result = subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'tar', 'xzf', '/tmp/volume_data.tar.gz', '-C', '/restore-volume'],
                                        capture_output=True,
                                        text=True,
                                        timeout=1200
                                    )
                                    
                                    # Method 2: Extract to temp and copy files (fallback if direct extraction fails)
                                    if extract_result.returncode != 0:
                                        print(f"   Method 1 failed (rc={extract_result.returncode}), trying Method 2...")
                                        extract_result = subprocess.run(
                                            ['docker', 'exec', temp_restore_name, 'sh', '-c',
                                             'mkdir -p /tmp/vol_extract && cd /tmp/vol_extract && tar xzf /tmp/volume_data.tar.gz && find . -type f ! -name "." -exec sh -c "cp {} /restore-volume/$(basename {})" \\; && rm -rf /tmp/vol_extract'],
                                            capture_output=True,
                                            text=True,
                                            timeout=1200
                                        )
                                    
                                    print(f"   Extract stdout: {extract_result.stdout}")
                                    print(f"   Extract stderr: {extract_result.stderr}")
                                    print(f"   Extract returncode: {extract_result.returncode}")
                                    
                                    if extract_result.returncode != 0:
                                        error_output = extract_result.stderr if extract_result.stderr else extract_result.stdout or 'Unknown error'
                                        raise Exception(f"Failed to restore volume {vol_name}: {error_output}")
                                    
                                    # Verify files were extracted by listing volume contents
                                    list_after_extract = subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'sh', '-c',
                                         'ls -la /restore-volume/ && echo "---FILES---" && find /restore-volume -type f'],
                                        capture_output=True,
                                        text=True,
                                        timeout=10
                                    )
                                    print(f"   Volume contents after extraction:\n{list_after_extract.stdout}")
                                    
                                    # Clean up temp file in container
                                    subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'rm', '-f', '/tmp/volume_data.tar.gz'],
                                        capture_output=True,
                                        timeout=10
                                    )
                                    
                                    # Verify files were extracted correctly
                                    verify_result = subprocess.run(
                                        ['docker', 'exec', temp_restore_name, 'sh', '-c', 'ls -la /restore-volume && echo "---" && find /restore-volume -type f'],
                                        capture_output=True,
                                        text=True,
                                        timeout=10
                                    )
                                    
                                    if verify_result.returncode == 0:
                                        print(f"✅ Volume restored: {vol_name}")
                                        print(f"   Volume contents:\n{verify_result.stdout}")
                                        # Check if we actually have files (verify by checking if find found any files)
                                        file_lines = [line for line in verify_result.stdout.split('\n') if line.strip() and not line.startswith('total') and not line.startswith('---') and 'find' not in line.lower()]
                                        if len(file_lines) > 0:
                                            print(f"   ✅ Files verified in volume ({len(file_lines)} items found)")
                                        else:
                                            print(f"   ⚠️  WARNING: Volume appears empty after restore!")
                                    else:
                                        print(f"⚠️  Warning: Volume restored but verification failed: {verify_result.stderr}")
                                    
                                    # Cleanup temp container
                                    subprocess.run(['docker', 'rm', '-f', temp_restore_name],
                                                 capture_output=True, timeout=10)
                                    
                                    # Final verification: Check volume persists after container removal
                                    print(f"   Verifying volume persists after container cleanup...")
                                    final_verify_container = f"verify-{vol_name}-{os.urandom(4).hex()}"
                                    final_check = subprocess.run(
                                        ['docker', 'run', '--rm', '--name', final_verify_container,
                                         '-v', f'{vol_name}:/verify-volume',
                                         'busybox', 'sh', '-c', 'ls -la /verify-volume && find /verify-volume -type f'],
                                        capture_output=True,
                                        text=True,
                                        timeout=30
                                    )
                                    if final_check.returncode == 0:
                                        print(f"   ✅ Final verification: Volume persists correctly")
                                        print(f"   Final contents: {final_check.stdout}")
                                    else:
                                        print(f"   ⚠️  Final verification failed: {final_check.stderr}")
                                except Exception as e:
                                    subprocess.run(['docker', 'rm', '-f', temp_restore_name],
                                                 capture_output=True, timeout=10)
                                    print(f"⚠️  Warning: Could not restore volume {vol_name}: {e}")
                            except Exception as e:
                                print(f"⚠️  Warning: Could not restore volume {vol_name}: {e}")
            elif overwrite_volumes is False:
                print("ℹ️  Skipping volume restore (using existing volumes)")
            
            # Extract and load image if available
            image_file = None
            image_loaded = False
            try:
                image_member = tar.getmember('./image.tar')

                # Extract image to temp location (using streaming)
                temp_image_dir = tempfile.mkdtemp()
                image_file = os.path.join(temp_image_dir, 'image.tar')

                with tar.extractfile(image_member) as source, open(image_file, 'wb') as dest:
                    # Check first few bytes for error marker without reading whole file
                    header = source.read(30)
                    if header.startswith(b'# Image export failed'):
                        print(f"⚠️  Warning: Image backup was not successful")
                    else:
                        # Write the header back and then the rest of the file
                        dest.write(header)
                        shutil.copyfileobj(source, dest)

                # Verify file size and load
                if os.path.getsize(image_file) > 100:  # At least 100 bytes
                    print(f"Loading image from backup ({os.path.getsize(image_file)} bytes)...")
                    result = subprocess.run(
                        ['docker', 'load', '-i', image_file],
                        capture_output=True,
                        text=True,
                        timeout=1200
                    )
                    if result.returncode == 0:
                        image_loaded = True
                        print(f"✅ Image loaded successfully: {result.stdout}")
                    else:
                        error_msg = result.stderr.lower()
                        if 'already exists' in error_msg or 'image' in error_msg:
                            print(f"ℹ️  Image already exists or conflict (non-critical): {result.stderr}")
                            image_loaded = True
                        else:
                            print(f"⚠️  Warning: Failed to load image: {result.stderr}")
                else:
                    print(f"⚠️  Warning: Image file appears to be empty or invalid")

                # Cleanup temp image file
                if image_file and os.path.exists(image_file):
                    os.remove(image_file)
                if temp_image_dir and os.path.exists(temp_image_dir):
                    os.rmdir(temp_image_dir)
            except KeyError:
                print("⚠️  Warning: No image.tar found in backup - image may need to be pulled manually")
            
            # Check and create networks if they don't exist
            network_settings = inspect_data.get('NetworkSettings', {}) or {}
            networks = network_settings.get('Networks', {}) or {}
            host_config = inspect_data.get('HostConfig', {}) or {}
            network_mode = host_config.get('NetworkMode', '')
            
            print(f"🔍 Network creation phase: Found {len(networks)} network(s) in backup: {list(networks.keys()) if networks else 'none'}")
            print(f"🔍 NetworkMode from backup: {network_mode}")
            
            # Create custom networks if they don't exist
            if networks and isinstance(networks, dict):
                for network_name, network_info in networks.items():
                    if network_name not in ['bridge', 'host', 'none']:
                        print(f"🔍 Processing network from dict: {network_name}")
                        # Check if network exists
                        check_result = subprocess.run(
                            ['docker', 'network', 'inspect', network_name],
                            capture_output=True,
                            text=True,
                            timeout=5
                        )
                        if check_result.returncode != 0:
                            # Network doesn't exist, try to create it with subnet from backup
                            print(f"Creating missing network: {network_name}")
                            
                            # Extract subnet information from network_info if available
                            create_cmd = ['docker', 'network', 'create']
                            
                            # Try to determine subnet from Gateway and IPPrefixLen
                            gateway = network_info.get('Gateway', '')
                            ip_prefix_len = network_info.get('IPPrefixLen', 0)
                            ip_address = network_info.get('IPAddress', '')
                            
                            if gateway and ip_prefix_len:
                                # Calculate subnet from gateway and prefix length
                                # Gateway is typically the first IP in the subnet
                                # For example, gateway 10.0.0.1 with /24 means subnet 10.0.0.0/24
                                gateway_parts = gateway.split('.')
                                if len(gateway_parts) == 4:
                                    # Set last octet to 0 for subnet
                                    subnet_parts = gateway_parts[:3] + ['0']
                                    subnet = '.'.join(subnet_parts) + f'/{ip_prefix_len}'
                                    create_cmd.extend(['--subnet', subnet])
                                    create_cmd.extend(['--gateway', gateway])
                                    print(f"   Using subnet from backup: {subnet}, gateway: {gateway}")
                            
                            create_cmd.append(network_name)
                            
                            create_result = subprocess.run(
                                create_cmd,
                                capture_output=True,
                                text=True,
                                timeout=10
                            )
                            if create_result.returncode == 0:
                                print(f"✅ Created network: {network_name}")
                            else:
                                print(f"⚠️  Warning: Could not create network {network_name}: {create_result.stderr}")
                                # Try without subnet as fallback
                                print(f"   Retrying without subnet configuration...")
                                fallback_result = subprocess.run(
                                    ['docker', 'network', 'create', network_name],
                                    capture_output=True,
                                    text=True,
                                    timeout=10
                                )
                                if fallback_result.returncode == 0:
                                    print(f"✅ Created network: {network_name} (without subnet)")
                                else:
                                    print(f"⚠️  Warning: Could not create network {network_name} even without subnet: {fallback_result.stderr}")
            
            # Also check NetworkMode (fallback if not in Networks dict)
            if network_mode and network_mode not in ['bridge', 'host', 'none', 'default'] and not network_mode.startswith('container:'):
                check_result = subprocess.run(
                    ['docker', 'network', 'inspect', network_mode],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                if check_result.returncode != 0:
                    # Network doesn't exist, try to create it
                    # Try to get subnet info from Networks dict if available
                    print(f"Creating missing network: {network_mode}")
                    
                    create_cmd = ['docker', 'network', 'create']
                    
                    # Check if we have network info in Networks dict
                    if network_mode in networks:
                        network_info = networks[network_mode]
                        gateway = network_info.get('Gateway', '')
                        ip_prefix_len = network_info.get('IPPrefixLen', 0)
                        
                        if gateway and ip_prefix_len:
                            gateway_parts = gateway.split('.')
                            if len(gateway_parts) == 4:
                                subnet_parts = gateway_parts[:3] + ['0']
                                subnet = '.'.join(subnet_parts) + f'/{ip_prefix_len}'
                                create_cmd.extend(['--subnet', subnet])
                                create_cmd.extend(['--gateway', gateway])
                                print(f"   Using subnet from backup: {subnet}, gateway: {gateway}")
                    
                    create_cmd.append(network_mode)
                    
                    create_result = subprocess.run(
                        create_cmd,
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if create_result.returncode == 0:
                        print(f"✅ Created network: {network_mode}")
                    else:
                        print(f"⚠️  Warning: Could not create network {network_mode}: {create_result.stderr}")
                        # Try without subnet as fallback
                        print(f"   Retrying without subnet configuration...")
                        fallback_result = subprocess.run(
                            ['docker', 'network', 'create', network_mode],
                            capture_output=True,
                            text=True,
                            timeout=10
                        )
                        if fallback_result.returncode == 0:
                            print(f"✅ Created network: {network_mode} (without subnet)")
                        else:
                            print(f"⚠️  Warning: Could not create network {network_mode} even without subnet: {fallback_result.stderr}")
            
            # Parse docker run command and execute it
            # Clean up the command - remove line continuations and extra whitespace
            docker_run_cmd = docker_run_cmd.replace('\\\n', ' ').replace('\n', ' ')
            # Split by spaces but preserve quoted strings
            try:
                cmd_parts = shlex.split(docker_run_cmd)
            except ValueError:
                # Fallback to simple split if shlex fails
                cmd_parts = docker_run_cmd.split()
            
            # Remove 'docker' and 'run' from the beginning
            while cmd_parts and cmd_parts[0] in ['docker', 'run']:
                cmd_parts.pop(0)
            
            # Remove -d flag if present anywhere (docker create doesn't need it)
            # Also handle --detach flag
            cmd_parts = [part for part in cmd_parts if part not in ['-d', '--detach']]

            # If an --ip flag is present but the network is the default bridge,
            # Docker will reject it with 'invalid config for network bridge'.
            # In that case, strip the --ip flag and let Docker auto-assign.
            network_name = None
            ip_index = None
            for i, part in enumerate(cmd_parts):
                if part == '--network' and i + 1 < len(cmd_parts):
                    network_name = cmd_parts[i + 1]
                if part == '--ip' and i + 1 < len(cmd_parts):
                    ip_index = i
            if ip_index is not None:
                if not network_name or network_name in ['bridge', 'default']:
                    print(f"⚠️ Detected --ip on default network ({network_name or 'bridge'}). Removing --ip flag to avoid Docker bridge error.")
                    # Remove the --ip flag and its value
                    del cmd_parts[ip_index:ip_index + 2]
            
            if not cmd_parts:
                return jsonify({'error': 'Invalid docker run command format'}), 400
            
            # Execute docker create (creates container without starting it)
            # docker create doesn't use -d flag, containers are created stopped by default
            docker_cmd = ['docker', 'create'] + cmd_parts
            
            # Debug: Print the command being executed (for troubleshooting)
            print(f"🔧 Executing: {' '.join(docker_cmd)}")
            
            result = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                timeout=60
            )
            
            # Get the container ID from output (might be in stdout even if returncode != 0)
            container_id = result.stdout.strip() if result.stdout.strip() else None
            
            # Check if container was created successfully (even if there were warnings)
            if result.returncode != 0:
                # Check if error is a conflict (container name already exists)
                error_msg = result.stderr.lower()
                if 'already in use' in error_msg or 'name is already in use' in error_msg:
                    # Try to find the existing container by name
                    if new_name:
                        container_name = new_name
                    else:
                        container_name = inspect_data.get('Name', '').lstrip('/')
                    
                    # Try to get the container ID of the existing container
                    find_result = subprocess.run(
                        ['docker', 'ps', '-a', '--filter', f'name=^{container_name}$', '--format', '{{.ID}}'],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    if find_result.returncode == 0 and find_result.stdout.strip():
                        container_id = find_result.stdout.strip()
                        print(f"ℹ️  Container {container_name} already exists, using existing container")
                    else:
                        return jsonify({
                            'error': f'Container name conflict: {result.stderr}',
                            'details': result.stdout
                        }), 409  # Conflict status code
                else:
                    return jsonify({
                        'error': f'Failed to restore container: {result.stderr}',
                        'details': result.stdout
                    }), 500
            
            # Verify container exists if we got an ID
            if container_id:
                verify_result = subprocess.run(
                    ['docker', 'ps', '-a', '--filter', f'id={container_id}', '--format', '{{.ID}}'],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if verify_result.returncode == 0 and verify_result.stdout.strip():
                    container_id = verify_result.stdout.strip()  # Use verified ID
            
            # Cleanup temp volumes directory
            if volumes_dir and os.path.exists(volumes_dir):
                shutil.rmtree(volumes_dir, ignore_errors=True)
            
            # Prepare response with stack info
            response_data = {
                'success': True,
                'message': f'Container restored successfully',
                'container_id': container_id,
                'container_name': new_name or inspect_data.get('Name', '').lstrip('/')
            }
            
            # Add stack info if available
            if 'stack_info' in locals() and stack_info:
                response_data['stack_info'] = stack_info
                if not stack_info.get('exists'):
                    response_data['stack_warning'] = f"Stack '{stack_info['project']}' does not exist. Container restored with stack labels but may need to be added back to the stack manually."
            
            return jsonify(response_data)
            
    except tarfile.TarError:
        return jsonify({'error': 'Invalid tar.gz file'}), 400
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'Restore operation timed out'}), 500
    except Exception as e:
        import traceback
        traceback.print_exc()
        try:
             # Clean up in case of error
             if 'temp_restore_name' in locals():
                 subprocess.run(['docker', 'rm', '-f', temp_restore_name],
                              capture_output=True, timeout=10)
        except:
            pass
        return jsonify({'error': f'Restore failed: {str(e)}'}), 500


def reconstruct_docker_run_command(inspect_data, port_overrides=None):
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
    # First, collect all exposed ports from Config.ExposedPorts
    exposed_ports = config.get('ExposedPorts', {}) or {}
    
    # Then get bindings from HostConfig
    port_bindings = host_config.get('PortBindings', {}) or {}
    
    # Combine them, prioritizing overrides
    # structure of port_overrides: {'80/tcp': '8080'}
    
    processed_ports = set()
    
    # 1. Handle overrides first (if any)
    if port_overrides:
        for container_port, host_port in port_overrides.items():
            if host_port: # Only if a host port is specified
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
                # Escape quotes and special characters in label value
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
        # Quote arguments to prevent shell expansion issues
        quoted_cmd = []
        for c in cmd:
            c_str = str(c)
            # Simple quoting logic: if it contains spaces or special chars, quote it
            if ' ' in c_str or any(x in c_str for x in ['$','\\','"',"'"]):
                # Escape existing quotes
                c_str = c_str.replace('"', '\\"')
                quoted_cmd.append(f'"{c_str}"')
            else:
                quoted_cmd.append(c_str)
        parts.append(' '.join(quoted_cmd))
    
    return ' \\\n  '.join(parts)


def generate_docker_compose(inspect_data):
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


# Initialize backup manager after helper functions are defined
init_backup_manager()


@app.route('/api/cleanup/dangling-images', methods=['POST'])
def cleanup_dangling_images_endpoint():
    """Clean up dangling Docker images"""
    return cleanup_dangling_images()


def _cleanup_temp_containers_helper():
    """Helper function to clean up orphaned temporary containers (doesn't require Flask context)"""
    try:
        # List all containers (including stopped ones)
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
                rm_result = subprocess.run(['docker', 'rm', '-f', container_name],
                                          capture_output=True, timeout=10)
                if rm_result.returncode == 0:
                    removed_count += 1
                else:
                    errors.append(f"{container_name}: {rm_result.stderr.decode()}")
            except Exception as e:
                errors.append(f"{container_name}: {str(e)}")
        
        message = f'Removed {removed_count} orphaned temp container(s)'
        if errors:
            message += f'. Errors: {"; ".join(errors)}'
        
        return {'message': message, 'removed': removed_count, 'errors': errors}
    except Exception as e:
        return {'error': str(e), 'removed': 0}


@app.route('/api/cleanup/temp-containers', methods=['POST'])
def cleanup_temp_containers_endpoint():
    """Clean up orphaned temporary containers"""
    result = _cleanup_temp_containers_helper()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)


def cleanup_temp_containers():
    """Clean up any orphaned temporary containers (backup-temp-* or restore-temp-*)"""
    result = _cleanup_temp_containers_helper()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)


def cleanup_dangling_images():
    """Clean up dangling Docker images"""
    try:
        
        # Clean dangling images (safe - won't delete tagged images)
        result = subprocess.run(
            ['docker', 'image', 'prune', '-f'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode != 0:
            return jsonify({'error': result.stderr}), 500
        
        # Parse output to get reclaimed space
        # Docker may output to stdout or stderr, check both
        output = result.stdout + '\n' + result.stderr
        reclaimed_space = '0B'
        
        # Look for "Total reclaimed space" in the output
        if 'Total reclaimed space' in output:
            try:
                # Find the line containing "Total reclaimed space"
                for line in output.split('\n'):
                    if 'Total reclaimed space' in line:
                        # Extract value after colon
                        if ':' in line:
                            reclaimed_space = line.split(':', 1)[1].strip()
                        else:
                            # Fallback: extract after "Total reclaimed space"
                            reclaimed_space = line.split('Total reclaimed space')[1].strip()
                        break
            except Exception as e:
                print(f"Warning: Failed to parse reclaimed space: {e}")
                reclaimed_space = '0B'
        
        # Count deleted images
        deleted_count = 0
        if output:
            # Count lines starting with 'deleted:' or 'untagged:'
            deleted_count = len([line for line in output.split('\n') if line.strip().startswith('deleted:') or line.strip().startswith('untagged:')])
        
        return jsonify({
            'success': True,
            'message': f'Cleaned up {deleted_count} dangling image(s)',
            'reclaimed_space': reclaimed_space,
            'deleted_count': deleted_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    import socket
    
    # Clean up any orphaned temp containers on startup
    print("🧹 Cleaning up orphaned temporary containers...")
    try:
        result = _cleanup_temp_containers_helper()
        if result.get('removed', 0) > 0:
            print(f"✅ {result.get('message', 'Cleaned up temp containers')}")
        elif 'error' in result:
            print(f"⚠️  {result.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"Warning: Failed to cleanup temp containers on startup: {e}")
    
    # Get port from environment variable or default to 80
    port = int(os.environ.get('FLASK_PORT', 80))
    
    # Check if port is available
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', port))
    except OSError:
        print(f"Error: Port {port} is already in use")
        exit(1)
    
    print(f"Starting Flask server on port {port}")
    # Force output to stdout immediately
    import sys
    sys.stdout.reconfigure(line_buffering=True)
    # Debug mode disabled by default - set to True to enable debugging
    DEBUG_MODE = False  # Change to True to enable Flask debug mode
    # Disable reloader to prevent double initialization and issues in some environments
    app.run(host='0.0.0.0', port=port, debug=DEBUG_MODE, use_reloader=False)

