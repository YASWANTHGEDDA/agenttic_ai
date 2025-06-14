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
    from ai_core_service.modules.academic_search import combined_search, core_api as academic_core_api
except ImportError as e:
    print(f"CRITICAL IMPORT ERROR in app.py: {e}\nSys.path: {sys.path}\nCheck __init__.py files, module names, and ensure all dependencies are installed.")
    sys.exit(1)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - [%(name)s:%(lineno)d] - %(message)s')
logger = logging.getLogger(__name__)
app = Flask(__name__)
CORS(app)

if not os.path.exists(config.DEFAULT_ASSETS_DIR) or not os.access(config.DEFAULT_ASSETS_DIR, os.W_OK):
    logger.warning(f"WARNING: DEFAULT_ASSETS_DIR '{config.DEFAULT_ASSETS_DIR}' does not exist or is not writable. Attempting to create...")
    try:
        os.makedirs(config.DEFAULT_ASSETS_DIR, exist_ok=True)
        if not os.access(config.DEFAULT_ASSETS_DIR, os.W_OK):
             logger.critical("CRITICAL: DEFAULT_ASSETS_DIR is still not writable after creation attempt.")
        else: logger.info(f"Successfully created/ensured DEFAULT_ASSETS_DIR: {config.DEFAULT_ASSETS_DIR}")
    except Exception as e_mkdir: logger.critical(f"CRITICAL: Failed to create DEFAULT_ASSETS_DIR '{config.DEFAULT_ASSETS_DIR}': {e_mkdir}")

def create_error_response(message, status_code=500, details=None):
    logger.error(f"API Error ({status_code}): {message}" + (f" Details: {details}" if details else ""))
    return jsonify({"error": message, "status": "error", "details": str(details) if details else None}), status_code

# --- Standard FusedChat Routes ---
@app.route('/health', methods=['GET'])
def health_check():
    logger.info("\n--- Received request at /health ---")
    # This should be your full, original health check logic
    # For now, a more detailed placeholder:
    faiss_ok = False
    embedding_model_name = "Not loaded"
    try:
        if faiss_handler.embedding_model:
            embedding_model_name = getattr(faiss_handler.embedding_model, 'model_name', 'Unknown Model')
            faiss_ok = config.DEFAULT_INDEX_USER_ID in faiss_handler.loaded_indices
    except Exception: pass
    return jsonify({
        "status": "ok" if faiss_ok else "error",
        "message": f"Python AI Core health. FAISS {'OK' if faiss_ok else 'Issue'}.",
        "embedding_model": embedding_model_name,
        "default_index_loaded": faiss_ok,
        "DEFAULT_ASSETS_DIR_status": "Exists & Writable" if os.path.exists(config.DEFAULT_ASSETS_DIR) and os.access(config.DEFAULT_ASSETS_DIR, os.W_OK) else "MISSING/NOT WRITABLE!",
    }), 200 if faiss_ok else 503

#@app.route('/health', methods=['GET'])
def health_check():
    logger.info("\n--- Received request at /health ---")
    status_details = {
        "status": "error",
        "embedding_model_type": config.EMBEDDING_TYPE,
        "embedding_model_name": config.EMBEDDING_MODEL_NAME,
        "embedding_dimension": None,
        "sentence_transformer_load": "Unknown",
        "default_index_loaded": False,
        # MODIFICATION: Check for SDK installation, not configuration
        "gemini_sdk_installed": bool(llm_handler.genai),
        "ollama_available": bool(llm_handler.ollama_available),
        "groq_sdk_installed": bool(llm_handler.Groq),
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
    # This route remains unchanged as it does not interact with LLMs
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
    except Exception as e: return create_error_response(f"Failed to process '{original_name}': {e}", 500)


@app.route('/query_rag_documents', methods=['POST'])
def query_rag_documents_route():
    # This route remains unchanged as it does not interact with LLMs
    logger.info("\n--- Received request at /query_rag_documents ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400)
    user_id = data.get('user_id'); query_text = data.get('query'); k = data.get('k', 5)
    if not user_id or not query_text: return create_error_response("Missing user_id or query", 400)
    try:
        results = faiss_handler.query_index(user_id, query_text, k=k)
        formatted = [{"documentName": d.metadata.get("documentName"), "score": float(s), "content": d.page_content} for d, s in results]
        return jsonify({"relevantDocs": formatted, "status": "success"}), 200
    except Exception as e: return create_error_response(f"Failed to query index: {e}", 500)


@app.route('/analyze_document', methods=['POST'])
def analyze_document_route():
    logger.info("\n--- Received request at /analyze_document ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400)

    # Standard fields
    user_id = data.get('user_id')
    document_name = data.get('document_name')
    analysis_type = data.get('analysis_type')
    file_path_for_analysis = data.get('file_path_for_analysis')
    llm_provider = data.get('llm_provider', config.DEFAULT_LLM_PROVIDER)
    llm_model_name = data.get('llm_model_name', None)

    # --- MODIFIED SECTION: Extract API keys from the nested 'api_keys' object ---
    api_keys_data = data.get('api_keys', {}) # Safely get the api_keys object
    user_gemini_api_key = api_keys_data.get('gemini')
    user_grok_api_key = api_keys_data.get('grok')
    # --- MODIFIED SECTION END ---

    if not all([user_id, document_name, analysis_type, file_path_for_analysis]):
         return create_error_response("Missing required fields", 400)
    if not os.path.exists(file_path_for_analysis):
        return create_error_response(f"Document not found at path: {file_path_for_analysis}", 404)

    try:
        document_text = file_parser.parse_file(file_path_for_analysis)
        if not document_text or not document_text.strip():
            raise ValueError("Could not parse or extracted text is empty.")

        logger.info(f"Performing '{analysis_type}' analysis on '{document_name}' using {llm_provider}...")

        # Pass API keys to the llm_handler
        analysis_result, thinking_content = llm_handler.perform_document_analysis(
            document_text=document_text,
            analysis_type=analysis_type,
            llm_provider=llm_provider,
            llm_model_name=llm_model_name,
            user_gemini_api_key=user_gemini_api_key, # This passes the key down
            user_grok_api_key=user_grok_api_key    # This passes the key down
        )

        return jsonify({
            "document_name": document_name,
            "analysis_type": analysis_type,
            "analysis_result": analysis_result,
            "thinking_content": thinking_content,
            "status": "success"
        }), 200

    except ConnectionError as e: return create_error_response(str(e), 502)
    except Exception as e: return create_error_response(f"Failed to perform analysis: {str(e)}", 500)


@app.route('/generate_chat_response', methods=['POST'])
def generate_chat_response_route():
    logger.info("\n--- Received request at /generate_chat_response ---")
    if not request.is_json: return create_error_response("Request must be JSON", 400)
    data = request.get_json()
    if data is None: return create_error_response("Invalid or empty JSON body", 400)

    # Standard fields
    user_id = data.get('user_id')
    current_user_query = data.get('query')
    chat_history = data.get('chat_history', []) # Make sure to get chat history
    system_prompt = data.get('system_prompt')   # And the system prompt
    llm_provider = data.get('llm_provider', config.DEFAULT_LLM_PROVIDER)
    llm_model_name = data.get('llm_model_name', None)
    perform_rag = data.get('perform_rag', True)
    enable_multi_query = data.get('enable_multi_query', True)

    # --- MODIFIED SECTION: Extract API keys from the nested 'api_keys' object ---
    api_keys_data = data.get('api_keys', {}) # Safely get the api_keys object
    user_gemini_api_key = api_keys_data.get('gemini')
    user_grok_api_key = api_keys_data.get('grok')
    # --- MODIFIED SECTION END ---

    if not user_id or not current_user_query:
        return create_error_response("Missing user_id or query in request", 400)

    context_text_for_llm = "No relevant context was found in the available documents."
    rag_references_for_client = []

    if perform_rag:
        queries_to_search = [current_user_query]
        if enable_multi_query:
            try:
                logger.info(f"Generating sub-queries with {llm_provider}...")
                # Pass API keys to sub-query generation
                sub_queries = llm_handler.generate_sub_queries_via_llm(
                    original_query=current_user_query,
                    llm_provider=llm_provider,
                    llm_model_name=llm_model_name,
                    user_gemini_api_key=user_gemini_api_key, # Pass key down
                    user_grok_api_key=user_grok_api_key    # Pass key down
                )
                if sub_queries:
                    logger.info(f"Generated sub-queries: {sub_queries}")
                    queries_to_search.extend(sub_queries)
            except Exception as e: logger.error(f"Error during sub-query generation: {e}", exc_info=True)

        # RAG search logic (does not need keys)
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
            context_text_for_llm = "\n\n---\n\n".join(context_parts)
            rag_references_for_client = [{"documentName": d.metadata.get("documentName"), "score": float(s)} for d, s in docs_for_context]

    try:
        logger.info(f"Calling LLM provider: {llm_provider} for user: {user_id}")

        # Pass API keys to the main response generation
        final_answer, thinking_content = llm_handler.generate_response(
            llm_provider=llm_provider,
            query=current_user_query,
            context_text=context_text_for_llm,
            chat_history=chat_history,      # Pass history
            system_prompt=system_prompt,    # Pass system prompt
            llm_model_name=llm_model_name,
            user_gemini_api_key=user_gemini_api_key, # Pass key down
            user_grok_api_key=user_grok_api_key    # Pass key down
        )

        return jsonify({
            "llm_response": final_answer,
            "references": rag_references_for_client,
            "thinking_content": thinking_content,
            "status": "success"
        }), 200

    except ConnectionError as e: return create_error_response(str(e), 502)
    except Exception as e: return create_error_response(f"Failed to generate chat response: {str(e)}", 500)

# --- Unified Tool Operation Helper ---
def _handle_tool_file_operation(tool_name: str, user_id: str, operation_function: callable,
                                output_subdir_name: str, *args_for_op, is_file_output_expected=True):
    logger.info(f"Tool Op: User='{user_id}', Tool='{tool_name}', OutSubdir='{output_subdir_name}', ArgsCount={len(args_for_op)}")
    user_tool_output_dir = os.path.join(config.DEFAULT_ASSETS_DIR, user_id, output_subdir_name)
    os.makedirs(user_tool_output_dir, exist_ok=True)
    logger.info(f"Output dir for {tool_name}: {user_tool_output_dir}")

    try:
        result_data = operation_function(user_tool_output_dir, *args_for_op)

        if not is_file_output_expected:
            if isinstance(result_data, pd.DataFrame):
                csv_filename = f"{tool_name.replace(' ', '_').lower()}_results.csv"
                csv_full_path = os.path.join(user_tool_output_dir, csv_filename)
                result_data.to_csv(csv_full_path, index=False, encoding='utf-8')
                logger.info(f"Saved {tool_name} DataFrame to {csv_full_path}")
                abs_assets_dir = os.path.abspath(config.DEFAULT_ASSETS_DIR)
                relative_csv_path = os.path.relpath(csv_full_path, abs_assets_dir).replace(os.sep, '/')
                return jsonify({"message": f"{tool_name} completed. Results saved as CSV.",
                                "processed_count": len(result_data),
                                "download_links_relative": [relative_csv_path],
                                "result_type": "dataframe_csv", "status": "success"}), 200
            return jsonify({"message": f"{tool_name} completed without file output.", "result_data": result_data, "status": "success"}), 200

        if not result_data: return create_error_response(f"{tool_name} process completed, but no output files found.", 404)
        generated_files_full_paths = [result_data] if isinstance(result_data, str) else result_data
        if not isinstance(generated_files_full_paths, list):
            return create_error_response(f"Internal error: {tool_name} function returned {type(generated_files_full_paths)}.", 500)

        relative_paths = []
        abs_assets_dir = os.path.abspath(config.DEFAULT_ASSETS_DIR)
        for f_path in generated_files_full_paths:
            if not f_path or not isinstance(f_path, str): continue
            abs_f_path = os.path.abspath(f_path)
            if not abs_f_path.startswith(abs_assets_dir + os.sep) and abs_f_path != abs_assets_dir:
                logger.error(f"Security: File '{abs_f_path}' outside ASSETS_DIR. Skipping.")
                continue
            try: relative_paths.append(os.path.relpath(abs_f_path, abs_assets_dir).replace(os.sep, '/'))
            except ValueError: relative_paths.append(f"{user_id}/{output_subdir_name}/{os.path.basename(abs_f_path)}")
        
        if not relative_paths: return create_error_response(f"{tool_name}: No valid file paths for client.", 500)
        return jsonify({"message": f"Successfully processed {len(relative_paths)} file(s) via {tool_name}.",
                        "processed_count": len(relative_paths),
                        "files_server_paths": generated_files_full_paths,
                        "download_links_relative": relative_paths, "status": "success"}), 200
    except FileNotFoundError as e: return create_error_response(f"Tool Dep for {tool_name} not found: {e}", 500, details=str(e))
    except AttributeError as e: return create_error_response(f"Component for {tool_name} misconfigured (AttributeError): {e}", 501, details=str(e))
    except Exception as e: return create_error_response(f"Failed {tool_name} operation: {e}", 500, details=str(e))

# --- Tool Routes ---
@app.route('/tools/download/youtube', methods=['POST'])
def youtube_download_tool_route():
    data = request.get_json(silent=True) or {}; uid = data.get('user_id', 'guest_user')
    url, qual = data.get('url'), data.get('quality', '720p')
    if not url: return create_error_response("Missing YouTube URL", 400)
    # youtube_dl_core.download_youtube_media(url, quality_profile, output_path)
    return _handle_tool_file_operation("YouTube", uid, 
        lambda out_dir, u, q: youtube_dl_core.download_youtube_media(u, q, out_dir), 
        "youtube_dl", url, qual)

@app.route('/tools/download/web_pdfs', methods=['POST'])
def web_pdf_downloader_tool_route():
    data = request.get_json(silent=True) or {}; uid = data.get('user_id', 'guest_user')
    query, md = data.get('query'), int(data.get('max_downloads', 3))
    if not query: return create_error_response("Missing PDF search query", 400)
    # pdf_downloader.download_relevant_pdfs(base_query, output_folder, max_total_downloads, ...)
    return _handle_tool_file_operation("WebPDFs", uid, 
        lambda out_dir, q_arg, md_arg: pdf_downloader.download_relevant_pdfs(
            base_query=q_arg, output_folder=out_dir, max_total_downloads=md_arg
        ), "web_pdfs", query, md)

@app.route('/tools/create/ppt', methods=['POST'])
def create_ppt_tool_route():
    fname_q, uid_q = request.args.get('filename', 'Presentation.pptx'), request.args.get('user_id', 'guest_user')
    md_content = request.get_data(as_text=True)
    if not md_content or not md_content.strip(): return create_error_response("Markdown content empty", 400)
    if not hasattr(md_to_office, 'create_ppt'): return create_error_response("PPT module missing create_ppt", 501)
    parsed_slides = md_to_office.refined_parse_markdown(md_content)
    # md_to_office.create_ppt expects (slides_data, output_dir, filename) -> returns full_path
    return _handle_tool_file_operation("PPT", uid_q, 
        lambda out_dir, s_data, f_name: md_to_office.create_ppt(s_data, out_dir, f_name), 
        "gen_pptx", parsed_slides, fname_q)

@app.route('/tools/create/doc', methods=['POST'])
def create_doc_tool_route():
    data = request.get_json(silent=True) or {}; uid = data.get('user_id', 'guest_user')
    md_c, key, fname = data.get('markdown_content'), data.get('content_key'), data.get('filename', 'Document.docx')
    if not md_c or not key: return create_error_response("Missing markdown or content_key", 400)
    if not hasattr(md_to_office, 'create_doc'): return create_error_response("DOCX module missing create_doc", 501)
    parsed_slides = md_to_office.refined_parse_markdown(md_c)
    # md_to_office.create_doc expects (slides_data, output_dir, filename, content_key) -> returns full_path
    return _handle_tool_file_operation("DOCX", uid, 
        lambda out_dir, s_data, f_name, c_key: md_to_office.create_doc(s_data, out_dir, f_name, c_key), 
        "gen_docx", parsed_slides, fname, key)

def _save_uploaded_file_temp(flask_file_obj):
    original_filename = flask_file_obj.filename or "uploaded_file"
    safe_suffix = "".join(c for c in os.path.splitext(original_filename)[1] if c.isalnum() or c == '.')
    if not safe_suffix: safe_suffix = ".tmp"
    
    fd, temp_path = tempfile.mkstemp(suffix=safe_suffix)
    os.close(fd) 
    flask_file_obj.save(temp_path)
    return temp_path

@app.route('/tools/ocr/tesseract', methods=['POST'])
def ocr_tesseract_tool_route():
    if 'pdf_file' not in request.files: return create_error_response("No 'pdf_file' in request", 400)
    file = request.files['pdf_file']
    if not file or not file.filename: return create_error_response("No file selected for OCR", 400)
    uid = request.form.get('user_id', 'guest_user')
    tmp_pdf_path = _save_uploaded_file_temp(file)
    try:
        # ocr_tesseract.convert_pdf_to_markdown_tesseract(pdf_path, output_md_path, tesseract_cmd, poppler_path) -> returns bool
        # Wrapper must return path if successful
        def tesseract_op_wrapper(output_dir, pdf_p_temp):
            fname_base = os.path.splitext(os.path.basename(file.filename))[0]
            output_md_full_path = os.path.join(output_dir, f"{fname_base}.md")
            success = ocr_tesseract.convert_pdf_to_markdown_tesseract(
                pdf_p_temp, output_md_full_path, config.TESSERACT_CMD_PATH, config.POPPLER_PATH)
            return output_md_full_path if success else None
        return _handle_tool_file_operation("TesseractOCR", uid, tesseract_op_wrapper, "ocr_tesseract", tmp_pdf_path)
    finally:
        if os.path.exists(tmp_pdf_path): os.unlink(tmp_pdf_path)

@app.route('/tools/ocr/nougat', methods=['POST'])
def ocr_nougat_tool_route():
    if 'pdf_file' not in request.files: return create_error_response("No 'pdf_file' in request", 400)
    file = request.files['pdf_file']
    if not file or not file.filename: return create_error_response("No file selected for OCR", 400)
    uid = request.form.get('user_id', 'guest_user')
    tmp_pdf_path = _save_uploaded_file_temp(file)
    try:
        # ocr_nougat.convert_pdf_with_nougat(pdf_path, output_dir_for_mmd, ...) -> returns path to .mmd
        return _handle_tool_file_operation("NougatOCR", uid,
            lambda out_dir, pdf_p_temp: ocr_nougat.convert_pdf_with_nougat(
                pdf_p_temp, out_dir, nougat_cli_path=config.NOUGAT_CLI_PATH), 
            "ocr_nougat", tmp_pdf_path)
    finally:
        if os.path.exists(tmp_pdf_path): os.unlink(tmp_pdf_path)

@app.route('/tools/search/combined', methods=['POST'])
def combined_search_tool_route():
    data = request.get_json(silent=True) or {}; uid = data.get('user_id', 'guest_user')
    query = data.get('query')
    if not query: return create_error_response("Missing query for combined search", 400)
    search_params = {k: v for k, v in data.items() if k not in ['user_id', 'query']}
    # combined_search.run_combined_search(query, output_dir, **kwargs) -> returns DataFrame
    return _handle_tool_file_operation("CombinedSearch", uid,
        lambda out_dir, q, **sp: combined_search.run_combined_search(query=q, output_dir=out_dir, **sp),
        "academic_search", query, **search_params, is_file_output_expected=False)

@app.route('/tools/search/core', methods=['POST'])
def core_search_tool_route():
    data = request.get_json(silent=True) or {}; uid = data.get('user_id', 'guest_user')
    query = data.get('query')
    core_key = data.get('core_api_key', config.CORE_API_KEY_FROM_ENV)
    dl_pdfs = data.get('download_pdfs', True); max_p = data.get('max_pages', 2)
    if not query: return create_error_response("Missing query for CORE search", 400)
    if not core_key: return create_error_response("CORE API Key not provided/configured", 400)

    # academic_core_api.fetch_all_core_results saves its own CSV.
    # We want _handle_tool_file_operation to link to that CSV.
    def core_op_wrapper(output_dir, key, q_arg, download_flag, mp_arg):
        academic_core_api.fetch_all_core_results(
            core_api_key=key, query=q_arg, output_dir=output_dir, 
            download_pdfs=download_flag, max_pages=mp_arg)
        metadata_csv = os.path.join(output_dir, "core_results_metadata.csv")
        # PDFs are downloaded to output_dir/core_pdfs/. Client needs separate links or a zip.
        # For now, primary downloadable is the metadata CSV.
        return [metadata_csv] if os.path.exists(metadata_csv) else []
        
    return _handle_tool_file_operation("CORESearch", uid, core_op_wrapper,
        "core_search", core_key, query, dl_pdfs, max_p)

# --- File Serving Route ---
@app.route('/files/<path:requested_path>', methods=['GET'])
def serve_tool_generated_file(requested_path):
    logger.info(f"\n--- Python file serving: '{requested_path}' ---")
    assets_base = os.path.abspath(config.DEFAULT_ASSETS_DIR)
    full_path = os.path.normpath(os.path.join(assets_base, requested_path))
    if not full_path.startswith(assets_base + os.sep) and full_path != assets_base:
        return create_error_response("Access denied: Path traversal attempt.", 403)
    if not os.path.isfile(full_path):
        return create_error_response(f"File not found: {requested_path}", 404)
    try:
        return send_from_directory(os.path.dirname(full_path), os.path.basename(full_path), as_attachment=True)
    except Exception as e:
        return create_error_response(f"Error serving file '{requested_path}': {str(e)}", 500, details=str(e))

# --- Main Startup ---
if __name__ == '__main__':
    try:
        faiss_handler.ensure_faiss_dir(); faiss_handler.get_embedding_model(); faiss_handler.load_or_create_index(config.DEFAULT_INDEX_USER_ID)
        logger.info("FAISS init OK.")
    except Exception as e: logger.critical(f"FAISS STARTUP FAIL: {e}", exc_info=True); sys.exit(1)
    
    port, host = config.AI_CORE_SERVICE_PORT, '0.0.0.0'
    logger.info(f"--- Starting Flask on http://{host}:{port} ---")
    logger.info(f"Assets Dir: {os.path.abspath(config.DEFAULT_ASSETS_DIR)}")
    logger.info(f"Tesseract CMD: {config.TESSERACT_CMD_PATH or 'PATH'}, Poppler: {config.POPPLER_PATH or 'PATH'}, Nougat CLI: {config.NOUGAT_CLI_PATH or 'PATH'}")
    app.run(host=host, port=port, debug=os.getenv('FLASK_DEBUG', 'false').lower() in ['true', '1', 't'])