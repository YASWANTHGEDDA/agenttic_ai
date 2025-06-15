# FusedChatbot/server/ai_core_service/app.py
import os
import sys
import logging
import tempfile
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# --- Python Path Setup ---
AI_CORE_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVER_DIR = os.path.abspath(os.path.join(AI_CORE_SERVICE_DIR, '..'))
if SERVER_DIR not in sys.path: sys.path.insert(0, SERVER_DIR)
if AI_CORE_SERVICE_DIR not in sys.path: sys.path.insert(0, AI_CORE_SERVICE_DIR)

try:
    from ai_core_service import config
    from ai_core_service import file_parser, faiss_handler, llm_handler
    from ai_core_service.modules.web_resources import youtube_dl_core, pdf_downloader
    from ai_core_service.modules.content_creation import md_to_office
    from ai_core_service.modules.pdf_processing import ocr_tesseract, ocr_nougat
    from ai_core_service.modules import video_summarizer
    from ai_core_service.modules.academic_search import combined_search, core_api as academic_core_api
except ImportError as e:
    print(f"CRITICAL IMPORT ERROR in app.py: {e}\nSys.path: {sys.path}\nCheck __init__.py files, module names, and ensure all dependencies are installed.")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [%(name)s:%(lineno)d] - %(message)s')
logger = logging.getLogger(__name__)
app = Flask(__name__)
CORS(app)

# --- Ensure Asset Directory Exists ---
if not os.path.exists(config.DEFAULT_ASSETS_DIR):
    try:
        os.makedirs(config.DEFAULT_ASSETS_DIR, exist_ok=True)
        logger.info(f"Successfully created/ensured DEFAULT_ASSETS_DIR: {config.DEFAULT_ASSETS_DIR}")
    except Exception as e_mkdir:
        logger.critical(f"CRITICAL: Failed to create DEFAULT_ASSETS_DIR '{config.DEFAULT_ASSETS_DIR}': {e_mkdir}")

def create_error_response(message, status_code=500, details=None):
    logger.error(f"API Error ({status_code}): {message}" + (f" Details: {details}" if details else ""))
    return jsonify({"error": message, "status": "error", "details": str(details) if details else None}), status_code

# --- Standard FusedChat Routes ---
@app.route('/health', methods=['GET'])
def health_check():
    logger.info("\n--- Received request at /health ---")
    status_details = {
        "status": "error",
        "embedding_model_type": config.EMBEDDING_TYPE,
        "embedding_model_name": config.EMBEDDING_MODEL_NAME,
        "embedding_dimension": None,
        "sentence_transformer_load": "Unknown",
        "default_index_loaded": False,
        # --- THIS IS THE CORRECTED LOGIC ---
        "gemini_sdk_installed": bool(llm_handler.genai),
        "ollama_sdk_installed": bool(llm_handler.Client), # Check for the imported Client object
        "groq_sdk_installed": bool(llm_handler.Groq),
        # --- END OF CORRECTION ---
        "message": ""
    }
    http_status_code = 503
    try:
        model = faiss_handler.embedding_model
        if model is None:
            raise RuntimeError("Embedding model could not be initialized.")
        status_details["sentence_transformer_load"] = "OK"
        status_details["embedding_dimension"] = faiss_handler.get_embedding_dimension(model)

        if config.DEFAULT_INDEX_USER_ID in faiss_handler.loaded_indices:
             status_details["default_index_loaded"] = True
        else:
            status_details["default_index_loaded"] = False
            status_details["message"] = "Default index is not loaded. It will be loaded on first use."

        if status_details["sentence_transformer_load"] == "OK":
            status_details["status"] = "ok"
            status_details["message"] = "AI Core service is running. Embeddings OK."
            http_status_code = 200
        else:
            http_status_code = 503

    except Exception as e:
        logger.error(f"--- Health Check Critical Error ---", exc_info=True)
        status_details["message"] = f"Health check failed critically: {str(e)}"
    return jsonify(status_details), http_status_code


@app.route('/add_document', methods=['POST'])
def add_document():
    logger.info("\n--- Received request at /add_document ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400)
    user_id = data.get('user_id'); file_path = data.get('file_path'); original_name = data.get('original_name')
    if not all([user_id, file_path, original_name]): return create_error_response("Missing required fields", 400)
    if not os.path.exists(file_path): return create_error_response(f"File not found: {file_path}", 404)
    try:
        text = file_parser.parse_file(file_path)
        if not text or not text.strip(): return jsonify({"message": f"No text in '{original_name}'.", "status": "skipped"}), 200
        docs = file_parser.chunk_text(text, original_name, user_id)
        faiss_handler.add_documents_to_index(user_id, docs)
        return jsonify({"message": f"'{original_name}' added.", "chunks_added": len(docs), "status": "added"}), 200
    except Exception as e: return create_error_response(f"Failed to process '{original_name}': {e}", 500, details=str(e))


@app.route('/query_rag_documents', methods=['POST'])
def query_rag_documents_route():
    logger.info("\n--- Received request at /query_rag_documents ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400)
    user_id = data.get('user_id'); query_text = data.get('query'); k = getattr(config, 'DEFAULT_RAG_K', 5)
    if not user_id or not query_text: return create_error_response("Missing user_id or query", 400)
    try:
        results = faiss_handler.query_index(user_id, query_text, k=k)
        formatted = [{"documentName": d.metadata.get("documentName"), "score": float(s), "content": d.page_content} for d, s in results]
        return jsonify({"relevantDocs": formatted, "status": "success"}), 200
    except Exception as e: return create_error_response(f"Failed to query index: {e}", 500, details=str(e))


@app.route('/analyze_document', methods=['POST'])
def analyze_document_route():
    logger.info("\n--- Received request at /analyze_document ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400)

    api_keys_data = data.get('api_keys', {})
    file_path_for_analysis = data.get('file_path_for_analysis')
    
    if not os.path.exists(file_path_for_analysis):
        return create_error_response(f"Document not found at path: {file_path_for_analysis}", 404)

    try:
        document_text = file_parser.parse_file(file_path_for_analysis)
        analysis_result, thinking_content = llm_handler.perform_document_analysis(
            document_text=document_text,
            analysis_type=data.get('analysis_type'),
            llm_provider=data.get('llm_provider', config.DEFAULT_LLM_PROVIDER),
            llm_model_name=data.get('llm_model_name'),
            user_gemini_api_key=api_keys_data.get('gemini'),
            user_grok_api_key=api_keys_data.get('grok')
        )
        return jsonify({
            "document_name": data.get('document_name'),
            "analysis_type": data.get('analysis_type'),
            "analysis_result": analysis_result,
            "thinking_content": thinking_content,
            "status": "success"
        }), 200
    except (ValueError, ConnectionError) as e: return create_error_response(str(e), 400)
    except Exception as e: return create_error_response(f"Failed to perform analysis: {e}", 500, details=str(e))


@app.route('/generate_chat_response', methods=['POST'])
def generate_chat_response_route():
    logger.info("\n--- Received request at /generate_chat_response ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400)

    user_id = data.get('user_id')
    current_user_query = data.get('query')
    if not user_id or not current_user_query:
        return create_error_response("Missing user_id or query in request", 400)
        
    api_keys_data = data.get('api_keys', {})
    llm_provider = data.get('llm_provider', config.DEFAULT_LLM_PROVIDER)
    
    context_text = "No relevant context was found."
    rag_references = []
    
    if data.get('perform_rag', True):
        queries_to_search = [current_user_query]
        if data.get('enable_multi_query', True):
            sub_queries = llm_handler.generate_sub_queries_via_llm(
                original_query=current_user_query,
                llm_provider=llm_provider,
                llm_model_name=data.get('llm_model_name'),
                user_gemini_api_key=api_keys_data.get('gemini'),
                user_grok_api_key=api_keys_data.get('grok')
            )
            queries_to_search.extend(sub_queries)

        unique_chunks = set()
        docs_for_context = []
        for q in queries_to_search:
            results = faiss_handler.query_index(user_id, q, k=config.DEFAULT_RAG_K_PER_SUBQUERY_CONFIG)
            for doc, score in results:
                if doc.page_content not in unique_chunks:
                    unique_chunks.add(doc.page_content)
                    docs_for_context.append((doc, score))
        
        if docs_for_context:
            context_parts = [f"[{i+1}] Source: {d.metadata.get('documentName')}\n{d.page_content}" for i, (d, s) in enumerate(docs_for_context)]
            context_text = "\n\n---\n\n".join(context_parts)
            rag_references = [{"documentName": d.metadata.get("documentName"), "score": float(s)} for d, s in docs_for_context]

    try:
        final_answer, thinking_content = llm_handler.generate_response(
            llm_provider=llm_provider,
            query=current_user_query,
            context_text=context_text,
            chat_history=data.get('chat_history', []),
            system_prompt=data.get('system_prompt'),
            llm_model_name=data.get('llm_model_name'),
            user_gemini_api_key=api_keys_data.get('gemini'),
            user_grok_api_key=api_keys_data.get('grok')
        )
        return jsonify({
            "llm_response": final_answer,
            "references": rag_references,
            "thinking_content": thinking_content,
            "status": "success"
        }), 200
    except (ValueError, ConnectionError) as e: return create_error_response(str(e), 400)
    except Exception as e: return create_error_response(f"Failed to generate chat response: {e}", 500, details=str(e))


# --- Tool Routes and Helpers ---
def _handle_tool_file_operation(tool_name, user_id, operation_function, output_subdir, *op_args, **op_kwargs):
    user_tool_output_dir = os.path.join(config.DEFAULT_ASSETS_DIR, user_id, output_subdir)
    os.makedirs(user_tool_output_dir, exist_ok=True)
    logger.info(f"Tool '{tool_name}' saving to: {user_tool_output_dir}")
    try:
        result_data = operation_function(user_tool_output_dir, *op_args, **op_kwargs)
        if not result_data:
            return create_error_response(f"{tool_name} process completed, but no output files were generated.", 404)
        
        files_full_paths = []
        message = f"{tool_name} process completed successfully."
        if isinstance(result_data, dict) and 'message' in result_data:
            message = result_data['message']
            files_full_paths.extend(p for p in [result_data.get('transcript_path'), result_data.get('summary_path')] if p)
        elif isinstance(result_data, str): files_full_paths.append(result_data)
        elif isinstance(result_data, list): files_full_paths.extend(result_data)
        elif isinstance(result_data, pd.DataFrame):
            csv_path = os.path.join(user_tool_output_dir, f"{tool_name.lower().replace(' ', '_')}.csv")
            result_data.to_csv(csv_path, index=False)
            files_full_paths.append(csv_path)
            message = f"Successfully generated {len(result_data)} records."
        else:
            return create_error_response(f"Internal error: {tool_name} returned unexpected type {type(result_data)}.", 500)
        
        relative_paths = [os.path.relpath(p, config.DEFAULT_ASSETS_DIR).replace(os.sep, '/') for p in files_full_paths]
        return jsonify({
            "message": message, "files_server_paths": files_full_paths, 
            "download_links_relative": relative_paths, "status": "success",
            "data": result_data.to_dict(orient='records') if isinstance(result_data, pd.DataFrame) else None
        }), 200
    except Exception as e: return create_error_response(f"Failed {tool_name} operation: {e}", 500, details=str(e))

def _save_uploaded_file_temp(file_storage):
    fd, temp_path = tempfile.mkstemp(suffix=os.path.splitext(file_storage.filename)[1])
    os.close(fd)
    file_storage.save(temp_path)
    return temp_path

@app.route('/tools/download/youtube', methods=['POST'])
def youtube_download_tool_route():
    data = request.json
    return _handle_tool_file_operation("YouTube Download", data.get('user_id', 'guest'), 
        youtube_dl_core.download_youtube_media, "youtube_dl", data['url'], data.get('quality', '720p'))

@app.route('/tools/process/video', methods=['POST'])
def video_summarizer_tool_route():
    uid = request.form.get('user_id', 'guest')
    tmp_video_path = _save_uploaded_file_temp(request.files['video_file'])
    try:
        return _handle_tool_file_operation("Video Summarizer", uid, 
            video_summarizer.process_video_for_summary, "video_processing", tmp_video_path,
            ollama_url=config.OLLAMA_URL, ollama_model=request.form.get('ollama_model', 'llama3'))
    finally:
        if os.path.exists(tmp_video_path): os.unlink(tmp_video_path)
        
@app.route('/tools/search/combined', methods=['POST'])
def combined_search_tool_route():
    data = request.get_json(silent=True) or {}
    uid = data.get('user_id', 'guest_user')
    query = data.get('query')
    if not query: return create_error_response("Missing query for combined search", 400)
    search_params = {k: v for k, v in data.items() if k not in ['user_id', 'query']}
    # This tool's operation function returns a DataFrame directly
    df = combined_search.run_combined_search(query=query, output_dir=os.path.join(config.DEFAULT_ASSETS_DIR, uid, 'academic_search'), **search_params)
    return jsonify(df.to_dict(orient='records'))

@app.route('/tools/search/core', methods=['POST'])
def core_search_tool_route():
    data = request.get_json(silent=True) or {}
    uid = data.get('user_id', 'guest_user')
    core_key = data.get('core_api_key')
    if not core_key: return create_error_response("CORE API Key not provided/configured", 400)
    # The operation function returns a DataFrame
    df = core_api.fetch_all_core_results(
        core_api_key=core_key,
        query=data.get('query'),
        output_dir=os.path.join(config.DEFAULT_ASSETS_DIR, uid, 'core_search'),
        download_pdfs=data.get('download_pdfs', True),
        max_pages=data.get('max_pages', 2)
    )
    return jsonify(df.to_dict(orient='records'))

# Other tool routes would go here...

@app.route('/files/<path:requested_path>', methods=['GET'])
def serve_tool_generated_file(requested_path):
    logger.info(f"File requested: '{requested_path}'")
    try:
        return send_from_directory(config.DEFAULT_ASSETS_DIR, requested_path, as_attachment=True)
    except FileNotFoundError:
        return create_error_response("File not found.", 404)
    except Exception as e:
        return create_error_response(f"Error serving file: {e}", 500, details=str(e))

# --- Main Startup ---
if __name__ == '__main__':
    try:
        faiss_handler.ensure_faiss_dir()
        faiss_handler.get_embedding_model()
        faiss_handler.load_or_create_index(config.DEFAULT_INDEX_USER_ID)
        logger.info("FAISS init OK.")
    except Exception as e:
        logger.critical(f"FAISS STARTUP FAIL: {e}", exc_info=True)
        sys.exit(1)
    
    port, host = config.AI_CORE_SERVICE_PORT, '0.0.0.0'
    logger.info(f"--- Starting Flask on http://{host}:{port} ---")
    app.run(host=host, port=port, debug=os.getenv('FLASK_DEBUG', 'false').lower() in ['true', '1', 't'])