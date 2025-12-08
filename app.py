"""
Container Monkey - Flask Application
Refactored to use modular managers
"""
from flask import Flask, render_template, jsonify, send_file, request, after_this_request, session, redirect, url_for
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from werkzeug.utils import secure_filename
import os
import secrets
import socket
from datetime import timedelta

# Import all managers
import docker_utils
from docker_utils import (
    init_docker_client,
    setup_backup_directory
)
from auth_manager import AuthManager
from container_manager import ContainerManager
from volume_manager import VolumeManager
from network_manager import NetworkManager
from image_manager import ImageManager
from stack_manager import StackManager
from backup_manager import BackupManager
from backup_file_manager import BackupFileManager
from restore_manager import RestoreManager
from scheduler_manager import SchedulerManager
from audit_log_manager import AuditLogManager
from database_manager import DatabaseManager
from storage_settings_manager import StorageSettingsManager
from system_manager import (
    get_dashboard_stats, get_system_stats, get_statistics, check_environment as check_environment_helper,
    cleanup_temp_containers_helper, cleanup_dangling_images
)

# Initialize Flask app
app = Flask(__name__)
app.config['SECRET_KEY'] = secrets.token_hex(32)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(days=7)

# Initialize rate limiter
limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=["200 per day", "50 per hour"]
)

# Setup backup directory
app.config['BACKUP_DIR'] = setup_backup_directory()

# Initialize Docker client
init_docker_client()

# Get docker_api_client after initialization (access through module to get updated value)
docker_api_client = docker_utils.docker_api_client

# Initialize unified database manager
# This creates monkey.db with required tables if it doesn't exist
db_path = os.path.join(app.config['BACKUP_DIR'], 'config', 'monkey.db')
DatabaseManager(db_path)

# Initialize managers
# All managers now use the unified monkey.db database
auth_manager = AuthManager(db_path)
audit_log_manager = AuditLogManager(db_path)
storage_settings_manager = StorageSettingsManager(db_path)
container_manager = ContainerManager()
volume_manager = VolumeManager()
network_manager = NetworkManager(app.config['BACKUP_DIR'], storage_settings_manager=storage_settings_manager)
image_manager = ImageManager()
stack_manager = StackManager()
backup_file_manager = BackupFileManager(app.config['BACKUP_DIR'], audit_log_manager=audit_log_manager, storage_settings_manager=storage_settings_manager)

# Initialize backup manager
backup_manager = None
if docker_api_client:
    backup_manager = BackupManager(
        docker_api_client=docker_api_client,
        backup_dir=app.config['BACKUP_DIR'],
        app_container_name=docker_utils.APP_CONTAINER_NAME,
        app_volume_name=docker_utils.APP_VOLUME_NAME,
        reconstruct_docker_run_command_fn=docker_utils.reconstruct_docker_run_command,
        generate_docker_compose_fn=docker_utils.generate_docker_compose,
        audit_log_manager=audit_log_manager,
        storage_settings_manager=storage_settings_manager
    )
    print("✅ Backup manager initialized")

# Initialize restore manager
restore_manager = None
if docker_api_client:
    restore_manager = RestoreManager(
        docker_api_client=docker_api_client,
        backup_dir=app.config['BACKUP_DIR'],
        app_container_name=docker_utils.APP_CONTAINER_NAME,
        app_volume_name=docker_utils.APP_VOLUME_NAME,
        reconstruct_docker_run_command_fn=docker_utils.reconstruct_docker_run_command,
        generate_docker_compose_fn=docker_utils.generate_docker_compose,
        audit_log_manager=audit_log_manager
    )
    print("✅ Restore manager initialized")

# Initialize scheduler manager
scheduler_manager = None
if backup_manager:
    scheduler_manager = SchedulerManager(
        backup_manager=backup_manager,
        backup_dir=app.config['BACKUP_DIR'],
        db_path=db_path,
        audit_log_manager=audit_log_manager
    )
    # Start scheduler if enabled
    if scheduler_manager.is_enabled():
        scheduler_manager.start_scheduler()
    print("✅ Scheduler manager initialized")

# Login required decorator
def login_required(f):
    return auth_manager.login_required(f)

# Protect all routes except auth routes
@app.before_request
def require_login():
    auth_routes = ['/api/login', '/api/logout', '/api/auth-status']
    if request.path in auth_routes:
        return None
    
    if request.path.startswith('/static/'):
        return None
    
    if request.path == '/':
        return None
    
    if request.path.startswith('/api/'):
        if 'logged_in' not in session or not session['logged_in']:
            return jsonify({'error': 'Authentication required'}), 401
    
    return None

# Authentication routes
@app.route('/api/login', methods=['POST'])
@limiter.limit("5 per minute")
def login():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')
    
    result = auth_manager.login(username, password)
    if 'error' in result:
        return jsonify({'error': result['error']}), result.get('status_code', 500)
    return jsonify(result)

@app.route('/api/logout', methods=['POST'])
def logout():
    result = auth_manager.logout()
    return jsonify(result)

@app.route('/api/change-password', methods=['POST'])
@login_required
def change_password():
    data = request.get_json() or {}
    result = auth_manager.change_password(
        current_password=data.get('current_password', ''),
        new_password=data.get('new_password'),
        new_username=data.get('new_username')
    )
    if 'error' in result:
        return jsonify({'error': result['error']}), result.get('status_code', 500)
    return jsonify(result)

@app.route('/api/auth-status')
def auth_status():
    result = auth_manager.auth_status()
    return jsonify(result)

# UI routes
@app.route('/')
def index():
    stats = get_dashboard_stats(app.config['BACKUP_DIR'], backup_file_manager=backup_file_manager)
    # Add scheduled containers count and next run
    if scheduler_manager:
        stats['scheduled_containers_qty'] = len(scheduler_manager.selected_containers)
        config = scheduler_manager.get_config()
        stats['scheduler_next_run'] = config.get('next_run')
    else:
        stats['scheduled_containers_qty'] = 0
        stats['scheduler_next_run'] = None
    return render_template('index.html', **stats)

@app.route('/console/<container_id>')
def console_page(container_id):
    return render_template('console.html', container_id=container_id)

# System routes
@app.route('/api/dashboard-stats')
def dashboard_stats():
    stats = get_dashboard_stats(app.config['BACKUP_DIR'], backup_file_manager=backup_file_manager)
    # Add scheduled containers count and next run
    if scheduler_manager:
        stats['scheduled_containers_qty'] = len(scheduler_manager.selected_containers)
        config = scheduler_manager.get_config()
        stats['scheduler_next_run'] = config.get('next_run')
    else:
        stats['scheduled_containers_qty'] = 0
        stats['scheduler_next_run'] = None
    return jsonify(stats)

@app.route('/api/system-stats')
@limiter.exempt  # Exempt from rate limiting to ensure stats always work
def system_stats():
    try:
        result = get_system_stats()
        if 'error' in result:
            return jsonify(result), 500
        return jsonify(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/statistics')
@login_required
def statistics():
    result = get_statistics()
    if 'error' in result:
        status_code = 500 if result['error'] != 'Docker client not available' else 503
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/check-environment', methods=['GET'])
def check_environment():
    result = check_environment_helper()
    return jsonify(result)

@app.route('/api/cleanup/temp-containers', methods=['POST'])
def cleanup_temp_containers():
    result = cleanup_temp_containers_helper()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/cleanup/dangling-images', methods=['POST'])
def cleanup_dangling_images_endpoint():
    result = cleanup_dangling_images()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

# Container routes
@app.route('/api/containers')
def list_containers():
    result = container_manager.list_containers()
    if 'error' in result:
        status_code = 500 if result['error'] != 'Docker client not available' else 503
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/container/<container_id>/start', methods=['POST'])
def start_container(container_id):
    result = container_manager.start_container(container_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/container/<container_id>/stop', methods=['POST'])
def stop_container(container_id):
    result = container_manager.stop_container(container_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/container/<container_id>/kill', methods=['POST'])
def kill_container(container_id):
    result = container_manager.kill_container(container_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/container/<container_id>/restart', methods=['POST'])
def restart_container(container_id):
    result = container_manager.restart_container(container_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/container/<container_id>/delete', methods=['DELETE'])
def delete_container(container_id):
    delete_volumes = request.args.get('delete_volumes', 'false').lower() == 'true'
    result = container_manager.delete_container(container_id, delete_volumes)
    if 'error' in result:
        return jsonify(result), 500
    
    # Remove container from scheduler if it's in the selected containers list
    if scheduler_manager:
        scheduler_manager.remove_container(container_id)
    
    return jsonify(result)

@app.route('/api/container/<container_id>/logs')
def container_logs(container_id):
    tail = request.args.get('tail', 100, type=int)
    result = container_manager.container_logs(container_id, tail)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/container/<container_id>/details')
def container_details(container_id):
    result = container_manager.container_details(container_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/container/<container_id>/exec', methods=['POST'])
def exec_container_command(container_id):
    data = request.get_json() or {}
    command = data.get('command', '')
    result = container_manager.exec_container_command(container_id, command)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/container/<container_id>/stats')
def get_container_stats(container_id):
    result = container_manager.get_container_stats(container_id)
    return jsonify(result)

@app.route('/api/container/<container_id>/redeploy', methods=['POST'])
def redeploy_container(container_id):
    data = request.get_json() or {}
    port_overrides = data.get('port_overrides')
    result = container_manager.redeploy_container(container_id, port_overrides)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

# Volume routes
@app.route('/api/volumes')
def list_volumes():
    result = volume_manager.list_volumes()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/volume/<volume_name>/explore')
def explore_volume(volume_name):
    path = request.args.get('path', '/')
    result = volume_manager.explore_volume(volume_name, path)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/volume/<volume_name>/file')
def get_volume_file(volume_name):
    file_path = request.args.get('path', '')
    result = volume_manager.get_volume_file(volume_name, file_path)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/volume/<volume_name>/download')
def download_volume_file(volume_name):
    file_path = request.args.get('path', '')
    try:
        from flask import Response
        file_content = volume_manager.download_volume_file(volume_name, file_path)
        filename = os.path.basename(file_path) or 'file'
        return Response(
            file_content,
            mimetype='application/octet-stream',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Content-Length': str(len(file_content))
            }
        )
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/volume/<volume_name>/delete', methods=['DELETE'])
def delete_volume(volume_name):
    result = volume_manager.delete_volume(volume_name)
    if 'error' in result:
        status_code = 400 if result.get('in_use') else 500
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/volumes/delete', methods=['POST'])
def delete_volumes():
    data = request.get_json() or {}
    volume_names = data.get('names', [])
    result = volume_manager.delete_volumes(volume_names)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

# Network routes
@app.route('/api/networks')
def list_networks():
    result = network_manager.list_networks()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/network/<network_id>/backup', methods=['POST'])
def backup_network(network_id):
    result = network_manager.backup_network(network_id)
    if 'error' in result:
        status_code = 400 if 'Cannot backup default' in result['error'] else 500
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/network/<network_id>/delete', methods=['DELETE'])
def delete_network(network_id):
    result = network_manager.delete_network(network_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/network/restore', methods=['POST'])
def restore_network():
    data = request.get_json() or {}
    filename = data.get('filename')
    result = network_manager.restore_network(filename)
    if 'error' in result:
        status_code = 400 if 'Cannot restore default' in result.get('error', '') else (409 if 'already exists' in result.get('error', '') else 500)
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/network-backups')
def list_network_backups():
    result = network_manager.list_network_backups()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/upload-network-backup', methods=['POST'])
def upload_network_backup():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.endswith('.json'):
        return jsonify({'error': 'Only .json files are allowed'}), 400
    
    try:
        file_content = file.read()
        filename = secure_filename(file.filename)
        result = network_manager.upload_network_backup(file_content, filename)
        if 'error' in result:
            return jsonify(result), 400
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Image routes
@app.route('/api/images')
def list_images():
    result = image_manager.list_images()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/image/<image_id>/delete', methods=['DELETE'])
def delete_image(image_id):
    result = image_manager.delete_image(image_id)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

# Stack routes
@app.route('/api/stacks')
def list_stacks():
    result = stack_manager.list_stacks()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/stack/<stack_name>/delete', methods=['DELETE'])
def delete_stack(stack_name):
    result = stack_manager.delete_stack(stack_name)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

# Backup routes
@app.route('/api/backup/<container_id>', methods=['POST'])
def backup_container(container_id):
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
        if 'already in progress' in error_msg.lower():
            status = backup_manager.get_status()
            return jsonify({
                'error': error_msg,
                'status': 'busy',
                'current_backup': status.get('current_backup', 'Unknown')
            }), 409
        return jsonify({'error': f'Backup failed: {error_msg}'}), 500

@app.route('/api/backup-progress/<progress_id>')
@limiter.exempt
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
    if not backup_manager:
        return jsonify({'error': 'Backup manager not available'}), 500
    
    status = backup_manager.get_status()
    return jsonify(status)

@app.route('/api/backups')
def list_backups():
    result = backup_file_manager.list_backups()
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/download/<filename>')
def download_backup(filename):
    file_path = backup_file_manager.get_backup_path(filename)
    if not file_path:
        return jsonify({'error': 'Backup file not found'}), 404
    return send_file(file_path, as_attachment=True, download_name=filename)

@app.route('/api/backup/<filename>', methods=['DELETE'])
def delete_backup(filename):
    user = session.get('username')
    result = backup_file_manager.delete_backup(filename, user=user)
    if 'error' in result:
        status_code = 404 if 'not found' in result['error'].lower() else 500
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/backups/delete-all', methods=['DELETE'])
def delete_all_backups():
    user = session.get('username')
    result = backup_file_manager.delete_all_backups(user=user)
    if 'error' in result:
        return jsonify(result), 500
    return jsonify(result)

@app.route('/api/upload-backup', methods=['POST'])
def upload_backup():
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    try:
        file_content = file.read()
        filename = secure_filename(file.filename)
        result = backup_file_manager.upload_backup(file_content, filename)
        if 'error' in result:
            status_code = 400 if 'Invalid' in result['error'] else 500
            return jsonify(result), status_code
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/backup/<filename>/preview')
def preview_backup(filename):
    if not restore_manager:
        return jsonify({'error': 'Restore manager not available'}), 500
    
    file_path = backup_file_manager.get_backup_path(filename)
    if not file_path:
        return jsonify({'error': 'Backup file not found'}), 404
    
    result = restore_manager.preview_backup(file_path)
    if 'error' in result:
        status_code = 404 if 'not found' in result['error'].lower() else 400
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/restore-backup', methods=['POST'])
def restore_backup():
    if not restore_manager:
        return jsonify({'error': 'Restore manager not available'}), 500
    
    data = request.get_json() or {}
    filename = data.get('filename')
    new_name = data.get('new_name', '')
    overwrite_volumes = data.get('overwrite_volumes', None)
    port_overrides = data.get('port_overrides', None)
    user = session.get('username')
    
    if not filename:
        return jsonify({'error': 'Filename required'}), 400
    
    file_path = backup_file_manager.get_backup_path(filename)
    if not file_path:
        return jsonify({'error': 'Backup file not found'}), 404
    
    # Check if this is a temp file from S3 download
    is_temp_file = file_path.startswith(backup_file_manager.temp_dir)
    
    result = restore_manager.restore_backup(file_path, new_name, overwrite_volumes, port_overrides, user=user)
    
    # Clean up temp file after restore (whether successful or not)
    if is_temp_file and os.path.exists(file_path):
        try:
            os.remove(file_path)
            print(f"🧹 Cleaned up temp file: {file_path}")
        except Exception as e:
            print(f"⚠️  Error cleaning up temp file {file_path}: {e}")
    
    if 'error' in result:
        status_code = 400 if 'Invalid' in result['error'] else (409 if 'conflict' in result['error'].lower() or 'already exists' in result['error'].lower() else 500)
        return jsonify(result), status_code
    
    if result.get('status') == 'volume_conflict':
        return jsonify(result), 409
    
    return jsonify(result)

@app.route('/api/backups/download-all-prepare', methods=['POST'])
def prepare_download_all():
    result = backup_file_manager.prepare_download_all()
    if 'error' in result:
        status_code = 404 if 'not found' in result['error'].lower() else 500
        return jsonify(result), status_code
    return jsonify(result)

@app.route('/api/backups/download-all-progress/<session_id>')
@limiter.exempt
def get_download_all_progress(session_id):
    result = backup_file_manager.get_download_all_progress(session_id)
    if 'error' in result:
        return jsonify(result), 404
    return jsonify(result)

@app.route('/api/backups/download-all-create/<session_id>', methods=['POST'])
def create_download_all_archive(session_id):
    result = backup_file_manager.create_download_all_archive(session_id)
    if 'error' in result:
        return jsonify(result), 404
    return jsonify(result)

@app.route('/api/backups/download-all/<session_id>')
def download_all_backups(session_id):
    archive_path = backup_file_manager.get_download_all_file(session_id)
    if not archive_path:
        return jsonify({'error': 'Archive file not ready'}), 400
    
    progress = backup_file_manager.download_all_progress.get(session_id, {})
    archive_filename = progress.get('archive_filename', 'all_backups.tar.gz')
    
    @after_this_request
    def cleanup(response):
        backup_file_manager.cleanup_download_session(session_id)
        return response
    
    return send_file(archive_path, as_attachment=True, download_name=archive_filename)

# Scheduler API endpoints
@app.route('/api/scheduler/config', methods=['GET'])
@login_required
def get_scheduler_config():
    """Get scheduler configuration"""
    if not scheduler_manager:
        return jsonify({'error': 'Scheduler manager not available'}), 500
    
    # Validate containers by checking against existing containers
    containers_result = container_manager.list_containers()
    existing_container_ids = []
    if 'containers' in containers_result:
        existing_container_ids = [c['id'] for c in containers_result['containers']]
    
    # Get config with validation to remove non-existent containers
    config = scheduler_manager.get_config(validate_containers=True, existing_container_ids=existing_container_ids)
    return jsonify(config)

@app.route('/api/scheduler/config', methods=['POST'])
@login_required
def update_scheduler_config():
    """Update scheduler configuration"""
    if not scheduler_manager:
        return jsonify({'error': 'Scheduler manager not available'}), 500
    
    try:
        data = request.get_json()
        schedule_type = data.get('schedule_type', 'daily')
        hour = int(data.get('hour', 2))
        day_of_week = data.get('day_of_week')  # Can be None for daily
        lifecycle = int(data.get('lifecycle', 7))
        selected_containers = data.get('selected_containers', [])
        
        # Validate inputs
        if schedule_type not in ['daily', 'weekly']:
            return jsonify({'error': 'Invalid schedule_type'}), 400
        if hour < 0 or hour > 23:
            return jsonify({'error': 'Hour must be 0-23'}), 400
        if schedule_type == 'weekly' and (day_of_week is None or day_of_week < 0 or day_of_week > 6):
            return jsonify({'error': 'day_of_week must be 0-6 for weekly schedule'}), 400
        if lifecycle < 1:
            return jsonify({'error': 'Lifecycle must be at least 1'}), 400
        
        # Update configuration
        scheduler_manager.update_config(
            schedule_type=schedule_type,
            hour=hour,
            day_of_week=day_of_week,
            lifecycle=lifecycle,
            selected_containers=selected_containers
        )
        
        return jsonify({
            'success': True,
            'config': scheduler_manager.get_config()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduler/cleanup', methods=['POST'])
@login_required
def run_scheduler_cleanup():
    """Manually trigger cleanup of old scheduled backups"""
    if not scheduler_manager:
        return jsonify({'error': 'Scheduler manager not available'}), 500
    
    try:
        scheduler_manager.cleanup_old_backups()
        return jsonify({'success': True, 'message': 'Cleanup completed'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/scheduler/test', methods=['POST'])
@login_required
def test_scheduler():
    """Trigger scheduled backups immediately (for testing)"""
    if not scheduler_manager:
        return jsonify({'error': 'Scheduler manager not available'}), 500
    
    try:
        if not scheduler_manager.is_enabled():
            return jsonify({'error': 'Scheduler is disabled (no containers selected)'}), 400
        
        # Trigger scheduled backups
        scheduler_manager._run_scheduled_backups()
        return jsonify({
            'success': True,
            'message': f'Scheduled backups triggered for {len(scheduler_manager.selected_containers)} container(s)'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/system-time', methods=['GET'])
@login_required
def get_system_time():
    """Get current system time"""
    from datetime import datetime
    return jsonify({
        'time': datetime.now().isoformat(),
        'formatted': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    })

# Audit Log API endpoints
@app.route('/api/audit-logs', methods=['GET'])
@login_required
def get_audit_logs():
    """Get audit logs with optional filtering"""
    try:
        limit = request.args.get('limit', 1000, type=int)
        offset = request.args.get('offset', 0, type=int)
        operation_type = request.args.get('operation_type')
        container_id = request.args.get('container_id')
        status = request.args.get('status')
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        result = audit_log_manager.get_logs(
            limit=limit,
            offset=offset,
            operation_type=operation_type,
            container_id=container_id,
            status=status,
            start_date=start_date,
            end_date=end_date
        )
        
        if 'error' in result:
            return jsonify(result), 500
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/audit-logs/statistics', methods=['GET'])
@login_required
def get_audit_log_statistics():
    """Get audit log statistics"""
    try:
        result = audit_log_manager.get_statistics()
        if 'error' in result:
            return jsonify(result), 500
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/audit-logs/clear', methods=['DELETE'])
@login_required
def clear_audit_logs():
    """Clear all audit logs"""
    try:
        result = audit_log_manager.clear_all_logs()
        if 'error' in result:
            return jsonify(result), 500
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Storage Settings API endpoints
@app.route('/api/storage/settings', methods=['GET'])
@login_required
def get_storage_settings():
    """Get storage settings"""
    try:
        settings = storage_settings_manager.get_settings()
        # Return secret key for modal prepopulation (it's already decrypted and will be obscured in password field)
        return jsonify({
            'storage_type': settings['storage_type'],
            's3_bucket': settings['s3_bucket'],
            's3_region': settings['s3_region'],
            's3_access_key': settings['s3_access_key'],
            's3_secret_key': settings['s3_secret_key']  # Return secret key for prepopulation (obscured in password field)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/storage/settings', methods=['POST'])
@login_required
def update_storage_settings():
    """Update storage settings"""
    try:
        data = request.get_json() or {}
        storage_type = data.get('storage_type', 'local')
        
        if storage_type not in ['local', 's3']:
            return jsonify({'error': 'Invalid storage_type. Must be "local" or "s3"'}), 400
        
        if storage_type == 's3':
            s3_bucket = data.get('s3_bucket', '').strip()
            s3_region = data.get('s3_region', '').strip()
            s3_access_key = data.get('s3_access_key', '').strip()
            s3_secret_key = data.get('s3_secret_key', '').strip()
            
            if not s3_bucket or not s3_region or not s3_access_key or not s3_secret_key:
                return jsonify({'error': 'All S3 fields are required when storage_type is "s3"'}), 400
            
            result = storage_settings_manager.update_settings(
                storage_type=storage_type,
                s3_bucket=s3_bucket,
                s3_region=s3_region,
                s3_access_key=s3_access_key,
                s3_secret_key=s3_secret_key
            )
        else:
            # When switching to local, preserve existing S3 credentials
            current_settings = storage_settings_manager.get_settings()
            result = storage_settings_manager.update_settings(
                storage_type='local',
                s3_bucket=current_settings.get('s3_bucket') or None,
                s3_region=current_settings.get('s3_region') or None,
                s3_access_key=current_settings.get('s3_access_key') or None,
                s3_secret_key=current_settings.get('s3_secret_key') or None
            )
        
        if 'error' in result:
            return jsonify(result), 500
        
        return jsonify({
            'success': True,
            'settings': storage_settings_manager.get_settings()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/storage/test-s3', methods=['POST'])
@login_required
def test_s3_connection():
    """Test S3 connection"""
    try:
        data = request.get_json() or {}
        s3_bucket = data.get('s3_bucket', '').strip()
        s3_region = data.get('s3_region', '').strip()
        s3_access_key = data.get('s3_access_key', '').strip()
        s3_secret_key = data.get('s3_secret_key', '').strip()
        
        if not s3_bucket or not s3_region or not s3_access_key or not s3_secret_key:
            return jsonify({'error': 'All S3 fields are required'}), 400
        
        from s3_storage_manager import S3StorageManager
        s3_manager = S3StorageManager(
            bucket_name=s3_bucket,
            region=s3_region,
            access_key=s3_access_key,
            secret_key=s3_secret_key
        )
        
        result = s3_manager.test_connection()
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': f'Error: {str(e)}'}), 500

# Error handler removed - was causing issues with error propagation
# Errors are now handled at the route level

if __name__ == '__main__':
    # Clean up orphaned temp containers on startup
    print("🧹 Cleaning up orphaned temporary containers...")
    try:
        result = cleanup_temp_containers_helper()
        if result.get('removed', 0) > 0:
            print(f"✅ {result.get('message', 'Cleaned up temp containers')}")
        elif 'error' in result:
            print(f"⚠️  {result.get('error', 'Unknown error')}")
    except Exception as e:
        print(f"Warning: Failed to cleanup temp containers on startup: {e}")
    
    # Clean up old temp files from S3 downloads
    print("🧹 Cleaning up old temp files...")
    try:
        backup_file_manager.cleanup_old_temp_files(max_age_hours=24)
    except Exception as e:
        print(f"Warning: Failed to cleanup temp files on startup: {e}")
    
    port = int(os.environ.get('FLASK_PORT', 80))
    
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.bind(('', port))
    except OSError:
        print(f"Error: Port {port} is already in use")
        exit(1)
    
    print(f"Starting Flask server on port {port}")
    import sys
    sys.stdout.reconfigure(line_buffering=True)
    DEBUG_MODE = False
    app.run(host='0.0.0.0', port=port, debug=DEBUG_MODE, use_reloader=False)

