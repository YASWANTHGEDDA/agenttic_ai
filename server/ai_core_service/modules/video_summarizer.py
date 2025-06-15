# ai_core_service/modules/video_summarizer.py
import os
import subprocess
import re
import sys
import requests
import json
import logging

# --- Configuration ---
# Set up a logger for this module
logger = logging.getLogger(__name__)

# --- Dependency Checks ---
# We assume dependencies are installed via requirements.txt in a real project.
# These checks are for clarity and debugging.
try:
    from transformers import pipeline
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError:
    TRANSFORMERS_AVAILABLE = False
    logger.warning("Transformers/PyTorch not found. HuggingFace STT will not be available.")

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False
    logger.warning("openai-whisper not found. Local Whisper STT will not be available.")

# --- Helper Functions ---

def sanitize_filename(filename: str) -> str:
    """Sanitizes a filename by removing invalid characters and replacing spaces."""
    sanitized = re.sub(r'[^\w\s.-]', '', filename).strip()
    return re.sub(r'\s+', '_', sanitized)

def extract_audio(video_file: str, output_path: str) -> str | None:
    """Extracts audio from a video file using ffmpeg."""
    logger.info(f"Extracting audio from: {video_file}")
    os.makedirs(output_path, exist_ok=True)
    base_name = os.path.splitext(os.path.basename(video_file))[0]
    audio_file = os.path.join(output_path, f"{sanitize_filename(base_name)}.mp3")
    
    command = [
        "ffmpeg", "-y", # Overwrite output file if it exists
        "-i", video_file,
        "-vn",          # No video
        "-acodec", "libmp3lame",
        "-ab", "192k",  # Audio bitrate
        audio_file
    ]
    
    try:
        process = subprocess.run(
            command, check=True, capture_output=True, text=True
        )
        logger.info(f"Successfully extracted audio to {audio_file}")
        return audio_file
    except FileNotFoundError:
        logger.error("ffmpeg not found. Please ensure ffmpeg is installed and in your system's PATH.")
        raise
    except subprocess.CalledProcessError as e:
        logger.error(f"Error extracting audio from {video_file}: {e.stderr}")
        return None

def transcribe_audio_hf(audio_file: str, model_name: str = "openai/whisper-large-v3") -> str | None:
    """Transcribes audio using a HuggingFace Transformers pipeline."""
    if not TRANSFORMERS_AVAILABLE:
        logger.error("Cannot transcribe with HuggingFace: transformers library is not installed.")
        return None
        
    logger.info(f"Transcribing audio with HuggingFace model: {model_name}")
    try:
        # Use GPU if available
        device = "cuda:0" if torch.cuda.is_available() else "cpu"
        logger.info(f"Using device: {device}")
        
        pipe = pipeline(
            "automatic-speech-recognition",
            model=model_name,
            chunk_length_s=30, # Process audio in 30-second chunks
            device=device,
        )
        
        # The pipeline handles long audio files automatically with this setup
        result = pipe(audio_file, return_timestamps=False)
        transcript = result["text"]
        logger.info(f"Successfully transcribed audio file: {os.path.basename(audio_file)}")
        return transcript
    except Exception as e:
        logger.error(f"Error during HuggingFace transcription: {e}", exc_info=True)
        return None

def summarize_transcript_ollama(transcript: str, ollama_url: str, model: str) -> str | None:
    """Summarizes a transcript using a specified Ollama model."""
    logger.info(f"Sending transcript to Ollama model '{model}' at {ollama_url} for summarization...")
    
    prompt = (
        "You are a highly skilled analyst. Your task is to provide a detailed, structured summary "
        "of the following transcript. Identify key topics, strategic points, and important terminologies. "
        "Format the output clearly with headings and bullet points.\n\n"
        f"TRANSCRIPT:\n---\n{transcript}\n---\n\n"
        "DETAILED SUMMARY:"
    )
    
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False
    }
    
    try:
        response = requests.post(f"{ollama_url}/api/generate", json=payload, timeout=600) # 10 min timeout
        response.raise_for_status()
        response_json = response.json()
        summary = response_json.get("response")
        if summary:
            logger.info("Successfully received summary from Ollama.")
            return summary.strip()
        else:
            logger.error(f"Ollama response did not contain a 'response' field. Full response: {response_json}")
            return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error communicating with Ollama: {e}")
        return None
    except (KeyError, json.JSONDecodeError) as e:
        logger.error(f"Error parsing Ollama response: {e}")
        return None

# --- Main Orchestration Function ---

def process_video_for_summary(
    video_path: str,
    output_dir: str,
    ollama_url: str = "http://localhost:11434",
    ollama_model: str = "llama3",
    stt_model: str = "openai/whisper-large-v3"
) -> dict | None:
    """
    Full pipeline to process a video: extract audio, transcribe, and summarize.
    
    Args:
        video_path (str): Path to the input video file.
        output_dir (str): Directory to save all generated files (audio, txt, md).
        ollama_url (str): Base URL for the Ollama service.
        ollama_model (str): The name of the Ollama model to use for summarization.
        stt_model (str): The name of the HuggingFace model for transcription.

    Returns:
        dict: A dictionary containing paths to the output files, or None on failure.
    """
    logger.info(f"--- Starting video processing pipeline for: {os.path.basename(video_path)} ---")
    base_name = sanitize_filename(os.path.splitext(os.path.basename(video_path))[0])
    
    # Define output paths
    audio_output_dir = os.path.join(output_dir, "audio")
    text_output_dir = os.path.join(output_dir, "transcripts")
    os.makedirs(audio_output_dir, exist_ok=True)
    os.makedirs(text_output_dir, exist_ok=True)
    
    transcript_file_path = os.path.join(text_output_dir, f"{base_name}_transcript.txt")
    summary_file_path = os.path.join(text_output_dir, f"{base_name}_summary.md")
    
    # Step 1: Extract Audio
    audio_file = extract_audio(video_path, audio_output_dir)
    if not audio_file:
        logger.error("Pipeline failed at audio extraction step.")
        return None
        
    # Step 2: Transcribe Audio
    # For now, we default to the reliable HuggingFace implementation.
    transcript = transcribe_audio_hf(audio_file, model_name=stt_model)
    if not transcript:
        logger.error("Pipeline failed at transcription step.")
        return None
        
    with open(transcript_file_path, "w", encoding="utf-8") as f:
        f.write(transcript)
    logger.info(f"Transcript saved to: {transcript_file_path}")

    # Step 3: Summarize Transcript
    summary = summarize_transcript_ollama(transcript, ollama_url, ollama_model)
    if not summary:
        logger.error("Pipeline failed at summarization step.")
        # We can still return the transcript even if summarization fails
        return {
            "transcript_path": transcript_file_path,
            "summary_path": None,
            "message": "Transcription successful, but summarization failed."
        }
        
    with open(summary_file_path, "w", encoding="utf-8") as f:
        f.write(summary)
    logger.info(f"Summary saved to: {summary_file_path}")
    
    logger.info(f"--- Video processing pipeline finished successfully for: {os.path.basename(video_path)} ---")
    
    return {
        "transcript_path": transcript_file_path,
        "summary_path": summary_file_path,
        "message": "Video processed successfully."
    }