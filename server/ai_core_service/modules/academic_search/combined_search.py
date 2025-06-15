# FusedChatbot/server/ai_core_service/modules/academic_search/combined_search.py
import pandas as pd
import os
import re
import logging

logger = logging.getLogger(__name__)

# Import from sibling modules
try:
    from .openalex_api import search_openalex
    from .scholar_api import search_google_scholar
except ImportError:
    logger.error("Failed to import openalex_api or scholar_api. Ensure they are in the same directory or sys.path is correct.")
    # Define dummy functions if imports fail, to prevent further startup errors, but log it.
    def search_openalex(*args, **kwargs): logger.error("OpenAlex search unavailable due to import error."); return pd.DataFrame()
    def search_google_scholar(*args, **kwargs): logger.error("Google Scholar search unavailable due to import error."); return pd.DataFrame()


def run_combined_search(query: str, output_dir: str,
                        fetch_openalex: bool = True, openalex_max_records: int = 20, # Reduced default for quicker testing
                        fetch_scholar: bool = True, scholar_max_results: int = 10,  # Reduced default
                        min_year: int | None = None, # Parameter name matches frontend/app.py
                        openalex_all_types: bool = True, openalex_journals: bool = False,
                        openalex_conference: bool = False, openalex_book_chapter: bool = False,
                        scholar_all_types: bool = True, scholar_journals: bool = False,
                        scholar_conference: bool = False, scholar_book_chapter: bool = False):
    """
    Runs searches on OpenAlex and Google Scholar, combines, filters, and saves results.
    Returns a DataFrame and the absolute path to the saved CSV file.
    """
    os.makedirs(output_dir, exist_ok=True)
    all_dfs = []
    csv_path_abs = None # Initialize csv_path_abs

    if fetch_openalex:
        logger.info(f"--- Starting OpenAlex Search for query: '{query}' (Max: {openalex_max_records}) ---")
        try:
            df_openalex = search_openalex(
                query,
                max_records=openalex_max_records,
                all_types=openalex_all_types,
                journals=openalex_journals,
                conference=openalex_conference,
                book_chapter=openalex_book_chapter
            )
            if df_openalex is not None and not df_openalex.empty:
                all_dfs.append(df_openalex)
            logger.info(f"OpenAlex search complete. Found {len(df_openalex) if df_openalex is not None else 0} records.")
        except Exception as e_oa:
            logger.error(f"Error during OpenAlex search for '{query}': {e_oa}", exc_info=True)


    if fetch_scholar:
        logger.info(f"--- Starting Google Scholar Search for query: '{query}' (Max: {scholar_max_results}) ---")
        try:
            df_scholar = search_google_scholar(
                query,
                max_results=scholar_max_results,
                all_types=scholar_all_types,
                journals=scholar_journals,
                conference=scholar_conference,
                book_chapter=scholar_book_chapter
            )
            if df_scholar is not None and not df_scholar.empty:
                all_dfs.append(df_scholar)
            logger.info(f"Google Scholar search complete. Found {len(df_scholar) if df_scholar is not None else 0} records.")
        except Exception as e_gs:
            logger.error(f"Error during Google Scholar search for '{query}': {e_gs}", exc_info=True)


    if not all_dfs:
        logger.warning("No results fetched from any source. Returning empty DataFrame and no CSV path.")
        # *** CHANGE: Ensure two values are always returned ***
        return pd.DataFrame(), None # Return empty DataFrame and None for csv_path

    df_combined = pd.concat(all_dfs, ignore_index=True)
    logger.info(f"Total records before deduplication: {len(df_combined)}")

    if df_combined.empty:
        logger.warning("Combined DataFrame is empty before deduplication. Returning empty DataFrame and no CSV path.")
        # *** CHANGE: Ensure two values are always returned ***
        return pd.DataFrame(), None

    # Deduplication
    if 'title' in df_combined.columns:
        # Ensure title is string, handle NaN, then lower and strip
        df_combined['title_lower_stripped'] = df_combined['title'].astype(str).fillna('').str.lower().str.strip()
        # Keep 'first' valid entry, attempt to prioritize entries with abstracts if titles are same
        # This is a simple heuristic; more advanced would compare DOIs or other identifiers
        df_combined.sort_values(by=['title_lower_stripped', 'abstract'], ascending=[True, False], na_position='last', inplace=True)
        df_unique = df_combined.drop_duplicates(subset=['title_lower_stripped'], keep='first').copy()
        df_unique.drop(columns=['title_lower_stripped'], inplace=True, errors='ignore')
        logger.info(f"Total records after deduplication: {len(df_unique)}")
    else:
        logger.warning("'title' column missing, cannot deduplicate effectively.")
        df_unique = df_combined.copy()

    if df_unique.empty:
        logger.warning("DataFrame is empty after deduplication. Returning empty DataFrame and no CSV path.")
        # *** CHANGE: Ensure two values are always returned ***
        return pd.DataFrame(), None

    # Year processing
    if 'year' not in df_unique.columns:
        df_unique.loc[:, 'year'] = pd.NA # Use pandas NA for missing
    # Convert to string first to handle mixed types, then fillna, then attempt numeric
    df_unique.loc[:, 'year'] = df_unique['year'].astype(str).fillna(str(pd.NA))

    # Extract year from title if 'year' column is missing or unparsable
    missing_years_mask = df_unique['year'].isin([str(pd.NA), 'nan', 'none', '<na>', ''])
    if missing_years_mask.any() and 'title' in df_unique.columns:
        titles_for_extraction = df_unique.loc[missing_years_mask, 'title'].astype(str).fillna('')
        # Regex to find a 4-digit year, typically 19xx or 20xx
        extracted_years_series = titles_for_extraction.str.extract(r'\b((?:19|20)\d{2})\b', expand=False)
        # Update only where extracted_years_series has a value
        df_unique.loc[missing_years_mask & extracted_years_series.notna(), 'year'] = extracted_years_series[extracted_years_series.notna()]


    df_unique['year_numeric'] = pd.to_numeric(df_unique['year'], errors='coerce').fillna(0).astype(int)


    df_filtered = df_unique.copy()
    if min_year is not None: # Check if min_year was provided
        try:
            min_year_numeric = int(min_year) # Convert once
            # Filter out rows where year_numeric is 0 (coerced NaNs) or less than min_year_numeric
            valid_year_mask = (df_filtered['year_numeric'] >= min_year_numeric) & (df_filtered['year_numeric'] != 0)
            df_filtered = df_filtered[valid_year_mask].copy()
            logger.info(f"Records after filtering for year >= {min_year_numeric}: {len(df_filtered)}")
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid min_year value '{min_year}'. Year filtering skipped. Error: {e}")
    
    if df_filtered.empty:
        logger.warning("DataFrame is empty after year filtering. Returning empty DataFrame and no CSV path.")
        # *** CHANGE: Ensure two values are always returned ***
        return pd.DataFrame(), None

    # Clean up citations
    if 'citations' not in df_filtered.columns:
        df_filtered.loc[:, 'citations'] = 0 # Initialize if missing
    # Convert citations to numeric, coercing errors to NaN, then fill NaN with 0, then to int
    df_filtered.loc[:, 'citations'] = pd.to_numeric(df_filtered['citations'], errors='coerce').fillna(0).astype(int)
    
    # Final cleanup and column ordering
    df_filtered.drop(columns=['year_numeric'], inplace=True, errors='ignore') # remove temporary numeric year
    
    # Define desired columns, ensure they exist before selecting
    desired_columns = ['title', 'authors', 'abstract', 'year', 'citations', 'doi', 'pdf_url', 'source', 'type']
    final_columns = [col for col in desired_columns if col in df_filtered.columns]
    # Add any remaining columns from df_filtered that are not in desired_columns
    final_columns += [col for col in df_filtered.columns if col not in final_columns]
    
    df_to_save = df_filtered[final_columns].copy()

    # Save and return
    try:
        csv_filename = "combined_academic_search_results.csv"
        csv_path_abs = os.path.join(output_dir, csv_filename)
        df_to_save.to_csv(csv_path_abs, index=False, encoding='utf-8')
        logger.info(f"Saved combined and filtered results to {csv_path_abs}")
    except Exception as e_csv:
        logger.error(f"Failed to save results to CSV at {output_dir}: {e_csv}", exc_info=True)
        csv_path_abs = None # Ensure path is None if saving failed

    # *** CRITICAL CHANGE: Return both the DataFrame and the CSV path ***
    return df_to_save, csv_path_abs