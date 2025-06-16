// client/src/App.js
import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { CircularProgress } from '@mui/material';

// Import our custom ThemeProvider
import { ThemeProvider } from './context/ThemeContext';

// Lazy load components to reduce initial bundle size
const AuthPage = React.lazy(() => import('./components/AuthPage'));
const ChatPage = React.lazy(() => import('./components/ChatPage'));

// The LoadingFallback now inherits the background color from the body,
// which is controlled by our new theme CSS variables.
const LoadingFallback = () => (
    <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
    }}>
        <CircularProgress />
    </div>
);

function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('userId'));

    useEffect(() => {
        const handleStorageChange = (event) => {
            if (event.key === 'userId') {
                const hasUserId = !!event.newValue;
                console.log("App Storage Listener: userId changed, setting isAuthenticated to", hasUserId);
                setIsAuthenticated(hasUserId);
            }
        };

        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    return (
        // Wrap the entire application with our custom ThemeProvider.
        // It no longer needs a 'theme' prop, as it manages state internally.
        <ThemeProvider>
            <Router>
                {/*
                  This div is simplified. We removed the hardcoded dark theme colors.
                  The background and text colors are now automatically applied to the <body>
                  element by the styles in `index.css` based on the active theme.
                */}
                <div className="app-container">
                    <Suspense fallback={<LoadingFallback />}>
                        <Routes>
                            <Route
                                path="/login"
                                element={
                                    !isAuthenticated ? (
                                        <AuthPage setIsAuthenticated={setIsAuthenticated} />
                                    ) : (
                                        <Navigate to="/chat" replace />
                                    )
                                }
                            />

                            <Route
                                path="/chat"
                                element={
                                    isAuthenticated ? (
                                        <ChatPage setIsAuthenticated={setIsAuthenticated} />
                                    ) : (
                                        <Navigate to="/login" replace />
                                    )
                                }
                            />

                            <Route
                                path="/"
                                element={
                                    isAuthenticated ? (
                                        <Navigate to="/chat" replace />
                                    ) : (
                                        <Navigate to="/login" replace />
                                    )
                                }
                            />

                            <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                    </Suspense>
                </div>
            </Router>
        </ThemeProvider>
    );
}

export default App;