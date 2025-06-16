// server/routes/chat.js
const express = require('express');
const axios = require('axios');
const { tempAuth } = require('../middleware/authMiddleware');
const ChatHistory = require('../models/ChatHistory');
const { v4: uuidv4 } = require('uuid');
const User = require('../models/User'); // To fetch user-specific API keys
const { decrypt } = require('../services/encryptionService'); // To decrypt the keys

const router = express.Router();

const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_CORE_SERVICE_URL;
if (!PYTHON_AI_SERVICE_URL) {
    console.error("FATAL ERROR: PYTHON_AI_CORE_SERVICE_URL is not set. AI features will not work.");
}

router.post('/rag', tempAuth, async (req, res) => {
    console.warn(">>> WARNING: /api/chat/rag is deprecated. RAG is now handled by /api/chat/message.");
    return res.status(410).json({ message: "This RAG endpoint is deprecated. Please use the main chat message endpoint." });
});

router.post('/message', tempAuth, async (req, res) => {
    const {
        message,
        history,
        sessionId,
        systemPrompt,
        isRagEnabled,
        llmProvider, // This tells us which model is being used
        llmModelName,
        enableMultiQuery
    } = req.body;
    
    const userId = req.user._id.toString();

    if (!message || typeof message !== 'string' || message.trim() === '') {
        return res.status(400).json({ message: 'Message text required.' });
    }
    if (!sessionId || typeof sessionId !== 'string') {
        return res.status(400).json({ message: 'Session ID required.' });
    }
    if (!Array.isArray(history)) {
        return res.status(400).json({ message: 'Invalid history format.'});
    }

    try {
        const user = await User.findById(userId).select('+geminiApiKey +grokApiKey');

        if (!user) {
            return res.status(404).json({ message: "User account not found." });
        }

        const decryptedGeminiKey = user.geminiApiKey ? decrypt(user.geminiApiKey) : null;
        const decryptedGrokKey = user.grokApiKey ? decrypt(user.grokApiKey) : null;
        
        // Normalize llmProvider to lowercase for consistent checks and for sending to Python
        const normalizedLlmProvider = (llmProvider || process.env.DEFAULT_LLM_PROVIDER_NODE || 'gemini').toLowerCase();
        
        // Validate Gemini key if Gemini is selected and user has no key
        if (normalizedLlmProvider.startsWith('gemini') && !decryptedGeminiKey) {
            console.error(`User ${userId} tried to use Gemini without a configured API key.`);
            return res.status(400).json({ message: "Chat Error: User Gemini API key is required but was not provided." });
        }

        // For Grok (and potentially other providers where Python has a server-wide .env fallback):
        // We will pass decryptedGrokKey (which might be null if user has no key).
        // Python's llm_handler will then attempt to use os.environ.get("GROQ_API_KEY") if the user-specific key is null.
        // If both are null, Python will raise the error, which is the correct behavior.
        // The previous stricter check for Grok key here in Node.js is removed to allow Python's .env fallback.
        if (normalizedLlmProvider.startsWith('grok') && !decryptedGrokKey) {
            console.log(`User ${userId} is using Grok without a user-specific API key. Python service will attempt to use its fallback .env key.`);
        }


        if (!PYTHON_AI_SERVICE_URL) {
            console.error("Python AI Core Service URL is not configured in Node.js environment.");
            throw new Error("AI Service communication error.");
        }

        const performRagRequest = !!isRagEnabled;
        const selectedLlmModel = llmModelName || null;
        const useMultiQuery = enableMultiQuery === undefined ? true : !!enableMultiQuery;

        console.log(`>>> POST /api/chat/message: User=${userId}, Session=${sessionId}, RAG=${performRagRequest}, Provider=${normalizedLlmProvider}`);

        const pythonPayload = {
            user_id: userId,
            query: message.trim(),
            chat_history: history,
            llm_provider: normalizedLlmProvider, // Send the normalized provider
            llm_model_name: selectedLlmModel,
            system_prompt: systemPrompt,
            perform_rag: performRagRequest,
            enable_multi_query: useMultiQuery,
            api_keys: {
                gemini: decryptedGeminiKey,
                grok: decryptedGrokKey // Will be null if user hasn't set one
            }
        };

        console.log(`   Calling Python AI Core Service at ${PYTHON_AI_SERVICE_URL}/generate_chat_response`);
        
        const pythonResponse = await axios.post(
            `${PYTHON_AI_SERVICE_URL}/generate_chat_response`,
            pythonPayload,
            { timeout: 120000 } // Increased timeout
        );

        if (!pythonResponse.data || pythonResponse.data.status !== 'success') {
            console.error("   Error or unexpected response from Python AI Core Service:", pythonResponse.data);
            throw new Error(pythonResponse.data?.error || pythonResponse.data?.message || "Failed to get valid response from AI service.");
        }

        const { 
            llm_response: aiReplyText, 
            references: retrievedReferences,
            thinking_content: thinkingContent
        } = pythonResponse.data;

        const modelResponseMessage = {
            role: 'model',
            parts: [{ text: aiReplyText || "[No response text from AI]" }],
            timestamp: new Date(),
            references: retrievedReferences || [],
            thinking: thinkingContent || null
        };
        
        console.log(`<<< POST /api/chat/message successful for session ${sessionId}.`);
        res.status(200).json({ reply: modelResponseMessage });

    } catch (error) {
        console.error(`!!! Error processing chat message for session ${sessionId}:`, error.response?.data || error.message || error);
        let statusCode = error.response?.status || 500;
        let clientMessage = "Failed to get response from AI service.";

        if (error.response?.data?.message) { // Prefer message from Python if available
            clientMessage = error.response.data.message;
        } else if (error.response?.data?.error) {
            clientMessage = error.response.data.error;
        } else if (error.message) {
            clientMessage = error.message;
        }
        
        res.status(statusCode).json({ message: clientMessage });
    }
});

// ... (rest of the file remains the same) ...

router.post('/continue', tempAuth, async (req, res) => {
    const { sessionId } = req.body;
    const userId = req.user._id.toString();

    if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required.' });
    }

    try {
        // Find the existing chat session
        const existingSession = await ChatHistory.findOne({ 
            sessionId: sessionId,
            userId: userId
        });

        if (!existingSession) {
            return res.status(404).json({ 
                message: 'Chat session not found or you do not have permission to access it.' 
            });
        }

        // Get the last few messages for context (e.g., last 10 messages)
        const lastMessages = existingSession.messages.slice(-10);

        // Return the session details and last messages
        res.status(200).json({
            sessionId: existingSession.sessionId,
            title: existingSession.title,
            lastMessages: lastMessages,
            modelProvider: existingSession.modelProvider,
            createdAt: existingSession.createdAt,
            updatedAt: existingSession.updatedAt
        });

    } catch (error) {
        console.error(`Error continuing chat session ${sessionId}:`, error);
        res.status(500).json({ 
            message: 'Failed to continue chat session.',
            error: error.message 
        });
    }
});

// Chat History Routes
router.post('/history', tempAuth, async (req, res) => {
    const { sessionId, messages } = req.body;
    const userId = req.user._id;
    if (!sessionId) return res.status(400).json({ message: 'Session ID required to save history.' });
    if (!Array.isArray(messages)) return res.status(400).json({ message: 'Invalid messages format.' });

    try {
        const validMessages = messages.map(m => ({
            role: m.role,
            parts: m.parts,
            timestamp: m.timestamp,
            references: m.role === 'model' ? (m.references || []) : undefined,
            thinking: m.role === 'model' ? (m.thinking || null) : undefined,
        })).filter(m =>
            m && typeof m.role === 'string' &&
            Array.isArray(m.parts) && m.parts.length > 0 &&
            typeof m.parts[0].text === 'string' &&
            m.timestamp
        );

        const newSessionId = uuidv4();

        if (validMessages.length === 0) {
            console.log(`Session ${sessionId}: No valid messages to save. Client likely clearing history.`);
            return res.status(200).json({
                message: 'No history saved (empty or invalid messages). New session ID provided.',
                savedSessionId: null,
                newSessionId: newSessionId
            });
        }

        const savedHistory = await ChatHistory.findOneAndUpdate(
            { sessionId: sessionId, userId: userId },
            { $set: { userId: userId, sessionId: sessionId, messages: validMessages, updatedAt: Date.now() } },
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        
        console.log(`History saved/updated for session ${savedHistory.sessionId}. New session ID for client: ${newSessionId}`);
        res.status(200).json({
            message: 'Chat history saved successfully.',
            savedSessionId: savedHistory.sessionId,
            newSessionId: newSessionId
        });
    } catch (error) {
        console.error(`Error saving chat history for session ${sessionId}:`, error);
        res.status(500).json({ message: 'Failed to save chat history.' });
    }
});

router.get('/sessions', tempAuth, async (req, res) => {
    const userId = req.user._id;
    try {
        const sessions = await ChatHistory.find({ userId: userId })
            .sort({ updatedAt: -1 })
            .select('sessionId createdAt updatedAt messages')
            .lean();

        const sessionSummaries = sessions.map(session => {
            const firstUserMessage = session.messages?.find(m => m.role === 'user');
            let preview = 'Chat Session';
            if (firstUserMessage?.parts?.[0]?.text) {
                preview = firstUserMessage.parts[0].text.substring(0, 75);
                if (firstUserMessage.parts[0].text.length > 75) preview += '...';
            }
            return {
                sessionId: session.sessionId,
                createdAt: session.createdAt,
                updatedAt: session.updatedAt,
                messageCount: session.messages?.length || 0,
                preview: preview
            };
        });
        res.status(200).json(sessionSummaries);
    } catch (error) {
        console.error(`Error fetching chat sessions for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat sessions.' });
    }
});

router.get('/session/:sessionId', tempAuth, async (req, res) => {
    const userId = req.user._id;
    const { sessionId } = req.params;
    if (!sessionId) return res.status(400).json({ message: 'Session ID parameter is required.' });
    try {
        const session = await ChatHistory.findOne({ sessionId: sessionId, userId: userId }).lean();
        if (!session) return res.status(404).json({ message: 'Chat session not found or access denied.' });
        res.status(200).json(session);
    } catch (error) {
        console.error(`Error fetching chat session ${sessionId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve chat session details.' });
    }
});


router.delete('/session/:sessionId', tempAuth, async (req, res) => {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required to delete.' });
    }

    try {
        console.log(`>>> DELETE /api/chat/session/${sessionId} requested by User ${userId}`);
        
        const result = await ChatHistory.findOneAndDelete({ 
            sessionId: sessionId, 
            userId: userId 
        });

        if (!result) {
            console.warn(`   Session not found or user mismatch for session ${sessionId} and user ${userId}.`);
            return res.status(404).json({ message: 'Session not found or you do not have permission to delete it.' });
        }

        console.log(`<<< Session ${sessionId} successfully deleted for user ${userId}.`);
        res.status(200).json({ message: 'Session deleted successfully.' });

    } catch (error) {
        console.error(`!!! Error deleting session ${sessionId} for user ${userId}:`, error);
        res.status(500).json({ message: 'Failed to delete session due to a server error.' });
    }
});

module.exports = router;