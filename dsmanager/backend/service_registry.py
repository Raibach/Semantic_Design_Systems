"""
Service Registry - AI Capabilities Manifest

This module provides the AI with awareness of all available services,
tools, and integrations. It dynamically checks which services are
configured and builds a capabilities manifest for the AI's system prompt.

The AI reads this on "wake up" to know what it can do.
"""
import os
from typing import Dict, List, Any

def get_service_status() -> Dict[str, Any]:
    """
    Check all configured services and return their status.
    This is used to build the AI's capabilities manifest.
    """
    services = {
        "nvidia_llm": {
            "name": "NVIDIA NIM Cloud API",
            "type": "llm",
            "configured": bool(os.getenv("NVIDIA_API_KEY")),
            "model": "z-ai/glm-5.2",
            "capabilities": ["chat", "reasoning", "code_generation", "analysis"],
            "endpoint": "https://integrate.api.nvidia.com/v1"
        },
        "milvus_vector_db": {
            "name": "Milvus Vector Database (Zilliz Cloud)",
            "type": "vector_database",
            "configured": bool(os.getenv("MILVUS_URI") and os.getenv("MILVUS_TOKEN")),
            "mode": os.getenv("MILVUS_MODE", "lite"),
            "capabilities": ["semantic_search", "embedding_storage", "memory_retrieval", "context_lookup"],
            "collections": ["prompt_versions", "ai_actions", "prompt_sessions", "conversations", "memories", "files"]
        },
        "postgresql": {
            "name": "PostgreSQL Database",
            "type": "relational_database",
            "configured": bool(os.getenv("DATABASE_URL")),
            "capabilities": ["user_data", "session_storage", "prompt_history", "project_management"],
            "tables": ["users", "projects", "conversations", "prompt_sessions", "prompt_versions", "messages"]
        },
        "figma": {
            "name": "Figma Design API",
            "type": "design_tool",
            "configured": bool(os.getenv("FIGMA_TOKEN")),
            "capabilities": ["get_file", "get_components", "get_styles", "get_versions", "get_comments", "search_nodes"],
            "endpoints": [
                "/api/figma/file/{file_key}",
                "/api/figma/components/{file_key}",
                "/api/figma/versions/{file_key}",
                "/api/figma/comments/{file_key}",
                "/api/figma/node/{file_key}/{node_id}"
            ]
        },
        "sentry": {
            "name": "Sentry Error Tracking",
            "type": "monitoring",
            "configured": bool(os.getenv("VITE_SENTRY_DSN")),
            "capabilities": ["error_tracking", "performance_monitoring", "session_replay"]
        }
    }
    return services


def get_configured_services() -> List[Dict[str, Any]]:
    """Return only the services that are properly configured."""
    all_services = get_service_status()
    return [
        {**service, "key": key}
        for key, service in all_services.items()
        if service["configured"]
    ]


def get_capabilities_manifest() -> str:
    """
    Generate a human-readable capabilities manifest for the AI's system prompt.
    This tells the AI what tools and services it has access to.
    """
    services = get_service_status()

    lines = [
        "## YOUR AVAILABLE TOOLS AND SERVICES",
        "",
        "You have access to the following configured services:",
        ""
    ]

    configured_count = 0
    for key, service in services.items():
        status = "ACTIVE" if service["configured"] else "NOT CONFIGURED"
        icon = "✓" if service["configured"] else "✗"

        lines.append(f"### {icon} {service['name']} [{status}]")
        lines.append(f"Type: {service['type']}")

        if service["configured"]:
            configured_count += 1
            if "capabilities" in service:
                lines.append(f"Capabilities: {', '.join(service['capabilities'])}")
            if "endpoints" in service:
                lines.append(f"Endpoints: {', '.join(service['endpoints'][:3])}...")
            if "collections" in service:
                lines.append(f"Collections: {', '.join(service['collections'])}")
            if "tables" in service:
                lines.append(f"Tables: {', '.join(service['tables'])}")
        lines.append("")

    lines.append(f"---")
    lines.append(f"Total configured services: {configured_count}/{len(services)}")
    lines.append("")

    # Add usage instructions
    lines.append("## HOW TO USE THESE SERVICES")
    lines.append("")
    lines.append("- **Figma**: Call /api/figma/* endpoints to fetch design data, components, and styles")
    lines.append("- **Milvus**: Use for semantic search across user content, memory retrieval, and context lookup")
    lines.append("- **PostgreSQL**: Query user data, sessions, prompts, and project information")
    lines.append("- **NVIDIA LLM**: This is YOU - your reasoning and generation capabilities")
    lines.append("")

    return "\n".join(lines)


def get_api_endpoints() -> Dict[str, List[str]]:
    """Return all available API endpoints grouped by service."""
    return {
        "figma": [
            "GET /api/figma/status - Check Figma connection status",
            "GET /api/figma/file/{file_key} - Get full Figma file data",
            "GET /api/figma/components/{file_key} - Get components from file",
            "GET /api/figma/versions/{file_key} - Get version history",
            "GET /api/figma/comments/{file_key} - Get file comments",
            "GET /api/figma/node/{file_key}/{node_id} - Get specific node",
            "GET /api/figma/search/{file_key}?q={query} - Search nodes by name"
        ],
        "sessions": [
            "GET /api/prompt-sessions - List all sessions",
            "GET /api/prompt-sessions/{id} - Get session by ID",
            "POST /api/prompt-sessions - Create new session",
            "PUT /api/prompt-sessions/{id} - Update session",
            "DELETE /api/prompt-sessions/{id} - Delete session"
        ],
        "ai": [
            "GET /api/ai/assemble-console - AI assembles console view",
            "GET /api/ai/assemble-session/{id} - AI assembles session view",
            "POST /api/grace/chat - Chat with Grace AI"
        ],
        "memory": [
            "POST /api/memory/store - Store memory in Milvus",
            "POST /api/memory/search - Semantic search memories",
            "GET /api/memory/context/{session_id} - Get session context"
        ]
    }
