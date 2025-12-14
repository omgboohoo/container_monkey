"""
Direct Docker API client using HTTP requests to Unix socket
This bypasses docker-py library issues and works like Portainer
"""
import json
import os
import socket
import urllib.request
import urllib.parse
from typing import Optional, Dict, List, Any


class DockerAPIClient:
    """Direct Docker API client using Unix socket HTTP requests"""
    
    def __init__(self, socket_path: str = '/var/run/docker.sock'):
        self.socket_path = socket_path
        self.base_url = f'http://localhost'
    
    def _parse_chunked_body(self, body: bytes) -> bytes:
        """Parse HTTP chunked transfer encoding"""
        result = b''
        pos = 0
        while pos < len(body):
            # Find chunk size line (ends with \r\n)
            line_end = body.find(b'\r\n', pos)
            if line_end == -1:
                break
            chunk_size_hex = body[pos:line_end].decode('utf-8', errors='ignore')
            try:
                chunk_size = int(chunk_size_hex, 16)
            except ValueError:
                # Not a valid hex number, might be start of data
                # Try to find JSON start
                json_start = body.find(b'{', pos)
                if json_start != -1:
                    # Assume rest is JSON data
                    return body[json_start:]
                break
            
            if chunk_size == 0:
                break
            
            # Skip \r\n after chunk size
            data_start = line_end + 2
            data_end = data_start + chunk_size
            
            if data_end > len(body):
                break
            
            result += body[data_start:data_end]
            pos = data_end + 2  # Skip \r\n after chunk data
        
        return result
        
    def _make_request(self, method: str, path: str, data: Optional[bytes] = None) -> Dict:
        """Make HTTP request to Docker Unix socket"""
        url = f'{self.base_url}{path}'
        
        # Create Unix socket connection
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            sock.connect(self.socket_path)
            
            # Build HTTP request
            request_line = f'{method} {path} HTTP/1.1\r\n'
            headers = [
                'Host: localhost',
                'Connection: close',
            ]
            
            if data:
                headers.append(f'Content-Length: {len(data)}')
                headers.append('Content-Type: application/json')
            
            request = request_line + '\r\n'.join(headers) + '\r\n\r\n'
            if data:
                request = request.encode() + data
            else:
                request = request.encode()
            
            # Send request
            sock.sendall(request)
            
            # Read response
            response = b''
            while True:
                chunk = sock.recv(4096)
                if not chunk:
                    break
                response += chunk
            
            # Parse HTTP response
            header_end = response.find(b'\r\n\r\n')
            if header_end == -1:
                raise Exception("Invalid HTTP response")
            
            headers_text = response[:header_end].decode('utf-8', errors='ignore')
            body = response[header_end + 4:]
            
            # Check for chunked transfer encoding
            if 'Transfer-Encoding: chunked' in headers_text:
                # Parse chunked encoding
                body = self._parse_chunked_body(body)
            
            # Parse status line
            status_line = headers_text.split('\r\n')[0]
            status_parts = status_line.split(' ', 2)
            status_code = int(status_parts[1])
            
            if status_code >= 400:
                error_msg = body.decode('utf-8', errors='ignore')
                raise Exception(f"Docker API error {status_code}: {error_msg}")
            
            # Parse JSON response
            if body:
                try:
                    body_str = body.decode('utf-8')
                    return json.loads(body_str)
                except json.JSONDecodeError as e:
                    # If JSON parsing fails, try to get error message
                    error_msg = body.decode('utf-8', errors='ignore')
                    raise Exception(f"Failed to parse JSON response: {e}. Response: {error_msg[:200]}")
            return {}
            
        finally:
            sock.close()
    
    def ping(self) -> bool:
        """Test Docker connection"""
        try:
            result = self._make_request('GET', '/version')
            return 'Version' in result or 'ApiVersion' in result
        except Exception as e:
            raise Exception(f"Docker ping failed: {e}")
    
    def list_containers(self, all: bool = True) -> List[Dict]:
        """List containers"""
        path = '/containers/json'
        if all:
            path += '?all=1'
        return self._make_request('GET', path)

    def list_images(self, all: bool = False) -> List[Dict]:
        """List images"""
        path = '/images/json'
        if all:
            path += '?all=1'
        return self._make_request('GET', path)

    def list_volumes(self) -> List[Dict]:
        """List volumes"""
        response = self._make_request('GET', '/volumes')
        return response.get('Volumes', [])

    def list_networks(self) -> List[Dict]:
        """List networks"""
        return self._make_request('GET', '/networks')
    
    def inspect_container(self, container_id: str) -> Dict:
        """Inspect a container"""
        return self._make_request('GET', f'/containers/{container_id}/json')
    
    def inspect_volume(self, volume_name: str) -> Dict:
        """Inspect a single volume to get detailed information, including size."""
        # This requires the API version to be 1.21 or greater.
        # The 'UsageData' field is only populated if the docker daemon was started with `--storage-opt size`.
        # However, we can try to get it.
        return self._make_request('GET', f'/volumes/{volume_name}')

    def get_container_logs(self, container_id: str, tail: int = 100) -> str:
        """Get container logs"""
        path = f'/containers/{container_id}/logs?stdout=1&stderr=1&tail={tail}'
        result = self._make_request('GET', path)
        if isinstance(result, dict) and 'raw' in result:
            return result['raw']
        return str(result)
    
    def get_image_id(self, container_id: str) -> str:
        """Get image ID from container"""
        inspect_data = self.inspect_container(container_id)
        # Image ID can be in different fields
        image_id = inspect_data.get('Image', '')
        if not image_id:
            # Try Config.Image which contains the image name/tag
            image_id = inspect_data.get('Config', {}).get('Image', '')
        return image_id
    
    def export_image_stream(self, image_id: str, output_path: str):
        """Export image as tar stream to file"""
        # Use subprocess for image export as it's complex
        import subprocess
        try:
            with open(output_path, 'wb') as f:
                result = subprocess.run(
                    ['docker', 'save', image_id],
                    stdout=f,
                    stderr=subprocess.PIPE,
                    timeout=300
                )
                if result.returncode != 0:
                    raise Exception(f"Image export failed: {result.stderr.decode()}")
        except subprocess.TimeoutExpired:
            raise Exception("Image export timed out")
        except Exception as e:
            raise Exception(f"Image export error: {e}")
    
    def backup_volume_data(self, volume_name: str, output_path: str):
        """Backup volume data by creating a temporary container"""
        import subprocess
        import tempfile
        import threading
        import time
        
        # Create a temporary container that mounts the volume
        # Use a minimal image like alpine or busybox
        temp_container_name = f"backup-temp-{volume_name}-{os.urandom(4).hex()}"
        
        try:
            # Create temporary container with volume mounted (--rm auto-removes on stop)
            create_result = subprocess.run(
                ['docker', 'run', '-d', '--rm', '--name', temp_container_name,
                 '-v', f'{volume_name}:/backup-volume',
                 'busybox', 'sleep', '3600'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if create_result.returncode != 0:
                raise Exception(f"Failed to create temp container: {create_result.stderr}")
            
            # Tar the volume contents and stream to the output file
            tar_command = ['docker', 'exec', temp_container_name, 'tar', 'czf', '-', '-C', '/backup-volume', '.']
            
            with open(output_path, 'wb') as f:
                process = subprocess.Popen(tar_command, stdout=f, stderr=subprocess.PIPE)
                
                # Wait for the process to complete and capture stderr
                stdout, stderr = process.communicate(timeout=300)
                
                if process.returncode != 0:
                    # Clean up temp container before raising error
                    subprocess.run(['docker', 'rm', '-f', temp_container_name],
                                  capture_output=True, timeout=10)
                    stderr_msg = stderr.decode() if stderr else 'Unknown error'
                    raise Exception(f"Failed to tar volume: {stderr_msg}")

            # If the process was successful but the file is empty, it means the volume was empty.
            # The file is already created and empty, so no further action is needed.
            
            # Stop and remove temp container (--rm should auto-remove, but ensure cleanup)
            try:
                subprocess.run(['docker', 'stop', temp_container_name], 
                              capture_output=True, timeout=10)
                # Wait a moment for auto-removal
                time.sleep(0.5)
                # Force remove if still exists
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
            except Exception as cleanup_error:
                print(f"Warning: Error cleaning up temp container {temp_container_name}: {cleanup_error}")
            
            return True
            
        except subprocess.TimeoutExpired:
            # Clean up on timeout
            try:
                subprocess.run(['docker', 'stop', temp_container_name], 
                              capture_output=True, timeout=10)
                import time
                time.sleep(0.5)
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
            except Exception:
                pass
            raise Exception("Volume backup timed out")
        except Exception as e:
            # Ensure cleanup
            try:
                subprocess.run(['docker', 'stop', temp_container_name], 
                              capture_output=True, timeout=10)
                import time
                time.sleep(0.5)
                subprocess.run(['docker', 'rm', '-f', temp_container_name], 
                              capture_output=True, timeout=10)
            except Exception:
                pass
            raise
    
    def restore_volume_data(self, volume_name: str, input_path: str):
        """Restore volume data by creating a temporary container"""
        import subprocess
        import time
        
        temp_container_name = f"restore-temp-{volume_name}-{os.urandom(4).hex()}"
        
        try:
            # Create temp container with volume (--rm auto-removes on stop)
            create_result = subprocess.run(
                ['docker', 'run', '-d', '--rm', '--name', temp_container_name,
                 '-v', f'{volume_name}:/restore-volume',
                 'busybox', 'sleep', '3600'],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if create_result.returncode != 0:
                raise Exception(f"Failed to create temp container: {create_result.stderr}")
            
            # Extract tar.gz into volume
            with open(input_path, 'rb') as f:
                extract_result = subprocess.run(
                    ['docker', 'exec', '-i', temp_container_name,
                     'tar', 'xzf', '-', '-C', '/restore-volume'],
                    stdin=f,
                    capture_output=True,
                    timeout=300
                )
            
            # Stop and remove temp container (--rm should auto-remove, but ensure cleanup)
            try:
                subprocess.run(['docker', 'stop', temp_container_name], 
                              capture_output=True, timeout=10)
                # Wait a moment for auto-removal
                time.sleep(0.5)
                # Force remove if still exists
                subprocess.run(['docker', 'rm', '-f', temp_container_name],
                              capture_output=True, timeout=10)
            except Exception as cleanup_error:
                print(f"Warning: Error cleaning up temp container {temp_container_name}: {cleanup_error}")
            
            if extract_result.returncode != 0:
                raise Exception(f"Failed to restore volume: {extract_result.stderr.decode()}")
            
            return True
            
        except subprocess.TimeoutExpired:
            try:
                subprocess.run(['docker', 'stop', temp_container_name], 
                              capture_output=True, timeout=10)
                time.sleep(0.5)
                subprocess.run(['docker', 'rm', '-f', temp_container_name],
                              capture_output=True, timeout=10)
            except Exception:
                pass
            raise Exception("Volume restore timed out")
        except Exception as e:
            try:
                subprocess.run(['docker', 'stop', temp_container_name], 
                              capture_output=True, timeout=10)
                import time
                time.sleep(0.5)
                subprocess.run(['docker', 'rm', '-f', temp_container_name],
                              capture_output=True, timeout=10)
            except Exception:
                pass
            raise
    
    def _cleanup_busybox_image(self):
        """Clean up busybox image if not in use by any containers"""
        import threading
        
        def _cleanup():
            try:
                # Check if any containers are using busybox
                check_result = subprocess.run(
                    ['docker', 'ps', '-a', '--filter', 'ancestor=busybox', '--format', '{{.ID}}'],
                    capture_output=True,
                    text=True,
                    timeout=5
                )
                
                # If no containers are using busybox, remove the image
                if check_result.returncode == 0 and not check_result.stdout.strip():
                    remove_result = subprocess.run(
                        ['docker', 'rmi', 'busybox:latest'],
                        capture_output=True,
                        text=True,
                        timeout=5
                    )
                    if remove_result.returncode == 0:
                        print("🧹 Cleaned up busybox image")
            except Exception:
                # Silently fail - cleanup is optional
                pass
        
        # Run cleanup in background thread (non-blocking)
        thread = threading.Thread(target=_cleanup, daemon=True)
        thread.start()
    
    def get_events(self, since: Optional[str] = None, until: Optional[str] = None, filters: Optional[Dict] = None, limit: int = 100) -> List[Dict]:
        """
        Get Docker events
        
        Args:
            since: Unix timestamp or RFC3339 timestamp to start from
            until: Unix timestamp or RFC3339 timestamp to end at
            filters: Dict of filters (e.g., {'type': ['container'], 'event': ['start', 'stop']})
            limit: Maximum number of events to return (default: 100)
        
        Returns:
            List of event dictionaries
        """
        path = '/events'
        params = []
        
        if since:
            params.append(f'since={urllib.parse.quote(str(since))}')
        if until:
            params.append(f'until={urllib.parse.quote(str(until))}')
        if filters:
            filters_json = json.dumps(filters)
            params.append(f'filters={urllib.parse.quote(filters_json)}')
        
        if params:
            path += '?' + '&'.join(params)
        
        # Events endpoint returns a stream, so we need special handling
        url = f'{self.base_url}{path}'
        
        # Create Unix socket connection
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            sock.settimeout(30)  # Increased timeout to 30 seconds to get all events
            sock.connect(self.socket_path)
            
            # Build HTTP request
            request_line = f'GET {path} HTTP/1.1\r\n'
            headers = [
                'Host: localhost',
                'Connection: close',
            ]
            
            request = request_line + '\r\n'.join(headers) + '\r\n\r\n'
            request = request.encode()
            
            # Send request
            sock.sendall(request)
            
            # Read response header first
            header_data = b''
            while b'\r\n\r\n' not in header_data:
                chunk = sock.recv(1024)
                if not chunk:
                    break
                header_data += chunk
                if len(header_data) > 8192:  # Prevent header buffer overflow
                    break
            
            # Parse HTTP response header
            header_end = header_data.find(b'\r\n\r\n')
            if header_end == -1:
                raise Exception("Invalid HTTP response")
            
            headers_text = header_data[:header_end].decode('utf-8', errors='ignore')
            body_start = header_end + 4
            
            # Parse status line
            status_line = headers_text.split('\r\n')[0]
            status_parts = status_line.split(' ', 2)
            status_code = int(status_parts[1])
            
            if status_code >= 400:
                # Try to read error body
                try:
                    error_body = header_data[body_start:] + sock.recv(1024)
                    error_msg = error_body.decode('utf-8', errors='ignore')
                except:
                    error_msg = 'Unknown error'
                raise Exception(f"Docker API error {status_code}: {error_msg}")
            
            # Check for chunked transfer encoding
            is_chunked = 'Transfer-Encoding: chunked' in headers_text
            
            # Read events stream line by line and stop as soon as we have enough
            events = []
            buffer = header_data[body_start:] if body_start < len(header_data) else b''
            
            try:
                while len(events) < limit:
                    # Check if we have a complete line
                    if b'\n' in buffer:
                        lines = buffer.split(b'\n', 1)
                        line = lines[0]
                        buffer = lines[1] if len(lines) > 1 else b''
                        
                        if line.strip():
                            try:
                                event = json.loads(line.decode('utf-8', errors='ignore'))
                                # Only add if it's a dictionary (valid event)
                                if isinstance(event, dict):
                                    events.append(event)
                                    if len(events) >= limit:
                                        # Close socket immediately when we have enough events
                                        sock.close()
                                        return events
                            except json.JSONDecodeError:
                                continue
                            except (ValueError, TypeError):
                                # Skip invalid JSON or non-dict results
                                continue
                    else:
                        # Read more data
                        try:
                            chunk = sock.recv(4096)
                            if not chunk:
                                # Connection closed by Docker - we've got all events
                                break
                            buffer += chunk
                            
                            # Limit buffer size
                            if len(buffer) > 5 * 1024 * 1024:  # 5MB buffer limit
                                break
                        except socket.timeout:
                            # If we hit timeout but have events, continue reading
                            # Docker might be slow to send more events
                            if len(events) > 0:
                                continue
                            break
            except socket.timeout:
                # Timeout is OK - return what we have
                pass
            
            # Parse any remaining events in buffer
            if buffer:
                body_str = buffer.decode('utf-8', errors='ignore')
                lines = body_str.strip().split('\n')
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        event = json.loads(line)
                        # Only add if it's a dictionary (valid event)
                        if isinstance(event, dict):
                            events.append(event)
                            if len(events) >= limit:
                                break
                    except json.JSONDecodeError:
                        continue
                    except (ValueError, TypeError):
                        # Skip invalid JSON or non-dict results
                        continue
            
            return events
        except socket.timeout:
            # Return events collected so far if timeout occurs
            return events if 'events' in locals() else []
        except Exception as e:
            # If socket was already closed, events might already be returned
            if 'events' in locals():
                return events
            raise
        finally:
            try:
                sock.close()
            except:
                pass

