"""
UI Settings Manager Module
Handles UI settings (like sidebar collapsed state) from database
"""
import sqlite3
from typing import Dict, Optional, Any


class UISettingsManager:
    """Manages UI settings"""
    
    def __init__(self, db_path: str):
        """
        Initialize UISettingsManager
        
        Args:
            db_path: Path to SQLite database file (monkey.db)
        """
        self.db_path = db_path
    
    def get_setting(self, key: str, default: Any = None) -> Any:
        """
        Get a UI setting value
        
        Args:
            key: Setting key
            default: Default value if setting doesn't exist
            
        Returns:
            Setting value or default
        """
        try:
            import os
            # Ensure database directory exists
            db_dir = os.path.dirname(self.db_path)
            if db_dir and not os.path.exists(db_dir):
                os.makedirs(db_dir, exist_ok=True)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT setting_value
                FROM ui_settings
                WHERE setting_key = ?
            ''', (key,))
            
            row = cursor.fetchone()
            conn.close()
            
            if row:
                value = row[0]
                # Convert string booleans to actual booleans
                if isinstance(value, str):
                    if value.lower() == 'true':
                        return True
                    elif value.lower() == 'false':
                        return False
                return value
            
            return default
        except Exception as e:
            print(f"⚠️  Error getting UI setting {key}: {e}")
            return default
    
    def set_setting(self, key: str, value: Any) -> Dict[str, Any]:
        """
        Set a UI setting value
        
        Args:
            key: Setting key
            value: Setting value (will be converted to string)
            
        Returns:
            Dict with success status
        """
        try:
            import os
            # Ensure database directory exists
            db_dir = os.path.dirname(self.db_path)
            if db_dir and not os.path.exists(db_dir):
                os.makedirs(db_dir, exist_ok=True)
            
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Convert value to string (don't lowercase non-boolean values)
            if isinstance(value, bool):
                value_str = str(value).lower()
            else:
                value_str = str(value)
            
            # Check if setting exists
            cursor.execute('SELECT COUNT(*) FROM ui_settings WHERE setting_key = ?', (key,))
            exists = cursor.fetchone()[0] > 0
            
            if exists:
                cursor.execute('''
                    UPDATE ui_settings
                    SET setting_value = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE setting_key = ?
                ''', (value_str, key))
            else:
                cursor.execute('''
                    INSERT INTO ui_settings (setting_key, setting_value)
                    VALUES (?, ?)
                ''', (key, value_str))
            
            conn.commit()
            conn.close()
            
            return {'success': True}
        except Exception as e:
            print(f"⚠️  Error setting UI setting {key}: {e}")
            return {'success': False, 'error': str(e)}
    
    def get_all_settings(self) -> Dict[str, Any]:
        """
        Get all UI settings
        
        Returns:
            Dict with all settings
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT setting_key, setting_value
                FROM ui_settings
            ''')
            
            rows = cursor.fetchall()
            conn.close()
            
            settings = {}
            for key, value in rows:
                # Convert string booleans to actual booleans
                if value.lower() == 'true':
                    settings[key] = True
                elif value.lower() == 'false':
                    settings[key] = False
                else:
                    settings[key] = value
            
            return settings
        except Exception as e:
            print(f"⚠️  Error getting all UI settings: {e}")
            return {}

