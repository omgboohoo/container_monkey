"""
Authentication Manager Module
Handles user authentication and user management
"""
import sqlite3
import os
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
from flask import session, request, jsonify, redirect, url_for


class AuthManager:
    """Manages authentication and user operations"""
    
    def __init__(self, db_path: str):
        """
        Initialize AuthManager
        
        Args:
            db_path: Path to SQLite database file (monkey.db)
        """
        self.db_path = db_path
        # Database initialization is handled by DatabaseManager
        # Users table should already exist in the unified database
    
    def login_required(self, f):
        """Decorator to require login for routes"""
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if 'logged_in' not in session or not session['logged_in']:
                if request.is_json or request.path.startswith('/api/'):
                    return jsonify({'error': 'Authentication required'}), 401
                return redirect(url_for('index'))
            return f(*args, **kwargs)
        return decorated_function
    
    def login(self, username: str, password: str) -> dict:
        """
        Handle user login
        
        Args:
            username: Username
            password: Password
            
        Returns:
            Dict with success status and username, or error message
        """
        try:
            username = username.strip()
            
            if not username or not password:
                return {'error': 'Username and password are required', 'status_code': 400}
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('SELECT password_hash FROM users WHERE username = ?', (username,))
            result = cursor.fetchone()
            conn.close()
            
            if result and check_password_hash(result[0], password):
                session.permanent = True
                session['logged_in'] = True
                session['username'] = username
                return {'success': True, 'username': username}
            else:
                return {'error': 'Invalid username or password', 'status_code': 401}
        except Exception as e:
            return {'error': str(e), 'status_code': 500}
    
    def logout(self) -> dict:
        """Handle user logout"""
        session.clear()
        return {'success': True}
    
    def change_password(self, current_password: str, new_password: str = None, new_username: str = None) -> dict:
        """
        Handle password and username change
        
        Args:
            current_password: Current password for verification
            new_password: New password (optional)
            new_username: New username (optional)
            
        Returns:
            Dict with success status and message
        """
        try:
            if not current_password:
                return {'error': 'Current password is required', 'status_code': 400}
            
            username = session.get('username')
            if not username:
                return {'error': 'Not authenticated', 'status_code': 401}
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute('SELECT password_hash FROM users WHERE username = ?', (username,))
            result = cursor.fetchone()
            
            if not result or not check_password_hash(result[0], current_password):
                conn.close()
                return {'error': 'Current password is incorrect', 'status_code': 401}
            
            updates = []
            params = []
            
            # Update username if provided
            if new_username:
                new_username = new_username.strip()
                if len(new_username) < 3:
                    conn.close()
                    return {'error': 'New username must be at least 3 characters long', 'status_code': 400}
                
                # Check if new username already exists
                cursor.execute('SELECT id FROM users WHERE username = ?', (new_username,))
                if cursor.fetchone():
                    conn.close()
                    return {'error': 'Username already exists', 'status_code': 400}
                
                updates.append('username = ?')
                params.append(new_username)
            
            # Update password if provided
            if new_password:
                if len(new_password) < 3:
                    conn.close()
                    return {'error': 'New password must be at least 3 characters long', 'status_code': 400}
                
                new_password_hash = generate_password_hash(new_password)
                updates.append('password_hash = ?')
                params.append(new_password_hash)
            
            if not updates:
                conn.close()
                return {'error': 'No changes provided', 'status_code': 400}
            
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
            
            return {
                'success': True,
                'message': ' and '.join(messages),
                'username': new_username if new_username else username
            }
        except sqlite3.IntegrityError:
            return {'error': 'Username already exists', 'status_code': 400}
        except Exception as e:
            return {'error': str(e), 'status_code': 500}
    
    def auth_status(self) -> dict:
        """Check authentication status"""
        if 'logged_in' in session and session['logged_in']:
            return {'logged_in': True, 'username': session.get('username', '')}
        return {'logged_in': False}


