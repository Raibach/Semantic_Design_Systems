"""
Debug API Endpoints

Provides endpoints to view logs, debug information, and system status.
"""

import os
from datetime import datetime, timedelta
from flask import Blueprint, jsonify, request
from debug_logger import debug_logger, ERROR_LOG, DEBUG_LOG, REQUEST_LOG, DATABASE_LOG
from pathlib import Path

debug_bp = Blueprint('debug', __name__)

@debug_bp.route('/api/debug/logs', methods=['GET'])
def get_logs():
    """Get recent logs"""
    level = request.args.get('level')  # DEBUG, INFO, WARNING, ERROR, CRITICAL
    limit = int(request.args.get('limit', 100))
    since_hours = int(request.args.get('since_hours', 24))
    
    since = datetime.now() - timedelta(hours=since_hours) if since_hours > 0 else None
    
    logs = debug_logger.get_logs(level=level, limit=limit, since=since)
    
    return jsonify({
        "logs": logs,
        "count": len(logs),
        "filters": {
            "level": level,
            "limit": limit,
            "since_hours": since_hours
        }
    })

@debug_bp.route('/api/debug/errors', methods=['GET'])
def get_errors():
    """Get recent errors"""
    limit = int(request.args.get('limit', 50))
    errors = debug_logger.get_recent_errors(limit=limit)
    
    return jsonify({
        "errors": errors,
        "count": len(errors)
    })

@debug_bp.route('/api/debug/status', methods=['GET'])
def get_status():
    """Get system status and debug information"""
    status = {
        "timestamp": datetime.now().isoformat(),
        "environment": {
            "database_url_set": bool(os.getenv('DATABASE_URL') or os.getenv('DATABASE_PUBLIC_URL')),
            "database_public_url_set": bool(os.getenv('DATABASE_PUBLIC_URL')),
            "api_keys_set": bool(os.getenv('GRACE_API_KEYS')),
        },
        "log_files": {
            "debug_log": {
                "path": str(DEBUG_LOG),
                "exists": DEBUG_LOG.exists(),
                "size_bytes": DEBUG_LOG.stat().st_size if DEBUG_LOG.exists() else 0
            },
            "error_log": {
                "path": str(ERROR_LOG),
                "exists": ERROR_LOG.exists(),
                "size_bytes": ERROR_LOG.stat().st_size if ERROR_LOG.exists() else 0
            },
            "request_log": {
                "path": str(REQUEST_LOG),
                "exists": REQUEST_LOG.exists(),
                "size_bytes": REQUEST_LOG.stat().st_size if REQUEST_LOG.exists() else 0
            },
            "database_log": {
                "path": str(DATABASE_LOG),
                "exists": DATABASE_LOG.exists(),
                "size_bytes": DATABASE_LOG.stat().st_size if DATABASE_LOG.exists() else 0
            }
        },
        "recent_errors_count": len(debug_logger.get_recent_errors(limit=10))
    }
    
    return jsonify(status)

@debug_bp.route('/api/debug/logs/file', methods=['GET'])
def get_log_file():
    """Get raw log file content"""
    log_type = request.args.get('type', 'error')  # error, debug, request, database
    
    log_files = {
        'error': ERROR_LOG,
        'debug': DEBUG_LOG,
        'request': REQUEST_LOG,
        'database': DATABASE_LOG
    }
    
    if log_type not in log_files:
        return jsonify({"error": f"Invalid log type: {log_type}"}), 400
    
    log_file = log_files[log_type]
    
    if not log_file.exists():
        return jsonify({"error": f"Log file not found: {log_file}"}), 404
    
    try:
        # Read last N lines
        lines = int(request.args.get('lines', 100))
        
        with open(log_file, 'r', encoding='utf-8') as f:
            all_lines = f.readlines()
            recent_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines
        
        return jsonify({
            "log_type": log_type,
            "log_file": str(log_file),
            "total_lines": len(all_lines),
            "returned_lines": len(recent_lines),
            "lines": [line.strip() for line in recent_lines]
        })
    except Exception as e:
        return jsonify({"error": f"Error reading log file: {str(e)}"}), 500

@debug_bp.route('/api/debug/test', methods=['POST'])
def test_logging():
    """Test logging system"""
    test_message = request.json.get('message', 'Test log message')
    level = request.json.get('level', 'INFO')
    
    log_method = getattr(debug_logger, level.lower(), debug_logger.info)
    log_method(test_message, context={"test": True})
    
    return jsonify({
        "success": True,
        "message": f"Logged {level} message: {test_message}"
    })

