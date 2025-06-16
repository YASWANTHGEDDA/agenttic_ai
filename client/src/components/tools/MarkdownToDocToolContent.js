// // client/src/components/tools/MarkdownToDocToolContent.js
// import React, { useState } from 'react';
// import { createDocumentFromMarkdown, getProxiedFileDownloadUrl } from '../../services/api'; // Adjust as per your api.js
// import '../MarkdownToOfficeTool.css'; // Or a specific CSS file

// const MarkdownToDocToolContent = ({ onDocGenerated }) => {
//     const [markdown, setMarkdown] = useState(
// `### Slide 1: My Document Title
// **Content Key (e.g., Author Notes):**
// This is some sample content for the selected key.

// ---
// ### Slide 2: Another Section
// **Content Key (e.g., Author Notes):**
// More notes here.`
//     );
//     const [filename, setFilename] = useState('MyGeneratedDocument.docx');
//     const [contentKey, setContentKey] = useState('text_content'); // Default to the most common key
//     const [isLoading, setIsLoading] = useState(false);
//     const [error, setError] = useState('');
//     const [apiResult, setApiResult] = useState(null);

//     const triggerDownload = (url, downloadFilename) => {
//         const link = document.createElement('a');
//         link.href = url;
//         link.setAttribute('download', downloadFilename || 'document.docx');
//         document.body.appendChild(link);
//         link.click();
//         document.body.removeChild(link);
//     };

//     const handleSubmit = async (e) => {
//         e.preventDefault();
//         setError('');
//         setApiResult(null);

//         const currentFilename = String(filename || '').trim();
//         const currentMarkdown = String(markdown || '').trim();

//         if (!currentMarkdown) {
//             setError('Markdown content cannot be empty.');
//             return;
//         }
//         if (!currentFilename || !currentFilename.toLowerCase().endsWith('.docx')) {
//             setError('Filename must be provided and end with .docx');
//             return;
//         }
//         if (!contentKey) {
//             setError('Please select a Content Key for the DOCX.');
//             return;
//         }
        
//         setIsLoading(true);

//         try {
//             // The service already returns the data object, so `response` IS the data.
//             const response = await createDocumentFromMarkdown(currentMarkdown, contentKey, currentFilename);
            
//             // CHANGE 1: Log the response object directly
//             console.log('MarkdownToDocToolContent: API Response received:', response);
            
//             // CHANGE 2: Set state with the direct response
//             setApiResult(response);

//             // CHANGE 3: Check conditions on the `response` object itself
//             if (response && response.status === 'success' && response.download_links_relative?.[0]) {
//                 const relativePath = response.download_links_relative[0];
//                 const downloadUrl = getProxiedFileDownloadUrl(relativePath);
//                 const actualFilenameFromServer = response.files_server_paths?.[0]?.split(/[\\/]/).pop() || currentFilename;

//                 if (downloadUrl) {
//                     triggerDownload(downloadUrl, actualFilenameFromServer);
//                 } else {
//                     setError('DOCX generated, but an issue occurred with the download link.');
//                 }
//             } else if (response && response.error) {
//                 setError(response.error + (response.details ? ` Details: ${response.details}` : ''));
//             } else {
//                 setError('Failed to generate DOCX or get a valid download link from the server.');
//                 console.warn("Server response was missing expected success data:", response);
//             }

//             // CHANGE 4: Pass the direct response to the parent callback
//             if (onDocGenerated) {
//                 onDocGenerated(response);
//             }

//         } catch (err) {
//             console.error("MarkdownToDocToolContent.js handleSubmit error:", err);
//             setError(err.message || 'Failed to create document.');
//             const errorResponse = { status: 'error', error: err.message };
//             setApiResult(errorResponse);
//             if (onDocGenerated) {
//                 onDocGenerated(errorResponse);
//             }
//         } finally {
//             setIsLoading(false);
//         }
//     };

//     return (
//         <div className="markdown-to-doc-tool tool-form-container">
//             <h3 className="tool-title">Markdown to DOCX</h3>
//             <p>Generate a DOCX file from Markdown, extracting content based on a specific key.</p>
//             <form onSubmit={handleSubmit}>
//                 <div className="form-group">
//                     <label htmlFor="docFilename">Output Filename:</label>
//                     <input
//                         type="text"
//                         id="docFilename"
//                         value={filename}
//                         onChange={(e) => setFilename(e.target.value)}
//                         placeholder="MyGeneratedDocument.docx"
//                         required
//                         disabled={isLoading}
//                     />
//                 </div>
//                 <div className="form-group">
//                     <label htmlFor="docContentKey">Content Key to Extract:</label>
//                     <select
//                         id="docContentKey"
//                         value={contentKey}
//                         onChange={(e) => setContentKey(e.target.value)}
//                         required
//                         disabled={isLoading}
//                     >
//                         <option value="text_content">Slide Text Content</option>
//                         <option value="author_notes">Author Notes</option>
//                         <option value="image_prompt">Image Prompts</option>
//                     </select>
//                 </div>
//                 <div className="form-group">
//                     <label htmlFor="markdownContentDoc">Markdown Content:</label>
//                     <textarea
//                         id="markdownContentDoc"
//                         value={markdown}
//                         onChange={(e) => setMarkdown(e.target.value)}
//                         rows="15"
//                         placeholder="Enter your slide content in Markdown format..."
//                         required
//                         disabled={isLoading}
//                         style={{ fontFamily: 'monospace', minHeight: '200px', lineHeight: '1.5' }}
//                     />
//                 </div>
//                 <button type="submit" disabled={isLoading} style={{ marginTop: '10px' }}>
//                     {isLoading ? 'Generating DOCX...' : 'Generate & Download DOCX'}
//                 </button>
//             </form>

//             {isLoading && <div className="loading-spinner-container" style={{marginTop: '15px'}}><div className="loader"></div> Processing...</div>}
            
//             {error && !isLoading && (
//                 <div className="error-message" style={{marginTop: '15px'}}>Error: {error}</div>
//             )}

//             {!isLoading && apiResult && apiResult.status === 'success' && (
//                 <div className="results-section" style={{ marginTop: '15px' }}>
//                     <h4 className="results-title">{apiResult.message || "Document generated successfully!"}</h4>
//                     {apiResult.download_links_relative?.[0] && (
//                         <p>
//                             If your download didn't start, you can
//                             <a
//                                 href={getProxiedFileDownloadUrl(apiResult.download_links_relative[0])}
//                                 download={apiResult.files_server_paths?.[0]?.split(/[\\/]/).pop() || filename}
//                                 target="_blank"
//                                 rel="noopener noreferrer"
//                                 style={{ marginLeft: '5px', fontWeight: 'bold' }}
//                             >
//                                 download it here.
//                             </a>
//                         </p>
//                     )}
//                 </div>
//             )}
//         </div>
//     );
// };

// export default MarkdownToDocToolContent;

// client/src/components/tools/MarkdownToDocToolContent.js
import React, { useState } from 'react';
import { createDocumentFromMarkdown, getProxiedFileDownloadUrl } from '../../services/api';
import '../MarkdownToOfficeTool.css';

const MarkdownToDocToolContent = ({ onDocGenerated }) => {
    const [markdown, setMarkdown] = useState(
`### Slide 1: My Document Title
**text_content:**
This is some sample content for the selected key.

---
### Slide 2: Another Section
**text_content:**
More notes here.`
    );
    const [filename, setFilename] = useState('MyGeneratedDocument.docx');
    const [contentKey, setContentKey] = useState('text_content');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [apiResult, setApiResult] = useState(null);

    const triggerDownload = (url, downloadFilename) => {
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', downloadFilename || 'document.docx');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setApiResult(null);

        const currentFilename = String(filename || '').trim();
        const currentMarkdown = String(markdown || '').trim();

        if (!currentMarkdown) {
            setError('Markdown content cannot be empty.');
            return;
        }
        if (!currentFilename || !currentFilename.toLowerCase().endsWith('.docx')) {
            setError('Filename must be provided and end with .docx');
            return;
        }
        if (!contentKey) {
            setError('Please select a Content Key for the DOCX.');
            return;
        }
        
        setIsLoading(true);

        // MODIFIED: Create a payload object
        const payload = {
            markdown_content: currentMarkdown,
            content_key: contentKey,
            filename: currentFilename
        };

        try {
            console.log('MarkdownToDocToolContent: Sending payload:', JSON.stringify(payload, null, 2)); // Log payload
            const response = await createDocumentFromMarkdown(payload); // Pass the payload object
            
            console.log('MarkdownToDocToolContent: API Response received:', response);
            setApiResult(response);

            // Using response directly from API call
            if (response && response.status === 'success' && response.download_link_relative) { // Python returns single link
                const downloadUrl = getProxiedFileDownloadUrl(response.download_link_relative);
                const actualFilenameFromServer = response.file_server_path?.split(/[\\/]/).pop() || currentFilename;

                if (downloadUrl) {
                    triggerDownload(downloadUrl, actualFilenameFromServer);
                } else {
                    setError('DOCX generated, but an issue occurred with the download link.');
                }
            } else if (response && (response.error || response.message?.toLowerCase().includes('fail'))) {
                setError(response.error || response.message + (response.details ? ` Details: ${response.details}` : ''));
            } else if (!response || response.status !== 'success') {
                setError('Failed to generate DOCX or get a valid download link from the server.');
                console.warn("Server response was missing expected success data:", response);
            }

            if (onDocGenerated) {
                onDocGenerated(response);
            }

        } catch (err) {
            console.error("MarkdownToDocToolContent.js handleSubmit error:", err);
            const message = err.message || 'Failed to create document.';
            setError(message);
            const errorResponse = { status: 'error', error: message, details: err.response?.data?.details };
            setApiResult(errorResponse);
            if (onDocGenerated) {
                onDocGenerated(errorResponse);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="markdown-to-doc-tool tool-form-container">
            <h3 className="tool-title">Markdown to DOCX</h3>
            <p>Generate a DOCX file from Markdown, extracting content based on a specific key.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="docFilename">Output Filename:</label>
                    <input
                        type="text"
                        id="docFilename"
                        value={filename}
                        onChange={(e) => setFilename(e.target.value)}
                        placeholder="MyGeneratedDocument.docx"
                        required
                        disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="docContentKey">Content Key to Extract:</label>
                    <select
                        id="docContentKey"
                        value={contentKey}
                        onChange={(e) => setContentKey(e.target.value)}
                        required
                        disabled={isLoading}
                    >
                        <option value="text_content">Slide Text Content (text_content)</option>
                        <option value="author_notes">Author Notes (author_notes)</option>
                        <option value="image_prompt">Image Prompts (image_prompt)</option>
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="markdownContentDoc">Markdown Content:</label>
                    <textarea
                        id="markdownContentDoc"
                        value={markdown}
                        onChange={(e) => setMarkdown(e.target.value)}
                        rows="15"
                        placeholder="Enter your slide content in Markdown format..."
                        required
                        disabled={isLoading}
                        style={{ fontFamily: 'monospace', minHeight: '200px', lineHeight: '1.5' }}
                    />
                </div>
                <button type="submit" disabled={isLoading} style={{ marginTop: '10px' }}>
                    {isLoading ? 'Generating DOCX...' : 'Generate & Download DOCX'}
                </button>
            </form>

            {isLoading && <div className="loading-spinner-container" style={{marginTop: '15px'}}><div className="loader"></div> Processing...</div>}
            
            {error && !isLoading && (
                <div className="error-message" style={{marginTop: '15px'}}>Error: {error}</div>
            )}

            {!isLoading && apiResult && apiResult.status === 'success' && (
                <div className="results-section" style={{ marginTop: '15px' }}>
                    <h4 className="results-title">{apiResult.message || "Document generated successfully!"}</h4>
                    {apiResult.download_link_relative && (
                        <p>
                            If your download didn't start, you can
                            <a
                                href={getProxiedFileDownloadUrl(apiResult.download_link_relative)}
                                download={apiResult.file_server_path?.split(/[\\/]/).pop() || filename}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ marginLeft: '5px', fontWeight: 'bold' }}
                            >
                                download it here.
                            </a>
                        </p>
                    )}
                </div>
            )}
            {!isLoading && apiResult && apiResult.status !== 'success' && apiResult.error && (
                 <div className="error-message" style={{marginTop: '15px'}}>Error: {apiResult.error} {apiResult.details ? `(${apiResult.details})` : ''}</div>
            )}
        </div>
    );
};

export default MarkdownToDocToolContent;