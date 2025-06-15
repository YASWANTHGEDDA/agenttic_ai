// client/src/components/tools/AcademicSearchToolContent.js
import React, { useState, useEffect } from 'react'; // Make sure useState and useEffect are imported
import { searchCoreApi, searchCombinedAcademic, getProxiedFileDownloadUrl } from '../../services/api';
// import './AcademicSearchTool.css'; // Assuming this CSS file exists or you'll add styles

const AcademicSearchToolContent = ({ onSearchResults }) => {
    // *** RE-INSERTED STATE DECLARATIONS ***
    const [query, setQuery] = useState('');
    const [searchSource, setSearchSource] = useState('combined'); // 'combined' or 'core'
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [results, setResults] = useState(null); // This will hold the structured response for rendering

    // --- State for CORE Search ---
    const [maxPagesCore, setMaxPagesCore] = useState(1);
    const [downloadPdfsCore, setDownloadPdfsCore] = useState(false);
    const [coreApiKey, setCoreApiKey] = useState('');

    // --- State for Combined Search ---
    const [minYear, setMinYear] = useState('');
    const [openAlexMax, setOpenAlexMax] = useState(10);
    const [scholarMax, setScholarMax] = useState(5);
    // *** END OF RE-INSERTED STATE DECLARATIONS ***

    useEffect(() => {
        setResults(null); // Clear previous results when searchSource changes
        setError('');     // Clear previous errors
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
            let apiResponseData; 
            let searchTypeForDisplay = '';

            if (searchSource === 'core') {
                if (!coreApiKey.trim()) {
                    setError('CORE API Key is required for this search source.');
                    setIsLoading(false);
                    return;
                }
                const coreParams = {
                    query: query.trim(),
                    core_api_key: coreApiKey.trim(), // Pass the API key from state
                    max_pages: parseInt(maxPagesCore, 10),
                    download_pdfs: downloadPdfsCore
                };
                console.log("AcademicSearchToolContent (CORE): Sending payload:", JSON.stringify(coreParams, null, 2));
                apiResponseData = await searchCoreApi(coreParams);
                searchTypeForDisplay = 'CORE';
            } else { // 'combined' search
                const combinedParams = {
                    query: query.trim(),
                    openalex_max_records: parseInt(openAlexMax, 10),
                    scholar_max_results: parseInt(scholarMax, 10),
                };
                if (minYear.trim()) {
                    combinedParams.min_year = parseInt(minYear, 10);
                }
                console.log("AcademicSearchToolContent (Combined): Sending payload:", JSON.stringify(combinedParams, null, 2));
                apiResponseData = await searchCombinedAcademic(combinedParams);
                searchTypeForDisplay = 'Combined';
            }
            
            console.log(`AcademicSearchToolContent: API Response received for ${searchTypeForDisplay} search:`, apiResponseData);

            if (apiResponseData && apiResponseData.status === 'success') {
                const structuredResults = {
                    message: apiResponseData.message || `${searchTypeForDisplay} search complete. Found ${apiResponseData.results?.length || 0} papers.`,
                    data: Array.isArray(apiResponseData.results) ? apiResponseData.results : [],
                    csv_download_link_relative: apiResponseData.csv_download_link_relative,
                    status: 'success',
                    source: searchSource 
                };
                setResults(structuredResults);
                if (onSearchResults) { 
                    onSearchResults(structuredResults); // Pass the correctly structured object
                }
            } else if (apiResponseData && (apiResponseData.error || apiResponseData.status === 'error')) { 
                const errorMessage = apiResponseData.message || apiResponseData.error || `Failed ${searchTypeForDisplay} search.`;
                setError(errorMessage);
                const errorState = { 
                    message: errorMessage, 
                    data: [], 
                    status: 'error', 
                    error: apiResponseData.error, 
                    details: apiResponseData.details 
                };
                setResults(errorState); 
                 if (onSearchResults) {
                    onSearchResults(errorState);
                }
            } else { 
                throw new Error('Unexpected API response structure from academic search.');
            }

        } catch (err) { 
            console.error("AcademicSearchToolContent: Search error in catch block:", err);
            // err.message here will be from the Axios interceptor if it's an API error,
            // or from a client-side thrown error.
            const clientErrorMessage = err.message || 'Failed to perform academic search due to a client-side or network issue.';
            setError(clientErrorMessage);
            const errorResponseForState = { 
                message: "Search failed unexpectedly.", 
                data: [], 
                status: 'error',
                error: clientErrorMessage, 
                // If err.response exists, it means it's likely an Axios error object
                details: err.response?.data?.details || err.response?.data?.message || err.toString() 
            };
            setResults(errorResponseForState);
            if (onSearchResults) {
                onSearchResults(errorResponseForState);
            }
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
                    <input 
                        type="text" 
                        id="query" 
                        value={query} 
                        onChange={(e) => setQuery(e.target.value)} 
                        placeholder="e.g., applications of transformers in NLP" 
                        required 
                        disabled={isLoading} 
                    />
                </div>

                {searchSource === 'core' && (
                    <div className="source-options">
                        <h4>CORE Options</h4>
                        <div className="form-group">
                            <label htmlFor="coreApiKey">CORE API Key:</label>
                            <input 
                                type="password" 
                                id="coreApiKey" 
                                value={coreApiKey} 
                                onChange={(e) => setCoreApiKey(e.target.value)} 
                                placeholder="Enter your CORE API key" 
                                required={searchSource === 'core'} 
                                disabled={isLoading} 
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="maxPagesCore">Max Pages (CORE):</label>
                            <input 
                                type="number" 
                                id="maxPagesCore" 
                                value={maxPagesCore} 
                                min="1" 
                                onChange={(e) => setMaxPagesCore(e.target.value)} 
                                disabled={isLoading} 
                            />
                        </div>
                        <div className="form-group form-group-checkbox">
                            <label htmlFor="downloadPdfsCore">Download PDFs (CORE)</label>
                            <input 
                                type="checkbox" 
                                id="downloadPdfsCore" 
                                checked={downloadPdfsCore} 
                                onChange={(e) => setDownloadPdfsCore(e.target.checked)} 
                                disabled={isLoading} 
                            />
                        </div>
                    </div>
                )}

                {searchSource === 'combined' && (
                    <div className="source-options">
                        <h4>Combined Search Options</h4>
                        <div className="form-group">
                            <label htmlFor="minYear">Minimum Year:</label>
                            <input 
                                type="number" 
                                id="minYear" 
                                value={minYear} 
                                onChange={(e) => setMinYear(e.target.value)} 
                                placeholder="e.g., 2020" 
                                disabled={isLoading} 
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="openAlexMax">Max OpenAlex Results:</label>
                            <input 
                                type="number" 
                                id="openAlexMax" 
                                value={openAlexMax} 
                                min="1" max="50" 
                                onChange={(e) => setOpenAlexMax(e.target.value)} 
                                disabled={isLoading} 
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="scholarMax">Max Scholar Results:</label>
                            <input 
                                type="number" 
                                id="scholarMax" 
                                value={scholarMax} 
                                min="1" max="20" 
                                onChange={(e) => setScholarMax(e.target.value)} 
                                disabled={isLoading} 
                            />
                        </div>
                    </div>
                )}
                
                <button type="submit" disabled={isLoading || !query.trim()} style={{ marginTop: '20px' }}>
                    {isLoading ? 'Searching...' : 'Search'}
                </button>
            </form>

            {isLoading && <div className="loading-spinner-container" style={{marginTop: '15px'}}><div className="loader"></div> Processing...</div>}
            
            {error && !isLoading && (
                <p className="error-message" style={{ marginTop: '15px' }}>{error}</p>
            )}

            {results && !isLoading && (
                <div className="results-section" style={{ marginTop: '15px' }}>
                    <h4>{results.message}</h4> {/* This uses the message from the 'results' state */}
                    
                    {results.status === 'success' && results.data && results.data.length > 0 ? (
                        <>
                            {results.csv_download_link_relative && (
                                <p>
                                    <a href={getProxiedFileDownloadUrl(results.csv_download_link_relative)}
                                       download="academic_search_results.csv">
                                        Download Results as CSV
                                    </a>
                                </p>
                            )}
                            <ul className="result-list">
                                {results.data.map((item, index) => ( // Iterates over results.data
                                    <li key={`${item.doi || item.title || `item-${index}`}`} className="result-item">
                                        <h5>{item.title || 'No Title'}</h5>
                                        <p className="result-meta">
                                            <strong>Source:</strong> {item.source || 'N/A'}
                                            {item.year && !String(item.year).toLowerCase().includes('nan') && <span> | <strong>Year:</strong> {parseInt(item.year)}</span>}
                                            {/* Handle both 'citations' and 'citation_count' for flexibility */}
                                            {(item.citations !== undefined && item.citations !== null) && <span> | <strong>Citations:</strong> {item.citations}</span>}
                                            {(item.citation_count !== undefined && item.citation_count !== null && item.citations === undefined) && <span> | <strong>Citations:</strong> {item.citation_count}</span>}
                                        </p>
                                        {item.authors && <p className="authors"><strong>Authors:</strong> {Array.isArray(item.authors) ? item.authors.join(', ') : String(item.authors)}</p>}
                                        {item.abstract && <p className="abstract">{String(item.abstract).substring(0, 300) + (String(item.abstract).length > 300 ? '...' : '')}</p>}
                                        {item.pdf_url && <p><a href={item.pdf_url} target="_blank" rel="noopener noreferrer">View Original PDF</a></p>}
                                        {item.download_link_relative && // For PDFs downloaded by CORE search if feature is implemented
                                            <p>
                                                <a href={getProxiedFileDownloadUrl(item.download_link_relative)} 
                                                   download={item.title?.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.pdf' || 'downloaded_paper.pdf'}>
                                                    Download Stored PDF
                                                </a>
                                            </p>
                                        }
                                    </li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        results.status === 'success' && <p>No papers found matching your criteria.</p>
                    )}
                     {results.status === 'error' && (
                        <p className="error-message">
                            Search Error: {results.error || "An unknown error occurred."}
                            {results.details && <span> Details: {results.details}</span>}
                        </p>
                     )}
                </div>
            )}
        </div>
    );
};

export default AcademicSearchToolContent;