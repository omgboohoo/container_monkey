"""
Error Utilities Module
Provides safe error logging that prevents information disclosure in production
"""
import os
import traceback
import sys


def safe_log_error(error: Exception, context: str = "", debug: bool = None):
    """
    Safely log errors without exposing sensitive information in production.
    
    Args:
        error: The exception that occurred
        context: Optional context string describing where the error occurred
        debug: Whether to show full traceback (defaults to DEBUG_MODE env var or False)
    
    Returns:
        None
    """
    if debug is None:
        # Check for DEBUG_MODE environment variable or Flask debug mode
        debug = os.environ.get('DEBUG_MODE', 'False').lower() == 'true'
        # Also check Flask app debug mode if available (only if in request context)
        if not debug:
            try:
                from flask import has_app_context, current_app
                if has_app_context():
                    debug = current_app.config.get('DEBUG', False)
            except:
                pass
    
    error_msg = str(error)
    context_msg = f" in {context}" if context else ""
    
    if debug:
        # In debug mode, print full traceback
        print(f"⚠️  Error{context_msg}: {error_msg}")
        traceback.print_exc()
    else:
        # In production, only log generic error message
        print(f"⚠️  Error{context_msg}: {error_msg}")
        # Optionally log full traceback to a log file if needed
        # For now, we just log the error message to prevent information disclosure


def safe_exception_handler(func):
    """
    Decorator to safely handle exceptions in functions.
    Wraps function execution and catches exceptions, logging them safely.
    
    Usage:
        @safe_exception_handler
        def my_function():
            # code that might raise exceptions
            pass
    """
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            safe_log_error(e, context=func.__name__)
            raise
    return wrapper

