# FusedChatbot/server/ai_core_service/app.py
import os
import sys
import logging
import tempfile
# import pandas as pd # Removed as not used in the snippet
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# --- Python Path Setup ---
AI_CORE_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR_PYTHON_PERSPECTIVE = os.path.abspath(os.path.join(AI_CORE_SERVICE_DIR, '..')) # This is FusedChatbot/server/
# IMPORTANT: The path used by send_from_directory and for constructing relative paths
# needs to be consistent with how Node.js expects to find the files.
# If Node.js `python_tool_assets` is at `FusedChatbot/server/python_tool_assets`,
# then SERVER_DIR_PYTHON_PERSPECTIVE is the correct base for relpath.

if SERVER_DIR_PYTHON_PERSPECTIVE not in sys.path: sys.path.insert(0, SERVER_DIR_PYTHON_PERSPECTIVE)
if AI_CORE_SERVICE_DIR not in sys.path: sys.path.insert(0, AI_CORE_SERVICE_DIR)

try:
    from ai_core_service import config # config.py should define SERVER_DIR, DEFAULT_ASSETS_DIR etc.
    from ai_core_service import file_parser, faiss_handler, llm_handler
    from ai_core_service.modules.web_resources import youtube_dl_core, pdf_downloader
    from ai_core_service.modules.content_creation import md_to_office
    from ai_core_service.modules.pdf_processing import ocr_tesseract, ocr_nougat
    from ai_core_service.modules import video_summarizer
    from ai_core_service.modules.academic_search import combined_search, core_api as academic_core_api
except ImportError as e:
    # A more detailed error message
    import traceback
    print(f"CRITICAL IMPORT ERROR in Python app.py: {e}")
    print("Traceback:")
    traceback.print_exc()
    print(f"Current sys.path: {sys.path}")
    print(f"AI_CORE_SERVICE_DIR: {AI_CORE_SERVICE_DIR}")
    print(f"SERVER_DIR_PYTHON_PERSPECTIVE: {SERVER_DIR_PYTHON_PERSPECTIVE}")
    print("Please check __init__.py files in 'ai_core_service' and 'modules', ensure all sub-modules are correctly named,")
    print("and that all dependencies (e.g., pandas, if re-added) are installed in the Python environment.")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [%(name)s:%(lineno)d] - %(message)s')
logger = logging.getLogger(__name__) # Use __name__ for module-specific logger
app = Flask(__name__)
CORS(app)

# Ensure Asset Directory Exists (using config.DEFAULT_ASSETS_DIR)
# config.DEFAULT_ASSETS_DIR should be an absolute path or resolve correctly
# Example: DEFAULT_ASSETS_DIR = os.path.join(SERVER_DIR_PYTHON_PERSPECTIVE, "python_tool_assets")
if not os.path.exists(config.DEFAULT_ASSETS_DIR):
    try:
        os.makedirs(config.DEFAULT_ASSETS_DIR, exist_ok=True)
        logger.info(f"Successfully created/ensured DEFAULT_ASSETS_DIR: {config.DEFAULT_ASSETS_DIR}")
    except Exception as e_mkdir:
        logger.critical(f"CRITICAL: Failed to create DEFAULT_ASSETS_DIR '{config.DEFAULT_ASSETS_DIR}': {e_mkdir}")
        sys.exit(1) # Exit if this critical directory can't be made

def create_error_response(message, status_code=500, error_code=None, details=None):
    logger.error(f"API Error ({status_code}) - {error_code or 'ServerError'}: {message}" + (f" Details: {details}" if details else ""))
    response_payload = {
        "error": error_code or ('ClientError' if 400 <= status_code < 500 else 'ServerError'),
        "message": message, # User-friendly message
        "status": "error",
        "details": str(details) if details else None
    }
    return jsonify(response_payload), status_code

# --- Standard FusedChat Routes (Keep as is, seems fine) ---
@app.route('/health', methods=['GET'])
def health_check():
    logger.info("\n--- Received request at /health ---")
    status_details = {
        "status": "error", "embedding_model_type": getattr(config, 'EMBEDDING_TYPE', 'Unknown'),
        "embedding_model_name": getattr(config, 'EMBEDDING_MODEL_NAME', 'Unknown'), 
        "embedding_dimension": None,
        "sentence_transformer_load": "Unknown", "default_index_loaded": False,
        "gemini_sdk_installed": bool(getattr(llm_handler, 'genai', False)), 
        "ollama_sdk_installed": bool(getattr(llm_handler, 'ChatOllama', False)), # Adjusted for actual import
        "groq_sdk_installed": bool(getattr(llm_handler, 'Groq', False)), 
        "message": ""
    }
    http_status_code = 503
    try:
        model = faiss_handler.get_embedding_model() # Use the getter
        if model is None: raise RuntimeError("Embedding model could not be initialized by faiss_handler.")
        status_details["sentence_transformer_load"] = "OK"
        status_details["embedding_dimension"] = faiss_handler.get_embedding_dimension(model) # Pass model
        if config.DEFAULT_INDEX_USER_ID in faiss_handler.loaded_indices:
             status_details["default_index_loaded"] = True
        else:
            status_details["default_index_loaded"] = False # This is not an error state per se
            status_details["message"] = "Default index is not loaded. It will be loaded on first use or if ensure_faiss_dir runs."
        
        if status_details["sentence_transformer_load"] == "OK": # Basic check passed
            status_details["status"] = "ok"
            if not status_details["message"]: # Don't overwrite specific messages
                status_details["message"] = "AI Core service is running. Embeddings OK."
            http_status_code = 200
    except Exception as e:
        logger.error(f"--- Health Check Critical Error --- : {str(e)}", exc_info=True)
        status_details["message"] = f"Health check failed critically: {str(e)}"
        status_details["status"] = "error" # Ensure status is error
    return jsonify(status_details), http_status_code

@app.route('/add_document', methods=['POST'])
def add_document():
    logger.info("\n--- Received request at /add_document ---")
    if not request.is_json:
        return create_error_response("Request must be JSON", 400, "InvalidContentType")
    data = request.get_json()
    # logger.info(f"Payload received at /add_document: {data}") # Can be verbose
    if data is None: return create_error_response("Invalid or empty JSON body", 400, "EmptyPayload")

    user_id = data.get('user_id')
    file_path = data.get('filepath') # This is the absolute path sent by Node.js
    original_name = data.get('original_filename')
    server_filename = data.get('filename_in_storage') # Filename as stored by Node (timestamped)
    
    if not all([user_id, file_path, original_name, server_filename]):
        msg = "Missing required fields: user_id, filepath, original_filename, filename_in_storage"
        return create_error_response(msg, 400, "MissingFields")
    
    logger.info(f"Add_document: User='{user_id}', Orig='{original_name}', ServerFile='{server_filename}', Path='{file_path}'")
    if not os.path.exists(file_path):
        logger.error(f"File not found on Python server at path: {file_path}")
        return create_error_response(f"File not found on server at path specified: {original_name}", 404, "FileNotFound")
    logger.info(f"File '{file_path}' found successfully!")
        
    try:
        text = file_parser.parse_file(file_path)
        if not text or not text.strip():
            logger.warning(f"No text extracted from '{original_name}' (Path: {file_path}).")
            return jsonify({"message": f"No text could be extracted from '{original_name}'. The file might be empty, an image without OCR, or unreadable.", "status": "skipped"}), 200
        
        docs = file_parser.chunk_text(text, original_name, server_filename) 
        if not docs:
            logger.warning(f"Text extracted but no document chunks created for '{original_name}'. Min chunk size issue?")
            return jsonify({"message": f"Text extracted from '{original_name}' but no processable chunks were created. Content might be too short.", "status": "skipped_no_chunks"}), 200
            
        faiss_handler.add_documents_to_index(user_id, docs)
        logger.info(f"Successfully added {len(docs)} chunks from '{original_name}' for user '{user_id}'.")
        return jsonify({
            "message": f"'{original_name}' was successfully processed and added to your knowledge base.", 
            "chunks_added": len(docs), 
            "status": "added"
        }), 200
    except Exception as e:
        logger.error(f"Failed to process '{original_name}' (User: {user_id}): {e}", exc_info=True)
        return create_error_response(f"Failed to process '{original_name}'", 500, "ProcessingError", details=str(e))

@app.route('/remove_document', methods=['POST'])
def remove_document():
    logger.info("\n--- Received request at /remove_document ---")
    data = request.get_json()
    if not data: return create_error_response("Invalid JSON payload", 400, "EmptyPayload")
    user_id = data.get('user_id')
    server_filename = data.get('filename_in_storage') # Corrected key
    if not all([user_id, server_filename]): 
        return create_error_response("Missing user_id or filename_in_storage", 400, "MissingFields")
    try:
        logger.info(f"Attempting to remove doc: User='{user_id}', ServerFile='{server_filename}'")
        removed_count = faiss_handler.remove_documents_from_index(user_id, server_filename)
        logger.info(f"Removed {removed_count} parts for doc '{server_filename}', User '{user_id}'.")
        return jsonify({"message": f"Document '{server_filename}' and its {removed_count} parts removed from the index.", "status": "success", "removed_count": removed_count}), 200
    except Exception as e: 
        logger.error(f"Failed remove_document: User='{user_id}', File='{server_filename}': {e}", exc_info=True)
        return create_error_response(f"Failed to remove document from index: {server_filename}", 500, "IndexRemovalError", details=str(e))

@app.route('/update_document_name', methods=['POST'])
def update_document_name():
    logger.info("\n--- Received request at /update_document_name ---")
    data = request.get_json()
    if not data: return create_error_response("Invalid JSON payload", 400, "EmptyPayload")
    user_id = data.get('user_id')
    server_filename = data.get('filename_in_storage') # Corrected key
    new_name = data.get('new_original_filename')
    if not all([user_id, server_filename, new_name]): 
        return create_error_response("Missing required fields: user_id, filename_in_storage, new_original_filename", 400, "MissingFields")
    try:
        logger.info(f"Updating doc name: User='{user_id}', ServerFile='{server_filename}', NewName='{new_name}'")
        updated_count = faiss_handler.update_document_metadata(user_id, server_filename, {'documentName': new_name})
        logger.info(f"Updated metadata for {updated_count} entries for '{server_filename}', User '{user_id}'.")
        return jsonify({"message": f"Document name updated to '{new_name}' for '{server_filename}'. {updated_count} entries affected.", "status": "success", "updated_count": updated_count}), 200
    except Exception as e: 
        logger.error(f"Failed update_document_name: User='{user_id}', File='{server_filename}': {e}", exc_info=True)
        return create_error_response(f"Failed to update document name: {server_filename}", 500, "MetadataUpdateError", details=str(e))


@app.route('/query_rag_documents', methods=['POST'])
def query_rag_documents_route():
    # ... (Keep as is, seems fine)
    logger.info("\n--- Received request at /query_rag_documents ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400, "InvalidContentType")
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400, "EmptyPayload")
    user_id = data.get('user_id'); query_text = data.get('query'); 
    k = data.get('k', getattr(config, 'DEFAULT_RAG_K', 5)) # Allow k from request
    if not user_id or not query_text: return create_error_response("Missing user_id or query", 400, "MissingFields")
    try:
        logger.info(f"Querying RAG: User='{user_id}', Query='{query_text[:50]}...', k={k}")
        results = faiss_handler.query_index(user_id, query_text, k=k)
        formatted = [{"documentName": d.metadata.get("documentName"), "score": float(s), "content": d.page_content, "serverFilename": d.metadata.get("serverFilename")} for d, s in results]
        return jsonify({"relevantDocs": formatted, "status": "success"}), 200
    except Exception as e: 
        logger.error(f"Failed query_rag_documents: User='{user_id}': {e}", exc_info=True)
        return create_error_response(f"Failed to query index", 500, "QueryIndexError", details=str(e))

@app.route('/analyze_document', methods=['POST'])
def analyze_document_route():
    logger.info("\n--- Received request at /analyze_document ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400, "InvalidContentType")
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400, "EmptyPayload")
    
    user_id = data.get('user_id') # Get user_id
    api_keys_data = data.get('api_keys', {})
    file_path_for_analysis = data.get('file_path_for_analysis') # Path sent by Node.js
    document_name = data.get('document_name', os.path.basename(file_path_for_analysis) if file_path_for_analysis else "Unknown Document")
    analysis_type = data.get('analysis_type')
    llm_provider = data.get('llm_provider', config.DEFAULT_LLM_PROVIDER)
    llm_model_name = data.get('llm_model_name')

    if not all([user_id, file_path_for_analysis, analysis_type]):
        return create_error_response("Missing user_id, file_path_for_analysis, or analysis_type", 400, "MissingFields")

    if not os.path.exists(file_path_for_analysis):
        logger.error(f"Analyze document: File not found at path: {file_path_for_analysis} (User: {user_id})")
        return create_error_response(f"Document for analysis ('{document_name}') not found at specified server path.", 404, "FileNotFound")
    
    logger.info(f"Analyzing doc: User='{user_id}', File='{document_name}', Type='{analysis_type}', Provider='{llm_provider}' Path='{file_path_for_analysis}'")
    try:
        document_text = file_parser.parse_file(file_path_for_analysis)
        if not document_text or not document_text.strip():
            logger.warning(f"No text extracted for analysis from '{document_name}' (User: {user_id}).")
            return create_error_response(f"No text could be extracted from '{document_name}' for analysis.", 400, "NoTextExtracted")

        analysis_result, thinking_content = llm_handler.perform_document_analysis(
            document_text=document_text, analysis_type=analysis_type,
            llm_provider=llm_provider, llm_model_name=llm_model_name, 
            user_gemini_api_key=api_keys_data.get('gemini'),
            user_grok_api_key=api_keys_data.get('groq')
        )
        return jsonify({
            "document_name": document_name, "analysis_type": analysis_type,
            "analysis_result": analysis_result, "thinking_content": thinking_content, "status": "success"
        }), 200
    except (ValueError, ConnectionError) as e: 
        logger.error(f"Client-side error during analysis: User='{user_id}', Doc='{document_name}': {e}", exc_info=True)
        return create_error_response(str(e), 400, "LLMConnectionOrValueError") # More specific
    except Exception as e: 
        logger.error(f"Failed analysis: User='{user_id}', Doc='{document_name}': {e}", exc_info=True)
        return create_error_response(f"Failed to perform analysis on '{document_name}'", 500, "AnalysisError", details=str(e))

def generate_response(llm_provider, query, context_text, chat_history, system_prompt, 
                      user_gemini_api_key=None, user_grok_api_key=None,
                      temperature=None, max_tokens=None): # <--- ORIGINAL SIGNATURE
    # ... logic to build prompt ...

    if llm_provider.startswith("groq_"):
        if not user_grok_api_key:
            raise ValueError("Groq API key is required for Groq provider.")
        try:
            # Initialize Groq client if not already done, or get from a global/class instance
            # from groq import Groq # Make sure Groq is imported
            # client = Groq(api_key=user_grok_api_key)

            # This is where the Groq model name would be used.
            # Previously, it might have been hardcoded or derived differently.
            # groq_model_to_use = "llama3-8b-8192" # Example of old way

            # chat_completion = client.chat.completions.create(
            #     messages=formatted_messages_for_api,
            #     model=groq_model_to_use, # <--- OLD USAGE
            #     temperature=temperature,
            #     max_tokens=max_tokens
            # )
            # final_answer = chat_completion.choices[0].message.content
            pass # Placeholder for old logic
        except Exception as e:
            logger.error(f"Error calling Groq API: {e}")
            raise ConnectionError(f"Failed to connect to Groq API: {e}") from e
    # ... other providers like gemini, ollama ...
    else:
        raise ValueError(f"Unsupported LLM provider: {llm_provider}")

    thinking_content = "Thinking process details..." # Placeholder
    return final_answer, thinking_content

def _save_uploaded_file_temp(file_storage):
    # Ensure a unique filename even with multiple requests
    fd, temp_path = tempfile.mkstemp(suffix=f"_{os.path.splitext(file_storage.filename)[1]}")
    os.close(fd) # Close the file descriptor, as save will open/close it
    file_storage.save(temp_path)
    logger.debug(f"Saved uploaded file to temp path: {temp_path}")
    return temp_path

@app.route('/tools/create/ppt', methods=['POST'])
def create_ppt_tool_route():
    markdown_content = request.get_data(as_text=True) # Node sends raw markdown
    if not markdown_content: return create_error_response("Markdown content is missing.", 400, "MissingMarkdown")
    
    filename = request.args.get('filename', 'Presentation.pptx') # From query params sent by Node
    user_id = request.args.get('user_id', request.headers.get('x-user-id', 'guest_user_py')) # Get user_id from query or header
    
    logger.info(f"PPT Create: User='{user_id}', Filename='{filename}', MD Length='{len(markdown_content)}'")
    user_ppt_dir = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", "ppt_creations")
    os.makedirs(user_ppt_dir, exist_ok=True)
    
    try:
        # This is where the AttributeError was happening. Ensure this function exists.
        output_path = md_to_office.create_ppt_from_markdown(markdown_content, user_ppt_dir, filename)
        # Relative path for download link should be from where Node.js can serve it
        # Assuming Node.js serves from a base that corresponds to `python_tool_assets`
        # and python_tool_assets is at the same level as ai_core_service and routes
        # So, if DEFAULT_ASSETS_DIR is FusedChatbot/server/python_tool_assets
        # And SERVER_DIR_PYTHON_PERSPECTIVE is FusedChatbot/server
        # Then the relative path needs to be from FusedChatbot/server/python_tool_assets
        # Example: if output_path = /abs/path/to/FusedChatbot/server/python_tool_assets/user_xyz/ppt/file.pptx
        # And config.DEFAULT_ASSETS_DIR = /abs/path/to/FusedChatbot/server/python_tool_assets
        # Then relpath should be user_xyz/ppt/file.pptx
        relative_path = os.path.relpath(output_path, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/')
        
        logger.info(f"PPT created: '{output_path}'. Relative for Node: '{relative_path}' (User: {user_id})")
        return jsonify({
            "message": "Presentation created successfully.", 
            "file_server_path": output_path, # Absolute path on Python server
            "download_link_relative": relative_path, # Path relative to DEFAULT_ASSETS_DIR
            "status": "success"
        }), 200
    except AttributeError as ae:
        logger.critical(f"AttributeError in PPT Creation (User {user_id}): {ae}. Ensure 'create_ppt_from_markdown' exists in md_to_office.py.", exc_info=True)
        return create_error_response(f"Internal server error: PPT generation function missing or misnamed.", 500, "FunctionNotFound", details=str(ae))
    except Exception as e: 
        logger.error(f"Failed PPT Creation (User {user_id}): {e}", exc_info=True)
        return create_error_response(f"Failed PPT Creation", 500, "PPTCreationError", details=str(e))

@app.route('/tools/create/doc', methods=['POST'])
def create_doc_tool_route():
    data = request.json # Node sends JSON
    if not data: return create_error_response("Invalid JSON payload.", 400, "EmptyPayload")
    
    markdown_content = data.get('markdown_content')
    filename = data.get('filename', 'Document.docx')
    user_id = data.get('user_id', 'guest_user_py') # Get user_id from payload
    content_key = data.get('content_key') # Crucial for md_to_office.py

    if not markdown_content: return create_error_response("Missing 'markdown_content'.", 400, "MissingMarkdown")
    if not content_key: return create_error_response("Missing 'content_key'.", 400, "MissingContentKey")

    logger.info(f"DOCX Create: User='{user_id}', Filename='{filename}', Key='{content_key}', MD Length='{len(markdown_content)}'")
    user_doc_dir = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", "doc_creations")
    os.makedirs(user_doc_dir, exist_ok=True)
    
    try:
        output_path = md_to_office.create_doc_from_markdown(markdown_content, user_doc_dir, filename, content_key=content_key)
        relative_path = os.path.relpath(output_path, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/')
        logger.info(f"DOCX created: '{output_path}'. Relative for Node: '{relative_path}' (User: {user_id})")
        return jsonify({
            "message": "Document created successfully.", 
            "file_server_path": output_path,
            "download_link_relative": relative_path,
            "status": "success"
        }), 200
    except Exception as e: 
        logger.error(f"Failed DOCX Creation (User {user_id}): {e}", exc_info=True)
        return create_error_response(f"Failed DOCX Creation", 500, "DOCXCreationError", details=str(e))

@app.route('/tools/download/web_pdfs', methods=['POST'])
def web_pdf_download_tool_route():
    data = request.json # Node sends JSON
    if not data: return create_error_response("Invalid JSON payload.", 400, "EmptyPayload")
    
    user_id = data.get('user_id', 'guest_user_py')
    query = data.get('query')
    max_downloads = data.get('max_downloads', 3)

    if not query: return create_error_response("Missing 'query' for web PDF download.", 400, "MissingQuery")
    
    logger.info(f"WebPDF DL: User='{user_id}', Query='{query}', Max='{max_downloads}'")
    user_pdf_dir = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", "web_downloads")
    os.makedirs(user_pdf_dir, exist_ok=True)
    
    try:
        # Assuming download_pdfs_from_query returns a list of absolute paths to downloaded files
        # Inside web_pdf_download_tool_route in app.py
        downloaded_files_abs_paths = pdf_downloader.download_pdfs_from_query( # <--- CHANGE THIS BACK
            base_query=query,
            output_folder=user_pdf_dir,
            max_total_downloads=max_downloads
    # Optional parameters like gemini_model_instance can be added if needed
)
        
        # Create relative paths for Node.js to construct download links
        # These paths should be relative to config.DEFAULT_ASSETS_DIR
        download_links_relative = [os.path.relpath(p, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/') for p in downloaded_files_abs_paths]
        
        processed_count = len(downloaded_files_abs_paths)
        logger.info(f"WebPDF DL: User='{user_id}', Downloaded {processed_count} files.")
        return jsonify({
            "message": f"Successfully processed query. Downloaded {processed_count} PDF(s).",
            "files_server_paths": downloaded_files_abs_paths, # Absolute paths on Python server
            "download_links_relative": download_links_relative, # Relative paths for Node to serve
            "processed_count": processed_count,
            "status": "success",
            "query": query # Echo back the query
        }), 200
    except Exception as e: 
        logger.error(f"Failed Web PDF Download (User {user_id}, Query '{query}'): {e}", exc_info=True)
        return create_error_response(f"Failed Web PDF Download for query: {query}", 500, "WebPDFDownloadError", details=str(e))

@app.route('/tools/ocr/tesseract', methods=['POST'])
def ocr_tesseract_tool_route():
    # ... (Keep as is, seems fine but ensure _save_uploaded_file_temp is robust)
    if 'pdf_file' not in request.files: return create_error_response("No 'pdf_file' found.", 400, "MissingFile")
    file = request.files['pdf_file']
    user_id = request.form.get('user_id', 'guest_user_py') # Get user_id from form data
    if file.filename == '': return create_error_response("No selected file.", 400, "NoFileSelected")
    
    logger.info(f"Tesseract OCR: User='{user_id}', File='{file.filename}'")
    temp_pdf_path = None
    try:
        temp_pdf_path = _save_uploaded_file_temp(file)
        extracted_text = ocr_tesseract.perform_ocr(temp_pdf_path)
        return jsonify({"message": "OCR with Tesseract successful.", "extracted_text": extracted_text, "status": "success"}), 200
    except Exception as e: 
        logger.error(f"Tesseract OCR failed (User {user_id}, File '{file.filename}'): {e}", exc_info=True)
        return create_error_response(f"Tesseract OCR failed", 500, "OCRTesseractError", details=str(e))
    finally:
        if temp_pdf_path and os.path.exists(temp_pdf_path): 
            try: os.unlink(temp_pdf_path)
            except Exception as e_unlink: logger.error(f"Error unlinking temp OCR file {temp_pdf_path}: {e_unlink}")

@app.route('/tools/ocr/nougat', methods=['POST'])
def ocr_nougat_tool_route():
    # ... (Keep as is, seems fine but ensure _save_uploaded_file_temp is robust)
    if 'pdf_file' not in request.files: return create_error_response("No 'pdf_file' found.", 400, "MissingFile")
    file = request.files['pdf_file']
    user_id = request.form.get('user_id', 'guest_user_py')
    if file.filename == '': return create_error_response("No selected file.", 400, "NoFileSelected")

    logger.info(f"Nougat OCR: User='{user_id}', File='{file.filename}'")
    user_ocr_dir = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", "nougat_ocr")
    os.makedirs(user_ocr_dir, exist_ok=True)
    temp_pdf_path = None
    try:
        temp_pdf_path = _save_uploaded_file_temp(file)
        # perform_ocr should return the absolute path to the output .mmd file
        output_mmd_abs_path = ocr_nougat.perform_ocr(temp_pdf_path, output_dir=user_ocr_dir)
        
        with open(output_mmd_abs_path, 'r', encoding='utf-8') as f:
            extracted_text = f.read()
        
        # Relative path for Node.js (relative to DEFAULT_ASSETS_DIR)
        output_file_relative_path = os.path.relpath(output_mmd_abs_path, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/')
        
        return jsonify({
            "message": "OCR with Nougat successful.", "extracted_text": extracted_text,
            "output_file_server_path": output_mmd_abs_path, # Absolute path on Python server
            "output_file_relative_path": output_file_relative_path, # Relative path for Node
            "status": "success"
        }), 200
    except Exception as e: 
        logger.error(f"Nougat OCR failed (User {user_id}, File '{file.filename}'): {e}", exc_info=True)
        return create_error_response(f"Nougat OCR failed", 500, "OCRNougatError", details=str(e))
    finally:
        if temp_pdf_path and os.path.exists(temp_pdf_path): 
            try: os.unlink(temp_pdf_path)
            except Exception as e_unlink: logger.error(f"Error unlinking temp Nougat file {temp_pdf_path}: {e_unlink}")


@app.route('/tools/download/youtube', methods=['POST'])
def youtube_download_tool_route():
    data = request.json # Node sends JSON
    if not data: return create_error_response("Invalid JSON payload.", 400, "EmptyPayload")

    user_id = data.get('user_id', 'guest_user_py')
    url = data.get('url')
    quality = data.get('quality', '720p') # Default quality

    if not url: return create_error_response("Missing 'url' for YouTube download.", 400, "MissingURL")
    
    logger.info(f"YouTube DL: User='{user_id}', URL='{url}', Quality='{quality}'")
    user_yt_dir = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", "youtube_dl")
    os.makedirs(user_yt_dir, exist_ok=True)
    
    try:
        # download_youtube_media should return a list of absolute paths
        result_files_abs_paths = youtube_dl_core.download_youtube_media(url, user_yt_dir, quality)
        
        # Relative paths for Node.js (relative to DEFAULT_ASSETS_DIR)
        download_links_relative = [os.path.relpath(p, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/') for p in result_files_abs_paths]
        
        return jsonify({
            "message": "YouTube media downloaded successfully.", 
            "files_server_paths": result_files_abs_paths, # Absolute paths on Python server
            "download_links_relative": download_links_relative, # Relative paths for Node
            "original_url": url, # Echo back params
            "quality": quality,
            "status": "success"
        }), 200
    except Exception as e: 
        logger.error(f"Failed YouTube Download (User {user_id}, URL '{url}'): {e}", exc_info=True)
        return create_error_response(f"Failed YouTube Download for URL: {url}", 500, "YouTubeDLError", details=str(e))

@app.route('/tools/process/video', methods=['POST'])
def video_summarizer_tool_route():
    # ... (Keep as is, ensure _save_uploaded_file_temp is robust and Python module returns paths relative to DEFAULT_ASSETS_DIR if that's what Node expects for relative_paths)
    user_id = request.form.get('user_id', 'guest_user_py') # Get user_id from form data
    if 'video_file' not in request.files: return create_error_response("No 'video_file' found", 400, "MissingFile")
    video_file = request.files['video_file']
    ollama_model_req = request.form.get('ollama_model', config.DEFAULT_OLLAMA_MODEL) # Use config default

    logger.info(f"Video Process: User='{user_id}', File='{video_file.filename}', Model='{ollama_model_req}'")
    tmp_video_path = None
    user_video_dir = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", "video_processing")
    os.makedirs(user_video_dir, exist_ok=True)
    try:
        tmp_video_path = _save_uploaded_file_temp(video_file)
        # process_video_for_summary should return a dict where values ending in '_path' are absolute paths
        result_data = video_summarizer.process_video_for_summary(
            video_path=tmp_video_path, 
            output_dir=user_video_dir, # Python function should use this to save its outputs
            ollama_url=config.OLLAMA_URL, 
            ollama_model=ollama_model_req
        )
        
        # Convert absolute paths in result_data to paths relative to DEFAULT_ASSETS_DIR for Node
        # This assumes video_summarizer saves files within user_video_dir (which is inside DEFAULT_ASSETS_DIR)
        processed_relative_paths = {}
        for k, v in result_data.items():
            if isinstance(v, str) and (k.endswith('_path') or k.endswith('_paths')) and os.path.exists(v):
                # If it's a list of paths (like 'frame_paths')
                if isinstance(v, list):
                     processed_relative_paths[k.replace("_path", "_relative_path")] = [os.path.relpath(p, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/') for p in v if os.path.exists(p)]
                else: # Single path
                    processed_relative_paths[k.replace("_path", "_relative_path")] = os.path.relpath(v, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/')
        
        final_response = {**result_data, **processed_relative_paths, "status": "success"}
        return jsonify(final_response), 200
    except Exception as e:
        logger.error(f"Failed Video Processing (User {user_id}, File '{video_file.filename}'): {e}", exc_info=True)
        return create_error_response(f"Failed Video Processing", 500, "VideoProcessingError", details=str(e))
    finally:
        if tmp_video_path and os.path.exists(tmp_video_path): 
            try: os.unlink(tmp_video_path)
            except Exception as e_unlink: logger.error(f"Error unlinking temp video file {tmp_video_path}: {e_unlink}")

@app.route('/tools/search/combined', methods=['POST'])
def combined_search_tool_route():
    # ... (Keep as is, ensure run_combined_search saves CSV to a path from which a relative link can be made if needed by client)
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id', 'guest_user_py')
    query = data.get('query')
    if not query: return create_error_response("Missing query for combined search", 400, "MissingQuery")
    
    # Output dir for CSVs should be within DEFAULT_ASSETS_DIR for consistent download links
    output_dir_for_csv = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", 'academic_search', 'combined_results')
    os.makedirs(output_dir_for_csv, exist_ok=True)
    
    search_params = {k: v for k, v in data.items() if k not in ['user_id', 'query']}
    logger.info(f"Combined Search: User='{user_id}', Query='{query}', Params='{search_params}'")
    try:
        # Modify run_combined_search to accept output_dir and return DataFrame + path to CSV
        df, csv_filepath_abs = combined_search.run_combined_search(
            query=query, 
            output_dir=output_dir_for_csv, # Pass the designated output directory
            **search_params
        )
        response_data = df.to_dict(orient='records')
        
        # Add relative CSV download link if CSV was created
        csv_download_link_relative = None
        if csv_filepath_abs and os.path.exists(csv_filepath_abs):
            csv_download_link_relative = os.path.relpath(csv_filepath_abs, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/')
            logger.info(f"Combined search CSV created at: {csv_filepath_abs}, relative: {csv_download_link_relative}")
        
        return jsonify({
            "results": response_data, 
            "csv_download_link_relative": csv_download_link_relative,
            "status": "success",
            "message": f"Combined search found {len(response_data)} results."
        }), 200

    except Exception as e:
        logger.error(f"Failed Combined Search (User {user_id}, Query '{query}'): {e}", exc_info=True)
        return create_error_response(f"Failed Combined Search", 500, "CombinedSearchError", details=str(e))

@app.route('/tools/search/core', methods=['POST'])
def core_search_tool_route():
    # ... (Keep as is, similar to combined_search regarding CSV output if any)
    data = request.get_json(silent=True) or {}
    user_id = data.get('user_id', 'guest_user_py')
    core_key = data.get('core_api_key') or getattr(config, 'CORE_API_KEY_DEFAULT', None) # Allow fallback to config
    query = data.get('query')

    if not core_key: return create_error_response("CORE API Key not provided or configured", 400, "MissingAPIKey")
    if not query: return create_error_response("Missing query for CORE search", 400, "MissingQuery")

    output_dir_for_core = os.path.join(config.DEFAULT_ASSETS_DIR, f"user_{user_id}", 'academic_search', 'core_results')
    os.makedirs(output_dir_for_core, exist_ok=True)
    
    download_pdfs_flag = data.get('download_pdfs', False) # Default to False unless specified
    max_pages_to_fetch = data.get('max_pages', 1)

    logger.info(f"CORE Search: User='{user_id}', Query='{query}', DL_PDFs='{download_pdfs_flag}', MaxPages='{max_pages_to_fetch}'")
    try:
        # Modify fetch_all_core_results to return DataFrame and path to CSV
        df, csv_filepath_abs, downloaded_pdf_paths_abs = academic_core_api.fetch_all_core_results(
            core_api_key=core_key, 
            query=query, 
            output_dir=output_dir_for_core, # For CSV and PDFs
            download_pdfs=download_pdfs_flag, 
            max_pages=max_pages_to_fetch
        )
        results_list = df.to_dict(orient='records')
        
        csv_dl_link_rel = None
        if csv_filepath_abs and os.path.exists(csv_filepath_abs):
            csv_dl_link_rel = os.path.relpath(csv_filepath_abs, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/')
        
        # Add relative download links for any downloaded PDFs
        if downloaded_pdf_paths_abs:
            for i, record in enumerate(results_list):
                # This assumes your df from fetch_all_core_results has a column indicating if a PDF was downloaded for that record
                # and that downloaded_pdf_paths_abs aligns with these records or contains paths that can be mapped.
                # For simplicity, if your df includes a 'local_pdf_path_abs' column:
                if 'local_pdf_path_abs' in record and record['local_pdf_path_abs'] and os.path.exists(record['local_pdf_path_abs']):
                    results_list[i]['download_link_relative'] = os.path.relpath(record['local_pdf_path_abs'], config.DEFAULT_ASSETS_DIR).replace(os.sep, '/')


        return jsonify({
            "results": results_list, 
            "csv_download_link_relative": csv_dl_link_rel,
            "status": "success",
            "message": f"CORE search found {len(results_list)} results."
        }), 200
    except Exception as e:
        logger.error(f"Failed CORE Search (User {user_id}, Query '{query}'): {e}", exc_info=True)
        return create_error_response(f"Failed CORE Search", 500, "CORESearchError", details=str(e))

# This serves files from DEFAULT_ASSETS_DIR (e.g., python_tool_assets)
# Node.js route `/api/external-ai-tools/files/download-tool-output/<relativePath>` will hit this via proxy potentially,
# OR client can call this directly if this Flask service is exposed.
# For consistency, Node.js should handle all /api/external-ai-tools/* requests and use this only if it needs to proxy a raw file download.
# However, the `getProxiedFileDownloadUrl` in React points to a Node.js route.
# That Node.js route `/api/external-ai-tools/files/download-tool-output/*` needs to correctly map the relative path
# to the file system where Python saves the tool outputs (e.g., within `python_tool_assets` at the server root).
@app.route('/files/<path:requested_path>', methods=['GET'])
def serve_tool_generated_file(requested_path):
    # This route is relative to DEFAULT_ASSETS_DIR
    # Example: /files/user_xyz/ppt_creations/file.pptx
    # `requested_path` will be `user_xyz/ppt_creations/file.pptx`
    # `directory` will be `config.DEFAULT_ASSETS_DIR`
    logger.info(f"Python /files/ serving: '{requested_path}' from base '{config.DEFAULT_ASSETS_DIR}'")
    try:
        # Security: Ensure requested_path does not try to escape DEFAULT_ASSETS_DIR
        # os.path.abspath will resolve '..'
        abs_base_path = os.path.abspath(config.DEFAULT_ASSETS_DIR)
        abs_requested_file_path = os.path.abspath(os.path.join(abs_base_path, requested_path))

        if not abs_requested_file_path.startswith(abs_base_path):
            logger.warning(f"Forbidden path traversal attempt in /files/: '{requested_path}' resolved outside base.")
            return create_error_response("Forbidden: Invalid file path.", 403, "ForbiddenPath")

        # Filename for content-disposition
        filename_for_download = os.path.basename(requested_path)

        return send_from_directory(
            config.DEFAULT_ASSETS_DIR, 
            requested_path, 
            as_attachment=True,
            download_name=filename_for_download # Explicitly set download name
        )
    except FileNotFoundError:
        logger.error(f"Python /files/: File not found '{requested_path}' in '{config.DEFAULT_ASSETS_DIR}'")
        return create_error_response("File not found.", 404, "FileNotFound")
    except Exception as e:
        logger.error(f"Python /files/: Error serving file '{requested_path}': {e}", exc_info=True)
        return create_error_response(f"Error serving file", 500, "FileServingError", details=str(e))

# --- Main Startup ---
if __name__ == '__main__':
    try:
        logger.info("Ensuring FAISS directory and loading default index...")
        faiss_handler.ensure_faiss_dir()
        faiss_handler.get_embedding_model() # Initialize model early
        faiss_handler.load_or_create_index(config.DEFAULT_INDEX_USER_ID) # Load default index
        logger.info("FAISS initialization completed.")
    except Exception as e:
        logger.critical(f"CRITICAL FAISS STARTUP FAILURE: {e}", exc_info=True)
        sys.exit(1) # Stop server if FAISS fails critically
    
    port = int(config.AI_CORE_SERVICE_PORT)
    host = '0.0.0.0'
    debug_mode = os.getenv('FLASK_DEBUG', 'false').lower() in ['true', '1', 't']
    logger.info(f"--- Starting Python AI Core Service (Flask) on http://{host}:{port} (Debug: {debug_mode}) ---")
    app.run(host=host, port=port, debug=debug_mode)