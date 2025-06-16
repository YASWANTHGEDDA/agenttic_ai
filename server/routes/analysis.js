// FusedChatbot/server/routes/analysis.js
const express = require('express');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { tempAuth } = require('../middleware/authMiddleware');
const User = require('../models/User'); // --- ADD THIS LINE ---
const { decrypt } = require('../services/encryptionService'); // --- ADD THIS LINE ---

const router = express.Router();

const PYTHON_AI_SERVICE_URL = process.env.PYTHON_AI_CORE_SERVICE_URL;

const sanitizeForPath = (name) => name.replace(/[^a-zA-Z0-9_-]/g, '_');

const determineFileTypeSubfolder = (originalFilename) => {
    const ext = path.extname(originalFilename).toLowerCase();
    if (['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.txt'].includes(ext)) return 'docs';
    if (['.py', '.js', '.md', '.html', '.xml', '.json', '.csv', '.log'].includes(ext)) return 'code';
    if (['.jpg', '.jpeg', '.png', '.bmp', '.gif'].includes(ext)) return 'images';
    return 'others';
};

router.post('/document', tempAuth, async (req, res) => {
    // --- MODIFIED SECTION START ---
    const {
        documentName,
        serverFilename,
        analysisType,
        llmProvider,
        llmModelName
    } = req.body;

    const userId = req.user._id.toString();
    const sanitizedUsername = sanitizeForPath(req.user.username);

    if (!documentName || !serverFilename || !analysisType) {
        return res.status(400).json({ message: 'Missing required fields: documentName, serverFilename, or analysisType.' });
    }
    if (!['faq', 'topics', 'mindmap'].includes(analysisType)) {
        return res.status(400).json({ message: 'Invalid analysisType specified.' });
    }
    if (!PYTHON_AI_SERVICE_URL) {
        console.error("PYTHON_AI_CORE_SERVICE_URL is not configured.");
        return res.status(500).json({ message: "AI Service communication error." });
    }

    // --- NEW LOGIC: Fetch user with API keys and decrypt them ---
    let decryptedGeminiKey = null;
    let decryptedGrokKey = null;

    try {
        // Find the user and explicitly select the API key fields
        const user = await User.findById(userId).select('+geminiApiKey +grokApiKey');
        if (!user) {
            logger.error(`Analysis request failed: User with ID ${userId} not found.`);
            return res.status(404).json({ message: 'User not found.' });
        }

        // Decrypt keys if they exist
        if (user.geminiApiKey) {
            decryptedGeminiKey = decrypt(user.geminiApiKey);
        }
        if (user.grokApiKey) {
            decryptedGrokKey = decrypt(user.grokApiKey);
        }

    } catch (dbError) {
        logger.error(`Error fetching or decrypting keys for user ${userId}:`, dbError);
        return res.status(500).json({ message: 'Could not retrieve user API keys.' });
    }
    // --- END OF NEW LOGIC ---

    const fileTypeSubfolder = determineFileTypeSubfolder(documentName);
    const absoluteFilePath = path.resolve(
        __dirname,
        '..',
        'assets',
        sanitizedUsername,
        fileTypeSubfolder,
        serverFilename
    );
    
    logger.info(`Analysis request for User: ${userId}, Doc: ${documentName} (Server: ${serverFilename}), Type: ${analysisType}`);
    logger.debug(`Constructed file path for analysis: ${absoluteFilePath}`);

    if (!fs.existsSync(absoluteFilePath)) {
        logger.error(`File not found for analysis at path: ${absoluteFilePath}`);
        return res.status(404).json({ message: `Document '${documentName}' (server file: ${serverFilename}) not found on server.` });
    }

    // --- MODIFIED PAYLOAD ---
    const pythonPayload = {
        user_id: userId,
        document_name: documentName,
        analysis_type: analysisType,
        file_path_for_analysis: absoluteFilePath,
        llm_provider: llmProvider,
        llm_model_name: llmModelName,
        // Add the decrypted API keys to the payload
        api_keys: {
            gemini: decryptedGeminiKey,
            grok: decryptedGrokKey
        }
    };
    // --- END OF MODIFIED PAYLOAD ---

    try {
        console.log(`Node.js: Calling Python /analyze_document for ${documentName}.`);

        const pythonResponse = await axios.post(
            `${PYTHON_AI_SERVICE_URL}/analyze_document`,
            pythonPayload,
            { timeout: 180000 }
        );

        if (!pythonResponse.data || pythonResponse.data.status !== 'success') {
            logger.error("Error or unexpected response from Python /analyze_document:", pythonResponse.data);
            return res.status(500).json({
                message: pythonResponse.data?.error || "Failed to get valid analysis from AI service."
            });
        }

        logger.info(`Node.js: Successfully received analysis for ${documentName} from Python service.`);
        res.status(200).json({
            documentName: pythonResponse.data.document_name,
            analysisType: pythonResponse.data.analysis_type,
            analysisResult: pythonResponse.data.analysis_result,
            thinkingContent: pythonResponse.data.thinking_content,
            status: 'success'
        });

    } catch (error) {
        logger.error(`!!! Node.js: Error calling Python /analyze_document for ${documentName}:`, error.response?.data || error.message || error);
        let statusCode = error.response?.status || 500;
        let clientMessage = "Failed to perform document analysis.";

        if (error.response?.data?.error) {
            clientMessage = error.response.data.error;
        } else if (error.message) {
            clientMessage = error.message;
        }

        if (statusCode === 500 && clientMessage.toLowerCase().includes("python")) {
            clientMessage = "An internal error occurred while communicating with the AI analysis service.";
        }
        res.status(statusCode).json({ message: clientMessage });
    }
});

const logger = {
    info: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.log
};

module.exports = router;