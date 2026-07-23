from fastapi import APIRouter, File, Header, HTTPException, Query, UploadFile
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import os
import json
import sys
import traceback
from datetime import datetime

# Import global API instances from main.py

router = APIRouter()

# ============================================
# WHISPER TRANSCRIPTION ENDPOINT
# ============================================

# Whisper is optional — only used for the /api/transcribe endpoint.
# If whisper is not installed, the endpoint will return a 501 Not Implemented.

@router.post("/api/transcribe")
async def transcribe_audio(audio_file: UploadFile = File(...)):
    """
    Transcribe audio file using local Whisper model.
    Accepts WAV, MP3, WebM, and other audio formats supported by Whisper.
    """
    raise HTTPException(status_code=501, detail="Whisper not installed on this server")


# ============================================
