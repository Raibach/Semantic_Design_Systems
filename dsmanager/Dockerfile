# Single stage: Production image with Python backend + pre-built frontend
# Frontend is built locally and committed to repo to avoid Northflank cache issues
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements and install
COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy pre-built frontend (built locally and committed to repo)
COPY frontend/dist ./frontend/dist

# Copy pre-built Storybook documentation (built locally and committed to repo)
COPY frontend/storybook-static ./frontend/storybook-static

# Copy frontend source (A2UI component catalog required by backend at runtime)
COPY frontend/src ./frontend/src

# Expose port
EXPOSE 5001

# Set working directory to backend for correct imports
WORKDIR /app/backend

# Initialize database and start server
CMD python init_db.py && uvicorn main:app --host 0.0.0.0 --port ${PORT:-5001}
