"""
Database Connection Debugger
Real-time debugging and diagnostics for database issues
"""

import os
import time
import psycopg2
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from database_logger import DatabaseLogger

class DatabaseDebugger:
    """Database connection debugging and diagnostics"""
    
    def __init__(self, database_url: str):
        self.database_url = database_url
        self.logger = DatabaseLogger()
    
    def diagnose_connection(self) -> Dict[str, Any]:
        """Comprehensive connection diagnosis"""
        diagnosis = {
            "timestamp": datetime.now().isoformat(),
            "database_url": self._mask_url(self.database_url),
            "checks": {},
            "overall_status": "unknown",
            "issues": [],
            "recommendations": []
        }
        
        # Check 1: URL Format
        url_check = self._check_url_format()
        diagnosis["checks"]["url_format"] = url_check
        if not url_check["valid"]:
            diagnosis["issues"].append("Invalid DATABASE_URL format")
            diagnosis["recommendations"].append(url_check.get("fix", "Fix DATABASE_URL format"))
        
        # Check 2: Network Connectivity
        network_check = self._check_network()
        diagnosis["checks"]["network"] = network_check
        if not network_check["reachable"]:
            diagnosis["issues"].append("Cannot reach database host")
            diagnosis["recommendations"].append("Check if PostgreSQL is running: brew services start postgresql@15")
        
        # Check 3: Authentication
        auth_check = self._check_authentication()
        diagnosis["checks"]["authentication"] = auth_check
        if not auth_check["success"]:
            diagnosis["issues"].append("Authentication failed")
            diagnosis["recommendations"].append("Check username/password in DATABASE_URL")
        
        # Check 4: Database Exists
        db_check = self._check_database_exists()
        diagnosis["checks"]["database_exists"] = db_check
        if not db_check["exists"]:
            diagnosis["issues"].append(f"Database '{db_check.get('database_name')}' does not exist")
            diagnosis["recommendations"].append(f"Create database: createdb {db_check.get('database_name', 'railway')}")
        
        # Check 5: Tables Exist
        tables_check = self._check_tables()
        diagnosis["checks"]["tables"] = tables_check
        if not tables_check["tables_exist"]:
            diagnosis["issues"].append("Required tables missing")
            diagnosis["recommendations"].append("Run migrations: python3 scripts/database/init_database.py")
        
        # Check 6: Connection Pool
        pool_check = self._check_connection_pool()
        diagnosis["checks"]["connection_pool"] = pool_check
        
        # Determine overall status
        if not diagnosis["issues"]:
            diagnosis["overall_status"] = "healthy"
        elif len(diagnosis["issues"]) <= 2:
            diagnosis["overall_status"] = "degraded"
        else:
            diagnosis["overall_status"] = "unhealthy"
        
        return diagnosis
    
    def _mask_url(self, url: str) -> str:
        """Mask sensitive parts of database URL"""
        if '@' in url:
            parts = url.split('@')
            return f"postgresql://***@{parts[1]}"
        return "postgresql://***"
    
    def _check_url_format(self) -> Dict[str, Any]:
        """Check if DATABASE_URL has valid format"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(self.database_url)
            
            issues = []
            if not parsed.scheme or parsed.scheme != 'postgresql':
                issues.append("Invalid scheme (should be 'postgresql')")
            if not parsed.hostname:
                issues.append("Missing hostname")
            if not parsed.path or len(parsed.path) <= 1:
                issues.append("Missing database name")
            
            # Check for placeholder values
            if 'hostname' in self.database_url.lower():
                issues.append("Contains placeholder 'hostname'")
            
            return {
                "valid": len(issues) == 0,
                "issues": issues,
                "parsed": {
                    "scheme": parsed.scheme,
                    "hostname": parsed.hostname,
                    "port": parsed.port,
                    "database": parsed.path.lstrip('/'),
                    "user": parsed.username
                },
                "fix": "Use format: postgresql://user:password@host:port/database" if issues else None
            }
        except Exception as e:
            return {
                "valid": False,
                "error": str(e),
                "fix": "Check DATABASE_URL format"
            }
    
    def _check_network(self) -> Dict[str, Any]:
        """Check if database host is reachable"""
        try:
            from urllib.parse import urlparse
            import socket
            parsed = urlparse(self.database_url)
            hostname = parsed.hostname
            port = parsed.port or 5432
            
            start_time = time.time()
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(3)
            result = sock.connect_ex((hostname, port))
            sock.close()
            duration_ms = (time.time() - start_time) * 1000
            
            return {
                "reachable": result == 0,
                "hostname": hostname,
                "port": port,
                "response_time_ms": round(duration_ms, 2),
                "error": "Connection refused" if result != 0 else None
            }
        except Exception as e:
            return {
                "reachable": False,
                "error": str(e)
            }
    
    def _check_authentication(self) -> Dict[str, Any]:
        """Test database authentication"""
        try:
            start_time = time.time()
            conn = psycopg2.connect(self.database_url, connect_timeout=5)
            duration_ms = (time.time() - start_time) * 1000
            conn.close()
            
            return {
                "success": True,
                "duration_ms": round(duration_ms, 2)
            }
        except psycopg2.OperationalError as e:
            error_msg = str(e).lower()
            return {
                "success": False,
                "error": str(e),
                "error_type": "operational",
                "suggested_fix": self._suggest_auth_fix(error_msg)
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    def _suggest_auth_fix(self, error_msg: str) -> str:
        """Suggest fix based on error message"""
        if "authentication failed" in error_msg or "password" in error_msg:
            return "Check username/password in DATABASE_URL"
        elif "connection refused" in error_msg:
            return "PostgreSQL server not running. Start: brew services start postgresql@15"
        elif "timeout" in error_msg:
            return "Connection timeout. Check firewall/network settings"
        else:
            return "Check DATABASE_URL credentials and PostgreSQL service status"
    
    def _check_database_exists(self) -> Dict[str, Any]:
        """Check if database exists"""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(self.database_url)
            db_name = parsed.path.lstrip('/')
            
            # Connect to postgres database to check
            temp_url = self.database_url.rsplit('/', 1)[0] + '/postgres'
            conn = psycopg2.connect(temp_url, connect_timeout=5)
            cur = conn.cursor()
            cur.execute("""
                SELECT 1 FROM pg_database WHERE datname = %s
            """, (db_name,))
            exists = cur.fetchone() is not None
            cur.close()
            conn.close()
            
            return {
                "exists": exists,
                "database_name": db_name,
                "fix": f"Create database: createdb {db_name}" if not exists else None
            }
        except Exception as e:
            return {
                "exists": False,
                "error": str(e)
            }
    
    def _check_tables(self) -> Dict[str, Any]:
        """Check if required tables exist"""
        required_tables = ['users', 'conversations', 'projects', 'quarantine_items']
        try:
            conn = psycopg2.connect(self.database_url, connect_timeout=5)
            cur = conn.cursor()
            cur.execute("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE'
            """)
            existing_tables = [row[0] for row in cur.fetchall()]
            cur.close()
            conn.close()
            
            missing_tables = [t for t in required_tables if t not in existing_tables]
            
            return {
                "tables_exist": len(missing_tables) == 0,
                "total_tables": len(existing_tables),
                "required_tables": required_tables,
                "missing_tables": missing_tables,
                "fix": "Run migrations: python3 scripts/database/init_database.py" if missing_tables else None
            }
        except Exception as e:
            return {
                "tables_exist": False,
                "error": str(e)
            }
    
    def _check_connection_pool(self) -> Dict[str, Any]:
        """Check connection pool status"""
        try:
            from database_pool import DatabasePoolManager
            pool_manager = DatabasePoolManager.get_instance(self.database_url)
            stats = pool_manager.get_stats()
            
            return {
                "available": True,
                "pool_size": stats.get("pool_size", 0),
                "active_connections": stats.get("active", 0),
                "idle_connections": stats.get("idle", 0),
                "waiting": stats.get("waiting", 0)
            }
        except Exception as e:
            return {
                "available": False,
                "error": str(e)
            }
    
    def test_query(self, query: str = "SELECT 1", params: Optional[tuple] = None) -> Dict[str, Any]:
        """Test a simple query"""
        result = {
            "success": False,
            "duration_ms": None,
            "error": None,
            "result": None
        }
        
        try:
            start_time = time.time()
            conn = psycopg2.connect(self.database_url, connect_timeout=5)
            cur = conn.cursor()
            cur.execute(query, params)
            result["result"] = cur.fetchone()
            cur.close()
            conn.close()
            result["duration_ms"] = round((time.time() - start_time) * 1000, 2)
            result["success"] = True
        except Exception as e:
            result["error"] = str(e)
            result["error_type"] = type(e).__name__
            self.logger.log_error("test_query", str(e), {"query": query}, e)
        
        return result

