# server/ai_core_service/faiss_handler.py # Corrected path in comment

import os
import faiss
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_core.embeddings import Embeddings as LangchainEmbeddings
from langchain_core.documents import Document as LangchainDocument
from langchain_community.docstore import InMemoryDocstore
from ai_core_service import config # Assuming config.py is in ai_core_service
import numpy as np
import time
import logging
import pickle
import uuid
import shutil

logger = logging.getLogger(__name__)
# Configure logger only if it's not already configured (e.g., by a higher-level module)
if not logger.hasHandlers():
    logger.setLevel(logging.INFO)
    handler = logging.StreamHandler()
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s')
    handler.setFormatter(formatter)
    logger.addHandler(handler)


embedding_model: LangchainEmbeddings | None = None
loaded_indices = {} # Stores (FAISS_instance)
_embedding_dimension = None

# --- Path to FAISS index directory (defined in config.py) ---
FAISS_INDEX_DIR = config.FAISS_INDEX_DIR


def get_embedding_dimension(embedder: LangchainEmbeddings) -> int:
    """Gets and caches the embedding dimension."""
    global _embedding_dimension
    if _embedding_dimension is None:
        try:
            logger.info("Determining embedding dimension...")
            # Ensure the embedder is not None before trying to use it
            if embedder is None:
                logger.error("Embedder is None, cannot determine dimension.")
                raise ValueError("Embedding model (embedder) is not initialized.")
            dummy_embedding = embedder.embed_query("dimension_check")
            dimension = len(dummy_embedding)
            if not isinstance(dimension, int) or dimension <= 0:
                raise ValueError(f"Invalid embedding dimension obtained: {dimension}")
            _embedding_dimension = dimension
            logger.info(f"Detected embedding dimension: {_embedding_dimension}")
        except Exception as e:
            logger.error(f"CRITICAL ERROR determining embedding dimension: {e}", exc_info=True)
            _embedding_dimension = None # Reset on failure
            raise RuntimeError(f"Failed to determine embedding dimension: {e}")
    return _embedding_dimension

def get_embedding_model():
    global embedding_model
    if embedding_model is None:
        if config.EMBEDDING_TYPE == 'sentence-transformer':
            logger.info(f"Initializing HuggingFace Embeddings for Sentence Transformer (Model: {config.EMBEDDING_MODEL_NAME})")
            try:
                device_to_use = 'cpu' # Default to CPU
                try:
                    # Check for FAISS GPU support, not directly for PyTorch CUDA here,
                    # but it's an indicator if GPU environment might be set up.
                    # HuggingFaceEmbeddings will handle PyTorch device placement.
                    if faiss.get_num_gpus() > 0:
                        # If you want to force CUDA for embeddings if available:
                        import torch
                        if torch.cuda.is_available():
                            device_to_use = 'cuda'
                            logger.info("CUDA is available. Attempting to use GPU for embeddings.")
                        else:
                            logger.info("FAISS reports GPU(s), but PyTorch CUDA not available. Using CPU.")
                    else:
                        logger.info("No FAISS-reported GPUs. Using CPU for embeddings.")
                except Exception as gpu_check_err:
                    logger.warning(f"GPU check for FAISS failed ({gpu_check_err}), defaulting to CPU for embeddings.")

                embedding_model_instance = HuggingFaceEmbeddings(
                    model_name=config.EMBEDDING_MODEL_NAME,
                    model_kwargs={'device': device_to_use},
                    encode_kwargs={'normalize_embeddings': True}
                )
                # Test and get dimension
                get_embedding_dimension(embedding_model_instance) # This will raise if it fails
                logger.info(f"Testing embedding function with model '{config.EMBEDDING_MODEL_NAME}' on device '{device_to_use}'...")
                test_embedding_doc = embedding_model_instance.embed_documents(["test document"])
                test_embedding_query = embedding_model_instance.embed_query("test query")
                if not test_embedding_doc or not test_embedding_query:
                    raise ValueError("Embedding test failed, returned empty results.")
                logger.info(f"Embedding test successful.")
                embedding_model = embedding_model_instance # Assign to global only on success
            except Exception as e:
                logger.error(f"Error loading HuggingFace Embeddings for '{config.EMBEDDING_MODEL_NAME}': {e}", exc_info=True)
                embedding_model = None # Ensure it's None on failure
                raise RuntimeError(f"Failed to load embedding model: {e}")
        else:
            raise ValueError(f"Unsupported embedding type in config: {config.EMBEDDING_TYPE}. Expected 'sentence-transformer'.")
    return embedding_model


def get_user_index_path(user_id):
    safe_user_id = str(user_id).replace('.', '_').replace('/', '_').replace('\\', '_')
    user_dir = os.path.join(FAISS_INDEX_DIR, f"user_{safe_user_id}")
    return user_dir

def _delete_index_files(index_path, user_id_for_log):
    logger.warning(f"Deleting index files/directory for '{user_id_for_log}' at {index_path}")
    try:
        if os.path.isdir(index_path):
            shutil.rmtree(index_path)
            logger.info(f"Successfully deleted directory: {index_path}")
        else: # Handle case where only loose files might exist (less likely with save_local)
            index_file_faiss = os.path.join(index_path, "index.faiss") # Langchain saves this
            index_file_pkl = os.path.join(index_path, "index.pkl")     # Langchain saves this
            if os.path.exists(index_file_faiss): os.remove(index_file_faiss)
            if os.path.exists(index_file_pkl): os.remove(index_file_pkl)
            logger.info(f"Checked for loose files at {index_path} (if not a dir).")

    except OSError as e:
        logger.error(f"Error deleting index files/directory for '{user_id_for_log}' at {index_path}: {e}", exc_info=True)


def load_or_create_index(user_id: str) -> FAISS:
    global loaded_indices
    embedder = get_embedding_model() # Ensures model is loaded and dimension is known
    if embedder is None: # Should not happen if get_embedding_model raises on failure
        raise RuntimeError("Embedding model is not available for load_or_create_index.")
    current_embedding_dim = get_embedding_dimension(embedder)


    if user_id in loaded_indices:
        cached_index = loaded_indices[user_id]
        if hasattr(cached_index, 'index') and cached_index.index is not None and cached_index.index.d == current_embedding_dim:
            logger.debug(f"Returning cached and dimension-verified index for user '{user_id}'.")
            return cached_index
        else:
            logger.warning(f"Cached index for user '{user_id}' dimension mismatch (Index: {getattr(cached_index.index, 'd', 'N/A')}, Model: {current_embedding_dim}) or invalid. Forcing reload/recreate.")
            del loaded_indices[user_id]

    index_path = get_user_index_path(user_id)
    # Langchain FAISS saves two files: index.faiss and index.pkl
    faiss_file_path = os.path.join(index_path, "index.faiss")
    pkl_file_path = os.path.join(index_path, "index.pkl")

    force_recreate = False
    if os.path.exists(faiss_file_path) and os.path.exists(pkl_file_path):
        logger.info(f"Attempting to load existing FAISS index for user '{user_id}' from {index_path}")
        try:
            start_time = time.time()
            index = FAISS.load_local(
                folder_path=index_path,
                embeddings=embedder,
                allow_dangerous_deserialization=True
            )
            end_time = time.time()

            if not hasattr(index, 'index') or index.index is None:
                logger.warning(f"Loaded index for user '{user_id}' has no 'index' attribute or it's None. Forcing recreation.")
                force_recreate = True
            elif index.index.d != current_embedding_dim:
                logger.warning(f"DIMENSION MISMATCH! Index for user '{user_id}' (dim {index.index.d}) vs Model (dim {current_embedding_dim}). Recreating.")
                force_recreate = True
            
            if force_recreate:
                _delete_index_files(index_path, user_id)
            else:
                logger.info(f"Index for user '{user_id}' loaded in {end_time - start_time:.2f}s. Dim: {index.index.d}, Vectors: {index.index.ntotal}.")
                loaded_indices[user_id] = index
                return index
        except Exception as load_err:
            logger.error(f"Error loading index for user '{user_id}' from {index_path}: {load_err}", exc_info=True)
            _delete_index_files(index_path, user_id)
            force_recreate = True
    
    # Create new index if it doesn't exist or forced recreation
    logger.info(f"Creating new FAISS index for user '{user_id}' at {index_path} (Dim: {current_embedding_dim})")
    try:
        os.makedirs(index_path, exist_ok=True)
        # For FAISS with Langchain, we initialize an empty one if creating from scratch with no docs
        # Typically, FAISS.from_documents or FAISS.from_texts is used if you have initial docs.
        # If starting truly empty and adding later:
        empty_docs = [LangchainDocument(page_content="initialization_vector", metadata={"source": "init"})] # Add a dummy doc
        
        # Create a new FAISS index. Langchain's FAISS class handles the underlying faiss.Index object.
        # It will use IndexFlatL2 by default if not specified, or IndexFlatIP if normalize_L2=True
        index = FAISS.from_documents(empty_docs, embedder, normalize_L2=True) # normalize_L2 for IP with normalized embeddings
        
        # Immediately remove the dummy document if you want it truly empty, but keep the structure
        # This is a bit of a workaround for creating a "blank" Langchain FAISS index.
        # A more direct way with underlying faiss:
        #   raw_faiss_index = faiss.IndexIDMap(faiss.IndexFlatIP(current_embedding_dim))
        #   docstore = InMemoryDocstore({})
        #   index_to_docstore_id = {}
        #   index = FAISS(embedding_function=embedder, index=raw_faiss_index, docstore=docstore, index_to_docstore_id=index_to_docstore_id, normalize_L2=True)
        # For simplicity, from_documents with a dummy and then optionally clearing it.
        # Or, just let the first real add_documents populate it.
        # Let's remove the dummy doc if we added one. We need its ID.
        # This part is tricky with from_documents as it assigns its own IDs.
        # For a truly empty start that can be saved:
        if index.index.ntotal > 0: # If dummy doc was added
            ids_to_remove_np = np.array([i for i in range(index.index.ntotal)], dtype=np.int64)
            if hasattr(index.index, "remove_ids"): # check if underlying faiss index supports remove_ids
                 index.index.remove_ids(ids_to_remove_np)
                 logger.info("Removed initialization vector after creating new index structure.")
            else: # If not, it means the dummy doc is there. Not ideal but won't break things.
                 logger.warning("Could not remove initialization vector, underlying index type may not support remove_ids.")
            # Also clear docstore and index_to_docstore_id for the dummy doc
            index.docstore = InMemoryDocstore({})
            index.index_to_docstore_id = {}


        index.save_local(index_path) # Save the empty or near-empty structure
        logger.info(f"New empty index for user '{user_id}' created and saved.")
        loaded_indices[user_id] = index
        return index
    except Exception as e:
        logger.error(f"CRITICAL ERROR creating new index for user '{user_id}': {e}", exc_info=True)
        if user_id in loaded_indices: del loaded_indices[user_id]
        _delete_index_files(index_path, user_id) # Attempt cleanup
        raise RuntimeError(f"Failed to initialize FAISS index for user '{user_id}'")

def add_documents_to_index(user_id: str, documents: list[LangchainDocument]):
    if not documents:
        logger.warning(f"No documents provided to add for user '{user_id}'.")
        return

    try:
        index = load_or_create_index(user_id)
        embedder = get_embedding_model()
        current_dim = get_embedding_dimension(embedder)

        if not hasattr(index, 'index') or index.index is None or index.index.d != current_dim:
             logger.error(f"Index for user '{user_id}' is invalid or dimension mismatch before adding. Index Dim: {getattr(index.index, 'd', 'N/A')}, Model Dim: {current_dim}")
             _delete_index_files(get_user_index_path(user_id), user_id) # Clean up bad index
             if user_id in loaded_indices: del loaded_indices[user_id]
             raise RuntimeError(f"Index inconsistent for user '{user_id}'. Please retry operation.")

        logger.info(f"Adding {len(documents)} documents to index for user '{user_id}'. Current vectors: {index.index.ntotal}")
        start_time = time.time()
        
        # Langchain's FAISS.add_documents handles embedding and adding to FAISS index and docstore
        new_doc_ids = index.add_documents(documents) # Returns list of Langchain-generated doc IDs (UUIDs)
        
        end_time = time.time()
        logger.info(f"Successfully added {len(documents)} documents (IDs: {new_doc_ids}) for user '{user_id}' in {end_time - start_time:.2f} seconds. Total vectors: {index.index.ntotal}")
        save_index(user_id)
    except Exception as e:
        logger.error(f"Error adding documents for user '{user_id}': {e}", exc_info=True)
        raise


def query_index(user_id: str, query_text: str, k: int = 3) -> list[tuple[LangchainDocument, float]]:
    all_results_with_scores = []
    embedder = get_embedding_model()
    if embedder is None:
        logger.error("Embedding model is not available for query.")
        raise ConnectionError("Embedding model is not available for query.")

    try:
        start_time_total_query = time.time()
        
        # Query User Index
        try:
            user_index = load_or_create_index(user_id)
            if hasattr(user_index, 'index') and user_index.index is not None and user_index.index.ntotal > 0:
                logger.info(f"Querying user index '{user_id}' (Dim: {user_index.index.d}, Vectors: {user_index.index.ntotal}) for '{query_text[:50]}...' with k={k}")
                user_results = user_index.similarity_search_with_score(query_text, k=k)
                logger.info(f"User index '{user_id}' query returned {len(user_results)} results.")
                all_results_with_scores.extend(user_results)
            else:
                logger.info(f"User index '{user_id}' is empty or invalid. Skipping query.")
        except Exception as e: # Catch broad exception for user index query
            logger.error(f"Error querying user index for '{user_id}': {e}", exc_info=True)


        # Query Default Index (if different from user_id and it's configured)
        if config.DEFAULT_INDEX_USER_ID and user_id != config.DEFAULT_INDEX_USER_ID:
            try:
                default_index = load_or_create_index(config.DEFAULT_INDEX_USER_ID)
                if hasattr(default_index, 'index') and default_index.index is not None and default_index.index.ntotal > 0:
                    logger.info(f"Querying default index '{config.DEFAULT_INDEX_USER_ID}' (Dim: {default_index.index.d}, Vectors: {default_index.index.ntotal}) for '{query_text[:50]}...' with k={k}")
                    default_results = default_index.similarity_search_with_score(query_text, k=k)
                    logger.info(f"Default index '{config.DEFAULT_INDEX_USER_ID}' query returned {len(default_results)} results.")
                    all_results_with_scores.extend(default_results)
                else:
                    logger.info(f"Default index '{config.DEFAULT_INDEX_USER_ID}' is empty or invalid. Skipping query.")
            except Exception as e: # Catch broad exception for default index query
                 logger.error(f"Error querying default index '{config.DEFAULT_INDEX_USER_ID}': {e}", exc_info=True)

        logger.info(f"Completed all index queries in {time.time() - start_time_total_query:.2f} seconds. Found {len(all_results_with_scores)} raw results before deduplication.")

        unique_results_map = {} # Store content hash -> (doc, score)
        for doc, score in all_results_with_scores:
            if not isinstance(doc, LangchainDocument) or not hasattr(doc, 'page_content') or not hasattr(doc, 'metadata'):
                logger.warning(f"Skipping malformed document in query results: {doc}")
                continue
            
            # Create a key for deduplication. Using page_content for exact match.
            # Could also use a hash of page_content for very long content.
            # serverFilename in metadata helps if content might be identical across different original files.
            content_key = doc.page_content 
            if doc.metadata.get("serverFilename"): # More robust dedupe if serverFilename is reliable
                content_key = f"{doc.metadata['serverFilename']}_{doc.page_content}"

            if content_key not in unique_results_map or score < unique_results_map[content_key][1]:
                unique_results_map[content_key] = (doc, score)
        
        # Sort by score (similarity_search_with_score returns distance, so lower is better)
        sorted_unique_results = sorted(unique_results_map.values(), key=lambda item: item[1])
        
        final_k_results = sorted_unique_results[:k]
        logger.info(f"Returning {len(final_k_results)} unique, sorted results for k={k}.")
        return final_k_results
        
    except Exception as e:
        logger.error(f"General error during query_index for user '{user_id}', query '{query_text[:50]}...': {e}", exc_info=True)
        return []


def save_index(user_id: str):
    global loaded_indices
    if user_id not in loaded_indices:
        logger.warning(f"Index for user '{user_id}' not found in cache, cannot save.")
        return
    
    index_instance = loaded_indices[user_id]
    index_path = get_user_index_path(user_id)

    if not isinstance(index_instance, FAISS) or \
       not hasattr(index_instance, 'index') or \
       not hasattr(index_instance, 'docstore') or \
       not hasattr(index_instance, 'index_to_docstore_id'):
        logger.error(f"Cannot save index for user '{user_id}': Invalid FAISS object in cache.")
        return

    try:
        os.makedirs(index_path, exist_ok=True)
        num_vectors = index_instance.index.ntotal if hasattr(index_instance.index, 'ntotal') else 'N/A'
        logger.info(f"Saving FAISS index for user '{user_id}' to {index_path} (Vectors: {num_vectors})...")
        start_time = time.time()
        index_instance.save_local(folder_path=index_path) # Saves index.faiss and index.pkl
        end_time = time.time()
        logger.info(f"Index for user '{user_id}' saved successfully in {end_time - start_time:.2f} seconds.")
    except Exception as e:
        logger.error(f"Error saving FAISS index for user '{user_id}' to {index_path}: {e}", exc_info=True)


def ensure_faiss_dir():
    try:
        os.makedirs(FAISS_INDEX_DIR, exist_ok=True)
        logger.info(f"Ensured FAISS base directory exists: {FAISS_INDEX_DIR}")
    except OSError as e:
        logger.error(f"Could not create FAISS base directory {FAISS_INDEX_DIR}: {e}")
        raise


# --- Functions to be added/corrected ---

def remove_documents_from_index(user_id: str, server_filename: str) -> int:
    """
    Removes document chunks associated with a server_filename from the user's index.
    This is complex with raw FAISS and Langchain's FAISS wrapper if not using a vector DB.
    This implementation reloads, filters, and rebuilds/resaves the index.
    It's not the most performant for very large, frequently updated indices.
    """
    logger.info(f"Attempting to remove docs with server_filename='{server_filename}' for user='{user_id}'")
    index_path = get_user_index_path(user_id)
    faiss_file = os.path.join(index_path, "index.faiss")
    pkl_file = os.path.join(index_path, "index.pkl")

    if not os.path.exists(faiss_file) or not os.path.exists(pkl_file):
        logger.warning(f"Index for user '{user_id}' not found at {index_path}. Cannot remove document '{server_filename}'.")
        return 0

    embedder = get_embedding_model()
    if not embedder:
        logger.error("Embedding model not loaded, cannot proceed with document removal.")
        raise RuntimeError("Embedding model not loaded for remove_documents_from_index.")

    try:
        # Load the current index
        current_index = FAISS.load_local(index_path, embedder, allow_dangerous_deserialization=True)
        
        # Get all doc IDs and their metadata from the docstore
        # The keys in index_to_docstore_id are the raw FAISS vector IDs (integers)
        # The values are the Langchain docstore IDs (UUID strings)
        # The docstore keys are these UUID strings
        
        ids_to_delete_faiss = [] # Raw FAISS integer IDs
        docstore_ids_to_delete_lc = [] # Langchain docstore UUIDs (strings)
        
        # We need to iterate through the docstore to find documents matching the server_filename
        # This is inefficient but necessary with the default Langchain FAISS setup.
        all_lc_doc_ids = list(current_index.docstore._dict.keys())
        kept_documents = []
        removed_doc_parts_count = 0

        for lc_doc_id in all_lc_doc_ids:
            doc = current_index.docstore.search(lc_doc_id)
            if doc and doc.metadata.get("serverFilename") == server_filename:
                removed_doc_parts_count += 1
                # We can't easily map this lc_doc_id back to a list of FAISS int IDs
                # if one Langchain doc was split into multiple vectors by older logic.
                # The robust way is to rebuild the index with only the documents to keep.
            elif doc: # Keep this document
                kept_documents.append(doc)
            else:
                logger.warning(f"Could not find document for Langchain ID {lc_doc_id} in docstore during removal process.")


        if removed_doc_parts_count == 0:
            logger.info(f"No document parts found matching server_filename='{server_filename}' for user='{user_id}'.")
            return 0
        
        logger.info(f"Identified {removed_doc_parts_count} document parts to remove for '{server_filename}'. "
                    f"{len(kept_documents)} document parts will be kept.")

        # If all documents are removed, we can just delete the index files.
        if not kept_documents:
            logger.info(f"All document parts for user '{user_id}' are being removed or no documents to keep. Deleting index files.")
            _delete_index_files(index_path, user_id)
            if user_id in loaded_indices:
                del loaded_indices[user_id] # Clear from cache
            return removed_doc_parts_count

        # Rebuild the index from the kept documents
        logger.info(f"Rebuilding index for user '{user_id}' with {len(kept_documents)} documents.")
        # Delete old index files before creating new one to avoid conflicts
        _delete_index_files(index_path, f"{user_id} (pre-rebuild for delete)") # Log clearly

        new_index = FAISS.from_documents(kept_documents, embedder, normalize_L2=True)
        new_index.save_local(index_path)
        
        loaded_indices[user_id] = new_index # Update cache
        logger.info(f"Successfully removed {removed_doc_parts_count} parts and rebuilt index for '{server_filename}', user '{user_id}'.")
        return removed_doc_parts_count

    except Exception as e:
        logger.error(f"Error removing/rebuilding documents for server_filename='{server_filename}', user='{user_id}': {e}", exc_info=True)
        # It's safer to clear the cache if the operation failed, to force a clean load next time.
        if user_id in loaded_indices:
            del loaded_indices[user_id]
        raise


def update_document_metadata(user_id: str, server_filename: str, new_metadata_values: dict) -> int:
    """
    Updates metadata for document chunks associated with a server_filename.
    Primarily used for 'documentName'. Modifies the .pkl file.
    """
    logger.info(f"Attempting to update metadata for server_filename='{server_filename}' for user='{user_id}' with {new_metadata_values}")
    index_path = get_user_index_path(user_id)
    # Langchain FAISS stores docstore and index_to_docstore_id in index.pkl
    pkl_file = os.path.join(index_path, "index.pkl") 

    if not os.path.exists(pkl_file):
        logger.warning(f"Metadata file (index.pkl) not found for user '{user_id}' at {index_path}. Cannot update metadata for '{server_filename}'.")
        return 0

    embedder = get_embedding_model() # Needed if we have to reload the index object
    if not embedder:
        logger.error("Embedding model not loaded, cannot proceed with metadata update.")
        raise RuntimeError("Embedding model not loaded for update_document_metadata.")

    try:
        # To modify metadata safely, we need to load the FAISS object,
        # modify its docstore, and then save it again.
        # Direct manipulation of the pkl file is risky.
        
        index_instance = FAISS.load_local(index_path, embedder, allow_dangerous_deserialization=True)
        
        updated_count = 0
        # Iterate through the docstore directly. Keys are Langchain-generated UUIDs.
        for lc_doc_id, doc in index_instance.docstore._dict.items():
            if hasattr(doc, 'metadata') and doc.metadata.get("serverFilename") == server_filename:
                for key, value in new_metadata_values.items():
                    doc.metadata[key] = value # Modify in-place
                updated_count += 1
        
        if updated_count > 0:
            # Save the entire FAISS object again to persist docstore changes
            index_instance.save_local(index_path)
            # Update the cached version if it exists
            loaded_indices[user_id] = index_instance 
            logger.info(f"Successfully updated metadata for {updated_count} entries for '{server_filename}' for user '{user_id}'.")
        else:
            logger.info(f"No document parts found with server_filename='{server_filename}' to update for user='{user_id}'.")
            
        return updated_count

    except Exception as e:
        logger.error(f"Error updating metadata for server_filename='{server_filename}', user='{user_id}': {e}", exc_info=True)
        # If update fails, it's safer to clear the cache to avoid inconsistent state.
        if user_id in loaded_indices:
            del loaded_indices[user_id]
        raise