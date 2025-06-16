// client/src/components/ApiKeyModal.js
import React, { useState } from 'react';
// Import the component's dedicated CSS file to style the new links
import './ApiKeyModal.css'; 

const ApiKeyModal = ({ username, onSave }) => {
    const [geminiApiKey, setGeminiApiKey] = useState('');
    const [grokApiKey, setGrokApiKey] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!geminiApiKey.trim() || !grokApiKey.trim()) {
            setError('For the best experience, both Gemini and Grok API keys are recommended.');
        }

        setLoading(true);
        try {
            await onSave({ geminiApiKey, grokApiKey });
            // AuthPage handles navigation on success.
        } catch (err)
        {
            const errorMessage = err.response?.data?.message || 'Failed to save keys. Please try again.';
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        // Use the 'auth-box' class to inherit all styling from AuthPage
        <div className="auth-box"> 
            <h2>Welcome, {username}!</h2>
            <p className="auth-sub-header">To complete your setup, please enter your API keys.</p>
            
            <form onSubmit={handleSubmit}>
                <div className="input-group">
                    {/* ================================================================== */}
                    {/* START OF MODIFICATION */}
                    {/* ================================================================== */}
                    <label htmlFor="gemini-key">
                        Gemini AI API Key
                        <a 
                            href="https://aistudio.google.com/app/apikey" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="api-key-link"
                        >
                            (Get API Key)
                        </a>
                    </label>
                    {/* ================================================================== */}
                    {/* END OF MODIFICATION */}
                    {/* ================================================================== */}
                    <input
                        id="gemini-key"
                        type="password"
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="Enter your Gemini API Key"
                        disabled={loading}
                        autoComplete="new-password"
                    />
                </div>
                <div className="input-group">
                    {/* ================================================================== */}
                    {/* START OF MODIFICATION */}
                    {/* ================================================================== */}
                    <label htmlFor="grok-key">
                        Grok API Key
                        <a 
                            href="https://console.groq.com/keys" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="api-key-link"
                        >
                            (Get API Key)
                        </a>
                    </label>
                    {/* ================================================================== */}
                    {/* END OF MODIFICATION */}
                    {/* ================================================================== */}
                    <input
                        id="grok-key"
                        type="password"
                        value={grokApiKey}
                        onChange={(e) => setGrokApiKey(e.target.value)}
                        placeholder="Enter your Grok API Key"
                        disabled={loading}
                        autoComplete="new-password"
                    />
                </div>
                {error && <p className="error-message">{error}</p>}
                <button type="submit" disabled={loading} className="auth-button">
                    {loading ? 'Saving...' : 'Save and Continue'}
                </button>
            </form>
        </div>
    );
};

export default ApiKeyModal;