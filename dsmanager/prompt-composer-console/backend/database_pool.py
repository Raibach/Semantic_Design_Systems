"""
Database Connection Pool Manager
Provides robust connection pooling, health checks, and retry logic for PostgreSQL
"""

import os
import time
import threading
import psycopg2
from psycopg2 import pool, OperationalError, InterfaceError, DatabaseError
from psycopg2.extras import RealDictCursor, register_uuid
from urllib.parse import urlparse, parse_qs

# Register UUID adapter so psycopg2 can handle Python UUID → PostgreSQL UUID
register_uuid()
from contextlib import contextmanager
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
import logging

# Import database logger for comprehensive logging
try:
    from database_logger import DatabaseLogger
    DB_LOGGER_AVAILABLE = True
except ImportError:
    DB_LOGGER_AVAILABLE = False
    DatabaseLogger = None

# Configure logging
logger = logging.getLogger(__name__)


class PooledConnection:
    """
    Wrapper around psycopg2 connection that automatically returns to pool on close.
    """
    def __init__(self, conn, pool_manager: 'DatabasePoolManager'):
        self._conn = conn
        self._pool_manager = pool_manager
        self._closed = False
    
    def __getattr__(self, name):
        """Delegate all attribute access to the underlying connection."""
        return getattr(self._conn, name)
    
    def close(self):
        """Close connection and return it to the pool."""
        if not self._closed:
            self._closed = True
            try:
                self._pool_manager.pool.putconn(self._conn)
            except Exception as e:
                logger.error(f"Error returning connection to pool: {e}")
                try:
                    self._conn.close()
                except:
                    pass
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False


class DatabasePoolManager:
    """
    Manages PostgreSQL connection pool with health checks and retry logic.
    
    Features:
    - Connection pooling (min 2, max 10 connections)
    - Automatic health checks (every 60 seconds)
    - Retry logic with exponential backoff
    - TCP keepalive settings
    - SSL mode detection (local vs remote)
    - Connection validation
    - Pool statistics
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __init__(self, database_url: str, min_conn: int = 2, max_conn: int = 25):
        """
        Initialize the connection pool manager.
        
        Args:
            database_url: PostgreSQL connection URL
            min_conn: Minimum number of connections in pool (default 2)
            max_conn: Maximum number of connections in pool (default 25 for local dev)
                      Can be overridden via DATABASE_POOL_MAX_CONN env var.
        """
        # Allow override via environment variable
        env_max = os.getenv('DATABASE_POOL_MAX_CONN')
        if env_max:
            try:
                max_conn = int(env_max)
            except ValueError:
                pass
        
        self.database_url = database_url
        self.min_conn = min_conn
        self.max_conn = max_conn
        self.pool: Optional[pool.ThreadedConnectionPool] = None
        self.last_health_check = None
        self.health_check_interval = 60  # seconds
        self.health_check_lock = threading.Lock()
        self.pool_stats = {
            'total_connections': 0,
            'active_connections': 0,
            'idle_connections': 0,
            'connection_errors': 0,
            'retry_attempts': 0,
            'health_check_count': 0,
            'last_error': None,
            'last_error_time': None
        }
        self._initialize_pool()
    
    def _normalize_database_url(self) -> str:
        """
        Normalize database URL: fix port issues, set SSL mode, etc.
        Returns a clean connection string.
        """
        parsed = urlparse(self.database_url)
        
        # Fix invalid port values
        netloc = parsed.netloc
        if ':' in netloc:
            netloc_parts = netloc.split('@')
            if len(netloc_parts) == 2:
                auth, host_part = netloc_parts
                if ':' in host_part:
                    host, port_str = host_part.rsplit(':', 1)
                    try:
                        port_num = int(port_str)
                        if port_num < 1 or port_num > 65535:
                            netloc = f"{auth}@{host}"
                            self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                self.database_url += f"?{parsed.query}"
                            parsed = urlparse(self.database_url)
                    except (ValueError, TypeError):
                        netloc = f"{auth}@{host}"
                        self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                        if parsed.query:
                            self.database_url += f"?{parsed.query}"
                        parsed = urlparse(self.database_url)
        
        # Determine SSL mode
        query_params = parse_qs(parsed.query)
        hostname = parsed.hostname or 'localhost'
        is_local = hostname in ('localhost', '127.0.0.1', '::1')
        is_private_url = 'railway.internal' in self.database_url.lower()
        
        if 'sslmode' not in query_params:
            if is_local:
                default_sslmode = 'disable'
            elif is_private_url:
                default_sslmode = 'prefer'
            else:
                default_sslmode = 'require'
            
            separator = '&' if parsed.query else '?'
            self.database_url = f"{self.database_url}{separator}sslmode={default_sslmode}"
        
        return self.database_url
    
    def _get_connection_params(self) -> Dict[str, Any]:
        """
        Get connection parameters for psycopg2.
        """
        conn_string = self._normalize_database_url()
        parsed = urlparse(conn_string)
        hostname = parsed.hostname or 'localhost'
        is_private_url = 'railway.internal' in conn_string.lower()
        
        # Determine timeout
        if is_private_url:
            timeout = 15
        elif 'proxy.rlwy.net' in conn_string.lower():
            timeout = 15
        else:
            timeout = 10
        
        # Parse connection string into parameters
        params = {
            'dsn': conn_string,
            'cursor_factory': RealDictCursor,
            'connect_timeout': timeout,
        }
        
        # Add TCP keepalive settings for better connection stability
        params['keepalives'] = 1
        params['keepalives_idle'] = 30
        params['keepalives_interval'] = 10
        params['keepalives_count'] = 3
        
        return params
    
    def _initialize_pool(self):
        """Initialize the connection pool."""
        start_time = time.time()
        try:
            params = self._get_connection_params()
            
            # Log connection attempt
            if DB_LOGGER_AVAILABLE:
                DatabaseLogger.log_debug("Initializing connection pool", {
                    "min_conn": self.min_conn,
                    "max_conn": self.max_conn,
                    "database": urlparse(self.database_url).path.lstrip('/')
                })
            
            # Create connection pool
            self.pool = pool.ThreadedConnectionPool(
                self.min_conn,
                self.max_conn,
                **params
            )
            
            # Test the pool with a connection
            test_conn = self.pool.getconn()
            test_cursor = test_conn.cursor()
            test_cursor.execute("SELECT 1")
            test_cursor.fetchone()
            test_cursor.close()
            self.pool.putconn(test_conn)
            
            duration_ms = (time.time() - start_time) * 1000
            
            logger.info("✅ Database connection pool initialized successfully")
            self.pool_stats['total_connections'] = self.max_conn
            
            # Log successful connection
            if DB_LOGGER_AVAILABLE:
                DatabaseLogger.log_connection_attempt(
                    self.database_url,
                    success=True,
                    duration_ms=duration_ms
                )
                DatabaseLogger.log_health_check("healthy", {
                    "pool_size": self.max_conn,
                    "initialization_time_ms": duration_ms
                })
            
        except Exception as e:
            try:
                duration_ms = (time.time() - start_time) * 1000
            except (NameError, UnboundLocalError):
                duration_ms = 0
            error_msg = str(e)
            
            logger.error(f"❌ Failed to initialize connection pool: {e}")
            self.pool_stats['last_error'] = error_msg
            self.pool_stats['last_error_time'] = datetime.now()
            self.pool_stats['connection_errors'] += 1
            
            # Log connection failure with full context (with error handling)
            if DB_LOGGER_AVAILABLE:
                try:
                    DatabaseLogger.log_connection_attempt(
                        self.database_url,
                        success=False,
                        error=error_msg,
                        duration_ms=duration_ms
                    )
                    error_category = DatabaseLogger.categorize_error(e)
                    DatabaseLogger.log_error(
                        "pool_initialization",
                        error_msg,
                        {
                            "min_conn": self.min_conn,
                            "max_conn": self.max_conn,
                            "duration_ms": duration_ms,
                            **error_category
                        },
                        e
                    )
                    DatabaseLogger.log_health_check("unhealthy", {
                        "error": error_msg,
                        "error_category": error_category.get("category")
                    }, error_msg)
                except Exception as log_err:
                    # Don't let logging errors break initialization
                    logger.warning(f"Failed to log pool initialization error: {log_err}")
            
            raise ConnectionError(f"Failed to initialize database connection pool: {e}") from e
    
    def _health_check(self) -> bool:
        """
        Perform a health check on the connection pool.
        Returns True if healthy, False otherwise.
        """
        with self.health_check_lock:
            now = datetime.now()
            
            # Skip if health check was done recently
            if (self.last_health_check and 
                (now - self.last_health_check).total_seconds() < self.health_check_interval):
                return True
            
            try:
                if not self.pool:
                    logger.warning("⚠️ Connection pool not initialized")
                    return False
                
                # Get a connection and test it
                conn = self.pool.getconn()
                try:
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1")
                    cursor.fetchone()
                    cursor.close()
                    
                    # Update stats
                    self.pool_stats['health_check_count'] += 1
                    self.last_health_check = now
                    return True
                finally:
                    self.pool.putconn(conn)
                    
            except Exception as e:
                error_msg = str(e)
                logger.error(f"❌ Health check failed: {e}")
                self.pool_stats['last_error'] = error_msg
                self.pool_stats['last_error_time'] = datetime.now()
                self.pool_stats['connection_errors'] += 1
                
                # Log health check failure
                if DB_LOGGER_AVAILABLE:
                    try:
                        error_category = DatabaseLogger.categorize_error(e)
                        DatabaseLogger.log_error(
                            "health_check",
                            error_msg,
                            error_category,
                            e
                        )
                        DatabaseLogger.log_health_check("unhealthy", {
                            "error": error_msg,
                            "error_category": error_category.get("category")
                        }, error_msg)
                    except Exception as log_err:
                        # Don't fail health check if logging fails
                        logger.warning(f"Failed to log health check error: {log_err}")
                
                # Try to reinitialize pool
                try:
                    self._initialize_pool()
                    return True
                except Exception as reinit_err:
                    # Log but don't fail - pool might still work
                    logger.warning(f"Pool reinitialization failed: {reinit_err}")
                    return False
    
    def get_db(self) -> PooledConnection:
        """
        Get a database connection from the pool.
        The connection will be automatically returned to the pool when close() is called.
        This method is kept for backwards compatibility with existing code.
        
        Returns:
            PooledConnection: A wrapped connection that returns to pool on close()
        """
        if not self.pool:
            raise ConnectionError("Connection pool not initialized")
        
        # Perform health check if needed (may reinitialize pool if unhealthy)
        try:
            self._health_check()
        except Exception as health_err:
            # If health check fails catastrophically, log but continue
            logger.warning(f"Health check failed: {health_err}")
        
        # Retry logic for pool exhaustion
        max_retries = 3
        retry_delay = 0.5  # seconds
        last_exception = None
        
        for attempt in range(max_retries):
            try:
                # Try to get connection with timeout
                try:
                    conn = self.pool.getconn()
                except Exception as pool_err:
                    # If pool.getconn() doesn't support timeout, try without
                    conn = self.pool.getconn()
                
                # Validate connection is still alive
                try:
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1")
                    cursor.fetchone()
                    cursor.close()
                except (OperationalError, InterfaceError, DatabaseError):
                    # Connection is dead, close it and get a new one
                    try:
                        conn.close()
                    except:
                        pass
                    try:
                        self.pool.putconn(conn, close=True)
                    except:
                        pass
                    # Get a new connection
                    conn = self.pool.getconn()
                
                if DB_LOGGER_AVAILABLE:
                    DatabaseLogger.log_debug("Connection retrieved from pool", {
                        "pool_size": self.max_conn,
                        "attempt": attempt + 1
                    })
                
                return PooledConnection(conn, self)
            except Exception as e:
                last_exception = e
                error_msg = str(e).lower()
                # Check if it's a pool exhaustion error
                if 'pool' in error_msg and ('exhausted' in error_msg or 'timeout' in error_msg or 'connection' in error_msg):
                    if attempt < max_retries - 1:
                        logger.warning(f"⚠️ Connection pool exhausted (attempt {attempt + 1}/{max_retries}), retrying in {retry_delay}s...")
                        time.sleep(retry_delay)
                        retry_delay *= 1.5  # Exponential backoff
                        continue
                # For other errors or final attempt, break and raise
                break
        
        # All retries failed - log and raise
        error_msg = str(last_exception) if last_exception else "Unknown error"
        self.pool_stats['connection_errors'] += 1
        self.pool_stats['last_error'] = error_msg
        self.pool_stats['last_error_time'] = datetime.now()
        
        # Log connection retrieval failure (with error handling to prevent logging failures from breaking API)
        if DB_LOGGER_AVAILABLE:
            try:
                error_category = DatabaseLogger.categorize_error(last_exception) if last_exception else {}
                DatabaseLogger.log_error(
                    "get_connection",
                    error_msg,
                    {
                        "operation": "get_db",
                        **error_category
                    },
                    last_exception
                )
            except Exception as log_err:
                # Don't let logging errors break the API
                logger.warning(f"Failed to log connection error: {log_err}")
        
        raise ConnectionError(f"Failed to get database connection after {max_retries} attempts: {error_msg}") from last_exception
    
    @contextmanager
    def get_connection(self, retries: int = 3, backoff_factor: float = 1.5):
        """
        Get a connection from the pool with retry logic.
        
        Args:
            retries: Number of retry attempts
            backoff_factor: Exponential backoff multiplier
        
        Yields:
            psycopg2 connection object
        
        Raises:
            ConnectionError: If all retry attempts fail
        """
        if not self.pool:
            raise ConnectionError("Connection pool not initialized")
        
        # Perform health check if needed
        self._health_check()
        
        last_exception = None
        wait_time = 1.0
        
        for attempt in range(retries):
            try:
                conn = self.pool.getconn()
                
                # Validate connection is still alive
                try:
                    cursor = conn.cursor()
                    cursor.execute("SELECT 1")
                    cursor.fetchone()
                    cursor.close()
                except (OperationalError, InterfaceError, DatabaseError):
                    # Connection is dead, close it and get a new one
                    try:
                        conn.close()
                    except:
                        pass
                    # Remove dead connection from pool
                    try:
                        self.pool.putconn(conn, close=True)
                    except:
                        pass
                    # Get a new connection
                    conn = self.pool.getconn()
                
                # Update stats
                self.pool_stats['active_connections'] = self.pool_stats.get('active_connections', 0) + 1
                
                try:
                    yield conn
                finally:
                    # Return connection to pool
                    try:
                        self.pool.putconn(conn)
                        self.pool_stats['active_connections'] = max(0, self.pool_stats.get('active_connections', 0) - 1)
                    except Exception as e:
                        logger.error(f"Error returning connection to pool: {e}")
                        try:
                            conn.close()
                        except:
                            pass
                
                # Success - reset error tracking
                if attempt > 0:
                    self.pool_stats['retry_attempts'] += attempt
                return
                
            except (OperationalError, InterfaceError, DatabaseError) as e:
                last_exception = e
                self.pool_stats['connection_errors'] += 1
                self.pool_stats['last_error'] = str(e)
                self.pool_stats['last_error_time'] = datetime.now()
                
                if attempt < retries - 1:
                    # Exponential backoff
                    wait_time *= backoff_factor
                    logger.warning(f"⚠️ Connection attempt {attempt + 1} failed, retrying in {wait_time:.2f}s: {e}")
                    time.sleep(wait_time)
                    
                    # Try to reinitialize pool if it seems broken
                    if attempt == retries - 2:
                        try:
                            self._initialize_pool()
                        except:
                            pass
                else:
                    logger.error(f"❌ All {retries} connection attempts failed")
        
        # All retries failed
        raise ConnectionError(f"Failed to get database connection after {retries} attempts: {last_exception}") from last_exception
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Get pool statistics.
        
        Returns:
            Dictionary with pool statistics
        """
        stats = self.pool_stats.copy()
        
        if self.pool:
            try:
                # Get actual pool stats if available
                # Note: ThreadedConnectionPool doesn't expose stats directly,
                # so we track our own
                stats['pool_initialized'] = True
            except:
                stats['pool_initialized'] = False
        else:
            stats['pool_initialized'] = False
        
        stats['last_health_check'] = self.last_health_check.isoformat() if self.last_health_check else None
        stats['health_check_interval'] = self.health_check_interval
        stats['min_connections'] = self.min_conn
        stats['max_connections'] = self.max_conn
        
        return stats
    
    def close_all(self):
        """Close all connections in the pool."""
        if self.pool:
            try:
                self.pool.closeall()
                logger.info("✅ All database connections closed")
            except Exception as e:
                logger.error(f"Error closing connection pool: {e}")
            finally:
                self.pool = None
    
    @classmethod
    def get_instance(cls, database_url: Optional[str] = None) -> 'DatabasePoolManager':
        """
        Get or create a singleton instance of the pool manager.
        
        Args:
            database_url: Database URL (required on first call)
        
        Returns:
            DatabasePoolManager instance
        """
        if cls._instance is None:
            if database_url is None:
                # Try to get from environment
                database_url = os.getenv('DATABASE_URL') or os.getenv('DATABASE_PUBLIC_URL')
                if not database_url:
                    raise ValueError("database_url must be provided or set in DATABASE_URL environment variable")
            
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls(database_url)
        
        return cls._instance
    
    @classmethod
    def reset_instance(cls):
        """Reset the singleton instance (useful for testing)."""
        with cls._lock:
            if cls._instance:
                cls._instance.close_all()
            cls._instance = None

