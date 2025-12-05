"""
Network Manager Module
Handles all Docker network operations
"""
import os
import json
import subprocess
from datetime import datetime
from typing import Dict, Any, Optional


class NetworkManager:
    """Manages Docker network operations"""
    
    def __init__(self, backup_dir: str):
        """
        Initialize NetworkManager
        
        Args:
            backup_dir: Directory to store network backups
        """
        self.backup_dir = backup_dir
    
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
                        'containers': 0,
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
                                
                                containers = net_data.get('Containers', {}) or {}
                                if isinstance(containers, dict):
                                    network_info['containers'] = len(containers)
                                elif isinstance(containers, list):
                                    network_info['containers'] = len(containers)
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
            
            with open(backup_path, 'w') as f:
                json.dump(network_info, f, indent=2)
            
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
        """Restore a network from backup file"""
        if not filename:
            return {'error': 'Filename required'}
        
        filename = os.path.basename(filename)
        file_path = os.path.join(self.backup_dir, filename)
        
        if not os.path.exists(file_path):
            return {'error': 'Backup file not found'}
        
        try:
            with open(file_path, 'r') as f:
                network_config = json.load(f)
            
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
            import traceback
            traceback.print_exc()
            return {'error': f'Restore failed: {str(e)}'}
    
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






