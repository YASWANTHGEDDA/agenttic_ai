# FusedChatbot/server/ai_core_service/config.py
import os
from dotenv import load_dotenv

# --- Path Definitions ---
# Path to the directory containing this config.py file (ai_core_service)
_AI_CORE_SERVICE_DIR_INTERNAL = os.path.dirname(os.path.abspath(__file__))

# Path to the 'server' directory (e.g., D:\agent\NewBot\server)
# This is the primary SERVER_DIR we'll use throughout.
SERVER_DIR = os.path.abspath(os.path.join(_AI_CORE_SERVICE_DIR_INTERNAL, '..'))

# Path to the project root (e.g., D:\agent\NewBot)
# This is useful for locating .env at the project root or top-level assets.
PROJECT_ROOT_DIR = os.path.abspath(os.path.join(SERVER_DIR, '..'))

# --- Load .env file ---
# Prioritize .env at the project root, then fallback to local ai_core_service directory
dotenv_path_project_root = os.path.join(PROJECT_ROOT_DIR, '.env')
dotenv_path_local = os.path.join(_AI_CORE_SERVICE_DIR_INTERNAL, '.env')

if os.path.exists(dotenv_path_project_root):
    load_dotenv(dotenv_path=dotenv_path_project_root)
    print(f"[config.py] Loaded .env from project root: {dotenv_path_project_root}")
elif os.path.exists(dotenv_path_local):
    load_dotenv(dotenv_path=dotenv_path_local)
    print(f"[config.py] Loaded .env from local ai_core_service dir: {dotenv_path_local}")
else:
    print(f"[config.py] No .env file found at project root ('{dotenv_path_project_root}') or local ('{dotenv_path_local}'). Relying on environment variables or defaults.")

# --- Service Wide Configuration ---
# DEFAULT_ASSETS_DIR: Absolute path where Python tools save their output files.
# Node.js will need to access this same location.
# For Node.js path.join(__dirname, '..', '..', 'python_tool_assets') to work from server/routes,
# this directory should be at ProjectRoot/python_tool_assets.
DEFAULT_ASSETS_DIR = os.path.join(PROJECT_ROOT_DIR, "python_tool_assets")

# FAISS_INDEX_DIR: Where FAISS vector stores are saved.
FAISS_INDEX_DIR = os.path.join(SERVER_DIR, "faiss_indices")

AI_CORE_SERVICE_PORT = int(os.getenv("AI_CORE_SERVICE_PORT", 5001))
DEFAULT_LLM_PROVIDER = os.getenv("DEFAULT_LLM_PROVIDER", "gemini") # Default for general tasks if not specified

# --- LLM Related Configurations ---
OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://127.0.0.1:11434/") # Default for Ollama server
DEFAULT_OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3") # Default Ollama model name

# Default models for different tasks if not specified in the request
GEMINI_DEFAULT_MODEL_ANALYSIS = os.getenv("GEMINI_DEFAULT_MODEL_ANALYSIS", "gemini-1.5-flash")
GROQ_DEFAULT_MODEL_ANALYSIS = os.getenv("GROQ_DEFAULT_MODEL_ANALYSIS", "llama3-8b-8192")
OLLAMA_DEFAULT_MODEL_ANALYSIS = os.getenv("OLLAMA_DEFAULT_MODEL_ANALYSIS", DEFAULT_OLLAMA_MODEL)

GEMINI_DEFAULT_MODEL_SUBQUERY = os.getenv("GEMINI_DEFAULT_MODEL_SUBQUERY", "gemini-1.5-flash")
GROQ_DEFAULT_MODEL_SUBQUERY = os.getenv("GROQ_DEFAULT_MODEL_SUBQUERY", "llama3-8b-8192")
OLLAMA_DEFAULT_MODEL_SUBQUERY = os.getenv("OLLAMA_DEFAULT_MODEL_SUBQUERY", DEFAULT_OLLAMA_MODEL)

GEMINI_DEFAULT_MODEL_SYNTHESIS = os.getenv("GEMINI_DEFAULT_MODEL_SYNTHESIS", "gemini-1.5-flash")
GROQ_DEFAULT_MODEL_SYNTHESIS = os.getenv("GROQ_DEFAULT_MODEL_SYNTHESIS", "llama3-8b-8192")
OLLAMA_DEFAULT_MODEL_SYNTHESIS = os.getenv("OLLAMA_DEFAULT_MODEL_SYNTHESIS", DEFAULT_OLLAMA_MODEL)


# --- RAG (Retrieval Augmented Generation) Configurations ---
DEFAULT_RAG_K = int(os.getenv("DEFAULT_RAG_K", 5)) # Default number of documents to retrieve for main query
DEFAULT_RAG_K_PER_SUBQUERY_CONFIG = int(os.getenv("DEFAULT_RAG_K_PER_SUBQUERY", 2)) # For sub-queries
MAX_RAG_CHUNKS_FOR_CONTEXT = int(os.getenv("MAX_RAG_CHUNKS_FOR_CONTEXT", 10)) # Max chunks to form context
MULTI_QUERY_COUNT_CONFIG = int(os.getenv("MULTI_QUERY_COUNT", 3)) # Number of sub-queries to generate

# --- Embedding Model Configuration ---
EMBEDDING_TYPE = os.getenv("EMBEDDING_TYPE", "sentence-transformer") # Ensure this matches faiss_handler.py
EMBEDDING_MODEL_NAME = os.getenv("EMBEDDING_MODEL_NAME", "all-MiniLM-L6-v2")
# EMBEDDING_DIMENSION = 384 # Often derived dynamically, but can be set if fixed

# --- FAISS Index Configuration ---
DEFAULT_INDEX_USER_ID = os.getenv("DEFAULT_INDEX_USER_ID", "shared_default_index") # For any shared/default index

# --- Document Processing Configuration ---
ANALYSIS_MAX_CONTEXT_LENGTH = int(os.getenv("ANALYSIS_MAX_CONTEXT_LENGTH", 30000)) # For document analysis tasks
CHUNK_SIZE = int(os.getenv("CHUNK_SIZE", 1000))  # Characters per chunk for RAG document splitting
CHUNK_OVERLAP = int(os.getenv("CHUNK_OVERLAP", 200)) # Character overlap between chunks

# --- External Tool Specific Paths (Optional, set via .env or defaults) ---
TESSERACT_CMD_PATH = os.getenv("TESSERACT_CMD_PATH", None) # e.g., r"C:\Program Files\Tesseract-OCR\tesseract.exe"
POPPLER_PATH_BIN = os.getenv("POPPLER_PATH_BIN", None) # e.g., r"C:\path\to\poppler-xxx\bin"
NOUGAT_CLI_PATH = os.getenv("NOUGAT_CLI_PATH", "nougat") # Assumes 'nougat' is in PATH if not absolute

# --- Academic Search API Keys (Optional, set via .env or defaults) ---
CORE_API_KEY_DEFAULT = os.getenv("CORE_API_KEY", None) # For CORE academic search

# --- Sanity Check Print (runs once when module is loaded) ---
print(f"--- Python AI Core Service Config (config.py) ---")
print(f"PROJECT_ROOT_DIR (derived): {PROJECT_ROOT_DIR}")
print(f"SERVER_DIR (derived): {SERVER_DIR}")
print(f"_AI_CORE_SERVICE_DIR_INTERNAL (derived): {_AI_CORE_SERVICE_DIR_INTERNAL}")
print(f"DEFAULT_ASSETS_DIR (for tool outputs): {DEFAULT_ASSETS_DIR}")
print(f"FAISS_INDEX_DIR: {FAISS_INDEX_DIR}")
print(f"AI_CORE_SERVICE_PORT: {AI_CORE_SERVICE_PORT}")
print(f"DEFAULT_LLM_PROVIDER: {DEFAULT_LLM_PROVIDER}")
print(f"OLLAMA_URL: {OLLAMA_URL}")
print(f"DEFAULT_OLLAMA_MODEL: {DEFAULT_OLLAMA_MODEL}")
print(f"EMBEDDING_TYPE: {EMBEDDING_TYPE}")
print(f"EMBEDDING_MODEL_NAME: {EMBEDDING_MODEL_NAME}")
print(f"CHUNK_SIZE: {CHUNK_SIZE}")
print(f"CHUNK_OVERLAP: {CHUNK_OVERLAP}")
print(f"-------------------------------------------------")