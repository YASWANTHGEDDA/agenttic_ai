# FusedChatbot/server/ai_core_service/modules/web_resources/pdf_downloader.py
import duckduckgo_search
import requests
import os
import arxiv # Ensure 'arxiv' package is installed
import re
from urllib.parse import urlparse
import time
import random
import logging # Added for better logging

logger = logging.getLogger(__name__)

def is_pdf_url(url):
    """Checks if a URL likely points to a PDF by its extension."""
    return url.lower().endswith('.pdf')

def is_arxiv_url_check(url):
    """Checks if a URL is from an arxiv.org domain."""
    parsed_url = urlparse(url)
    return "arxiv.org" in parsed_url.netloc

def extract_arxiv_id_from_url(url):
    """Extracts arXiv ID from common arXiv URL patterns."""
    match = re.search(r'arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5}(?:v\d+)?)', url)
    if match:
        return match.group(1)
    return None

def download_arxiv_pdf_resource(arxiv_id, output_folder, filename_prefix="arxiv_"):
    """Downloads a PDF from arXiv given its ID."""
    os.makedirs(output_folder, exist_ok=True)
    # Sanitize arxiv_id for filename
    safe_arxiv_id = arxiv_id.replace('.', '_').replace('/', '_')
    base_filename = f"{filename_prefix}{safe_arxiv_id}.pdf"
    filepath = os.path.join(output_folder, base_filename)

    # Prevent overwriting by adding a number if it exists
    counter = 1
    temp_filepath = filepath
    while os.path.exists(temp_filepath):
        name, ext = os.path.splitext(filepath)
        temp_filepath = f"{name}_{counter}{ext}"
        counter += 1
    filepath = temp_filepath

    try:
        logger.info(f"Searching arXiv for ID: {arxiv_id}")
        search = arxiv.Search(id_list=[arxiv_id])
        paper = next(search.results(), None)
        
        if paper and paper.pdf_url:
            logger.info(f"Downloading from arXiv PDF URL: {paper.pdf_url} to {filepath}")
            response = requests.get(paper.pdf_url, stream=True, timeout=60) # Increased timeout
            response.raise_for_status()
            
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            logger.info(f"Successfully downloaded arXiv PDF: {filepath}")
            return filepath
        else:
            logger.warning(f"Could not find arXiv paper or PDF URL for ID: {arxiv_id}")
            return None
    except StopIteration:
        logger.warning(f"No paper found on arXiv for ID: {arxiv_id}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Error downloading arXiv PDF {arxiv_id} from {paper.pdf_url if 'paper' in locals() and paper and paper.pdf_url else 'N/A'}: {e}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred downloading arXiv PDF {arxiv_id}: {e}", exc_info=True)
        return None

def download_general_pdf_resource(url, output_folder, filename_base="doc_"):
    """Downloads a general PDF from a URL if it's a PDF."""
    os.makedirs(output_folder, exist_ok=True)
    
    parsed_url = urlparse(url)
    url_filename_part = os.path.basename(parsed_url.path)
    
    if url_filename_part:
        name_without_ext, ext = os.path.splitext(url_filename_part)
        # Further sanitize, especially if name_without_ext could be very long or problematic
        sanitized_name = re.sub(r'[^\w\.-]', '_', name_without_ext) 
        base_name_for_file = sanitized_name[:50] or 'downloaded_file' # Limit length
    else:
        # Create a more unique fallback name if path is empty
        host_part = parsed_url.netloc.replace('.', '_')[:20]
        random_suffix = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=5))
        base_name_for_file = f"url_dl_{host_part}_{random_suffix}"

    final_filename = f"{filename_base}{base_name_for_file}.pdf" # Always add .pdf here
    filepath = os.path.join(output_folder, final_filename)

    counter = 1
    temp_filepath = filepath
    while os.path.exists(temp_filepath):
        name, ext = os.path.splitext(filepath) # Use original filepath for split
        temp_filepath = f"{name}_{counter}{ext}"
        counter += 1
    filepath = temp_filepath
        
    try:
        logger.info(f"Attempting to download general PDF: {url} to {filepath}")
        response = requests.get(url, stream=True, timeout=60, headers={'User-Agent': 'Mozilla/5.0'}) # Increased timeout
        response.raise_for_status()
        
        content_type = response.headers.get('Content-Type', '').lower()
        # More robust check: content disposition might also indicate filename with .pdf
        content_disposition = response.headers.get('Content-Disposition', '')
        
        if 'application/pdf' in content_type or is_pdf_url(url) or (is_pdf_url(content_disposition)):
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)
            logger.info(f"Successfully downloaded general PDF: {filepath}")
            return filepath
        else:
            logger.warning(f"URL does not seem to be a PDF (Content-Type: {content_type}, URL: {url}). Skipping download.")
            if os.path.exists(filepath): # Should not exist if not downloaded
                try: os.unlink(filepath)
                except OSError: pass 
            return None
    except requests.exceptions.HTTPError as e:
        logger.error(f"HTTP error downloading general PDF from {url}: {e.response.status_code} {e.response.reason}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error downloading general PDF from {url}: {e}")
        return None
    except Exception as e:
        logger.error(f"An unexpected error occurred downloading general PDF from {url}: {e}", exc_info=True)
        return None

def filter_links_with_llm(links, query_context, gemini_model_instance=None): # Added default None
    """
    Filters links using a Gemini model for relevance.
    (This is a conceptual function; actual implementation depends on your gemini_model_instance)
    """
    if not gemini_model_instance:
        logger.info("Gemini model not provided for LLM filtering. All links considered relevant.")
        return links

    relevant_links = []
    logger.info(f"LLM Filtering {len(links)} links for query context: '{query_context}'")
    for link_idx, link in enumerate(links):
        prompt = f"Is this link highly relevant to the topic of '{query_context}'? Only answer YES or NO. URL: {link}"
        try:
            # Placeholder for actual Gemini API call
            # response = gemini_model_instance.generate_content(prompt)
            # response_text = response.text.strip().upper()
            # if response_text == "YES":
            #    relevant_links.append(link)
            #    logger.debug(f"LLM classified as relevant: {link}")
            # else:
            #    logger.debug(f"LLM classified as NOT relevant: {link} (Response: {response_text})")

            # MOCK IMPLEMENTATION (Remove for real LLM)
            logger.debug(f"LLM Filtering (MOCK): Considering link {link_idx+1} '{link}' relevant for '{query_context}'")
            relevant_links.append(link) # Mock: all links are relevant
            
            if (link_idx + 1) % 5 == 0: # Avoid hitting rate limits if any
                time.sleep(1) 
        except Exception as e:
            logger.error(f"Error during LLM filtering for link {link}: {e}")
            # Decide if you want to include the link on error or not
            # relevant_links.append(link) # Example: include on error to be safe
    logger.info(f"LLM Filtering complete. {len(relevant_links)} links deemed relevant.")
    return relevant_links


def web_search_ddg(query, max_results=20): # Increased default for better filtering later
    """Performs a web search using DuckDuckGo and yields PDF links."""
    logger.info(f"Searching DuckDuckGo for: '{query} filetype:pdf' (targeting {max_results} results)")
    ddg = duckduckgo_search.DDGS()    
    pdf_links = []
    try:
        # Fetch more results initially as not all will be PDFs or unique
        results_iterator = ddg.text(f"{query} filetype:pdf OR intitle:pdf OR inurl:pdf", max_results=max_results * 3)
        
        seen_ddg_urls = set()
        for result in results_iterator:
            href = result.get("href")
            if href and is_pdf_url(href) and href not in seen_ddg_urls:
                pdf_links.append(href)
                seen_ddg_urls.add(href)
                if len(pdf_links) >= max_results:
                    break
        
        # Broader search if not enough PDFs found
        if len(pdf_links) < max_results // 2: # If significantly less than desired
            logger.info(f"DDG direct PDF search found {len(pdf_links)}. Trying broader search for '{query}'.")
            results_broad_iterator = ddg.text(query, max_results=max_results * 3)
            for result in results_broad_iterator:
                href = result.get("href")
                if href and is_pdf_url(href) and href not in seen_ddg_urls:
                    pdf_links.append(href)
                    seen_ddg_urls.add(href)
                    if len(pdf_links) >= max_results:
                        break
    except Exception as e:
        logger.error(f"Error during DuckDuckGo search for '{query}': {e}", exc_info=True)
    
    logger.info(f"DuckDuckGo search for '{query}' found {len(pdf_links)} potential PDF links.")
    return pdf_links[:max_results]


def arxiv_search_lib(query, max_results=10): # Increased default
    """Searches arXiv using the 'arxiv' library and returns PDF URLs."""
    logger.info(f"Searching arXiv for: '{query}' (targeting {max_results} results)")
    try:
        search = arxiv.Search(
            query=query,
            max_results=max_results, # Library handles fetching this many
            sort_by=arxiv.SortCriterion.Relevance
        )
        arxiv_pdf_urls = [result.pdf_url for result in search.results() if result.pdf_url]
        logger.info(f"arXiv search for '{query}' found {len(arxiv_pdf_urls)} PDF links.")
        return arxiv_pdf_urls
    except Exception as e:
        logger.error(f"Error during arXiv library search for '{query}': {e}", exc_info=True)
        return []

# RENAMED FUNCTION and adjusted parameters
def download_pdfs_from_query(base_query, output_folder, 
                             max_total_downloads=3, # Default from app.py
                             gemini_model_instance=None, 
                             query_variants=None, 
                             max_ddg_results_per_query=10, # Internal detail
                             max_arxiv_results_per_query=5   # Internal detail
                             ):
    """
    Searches for and downloads relevant PDF materials based on a query.
    This is the main entry point called by the Flask app.
    """
    logger.info(f"Starting PDF download process. Base Query: '{base_query}', Output: '{output_folder}', Max Downloads: {max_total_downloads}")
    os.makedirs(output_folder, exist_ok=True)
    downloaded_files_paths = []
    globally_seen_urls = set() 

    all_queries = [base_query]
    if query_variants: # If app.py sends variants, use them
        for qv in query_variants:
            if qv not in all_queries:
                all_queries.append(qv)
    # else: consider generating variants here if desired

    for query_idx, current_query in enumerate(all_queries):
        if len(downloaded_files_paths) >= max_total_downloads:
            logger.info("Reached maximum total PDF downloads limit.")
            break
        
        logger.info(f"\nProcessing Query #{query_idx+1}/{len(all_queries)}: '{current_query}'")
        
        # Search sources - get potential PDF links
        current_ddg_links = web_search_ddg(current_query, max_results=max_ddg_results_per_query)
        current_arxiv_links = arxiv_search_lib(current_query, max_results=max_arxiv_results_per_query)
        
        # Combine and deduplicate links for the current query before LLM filtering
        unique_links_for_current_query = []
        for link in current_ddg_links + current_arxiv_links:
            if link and link not in globally_seen_urls: # Check against global set
                unique_links_for_current_query.append(link)
                globally_seen_urls.add(link) # Add to global set once processed for this query
        
        if not unique_links_for_current_query:
            logger.info(f"No new unique PDF links found for query: '{current_query}'")
            continue

        logger.info(f"Found {len(unique_links_for_current_query)} new unique links for '{current_query}'. Proceeding to filter...")
        
        # Filter links (using LLM if provided, otherwise all are "relevant")
        # LLM filtering should ideally happen *before* attempting downloads to save resources
        relevant_links_for_download = filter_links_with_llm(
            unique_links_for_current_query, 
            current_query, # Use current query as context for LLM
            gemini_model_instance
        )
        logger.info(f"{len(relevant_links_for_download)} links considered relevant for '{current_query}' after filtering.")

        # Download relevant PDFs
        for link_idx, link_url in enumerate(relevant_links_for_download):
            if len(downloaded_files_paths) >= max_total_downloads:
                logger.info("Reached maximum total PDF downloads limit during download phase.")
                break # Break from inner loop (downloading for current query)

            logger.info(f"Attempting Download #{link_idx+1}/{len(relevant_links_for_download)} for relevant link: {link_url}")
            downloaded_filepath = None
            filename_prefix_query_part = re.sub(r'\W+', '_', current_query[:20]) # Create a prefix from query

            if is_arxiv_url_check(link_url):
                arxiv_id = extract_arxiv_id_from_url(link_url)
                if arxiv_id:
                    downloaded_filepath = download_arxiv_pdf_resource(arxiv_id, output_folder, filename_prefix=f"arxiv_{filename_prefix_query_part}_")
                else: 
                    logger.warning(f"Could not extract arXiv ID from {link_url}, attempting general download.")
                    downloaded_filepath = download_general_pdf_resource(link_url, output_folder, filename_base=f"arxiv_fallback_{filename_prefix_query_part}_")
            elif is_pdf_url(link_url): 
                downloaded_filepath = download_general_pdf_resource(link_url, output_folder, filename_base=f"doc_{filename_prefix_query_part}_")
            else:
                logger.warning(f"Skipping download for non-PDF or non-arXiv link (already filtered by LLM if active): {link_url}")

            if downloaded_filepath and downloaded_filepath not in downloaded_files_paths: 
                downloaded_files_paths.append(downloaded_filepath)
                logger.info(f"Successfully added to download list: {downloaded_filepath}")
            
            # Be respectful to servers
            time.sleep(random.uniform(1.5, 3.5)) 

    logger.info(f"\n--- PDF Download Process Finished ---")
    logger.info(f"Total PDFs successfully downloaded: {len(downloaded_files_paths)}")
    if downloaded_files_paths:
        for fpath in downloaded_files_paths:
            logger.info(f"  - {fpath}")
    else:
        logger.info("  No PDFs were downloaded.")
        
    return downloaded_files_paths