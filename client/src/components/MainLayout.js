// client/src/components/MainLayout.js

import React, { useState, Suspense, useCallback } from 'react';
import Sidebar from './Sidebar';
import AnalysisResultModal from './AnalysisResultModal';
import './MainLayout.css'; // Import the new CSS file

// Lazy load the different "views" for better performance
const ChatPage = React.lazy(() => import('./ChatPage'));
const FilesView = React.lazy(() => import('./FilesView'));
const AnalysisView = React.lazy(() => import('./AnalysisView'));
const ToolsView = React.lazy(() => import('./ToolsView'));

const LoadingFallback = () => <div className="loading-fallback">Loading View...</div>;

const MainLayout = ({ performLogout }) => {
    // This state controls which view is visible in the main content area
    const [currentView, setCurrentView] = useState('chat');
    
    // State to manage analysis data for the dedicated AnalysisView
    const [analysisViewData, setAnalysisViewData] = useState(null);
    const [analysisDocumentName, setAnalysisDocumentName] = useState('');

    // State to handle the pop-up modal for manual analysis
    const [isManualAnalysisModalOpen, setIsManualAnalysisModalOpen] = useState(false);
    const [manualAnalysisModalData, setManualAnalysisModalData] = useState(null);

    const username = localStorage.getItem('username') || 'User';

    // This is called when a manual analysis is requested from FileManagerWidget
    const handleManualAnalysisRequest = useCallback((data) => {
        setManualAnalysisModalData(data);
        setIsManualAnalysisModalOpen(true);
    }, []);

    const closeManualAnalysisModal = useCallback(() => {
        setIsManualAnalysisModalOpen(false);
        setManualAnalysisModalData(null);
    }, []);

    // This is called when the auto-analysis results are ready
    const handleAutoAnalysisReady = useCallback((data, docName) => {
        setAnalysisViewData(data);
        setAnalysisDocumentName(docName);
        setCurrentView('analysis'); // Automatically switch to the analysis view
    }, []);

    return (
        <div className="app-container">
            <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
            
            <div className="main-content-area">
                <header className="main-header">
                    <h2>FusedChat: {currentView.charAt(0).toUpperCase() + currentView.slice(1)}</h2>
                    <div>
                        <span>Hi, {username}!</span>
                        <button onClick={performLogout}>Logout</button>
                    </div>
                </header>
                
                <main className="main-content-view">
                    <Suspense fallback={<LoadingFallback />}>
                        {currentView === 'chat' && <ChatPage />}
                        {currentView === 'files' && <FilesView onAnalysisRequest={handleManualAnalysisRequest} onAutoAnalysisReady={handleAutoAnalysisReady} />}
                        {currentView === 'analysis' && <AnalysisView analysisData={analysisViewData} documentName={analysisDocumentName}/>}
                        {currentView === 'tools' && <ToolsView />}
                        {/* You can add a History view component here later */}
                    </Suspense>
                </main>
            </div>

            {/* This modal is for manual analysis results */}
            {manualAnalysisModalData && (
                <AnalysisResultModal
                    isOpen={isManualAnalysisModalOpen}
                    onClose={closeManualAnalysisModal}
                    analysisData={manualAnalysisModalData}
                />
            )}
        </div>
    );
};

export default MainLayout;