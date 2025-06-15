// client/src/components/tools/MarkdownToPptToolContent.js
import React, { useState } from 'react';
import { createPresentationFromMarkdown, getProxiedFileDownloadUrl } from '../../services/api'; // Adjust path if needed
import '../MarkdownToOfficeTool.css'; // Assuming this CSS file exists

const MarkdownToPptToolContent = ({ onPptGenerated }) => {
    const [markdown, setMarkdown] = useState(
`### Slide 1: My Presentation Title
**Slide Text Content:**
* Welcome to this presentation.
* This slide introduces the main topic.
    * Sub-point A
    * Sub-point B

---
### Slide 2: Key Concepts
**Slide Text Content:**
* Concept 1: Explanation.
* Concept 2: Further details.
* **Important:** A bolded statement.

**Image Prompt:** a futuristic cityscape (Note: Image prompt is a placeholder)

---
### Slide 3: Conclusion
**Slide Text Content:**
* Summary of points.
* Call to action.

**Author Notes for Slide 3:**
Remember to thank the audience.`
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
        if (!markdown.trim()) {
            setError('Markdown content cannot be empty.');
            return;
        }
        const trimmedFilename = filename.trim();
        if (!trimmedFilename.toLowerCase().endsWith('.pptx')) {
            setError('Filename must end with .pptx');
            return;
        }
        setFilename(trimmedFilename);

        setIsLoading(true);
        setError('');
        setApiResult(null);

        try {
            // The `createPresentationFromMarkdown` service already returns the data object.
            // So, 'response' here IS the data from the server.
            const response = await createPresentationFromMarkdown(markdown, trimmedFilename);

            // CHANGE 1: Log the response object directly.
            console.log('MarkdownToPptTool: API Response received:', response);
            
            // CHANGE 2: Set the state with the response object directly.
            setApiResult(response);

            // CHANGE 3: Check conditions on the `response` object itself.
            if (response && response.status === 'success' && response.download_links_relative?.[0]) {
                const relativePath = response.download_links_relative[0];
                const downloadUrl = getProxiedFileDownloadUrl(relativePath);
                
                // Get the actual filename from the server if it exists, otherwise use the one from the input.
                const actualFilenameFromServer = response.files_server_paths?.[0]?.split(/[\\/]/).pop() || trimmedFilename;

                if (downloadUrl) {
                    console.log(`Triggering auto-download for ${actualFilenameFromServer}`);
                    triggerDownload(downloadUrl, actualFilenameFromServer);
                } else {
                    setError('PPT generated, but there was an issue creating the download link.');
                }
            } else if (response && response.error) {
                setError(response.error + (response.details ? ` Details: ${response.details}` : ''));
            } else {
                setError('Failed to generate PPT or get a valid download link from the server.');
                console.warn("Server response was missing expected success data:", response);
            }

            // CHANGE 4: Pass the direct response to the parent callback.
            if (onPptGenerated) {
                onPptGenerated(response);
            }

        } catch (err) {
            console.error("MarkdownToPptTool handleSubmit error:", err);
            const message = err.message || 'Failed to create presentation.';
            setError(message);
            const errorResponse = { status: 'error', error: message };
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
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
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

            {/* Display general error if not loading and apiResult hasn't set its own error */}
            {error && !isLoading && (
                 <div className="error-message" style={{marginTop: '15px'}}>
                    Error: {error}
                </div>
            )}

            {/* Display success message and a manual download link as a fallback */}
            {!isLoading && apiResult && apiResult.status === 'success' && (
                <div className="results-section" style={{marginTop: '15px'}}>
                    <h4 className="results-title">{apiResult.message || "Presentation generated successfully!"}</h4>
                    {apiResult.download_links_relative?.[0] && (
                        <p>
                            If your download didn't start, you can use this link:
                            <a
                                href={getProxiedFileDownloadUrl(apiResult.download_links_relative[0])}
                                download={apiResult.files_server_paths?.[0]?.split(/[\\/]/).pop() || filename}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ marginLeft: '5px', fontWeight: 'bold' }}
                            >
                                Download {apiResult.files_server_paths?.[0]?.split(/[\\/]/).pop() || filename}
                            </a>
                        </p>
                    )}
                </div>
            )}
        </div>
    );
};

export default MarkdownToPptToolContent;