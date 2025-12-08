"""
Encryption Utilities Module
Handles encryption/decryption of sensitive data using Fernet symmetric encryption
"""
import hashlib
import base64
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

# Static encryption key for S3 credentials
# This is a hardcoded key derived from a fixed string to ensure consistency across app restarts
# DO NOT CHANGE THIS KEY - changing it will make existing encrypted credentials unreadable
STATIC_ENCRYPTION_KEY_STRING = "Qc%23KFZjai2!CUdrKueb$^1"

def get_encryption_key() -> bytes:
    """
    Get the static Fernet encryption key
    
    Returns:
        Fernet key bytes (consistent across app restarts)
    """
    # Derive a consistent key from the static string using PBKDF2
    salt = hashlib.sha256(STATIC_ENCRYPTION_KEY_STRING.encode()).digest()[:16]
    
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=100000,
    )
    key = base64.urlsafe_b64encode(kdf.derive(STATIC_ENCRYPTION_KEY_STRING.encode()))
    return key


def encrypt_value(value: str) -> str:
    """
    Encrypt a string value using Fernet encryption with static key
    
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
    Decrypt a string value using Fernet decryption with static key
    
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

