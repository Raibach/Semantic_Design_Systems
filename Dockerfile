# Root-level Dockerfile for Northflank build (repo root context)
# App lives in nested dsmanager/ directory
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY dsmanager/backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY dsmanager/backend/ ./backend/

# Copy pre-built frontend (built locally and committed to repo)
COPY dsmanager/frontend/dist ./frontend/dist

# Copy pre-built Storybook documentation
COPY dsmanager/frontend/storybook-static ./frontend/storybook-static

# Expose port
EXPOSE 5001

# Set working directory to backend for correct imports
WORKDIR /app/backend

# Initialize database and start server
CMD python init_db.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001}
