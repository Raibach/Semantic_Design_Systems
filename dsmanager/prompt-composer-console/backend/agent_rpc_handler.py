"""
Agent RPC Handler - JSON-RPC 2.0 interface for AI agents
Routes agent intents directly to PostgreSQL via the backend API.

This handler enables agents to interact with the system through standardized
JSON-RPC method calls, completely bypassing localStorage.

Supported methods:
  - create_project: Create a new project with name and description
  - get_project: Retrieve a project by ID
  - list_projects: Get all projects for the user
"""

import json
import sys
import traceback
from typing import Any, Dict, Optional

# Try to import the projects API
try:
    from projects_api import ProjectsAPI
except ImportError:
    try:
        from projects_api import ProjectsAPI
    except ImportError:
        ProjectsAPI = None


class AgentRpcHandler:
    """Handles JSON-RPC 2.0 method calls from AI agents."""

    def __init__(self, projects_api: Optional[ProjectsAPI] = None):
        """
        Initialize the RPC handler.
        
        Args:
            projects_api: ProjectsAPI instance for database operations
        """
        self.projects_api = projects_api

    def handle_request(self, request_data: Dict[str, Any], user_id: str) -> Dict[str, Any]:
        """
        Process a JSON-RPC 2.0 request.
        
        Args:
            request_data: The JSON-RPC 2.0 request body
            user_id: The ID of the user making the request (from header)
        
        Returns:
            A JSON-RPC 2.0 response
        """
        try:
            # Validate JSON-RPC structure
            jsonrpc_version = request_data.get('jsonrpc')
            if jsonrpc_version != '2.0':
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32600,
                        'message': 'Invalid Request: jsonrpc must be "2.0"'
                    },
                    'id': request_data.get('id')
                }

            method = request_data.get('method')
            params = request_data.get('params', {})
            request_id = request_data.get('id')

            # Route to appropriate handler
            if method == 'create_project':
                return self._handle_create_project(params, user_id, request_id)
            elif method == 'get_project':
                return self._handle_get_project(params, user_id, request_id)
            elif method == 'list_projects':
                return self._handle_list_projects(params, user_id, request_id)
            else:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32601,
                        'message': f'Method not found: {method}'
                    },
                    'id': request_id
                }

        except Exception as e:
            print(f'❌ [AgentRpcHandler] Unexpected error: {str(e)}', file=sys.stderr)
            print(traceback.format_exc(), file=sys.stderr)
            return {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32603,
                    'message': f'Internal server error: {str(e)}'
                },
                'id': request_data.get('id')
            }

    def _handle_create_project(
        self, params: Dict[str, Any], user_id: str, request_id: Any
    ) -> Dict[str, Any]:
        """Handle create_project RPC call."""
        try:
            name = params.get('name', '').strip()
            description = params.get('description', '').strip() if params.get('description') else None

            # Validate required parameter
            if not name:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32602,
                        'message': "Invalid params: 'name' is required and cannot be empty."
                    },
                    'id': request_id
                }

            # Check if projects API is available
            if not self.projects_api:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32603,
                        'message': 'Database service not available'
                    },
                    'id': request_id
                }

            # Create project in database
            project_id = self.projects_api.create_project(
                user_id=user_id,
                name=name,
                description=description
            )

            # Fetch the created project to return full details
            project = self.projects_api.get_project(project_id, user_id)

            if not project:
                raise ValueError(f'Project {project_id} not found after creation')

            print(f'✅ [AgentRpcHandler] Project created via RPC: {project_id}')

            return {
                'jsonrpc': '2.0',
                'result': {
                    'success': True,
                    'project': {
                        'id': project['id'],
                        'name': project['name'],
                        'description': project.get('description'),
                        'created_at': str(project.get('created_at', ''))
                    }
                },
                'id': request_id
            }

        except ValueError as e:
            print(f'⚠️ [AgentRpcHandler] Validation error: {str(e)}', file=sys.stderr)
            return {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32602,
                    'message': f'Invalid params: {str(e)}'
                },
                'id': request_id
            }
        except Exception as e:
            print(f'❌ [AgentRpcHandler] Error creating project: {str(e)}', file=sys.stderr)
            print(traceback.format_exc(), file=sys.stderr)
            return {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32603,
                    'message': f'Database error: {str(e)}'
                },
                'id': request_id
            }

    def _handle_get_project(
        self, params: Dict[str, Any], user_id: str, request_id: Any
    ) -> Dict[str, Any]:
        """Handle get_project RPC call."""
        try:
            project_id = params.get('id', '').strip()

            if not project_id:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32602,
                        'message': "Invalid params: 'id' is required."
                    },
                    'id': request_id
                }

            if not self.projects_api:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32603,
                        'message': 'Database service not available'
                    },
                    'id': request_id
                }

            project = self.projects_api.get_project(project_id, user_id)

            if not project:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32000,
                        'message': f'Project not found: {project_id}'
                    },
                    'id': request_id
                }

            return {
                'jsonrpc': '2.0',
                'result': {
                    'project': {
                        'id': project['id'],
                        'name': project['name'],
                        'description': project.get('description'),
                        'created_at': str(project.get('created_at', ''))
                    }
                },
                'id': request_id
            }

        except Exception as e:
            print(f'❌ [AgentRpcHandler] Error fetching project: {str(e)}', file=sys.stderr)
            return {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32603,
                    'message': f'Database error: {str(e)}'
                },
                'id': request_id
            }

    def _handle_list_projects(
        self, params: Dict[str, Any], user_id: str, request_id: Any
    ) -> Dict[str, Any]:
        """Handle list_projects RPC call."""
        try:
            include_archived = params.get('include_archived', False)

            if not self.projects_api:
                return {
                    'jsonrpc': '2.0',
                    'error': {
                        'code': -32603,
                        'message': 'Database service not available'
                    },
                    'id': request_id
                }

            projects = self.projects_api.get_all_projects(user_id, include_archived=include_archived)

            return {
                'jsonrpc': '2.0',
                'result': {
                    'projects': [
                        {
                            'id': p['id'],
                            'name': p['name'],
                            'description': p.get('description'),
                            'created_at': str(p.get('created_at', ''))
                        }
                        for p in projects
                    ]
                },
                'id': request_id
            }

        except Exception as e:
            print(f'❌ [AgentRpcHandler] Error listing projects: {str(e)}', file=sys.stderr)
            return {
                'jsonrpc': '2.0',
                'error': {
                    'code': -32603,
                    'message': f'Database error: {str(e)}'
                },
                'id': request_id
            }
