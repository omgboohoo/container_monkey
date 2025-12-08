"""
Database Manager Module
Handles unified monkey.db database with users, audit_logs, and backup_schedules tables
"""
import sqlite3
import os
from werkzeug.security import generate_password_hash


class DatabaseManager:
    """Manages unified database with all tables"""
    
    def __init__(self, db_path: str):
        """
        Initialize DatabaseManager
        
        Args:
            db_path: Path to SQLite database file (monkey.db)
        """
        self.db_path = db_path
        self.init_database()
    
    def init_database(self):
        """Initialize unified database with all tables"""
        # Ensure directory exists
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)
        
        conn = sqlite3.connect(self.db_path)
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
        
        # Create audit_logs table
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
        
        # Create backup_schedules table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS backup_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                schedule_type TEXT NOT NULL DEFAULT 'daily',
                hour INTEGER NOT NULL DEFAULT 2,
                day_of_week INTEGER,
                lifecycle INTEGER NOT NULL DEFAULT 7,
                selected_containers TEXT NOT NULL DEFAULT '[]',
                last_run TIMESTAMP,
                next_run TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Create storage_settings table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS storage_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                storage_type TEXT NOT NULL DEFAULT 'local',
                s3_bucket TEXT,
                s3_region TEXT,
                s3_access_key TEXT,
                s3_secret_key TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        
        # Initialize default storage setting if none exists
        cursor.execute('SELECT COUNT(*) FROM storage_settings')
        storage_count = cursor.fetchone()[0]
        if storage_count == 0:
            cursor.execute('''
                INSERT INTO storage_settings (storage_type)
                VALUES (?)
            ''', ('local',))
        
        # Create indexes for audit_logs
        indexes = [
            ('idx_audit_timestamp', 'audit_logs', 'timestamp'),
            ('idx_audit_operation_type', 'audit_logs', 'operation_type'),
            ('idx_audit_container_id', 'audit_logs', 'container_id'),
            ('idx_audit_status', 'audit_logs', 'status')
        ]
        
        for idx_name, table, column in indexes:
            try:
                cursor.execute(f'''
                    CREATE INDEX IF NOT EXISTS {idx_name} ON {table} ({column})
                ''')
            except sqlite3.OperationalError:
                pass
        
        # Create default user if no users exist
        cursor.execute('SELECT COUNT(*) FROM users')
        user_count = cursor.fetchone()[0]
        
        if user_count == 0:
            default_password_hash = generate_password_hash('c0Nta!nerM0nK3y#Q92x')
            try:
                cursor.execute('''
                    INSERT INTO users (username, password_hash)
                    VALUES (?, ?)
                ''', ('admin', default_password_hash))
                print("✅ Created default user (username: admin, password: c0Nta!nerM0nK3y#Q92x)")
            except sqlite3.IntegrityError:
                pass
        
        conn.commit()
        conn.close()

