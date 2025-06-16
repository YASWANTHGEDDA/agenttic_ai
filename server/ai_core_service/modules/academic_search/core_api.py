# modules/academic_search/core_api.py
import requests
import pandas as pd
import os
import time
import random 

def download_file_core(url, filename):
    """Downloads a file from a given URL."""
    try:
        response = requests.get(url, stream=True, timeout=30)
        response.raise_for_status()
        with open(filename, "wb") as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        return True
    except requests.exceptions.RequestException as e:
        print(f"Error downloading {url}: {e}")
        return False

def fetch_core_page(core_api_key, query, page, page_size):
    """Fetches a single page of results from the CORE API."""
    base_url = "https://api.core.ac.uk/v3/search/works"
    headers = {"Authorization": f"Bearer {core_api_key}"}
    params = {
        "q": query,
        "page": page,
        "pageSize": page_size,
        "fulltext": "true"  # Requesting works with fulltext available
    }
    response = requests.get(base_url, headers=headers, params=params, timeout=30)
    response.raise_for_status()
    return response.json()

def fetch_all_core_results(core_api_key, query, output_dir, page_size=10, max_pages=None, download_pdfs=True):
    """
    Fetches all results from CORE API for a given query, optionally downloads PDFs.

    Args:
        core_api_key (str): Your CORE API key.
        query (str): The search query.
        output_dir (str): Directory to save downloaded PDFs and the CSV of results.
        page_size (int): Number of results per page (max 100).
        max_pages (int, optional): Maximum number of pages to fetch. Defaults to None (all pages).
        download_pdfs (bool): Whether to download PDF files. Defaults to True.

    Returns:
        pd.DataFrame: DataFrame containing the fetched records.
    """
    os.makedirs(output_dir, exist_ok=True)
    pdf_output_sub_dir = os.path.join(output_dir, "core_pdfs")
    os.makedirs(pdf_output_sub_dir, exist_ok=True)

    all_records = []
    page = 1
    downloaded_count = 0

    while True:
        print(f"Fetching CORE page {page} for query: '{query}'...")
        try:
            data = fetch_core_page(core_api_key, query, page, page_size)
        except requests.HTTPError as e:
            print(f"HTTPError fetching CORE page {page}: {e}")
            if e.response.status_code == 401:
                print("CORE API Key is invalid or expired.")
            elif e.response.status_code == 429:
                print("Rate limit exceeded for CORE API. Sleeping and will retry or stop if max_pages hit.")
                time.sleep(60) # Sleep longer for rate limits
                # Optionally, you could implement retries here
            break # Stop on other HTTP errors or after handling rate limit for this attempt

        results = data.get("results", [])
        if not results:
            print("No more results from CORE.")
            break

        for idx, work in enumerate(results):
            title = work.get("title", "Untitled")
            abstract = work.get("abstract", "")
            download_url = work.get("downloadUrl", "")
            
            # Sanitize title for filename
            safe_title = "".join(c for c in title if c.isalnum() or c in (' ', '-', '_')).rstrip().replace(' ', '_')
            filename_base = f"{page}_{idx}_{safe_title[:50]}"
            pdf_filename = os.path.join(pdf_output_sub_dir, f"{filename_base}.pdf") if download_url else ""

            record = {
                "title": title,
                "abstract": abstract,
                "download_url": download_url,
                "local_filename": "", # Initialize as empty
                "source": "CORE"
            }

            if download_pdfs and download_url:
                print(f"Attempting to download: {download_url}")
                if download_file_core(download_url, pdf_filename):
                    print(f"Downloaded: {pdf_filename}")
                    record["local_filename"] = pdf_filename
                    downloaded_count += 1
                else:
                    print(f"Failed to download {download_url}")
            
            all_records.append(record)

        total_hits = data.get("totalHits", 0)
        print(f"Fetched {len(results)} results from page {page}. Total potential hits: {total_hits}")

        page += 1
        if max_pages and page > max_pages:
            print(f"Reached max_pages limit of {max_pages}.")
            break
        
        # Respect rate limits
        time_sleep = random.randint(5, 15) # Shorter sleep between pages, longer if 429 hit
        print(f"Sleeping for {time_sleep} seconds before next CORE page...")
        time.sleep(time_sleep)

    df = pd.DataFrame(all_records)
    if not df.empty:
        csv_path = os.path.join(output_dir, "core_results_metadata.csv")
        df.to_csv(csv_path, index=False)
        print(f"Saved CORE metadata to {csv_path}")
    
    print(f"Total records fetched from CORE: {len(df)}")
    if download_pdfs:
        print(f"Total PDFs downloaded from CORE: {downloaded_count}")
    return df