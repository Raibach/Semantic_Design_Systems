"""
Database Connection Logger & Debugger
Comprehensive logging and debugging for all database operations
"""

import os
import json
import traceback
from datetime import datetime
from typing import Optional, Dict, Any, List
from pathlib import Path
import psycopg2
from psycopg2 import OperationalError, InterfaceError, ProgrammingError, DatabaseError

# Log directory
LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

# Log files
DB_CONNECTION_LOG = LOG_DIR / "database_connections.log"
DB_ERROR_LOG = LOG_DIR / "database_errors.log"
DB_QUERY_LOG = LOG_DIR / "database_queries.log"
DB_HEALTH_LOG = LOG_DIR / "database_health.log"
DB_DEBUG_LOG = LOG_DIR / "database_debug.log"

class DatabaseLogger:
    """Centralized database logging system"""
    
    @staticmethod
    def _write_log(log_file: Path, entry: Dict[str, Any]):
        """Write log entry to file"""
        try:
            with open(log_file, 'a') as f:
                f.write(json.dumps(entry) + '\n')
        except Exception as e:
            print(f"⚠️ Failed to write to {log_file}: {e}")
    
    @staticmethod
    def log_connection_attempt(
        database_url: str,
        success: bool,
        error: Optional[str] = None,
        duration_ms: Optional[float] = None
    ):
        """Log database connection attempts"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": "connection_attempt",
            "success": success,
            "database_url": database_url.split('@')[1] if '@' in database_url else "masked",
            "duration_ms": duration_ms,
            "error": error
        }
        DatabaseLogger._write_log(DB_CONNECTION_LOG, entry)
        
        if not success:
            # Also log to error log
            DatabaseLogger.log_error("connection", error or "Unknown connection error", {
                "database_url": database_url.split('@')[1] if '@' in database_url else "masked"
            })
    
    @staticmethod
    def log_error(
        operation: str,
        error_message: str,
        context: Optional[Dict[str, Any]] = None,
        exception: Optional[Exception] = None
    ):
        """Log database errors with full context"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": "error",
            "operation": operation,
            "error": error_message,
            "error_type": type(exception).__name__ if exception else "Unknown",
            "context": context or {},
        }
        
        if exception:
            entry["traceback"] = traceback.format_exc()
            entry["error_code"] = getattr(exception, 'pgcode', None)
            entry["error_detail"] = getattr(exception, 'pgerror', None)
        
        DatabaseLogger._write_log(DB_ERROR_LOG, entry)
        
        # Also print to console for immediate visibility
        print(f"❌ Database Error [{operation}]: {error_message}")
        if exception:
            print(f"   Type: {type(exception).__name__}")
            if hasattr(exception, 'pgcode'):
                print(f"   PostgreSQL Code: {exception.pgcode}")
            if hasattr(exception, 'pgerror'):
                print(f"   Detail: {exception.pgerror}")
    
    @staticmethod
    def log_query(
        operation: str,
        query: Optional[str] = None,
        params: Optional[tuple] = None,
        success: bool = True,
        duration_ms: Optional[float] = None,
        rows_affected: Optional[int] = None,
        error: Optional[str] = None
    ):
        """Log database queries (can be enabled/disabled)"""
        if not os.getenv('DB_QUERY_LOGGING_ENABLED', 'false').lower() == 'true':
            return  # Skip query logging unless explicitly enabled
        
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": "query",
            "operation": operation,
            "query": query[:500] if query else None,  # Truncate long queries
            "params": str(params)[:200] if params else None,  # Truncate params
            "success": success,
            "duration_ms": duration_ms,
            "rows_affected": rows_affected,
            "error": error
        }
        DatabaseLogger._write_log(DB_QUERY_LOG, entry)
    
    @staticmethod
    def log_health_check(
        status: str,
        details: Dict[str, Any],
        error: Optional[str] = None
    ):
        """Log database health check results"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "event": "health_check",
            "status": status,  # "healthy", "degraded", "unhealthy"
            "details": details,
            "error": error
        }
        DatabaseLogger._write_log(DB_HEALTH_LOG, entry)
    
    @staticmethod
    def log_debug(
        message: str,
        data: Optional[Dict[str, Any]] = None,
        level: str = "info"  # "debug", "info", "warning", "error"
    ):
        """Log debug information"""
        entry = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message,
            "data": data or {}
        }
        DatabaseLogger._write_log(DB_DEBUG_LOG, entry)
        
        # Print to console based on level
        if level == "error":
            print(f"🔴 [DB DEBUG] {message}")
        elif level == "warning":
            print(f"🟡 [DB DEBUG] {message}")
        elif level == "info":
            print(f"ℹ️  [DB DEBUG] {message}")
        else:
            print(f"🔵 [DB DEBUG] {message}")

    @staticmethod
    def categorize_error(exception: Exception) -> Dict[str, Any]:
        """Categorize database errors for better debugging"""
        error_type = type(exception).__name__
        error_msg = str(exception).lower()
        
        category = "unknown"
        severity = "medium"
        suggested_fix = "Check database connection and logs"
        
        if isinstance(exception, OperationalError):
            category = "connection"
            severity = "high"
            if "could not translate hostname" in error_msg or "hostname" in error_msg:
                suggested_fix = "DATABASE_URL contains invalid hostname. Check .env file."
            elif "connection refused" in error_msg:
                suggested_fix = "PostgreSQL server not running. Start with: brew services start postgresql@15"
            elif "timeout" in error_msg:
                suggested_fix = "Connection timeout. Check network/firewall settings."
            elif "authentication failed" in error_msg or "password" in error_msg:
                suggested_fix = "Invalid credentials. Check DATABASE_URL username/password."
            else:
                suggested_fix = "Check PostgreSQL service status and DATABASE_URL"
        
        elif isinstance(exception, InterfaceError):
            category = "interface"
            severity = "high"
            suggested_fix = "Database connection lost. Check if PostgreSQL server restarted."
        
        elif isinstance(exception, ProgrammingError):
            category = "query"
            severity = "medium"
            if "relation" in error_msg and "does not exist" in error_msg:
                suggested_fix = "Table missing. Run database migrations: python3 scripts/database/init_database.py"
            elif "column" in error_msg and "does not exist" in error_msg:
                suggested_fix = "Column missing. Check database schema matches code."
            else:
                suggested_fix = "SQL syntax error. Check query and parameters."
        
        elif isinstance(exception, DatabaseError):
            category = "database"
            severity = "high"
            if "deadlock" in error_msg:
                suggested_fix = "Database deadlock. Retry the operation."
            elif "lock" in error_msg:
                suggested_fix = "Table locked. Wait and retry."
            else:
                suggested_fix = "Database error. Check PostgreSQL logs."
        
        return {
            "category": category,
            "severity": severity,
            "error_type": error_type,
            "suggested_fix": suggested_fix,
            "postgresql_code": getattr(exception, 'pgcode', None),
            "postgresql_detail": getattr(exception, 'pgerror', None)
        }

    @staticmethod
    def get_recent_errors(limit: int = 10) -> List[Dict[str, Any]]:
        """Get recent database errors"""
        errors = []
        try:
            if DB_ERROR_LOG.exists():
                with open(DB_ERROR_LOG, 'r') as f:
                    lines = f.readlines()
                    for line in lines[-limit:]:
                        try:
                            errors.append(json.loads(line.strip()))
                        except:
                            pass
        except Exception as e:
            print(f"⚠️ Error reading error log: {e}")
        return errors
    
    @staticmethod
    def get_connection_history(limit: int = 20) -> List[Dict[str, Any]]:
        """Get recent connection attempts"""
        connections = []
        try:
            if DB_CONNECTION_LOG.exists():
                with open(DB_CONNECTION_LOG, 'r') as f:
                    lines = f.readlines()
                    for line in lines[-limit:]:
                        try:
                            connections.append(json.loads(line.strip()))
                        except:
                            pass
        except Exception as e:
            print(f"⚠️ Error reading connection log: {e}")
        return connections
    
    @staticmethod
    def get_health_summary() -> Dict[str, Any]:
        """Get database health summary"""
        summary = {
            "status": "unknown",
            "last_check": None,
            "recent_errors": 0,
            "connection_success_rate": 0.0,
            "last_error": None
        }
        
        try:
            # Get recent health checks
            if DB_HEALTH_LOG.exists():
                with open(DB_HEALTH_LOG, 'r') as f:
                    lines = f.readlines()
                    if lines:
                        last_check = json.loads(lines[-1].strip())
                        summary["status"] = last_check.get("status", "unknown")
                        summary["last_check"] = last_check.get("timestamp")
            
            # Count recent errors (last hour)
            errors = DatabaseLogger.get_recent_errors(100)
            recent_errors = [e for e in errors if e.get("timestamp")]
            # Filter to last hour
            from datetime import datetime, timedelta
            one_hour_ago = (datetime.now() - timedelta(hours=1)).isoformat()
            recent_errors = [e for e in recent_errors if e.get("timestamp", "") > one_hour_ago]
            summary["recent_errors"] = len(recent_errors)
            if recent_errors:
                summary["last_error"] = recent_errors[-1].get("error")
            
            # Calculate connection success rate
            connections = DatabaseLogger.get_connection_history(100)
            if connections:
                successful = sum(1 for c in connections if c.get("success", False))
                total = len(connections)
                summary["connection_success_rate"] = successful / total if total > 0 else 0.0
            
        except Exception as e:
            print(f"⚠️ Error generating health summary: {e}")
        
        return summary

