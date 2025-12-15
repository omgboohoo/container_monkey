"""
Events Manager Module
Handles Docker events operations
"""
import time
from typing import Dict, List, Any, Optional
from datetime import datetime
import docker_utils
from error_utils import safe_log_error


class EventsManager:
    """Manages Docker events operations"""
    
    def __init__(self):
        """Initialize EventsManager"""
        pass
    
    def list_events(self, since: Optional[int] = None, until: Optional[int] = None) -> Dict[str, Any]:
        """List Docker events
        
        Args:
            since: Unix timestamp to get events since (default: last 24 hours)
            until: Unix timestamp to get events until (default: now)
        
        Returns:
            Dictionary with 'events' list or 'error' message
        """
        docker_api_client = docker_utils.docker_api_client
        if not docker_api_client:
            return {'error': 'Docker client not available'}
        
        try:
            events = docker_api_client.get_events(since=since, until=until)
            
            # Format events for display
            formatted_events = []
            for event in events:
                # Extract event details
                event_type = event.get('Type', 'unknown')
                action = event.get('Action', 'unknown')
                actor = event.get('Actor', {}) or {}
                attributes = actor.get('Attributes', {}) or {}
                
                # Get container/image name
                name = attributes.get('name', '')
                if not name:
                    name = attributes.get('image', '')
                if not name:
                    name = event.get('id', '')[:12] if event.get('id') else 'unknown'
                
                # Format timestamp
                timestamp = event.get('time', 0)
                if isinstance(timestamp, (int, float)):
                    dt = datetime.fromtimestamp(timestamp)
                    time_str = dt.strftime('%Y-%m-%d %H:%M:%S')
                else:
                    time_str = str(timestamp)
                
                formatted_events.append({
                    'id': event.get('id', ''),
                    'type': event_type,
                    'action': action,
                    'name': name,
                    'time': timestamp,
                    'time_formatted': time_str,
                    'attributes': attributes,
                    'raw': event  # Keep raw event for debugging
                })
            
            # Sort by timestamp (newest first)
            formatted_events.sort(key=lambda x: x.get('time', 0), reverse=True)
            
            return {
                'events': formatted_events,
                'count': len(formatted_events)
            }
            
        except Exception as e:
            safe_log_error(e, context="list_events")
            return {'error': f'Failed to retrieve events: {str(e)}'}

