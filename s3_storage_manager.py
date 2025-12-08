"""
S3 Storage Manager Module
Handles S3 storage operations for backups
"""
import boto3
import os
import tempfile
from botocore.exceptions import ClientError, BotoCoreError
from typing import Dict, Optional, List, Any
from datetime import datetime


class S3StorageManager:
    """Manages S3 storage operations for backups"""
    
    def __init__(self, bucket_name: str, region: str, access_key: str, secret_key: str):
        """
        Initialize S3StorageManager
        
        Args:
            bucket_name: S3 bucket name
            region: AWS region
            access_key: AWS access key ID
            secret_key: AWS secret access key
        """
        self.bucket_name = bucket_name
        self.region = region
        self.access_key = access_key
        self.secret_key = secret_key
        
        # Initialize S3 client
        self.s3_client = boto3.client(
            's3',
            region_name=region,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key
        )
    
    def test_connection(self) -> Dict[str, Any]:
        """
        Test S3 connection and permissions
        
        Returns:
            Dict with success status and message
        """
        try:
            # Test read permission - list bucket
            self.s3_client.list_objects_v2(Bucket=self.bucket_name, MaxKeys=1)
            
            # Test write permission - upload a test file
            test_key = f"test_connection_{datetime.now().timestamp()}.txt"
            test_content = b"test"
            self.s3_client.put_object(
                Bucket=self.bucket_name,
                Key=test_key,
                Body=test_content
            )
            
            # Clean up test file
            try:
                self.s3_client.delete_object(Bucket=self.bucket_name, Key=test_key)
            except:
                pass
            
            return {
                'success': True,
                'message': 'S3 connection successful. Read and write permissions verified.'
            }
        except ClientError as e:
            error_code = e.response.get('Error', {}).get('Code', 'Unknown')
            error_message = e.response.get('Error', {}).get('Message', str(e))
            
            if error_code == 'AccessDenied':
                return {
                    'success': False,
                    'message': f'Access denied: {error_message}'
                }
            elif error_code == 'NoSuchBucket':
                return {
                    'success': False,
                    'message': f'Bucket "{self.bucket_name}" does not exist'
                }
            else:
                return {
                    'success': False,
                    'message': f'S3 error: {error_message}'
                }
        except BotoCoreError as e:
            return {
                'success': False,
                'message': f'Connection error: {str(e)}'
            }
        except Exception as e:
            return {
                'success': False,
                'message': f'Unexpected error: {str(e)}'
            }
    
    def upload_file(self, file_path: str, s3_key: str) -> Dict[str, Any]:
        """
        Upload a file to S3
        
        Args:
            file_path: Local file path
            s3_key: S3 object key (filename)
            
        Returns:
            Dict with success status
        """
        try:
            self.s3_client.upload_file(
                file_path,
                self.bucket_name,
                s3_key
            )
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def upload_fileobj(self, file_obj, s3_key: str) -> Dict[str, Any]:
        """
        Upload a file-like object to S3
        
        Args:
            file_obj: File-like object (bytes or file handle)
            s3_key: S3 object key (filename)
            
        Returns:
            Dict with success status
        """
        try:
            # Reset file pointer if it's a file handle
            if hasattr(file_obj, 'seek'):
                file_obj.seek(0)
            
            self.s3_client.upload_fileobj(
                file_obj,
                self.bucket_name,
                s3_key
            )
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def download_file(self, s3_key: str, local_path: str) -> Dict[str, Any]:
        """
        Download a file from S3
        
        Args:
            s3_key: S3 object key (filename)
            local_path: Local file path to save to
            
        Returns:
            Dict with success status
        """
        try:
            self.s3_client.download_file(
                self.bucket_name,
                s3_key,
                local_path
            )
            return {'success': True}
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                return {'success': False, 'error': 'File not found in S3'}
            return {'success': False, 'error': str(e)}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def download_fileobj(self, s3_key: str) -> Dict[str, Any]:
        """
        Download a file from S3 as bytes
        
        Args:
            s3_key: S3 object key (filename)
            
        Returns:
            Dict with success status and file content
        """
        try:
            response = self.s3_client.get_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            file_content = response['Body'].read()
            return {'success': True, 'content': file_content}
        except ClientError as e:
            if e.response['Error']['Code'] == 'NoSuchKey':
                return {'success': False, 'error': 'File not found in S3'}
            return {'success': False, 'error': str(e)}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def list_files(self, prefix: str = '') -> Dict[str, Any]:
        """
        List files in S3 bucket
        
        Args:
            prefix: Optional prefix to filter files
            
        Returns:
            Dict with list of files and their metadata
        """
        try:
            files = []
            paginator = self.s3_client.get_paginator('list_objects_v2')
            
            for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
                if 'Contents' in page:
                    for obj in page['Contents']:
                        files.append({
                            'key': obj['Key'],
                            'size': obj['Size'],
                            'last_modified': obj['LastModified'].isoformat(),
                            'etag': obj.get('ETag', '').strip('"')
                        })
            
            return {'success': True, 'files': files}
        except Exception as e:
            return {'success': False, 'error': str(e), 'files': []}
    
    def delete_file(self, s3_key: str) -> Dict[str, Any]:
        """
        Delete a file from S3
        
        Args:
            s3_key: S3 object key (filename)
            
        Returns:
            Dict with success status
        """
        try:
            self.s3_client.delete_object(
                Bucket=self.bucket_name,
                Key=s3_key
            )
            return {'success': True}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    def file_exists(self, s3_key: str) -> bool:
        """
        Check if a file exists in S3
        
        Args:
            s3_key: S3 object key (filename)
            
        Returns:
            True if file exists, False otherwise
        """
        try:
            self.s3_client.head_object(Bucket=self.bucket_name, Key=s3_key)
            return True
        except ClientError:
            return False
        except Exception:
            return False

