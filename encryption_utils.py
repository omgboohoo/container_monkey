"""
Encryption Utilities Module
Handles encryption/decryption of sensitive data using Fernet symmetric encryption
"""
import os
import hashlib
import base64
import secrets
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class EncryptionKeyError(Exception):
    """Raised when encryption key cannot be found or generated"""
    pass


def get_encryption_key() -> bytes:
    """
    Get the Fernet encryption key from key file
    Generates and saves a new key file if it doesn't exist
    
    The key is stored at /backups/config/encryption.key (or BACKUP_DIR/config/encryption.key)
    and persists in the Docker volume.
    
    Returns:
        Fernet key bytes
        
    Raises:
        EncryptionKeyError: If key cannot be read or generated
    """
    # Get backup directory from environment or use default
    backup_dir = os.environ.get('BACKUP_DIR', '/backups')
    key_file_path = os.path.join(backup_dir, 'config', 'encryption.key')
    
    # Try reading from key file
    if os.path.exists(key_file_path):
        try:
            with open(key_file_path, 'r') as f:
                key_string = f.read().strip()
            if key_string:
                # Derive key from stored string
                return _derive_key_from_string(key_string)
            else:
                raise EncryptionKeyError(
                    f"Encryption key file at {key_file_path} is empty. "
                    f"Delete the file to regenerate a new key."
                )
        except EncryptionKeyError:
            raise
        except Exception as e:
            raise EncryptionKeyError(
                f"Failed to read encryption key file at {key_file_path}: {e}. "
                f"Ensure the file exists and is readable."
            )
    
    # Generate new key file if it doesn't exist
    try:
        # Generate a secure random key
        key_string = secrets.token_urlsafe(32)
        
        # Ensure config directory exists
        os.makedirs(os.path.dirname(key_file_path), exist_ok=True)
        
        # Write key file with restricted permissions
        with open(key_file_path, 'w') as f:
            f.write(key_string)
        os.chmod(key_file_path, 0o600)  # Only owner can read/write
        
        print(f"✅ Generated new encryption key and saved to {key_file_path}")
        print(f"⚠️  IMPORTANT: Backup this key file! If lost, encrypted credentials cannot be decrypted.")
        
        return _derive_key_from_string(key_string)
    except Exception as e:
        raise EncryptionKeyError(
            f"Failed to generate encryption key file at {key_file_path}: {e}. "
            f"Ensure the directory is writable."
        )


def _derive_key_from_string(key_string: str) -> bytes:
    """
    Derive a Fernet key from a string using PBKDF2
    
    Args:
        key_string: String to derive key from
        
    Returns:
        Fernet key bytes
    """
    # Derive a consistent key from the string using PBKDF2
    salt = hashlib.sha256(key_string.encode()).digest()[:16]
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(key_string.encode()))
    return key


def encrypt_value(value: str) -> str:
    """
    Encrypt a string value using Fernet encryption
    
    Args:
        value: String value to encrypt
        
    Returns:
        Encrypted string (base64 encoded)
    """
    if not value:
        return ''
    
    try:
        key = get_encryption_key()
        fernet = Fernet(key)
        encrypted = fernet.encrypt(value.encode())
        return encrypted.decode('utf-8')
    except Exception as e:
        print(f"⚠️  Error encrypting value: {e}")
        raise


def decrypt_value(encrypted_value: str) -> str:
    """
    Decrypt a string value using Fernet decryption
    
    Args:
        encrypted_value: Encrypted string (base64 encoded)
        
    Returns:
        Decrypted string
    """
    if not encrypted_value:
        return ''
    
    try:
        key = get_encryption_key()
        fernet = Fernet(key)
        decrypted = fernet.decrypt(encrypted_value.encode())
        return decrypted.decode('utf-8')
    except Exception as e:
        # If decryption fails, might be unencrypted (for migration)
        # Try to return as-is if it looks like plain text
        print(f"⚠️  Error decrypting value (might be unencrypted): {e}")
        # Check if it looks like it might be unencrypted (doesn't contain typical encrypted chars)
        if not encrypted_value.startswith('gAAAAA'):
            # Likely unencrypted, return as-is for migration
            return encrypted_value
        raise


def is_encrypted(value: str) -> bool:
    """
    Check if a value appears to be encrypted
    
    Args:
        value: String value to check
        
    Returns:
        True if value appears encrypted, False otherwise
    """
    if not value:
        return False
    # Fernet encrypted values start with 'gAAAAA' (base64 encoded)
    return value.startswith('gAAAAA')

