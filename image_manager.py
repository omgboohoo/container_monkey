"""
Image Manager Module
Handles Docker image operations
"""
import subprocess
from typing import Dict, List, Any
from docker_utils import APP_IMAGE_NAMES


class ImageManager:
    """Manages Docker image operations"""
    
    def __init__(self):
        """Initialize ImageManager"""
        pass
    
    def list_images(self) -> Dict[str, Any]:
        """List all Docker images"""
        try:
            result = subprocess.run(
                ['docker', 'images', '--format', '{{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}\t{{.CreatedAt}}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode != 0:
                return {'error': result.stderr}
            
            images_in_use = {}
            try:
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
                            container_name = parts[2].lstrip('/')
                            
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
                                        if image_id.startswith('sha256:'):
                                            image_id = image_id[7:]
                                        short_id = image_id[:12] if len(image_id) >= 12 else image_id
                                        if short_id not in images_in_use:
                                            images_in_use[short_id] = []
                                        images_in_use[short_id].append(container_name)
                            except:
                                pass
            except:
                pass
            
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
            
            return {'images': images}
        except Exception as e:
            return {'error': str(e)}
    
    def delete_image(self, image_id: str) -> Dict[str, Any]:
        """Delete a Docker image"""
        image_id = image_id.split('/')[-1].split(':')[0]
        
        try:
            result = subprocess.run(
                ['docker', 'rmi', image_id],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode != 0:
                return {'error': result.stderr}
            
            return {'success': True, 'message': 'Image deleted'}
        except Exception as e:
            return {'error': str(e)}


