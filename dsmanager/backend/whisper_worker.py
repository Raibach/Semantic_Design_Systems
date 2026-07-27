#!/usr/bin/env python3
"""
Whisper Transcription Worker
Runs in a separate subprocess to isolate crashes from the main Flask server.
"""

import sys
import json
import os
import tempfile
import whisper
from pathlib import Path

def transcribe_audio_file(audio_file_path: str, model_name: str = "tiny") -> dict:
    """
    Transcribe audio file using Whisper.
    Returns dict with 'text' or 'error' key.
    
    NOTE: Model is loaded fresh each time to ensure clean state.
    The subprocess will exit after transcription, freeing memory.
    """
    model = None
    try:
        # Load model (will download on first use)
        # Using tiny model (75MB) to minimize memory usage
        print(f"Loading Whisper model: {model_name}", file=sys.stderr)
        model = whisper.load_model(model_name, download_root=None)
        print(f"Model loaded successfully", file=sys.stderr)
        
        # Verify file exists and has content
        if not os.path.exists(audio_file_path):
            return {"error": f"Audio file not found: {audio_file_path}"}
        
        file_size = os.path.getsize(audio_file_path)
        print(f"Audio file size: {file_size} bytes", file=sys.stderr)
        
        if file_size < 100:
            return {"error": f"Audio file too small ({file_size} bytes), likely corrupted"}
        
        # Transcribe
        print(f"Transcribing audio file: {audio_file_path}", file=sys.stderr)
        try:
            result = model.transcribe(
                audio_file_path,
                language="en",
                fp16=False,
                verbose=False,
                task="transcribe"
            )
        except Exception as transcribe_err:
            import traceback
            error_str = str(transcribe_err).lower()
            full_traceback = traceback.format_exc()
            
            # Check if it's an FFmpeg/audio format error
            if "ffmpeg" in error_str or "invalid data" in error_str or "ebml" in error_str or "error opening input" in error_str:
                error_msg = f"Audio format error: The recording may be corrupted or incomplete. Please try recording again.\n\nTechnical details: {str(transcribe_err)}"
                print(f"ERROR: {error_msg}", file=sys.stderr)
                print(f"Traceback: {full_traceback}", file=sys.stderr)
                return {"error": error_msg}
            
            # For other errors, return with full details
            error_msg = f"Whisper transcription error: {str(transcribe_err)}"
            print(f"ERROR: {error_msg}", file=sys.stderr)
            print(f"Traceback: {full_traceback}", file=sys.stderr)
            raise  # Re-raise to get proper exit code
        
        transcription = result.get("text", "").strip()
        print(f"Transcription complete: {len(transcription)} characters", file=sys.stderr)
        
        # Explicitly delete model to free memory before returning
        # This helps ensure memory is freed even if subprocess doesn't exit immediately
        if model is not None:
            del model
            import gc
            gc.collect()
            print(f"Model unloaded, memory freed", file=sys.stderr)
        
        return {"text": transcription}
        
    except Exception as e:
        import traceback
        error_msg = f"Whisper transcription error: {str(e)}"
        print(f"ERROR: {error_msg}", file=sys.stderr)
        print(f"Traceback: {traceback.format_exc()}", file=sys.stderr)
        
        # Clean up model on error too
        if model is not None:
            del model
            import gc
            gc.collect()
        
        return {"error": error_msg}

def main():
    """Main entry point for subprocess worker"""
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: whisper_worker.py <audio_file_path> [model_name]"}))
        sys.exit(1)
    
    audio_file_path = sys.argv[1]
    model_name = sys.argv[2] if len(sys.argv) > 2 else "tiny"
    
    if not os.path.exists(audio_file_path):
        print(json.dumps({"error": f"Audio file not found: {audio_file_path}"}))
        sys.exit(1)
    
    # Transcribe and output JSON result to stdout
    result = transcribe_audio_file(audio_file_path, model_name)
    print(json.dumps(result))
    
    # Exit with error code if transcription failed
    if "error" in result:
        sys.exit(1)
    else:
        sys.exit(0)

if __name__ == "__main__":
    main()

