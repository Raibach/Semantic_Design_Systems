#!/usr/bin/env python3
"""
Simple mock server for testing AI integration.
Responds to /api/teacher/query endpoint with mock AI responses.
"""
from flask import Flask, request, jsonify
from flask_cors import CORS
import time
import random
import uuid

app = Flask(__name__)
CORS(app)

# Mock responses for testing
MOCK_RESPONSES = [
    "I understand you're working on prompt engineering. As an AI assistant, I can help you refine your prompts for better results.",
    "Based on your prompt in the left column, I suggest adding more specific context about the target audience and desired tone.",
    "I notice you're building a three-column interface. That's a great approach for prompt engineering - left for input, middle for chat, right for compiled output.",
    "For better AI responses, try being more specific about the format you want the output in. For example, specify if you want bullet points, paragraphs, or code.",
    "I can see you're testing the drag-and-drop functionality. This will be useful for moving prompt suggestions between columns.",
    "The session persistence feature will help you continue conversations where you left off, even after refreshing the page.",
    "Remember that good prompts are specific, provide context, and clearly state the desired output format.",
    "I'm here to help you with prompt engineering. Feel free to ask me questions about improving your prompts or using the interface features."
]

# Mock data storage
mock_conversations = {}
mock_projects = {}

def generate_uuid():
    return str(uuid.uuid4())

@app.route('/api/teacher/query', methods=['POST'])
def teacher_query():
    """Mock AI response endpoint"""
    data = request.json
    question = data.get('question', '')
    context = data.get('context', '')
    
    print(f"Received query: {question[:100]}...")
    if context:
        print(f"With context: {context[:100]}...")
    
    # Simulate processing time
    time.sleep(1 + random.random() * 2)
    
    # Select a mock response
    response_text = random.choice(MOCK_RESPONSES)
    
    # Add some context awareness
    if "prompt" in question.lower():
        response_text = "I see you're asking about prompts. " + response_text
    elif "drag" in question.lower() or "drop" in question.lower():
        response_text = "The drag-and-drop feature will allow you to move prompt suggestions between columns. " + response_text
    
    return jsonify({
        'content': response_text,
        'error': None
    })

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'ok',
        'timestamp': time.time()
    })

# Conversation endpoints
@app.route('/api/conversations', methods=['GET'])
def get_conversations():
    """Get all conversations"""
    project_id = request.args.get('project_id')
    conversations = list(mock_conversations.values())
    
    if project_id:
        conversations = [c for c in conversations if c.get('project_id') == project_id]
    
    return jsonify({
        'conversations': conversations
    })

@app.route('/api/conversations/<conversation_id>', methods=['GET'])
def get_conversation(conversation_id):
    """Get specific conversation"""
    if conversation_id in mock_conversations:
        return jsonify(mock_conversations[conversation_id])
    else:
        # Create a mock conversation if it doesn't exist
        mock_conversations[conversation_id] = {
            'id': conversation_id,
            'title': 'Test Conversation',
            'project_id': None,
            'created_at': time.time(),
            'updated_at': time.time(),
            'message_count': 0
        }
        return jsonify(mock_conversations[conversation_id])

@app.route('/api/conversations', methods=['POST'])
def create_conversation():
    """Create a new conversation"""
    data = request.json
    conversation_id = generate_uuid()
    
    mock_conversations[conversation_id] = {
        'id': conversation_id,
        'title': data.get('title', 'New Conversation'),
        'project_id': data.get('project_id'),
        'created_at': time.time(),
        'updated_at': time.time(),
        'message_count': 0
    }
    
    return jsonify({
        'id': conversation_id,
        'title': data.get('title', 'New Conversation'),
        'success': True
    })

@app.route('/api/conversations/<conversation_id>', methods=['PUT'])
def update_conversation(conversation_id):
    """Update a conversation"""
    data = request.json
    
    if conversation_id not in mock_conversations:
        mock_conversations[conversation_id] = {
            'id': conversation_id,
            'title': data.get('title', 'Updated Conversation'),
            'project_id': data.get('project_id'),
            'created_at': time.time(),
            'updated_at': time.time(),
            'message_count': data.get('message_count', 0)
        }
    else:
        if 'title' in data:
            mock_conversations[conversation_id]['title'] = data['title']
        if 'project_id' in data:
            mock_conversations[conversation_id]['project_id'] = data['project_id']
        if 'message_count' in data:
            mock_conversations[conversation_id]['message_count'] = data['message_count']
        mock_conversations[conversation_id]['updated_at'] = time.time()
    
    return jsonify(mock_conversations[conversation_id])

@app.route('/api/conversations/<conversation_id>', methods=['PATCH'])
def patch_conversation(conversation_id):
    """Patch a conversation (partial update)"""
    data = request.json
    
    if conversation_id not in mock_conversations:
        mock_conversations[conversation_id] = {
            'id': conversation_id,
            'title': 'Patched Conversation',
            'project_id': data.get('project_id'),
            'created_at': time.time(),
            'updated_at': time.time(),
            'message_count': 0
        }
    else:
        if 'project_id' in data:
            mock_conversations[conversation_id]['project_id'] = data['project_id']
        mock_conversations[conversation_id]['updated_at'] = time.time()
    
    return jsonify(mock_conversations[conversation_id])

@app.route('/api/conversations/<conversation_id>', methods=['DELETE'])
def delete_conversation(conversation_id):
    """Delete a conversation"""
    if conversation_id in mock_conversations:
        del mock_conversations[conversation_id]
    
    return jsonify({'success': True})

@app.route('/api/conversations/<conversation_id>/messages', methods=['POST'])
def add_message(conversation_id):
    """Add a message to a conversation"""
    data = request.json
    
    if conversation_id not in mock_conversations:
        mock_conversations[conversation_id] = {
            'id': conversation_id,
            'title': 'Conversation with Messages',
            'project_id': None,
            'created_at': time.time(),
            'updated_at': time.time(),
            'message_count': 1
        }
    else:
        mock_conversations[conversation_id]['message_count'] += 1
        mock_conversations[conversation_id]['updated_at'] = time.time()
    
    return jsonify({
        'success': True,
        'message': {
            'id': generate_uuid(),
            'role': data.get('role', 'user'),
            'content': data.get('content', ''),
            'created_at': time.time()
        }
    })

@app.route('/api/conversations/<conversation_id>/messages', methods=['GET'])
def get_messages(conversation_id):
    """Get messages for a conversation"""
    # Return empty messages array for now
    return jsonify({
        'messages': []
    })

# Project endpoints
@app.route('/api/projects', methods=['GET'])
def get_projects():
    """Get all projects"""
    projects = list(mock_projects.values())
    
    # Always include a default project
    if not any(p['name'] == 'Default Project' for p in projects):
        default_id = generate_uuid()
        mock_projects[default_id] = {
            'id': default_id,
            'name': 'Default Project',
            'created_at': time.time(),
            'updated_at': time.time()
        }
        projects.append(mock_projects[default_id])
    
    return jsonify({
        'projects': projects
    })

@app.route('/api/projects', methods=['POST'])
def create_project():
    """Create a new project"""
    data = request.json
    project_id = generate_uuid()
    
    mock_projects[project_id] = {
        'id': project_id,
        'name': data.get('name', 'New Project'),
        'created_at': time.time(),
        'updated_at': time.time()
    }
    
    return jsonify({
        'id': project_id,
        'name': data.get('name', 'New Project'),
        'success': True
    })

@app.route('/api/projects/<project_id>', methods=['PUT'])
def update_project(project_id):
    """Update a project"""
    data = request.json
    
    if project_id not in mock_projects:
        mock_projects[project_id] = {
            'id': project_id,
            'name': data.get('name', 'Updated Project'),
            'created_at': time.time(),
            'updated_at': time.time()
        }
    else:
        if 'name' in data:
            mock_projects[project_id]['name'] = data['name']
        mock_projects[project_id]['updated_at'] = time.time()
    
    return jsonify(mock_projects[project_id])

@app.route('/api/projects/<project_id>', methods=['DELETE'])
def delete_project(project_id):
    """Delete a project"""
    if project_id in mock_projects:
        del mock_projects[project_id]
    
    return jsonify({'success': True})

@app.route('/api/projects/cleanup-duplicates', methods=['POST'])
def cleanup_duplicate_projects():
    """Clean up duplicate projects"""
    return jsonify({
        'success': True,
        'message': 'Duplicate projects cleaned up'
    })

if __name__ == '__main__':
    print("Starting mock AI server on port 5001...")
    print("This server provides mock responses for testing the AI integration.")
    print("Endpoints available:")
    print("  POST /api/teacher/query - Mock AI responses")
    print("  GET  /api/health - Health check")
    print("  GET  /api/conversations - Get conversations")
    print("  POST /api/conversations - Create conversation")
    print("  PUT  /api/conversations/<id> - Update conversation")
    print("  PATCH /api/conversations/<id> - Patch conversation")
    print("  DELETE /api/conversations/<id> - Delete conversation")
    print("  POST /api/conversations/<id>/messages - Add message")
    print("  GET  /api/conversations/<id>/messages - Get messages")
    print("  GET  /api/projects - Get projects")
    print("  POST /api/projects - Create project")
    print("  PUT  /api/projects/<id> - Update project")
    print("  DELETE /api/projects/<id> - Delete project")
    print("  POST /api/projects/cleanup-duplicates - Cleanup duplicates")
    app.run(host='0.0.0.0', port=5001, debug=True)