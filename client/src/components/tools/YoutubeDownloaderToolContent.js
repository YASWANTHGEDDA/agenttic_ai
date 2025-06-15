// client/src/components/tools/YouTubeDownloaderToolContent.js
import React, { useState, useEffect } from 'react';
import { downloadYouTubeMedia, getProxiedFileDownloadUrl } from '../../services/api';
import './YouTubeDownloaderTool.css'; // Create this CSS file

const YouTubeDownloaderToolContent = ({ onMediaDownloaded = () => {}, initialData }) => {
    const [youtubeUrl, setYoutubeUrl] = useState(initialData?.url || '');
    const [qualityProfile, setQualityProfile] = useState(initialData?.quality || '720p');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [downloadResult, setDownloadResult] = useState(null); // API response: { message, files_server_paths, download_links_relative }

    useEffect(() => {
        setYoutubeUrl(initialData?.url || '');
        setQualityProfile(initialData?.quality || '720p');
        setDownloadResult(null);
        setError('');
    }, [initialData]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const urlPattern = /^(?:https?:\/\/)?(?:www\.)?(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))((\w|-){11})(?:\S+)?$/;
        if (!youtubeUrl.trim() || !urlPattern.test(youtubeUrl.trim())) {
            setError('Please enter a valid YouTube video or playlist URL.');
            return;
        }
        setIsLoading(true);
        setError('');
        setDownloadResult(null);

        try {
            const response = await downloadYouTubeMedia(youtubeUrl.trim(), qualityProfile);
            setDownloadResult(response);
            onMediaDownloaded({
                original_url: youtubeUrl.trim(),
                quality: qualityProfile,
                downloaded_count: response.files_server_paths?.length || 0,
                files_with_links: response.files_server_paths?.map((serverPath, index) => ({
                    name: serverPath.split(/[\\/]/).pop(),
                    link: response.download_links_relative?.[index] 
                        ? getProxiedFileDownloadUrl(response.download_links_relative[index]) 
                        : '#'
                })) || [],
                error: null
            });
        } catch (err) {
            console.error("YouTube download error:", err);
            const errorMessage = err.message || 'Failed to download YouTube media.';
            setError(errorMessage);
            setDownloadResult({ message: errorMessage, files_server_paths: [], download_links_relative: [] });
            onMediaDownloaded({ original_url: youtubeUrl.trim(), quality: qualityProfile, error: errorMessage });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="tool-content-panel youtube-downloader-tool">
            <h3>YouTube Downloader</h3>
            <p>Download a YouTube video or an entire playlist.</p>
            <form onSubmit={handleSubmit}>
                <div className="form-group">
                    <label htmlFor="youtubeUrl">YouTube URL (Video or Playlist):</label>
                    <input
                        type="url"
                        id="youtubeUrl"
                        value={youtubeUrl}
                        onChange={(e) => setYoutubeUrl(e.target.value)}
                        placeholder="e.g., https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                        required
                        disabled={isLoading}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="qualityProfile">Quality:</label>
                    <select 
                        id="qualityProfile" 
                        value={qualityProfile} 
                        onChange={(e) => setQualityProfile(e.target.value)}
                        disabled={isLoading}
                    >
                        <option value="best">Best Available (Video+Audio MP4)</option>
                        <option value="1080p">1080p (MP4)</option>
                        <option value="720p">720p (MP4)</option>
                        <option value="audio_mp3">Audio Only (MP3)</option>
                        <option value="audio_best">Best Audio (Original Format)</option>
                    </select>
                </div>
                <button type="submit" disabled={isLoading} style={{ marginTop: '15px' }}>
                    {isLoading ? 'Downloading...' : 'Download Media'}
                </button>
            </form>
            {error && <p className="error-message">{error}</p>}
            {downloadResult && (
                <div className="results-section" style={{marginTop: '15px'}}>
                    <h4>Result: {downloadResult.message}</h4>
                    {downloadResult.files_server_paths && downloadResult.files_server_paths.length > 0 && (
                        <>
                            <p>Successfully processed: {downloadResult.files_server_paths.length} file(s).</p>
                            <ul>
                                {downloadResult.files_server_paths.map((filepath, index) => {
                                    const filename = filepath.split(/[\\/]/).pop();
                                    const downloadLink = downloadResult.download_links_relative?.[index]
                                        ? getProxiedFileDownloadUrl(downloadResult.download_links_relative[index])
                                        : null;
                                    return (
                                        <li key={index}>
                                            {filename}
                                            {downloadLink && (
                                                <a href={downloadLink} download={filename} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '10px' }}>
                                                    (Download)
                                                </a>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

export default YouTubeDownloaderToolContent;