"""
Shared API instances — imported by both main.py and routers.
This breaks the circular import chain: routers import api_core, main.py initializes api_core.
"""
import os
from typing import Optional

# API instances — initialized by main.py on startup
conversation_api = None
projects_api = None
memory_api = None
tag_extractor = None
prompt_sessions_api = None


def get_user_id_from_header(x_user_id: Optional[str] = None) -> str:
    """Get user ID from header or use default placeholder"""
    if x_user_id:
        return x_user_id
    return os.getenv("DEFAULT_USER_ID", "00000000-0000-0000-0000-000000000000")
