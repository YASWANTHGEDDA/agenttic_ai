# modules/academic_search/scholar_api.py
import pandas as pd
from scholarly import scholarly, MaxTriesExceededException
import time
import random

def search_google_scholar(query, max_results=100,
                          all_types=True, journals=False, conference=False, book_chapter=False):
    """
    Searches Google Scholar for publications.

    Args: 
        query (str): The search query.
        max_results (int): Maximum number of results to fetch.
        all_types (bool): If True, ignore other type flags and include all.
        journals (bool): Include journal articles.
        conference (bool): Include conference proceedings.
        book_chapter (bool): Include book chapters.

    Returns:
        pd.DataFrame: DataFrame with columns 'title', 'abstract', 'year', 'citations', 'source'.
    """
    records = []
    print(f"Starting Google Scholar search for query: '{query}'")

    try:
        search_results_gen = scholarly.search_pubs(query)
        
        for i, result in enumerate(search_results_gen):
            if i >= max_results:
                break

            # Random delay to mimic human behavior and avoid blocks
            time.sleep(random.uniform(2, 7))

            try:
                # scholarly.fill(result) # Fill details like abstract, bib, etc.
                # As of scholarly v1.7.11, search_pubs often returns enough info
                # If not, use fill, but be very careful with rate limits.
                # Let's try to get info without fill first to be safer.
                bib = result.get('bib', {})
                
                title = bib.get('title', result.get('title', 'Untitled')) # Fallback
                abstract = bib.get('abstract', result.get('abstract', ''))
                year = bib.get('pub_year', result.get('pub_year', ''))
                
                citations_bib = bib.get('num_citations', None) # scholarly seems to use num_citations in bib too
                citations_top = result.get('num_citations', None)

                citations = 0
                if citations_bib is not None:
                    citations = citations_bib
                elif citations_top is not None:
                    citations = citations_top
                
                # Type filtering (simplified for Google Scholar as its type info is less structured)
                if not all_types:
                    pub_type = bib.get('venue', '').lower() # 'venue' often contains type info
                    # This is a heuristic for Google Scholar
                    include_record = False
                    if journals and ('journal' in pub_type or 'arxiv' in pub_type): # ArXiv often leads to journals
                        include_record = True
                    elif conference and ('conference' in pub_type or 'proceedings' in pub_type):
                        include_record = True
                    elif book_chapter and ('book' in pub_type or 'chapter' in pub_type):
                        include_record = True
                    
                    if not include_record:
                        continue
                
                records.append({
                    "title": title,
                    "abstract": abstract,
                    "year": str(year),
                    "citations": int(citations),
                    "source": "GoogleScholar"
                })
                print(f"Fetched result {i+1}/{max_results} from Google Scholar: {title[:50]}...")

            except Exception as e: # Catching broader exceptions if result processing fails
                print(f"Error processing a Google Scholar result: {e}. Skipping this item.")
                time.sleep(random.uniform(10, 20)) # Longer sleep if an error occurs
                continue
        
    except MaxTriesExceededException:
        print("Google Scholar rate limit hit hard (MaxTriesExceededException). Stopping Scholar search.")
    except Exception as e:
        print(f"An unexpected error occurred during Google Scholar search: {e}")

    df = pd.DataFrame(records)
    print(f"Total records fetched from Google Scholar: {len(df)}")
    return df