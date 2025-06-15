// FusedChatbot/server/routes/externalAiTools.js
const express = require('express');
const router = express.Router();
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const FormDataNode = require('form-data'); // For Node.js to create FormData

const PYTHON_SERVICE_URL = process.env.PYTHON_AI_CORE_SERVICE_URL;
if (!PYTHON_SERVICE_URL) {
    console.error("CRITICAL ERROR: PYTHON_AI_CORE_SERVICE_URL is not set in .env for externalAiTools.js. This module will not function.");
} else {
    console.log('[externalAiTools.js] Python Service URL configured to:', PYTHON_SERVICE_URL);
}

// --- Directory Configurations ---
// Base directory for assets, relative to server.js
const ASSETS_BASE_DIR = path.join(__dirname, '..', 'assets');
const USER_DOCS_SUBDIR = 'docs'; // Subdirectory for user-uploaded documents

// Helper to get a user's specific asset directory
const getUserAssetDirectory = (userId) => {
    return path.join(ASSETS_BASE_DIR, `user_${userId}`, USER_DOCS_SUBDIR);
};

// Ensure base asset directories exist on server startup
const ensureAssetDirectoriesExist = () => {
    if (!fs.existsSync(ASSETS_BASE_DIR)) {
        fs.mkdirSync(ASSETS_BASE_DIR, { recursive: true });
        console.log(`[externalAiTools.js] Created base assets directory: ${ASSETS_BASE_DIR}`);
    }
};
ensureAssetDirectoriesExist(); // Call this once on module load

// --- Multer Setup for File Uploads ---
// Note: This multer setup is for handling initial uploads to a temp dir.
// Files are then moved to a permanent user-specific location.
const UPLOAD_DIR_NODE_TEMP = path.join(__dirname, '..', 'uploads_node_temp');
if (!fs.existsSync(UPLOAD_DIR_NODE_TEMP)) {
    try {
        fs.mkdirSync(UPLOAD_DIR_NODE_TEMP, { recursive: true });
        console.log(`[externalAiTools.js] Created temp upload dir for Node: ${UPLOAD_DIR_NODE_TEMP}`);
    } catch (err) {
        console.error(`[externalAiTools.js] Error creating temp upload dir ${UPLOAD_DIR_NODE_TEMP}: ${err.message}`);
    }
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR_NODE_TEMP),
    filename: (req, file, cb) => {
        // Prepend with timestamp for uniqueness and sorting
        const timestamp = Date.now();
        const safeOriginalName = file.originalname.replace(/\s+/g, '_').replace(/[^\w.-]/g, ''); // Sanitize filename
        cb(null, `${timestamp}-${safeOriginalName}`);
    }
});
// Increase file size limit for video files and general documents
const upload = multer({ storage: storage, limits: { fileSize: 1024 * 1024 * 500 } }); // 500MB limit

// --- Helper: Forward to Python Service ---
async function forwardToPythonService(req, res, pythonEndpoint, payload, isFileUpload = false, httpMethod = 'POST', queryParams = null) {
    if (!PYTHON_SERVICE_URL) {
        const errorMsg = "Python service URL is not configured on the Node.js server.";
        console.error(`[forwardToPythonService - ${pythonEndpoint}] CRITICAL: ${errorMsg}`);
        return res.status(500).json({ message: errorMsg, error: "ConfigurationError" });
    }
    const targetUrl = `${PYTHON_SERVICE_URL}${pythonEndpoint}`;
    const logPrefix = `[Node Forwarder - ${pythonEndpoint}]`;
    const userId = req.headers['x-user-id'] || 'guest_user'; // Get user_id for logging/payload

    console.log(`${logPrefix} User='${userId}', Forwarding ${httpMethod} to: ${targetUrl}`);
    if (queryParams) console.log(`${logPrefix} Query Params:`, queryParams);

    // Set a very long timeout for potentially slow operations like video processing
    const requestTimeout = pythonEndpoint.includes('/video') || pythonEndpoint.includes('/add_document') ? 30 * 60 * 1000 : 5 * 60 * 1000; // 30 mins for video/RAG, 5 for others
    console.log(`${logPrefix} Request timeout set to ${requestTimeout / 1000} seconds.`);

    const axiosConfig = {
        method: httpMethod,
        url: targetUrl,
        headers: { 'x-user-id': userId },
        timeout: requestTimeout,
    };

    let finalPayload = payload;
    // If payload is an object and not FormData, ensure user_id is in it for Python tools
    if (payload && typeof payload === 'object' && !(payload instanceof FormDataNode) && !isFileUpload) {
        finalPayload = { ...payload, user_id: userId }; // Add/overwrite user_id
    } else if (isFileUpload && payload instanceof FormDataNode) {
        // For FormData, Python's request.form.get('user_id') will be used if Node adds it
        payload.append('user_id', userId); // Add user_id to FormData
        finalPayload = payload;
    }


    if (isFileUpload && finalPayload instanceof FormDataNode) {
        axiosConfig.data = finalPayload;
        axiosConfig.headers = { ...axiosConfig.headers, ...finalPayload.getHeaders() };
        console.log(`${logPrefix} Payload: FormData (file upload), UserID='${userId}' included in form.`);
    } else if (typeof finalPayload === 'string' && req.get('Content-Type') && req.get('Content-Type').startsWith('text/')) {
        axiosConfig.data = finalPayload;
        axiosConfig.headers['Content-Type'] = req.get('Content-Type');
        console.log(`${logPrefix} Payload: Raw text (first 100 chars): ${finalPayload.substring(0, 100)}...`);
    } else if (finalPayload) {
        axiosConfig.data = finalPayload;
        axiosConfig.headers['Content-Type'] = 'application/json';
        console.log(`${logPrefix} Payload: JSON (first 100 chars): ${JSON.stringify(finalPayload).substring(0,100)}...`);
    }

    if (queryParams) {
        axiosConfig.params = queryParams;
    }
    
    try {
        const pythonResponse = await axios(axiosConfig);
        console.log(`${logPrefix} Python service responded with status: ${pythonResponse.status}`);
        res.status(pythonResponse.status).json(pythonResponse.data);
    } catch (error) {
        const errorStatus = error.response ? error.response.status : 502;
        const errorData = error.response ? error.response.data : { error: error.message, details: "No response from Python or network issue." };
        const pythonErrorMessage = errorData?.error || errorData?.message || (typeof errorData === 'string' ? errorData : "Unknown Python error");
        console.error(`${logPrefix} Error forwarding to Python (${targetUrl}): [${errorStatus}]`, pythonErrorMessage);
        if (error.code) console.error(`${logPrefix} Axios error code: ${error.code}`);
        if (error.code === 'ECONNABORTED') {
            console.error(`${logPrefix} Request timed out.`);
        }
        res.status(errorStatus).json({
            message: `Request to Python service endpoint '${pythonEndpoint}' failed.`,
            python_error: pythonErrorMessage,
            details: error.code ? `Node.js Request Error Code: ${error.code}` : (errorData.details || undefined)
        });
    }
}

// --- File Management Routes (for RAG) ---

/**
 * Handles file uploads from the client.
 * Moves the file from a temporary location to a user-specific permanent asset directory.
 * Triggers processing of the file by the Python AI Core Service for RAG indexing.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
    const logPrefix = '[Node /api/upload]';
    const userId = req.headers['x-user-id'];
    if (!userId) {
        console.warn(`${logPrefix} No user ID found in headers.`);
        return res.status(401).json({ message: 'Authentication required: User ID missing.' });
    }

    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const originalName = req.file.originalname;
    const serverFilename = req.file.filename; // This already has the timestamp prefix
    const tempFilePath = req.file.path;
    const userDocsPath = getUserAssetDirectory(userId);
    const destinationPath = path.join(userDocsPath, serverFilename);

    console.log(`${logPrefix} User='${userId}', Original: '${originalName}', Server: '${serverFilename}', Temp path: '${tempFilePath}'`);

    // Ensure the user's specific directory exists
    if (!fs.existsSync(userDocsPath)) {
        fs.mkdirSync(userDocsPath, { recursive: true });
        console.log(`${logPrefix} Created user document directory: ${userDocsPath}`);
    }

    try {
        // Move file from temp to permanent user-specific directory
        fs.renameSync(tempFilePath, destinationPath);
        console.log(`${logPrefix} Moved '${serverFilename}' to '${destinationPath}'`);

        const fileSize = fs.statSync(destinationPath).size;
        const fileType = req.file.mimetype;

        // Trigger Python AI Core service to add document for RAG
        // We send serverFilename and originalName to Python
        const pythonPayload = {
            filepath: destinationPath,
            filename_in_storage: serverFilename, // The unique name in storage
            original_filename: originalName,     // The user-facing original name
            user_id: userId
        };

        const pythonResponse = await axios.post(`${PYTHON_SERVICE_URL}/add_document`, pythonPayload, {
            headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
            timeout: 30 * 60 * 1000 // Extended timeout for RAG processing
        });
        
        console.log(`${logPrefix} Python AI Core service response for ${originalName}:`, pythonResponse.data);

        res.status(200).json({
            message: `File '${originalName}' uploaded and processing initiated.`,
            file: {
                originalName: originalName,
                serverFilename: serverFilename,
                size: fileSize,
                type: fileType,
                // Additional data from Python service if useful for client
                ragProcessingStatus: pythonResponse.data.status,
                ragProcessingDetails: pythonResponse.data
            },
            status: 'success'
        });

    } catch (error) {
        console.error(`${logPrefix} Error during file upload or RAG processing for '${originalName}':`, error.message);
        const errorMsg = error.response?.data?.message || error.message || 'File upload failed.';
        res.status(500).json({
            message: `Failed to upload or process file '${originalName}'.`,
            error: errorMsg
        });
    } finally {
        // Ensure temp file is deleted even if processing fails
        if (fs.existsSync(tempFilePath)) {
            fs.unlink(tempFilePath, err => {
                if (err) console.error(`${logPrefix} Error deleting temp file ${tempFilePath}:`, err.message);
                else console.log(`${logPrefix} Deleted temp file: ${tempFilePath}`);
            });
        }
    }
});


/**
 * Retrieves a list of files uploaded by the current user.
 * Each file object includes originalName, serverFilename, size, and type.
 */
router.get('/files', async (req, res) => {
    const logPrefix = '[Node /api/files (GET)]';
    const userId = req.headers['x-user-id'];
    if (!userId) {
        return res.status(401).json({ message: 'Authentication required: User ID missing.' });
    }

    const userDocsPath = getUserAssetDirectory(userId);
    console.log(`${logPrefix} Fetching files for User='${userId}' from: ${userDocsPath}`);

    if (!fs.existsSync(userDocsPath)) {
        console.log(`${logPrefix} User document directory does not exist. Returning empty list.`);
        return res.status(200).json([]);
    }

    try {
        const filesInDir = fs.readdirSync(userDocsPath);
        const userFiles = filesInDir.map(filename => {
            const filePath = path.join(userDocsPath, filename);
            const stats = fs.statSync(filePath);
            const originalNameMatch = filename.match(/^\d+-(.*)$/); // Extract original name
            const originalName = originalNameMatch ? originalNameMatch[1].replace(/_/g, ' ') : filename; // Remove underscores for display

            return {
                originalName: originalName,
                serverFilename: filename,
                size: stats.size,
                type: path.extname(filename).toLowerCase(), // E.g., '.pdf', '.txt'
                uploadedAt: stats.birthtime.toISOString() // Or mtime, depending on preference
            };
        }).filter(file => file.type !== '.pyc' && file.type !== '.json' && file.type !== '.bin'); // Filter out system/index files

        // Sort by upload date (timestamp prefix)
        userFiles.sort((a, b) => parseInt(b.serverFilename.split('-')[0]) - parseInt(a.serverFilename.split('-')[0]));

        console.log(`${logPrefix} Successfully retrieved ${userFiles.length} files for User='${userId}'.`);
        res.status(200).json(userFiles);
    } catch (error) {
        console.error(`${logPrefix} Error listing files for User='${userId}':`, error.message);
        res.status(500).json({ message: 'Failed to retrieve user files.', error: error.message });
    }
});


/**
 * Serves a specific uploaded file to the client for download or display.
 */
router.get('/files/:serverFilename', (req, res) => {
    const logPrefix = '[Node /api/files/:serverFilename (GET)]';
    const userId = req.headers['x-user-id'];
    const serverFilename = req.params.serverFilename;

    if (!userId) {
        return res.status(401).json({ message: 'Authentication required: User ID missing.' });
    }

    if (!serverFilename) {
        return res.status(400).json({ message: 'Server filename is required.' });
    }

    const userDocsPath = getUserAssetDirectory(userId);
    const filePath = path.join(userDocsPath, serverFilename);

    console.log(`${logPrefix} User='${userId}', Attempting to retrieve file: ${filePath}`);

    // Security check: Prevent path traversal
    if (!filePath.startsWith(userDocsPath)) {
        console.warn(`${logPrefix} Path traversal attempt detected for file: ${serverFilename}`);
        return res.status(403).json({ message: 'Forbidden: Invalid file path.' });
    }

    if (!fs.existsSync(filePath)) {
        console.warn(`${logPrefix} File not found: ${filePath}`);
        return res.status(404).json({ message: 'File not found.' });
    }

    // Determine the original name for the download header
    const originalNameMatch = serverFilename.match(/^\d+-(.*)$/);
    const originalName = originalNameMatch ? originalNameMatch[1].replace(/_/g, ' ') : serverFilename;

    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.sendFile(filePath, (err) => {
        if (err) {
            console.error(`${logPrefix} Error sending file ${filePath}:`, err.message);
            // Check if headers have already been sent before attempting to send a new response
            if (!res.headersSent) {
                res.status(500).json({ message: 'Failed to download file.', error: err.message });
            }
        } else {
            console.log(`${logPrefix} Successfully sent file: ${serverFilename}`);
        }
    });
});

/**
 * Handles deletion of a user's uploaded file.
 * Removes the file from the asset directory and requests Python service to remove from RAG index.
 */
router.delete('/files/:serverFilename', async (req, res) => {
    const logPrefix = '[Node /api/files (DELETE)]';
    const userId = req.headers['x-user-id'];
    const serverFilename = req.params.serverFilename;

    if (!userId) {
        return res.status(401).json({ message: 'Authentication required: User ID missing.' });
    }
    if (!serverFilename) {
        return res.status(400).json({ message: 'Server filename is required for deletion.' });
    }

    const userDocsPath = getUserAssetDirectory(userId);
    const filePath = path.join(userDocsPath, serverFilename);

    console.log(`${logPrefix} User='${userId}', Attempting to delete file: ${filePath}`);

    // Security check: Prevent path traversal
    if (!filePath.startsWith(userDocsPath)) {
        console.warn(`${logPrefix} Path traversal attempt detected for deletion of: ${serverFilename}`);
        return res.status(403).json({ message: 'Forbidden: Invalid file path.' });
    }

    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`${logPrefix} Successfully deleted file from disk: ${filePath}`);

            // Request Python AI Core service to remove document from RAG index
            const pythonResponse = await axios.post(`${PYTHON_SERVICE_URL}/remove_document`, {
                filename_in_storage: serverFilename,
                user_id: userId
            }, {
                headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
                timeout: 60 * 1000 // 1 minute timeout
            });

            console.log(`${logPrefix} Python AI Core service response for deletion:`, pythonResponse.data);
            res.status(200).json({
                message: `File '${serverFilename}' deleted and removed from RAG index.`,
                status: 'success'
            });
        } else {
            console.warn(`${logPrefix} File not found for deletion: ${filePath}`);
            res.status(404).json({ message: 'File not found.' });
        }
    } catch (error) {
        console.error(`${logPrefix} Error deleting file or from RAG index '${serverFilename}':`, error.message);
        const errorMsg = error.response?.data?.message || error.message || 'File deletion failed.';
        res.status(500).json({
            message: `Failed to delete file '${serverFilename}'.`,
            error: errorMsg
        });
    }
});

/**
 * Handles renaming of a user's uploaded file.
 * Renames the file on disk and requests Python service to update the document's original name in its index.
 */
router.patch('/files/:serverFilename', async (req, res) => {
    const logPrefix = '[Node /api/files (PATCH)]';
    const userId = req.headers['x-user-id'];
    const serverFilename = req.params.serverFilename;
    const { newOriginalName } = req.body;

    if (!userId) {
        return res.status(401).json({ message: 'Authentication required: User ID missing.' });
    }
    if (!serverFilename || !newOriginalName) {
        return res.status(400).json({ message: 'Server filename and newOriginalName are required for rename.' });
    }

    const userDocsPath = getUserAssetDirectory(userId);
    const oldFilePath = path.join(userDocsPath, serverFilename);

    console.log(`${logPrefix} User='${userId}', Attempting to rename file: '${serverFilename}' to new original name '${newOriginalName}'`);

    // Security check: Prevent path traversal
    if (!oldFilePath.startsWith(userDocsPath)) {
        console.warn(`${logPrefix} Path traversal attempt detected for rename of: ${serverFilename}`);
        return res.status(403).json({ message: 'Forbidden: Invalid file path.' });
    }

    try {
        if (!fs.existsSync(oldFilePath)) {
            console.warn(`${logPrefix} File not found for rename: ${oldFilePath}`);
            return res.status(404).json({ message: 'File not found.' });
        }

        // The actual file on disk has the timestamp-prefixed name.
        // We only conceptually change the 'originalName' associated with it.
        // So, no actual file rename operation on disk is needed here.
        // We just inform the Python service to update its record.

        // Request Python AI Core service to update document's original name in RAG index
        const pythonResponse = await axios.post(`${PYTHON_SERVICE_URL}/update_document_name`, {
            filename_in_storage: serverFilename,
            new_original_filename: newOriginalName,
            user_id: userId
        }, {
            headers: { 'Content-Type': 'application/json', 'x-user-id': userId },
            timeout: 60 * 1000 // 1 minute timeout
        });

        console.log(`${logPrefix} Python AI Core service response for rename:`, pythonResponse.data);
        res.status(200).json({
            message: `File '${serverFilename}' original name updated to '${newOriginalName}'.`,
            status: 'success'
        });

    } catch (error) {
        console.error(`${logPrefix} Error renaming file '${serverFilename}' to '${newOriginalName}':`, error.message);
        const errorMsg = error.response?.data?.message || error.message || 'File rename failed.';
        res.status(500).json({
            message: `Failed to rename file '${serverFilename}'.`,
            error: errorMsg
        });
    }
});


// Academic Search Routes
router.post('/search/combined', (req, res) => {
    forwardToPythonService(req, res, '/tools/search/combined', req.body);
});

router.post('/search/core', (req, res) => {
    forwardToPythonService(req, res, '/tools/search/core', req.body);
});

// Content Creation Routes
router.post('/create/ppt', express.text({ type: ['text/markdown', 'text/plain', 'application/text'], limit: '10mb' }), (req, res) => {
    const filename = req.query.filename || 'Presentation.pptx';
    const userId = req.headers['x-user-id'] || 'guest_user';
    forwardToPythonService(req, res, '/tools/create/ppt', req.body, false, 'POST', { filename, user_id: userId });
});

router.post('/create/doc', (req, res) => {
    const payload = req.body;
    if (!payload.markdown_content || !payload.content_key) {
        return res.status(400).json({ error: "markdown_content and content_key are required for DOCX generation." });
    }
    forwardToPythonService(req, res, '/tools/create/doc', payload);
});

// PDF Processing (OCR) Routes
router.post('/ocr/tesseract', upload.single('pdf_file'), async (req, res) => {
    const logPrefix = '[Node /ocr/tesseract]';
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
    console.log(`${logPrefix} File: ${req.file.originalname}, Temp path: ${req.file.path}`);
    const formData = new FormDataNode();
    formData.append('pdf_file', fs.createReadStream(req.file.path), req.file.originalname);
    try {
        await forwardToPythonService(req, res, '/tools/ocr/tesseract', formData, true);
    } finally {
        fs.unlink(req.file.path, err => {
            if (err) console.error(`${logPrefix} Error deleting temp file:`, err.message);
            else console.log(`${logPrefix} Deleted temp file: ${req.file.path}`);
        });
    }
});

router.post('/ocr/nougat', upload.single('pdf_file'), async (req, res) => {
    const logPrefix = '[Node /ocr/nougat]';
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
    console.log(`${logPrefix} File: ${req.file.originalname}, Temp path: ${req.file.path}`);
    const formData = new FormDataNode();
    formData.append('pdf_file', fs.createReadStream(req.file.path), req.file.originalname);
    try {
        await forwardToPythonService(req, res, '/tools/ocr/nougat', formData, true);
    } finally {
        fs.unlink(req.file.path, err => {
            if (err) console.error(`${logPrefix} Error deleting temp file:`, err.message);
            else console.log(`${logPrefix} Deleted temp file: ${req.file.path}`);
        });
    }
});

// Video Processing Route
router.post('/process/video', upload.single('video_file'), async (req, res) => {
    const logPrefix = '[Node /process/video]';
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });
    
    console.log(`${logPrefix} File: ${req.file.originalname}, Temp path: ${req.file.path}`);
    const formData = new FormDataNode();
    formData.append('video_file', fs.createReadStream(req.file.path), req.file.originalname);
    
    // Append other form fields from the request, e.g., ollama_model
    if (req.body.ollama_model) {
        formData.append('ollama_model', req.body.ollama_model);
    }
    
    try {
        await forwardToPythonService(req, res, '/tools/process/video', formData, true);
    } finally {
        fs.unlink(req.file.path, err => {
            if (err) console.error(`${logPrefix} Error deleting temp video file:`, err.message);
            else console.log(`${logPrefix} Deleted temp video file: ${req.file.path}`);
        });
    }
});

// Web Resources Download Routes
router.post('/download/youtube', (req, res) => {
    const payload = req.body;
    if (!payload.url) return res.status(400).json({ error: "YouTube URL is required." });
    forwardToPythonService(req, res, '/tools/download/youtube', payload);
});

router.post('/download/web_pdfs', (req, res) => {
    const payload = req.body;
    if (!payload.query) return res.status(400).json({ error: "Query is required for web PDF download." });
    forwardToPythonService(req, res, '/tools/download/web_pdfs', payload);
});

// Export the router
module.exports = router;
