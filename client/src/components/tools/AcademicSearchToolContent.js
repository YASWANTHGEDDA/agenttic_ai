// client/src/components/tools/AcademicSearchToolContent.js
import React, { useState, useEffect } from 'react';
import { searchCoreApi, searchCombinedAcademic, getProxiedFileDownloadUrl } from '../../services/api';
// import './AcademicSearchTool.css'; // Make sure this CSS file exists

const AcademicSearchToolContent = ({ onSearchResults }) => {
    const [query, setQuery] = useState('');
    const [searchSource, setSearchSource] = useState('combined'); // 'combined' or 'core'
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState(null);

    // --- State for CORE Search ---
    const [maxPagesCore, setMaxPagesCore] = useState(1);
    const [downloadPdfsCore, setDownloadPdfsCore] = useState(false);
    const [coreApiKey, setCoreApiKey] = useState(''); // State to hold the API key

    // --- State for Combined Search ---
    const [minYear, setMinYear] = useState('');
    const [openAlexMax, setOpenAlexMax] = useState(10);
    const [scholarMax, setScholarMax] = useState(5);

    // Clear results and error when the search source changes
    useEffect(() => {
        setResults(null);
        setError('');
    }, [searchSource]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!query.trim()) {
            setError('Please enter a search query.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResults(null);

        try {
            let responseData;
            if (searchSource === 'core') {
                if (!coreApiKey.trim()) {
                    setError('CORE API Key is required for this search source.');
                    setIsLoading(false);
                    return;
                }
                // Call the corrected CORE API function
                responseData = await searchCoreApi(query, coreApiKey, parseInt(maxPagesCore, 10), downloadPdfsCore);
            } else { // 'combined' search
                const params = {
                    query,
                    openalex_max_records: parseInt(openAlexMax, 10),
                    scholar_max_results: parseInt(scholarMax, 10),
                };
                if (minYear.trim()) {
                    params.min_year = parseInt(minYear, 10);
                }
                // Call the Combined Search function
                responseData = await searchCombinedAcademic(params);
            }
            
            // Standardize the result object for display
            const resultObject = {
                message: `Search complete. Found ${responseData?.length || 0} papers.`,
                data: Array.isArray(responseData) ? responseData : [],
                // Heuristic for CSV download link, adjust if backend changes filename
                download_link_relative: responseData?.length > 0 
                    ? `${searchSource}_search/combined_academic_search_results.csv` 
                    : null
            };
            
            setResults(resultObject);

            if (onSearchResults) {
                onSearchResults(resultObject);
            }

        } catch (err) {
            console.error("Search error:", err);
            setError(err.message || 'Failed to perform search.');
            setResults({ message: "Search failed", data: [] });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="academic-search-tool tool-form-container">
            <h3 className="tool-title">Academic Paper Search</h3>
            <form onSubmit={handleSearch}>
                <div className="form-group">
                    <label htmlFor="searchSource">Search Source:</label>
                    <select id="searchSource" value={searchSource} onChange={(e) => setSearchSource(e.target.value)} disabled={isLoading}>
                        <option value="combined">Combined (OpenAlex & Scholar)</option>
                        <option value="core">CORE Repository</option>
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="query">Search Query:</label>
                    <input type="text" id="query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g., applications of transformers in NLP" required disabled={isLoading} />
                </div>

                {/* --- Conditional UI for CORE Search --- */}
                {searchSource === 'core' && (
                    <div className="source-options">
                        <h4>CORE Options</h4>
                        <div className="form-group">
                            <label htmlFor="coreApiKey">CORE API Key:</label>
                            <input type="password" id="coreApiKey" value={coreApiKey} onChange={(e) => setCoreApiKey(e.target.value)} placeholder="Enter your CORE API key" required={searchSource === 'core'} disabled={isLoading} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="maxPagesCore">Max Pages:</label>
                            <input type="number" id="maxPagesCore" value={maxPagesCore} min="1" onChange={(e) => setMaxPagesCore(e.target.value)} disabled={isLoading} />
                        </div>
                        <div className="form-group form-group-checkbox">
                            <label htmlFor="downloadPdfsCore">Download PDFs if available</label>
                            <input type="checkbox" id="downloadPdfsCore" checked={downloadPdfsCore} onChange={(e) => setDownloadPdfsCore(e.target.checked)} disabled={isLoading} />
                        </div>
                    </div>
                )}

                {/* --- Conditional UI for Combined Search --- */}
                {searchSource === 'combined' && (
                    <div className="source-options">
                        <h4>Combined Search Options</h4>
                        <div className="form-group">
                            <label htmlFor="minYear">Minimum Year:</label>
                            <input type="number" id="minYear" value={minYear} onChange={(e) => setMinYear(e.target.value)} placeholder="e.g., 2020" disabled={isLoading} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="openAlexMax">Max OpenAlex Results:</label>
                            <input type="number" id="openAlexMax" value={openAlexMax} min="1" onChange={(e) => setOpenAlexMax(e.target.value)} disabled={isLoading} />
                        </div>
                        <div className="form-group">
                            <label htmlFor="scholarMax">Max Scholar Results:</label>
                            <input type="number" id="scholarMax" value={scholarMax} min="1" onChange={(e) => setScholarMax(e.target.value)} disabled={isLoading} />
                        </div>
                    </div>
                )}
                
                <button type="submit" disabled={isLoading || !query.trim()} style={{ marginTop: '20px' }}>
                    {isLoading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {error && !isLoading && <p className="error-message">{error}</p>}

            {results && !isLoading && (
                <div className="results-section">
                    <h4>{results.message}</h4>
                    {results.data && results.data.length > 0 ? (
                        <ul className="result-list">
                            {results.data.map((item, index) => (
                                <li key={`${item.title}-${index}`} className="result-item">
                                    <h5>{item.title || 'No Title'}</h5>
                                    <p className="result-meta">
                                        <strong>Source:</strong> {item.source || 'N/A'}
                                        {item.year && !String(item.year).toLowerCase().includes('nan') && <span> | <strong>Year:</strong> {parseInt(item.year)}</span>}
                                        {item.citations !== undefined && <span> | <strong>Citations:</strong> {item.citations}</span>}
                                    </p>
                                    <p className="abstract">{item.abstract ? item.abstract.substring(0, 300) + '...' : 'No abstract available.'}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        !error && <p>No papers found matching your criteria.</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default AcademicSearchToolContent;