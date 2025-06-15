// // client/src/components/tools/WebPdfDownloaderToolContent.js
// import React, { useState } from 'react';
// import { downloadWebPdfs, getProxiedFileDownloadUrl } from '../../services/api';
// import './WebPdfDownloaderTool.css'; // Import the specific CSS

// const WebPdfDownloaderToolContent = ({ onPdfsDownloaded }) => {
//     const [query, setQuery] = useState('');
//     const [maxDownloads, setMaxDownloads] = useState(3); // A more reasonable default
//     const [isLoading, setIsLoading] = useState(false);
//     const [error, setError] = useState(null);
//     const [apiResult, setApiResult] = useState(null); // This will hold the direct response object

//     const handleSubmit = async (e) => {
//         e.preventDefault();
//         if (!query.trim()) {
//             setError("Please enter a search query.");
//             return;
//         }
//         setIsLoading(true);
//         setError(null);
//         setApiResult(null);

//         try {
//             // The `downloadWebPdfs` function already returns the data object directly.
//             // So, 'response' here IS the data object from the server.
//             const response = await downloadWebPdfs(query, parseInt(maxDownloads, 10));

//             // CHANGE 1: Log the response directly, not response.data
//             console.log("WebPdfDownloaderToolContent: API response received:", response);
            
//             // CHANGE 2: Set the state with the response object directly
//             setApiResult(response);

//             // CHANGE 3: Pass the response object directly to the parent callback
//             if (onPdfsDownloaded) {
//                 onPdfsDownloaded(response);
//             }
//         } catch (err) {
//             console.error("WebPdfDownloaderToolContent: handleSubmit error:", err);
//             const message = err.message || "An unknown error occurred.";
//             setError(message);
//             const errorResponse = { status: 'error', error: message, query: query, processed_count: 0, download_links_relative: [] };
//             setApiResult(errorResponse);
//             if (onPdfsDownloaded) {
//                 onPdfsDownloaded(errorResponse);
//             }
//         } finally {
//             setIsLoading(false);
//         }
//     };

//     return (
//         <div className="web-pdf-downloader-content tool-form-container">
//             <h3 className="tool-title">Web PDF Downloader</h3>
//             <p>Searches the web for relevant PDF documents and downloads them.</p>
//             <form onSubmit={handleSubmit}>
//                 <div className="form-group">
//                     <label htmlFor="wpd-query">Search Query for PDFs:</label>
//                     <input
//                         type="text"
//                         id="wpd-query"
//                         value={query}
//                         onChange={(e) => setQuery(e.target.value)}
//                         placeholder="e.g., principles of machine learning"
//                         required
//                         disabled={isLoading}
//                     />
//                 </div>
//                 <div className="form-group">
//                     <label htmlFor="wpd-max-downloads">Max Downloads:</label>
//                     <input
//                         type="number"
//                         id="wpd-max-downloads"
//                         value={maxDownloads}
//                         onChange={(e) => setMaxDownloads(e.target.value)}
//                         min="1"
//                         max="10"
//                         required
//                         disabled={isLoading}
//                     />
//                 </div>
//                 <button type="submit" disabled={isLoading || !query.trim()}>
//                     {isLoading ? 'Searching & Downloading...' : 'Download PDFs'}
//                 </button>
//             </form>

//             {/* General error display */}
//             {error && !isLoading && (
//                  <div className="error-message" style={{marginTop: '15px'}}>
//                     Operation Error: {error}
//                 </div>
//             )}

//             {/* Results Display Section */}
//             {!isLoading && apiResult && (
//                 <div className="results-section" style={{ marginTop: '20px' }}>
//                     {apiResult.status === 'success' ? (
//                         <>
//                             <h4 className="results-title">{apiResult.message || `Operation Successful.`}</h4>
//                             {apiResult.download_links_relative && apiResult.download_links_relative.length > 0 ? (
//                                 <>
//                                     <p>Downloaded {apiResult.processed_count || apiResult.download_links_relative.length} PDF(s):</p>
//                                     <ul>
//                                         {apiResult.files_server_paths.map((serverPath, index) => {
//                                             // Get the relative path for the download URL
//                                             const relPath = apiResult.download_links_relative[index];
//                                             const fullUrl = getProxiedFileDownloadUrl(relPath);
//                                             // Extract a clean filename from the server path for display and download attribute
//                                             const displayFilename = serverPath.split(/[\\/]/).pop();

//                                             return (
//                                                 <li key={index}>
//                                                     {/* The 'download' attribute tells the browser to download the file */}
//                                                     <a href={fullUrl} target="_blank" rel="noopener noreferrer" download={displayFilename}>
//                                                         {displayFilename}
//                                                     </a>
//                                                 </li>
//                                             );
//                                         })}
//                                     </ul>
//                                 </>
//                             ) : (
//                                 <p>The search was successful, but no PDF files were found or downloaded for this query.</p>
//                             )}
//                         </>
//                     ) : ( // This handles the case where status is 'error'
//                         <div className="error-message">
//                             <h4>Download Failed</h4>
//                             <p>{apiResult.error || 'An unspecified error occurred.'}</p>
//                             {apiResult.details && <p>Details: {apiResult.details}</p>}
//                         </div>
//                     )}
//                 </div>
//             )}
//         </div>
//     );
// };

// export default WebPdfDownloaderToolContent;

// client/src/components/tools/WebPdfDownloaderToolContent.js
import React, { useState } from 'react';
import { downloadWebPdfs, getProxiedFileDownloadUrl } from '../../services/api';
import './WebPdfDownloaderTool.css';

const WebPdfDownloaderToolContent = ({ onPdfsDownloaded }) => {
    const [query, setQuery] = useState('');
    const [maxDownloads, setMaxDownloads] = useState(3);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [apiResult, setApiResult] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!query.trim()) {
            setError("Please enter a search query.");
            return;
        }
        setIsLoading(true);
        setError(null);
        setApiResult(null);

        // MODIFIED: Create a params object for the API call
        const params = {
            query: query.trim(),
            max_downloads: parseInt(maxDownloads, 10)
        };

        try {
            console.log("WebPdfDownloaderToolContent: Sending payload:", JSON.stringify(params, null, 2)); // Log payload
            const response = await downloadWebPdfs(params); // Pass the params object

            console.log("WebPdfDownloaderToolContent: API response received:", response);
            setApiResult(response);

            if (onPdfsDownloaded) {
                onPdfsDownloaded(response);
            }
        } catch (err) {
            console.error("WebPdfDownloaderToolContent: handleSubmit error:", err);
            const message = err.message || "An unknown error occurred during PDF download.";
            setError(message);
            // Ensure a consistent error structure for the parent component
            const errorResponse = {
                status: 'error',
                error: message,
                query: params.query,
                // Include details from server if available (Axios interceptor attaches 'response')
                details: err.response?.data?.details || err.response?.data?.message || err.response?.data?.error,
                processed_count: 0,
                download_links_relative: []
            };
            setApiResult(errorResponse);
            if (onPdfsDownloaded) {
                onPdfsDownloaded(errorResponse);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="web-pdf-downloader-content tool-form-container">
            <h3 className="tool-title">Web PDF Downloader</h3>
            <p>Searches the web for relevant PDF documents and downloads them.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="wpd-query">Search Query for PDFs:</label>
                    <input
                        type="text"
                        id="wpd-query"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="e.g., principles of machine learning"
                        required
                        disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="wpd-max-downloads">Max Downloads:</label>
                    <input
                        type="number"
                        id="wpd-max-downloads"
                        value={maxDownloads}
                        onChange={(e) => setMaxDownloads(e.target.value)}
                        min="1"
                        max="10"
                        required
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" disabled={isLoading || !query.trim()}>
                    {isLoading ? 'Searching & Downloading...' : 'Download PDFs'}
                </button>
            </form>

            {isLoading && <div className="loading-spinner-container" style={{marginTop: '15px'}}><div className="loader"></div> Processing...</div>}

            {error && !isLoading && (
                 <div className="error-message" style={{marginTop: '15px'}}>
                    Operation Error: {error}
                </div>
            )}

            {!isLoading && apiResult && (
                <div className="results-section" style={{ marginTop: '20px' }}>
                    {apiResult.status === 'success' ? (
                        <>
                            <h4 className="results-title">{apiResult.message || `Operation Successful.`}</h4>
                            {apiResult.download_links_relative && apiResult.download_links_relative.length > 0 ? (
                                <>
                                    <p>Downloaded {apiResult.processed_count || apiResult.files_server_paths?.length || apiResult.download_links_relative.length} PDF(s):</p>
                                    <ul>
                                        {apiResult.files_server_paths?.map((serverPath, index) => {
                                            const relPath = apiResult.download_links_relative?.[index];
                                            if (!relPath) return null; // Skip if no relative path
                                            const fullUrl = getProxiedFileDownloadUrl(relPath);
                                            const displayFilename = serverPath.split(/[\\/]/).pop();

                                            return (
                                                <li key={index}>
                                                    <a href={fullUrl} target="_blank" rel="noopener noreferrer" download={displayFilename}>
                                                        {displayFilename}
                                                    </a>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            ) : (
                                <p>The search was successful, but no PDF files were found or downloaded for this query.</p>
                            )}
                        </>
                    ) : (
                        <div className="error-message">
                            <h4>Download Failed</h4>
                            <p>{apiResult.error || 'An unspecified error occurred.'}</p>
                            {apiResult.details && <p>Details: {apiResult.details}</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default WebPdfDownloaderToolContent;