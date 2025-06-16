// client/src/components/AuthPage.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signinUser, signupUser, saveApiKeys } from '../services/api';
import ApiKeyModal from './ApiKeyModal'; // We will render this component's content directly

const AuthPage = ({ setIsAuthenticated }) => {
    // ==================================================================
    //  START OF MODIFICATION: State-driven workflow
    // ==================================================================
    
    // This state now controls which view is shown: 'auth' or 'apiKeys'
    const [currentStep, setCurrentStep] = useState('auth');
    
    const [isLogin, setIsLogin] = useState(true);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // We no longer need tempUser state, as username will be in localStorage
    
    // ==================================================================
    //  END OF MODIFICATION
    // ==================================================================

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (!username.trim() || !password.trim()) {
            setError('Username and password cannot be empty.');
            setLoading(false);
            return;
        }

        try {
            const userData = { username, password };
            let response;
            if (isLogin) {
                response = await signinUser(userData);
            } else {
                if (password.length < 6) {
                    setError('Password must be at least 6 characters long.');
                    setLoading(false);
                    return;
                }
                response = await signupUser(userData);
            }

            // ==================================================================
            //  START OF FIX
            // ==================================================================
            // The api service returns the `data` object directly on success.
            // We destructure `response` itself, not `response.data`.
            const { hasProvidedApiKeys, sessionId, username: loggedInUsername, _id: userId } = response;
            // ==================================================================
            //  END OF FIX
            // ==================================================================

            if (!userId || !sessionId || !loggedInUsername) {
                throw new Error("Incomplete authentication data received from server.");
            }

            // Always set localStorage immediately after successful login/signup
            localStorage.setItem('sessionId', sessionId);
            localStorage.setItem('username', loggedInUsername);
            localStorage.setItem('userId', userId);
            
            // --- This is the critical decision point ---
            if (hasProvidedApiKeys) {
                // If keys exist, we're done. Go to chat.
                setIsAuthenticated(true);
                navigate('/chat', { replace: true });
            } else {
                // If keys are missing, transition to the next step.
                setCurrentStep('apiKeys');
            }

        } catch (err) {
            const errorMessage = err.response?.data?.message || err.message || `An error occurred.`;
            setError(errorMessage);
            localStorage.clear(); // Clear all auth data on failure
            setIsAuthenticated(false);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveKeys = async (keyData) => {
        try {
            await saveApiKeys(keyData);
            setIsAuthenticated(true);
            navigate('/chat', { replace: true });
        } catch (err) {
            console.error("Failed to save API keys from AuthPage:", err);
            // Re-throw the error so it can be caught and displayed by the ApiKeyModal component
            throw err;
        }
    };

    const toggleMode = () => {
        setIsLogin(!isLogin);
        setUsername('');
        setPassword('');
        setError('');
    };

    return (
        <div className="auth-container">
            {currentStep === 'auth' && (
                <div className="auth-box">
                    <h2>{isLogin ? 'Sign In' : 'Sign Up'}</h2>
                    <form onSubmit={handleAuth}>
                        <div className="input-group">
                            <label htmlFor="username">Username</label>
                            <input
                                type="text" id="username" value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required autoComplete="username"
                                disabled={loading}
                            />
                        </div>
                        <div className="input-group">
                            <label htmlFor="password">Password</label>
                            <input
                                type="password" id="password" value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required autoComplete={isLogin ? "current-password" : "new-password"}
                                disabled={loading}
                            />
                        </div>
                        {error && <p className="error-message">{error}</p>}
                        <button type="submit" disabled={loading} className="auth-button">
                            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
                        </button>
                    </form>
                    <button onClick={toggleMode} className="toggle-button" disabled={loading}>
                        {isLogin ? 'Need an account? Sign Up' : 'Have an account? Sign In'}
                    </button>
                </div>
            )}

            {/* --- NEW RENDER LOGIC: API Key form is rendered IN PLACE of the auth form --- */}
            {currentStep === 'apiKeys' && (
                <ApiKeyModal
                    // The ApiKeyModal now functions as a form, not an overlay.
                    // It will be centered by the .auth-container flexbox.
                    username={localStorage.getItem('username')}
                    onSave={handleSaveKeys}
                    // The onClose prop from the modal is no longer needed in this workflow
                />
            )}
        </div>
    );
};

// ==================================================================
//  MODIFICATION: CSS is now fully theme-aware
// ==================================================================
const AuthPageCSS = `
.auth-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    background-color: var(--bg-secondary);
    padding: 1rem;
}
.auth-box {
    background-color: var(--bg-primary);
    color: var(--text-primary);
    padding: 40px;
    border-radius: 12px;
    border: 1px solid var(--border-primary);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 420px;
    text-align: center;
}
.auth-box h2 {
    margin-top: 0;
    margin-bottom: 25px;
    color: var(--text-primary);
    font-size: 1.8rem;
    font-weight: 600;
}
.input-group {
    margin-bottom: 20px;
    text-align: left;
}
.input-group label {
    display: block;
    margin-bottom: 8px;
    color: var(--text-secondary);
    font-weight: 500;
}
.input-group input {
    width: 100%;
    padding: 12px 15px;
    border: 1px solid var(--border-primary);
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    border-radius: 6px;
    box-sizing: border-box;
    font-size: 1rem;
    transition: all 0.2s ease;
}
.input-group input:focus {
    outline: none;
    border-color: var(--accent-active);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-active) 20%, transparent);
}
.input-group input:disabled {
    background-color: var(--bg-tertiary);
    opacity: 0.6;
    cursor: not-allowed;
}
.auth-button {
    width: 100%;
    padding: 12px;
    background-color: var(--accent-active);
    color: var(--text-on-accent);
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-top: 10px;
}
.auth-button:hover:not(:disabled) {
    background-color: var(--accent-hover);
}
.auth-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
.toggle-button {
    background: none;
    border: none;
    color: var(--accent-active);
    cursor: pointer;
    margin-top: 20px;
    font-size: 0.9rem;
    font-weight: 500;
}
.toggle-button:hover:not(:disabled) {
    text-decoration: underline;
}
.toggle-button:disabled {
    color: var(--text-secondary);
    cursor: not-allowed;
}
.error-message {
    color: #e53e3e; /* Standard error color */
    margin-top: 15px;
    margin-bottom: 0;
    font-size: 0.9rem;
}
`;
// --- Inject CSS (Unchanged) ---
const styleTagAuthId = 'auth-page-styles';
if (!document.getElementById(styleTagAuthId)) {
    const styleTag = document.createElement("style");
    styleTag.id = styleTagAuthId;
    styleTag.type = "text/css";
    styleTag.innerText = AuthPageCSS;
    document.head.appendChild(styleTag);
}

export default AuthPage;