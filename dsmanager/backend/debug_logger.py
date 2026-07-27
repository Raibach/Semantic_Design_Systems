"""
Comprehensive Debugging and Error Logging System

This module provides:
- Structured logging with levels (DEBUG, INFO, WARNING, ERROR, CRITICAL)
- Request/response logging with correlation IDs
- Database operation logging
- Error tracking with full context
- API endpoint to view logs
- Log rotation and retention
"""

import os
import json
import logging
import traceback
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
import uuid
from functools import wraps
from flask import request, g, has_request_context

# Log directory
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# Log files
DEBUG_LOG = LOG_DIR / "debug.log"
ERROR_LOG = LOG_DIR / "errors.log"
REQUEST_LOG = LOG_DIR / "requests.log"
DATABASE_LOG = LOG_DIR / "database.log"
AUDIT_LOG = LOG_DIR / "audit.log"

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s [%(levelname)s] [%(name)s] [%(correlation_id)s] %(message)s',
    handlers=[
        logging.FileHandler(DEBUG_LOG, encoding='utf-8'),
        logging.StreamHandler()  # Also log to stdout for Railway
    ]
)

# Custom formatter with correlation ID
class CorrelationIDFilter(logging.Filter):
    def filter(self, record):
        if has_request_context() and hasattr(g, 'correlation_id'):
            record.correlation_id = g.correlation_id
        else:
            record.correlation_id = 'no-request'
        return True

# Add filter to all handlers
for handler in logging.root.handlers:
    handler.addFilter(CorrelationIDFilter())

logger = logging.getLogger(__name__)

class DebugLogger:
    """Comprehensive debugging and error logging system"""
    
    def __init__(self):
        self.logs: List[Dict[str, Any]] = []
        self.max_logs = 1000  # Keep last 1000 log entries in memory
        
    def _write_log(self, level: str, message: str, context: Optional[Dict] = None, error: Optional[Exception] = None):
        """Write log entry to file and memory"""
        correlation_id = None
        if has_request_context() and hasattr(g, 'correlation_id'):
            correlation_id = g.correlation_id
        
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message,
            "correlation_id": correlation_id,
            "context": context or {},
            "error": None
        }
        
        if error:
            log_entry["error"] = {
                "type": type(error).__name__,
                "message": str(error),
                "traceback": traceback.format_exc()
            }
        
        # Add request context if available
        if has_request_context():
            log_entry["request"] = {
                "method": request.method,
                "path": request.path,
                "endpoint": request.endpoint,
                "remote_addr": request.remote_addr,
                "user_agent": request.headers.get('User-Agent', '')[:100]
            }
            
            # Add headers (sanitized)
            headers = dict(request.headers)
            # Remove sensitive headers
            for key in ['Authorization', 'X-API-Key', 'Cookie']:
                if key in headers:
                    headers[key] = '***REDACTED***'
            log_entry["request"]["headers"] = headers
        
        # Write to appropriate log file
        log_file = None
        if level in ['ERROR', 'CRITICAL']:
            log_file = ERROR_LOG
        elif level == 'DEBUG':
            log_file = DEBUG_LOG
        else:
            log_file = DEBUG_LOG
        
        try:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
        except Exception as e:
            # If we can't write to file, at least print to stdout
            print(f"⚠️ Could not write to log file: {e}")
            print(json.dumps(log_entry, ensure_ascii=False))
        
        # Also use Python logging
        log_method = getattr(logging.getLogger(__name__), level.lower(), logging.info)
        log_message = f"{message}"
        if context:
            log_message += f" | Context: {json.dumps(context)}"
        if error:
            log_message += f" | Error: {str(error)}"
        log_method(log_message, exc_info=error if error else None)
        
        # Keep in memory (limited)
        self.logs.append(log_entry)
        if len(self.logs) > self.max_logs:
            self.logs.pop(0)
    
    def debug(self, message: str, context: Optional[Dict] = None):
        """Log debug message"""
        self._write_log('DEBUG', message, context)
    
    def info(self, message: str, context: Optional[Dict] = None):
        """Log info message"""
        self._write_log('INFO', message, context)
    
    def warning(self, message: str, context: Optional[Dict] = None):
        """Log warning message"""
        self._write_log('WARNING', message, context)
    
    def error(self, message: str, error: Optional[Exception] = None, context: Optional[Dict] = None):
        """Log error message"""
        self._write_log('ERROR', message, context, error)
    
    def critical(self, message: str, error: Optional[Exception] = None, context: Optional[Dict] = None):
        """Log critical error"""
        self._write_log('CRITICAL', message, context, error)
    
    def log_request(self, method: str, path: str, status_code: int, duration_ms: float, 
                   request_body: Optional[Any] = None, response_body: Optional[Any] = None):
        """Log API request/response"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "request",
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "correlation_id": g.correlation_id if has_request_context() and hasattr(g, 'correlation_id') else None
        }
        
        # Add request body (sanitized)
        if request_body:
            sanitized = self._sanitize_data(request_body)
            log_entry["request_body"] = sanitized
        
        # Add response body (sanitized, truncated)
        if response_body:
            sanitized = self._sanitize_data(response_body)
            # Truncate large responses
            if isinstance(sanitized, str) and len(sanitized) > 1000:
                sanitized = sanitized[:1000] + "... (truncated)"
            log_entry["response_body"] = sanitized
        
        try:
            with open(REQUEST_LOG, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"⚠️ Could not write to request log: {e}")
            print(json.dumps(log_entry, ensure_ascii=False))
    
    def log_database(self, operation: str, query: Optional[str] = None, 
                    params: Optional[Dict] = None, duration_ms: Optional[float] = None,
                    error: Optional[Exception] = None):
        """Log database operation"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "database",
            "operation": operation,
            "query": query,
            "params": self._sanitize_data(params) if params else None,
            "duration_ms": duration_ms,
            "correlation_id": g.correlation_id if has_request_context() and hasattr(g, 'correlation_id') else None,
            "error": None
        }
        
        if error:
            log_entry["error"] = {
                "type": type(error).__name__,
                "message": str(error),
                "traceback": traceback.format_exc()
            }
        
        try:
            with open(DATABASE_LOG, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"⚠️ Could not write to database log: {e}")
            print(json.dumps(log_entry, ensure_ascii=False))
    
    def log_audit(self, action: str, user_id: Optional[str] = None, 
                 resource: Optional[str] = None, details: Optional[Dict] = None):
        """Log audit event"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "type": "audit",
            "action": action,
            "user_id": user_id,
            "resource": resource,
            "details": self._sanitize_data(details) if details else None,
            "correlation_id": g.correlation_id if has_request_context() and hasattr(g, 'correlation_id') else None
        }
        
        try:
            with open(AUDIT_LOG, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"⚠️ Could not write to audit log: {e}")
            print(json.dumps(log_entry, ensure_ascii=False))
    
    def _sanitize_data(self, data: Any) -> Any:
        """Sanitize sensitive data from logs"""
        if isinstance(data, dict):
            sanitized = {}
            for key, value in data.items():
                # Remove sensitive fields
                if key.lower() in ['password', 'api_key', 'token', 'secret', 'authorization']:
                    sanitized[key] = '***REDACTED***'
                else:
                    sanitized[key] = self._sanitize_data(value)
            return sanitized
        elif isinstance(data, list):
            return [self._sanitize_data(item) for item in data]
        elif isinstance(data, str):
            # Check for API keys in strings
            if 'grace_' in data:
                return '***REDACTED***'
            return data
        else:
            return data
    
    def get_logs(self, level: Optional[str] = None, limit: int = 100, 
                since: Optional[datetime] = None) -> List[Dict]:
        """Get logs from memory"""
        logs = self.logs
        
        # Filter by level
        if level:
            logs = [log for log in logs if log.get('level') == level.upper()]
        
        # Filter by time
        if since:
            logs = [log for log in logs if datetime.fromisoformat(log['timestamp']) >= since]
        
        # Return last N logs
        return logs[-limit:]
    
    def get_recent_errors(self, limit: int = 50) -> List[Dict]:
        """Get recent errors"""
        try:
            errors = []
            if ERROR_LOG.exists():
                with open(ERROR_LOG, 'r', encoding='utf-8') as f:
                    lines = f.readlines()
                    for line in lines[-limit:]:
                        try:
                            errors.append(json.loads(line.strip()))
                        except:
                            pass
            return errors[-limit:]
        except Exception as e:
            print(f"⚠️ Error reading error log: {e}")
            return []

# Global logger instance
debug_logger = DebugLogger()

def log_request_response(f):
    """Decorator to log request/response"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        # Generate correlation ID
        if not hasattr(g, 'correlation_id'):
            g.correlation_id = str(uuid.uuid4())[:8]
        
        start_time = datetime.now()
        debug_logger.info(f"Request: {request.method} {request.path}", {
            "correlation_id": g.correlation_id,
            "endpoint": request.endpoint
        })
        
        try:
            response = f(*args, **kwargs)
            duration = (datetime.now() - start_time).total_seconds() * 1000
            
            # Get response data
            response_data = None
            if hasattr(response, 'get_data'):
                try:
                    response_data = json.loads(response.get_data(as_text=True))
                except:
                    pass
            
            # Get request data
            request_data = None
            if request.is_json:
                request_data = request.get_json(silent=True)
            
            debug_logger.log_request(
                request.method,
                request.path,
                response.status_code if hasattr(response, 'status_code') else 200,
                duration,
                request_data,
                response_data
            )
            
            return response
        except Exception as e:
            duration = (datetime.now() - start_time).total_seconds() * 1000
            debug_logger.error(f"Request failed: {request.method} {request.path}", e, {
                "correlation_id": g.correlation_id,
                "duration_ms": duration
            })
            raise
    
    return decorated_function

def log_database_operation(operation: str):
    """Decorator to log database operations"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            start_time = datetime.now()
            debug_logger.log_database(operation, f"Function: {f.__name__}")
            
            try:
                result = f(*args, **kwargs)
                duration = (datetime.now() - start_time).total_seconds() * 1000
                debug_logger.log_database(operation, f"Function: {f.__name__}", 
                                         duration_ms=duration)
                return result
            except Exception as e:
                duration = (datetime.now() - start_time).total_seconds() * 1000
                debug_logger.log_database(operation, f"Function: {f.__name__}", 
                                         duration_ms=duration, error=e)
                raise
        
        return decorated_function
    return decorator

