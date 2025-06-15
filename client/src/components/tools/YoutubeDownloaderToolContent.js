// client/src/components/tools/YoutubeDownloaderToolContent.js
import React, { useState } from 'react';
import { downloadYouTubeMedia, getProxiedFileDownloadUrl } from '../../services/api';

const YoutubeDownloaderToolContent = ({ onMediaDownloaded }) => {
    const [youtubeUrl, setYoutubeUrl] = useState('');
    const [qualityProfile, setQualityProfile] = useState('720p');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const [apiResult, setApiResult] = useState(null);

    const handleUrlChange = (e) => {
        const rawValue = e.target.value;
        // console.log("YoutubeDownloaderToolContent: Raw input value for URL:", `"${rawValue}"`); // See exactly what the input gives
        setYoutubeUrl(rawValue);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const currentUrl = youtubeUrl.trim(); // Use a trimmed version for validation and sending

        if (!currentUrl) {
            setError("Please enter a YouTube URL.");
            return;
        }
        try {
            new URL(currentUrl); // Validate if it's a URL structure
        } catch (_) {
            setError("Invalid YouTube URL format. Please include http(s)://");
            return;
        }

        setIsLoading(true);
        setError(null);
        setApiResult(null);

        const params = {
            url: currentUrl, // Send the trimmed URL
            quality: qualityProfile
        };

        // --- AGGRESSIVE LOGGING ---
        console.log("YoutubeDownloaderToolContent: handleSubmit triggered.");
        console.log("YoutubeDownloaderToolContent: Current youtubeUrl state (trimmed):", `"${currentUrl}"`);
        console.log("YoutubeDownloaderToolContent: Current qualityProfile state:", `"${qualityProfile}"`);
        console.log("YoutubeDownloaderToolContent: Constructed 'params' object to send:", params);
        
        // Log what JSON.stringify would produce. This is what Axios should effectively do.
        let jsonStringForPayload;
        try {
            jsonStringForPayload = JSON.stringify(params);
            console.log("YoutubeDownloaderToolContent: 'params' object stringified to JSON:", jsonStringForPayload);
        } catch (stringifyError) {
            console.error("YoutubeDownloaderToolContent: CRITICAL - Error stringifying 'params' object:", stringifyError);
            setError("Client-side error: Could not prepare data for sending. " + stringifyError.message);
            setIsLoading(false);
            if (onMediaDownloaded) {
                 onMediaDownloaded({ status: 'error', error: "Client data preparation error", original_url: currentUrl, quality: qualityProfile });
            }
            return;
        }
        // --- END OF AGGRESSIVE LOGGING ---


        try {
            // The downloadYouTubeMedia function in api.js should take the 'params' object
            // and Axios will handle stringifying it to JSON for the POST request body.
            const response = await downloadYouTubeMedia(params); 

            console.log("YoutubeDownloaderToolContent: API response received:", response);
            setApiResult(response); 

            if (onMediaDownloaded) {
                onMediaDownloaded(response); 
            }

        } catch (err) {
            console.error("YoutubeDownloaderToolContent: handleSubmit API call error:", err);
            const message = err.message || "An unknown error occurred during YouTube download.";
            setError(message);
            const errorResponse = {
                status: 'error',
                error: message, 
                original_url: params.url,
                quality: params.quality,
                details: err.response?.data?.details || err.response?.data?.python_error || err.response?.data?.error || err.toString(),
                files_server_paths: [],
                download_links_relative: []
            };
            setApiResult(errorResponse);
            if (onMediaDownloaded) {
                onMediaDownloaded(errorResponse);
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="youtube-downloader-tool tool-form-container">
            <h3 className="tool-title">YouTube Media Downloader</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="youtube-url">YouTube Video URL:</label>
                    <input
                        type="url"
                        id="youtube-url"
                        value={youtubeUrl}
                        // onChange={(e) => setYoutubeUrl(e.target.value)} // Original
                        onChange={handleUrlChange} // Use the new handler for logging
                        placeholder="e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                        required
                        disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="quality-profile">Quality Profile:</label>
                    <select
                        id="quality-profile"
                        value={qualityProfile}
                        onChange={(e) => setQualityProfile(e.target.value)}
                        disabled={isLoading}
                    >
                        <option value="best">Best Available</option>
                        <option value="1080p">1080p</option>
                        <option value="720p">720p (Default)</option>
                        <option value="480p">480p</option>
                        <option value="360p">360p</option>
                        <option value="audio_best">Best Audio Only (m4a)</option>
                        <option value="audio_mp3">Audio Only (mp3)</option>
                    </select>
                </div>
                <button type="submit" disabled={isLoading || !youtubeUrl.trim()}>
                    {isLoading ? 'Downloading...' : 'Download Media'}
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
                            <h4 className="results-title">{apiResult.message || `Download Successful.`}</h4>
                            {apiResult.download_links_relative && apiResult.download_links_relative.length > 0 ? (
                                <>
                                    <p>Downloaded file(s):</p>
                                    <ul>
                                        {apiResult.files_server_paths?.map((serverPath, index) => {
                                            const relPath = apiResult.download_links_relative?.[index];
                                            if (!relPath) return null;
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
                                <p>The operation was successful, but no files were processed or returned for this URL/quality.</p>
                            )}
                        </>
                    ) : ( 
                        <div className="error-message">
                            <h4>Download Failed</h4>
                            <p>{apiResult.error || apiResult.message || 'An unspecified error occurred.'}</p>
                            {apiResult.details && <p>Details: {apiResult.details}</p>}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default YoutubeDownloaderToolContent;