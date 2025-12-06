"""
Stack Manager Module
Handles Docker stack operations
"""
import subprocess
from typing import Dict, List, Any
from docker_utils import APP_CONTAINER_NAME, APP_VOLUME_NAME


class StackManager:
    """Manages Docker stack operations"""
    
    def __init__(self):
        """Initialize StackManager"""
        pass
    
    def list_stacks(self) -> Dict[str, Any]:
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
                            
                            stack_info = {
                                'name': stack_name,
                                'type': 'swarm',
                                'services_count': int(services_count) if services_count.isdigit() else 0,
                                'containers_count': 0,
                                'networks': []
                            }
                            
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
                                    
                                    total_containers = 0
                                    for service_name in service_names:
                                        try:
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
            
            # 2. Get Compose-based stacks
            try:
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
                            
                            if stack_name and stack_name not in stack_names:
                                if stack_name not in compose_stacks:
                                    compose_stacks[stack_name] = {
                                        'containers': [],
                                        'services': set(),
                                        'networks': set()
                                    }
                                
                                compose_stacks[stack_name]['containers'].append(container_id)
                                
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
                    
                    for stack_name, stack_data in compose_stacks.items():
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
            
            stacks.sort(key=lambda x: x['name'].lower())
            
            return {'stacks': stacks}
        except Exception as e:
            import traceback
            traceback.print_exc()
            return {'error': str(e)}
    
    def delete_stack(self, stack_name: str) -> Dict[str, Any]:
        """Delete a Docker stack"""
        try:
            # Try Swarm stack first
            result = subprocess.run(
                ['docker', 'stack', 'rm', stack_name],
                capture_output=True,
                text=True,
                timeout=60
            )
            
            if result.returncode == 0:
                return {
                    'success': True,
                    'message': f'Swarm stack {stack_name} deleted successfully',
                    'type': 'swarm'
                }
            
            # If not a Swarm stack, try to delete Compose stack (delete all containers with that project label)
            containers_result = subprocess.run(
                ['docker', 'ps', '-a', '--filter', f'label=com.docker.compose.project={stack_name}', '--format', '{{.ID}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if containers_result.returncode == 0:
                container_ids = [cid.strip() for cid in containers_result.stdout.strip().split('\n') if cid.strip()]
                if container_ids:
                    deleted_count = 0
                    errors = []
                    for container_id in container_ids:
                        try:
                            subprocess.run(['docker', 'stop', '-t', '0', container_id], capture_output=True, timeout=10)
                            rm_result = subprocess.run(['docker', 'rm', container_id], capture_output=True, text=True, timeout=10)
                            if rm_result.returncode == 0:
                                deleted_count += 1
                            else:
                                errors.append(f"{container_id}: {rm_result.stderr}")
                        except Exception as e:
                            errors.append(f"{container_id}: {str(e)}")
                    
                    if deleted_count > 0:
                        return {
                            'success': True,
                            'message': f'Compose stack {stack_name} deleted ({deleted_count} container(s) removed)',
                            'type': 'compose',
                            'deleted_count': deleted_count,
                            'errors': errors if errors else None
                        }
            
            return {'error': f'Stack {stack_name} not found or could not be deleted'}
        except Exception as e:
            return {'error': str(e)}











