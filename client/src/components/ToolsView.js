// client/src/components/ToolsView.js
import React, { useState } from 'react';
import WebPdfDownloaderToolContent from './tools/WebPdfDownloaderToolContent';
import AcademicSearchToolContent from './tools/AcademicSearchToolContent';
import MarkdownToPptToolContent from './tools/MarkdownToPptToolContent';
import MarkdownToDocToolContent from './tools/MarkdownToDocToolContent';
import OcrToolContent from './tools/OcrToolContent';
import YouTubeDownloaderToolContent from './tools/YoutubeDownloaderToolContent';
import './ToolsView.css'; // Your global tool styling

const ToolsView = () => {
  const [activeTool, setActiveTool] = useState(null); // No tool selected initially

  // State for results if ToolsView itself needs to display them in a common panel
  // These are updated by callbacks passed to the individual tool components.
  const [youtubePanelResult, setYoutubePanelResult] = useState(null);
  const [pdfPanelResult, setPdfPanelResult] = useState(null);
  const [docPanelResult, setDocPanelResult] = useState(null);
  // Add more states for other tool results if needed for a global panel

  const handleYouTubeDownloadForPanel = (data) => {
    console.log("ToolsView: YouTube Download Data Received for Panel:", data);
    setYoutubePanelResult(data);
    // Clear other panel results if you only want one active at a time
    setPdfPanelResult(null);
    setDocPanelResult(null);
  };

  const handlePdfDownloadForPanel = (data) => {
    console.log("ToolsView: PDF Download Data Received for Panel:", data); // This is the log from your screenshot
    setPdfPanelResult(data);
    setYoutubePanelResult(null);
    setDocPanelResult(null);
  };

  const handleDocGenerationForPanel = (data) => {
    console.log("ToolsView: DOCX Generation Data Received for Panel:", data);
    setDocPanelResult(data);
    setYoutubePanelResult(null);
    setPdfPanelResult(null);
  };

  const toolList = [
    { id: 'webPdfDownloader', name: 'Web PDF Downloader', Component: WebPdfDownloaderToolContent, props: { onPdfsDownloaded: handlePdfDownloadForPanel } },
    { id: 'academicSearch', name: 'Academic Search', Component: AcademicSearchToolContent, props: {} },
    { id: 'markdownToPpt', name: 'Markdown to PowerPoint', Component: MarkdownToPptToolContent, props: {} },
    { id: 'markdownToDoc', name: 'Markdown to DOCX', Component: MarkdownToDocToolContent, props: { onDocGenerated: handleDocGenerationForPanel } },
    { id: 'ocrTool', name: 'OCR Tool', Component: OcrToolContent, props: {} },
    { id: 'youtubeDownloader', name: 'YouTube Downloader', Component: YouTubeDownloaderToolContent, props: { onMediaDownloaded: handleYouTubeDownloadForPanel } },
  ];

  const ActiveToolDetails = activeTool ? toolList.find(tool => tool.id === activeTool) : null;
  const ActiveToolComponent = ActiveToolDetails ? ActiveToolDetails.Component : null;
  const activeToolProps = ActiveToolDetails ? ActiveToolDetails.props : {};

  const selectTool = (toolId) => {
    setActiveTool(toolId);
    // Clear all panel results when a new tool is selected from the sidebar
    setYoutubePanelResult(null);
    setPdfPanelResult(null);
    setDocPanelResult(null);
  };

  return (
    <div className="tools-view-container">
      <aside className="tools-sidebar">
        <h2>Tools</h2>
        <ul>
          {toolList.map(tool => (
            <li key={tool.id}>
              <button
                className={`tool-button ${activeTool === tool.id ? 'active' : ''}`}
                onClick={() => selectTool(tool.id)} // Use the new handler
              >
                {tool.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <main className="tools-content-area">
        {ActiveToolComponent ? (
          <ActiveToolComponent {...activeToolProps} />
        ) : (
          <div className="info-message">
            <p>Select a tool from the sidebar to configure and use.</p>
          </div>
        )}

        {/* 
          Optional common "Panel Results" area managed by ToolsView state.
          The individual tool components (like WebPdfDownloaderToolContent) 
          will also have their own internal result display. This is for a global panel if desired.
        */}
        {/* {activeTool === 'webPdfDownloader' && pdfPanelResult && (
          <div className="panel-results-display">
            <h4>Web PDF Downloader - Panel Results:</h4>
            {pdfPanelResult.status === 'success' && pdfPanelResult.download_links_relative?.length > 0 ? (
              <ul>{pdfPanelResult.download_links_relative.map((link, i) => <li key={`panel-${i}`}>{link}</li>)}</ul>
            ) : pdfPanelResult.error ? <p className="error-message">Error: {pdfPanelResult.error}</p> : <p>No files downloaded.</p>}
          </div>
        )}
        {activeTool === 'youtubeDownloader' && youtubePanelResult && (
             <div className="panel-results-display">
                <h4>YouTube Downloader - Panel Results:</h4>
                {youtubePanelResult.status === 'success' && youtubePanelResult.download_links_relative?.length > 0 ? (
                <ul>{youtubePanelResult.download_links_relative.map((link, i) => <li key={`panel-yt-${i}`}>{link}</li>)}</ul>
                ) : youtubePanelResult.error ? <p className="error-message">Error: {youtubePanelResult.error}</p> : <p>No media downloaded.</p>}
            </div>
        )} */}
      </main>
    </div>
  );
};

export default ToolsView;