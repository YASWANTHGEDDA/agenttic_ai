# modules/academic_search/openalex_api.py
import requests
import pandas as pd
import time
 
def reconstruct_abstract_openalex(inverted_index):
    """
    Reconstructs the abstract from OpenAlex's inverted index format.
    """
    if not isinstance(inverted_index, dict):
        return ""
    
    words_with_positions = []
    for word, positions in inverted_index.items():
        for pos in positions:
            words_with_positions.append((pos, word))
    
    # Sort by position
    words_with_positions.sort(key=lambda x: x[0])
    
    # Join words to form the abstract
    return " ".join([word for pos, word in words_with_positions])

def search_openalex(query, per_page=100, max_records=1000, 
                    all_types=True, journals=False, conference=False, book_chapter=False):
    """
    Search OpenAlex API for works matching a query.

    Args:
        query (str): Search string.
        per_page (int): Number of results per page (max 200).
        max_records (int): Maximum number of records to fetch.
        all_types (bool): If True, ignore other type flags and include all.
        journals (bool): Include journal articles.
        conference (bool): Include conference proceedings.
        book_chapter (bool): Include book chapters.

    Returns:
        pd.DataFrame: DataFrame with columns 'title', 'abstract', 'year', 'citations', 'source'.
    """
    base_url = "https://api.openalex.org/works"
    # Using a polite email in the User-Agent is good practice for APIs
    headers = {'User-Agent': 'YourAppName/1.0 (mailto:your.email@example.com; further contact details)'}
    
    params = {
        "per_page": min(per_page, 200), # API max is 200
        "sort": "relevance_score:desc",
        "filter": f"title_and_abstract.search:{query.replace(' ', '+')}", # Ensure query is URL-encoded
        "cursor": "*"  # Start with the initial cursor for deep pagination
    }

    records = []
    total_fetched = 0
    
    print(f"Starting OpenAlex search for query: '{query}'")

    while True:
        try:
            response = requests.get(base_url, params=params, headers=headers, timeout=30)
            response.raise_for_status()
            data = response.json()
        except requests.RequestException as e:
            print(f"Error fetching OpenAlex data: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response content: {e.response.text}")
            break

        results = data.get("results", [])
        if not results:
            print("No more results from OpenAlex.")
            break

        for result in results:
            # Type filtering
            if not all_types:
                primary_location = result.get("primary_location") or {}
                source_info = primary_location.get("source") or {}
                source_type = source_info.get("type", "") if source_info else ""
                work_type = result.get("type", "")
                
                include_record = False
                if journals and source_type == "journal":
                    include_record = True
                elif conference and work_type in ["proceedings-article", "conference-paper"]: # Adjust as needed
                    include_record = True
                elif book_chapter and work_type == "book-chapter":
                    include_record = True
                
                if not include_record:
                    continue

            title = result.get("title", "Untitled")
            abstract_inverted = result.get("abstract_inverted_index")
            abstract_text = reconstruct_abstract_openalex(abstract_inverted) if abstract_inverted else ""
            
            year = result.get("publication_year", "")
            citations = result.get("cited_by_count", 0)
            
            records.append({
                "title": title,
                "abstract": abstract_text,
                "year": str(year),
                "citations": citations,
                "source": "OpenAlex"
            })
        
        total_fetched += len(results)
        print(f"Fetched {len(results)} from OpenAlex page. Total fetched so far: {total_fetched}")

        if total_fetched >= max_records:
            print(f"Reached max_records limit of {max_records} for OpenAlex.")
            break

        next_cursor = data.get("meta", {}).get("next_cursor")
        if not next_cursor:
            print("No next cursor from OpenAlex, ending search.")
            break
        
        params["cursor"] = next_cursor
        
        # OpenAlex is generally robust, but a small delay is polite
        time.sleep(0.5) # 500ms delay between requests

    df = pd.DataFrame(records[:max_records]) # Ensure we don't exceed max_records
    print(f"Total records fetched from OpenAlex: {len(df)}")
    return df