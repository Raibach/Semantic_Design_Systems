"""
Projects API - PostgreSQL service for project management
Handles user projects with offline support
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


class ProjectsAPI:
    """PostgreSQL service for project management"""

    def __init__(self, database_url: str):
        self.database_url = database_url
        # Initialize connection pool manager
        self.pool_manager = DatabasePoolManager.get_instance(database_url)
        # Ensure "Archived Unassigned Chats" exists for all users on startup
        # This is called once when the API is initialized
        # Note: We'll ensure it exists per-user when needed, not on init

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
            # Sometimes Railway DATABASE_URL has invalid port values
            netloc = parsed.netloc
            if ':' in netloc:
                # Split netloc into auth and host:port
                netloc_parts = netloc.split('@')
                if len(netloc_parts) == 2:
                    auth, host_part = netloc_parts
                    if ':' in host_part:
                        host, port_str = host_part.rsplit(':', 1)
                        # Try to validate port is a number
                        try:
                            port_num = int(port_str)
                            if port_num < 1 or port_num > 65535:
                                # Invalid port number, remove it
                                netloc = f"{auth}@{host}"
                                # Rebuild URL without port
                                self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                                if parsed.query:
                                    self.database_url += f"?{parsed.query}"
                                parsed = urlparse(self.database_url)
                        except (ValueError, TypeError):
                            # Port is not a valid integer (e.g., "airport" or other text)
                            # Remove port and use default
                            netloc = f"{auth}@{host}"
                            # Rebuild URL without port
                            self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                self.database_url += f"?{parsed.query}"
                            parsed = urlparse(self.database_url)
                else:
                    # No auth, just host:port
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
                            # Invalid port, remove it
                            netloc = host
                            self.database_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                            if parsed.query:
                                self.database_url += f"?{parsed.query}"
                            parsed = urlparse(self.database_url)
            
            # Ensure sslmode is in the URL if not present
            query_params = parse_qs(parsed.query)
            
            # Build clean connection string
            # For private Railway URLs (railway.internal), use sslmode=prefer (not require)
            # For public URLs, use sslmode=require
            is_private_url = 'railway.internal' in self.database_url.lower()
            
            if 'sslmode' not in query_params:
                # Add sslmode based on URL type
                separator = '&' if parsed.query else '?'
                if is_private_url:
                    # Private Railway network - prefer SSL but don't require it
                    conn_string = f"{self.database_url}{separator}sslmode=prefer"
                else:
                    # Public URL - require SSL
                    conn_string = f"{self.database_url}{separator}sslmode=require"
            else:
                conn_string = self.database_url
            
            # Use the connection string directly - psycopg2 handles URL parsing
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
            # Database connection errors (network, authentication, etc.)
            error_msg = str(e).lower()
            if 'could not connect' in error_msg or 'connection refused' in error_msg or 'timeout' in error_msg:
                raise ConnectionError("Unable to connect to database. You may be offline or the database server is unavailable.") from e
            elif 'authentication failed' in error_msg or 'password' in error_msg:
                raise ConnectionError("Database authentication failed. Please check your connection settings.") from e
            else:
                raise ConnectionError(f"Database connection error: {str(e)}") from e
        except Exception as e:
            # Check for port-related errors
            error_msg = str(e).lower()
            if 'port' in error_msg and ('invalid' in error_msg or 'integer' in error_msg):
                # Port parsing error - try connecting without port
                print(f"⚠️ Database port error detected, attempting connection without port: {e}")
                try:
                    # Rebuild URL without port
                    parsed = urlparse(self.database_url)
                    netloc_parts = parsed.netloc.split('@')
                    if len(netloc_parts) == 2:
                        auth, host_with_port = netloc_parts
                        host = host_with_port.split(':')[0]  # Remove port
                        netloc = f"{auth}@{host}"
                    else:
                        host = parsed.netloc.split(':')[0]
                        netloc = host
                    # Rebuild URL without port (use default 5432)
                    clean_url = f"{parsed.scheme}://{netloc}{parsed.path}"
                    if parsed.query:
                        clean_url += f"?{parsed.query}"
                    elif 'sslmode' not in parse_qs(parsed.query):
                        clean_url += "?sslmode=require"
                    
                    # Try again with clean URL
                    return psycopg2.connect(
                        clean_url,
                        cursor_factory=RealDictCursor,
                        connect_timeout=5
                    )
                except Exception as retry_error:
                    print(f"❌ Retry with clean URL also failed: {retry_error}")
                    raise ConnectionError(f"Database connection error: {str(e)}") from e
            
            # Other errors
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
    # PROJECTS
    # ============================================

    def get_all_projects(
        self,
        user_id: str,
        include_archived: bool = False
    ) -> List[Dict]:
        """Get all projects for a user"""
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

            query = """
                SELECT id, user_id, name, description, is_archived,
                       created_at, updated_at
                FROM projects
                WHERE user_id = %s
            """
            params = [user_id]

            if not include_archived:
                query += " AND is_archived = FALSE"

            query += " ORDER BY updated_at DESC"

            cursor.execute(query, params)
            projects = cursor.fetchall()

            # Convert to list of dicts
            result = []
            for proj in projects:
                result.append(dict(proj))

            return result
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
                        "get_all_projects",
                        str(e),
                        {
                            "operation": "get_all_projects",
                            "user_id": user_id[:8] + "..." if user_id else None,
                            "include_archived": include_archived,
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

    def get_project(self, project_id: str, user_id: str) -> Optional[Dict]:
        """Get a specific project by ID"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            cursor.execute("""
                SELECT id, user_id, name, description, is_archived,
                       created_at, updated_at
                FROM projects
                WHERE id = %s AND user_id = %s
            """, (project_id, user_id))

            proj = cursor.fetchone()
            if not proj:
                return None

            return dict(proj)
        finally:
            cursor.close()
            conn.close()

    def create_project(
        self,
        user_id: str,
        name: str,
        description: Optional[str] = None
    ) -> str:
        """
        Create a new project - Top-level container for user assets
        
        Architecture:
        - Each user has their own projects (user-scoped)
        - Projects are the top-most level container for:
          * Chats (conversations)
          * Attachments (files, documents)
          * Memories (saved content for Milvus semantic search)
        - Projects are the top-level container for Milvus collections
        - All assets are organized under projects and tied to user_id
        """
        print("=" * 60)
        print("📝 [ProjectsAPI] create_project called")
        print(f"   User ID: {user_id[:8]}...")
        print(f"   Project Name: {name}")
        print(f"   Description: {description[:50] if description else None}...")
        print("=" * 60)
        
        conn = None
        cursor = None
        try:
            print("📝 [ProjectsAPI] Getting database connection...")
            conn = self.get_db()
            cursor = conn.cursor()
            print("📝 [ProjectsAPI] Setting user context...")
            self.set_user_context(cursor, user_id)

            # Special handling for "Archived Unassigned Chats" - prevent duplicates
            # NOTE: "Default Project" should NOT be created - only "Archived Unassigned Chats" is allowed
            if name == "Archived Unassigned Chats":
                import traceback
                print("=" * 80)
                print("🚨🚨🚨 DUPLICATE PREVENTION CHECK 🚨🚨🚨")
                print(f"🚨 [ProjectsAPI] Attempting to create '{name}'")
                print(f"🚨 [ProjectsAPI] User ID: {user_id}")
                print(f"🚨 [ProjectsAPI] Timestamp: {datetime.now().isoformat()}")
                print(f"🚨 [ProjectsAPI] Call stack:")
                for line in traceback.format_stack():
                    print(f"   {line.strip()}")
                print("=" * 80)
                
                # Use SELECT FOR UPDATE to lock the row and prevent race conditions
                print(f"📝 [ProjectsAPI] Checking for existing '{name}' project (with lock)...")
                cursor.execute("""
                    SELECT id, created_at, is_archived FROM projects 
                    WHERE user_id = %s 
                    AND name = %s
                    AND (is_archived IS NULL OR is_archived = FALSE)
                    ORDER BY created_at ASC
                    FOR UPDATE
                """, (user_id, name))
                existing_projects = cursor.fetchall()
                
                if existing_projects:
                    existing = existing_projects[0]
                    existing_id = str(existing['id'])
                    print(f"✅ [ProjectsAPI] Found {len(existing_projects)} existing '{name}' project(s)")
                    print(f"✅ [ProjectsAPI] Returning existing project: {existing_id}")
                    print(f"✅ [ProjectsAPI] Created at: {existing['created_at']}")
                    
                    if len(existing_projects) > 1:
                        print(f"🚨🚨🚨 WARNING: {len(existing_projects)} active '{name}' projects exist!")
                        print(f"🚨 This should have been prevented! All IDs:")
                        for proj in existing_projects:
                            print(f"   - {proj['id']} (created: {proj['created_at']})")
                    
                    print("=" * 80)
                    return existing_id
                else:
                    print(f"⚠️ [ProjectsAPI] No existing '{name}' found - will create new one")
                    print(f"⚠️ [ProjectsAPI] Unique constraint should prevent duplicates at database level")
                    print("=" * 80)

            print("📝 [ProjectsAPI] Executing INSERT INTO projects...")
            
            # Log if this is "Archived Unassigned Chats"
            if name == "Archived Unassigned Chats":
                import traceback
                print("=" * 80)
                print("🚨🚨🚨 CREATING NEW 'Archived Unassigned Chats' PROJECT 🚨🚨🚨")
                print(f"🚨 [ProjectsAPI] This should NOT happen if duplicate check worked!")
                print(f"🚨 [ProjectsAPI] User ID: {user_id}")
                print(f"🚨 [ProjectsAPI] Timestamp: {datetime.now().isoformat()}")
                print(f"🚨 [ProjectsAPI] Call stack:")
                for line in traceback.format_stack():
                    print(f"   {line.strip()}")
                print("=" * 80)
            
            try:
                cursor.execute("""
                    INSERT INTO projects (user_id, name, description)
                    VALUES (%s, %s, %s)
                    RETURNING id
                """, (user_id, name, description or ""))

                result = cursor.fetchone()
                project_id = str(result['id'])
                print(f"📝 [ProjectsAPI] Project ID generated: {project_id}")
                
                if name == "Archived Unassigned Chats":
                    print(f"🚨🚨🚨 NEW 'Archived Unassigned Chats' CREATED: {project_id} 🚨🚨🚨")
                    print("=" * 80)
            except Exception as insert_error:
                # Check if it's a unique constraint violation
                error_msg = str(insert_error).lower()
                constraint_names = ['idx_unique_unassigned_chats']
                is_constraint_violation = ('unique' in error_msg or 'duplicate' in error_msg or 
                                         any(constraint in error_msg for constraint in constraint_names))
                
                if is_constraint_violation:
                    print(f"🚨🚨🚨 UNIQUE CONSTRAINT VIOLATION 🚨🚨🚨")
                    print(f"🚨 [ProjectsAPI] Duplicate '{name}' prevented by database constraint!")
                    print(f"🚨 [ProjectsAPI] This means another process created it between our check and insert")
                    
                    # CRITICAL: Rollback the transaction first - PostgreSQL aborts transactions on constraint violations
                    # We must rollback before we can execute any more queries
                    print(f"📝 [ProjectsAPI] Rolling back transaction due to constraint violation...")
                    conn.rollback()
                    print(f"✅ [ProjectsAPI] Transaction rolled back, re-checking for existing project...")
                    
                    # Re-check for existing project (race condition occurred) - this is now a fresh transaction
                    cursor.execute("""
                        SELECT id FROM projects 
                        WHERE user_id = %s 
                        AND name = %s
                        AND (is_archived IS NULL OR is_archived = FALSE)
                        ORDER BY created_at ASC
                        LIMIT 1
                    """, (user_id, name))
                    existing = cursor.fetchone()
                    if existing:
                        existing_id = str(existing['id'])
                        print(f"✅ [ProjectsAPI] Found existing project created by another process: {existing_id}")
                        print(f"✅ [ProjectsAPI] Returning existing project instead")
                        conn.commit()  # Commit the read transaction
                        return existing_id
                    else:
                        # This shouldn't happen, but handle it
                        print(f"❌ [ProjectsAPI] Constraint violation but no existing project found - this is unexpected")
                        conn.rollback()  # Rollback the read transaction
                        raise insert_error
                else:
                    # Some other error - rollback and re-raise it
                    print(f"📝 [ProjectsAPI] Non-constraint error, rolling back transaction...")
                    conn.rollback()
                    raise insert_error
            
            print("📝 [ProjectsAPI] Committing transaction...")
            conn.commit()
            print(f"✅ [ProjectsAPI] Project created successfully: {project_id}")
            print(f"📝 [ProjectsAPI] Project structure:")
            print(f"   - User ID: {user_id[:8]}... (user-scoped)")
            print(f"   - Project ID: {project_id}")
            print(f"   - Contains: chats, attachments, memories")
            print(f"   - Top-level container for Milvus collections")
            print("=" * 60)
            
            return project_id
        except Exception as e:
            print(f"❌ [ProjectsAPI] Error creating project: {str(e)}")
            import traceback
            print(f"❌ [ProjectsAPI] Traceback:\n{traceback.format_exc()}")
            if conn:
                conn.rollback()
                print("📝 [ProjectsAPI] Transaction rolled back")
            raise e
        finally:
            if cursor:
                cursor.close()
                print("📝 [ProjectsAPI] Cursor closed")
            if conn:
                conn.close()
                print("📝 [ProjectsAPI] Connection closed")

    def update_project(
        self,
        project_id: str,
        user_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        is_archived: Optional[bool] = None
    ) -> bool:
        """Update a project"""
        conn = self.get_db()
        cursor = conn.cursor()
        self.set_user_context(cursor, user_id)

        try:
            updates = []
            params = []

            if name is not None:
                updates.append("name = %s")
                params.append(name)

            if description is not None:
                updates.append("description = %s")
                params.append(description)

            if is_archived is not None:
                updates.append("is_archived = %s")
                params.append(is_archived)

            if not updates:
                return False

            params.extend([project_id, user_id])
            cursor.execute(f"""
                UPDATE projects
                SET {', '.join(updates)}
                WHERE id = %s AND user_id = %s
            """, params)

            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            conn.rollback()
            raise e
        finally:
            cursor.close()
            conn.close()

    def delete_project(self, project_id: str, user_id: str) -> bool:
        """Delete a project (soft delete by archiving)
        CRITICAL: "Archived Unassigned Chats" CANNOT be deleted - it's required for the system"""
        import traceback
        print("=" * 80)
        print("🗑️🗑️🗑️ PROJECT DELETION REQUEST 🗑️🗑️🗑️")
        print(f"🗑️ [ProjectsAPI] User ID: {user_id}")
        print(f"🗑️ [ProjectsAPI] Project ID: {project_id}")
        print(f"🗑️ [ProjectsAPI] Timestamp: {datetime.now().isoformat()}")
        print(f"🗑️ [ProjectsAPI] Call stack:")
        for line in traceback.format_stack():
            print(f"   {line.strip()}")
        
        # Get project details before deletion
        conn = None
        cursor = None
        try:
            conn = self.get_db()
            cursor = conn.cursor()
            self.set_user_context(cursor, user_id)
            
            cursor.execute("""
                SELECT name, created_at, is_archived,
                       (SELECT COUNT(*) FROM conversations WHERE project_id = projects.id) as conv_count
                FROM projects 
                WHERE id = %s AND user_id = %s
            """, (project_id, user_id))
            
            project_info = cursor.fetchone()
            if project_info:
                project_name = project_info['name']
                print(f"🗑️ [ProjectsAPI] Project Name: {project_name}")
                print(f"🗑️ [ProjectsAPI] Created: {project_info['created_at']}")
                print(f"🗑️ [ProjectsAPI] Currently Archived: {project_info['is_archived']}")
                print(f"🗑️ [ProjectsAPI] Conversations in project: {project_info['conv_count']}")
                
                # CRITICAL: Prevent deletion of required system projects
                if project_name == 'Archived Unassigned Chats':
                    print("=" * 80)
                    print("🚨🚨🚨 DELETION BLOCKED 🚨🚨🚨")
                    print("🚨 [ProjectsAPI] 'Archived Unassigned Chats' CANNOT be deleted!")
                    print("🚨 [ProjectsAPI] This is a REQUIRED system project that holds all unassigned chats")
                    print("🚨 [ProjectsAPI] The system MUST have this project to function properly")
                    print("🚨 [ProjectsAPI] Deletion request REJECTED")
                    print("=" * 80)
                    cursor.close()
                    conn.close()
                    return False  # Block deletion
                
                # NOTE: "Default Project" can be deleted - it's not a required system project
                # Only "Archived Unassigned Chats" is protected
            else:
                print(f"⚠️ [ProjectsAPI] Project not found or access denied")
            
            cursor.close()
            conn.close()
        except Exception as e:
            print(f"⚠️ [ProjectsAPI] Error getting project info: {e}")
            if cursor:
                cursor.close()
            if conn:
                conn.close()
        
        print("=" * 80)
        result = self.update_project(project_id, user_id, is_archived=True)
        
        if result:
            print(f"✅ [ProjectsAPI] Project successfully archived/deleted: {project_id}")
        else:
            print(f"❌ [ProjectsAPI] Failed to delete project: {project_id}")
        print("=" * 80)
        
        return result

    def archive_project(self, project_id: str, user_id: str, archive: bool = True) -> bool:
        """Archive or unarchive a project"""
        return self.update_project(project_id, user_id, is_archived=archive)
    
    def get_unassigned_chats_project(self, user_id: str) -> Optional[str]:
        """
        Get "Archived Unassigned Chats" project for a user if it exists.
        Does NOT create projects - only returns existing project ID.
        Returns the project ID if found, None otherwise.
        """
        conn = None
        cursor = None
        try:
            conn = self.get_db()
            cursor = conn.cursor()
            self.set_user_context(cursor, user_id)
            
            # Check for existing active project
            cursor.execute("""
                SELECT id FROM projects 
                WHERE user_id = %s 
                AND name = 'Archived Unassigned Chats'
                AND (is_archived IS NULL OR is_archived = FALSE)
                ORDER BY created_at ASC
                LIMIT 1
            """, (user_id,))
            
            existing = cursor.fetchone()
            if existing:
                project_id = str(existing['id'])
                cursor.close()
                conn.close()
                return project_id
            
            # Check for archived project - unarchive it (but don't create new ones)
            cursor.execute("""
                SELECT id FROM projects 
                WHERE user_id = %s 
                AND name = 'Archived Unassigned Chats'
                AND is_archived = TRUE
                ORDER BY created_at ASC
                LIMIT 1
            """, (user_id,))
            
            archived = cursor.fetchone()
            if archived:
                project_id = str(archived['id'])
                print(f"⚠️ [ProjectsAPI] Found archived 'Archived Unassigned Chats', unarchiving: {project_id}")
                cursor.execute("UPDATE projects SET is_archived = FALSE WHERE id = %s", (project_id,))
                conn.commit()
                cursor.close()
                conn.close()
                return project_id
            
            # No project exists - return None (DO NOT CREATE)
            cursor.close()
            conn.close()
            return None
            
        except Exception as e:
            print(f"❌ [ProjectsAPI] Error getting 'Archived Unassigned Chats' project: {e}")
            import traceback
            traceback.print_exc()
            if cursor:
                cursor.close()
            if conn:
                conn.close()
            raise e

