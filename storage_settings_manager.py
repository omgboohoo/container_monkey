"""
Storage Settings Manager Module
Handles storage settings (local vs S3) from database with encrypted credentials
"""
import sqlite3
from typing import Dict, Optional, Any
from encryption_utils import encrypt_value, decrypt_value, is_encrypted


class StorageSettingsManager:
    """Manages storage settings with encrypted credentials"""
    
    def __init__(self, db_path: str):
        """
        Initialize StorageSettingsManager
        
        Args:
            db_path: Path to SQLite database file (monkey.db)
        """
        self.db_path = db_path
    
    def get_settings(self) -> Dict[str, Any]:
        """
        Get current storage settings
        
        Returns:
            Dict with storage settings
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            cursor.execute('''
                SELECT storage_type, s3_bucket, s3_region, s3_access_key, s3_secret_key
                FROM storage_settings
                ORDER BY updated_at DESC
                LIMIT 1
            ''')
            
            row = cursor.fetchone()
            conn.close()
            
            if row:
                storage_type, s3_bucket, s3_region, s3_access_key, s3_secret_key = row
                
                # Decrypt credentials if they are encrypted
                decrypted_access_key = ''
                decrypted_secret_key = ''
                
                if s3_access_key:
                    if is_encrypted(s3_access_key):
                        try:
                            decrypted_access_key = decrypt_value(s3_access_key)
                        except Exception as e:
                            print(f"⚠️  Error decrypting access key: {e}")
                            decrypted_access_key = s3_access_key  # Fallback to original
                    else:
                        # Not encrypted yet (migration case), return as-is
                        decrypted_access_key = s3_access_key
                
                if s3_secret_key:
                    if is_encrypted(s3_secret_key):
                        try:
                            decrypted_secret_key = decrypt_value(s3_secret_key)
                        except Exception as e:
                            print(f"⚠️  Error decrypting secret key: {e}")
                            decrypted_secret_key = s3_secret_key  # Fallback to original
                    else:
                        # Not encrypted yet (migration case), return as-is
                        decrypted_secret_key = s3_secret_key
                
                return {
                    'storage_type': storage_type or 'local',
                    's3_bucket': s3_bucket or '',
                    's3_region': s3_region or '',
                    's3_access_key': decrypted_access_key,
                    's3_secret_key': decrypted_secret_key
                }
            else:
                # Default to local
                return {
                    'storage_type': 'local',
                    's3_bucket': '',
                    's3_region': '',
                    's3_access_key': '',
                    's3_secret_key': ''
                }
        except Exception as e:
            print(f"⚠️  Error loading storage settings: {e}")
            return {
                'storage_type': 'local',
                's3_bucket': '',
                's3_region': '',
                's3_access_key': '',
                's3_secret_key': ''
            }
    
    def update_settings(self, storage_type: str, s3_bucket: Optional[str] = None,
                       s3_region: Optional[str] = None, s3_access_key: Optional[str] = None,
                       s3_secret_key: Optional[str] = None) -> Dict[str, Any]:
        """
        Update storage settings
        
        Args:
            storage_type: 'local' or 's3'
            s3_bucket: S3 bucket name (required if storage_type is 's3')
            s3_region: S3 region (required if storage_type is 's3')
            s3_access_key: S3 access key (required if storage_type is 's3')
            s3_secret_key: S3 secret key (required if storage_type is 's3')
            
        Returns:
            Dict with success status
        """
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Check if settings exist
            cursor.execute('SELECT COUNT(*) FROM storage_settings')
            exists = cursor.fetchone()[0] > 0
            
            if exists:
                # Get existing settings to preserve values if not provided
                cursor.execute('''
                    SELECT s3_bucket, s3_region, s3_access_key, s3_secret_key
                    FROM storage_settings
                    ORDER BY updated_at DESC
                    LIMIT 1
                ''')
                existing_row = cursor.fetchone()
                existing_bucket = existing_row[0] if existing_row else None
                existing_region = existing_row[1] if existing_row else None
                existing_access_key_encrypted = existing_row[2] if existing_row else None
                existing_secret_key_encrypted = existing_row[3] if existing_row else None
                
                # Use provided values or preserve existing ones
                final_bucket = s3_bucket if s3_bucket is not None else existing_bucket
                final_region = s3_region if s3_region is not None else existing_region
                
                # Encrypt sensitive credentials before storing
                encrypted_access_key = existing_access_key_encrypted or ''
                encrypted_secret_key = existing_secret_key_encrypted or ''
                
                if s3_access_key:
                    try:
                        encrypted_access_key = encrypt_value(s3_access_key)
                    except Exception as e:
                        print(f"⚠️  Error encrypting access key: {e}")
                        return {'success': False, 'error': f'Failed to encrypt access key: {str(e)}'}
                
                if s3_secret_key:
                    try:
                        encrypted_secret_key = encrypt_value(s3_secret_key)
                    except Exception as e:
                        print(f"⚠️  Error encrypting secret key: {e}")
                        return {'success': False, 'error': f'Failed to encrypt secret key: {str(e)}'}
                
                # Update existing settings
                cursor.execute('''
                    UPDATE storage_settings
                    SET storage_type = ?, s3_bucket = ?, s3_region = ?,
                        s3_access_key = ?, s3_secret_key = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = (SELECT id FROM storage_settings ORDER BY updated_at DESC LIMIT 1)
                ''', (storage_type, final_bucket, final_region, encrypted_access_key, encrypted_secret_key))
            else:
                # Encrypt sensitive credentials before storing
                encrypted_access_key = ''
                encrypted_secret_key = ''
                
                if s3_access_key:
                    try:
                        encrypted_access_key = encrypt_value(s3_access_key)
                    except Exception as e:
                        print(f"⚠️  Error encrypting access key: {e}")
                        return {'success': False, 'error': f'Failed to encrypt access key: {str(e)}'}
                
                if s3_secret_key:
                    try:
                        encrypted_secret_key = encrypt_value(s3_secret_key)
                    except Exception as e:
                        print(f"⚠️  Error encrypting secret key: {e}")
                        return {'success': False, 'error': f'Failed to encrypt secret key: {str(e)}'}
                
                # Insert new settings
                cursor.execute('''
                    INSERT INTO storage_settings 
                    (storage_type, s3_bucket, s3_region, s3_access_key, s3_secret_key)
                    VALUES (?, ?, ?, ?, ?)
                ''', (storage_type, s3_bucket or '', s3_region or '', encrypted_access_key, encrypted_secret_key))
            
            conn.commit()
            conn.close()
            
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def is_s3_enabled(self) -> bool:
        """
        Check if S3 storage is enabled
        
        Returns:
            True if S3 is enabled, False otherwise
        """
        settings = self.get_settings()
        return settings.get('storage_type') == 's3'

