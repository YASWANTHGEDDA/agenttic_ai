// client/src/components/tools/MarkdownToPptToolContent.js
import React, { useState } from 'react';
import { createPresentationFromMarkdown, getProxiedFileDownloadUrl } from '../../services/api';
import '../MarkdownToOfficeTool.css';

const MarkdownToPptToolContent = ({ onPptGenerated }) => {
    const [markdown, setMarkdown] = useState(
`### Slide 1: My Presentation Title
**Slide Text Content:**
* Welcome to this presentation.
* This slide introduces the main topic.

---
### Slide 2: Key Concepts
**Slide Text Content:**
* Concept 1: Explanation.
* Concept 2: Further details.
`
    );
    const [filename, setFilename] = useState('MyGeneratedPresentation.pptx');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [apiResult, setApiResult] = useState(null);

    const triggerDownload = (url, downloadFilename) => {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', downloadFilename || 'download.pptx');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // *** MOVED trimmedFilename DECLARATION HERE ***
        const trimmedFilename = filename.trim(); // Define and trim here to use throughout

        if (!markdown.trim()) {
            setError('Markdown content cannot be empty.');
            return;
        }
        // Use trimmedFilename for validation
        if (!trimmedFilename || !trimmedFilename.toLowerCase().endsWith('.pptx')) { 
            setError('Filename must be provided and end with .pptx');
            return;
        }
        // No need to setFilename(trimmedFilename) here if filename state is already what's in the input

        setIsLoading(true);
        setError('');
        setApiResult(null);

        try {
            // Use trimmedFilename when calling the API
            const response = await createPresentationFromMarkdown(markdown, trimmedFilename); 
            console.log('MarkdownToPptTool: API Response received:', response);
            setApiResult(response);

            if (response && response.status === 'success') {
                if (response.download_link_relative) {
                    const relativePath = response.download_link_relative;
                    const downloadUrl = getProxiedFileDownloadUrl(relativePath); 
                    
                    if (downloadUrl && downloadUrl !== "#") { 
                        // Use trimmedFilename as a fallback if server path is missing
                        const actualFilenameFromServer = response.file_server_path?.split(/[\\/]/).pop() || trimmedFilename; 
                        console.log(`Triggering auto-download for ${actualFilenameFromServer} from URL: ${downloadUrl}`);
                        triggerDownload(downloadUrl, actualFilenameFromServer);
                        setError(''); 
                    } else {
                        const msg = 'PPT generated, but the download link could not be constructed correctly by the frontend.';
                        console.error(msg, "Relative path was:", relativePath, "Constructed URL was:", downloadUrl);
                        setError(msg);
                    }
                } else {
                    const msg = 'PPT generated successfully, but the backend did not provide a download link.';
                    console.warn(msg, response);
                    setError(msg); 
                }
            } else if (response && (response.error || response.status !== 'success')) {
                const backendError = response.error || response.message || 'Failed to generate PPT (backend error).';
                console.error("Backend reported an error:", backendError, response.details || '');
                setError(backendError + (response.details ? ` Details: ${response.details}` : ''));
            } else {
                const msg = 'Failed to generate PPT: Invalid or unexpected response from the server.';
                console.warn(msg, "Full response object:", response);
                setError(msg);
            }

            if (onPptGenerated) {
                onPptGenerated(response);
            }

        } catch (err) {
            console.error("MarkdownToPptTool handleSubmit client-side/network error:", err);
            const message = err.message || 'Failed to create presentation due to a client or network error.';
            setError(message);
            const errorResponse = { status: 'error', error: message, details: err.toString() };
            setApiResult(errorResponse); 
            if (onPptGenerated) {
                onPptGenerated(errorResponse);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="markdown-to-ppt-tool tool-form-container">
            <h3 className="tool-title">Markdown to PowerPoint</h3>
            <p>Write or paste Markdown content to generate a .pptx presentation. Each `---` separator creates a new slide.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="pptFilename">Output Filename:</label>
                    <input
                        type="text"
                        id="pptFilename"
                        value={filename} // Still bound to filename state
                        onChange={(e) => setFilename(e.target.value)} // Updates filename state
                        placeholder="MyPresentation.pptx"
                        required
                        disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="markdownContentPpt">Markdown Content:</label>
                    <textarea
                        id="markdownContentPpt"
                        value={markdown}
                        onChange={(e) => setMarkdown(e.target.value)}
                        rows="15"
                        placeholder="Enter your slide content..."
                        required
                        disabled={isLoading}
                        style={{ fontFamily: 'monospace', minHeight: '250px', lineHeight: '1.5' }}
                    />
                </div>
                <button type="submit" disabled={isLoading} style={{ marginTop: '10px' }}>
                    {isLoading ? 'Generating PPTX...' : 'Generate & Download PPTX'}
                </button>
            </form>

            {isLoading && (
                <div className="loading-spinner-container" style={{marginTop: '15px'}}>
                    <div className="loader"></div>
                    <span>Generating your presentation...</span>
                </div>
            )}
            
            {error && !isLoading && (
                 <div className="error-message" style={{marginTop: '15px'}}>
                    Error: {error}
                </div>
            )}

            {!isLoading && apiResult && apiResult.status === 'success' && (
                <div className="results-section" style={{marginTop: '15px'}}>
                    <h4 className="results-title">{apiResult.message || "Presentation generated successfully!"}</h4>
                    {apiResult.download_link_relative && ( // Check if the link exists in the result
                        <p>
                            If your download didn't start, you can use this link:
                            <a
                                href={getProxiedFileDownloadUrl(apiResult.download_link_relative)}
                                // Use apiResult.file_server_path or fallback to filename from state if needed
                                download={apiResult.file_server_path?.split(/[\\/]/).pop() || filename} 
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ marginLeft: '5px', fontWeight: 'bold' }}
                            >
                                Download {apiResult.file_server_path?.split(/[\\/]/).pop() || filename}
                            </a>
                        </p>
                    )}
                </div>
            )}
             {!isLoading && apiResult && apiResult.status !== 'success' && apiResult.error && (
                 <div className="error-message" style={{marginTop: '15px'}}>
                    Error: {apiResult.error} {apiResult.details ? `(${apiResult.details})` : ''}
                </div>
            )}
        </div>
    );
};

export default MarkdownToPptToolContent;