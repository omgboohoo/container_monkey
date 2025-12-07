"""
Audit Log Manager Module
Handles audit logging for backup operations, restores, and lifecycle management
"""
import sqlite3
import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Any


class AuditLogManager:
    """Manages audit logging for backup and restore operations"""
    
    def __init__(self, db_path: str):
        """
        Initialize AuditLogManager
        
        Args:
            db_path: Path to SQLite database file
        """
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize SQLite database for audit logs if it doesn't exist"""
        # Ensure directory exists
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
        
        if os.path.exists(self.db_path):
            # Check if table exists, if not create it
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name='audit_logs'
            ''')
            if not cursor.fetchone():
                self._create_table(cursor)
                conn.commit()
            conn.close()
            return
        
        # Create database and table
        print(f"📦 Creating audit log database at {self.db_path}")
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        self._create_table(cursor)
        conn.commit()
        conn.close()
        print(f"✅ Audit log database created")
    
    def _create_table(self, cursor):
        """Create the audit_logs table"""
        # Create table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                operation_type TEXT NOT NULL,
                container_id TEXT,
                container_name TEXT,
                backup_filename TEXT,
                status TEXT NOT NULL,
                error_message TEXT,
                user TEXT,
                details TEXT
            )
        ''')
        
        # Create indexes separately
        indexes = [
            ('idx_timestamp', 'timestamp'),
            ('idx_operation_type', 'operation_type'),
            ('idx_container_id', 'container_id'),
            ('idx_status', 'status')
        ]
        
        for idx_name, column in indexes:
            try:
                cursor.execute(f'''
                    CREATE INDEX IF NOT EXISTS {idx_name} ON audit_logs ({column})
                ''')
            except sqlite3.OperationalError:
                # Index might already exist, ignore
                pass
    
    def log_event(self, operation_type: str, status: str, container_id: Optional[str] = None,
                  container_name: Optional[str] = None, backup_filename: Optional[str] = None,
                  error_message: Optional[str] = None, user: Optional[str] = None,
                  details: Optional[Dict[str, Any]] = None) -> bool:
        """
        Log an audit event
        
        Args:
            operation_type: Type of operation (backup_manual, backup_scheduled, restore, cleanup, delete_backup)
            status: Status of operation (started, completed, error)
            container_id: Container ID (optional)
            container_name: Container name (optional)
            backup_filename: Backup filename (optional)
            error_message: Error message if status is 'error' (optional)
            user: Username who performed the operation (optional)
            details: Additional details as dict (will be JSON encoded)
            
        Returns:
            bool: True if logged successfully
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            details_json = json.dumps(details) if details else None
            
            cursor.execute('''
                INSERT INTO audit_logs 
                (operation_type, container_id, container_name, backup_filename, status, error_message, user, details)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ''', (operation_type, container_id, container_name, backup_filename, status, error_message, user, details_json))
            
            conn.commit()
            conn.close()
            return True
        except Exception as e:
            print(f"⚠️  Error logging audit event: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_logs(self, limit: int = 1000, offset: int = 0, 
                 operation_type: Optional[str] = None,
                 container_id: Optional[str] = None,
                 status: Optional[str] = None,
                 start_date: Optional[str] = None,
                 end_date: Optional[str] = None) -> Dict[str, Any]:
        """
        Get audit logs with optional filtering
        
        Args:
            limit: Maximum number of logs to return
            offset: Offset for pagination
            operation_type: Filter by operation type
            container_id: Filter by container ID
            status: Filter by status
            start_date: Filter by start date (ISO format)
            end_date: Filter by end date (ISO format)
            
        Returns:
            Dict with logs and total count
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Build query with filters
            where_clauses = []
            params = []
            
            if operation_type:
                where_clauses.append("operation_type = ?")
                params.append(operation_type)
            
            if container_id:
                where_clauses.append("container_id = ?")
                params.append(container_id)
            
            if status:
                where_clauses.append("status = ?")
                params.append(status)
            
            if start_date:
                where_clauses.append("timestamp >= ?")
                params.append(start_date)
            
            if end_date:
                where_clauses.append("timestamp <= ?")
                params.append(end_date)
            
            where_clause = " WHERE " + " AND ".join(where_clauses) if where_clauses else ""
            
            # Get total count
            count_query = f"SELECT COUNT(*) FROM audit_logs{where_clause}"
            cursor.execute(count_query, params)
            total_count = cursor.fetchone()[0]
            
            # Get logs
            query = f'''
                SELECT id, timestamp, operation_type, container_id, container_name, 
                       backup_filename, status, error_message, user, details
                FROM audit_logs
                {where_clause}
                ORDER BY timestamp DESC
                LIMIT ? OFFSET ?
            '''
            params.extend([limit, offset])
            cursor.execute(query, params)
            
            logs = []
            for row in cursor.fetchall():
                log_id, timestamp, op_type, cid, cname, bfilename, status, error, user, details_json = row
                
                details = None
                if details_json:
                    try:
                        details = json.loads(details_json)
                    except:
                        pass
                
                logs.append({
                    'id': log_id,
                    'timestamp': timestamp,
                    'operation_type': op_type,
                    'container_id': cid,
                    'container_name': cname,
                    'backup_filename': bfilename,
                    'status': status,
                    'error_message': error,
                    'user': user,
                    'details': details
                })
            
            conn.close()
            
            return {
                'logs': logs,
                'total': total_count,
                'limit': limit,
                'offset': offset
            }
        except Exception as e:
            print(f"⚠️  Error retrieving audit logs: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e), 'logs': [], 'total': 0}
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get statistics about audit logs
        
        Returns:
            Dict with statistics
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Total logs
            cursor.execute("SELECT COUNT(*) FROM audit_logs")
            total_logs = cursor.fetchone()[0]
            
            # Logs by operation type
            cursor.execute('''
                SELECT operation_type, COUNT(*) 
                FROM audit_logs 
                GROUP BY operation_type
            ''')
            by_operation = {row[0]: row[1] for row in cursor.fetchall()}
            
            # Logs by status
            cursor.execute('''
                SELECT status, COUNT(*) 
                FROM audit_logs 
                GROUP BY status
            ''')
            by_status = {row[0]: row[1] for row in cursor.fetchall()}
            
            # Recent activity (last 24 hours)
            cursor.execute('''
                SELECT COUNT(*) 
                FROM audit_logs 
                WHERE timestamp >= datetime('now', '-1 day')
            ''')
            last_24h = cursor.fetchone()[0]
            
            # Recent activity (last 7 days)
            cursor.execute('''
                SELECT COUNT(*) 
                FROM audit_logs 
                WHERE timestamp >= datetime('now', '-7 days')
            ''')
            last_7d = cursor.fetchone()[0]
            
            conn.close()
            
            return {
                'total_logs': total_logs,
                'by_operation': by_operation,
                'by_status': by_status,
                'last_24h': last_24h,
                'last_7d': last_7d
            }
        except Exception as e:
            print(f"⚠️  Error getting audit log statistics: {e}")
            return {'error': str(e)}
    
    def clear_all_logs(self) -> Dict[str, Any]:
        """
        Clear all audit logs from the database
        
        Returns:
            Dict with success status and deleted count
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Get count before deletion
            cursor.execute("SELECT COUNT(*) FROM audit_logs")
            count_before = cursor.fetchone()[0]
            
            # Delete all logs
            cursor.execute("DELETE FROM audit_logs")
            conn.commit()
            conn.close()
            
            print(f"✅ Cleared {count_before} audit log(s)")
            
            return {
                'success': True,
                'deleted_count': count_before,
                'message': f'Cleared {count_before} audit log(s)'
            }
        except Exception as e:
            print(f"⚠️  Error clearing audit logs: {e}")
            import traceback
            traceback.print_exc()
            return {'error': str(e)}

