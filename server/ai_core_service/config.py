# FusedChatbot/server/ai_core_service/config.py
import os

# --- Determine Base Directory (ai_core_service) ---
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(CURRENT_DIR, '..'))

# --- Embedding Model Configuration ---
EMBEDDING_TYPE = 'sentence-transformer'
EMBEDDING_MODEL_NAME_ST = os.getenv('SENTENCE_TRANSFORMER_MODEL', 'mixedbread-ai/mxbai-embed-large-v1')
EMBEDDING_MODEL_NAME = EMBEDDING_MODEL_NAME_ST

# --- FAISS Configuration ---
FAISS_INDEX_DIR = os.path.join(SERVER_DIR, 'faiss_indices')
# CRITICAL: This directory is used for ALL tool outputs (PDFs, PPTs, MDs, CSVs)
# It will be structured as DEFAULT_ASSETS_DIR/<user_id>/<tool_specific_subdir>/
DEFAULT_ASSETS_DIR = os.path.join(SERVER_DIR, 'python_tool_assets') # Using a generic name for tool outputs
# If you strongly prefer 'default_assets/engineering', change it back, but ensure it's clear this is for tool outputs.
DEFAULT_INDEX_USER_ID = '__DEFAULT__'

# --- Text Splitting Configuration ---
CHUNK_SIZE = int(os.getenv('CHUNK_SIZE', 512))
CHUNK_OVERLAP = int(os.getenv('CHUNK_OVERLAP', 100))

OLLAMA_URL = os.getenv("OLLAMA_BASE_URL", "http://172.180.9.187:11434")

# --- API Configuration ---
AI_CORE_SERVICE_PORT = int(os.getenv('AI_CORE_SERVICE_PORT', 5001))
RAG_SERVICE_PORT = AI_CORE_SERVICE_PORT # Alias

# --- LLM and RAG Defaults ---
ANALYSIS_MAX_CONTEXT_LENGTH = int(os.getenv('ANALYSIS_MAX_CONTEXT_LENGTH', 8000))
POPPLER_PATH = os.getenv('POPPLER_PATH','NONE')
DEFAULT_LLM_PROVIDER = os.getenv("DEFAULT_LLM_PROVIDER", "ollama")
DEFAULT_RAG_K = int(os.getenv("DEFAULT_RAG_K", 3))
REFERENCE_SNIPPET_LENGTH = int(os.getenv("REFERENCE_SNIPPET_LENGTH", 200))
MULTI_QUERY_COUNT_CONFIG = int(os.getenv("MULTI_QUERY_COUNT_CONFIG", 3))
DEFAULT_RAG_K_PER_SUBQUERY_CONFIG = int(os.getenv("DEFAULT_RAG_K_PER_SUBQUERY_CONFIG", 2))

# --- Optional External Tool Paths (Set via .env or directly if not in system PATH) ---
TESSERACT_CMD_PATH = os.getenv('TESSERACT_CMD_PATH', None)
# e.g., TESSERACT_CMD_PATH = r'C:\Program Files\Tesseract-OCR\tesseract.exe' (Windows)
POPPLER_PATH = os.getenv('POPPLER_PATH', None)
# e.g., POPPLER_PATH = r'C:\path\to\poppler-version\bin' (Windows, path to Poppler's bin directory)
NOUGAT_CLI_PATH = os.getenv('NOUGAT_CLI_PATH', 'nougat') # Defaults to 'nougat' command
# e.g., NOUGAT_CLI_PATH = '/usr/local/bin/nougat' (Linux/macOS if installed elsewhere)

# --- CORE API Key (Optional, can also be passed in request payload) ---
CORE_API_KEY_FROM_ENV = os.getenv('CORE_API_KEY', None)


# Ensure necessary directories exist at startup
for dir_path in [DEFAULT_ASSETS_DIR, FAISS_INDEX_DIR]:
    if not os.path.exists(dir_path):
        try:
            os.makedirs(dir_path, exist_ok=True)
            print(f"[config.py] Created directory: {dir_path}")
        except Exception as e:
            print(f"[config.py] CRITICAL ERROR: Could not create directory '{dir_path}': {e}")
            # Consider sys.exit(1) if these are absolutely critical

if os.getenv('DEBUG_CONFIG', 'true').lower() == 'true': # Default to true for easier debugging
    print("--- AI Core Service Configuration (config.py) ---")
    print(f"SERVER_DIR: {SERVER_DIR}")
    print(f"DEFAULT_ASSETS_DIR (for tool outputs): {DEFAULT_ASSETS_DIR}")
    print(f"FAISS_INDEX_DIR: {FAISS_INDEX_DIR}")
    print(f"AI_CORE_SERVICE_PORT: {AI_CORE_SERVICE_PORT}")
    print(f"OLLAMA_URL: {OLLAMA_URL}")
    print(f"Tesseract CMD Path: {TESSERACT_CMD_PATH or 'Not Set (using system PATH)'}")
    print(f"Poppler Path: {POPPLER_PATH or 'Not Set (using system PATH)'}")
    print(f"Nougat CLI Path: {NOUGAT_CLI_PATH or 'Not Set (using system PATH)'}")
    print(f"CORE API Key (from env): {'Set' if CORE_API_KEY_FROM_ENV else 'Not Set'}")
    print("-------------------------------------------------")