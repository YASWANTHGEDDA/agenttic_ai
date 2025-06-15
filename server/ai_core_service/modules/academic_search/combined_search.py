# ai_core_service/modules/academic_search/combined_search.py
import pandas as pd
import os
import re
import logging

logger = logging.getLogger(__name__)

# Import from sibling modules
from .openalex_api import search_openalex
from .scholar_api import search_google_scholar

def run_combined_search(query: str, output_dir: str,
                        fetch_openalex: bool = True, openalex_max_records: int = 200,
                        fetch_scholar: bool = True, scholar_max_results: int = 50,
                        # --- CHANGE 1: Renamed parameter to match the frontend ---
                        min_year: int | None = None,
                        # --- END OF CHANGE ---
                        openalex_all_types: bool = True, openalex_journals: bool = False,
                        openalex_conference: bool = False, openalex_book_chapter: bool = False,
                        scholar_all_types: bool = True, scholar_journals: bool = False,
                        scholar_conference: bool = False, scholar_book_chapter: bool = False):
    """
    Runs searches on OpenAlex and Google Scholar, combines, filters, and saves results.
    """
    os.makedirs(output_dir, exist_ok=True)
    all_dfs = []

    if fetch_openalex:
        logger.info(f"--- Starting OpenAlex Search for query: '{query}' ---")
        df_openalex = search_openalex(
            query,
            max_records=openalex_max_records,
            all_types=openalex_all_types,
            journals=openalex_journals,
            conference=openalex_conference,
            book_chapter=openalex_book_chapter
        )
        if not df_openalex.empty:
            all_dfs.append(df_openalex)
        logger.info(f"OpenAlex search complete. Found {len(df_openalex)} records.")

    if fetch_scholar:
        logger.info(f"--- Starting Google Scholar Search for query: '{query}' ---")
        df_scholar = search_google_scholar(
            query,
            max_results=scholar_max_results,
            all_types=scholar_all_types,
            journals=scholar_journals,
            conference=scholar_conference,
            book_chapter=scholar_book_chapter
        )
        if not df_scholar.empty:
            all_dfs.append(df_scholar)
        logger.info(f"Google Scholar search complete. Found {len(df_scholar)} records.")

    if not all_dfs:
        logger.warning("No results fetched from any source. Returning empty DataFrame.")
        return pd.DataFrame()

    df_combined = pd.concat(all_dfs, ignore_index=True)
    logger.info(f"Total records before deduplication: {len(df_combined)}")

    if df_combined.empty:
        return pd.DataFrame()

    # Deduplication
    if 'title' in df_combined.columns:
        df_combined['title_lower_stripped'] = df_combined['title'].fillna('').astype(str).str.lower().str.strip()
        df_unique = df_combined.drop_duplicates(subset=['title_lower_stripped'], keep='first').copy()
        df_unique.drop(columns=['title_lower_stripped'], inplace=True)
        logger.info(f"Total records after deduplication: {len(df_unique)}")
    else:
        logger.error("'title' column missing, cannot deduplicate.")
        df_unique = df_combined.copy()

    if df_unique.empty:
        return pd.DataFrame()

    # Year processing
    if 'year' not in df_unique.columns:
        df_unique.loc[:, 'year'] = pd.NA
    df_unique.loc[:, 'year'] = df_unique['year'].fillna(pd.NA).astype(str)

    missing_years_mask = df_unique['year'].isna() | df_unique['year'].str.contains('nan|none|<na>', case=False, na=True)
    if missing_years_mask.any() and 'title' in df_unique.columns:
        titles_for_extraction = df_unique.loc[missing_years_mask, 'title'].fillna('').astype(str)
        extracted_years_series = titles_for_extraction.str.extract(r'((?:19|20)\d{2})', expand=False)
        df_unique.loc[missing_years_mask, 'year'] = df_unique.loc[missing_years_mask, 'year'].fillna(extracted_years_series)

    # Convert year to numeric for filtering
    df_unique['year_numeric'] = pd.to_numeric(df_unique['year'], errors='coerce')

    # --- CHANGE 2: Use the corrected parameter name for filtering ---
    df_filtered = df_unique.copy()
    if min_year:
        try:
            min_year_numeric = int(min_year)
            valid_year_mask = df_filtered['year_numeric'] >= min_year_numeric
            df_filtered = df_filtered[valid_year_mask].copy()
            logger.info(f"Records after filtering for year >= {min_year_numeric}: {len(df_filtered)}")
        except (ValueError, TypeError):
            logger.warning(f"Invalid min_year value '{min_year}'. Year filtering skipped.")
    # --- END OF CHANGE ---

    if df_filtered.empty:
        logger.warning("DataFrame is empty after year filtering.")
        return pd.DataFrame()

    # Clean up citations
    if 'citations' not in df_filtered.columns:
        df_filtered.loc[:, 'citations'] = 0
    df_filtered.loc[:, 'citations'] = pd.to_numeric(df_filtered['citations'], errors='coerce').fillna(0).astype(int)
    
    # Final cleanup and column ordering
    df_filtered.drop(columns=['year_numeric'], inplace=True, errors='ignore')
    desired_columns = ['title', 'abstract', 'year', 'citations', 'source']
    final_columns = [col for col in desired_columns if col in df_filtered.columns]
    final_columns += [col for col in df_filtered.columns if col not in final_columns]
    df_to_save = df_filtered[final_columns].copy()

    # Save and return
    csv_path = os.path.join(output_dir, "combined_academic_search_results.csv")
    df_to_save.to_csv(csv_path, index=False, encoding='utf-8')
    logger.info(f"Saved combined and filtered results to {csv_path}")

    return df_to_save