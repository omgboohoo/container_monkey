"""
Database Manager Module
Handles unified monkey.db database with users, audit_logs, and backup_schedules tables
"""
import sqlite3
import os
import json
import shutil
from datetime import datetime
from typing import Dict, List, Optional, Any


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
        self.migrate_old_databases()
    
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
        
        conn.commit()
        conn.close()
    
    def migrate_old_databases(self):
        """Migrate data from old databases (users.db, audit_log.db) and JSON config"""
        config_dir = os.path.dirname(self.db_path)
        old_users_db = os.path.join(config_dir, 'users.db')
        old_audit_db = os.path.join(config_dir, 'audit_log.db')
        old_scheduler_config = os.path.join(config_dir, 'scheduler_config.json')
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        # Migrate users from users.db
        if os.path.exists(old_users_db):
            try:
                print("🔄 Migrating users from users.db...")
                old_conn = sqlite3.connect(old_users_db)
                old_cursor = old_conn.cursor()
                
                # Check if users table exists in old database
                old_cursor.execute('''
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='users'
                ''')
                if old_cursor.fetchone():
                    # Check if we already have users in new database
                    cursor.execute('SELECT COUNT(*) FROM users')
                    new_user_count = cursor.fetchone()[0]
                    
                    if new_user_count == 0:
                        # Migrate users
                        old_cursor.execute('SELECT username, password_hash, created_at FROM users')
                        users = old_cursor.fetchall()
                        
                        for username, password_hash, created_at in users:
                            try:
                                cursor.execute('''
                                    INSERT INTO users (username, password_hash, created_at)
                                    VALUES (?, ?, ?)
                                ''', (username, password_hash, created_at))
                            except sqlite3.IntegrityError:
                                # User already exists, skip
                                pass
                        
                        conn.commit()
                        print(f"✅ Migrated {len(users)} user(s) from users.db")
                    else:
                        print("ℹ️  Users already exist in unified database, skipping migration")
                
                old_conn.close()
            except Exception as e:
                print(f"⚠️  Error migrating users: {e}")
        
        # Migrate audit logs from audit_log.db
        if os.path.exists(old_audit_db):
            try:
                print("🔄 Migrating audit logs from audit_log.db...")
                old_conn = sqlite3.connect(old_audit_db)
                old_cursor = old_conn.cursor()
                
                # Check if audit_logs table exists in old database
                old_cursor.execute('''
                    SELECT name FROM sqlite_master 
                    WHERE type='table' AND name='audit_logs'
                ''')
                if old_cursor.fetchone():
                    # Check if we already have logs in new database
                    cursor.execute('SELECT COUNT(*) FROM audit_logs')
                    new_log_count = cursor.fetchone()[0]
                    
                    if new_log_count == 0:
                        # Migrate audit logs
                        old_cursor.execute('''
                            SELECT timestamp, operation_type, container_id, container_name,
                                   backup_filename, status, error_message, user, details
                            FROM audit_logs
                            ORDER BY timestamp ASC
                        ''')
                        logs = old_cursor.fetchall()
                        
                        for log in logs:
                            cursor.execute('''
                                INSERT INTO audit_logs 
                                (timestamp, operation_type, container_id, container_name,
                                 backup_filename, status, error_message, user, details)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                            ''', log)
                        
                        conn.commit()
                        print(f"✅ Migrated {len(logs)} audit log(s) from audit_log.db")
                    else:
                        print("ℹ️  Audit logs already exist in unified database, skipping migration")
                
                old_conn.close()
            except Exception as e:
                print(f"⚠️  Error migrating audit logs: {e}")
        
        # Migrate scheduler config from JSON
        if os.path.exists(old_scheduler_config):
            try:
                print("🔄 Migrating scheduler config from JSON...")
                # Check if we already have a schedule in database
                cursor.execute('SELECT COUNT(*) FROM backup_schedules')
                schedule_count = cursor.fetchone()[0]
                
                if schedule_count == 0:
                    with open(old_scheduler_config, 'r') as f:
                        config = json.load(f)
                    
                    schedule_type = config.get('schedule_type', 'daily')
                    hour = config.get('hour', 2)
                    day_of_week = config.get('day_of_week')
                    lifecycle = config.get('lifecycle', 7)
                    selected_containers = json.dumps(config.get('selected_containers', []))
                    
                    last_run = None
                    if config.get('last_run'):
                        try:
                            # Store as ISO format string for consistency
                            last_run = config['last_run']
                        except:
                            pass
                    
                    next_run = None
                    if config.get('next_run'):
                        try:
                            # Store as ISO format string for consistency
                            next_run = config['next_run']
                        except:
                            pass
                    
                    cursor.execute('''
                        INSERT INTO backup_schedules 
                        (schedule_type, hour, day_of_week, lifecycle, selected_containers, last_run, next_run)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                    ''', (schedule_type, hour, day_of_week, lifecycle, selected_containers, last_run, next_run))
                    
                    conn.commit()
                    print("✅ Migrated scheduler config from JSON")
                else:
                    print("ℹ️  Scheduler config already exists in database, skipping migration")
            except Exception as e:
                print(f"⚠️  Error migrating scheduler config: {e}")
        
        # Create default user if no users exist
        cursor.execute('SELECT COUNT(*) FROM users')
        user_count = cursor.fetchone()[0]
        
        if user_count == 0:
            from werkzeug.security import generate_password_hash
            default_password_hash = generate_password_hash('monkeydo')
            try:
                cursor.execute('''
                    INSERT INTO users (username, password_hash)
                    VALUES (?, ?)
                ''', ('monkeysee', default_password_hash))
                conn.commit()
                print("✅ Created default user (username: monkeysee, password: monkeydo)")
            except sqlite3.IntegrityError:
                pass
        
        conn.close()
    
    def get_connection(self):
        """Get a database connection"""
        return sqlite3.connect(self.db_path)

