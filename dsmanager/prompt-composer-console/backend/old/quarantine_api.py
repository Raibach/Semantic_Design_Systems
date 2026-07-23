"""
Quarantine API - PostgreSQL service for quarantine item management
Handles user-isolated quarantine storage with database backend
"""

import os
import uuid
import json
import time
import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import OperationalError, InterfaceError
from datetime import datetime
from typing import Dict, List, Optional
from urllib.parse import urlparse, parse_qs
from database_pool import DatabasePoolManager


class QuarantineAPI:
    """PostgreSQL service for quarantine item management with user isolation"""

    def __init__(self, database_url: str):
        self.database_url = database_url
        # Initialize connection pool manager
        self.pool_manager = DatabasePoolManager.get_instance(database_url)

    def get_db(self):
        """
        Get database connection from pool.
        Connection will be automatically returned to pool when close() is called.
        """
        return self.pool_manager.get_db()
    
    def get_db_context(self):
        """
        Get database connection context manager from pool.
        Use with: with self.get_db_context() as conn:
        """
        return self.pool_manager.get_connection()
    
    def _get_db_legacy(self):
        """Get database connection with proper error handling"""
        try:
            # Parse DATABASE_URL and fix any port issues
            parsed = urlparse(self.database_url)
            
            # Check if port exists and is valid - if not, remove it
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
                else:
                    if ':' in netloc:
                        host, port_str = netloc.rsplit(':', 1)
                        try:
                            port_num = int(port_str)
                            if port_num < 1 or port_num > 65535:
                                netloc = host
                                self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                                if parsed.query:
                                    self.database_url += f"?{parsed.query}"
                                parsed = urlparse(self.database_url)
                        except (ValueError, TypeError):
                            netloc = host
                            self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                self.database_url += f"?{parsed.query}"
                            parsed = urlparse(self.database_url)
            
            # Ensure sslmode is in the URL if not present
            query_params = parse_qs(parsed.query)
            is_private_url = 'railway.internal' in self.database_url.lower()
            
            if 'sslmode' not in query_params:
                separator = '&' if parsed.query else '?'
                if is_private_url:
                    conn_string = f"{self.database_url}{separator}sslmode=prefer"
                else:
                    conn_string = f"{self.database_url}{separator}sslmode=require"
            else:
                conn_string = self.database_url
            
            # Increase timeout for Railway TCP proxy connections (can be slow)
            # Private Railway URLs get longer timeout, public TCP proxy gets medium timeout
            if is_private_url:
                timeout = 15  # Private network - more reliable
            elif 'proxy.rlwy.net' in self.database_url.lower():
                timeout = 15  # Railway TCP proxy - can be slow, needs longer timeout
            else:
                timeout = 10  # Other public connections
            return psycopg2.connect(
                conn_string,
                cursor_factory=RealDictCursor,
                connect_timeout=timeout
            )
        except (OperationalError, InterfaceError) as e:
            error_msg = str(e).lower()
            if 'could not connect' in error_msg or 'connection refused' in error_msg or 'timeout' in error_msg:
                raise ConnectionError("Unable to connect to database. You may be offline or the database server is unavailable.") from e
            elif 'authentication failed' in error_msg or 'password' in error_msg:
                raise ConnectionError("Database authentication failed. Please check your connection settings.") from e
            else:
                raise ConnectionError(f"Database connection error: {str(e)}") from e
        except Exception as e:
            print(f"Database connection error: {e}")
            raise ConnectionError(f"Database error: {str(e)}") from e

    def set_user_context(self, cursor, user_id: str):
        """Set PostgreSQL RLS context for multi-tenancy"""
        try:
            cursor.execute(f"SET app.current_user_id = '{user_id}'")
        except Exception:
            # RLS might not be enabled, continue without it
            pass

    # ============================================
    # QUARANTINE ITEMS
    # ============================================

    def create_quarantine_item(
        self,
        user_id: str,
        source_type: str,
        source_id: Optional[str] = None,
        url: Optional[str] = None,
        title: Optional[str] = None,
        content_preview: Optional[str] = None,
        threat_level: str = 'MODERATE',
        threat_category: Optional[str] = None,
        threat_details: Optional[Dict] = None,
        status: str = 'pending_review'
    ) -> str:
        """Create a new quarantine item for a user"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            # Generate source_id if not provided
            if not source_id:
                source_id = str(uuid.uuid4())

            cursor.execute("""
                INSERT INTO quarantine_items (
                    user_id, source_type, source_id, url, title, content_preview,
                    threat_level, threat_category, threat_details, status
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                user_id, source_type, source_id, url, title, content_preview,
                threat_level, threat_category, json.dumps(threat_details or {}), status
            ))

            item_id = cursor.fetchone()['id']
            conn.commit()
            return str(item_id)
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            conn.close()

    def get_quarantine_items(
        self,
        user_id: str,
        status: Optional[str] = None,
        threat_level: Optional[str] = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get quarantine items for a user with optional filtering"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            query = """
                SELECT id, user_id, source_type, source_id, url, title, content_preview,
                       threat_level, threat_category, threat_details, status,
                       reviewed_at, reviewer_notes, created_at
                FROM quarantine_items
                WHERE user_id = %s
            """
            params = [user_id]

            if status:
                query += " AND status = %s"
                params.append(status)

            if threat_level:
                query += " AND threat_level = %s"
                params.append(threat_level)

            query += " ORDER BY created_at DESC LIMIT %s OFFSET %s"
            params.extend([limit, offset])

            cursor.execute(query, params)
            items = cursor.fetchall()

            # Convert to list of dicts and parse JSON fields
            result = []
            for item in items:
                item_dict = dict(item)
                # Parse threat_details JSONB
                if item_dict.get('threat_details') and isinstance(item_dict['threat_details'], str):
                    try:
                        item_dict['threat_details'] = json.loads(item_dict['threat_details'])
                    except:
                        item_dict['threat_details'] = {}
                result.append(item_dict)

            return result
        finally:
            cursor.close()
            conn.close()

    def get_quarantine_item(self, user_id: str, item_id: str) -> Optional[Dict]:
        """Get a specific quarantine item by ID"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            cursor.execute("""
                SELECT id, user_id, source_type, source_id, url, title, content_preview,
                       threat_level, threat_category, threat_details, status,
                       reviewed_at, reviewer_notes, created_at
                FROM quarantine_items
                WHERE id = %s AND user_id = %s
            """, (item_id, user_id))

            item = cursor.fetchone()
            if not item:
                return None

            item_dict = dict(item)
            # Parse threat_details JSONB
            if item_dict.get('threat_details') and isinstance(item_dict['threat_details'], str):
                try:
                    item_dict['threat_details'] = json.loads(item_dict['threat_details'])
                except:
                    item_dict['threat_details'] = {}

            return item_dict
        finally:
            cursor.close()
            conn.close()

    def update_quarantine_status(
        self,
        user_id: str,
        item_id: str,
        status: str,
        reviewer_notes: Optional[str] = None
    ) -> bool:
        """Update the status of a quarantine item"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            cursor.execute("""
                UPDATE quarantine_items
                SET status = %s, reviewer_notes = %s, reviewed_at = NOW()
                WHERE id = %s AND user_id = %s
            """, (status, reviewer_notes, item_id, user_id))

            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            conn.close()

    def delete_quarantine_item(self, user_id: str, item_id: str) -> bool:
        """Delete a quarantine item (hard delete)"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            cursor.execute("""
                DELETE FROM quarantine_items
                WHERE id = %s AND user_id = %s
            """, (item_id, user_id))

            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            conn.close()

    def get_quarantine_summary(self, user_id: str) -> Dict:
        """Get summary statistics for a user's quarantine items"""
        start_time = time.time()
        conn = None
        cursor = None
        try:
            # Import database logger if available
            try:
                from database_logger import DatabaseLogger
                DB_LOGGER_AVAILABLE = True
            except ImportError:
                DB_LOGGER_AVAILABLE = False
                DatabaseLogger = None
            
            conn = self.get_db()
            cursor = conn.cursor()
            self.set_user_context(cursor, user_id)

            # Get counts by status
            cursor.execute("""
                SELECT status, COUNT(*) as count
                FROM quarantine_items
                WHERE user_id = %s
                GROUP BY status
            """, (user_id,))
            status_counts = {row['status']: row['count'] for row in cursor.fetchall()}

            # Get counts by threat_level
            cursor.execute("""
                SELECT threat_level, COUNT(*) as count
                FROM quarantine_items
                WHERE user_id = %s
                GROUP BY threat_level
            """, (user_id,))
            threat_counts = {row['threat_level']: row['count'] for row in cursor.fetchall()}

            # Get total count
            cursor.execute("""
                SELECT COUNT(*) as total
                FROM quarantine_items
                WHERE user_id = %s
            """, (user_id,))
            total = cursor.fetchone()['total']

            # Get items needing review
            cursor.execute("""
                SELECT COUNT(*) as count
                FROM quarantine_items
                WHERE user_id = %s AND status = 'pending_review'
            """, (user_id,))
            pending_review = cursor.fetchone()['count']

            return {
                'total': total,
                'pending_review': pending_review,
                'status_counts': status_counts,
                'threat_level_counts': threat_counts
            }
        except Exception as e:
            try:
                duration_ms = (time.time() - start_time) * 1000
            except (NameError, UnboundLocalError):
                duration_ms = 0
            
            # Log error with database logger if available
            if DB_LOGGER_AVAILABLE and DatabaseLogger:
                try:
                    error_category = DatabaseLogger.categorize_error(e)
                    DatabaseLogger.log_error(
                        "get_quarantine_summary",
                        str(e),
                        {
                            "operation": "get_quarantine_summary",
                            "user_id": user_id[:8] + "..." if user_id else None,
                            "duration_ms": duration_ms,
                            **error_category
                        },
                        e
                    )
                except Exception:
                    pass  # Don't fail if logging fails
            
            raise
        finally:
            if cursor:
                cursor.close()
            if conn:
                conn.close()
