// // FusedChatbot/server/routes/externalAiTools.js
// const express = require('express');
// const router = express.Router();
// const axios = require('axios');
// const multer = require('multer');
// const fs = require('fs');
// const path = require('path');
// const FormDataNode = require('form-data'); // For Node.js to create FormData

// const PYTHON_SERVICE_URL = process.env.PYTHON_AI_CORE_SERVICE_URL;
// if (!PYTHON_SERVICE_URL) {
//     console.error("CRITICAL ERROR: PYTHON_AI_CORE_SERVICE_URL is not set in .env for externalAiTools.js. This module will not function.");
// } else {
//     console.log('[externalAiTools.js] Python Service URL configured to:', PYTHON_SERVICE_URL);
// }

// // --- Directory Configurations ---
// // Base directory for assets, relative to server.js
// const ASSETS_BASE_DIR = path.join(__dirname, '..', 'assets');
// const USER_DOCS_SUBDIR = 'docs'; // Subdirectory for user-uploaded documents

// // Helper to get a user's specific asset directory
// const getUserAssetDirectory = (userId) => {
//     return path.join(ASSETS_BASE_DIR, `user_${userId}`, USER_DOCS_SUBDIR);
// };

// // Ensure base asset directories exist on server startup
// const ensureAssetDirectoriesExist = () => {
//     if (!fs.existsSync(ASSETS_BASE_DIR)) {
//         fs.mkdirSync(ASSETS_BASE_DIR, { recursive: true });
//         console.log(`[externalAiTools.js] Created base assets directory: ${ASSETS_BASE_DIR}`);
//     }
// };
// ensureAssetDirectoriesExist(); // Call this once on module load

// // --- Multer Setup for File Uploads ---
// // Note: This multer setup is for handling initial uploads to a temp dir.
// // Files are then moved to a permanent user-specific location.
// const UPLOAD_DIR_NODE_TEMP = path.join(__dirname, '..', 'uploads_node_temp');
// if (!fs.existsSync(UPLOAD_DIR_NODE_TEMP)) {
//     try {
//         fs.mkdirSync(UPLOAD_DIR_NODE_TEMP, { recursive: true });
//         console.log(`[externalAiTools.js] Created temp upload dir for Node: ${UPLOAD_DIR_NODE_TEMP}`);
//     } catch (err) {
//         console.error(`[externalAiTools.js] Error creating temp upload dir ${UPLOAD_DIR_NODE_TEMP}: ${err.message}`);
//     }
// }
// const storage = multer.diskStorage({
//     destination: (req, file, cb) => cb(null, UPLOAD_DIR_NODE_TEMP),
//     filename: (req, file, cb) => {
//         // Prepend with timestamp for uniqueness and sorting
//         const timestamp = Date.now();
//         const safeOriginalName = file.originalname.replace(/\s+/g, '_').replace(/[^\w.-]/g, ''); // Sanitize filename
//         cb(null, `${timestamp}-${safeOriginalName}`);
//     }
// });
// // Increase file size limit for video files and general documents
// const upload = multer({ storage: storage, limits: { fileSize: 1024 * 1024 * 500 } }); // 500MB limit

// // --- Helper: Forward to Python Service ---
// async function forwardToPythonService(req, res, pythonEndpoint, payload, isFileUpload = false, httpMethod = 'POST', queryParams = null) {
//     if (!PYTHON_SERVICE_URL) {
//         const errorMsg = "Python service URL is not configured on the Node.js server.";
//         console.error(`[forwardToPythonService - ${pythonEndpoint}] CRITICAL: ${errorMsg}`);
//         return res.status(500).json({ message: errorMsg, error: "ConfigurationError" });
//     }
//     const targetUrl = `${PYTHON_SERVICE_URL}${pythonEndpoint}`;
//     const logPrefix = `[Node Forwarder - ${pythonEndpoint}]`;
//     const userId = req.headers['x-user-id'] || 'guest_user'; // Get user_id for logging/payload

//     console.log(`${logPrefix} User='${userId}', Forwarding ${httpMethod} to: ${targetUrl}`);
//     if (queryParams) console.log(`${logPrefix} Query Params:`, queryParams);

//     // Set a very long timeout for potentially slow operations like video processing
//     const requestTimeout = pythonEndpoint.includes('/video') || pythonEndpoint.includes('/add_document') ? 30 * 60 * 1000 : 5 * 60 * 1000; // 30 mins for video/RAG, 5 for others
//     console.log(`${logPrefix} Request timeout set to ${requestTimeout / 1000} seconds.`);

//     const axiosConfig = {
//         method: httpMethod,
//         url: targetUrl,
//         headers: { 'x-user-id': userId },
//         timeout: requestTimeout,
//     };

//     let finalPayload = payload;
//     // If payload is an object and not FormData, ensure user_id is in it for Python tools
//     if (payload && typeof payload === 'object' && !(payload instanceof FormDataNode) && !isFileUpload) {
//         finalPayload = { ...payload, user_id: userId }; // Add/overwrite user_id
//     } else if (isFileUpload && payload instanceof FormDataNode) {
//         // For FormData, Python's request.form.get('user_id') will be used if Node adds it
//         payload.append('user_id', userId); // Add user_id to FormData
//         finalPayload = payload;
//     }


//     if (isFileUpload && finalPayload instanceof FormDataNode) {
//         axiosConfig.data = finalPayload;
//         axiosConfig.headers = { ...axiosConfig.headers, ...finalPayload.getHeaders() };
//         console.log(`${logPrefix} Payload: FormData (file upload), UserID='${userId}' included in form.`);
//     } else if (typeof finalPayload === 'string' && req.get('Content-Type') && req.get('Content-Type').startsWith('text/')) {
//         axiosConfig.data = finalPayload;
//         axiosConfig.headers['Content-Type'] = req.get('Content-Type');
//         console.log(`${logPrefix} Payload: Raw text (first 100 chars): ${finalPayload.substring(0, 100)}...`);
//     } else if (finalPayload) {
//         axiosConfig.data = finalPayload;
//         axiosConfig.headers['Content-Type'] = 'application/json';
//         console.log(`${logPrefix} Payload: JSON (first 100 chars): ${JSON.stringify(finalPayload).substring(0,100)}...`);
//     }

//     if (queryParams) {
//         axiosConfig.params = queryParams;
//     }
    
//     try {
//         const pythonResponse = await axios(axiosConfig);
//         console.log(`${logPrefix} Python service responded with status: ${pythonResponse.status}`);
//         // If Python returns a file download, stream it. Otherwise, send JSON.
//         if (pythonResponse.headers['content-disposition']) {
//             res.setHeader('Content-Type', pythonResponse.headers['content-type']);
//             res.setHeader('Content-Disposition', pythonResponse.headers['content-disposition']);
//             pythonResponse.data.pipe(res);
//         } else {
//             res.status(pythonResponse.status).json(pythonResponse.data);
//         }
//     } catch (error) {
//         const errorStatus = error.response ? error.response.status : 502;
//         const errorData = error.response ? error.response.data : { error: error.message, details: "No response from Python or network issue." };
//         const pythonErrorMessage = errorData?.error || errorData?.message || (typeof errorData === 'string' ? errorData : "Unknown Python error");
//         console.error(`${logPrefix} Error forwarding to Python (${targetUrl}): [${errorStatus}]`, pythonErrorMessage);
//         if (error.code) console.error(`${logPrefix} Axios error code: ${error.code}`);
//         if (error.code === 'ECONNABORTED') {
//             console.error(`${logPrefix} Request timed out.`);
//         }
//         res.status(errorStatus).json({
//             message: `Request to Python service endpoint '${pythonEndpoint}' failed.`,
//             python_error: pythonErrorMessage,
//             details: error.code ? `Node.js Request Error Code: ${error.code}` : (errorData.details || undefined)
//         });
//     }
// }

// // --- File Management Routes (for RAG) ---

// router.post('/upload', upload.single('file'), async (req, res) => {
//     const logPrefix = '[Node /api/external-ai-tools/upload]';
//     if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    
//     const userId = req.headers['x-user-id'];
//     if (!userId) return res.status(401).json({ message: 'Authentication required: User ID missing.' });

//     const { originalname: originalName, filename: serverFilename, path: tempFilePath } = req.file;
//     const userDocsPath = getUserAssetDirectory(userId);
//     const destinationPath = path.join(userDocsPath, serverFilename);

//     console.log(`${logPrefix} User='${userId}', Original: '${originalName}', Temp: '${tempFilePath}'`);

//     try {
//         if (!fs.existsSync(userDocsPath)) {
//             fs.mkdirSync(userDocsPath, { recursive: true });
//         }
//         fs.renameSync(tempFilePath, destinationPath);
//         console.log(`${logPrefix} Moved file to: '${destinationPath}'`);

//         const normalizedPathForPython = destinationPath.replace(/\\/g, '/');
//         const pythonPayload = {
//             filepath: normalizedPathForPython,
//             filename_in_storage: serverFilename,
//             original_filename: originalName,
//             user_id: userId
//         };

//         console.log(`${logPrefix} Sending payload to Python:`, JSON.stringify(pythonPayload, null, 2));

//         const pythonResponse = await axios.post(`${PYTHON_SERVICE_URL}/add_document`, pythonPayload, {
//             headers: { 'Content-Type': 'application/json' },
//             timeout: 5 * 60 * 1000 // 5 minute timeout for processing
//         });
        
//         console.log(`${logPrefix} Python responded successfully:`, pythonResponse.data);
//         res.status(200).json({
//             message: pythonResponse.data.message,
//             file: {
//                 originalName: originalName,
//                 serverFilename: serverFilename,
//                 size: req.file.size,
//                 type: req.file.mimetype,
//                 ragProcessingDetails: pythonResponse.data
//             },
//             status: 'success'
//         });

//     } catch (error) {
//         console.error(`${logPrefix} CRITICAL ERROR for '${originalName}':`, error.message);
//         if (error.response) {
//             console.error(`--> Python Response Status: ${error.response.status}`);
//             console.error(`--> Python Response Data:`, error.response.data);
//         }
//         const errorMsg = error.response?.data?.error || 'Failed to communicate with Python service.';
//         res.status(500).json({ message: `Failed to process file '${originalName}'.`, error: errorMsg });
//     } finally {
//         if (fs.existsSync(tempFilePath)) {
//             fs.unlink(tempFilePath, err => {
//                 if (err) console.error(`${logPrefix} Error deleting temp file ${tempFilePath}:`, err.message);
//             });
//         }
//     }
// });
// router.get('/files', async (req, res) => {
//     const logPrefix = '[Node /api/external-ai-tools/files (GET)]';
//     const userId = req.headers['x-user-id'];
//     if (!userId) return res.status(401).json({ message: 'Authentication required: User ID missing.' });

//     const userDocsPath = getUserAssetDirectory(userId);
//     console.log(`${logPrefix} Fetching for User='${userId}' from: ${userDocsPath}`);

//     if (!fs.existsSync(userDocsPath)) return res.status(200).json([]);

//     try {
//         const filesInDir = fs.readdirSync(userDocsPath);
//         const userFiles = filesInDir
//             .map(filename => {
//                 const filePath = path.join(userDocsPath, filename);
//                 const stats = fs.statSync(filePath);
//                 const originalNameMatch = filename.match(/^\d+-(.*)$/);
//                 const originalName = originalNameMatch ? originalNameMatch[1].replace(/_/g, ' ') : filename;
//                 return { originalName, serverFilename: filename, size: stats.size, type: path.extname(filename).toLowerCase(), uploadedAt: stats.birthtime.toISOString() };
//             })
//             .filter(file => !['.pyc', '.json', '.bin'].includes(file.type));

//         userFiles.sort((a, b) => parseInt(b.serverFilename.split('-')[0]) - parseInt(a.serverFilename.split('-')[0]));
//         res.status(200).json(userFiles);
//     } catch (error) {
//         console.error(`${logPrefix} Error for User='${userId}':`, error.message);
//         res.status(500).json({ message: 'Failed to retrieve user files.', error: error.message });
//     }
// });

// router.get('/files/:serverFilename', (req, res) => {
//     const logPrefix = '[Node /api/external-ai-tools/files/:filename (GET)]';
//     const userId = req.headers['x-user-id'];
//     const { serverFilename } = req.params;

//     if (!userId) return res.status(401).json({ message: 'Authentication required.' });
//     if (!serverFilename) return res.status(400).json({ message: 'Filename is required.' });

//     const userDocsPath = getUserAssetDirectory(userId);
//     const filePath = path.join(userDocsPath, serverFilename);

//     if (!filePath.startsWith(userDocsPath)) return res.status(403).json({ message: 'Forbidden.' });
//     if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found.' });

//     const originalNameMatch = serverFilename.match(/^\d+-(.*)$/);
//     const originalName = originalNameMatch ? originalNameMatch[1].replace(/_/g, ' ') : serverFilename;

//     res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
//     res.sendFile(filePath);
// });

// router.delete('/files/:serverFilename', async (req, res) => {
//     const logPrefix = '[Node /api/external-ai-tools/files (DELETE)]';
//     const userId = req.headers['x-user-id'];
//     const { serverFilename } = req.params;

//     if (!userId) return res.status(401).json({ message: 'Authentication required.' });
//     if (!serverFilename) return res.status(400).json({ message: 'Filename required.' });

//     const userDocsPath = getUserAssetDirectory(userId);
//     const filePath = path.join(userDocsPath, serverFilename);

//     if (!filePath.startsWith(userDocsPath)) return res.status(403).json({ message: 'Forbidden.' });

//     try {
//         if (fs.existsSync(filePath)) {
//             fs.unlinkSync(filePath);
//             console.log(`${logPrefix} Deleted file from disk: ${filePath}`);
            
//             await axios.post(`${PYTHON_SERVICE_URL}/remove_document`, 
//                 { filename_in_storage: serverFilename, user_id: userId },
//                 { headers: { 'Content-Type': 'application/json', 'x-user-id': userId } }
//             );
//             res.status(200).json({ message: `File '${serverFilename}' deleted.`, status: 'success' });
//         } else {
//             res.status(404).json({ message: 'File not found.' });
//         }
//     } catch (error) {
//         const errorMsg = error.response?.data?.error || error.message;
//         console.error(`${logPrefix} Error deleting '${serverFilename}':`, errorMsg);
//         res.status(500).json({ message: `Failed to delete file '${serverFilename}'.`, error: errorMsg });
//     }
// });

// router.patch('/files/:serverFilename', async (req, res) => {
//     const logPrefix = '[Node /api/external-ai-tools/files (PATCH)]';
//     const userId = req.headers['x-user-id'];
//     const { serverFilename } = req.params;
//     const { newOriginalName } = req.body;

//     if (!userId) return res.status(401).json({ message: 'Authentication required.' });
//     if (!serverFilename || !newOriginalName) return res.status(400).json({ message: 'Filename and new name required.' });

//     const userDocsPath = getUserAssetDirectory(userId);
//     const filePath = path.join(userDocsPath, serverFilename);

//     if (!filePath.startsWith(userDocsPath)) return res.status(403).json({ message: 'Forbidden.' });
//     if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'File not found.' });

//     try {
//         await axios.post(`${PYTHON_SERVICE_URL}/update_document_name`, {
//             filename_in_storage: serverFilename,
//             new_original_filename: newOriginalName,
//             user_id: userId
//         }, { headers: { 'Content-Type': 'application/json', 'x-user-id': userId } });
        
//         res.status(200).json({ message: `File name updated to '${newOriginalName}'.`, status: 'success' });
//     } catch (error) {
//         const errorMsg = error.response?.data?.error || error.message;
//         console.error(`${logPrefix} Error renaming '${serverFilename}':`, errorMsg);
//         res.status(500).json({ message: 'Failed to rename file.', error: errorMsg });
//     }
// });

// // --- Document Analysis Route (FIXED/ADDED) ---
// router.post('/analyze_document', (req, res) => {
//     const logPrefix = '[Node /api/external-ai-tools/analyze_document]';
//     const userId = req.headers['x-user-id'];
//     const { serverFilename } = req.body;

//     if (!userId || !serverFilename) {
//         return res.status(400).json({ message: 'User ID and server filename are required for analysis.' });
//     }

//     const userDocsPath = getUserAssetDirectory(userId);
//     const filePath = path.join(userDocsPath, serverFilename);

//     if (!filePath.startsWith(userDocsPath)) {
//         return res.status(403).json({ message: 'Forbidden: Invalid file path.' });
//     }
//     if (!fs.existsSync(filePath)) {
//         return res.status(404).json({ message: `File not found for analysis: ${serverFilename}` });
//     }

//     const pythonPayload = {
//         ...req.body,
//         file_path_for_analysis: filePath, // Add absolute path for Python
//         user_id: userId
//     };
    
//     forwardToPythonService(req, res, '/analyze_document', pythonPayload);
// });


// // --- Other Tool Forwarding Routes ---

// // Academic Search Routes
// router.post('/search/combined', (req, res) => {
//     forwardToPythonService(req, res, '/tools/search/combined', req.body);
// });
// router.post('/search/core', (req, res) => {
//     forwardToPythonService(req, res, '/tools/search/core', req.body);
// });

// // Content Creation Routes
// router.post('/create/ppt', express.text({ type: ['text/markdown', 'text/plain', 'application/text'], limit: '10mb' }), (req, res) => {
//     const filename = req.query.filename || 'Presentation.pptx';
//     forwardToPythonService(req, res, '/tools/create/ppt', req.body, false, 'POST', { filename });
// });
// router.post('/create/doc', (req, res) => {
//     forwardToPythonService(req, res, '/tools/create/doc', req.body);
// });

// // PDF Processing (OCR) Routes
// router.post('/ocr/tesseract', upload.single('pdf_file'), async (req, res) => {
//     if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
//     const formData = new FormDataNode();
//     formData.append('pdf_file', fs.createReadStream(req.file.path), req.file.originalname);
//     try {
//         await forwardToPythonService(req, res, '/tools/ocr/tesseract', formData, true);
//     } finally {
//         fs.unlink(req.file.path, err => err && console.error(`Error deleting temp file:`, err.message));
//     }
// });
// router.post('/ocr/nougat', upload.single('pdf_file'), async (req, res) => {
//     if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.' });
//     const formData = new FormDataNode();
//     formData.append('pdf_file', fs.createReadStream(req.file.path), req.file.originalname);
//     try {
//         await forwardToPythonService(req, res, '/tools/ocr/nougat', formData, true);
//     } finally {
//         fs.unlink(req.file.path, err => err && console.error(`Error deleting temp file:`, err.message));
//     }
// });

// // Video Processing Route
// router.post('/process/video', upload.single('video_file'), async (req, res) => {
//     if (!req.file) return res.status(400).json({ error: 'No video file uploaded.' });
//     const formData = new FormDataNode();
//     formData.append('video_file', fs.createReadStream(req.file.path), req.file.originalname);
//     if (req.body.ollama_model) formData.append('ollama_model', req.body.ollama_model);
//     try {
//         await forwardToPythonService(req, res, '/tools/process/video', formData, true);
//     } finally {
//         fs.unlink(req.file.path, err => err && console.error(`Error deleting temp video file:`, err.message));
//     }
// });

// // Web Resources Download Routes
// router.post('/download/youtube', (req, res) => {
//     forwardToPythonService(req, res, '/tools/download/youtube', req.body);
// });
// router.post('/download/web_pdfs', (req, res) => {
//     forwardToPythonService(req, res, '/tools/download/web_pdfs', req.body);
// });

// // This route allows the client to download files generated by Python tools
// router.get('/files/download-tool-output/*', (req, res) => {
//     const logPrefix = '[Node Tool File Download]';
//     const relativePath = req.params[0];
//     if (!relativePath) {
//         return res.status(400).send('File path is required.');
//     }
    
//     // The path from python is relative to the *server* directory.
//     const pythonAssetsBase = path.join(__dirname, '..', 'python_tool_assets');
//     const fullPath = path.join(pythonAssetsBase, relativePath);

//     console.log(`${logPrefix} Attempting to serve file: ${fullPath}`);

//     // Security check to prevent path traversal
//     if (!path.resolve(fullPath).startsWith(path.resolve(pythonAssetsBase))) {
//         console.warn(`${logPrefix} Forbidden path traversal attempt: ${relativePath}`);
//         return res.status(403).send('Forbidden');
//     }

//     if (fs.existsSync(fullPath)) {
//         res.download(fullPath);
//     } else {
//         res.status(404).send('File not found.');
//     }
// });


// module.exports = router;

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
// This is the base for user-specific document uploads handled by Node before RAG processing.
const NODE_MANAGED_ASSETS_BASE_DIR = path.join(__dirname, '..', 'assets'); // D:\agent\NewBot\server\assets
const USER_DOCS_SUBDIR = 'docs';

// *** IMPORTANT: This directory must match where Python's config.DEFAULT_ASSETS_DIR points ***
// If Python's DEFAULT_ASSETS_DIR is <ProjectRoot>/python_tool_assets:
// __dirname is .../server/routes
// '..' is .../server
// '..' is .../ (Project Root)
const PYTHON_TOOL_OUTPUT_BASE_DIR = path.resolve(path.join(__dirname, '..', '..', 'python_tool_assets'));
console.log(`[externalAiTools.js] PYTHON_TOOL_OUTPUT_BASE_DIR (for serving tool outputs) set to: ${PYTHON_TOOL_OUTPUT_BASE_DIR}`);


const getUserAssetDirectoryNode = (userId) => {
    return path.join(NODE_MANAGED_ASSETS_BASE_DIR, `user_${userId}`, USER_DOCS_SUBDIR);
};

const ensureAssetDirectoriesExist = () => {
    if (!fs.existsSync(NODE_MANAGED_ASSETS_BASE_DIR)) {
        fs.mkdirSync(NODE_MANAGED_ASSETS_BASE_DIR, { recursive: true });
        console.log(`[externalAiTools.js] Created Node-managed assets directory: ${NODE_MANAGED_ASSETS_BASE_DIR}`);
    }
    // Also ensure the base for Python tool outputs exists from Node's perspective if it's going to serve them
    if (!fs.existsSync(PYTHON_TOOL_OUTPUT_BASE_DIR)) {
        try {
            fs.mkdirSync(PYTHON_TOOL_OUTPUT_BASE_DIR, { recursive: true });
            console.log(`[externalAiTools.js] Ensured Python tool output base directory: ${PYTHON_TOOL_OUTPUT_BASE_DIR}`);
        } catch (err) {
            console.error(`[externalAiTools.js] Could not create Python tool output base dir ${PYTHON_TOOL_OUTPUT_BASE_DIR}: ${err.message}`);
        }
    }
};
ensureAssetDirectoriesExist(); 

// Temp upload dir for Node before moving to user's RAG doc storage
const UPLOAD_DIR_NODE_TEMP = path.join(__dirname, '..', 'uploads_node_temp'); // D:\agent\NewBot\server\uploads_node_temp
if (!fs.existsSync(UPLOAD_DIR_NODE_TEMP)) {
    try {
        fs.mkdirSync(UPLOAD_DIR_NODE_TEMP, { recursive: true });
    } catch (err) {
        console.error(`[externalAiTools.js] Error creating temp upload dir ${UPLOAD_DIR_NODE_TEMP}: ${err.message}`);
    }
}
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR_NODE_TEMP),
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeOriginalName = file.originalname.replace(/\s+/g, '_').replace(/[^\w.-]/g, '');
        cb(null, `${timestamp}-${safeOriginalName}`);
    }
});
const upload = multer({ storage: storage, limits: { fileSize: 1024 * 1024 * 500 } }); 

// Apply middleware for this router
router.use(express.json({
    verify: (req, res, buf, encoding) => { 
        try { req.rawBody = buf.toString(encoding || 'utf8'); } catch (e) { req.rawBody = '[Could not capture raw body string]'; }
    }
}));
router.use(express.text({ type: ['text/markdown', 'text/plain', 'application/text'], limit: '10mb' }));


async function forwardToPythonService(req, res, pythonEndpoint, payload, isFileUpload = false, httpMethod = 'POST', queryParams = null) {
    if (!PYTHON_SERVICE_URL) {
        // ... (error handling as before) ...
        return res.status(500).json({ message: "Python service URL not configured.", error: "ConfigurationError", status: "error" });
    }
    const targetUrl = `${PYTHON_SERVICE_URL}${pythonEndpoint}`;
    const logPrefix = `[NodeFwd ${pythonEndpoint}]`;
    // Prioritize x-user-id header, then user_id from body (if JSON), then from query params
    const userIdFromBodyOrQuery = (req.body && typeof req.body === 'object' && req.body.user_id) ? req.body.user_id : req.query?.user_id;
    const userId = req.headers['x-user-id'] || userIdFromBodyOrQuery || 'guest_user_node_fwd';


    console.log(`${logPrefix} UID='${userId}', ${httpMethod} -> ${targetUrl}`);
    if (queryParams) console.log(`${logPrefix} QParams:`, queryParams);

    const requestTimeout = pythonEndpoint.includes('/video') || pythonEndpoint.includes('/add_document') || pythonEndpoint.includes('ocr') ? 30 * 60 * 1000 : 5 * 60 * 1000;
    
    const axiosConfig = {
        method: httpMethod,
        url: targetUrl,
        headers: { 'x-user-id': userId }, // Python service can also pick this up if needed
        timeout: requestTimeout,
    };

    let finalPayload = payload;
    // Ensure user_id is in the JSON payload sent to Python if it's not FormData
    if (payload && typeof payload === 'object' && !(payload instanceof FormDataNode) && !isFileUpload) {
        finalPayload = { ...payload, user_id: userId }; // Add/overwrite user_id
    } else if (isFileUpload && payload instanceof FormDataNode) {
        // For FormData, Python's request.form.get('user_id') will be used.
        // Append user_id if not already present or if Python expects it in form.
        if (!payload.has('user_id')) {
           try { payload.append('user_id', userId); } 
           catch (e) { console.warn (`${logPrefix} Could not append user_id to FormData (possibly read-only stream): ${e.message}`) }
        }
        finalPayload = payload;
    }
    // If it's a raw text payload for /create/ppt, user_id is passed via query params by Node
    // and Python's /tools/create/ppt route needs to pick it up from request.args.get('user_id')

    if (isFileUpload && finalPayload instanceof FormDataNode) {
        axiosConfig.data = finalPayload;
        axiosConfig.headers = { ...axiosConfig.headers, ...finalPayload.getHeaders() };
    } else if (typeof finalPayload === 'string' && req.get('Content-Type') && (req.get('Content-Type').startsWith('text/') || req.get('Content-Type') === 'application/text') ) {
        axiosConfig.data = finalPayload;
        axiosConfig.headers['Content-Type'] = req.get('Content-Type'); 
        console.log(`${logPrefix} Payload (Raw Text): ${finalPayload.substring(0, 70)}...`);
    } else if (finalPayload) { 
        axiosConfig.data = finalPayload; 
        axiosConfig.headers['Content-Type'] = 'application/json';
        console.log(`${logPrefix} Payload (JSON): ${JSON.stringify(finalPayload).substring(0,70)}...`);
    }

    if (queryParams) {
        // If user_id wasn't in original queryParams, add it.
        // Python's request.args.get('user_id') will get this.
        axiosConfig.params = { ...queryParams, user_id: userId };
    } else if (httpMethod.toUpperCase() === 'GET' || (httpMethod.toUpperCase() === 'POST' && typeof finalPayload === 'string')) {
        // For GETs or text POSTs where user_id might not be in body, ensure it's in query
        axiosConfig.params = { ...(axiosConfig.params || {}), user_id: userId };
    }
    
    try {
        const pythonResponse = await axios(axiosConfig);
        if (pythonResponse.headers['content-disposition']) {
            res.setHeader('Content-Type', pythonResponse.headers['content-type']);
            res.setHeader('Content-Disposition', pythonResponse.headers['content-disposition']);
            pythonResponse.data.pipe(res);
        } else {
            res.status(pythonResponse.status).json(pythonResponse.data);
        }
    } catch (error) {
        // ... (error handling as before, ensure it sends JSON back to client) ...
        const errorStatus = error.response ? error.response.status : 502;
        const errorData = error.response ? error.response.data : { error: "UpstreamError", message: error.message, details: "No response from Python or network issue." };
        const pythonErrorMsg = errorData?.error || errorData?.message || (typeof errorData === 'string' ? errorData : "Unknown Python error");
        const pythonDetails = errorData?.details || (error.code ? `Node.js Request Error Code: ${error.code}`: undefined);
        console.error(`${logPrefix} Error forwarding to Python (${targetUrl}): [${errorStatus}] Msg: ${pythonErrorMsg}`, pythonDetails || '');
        if (error.code === 'ECONNABORTED') console.error(`${logPrefix} Request timed out.`);
        res.status(errorStatus).json({
            message: `Request to Python service endpoint '${pythonEndpoint}' failed.`,
            error: errorData?.error || "UpstreamProcessingError", 
            python_error: pythonErrorMsg, 
            details: pythonDetails,
            status: "error"
        });
    }
}

// --- File Management Routes for RAG ---
// server/routes/externalAiTools.js
router.post('/upload', upload.single('file'), async (req, res) => {
    const logPrefix = '[Node /api/external-ai-tools/upload]';
    console.log(`${logPrefix} Request received.`); // Log start

    if (!req.file) {
        console.error(`${logPrefix} No file uploaded in request.`);
        return res.status(400).json({ error: 'No file uploaded.' });
    }
    
    const userId = req.headers['x-user-id'];
    if (!userId) {
        console.error(`${logPrefix} User ID missing.`);
        if(req.file && req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); // Cleanup
        return res.status(401).json({ message: 'Authentication required: User ID missing.' });
    }

    const { originalname: originalName, filename: serverFilenameInNodeTemp, path: tempFilePath } = req.file;
    const userDocsPathNode = getUserAssetDirectoryNode(userId);
    const finalDestinationPathNode = path.join(userDocsPathNode, serverFilenameInNodeTemp);

    console.log(`${logPrefix} User='${userId}', Original: '${originalName}', TempPath: '${tempFilePath}', DestPath: '${finalDestinationPathNode}'`);

    try {
        if (!fs.existsSync(userDocsPathNode)) {
            console.log(`${logPrefix} User docs path ${userDocsPathNode} does not exist, creating...`);
            fs.mkdirSync(userDocsPathNode, { recursive: true });
        }
        console.log(`${logPrefix} Attempting to move file from ${tempFilePath} to ${finalDestinationPathNode}`);
        fs.renameSync(tempFilePath, finalDestinationPathNode);
        console.log(`${logPrefix} Successfully moved RAG file for Node to: '${finalDestinationPathNode}'`);

        const pathForPython = finalDestinationPathNode.replace(/\\/g, '/'); 
        const pythonPayload = {
            filepath: pathForPython,
            filename_in_storage: serverFilenameInNodeTemp,
            original_filename: originalName,
            user_id: userId
        };
        
        console.log(`${logPrefix} Prepared payload for Python /add_document:`, JSON.stringify(pythonPayload, null, 2));
        
        // Assuming forwardToPythonService handles the response to the client
        await forwardToPythonService(req, res, '/add_document', pythonPayload);
        // If forwardToPythonService doesn't immediately send res, you might need:
        // console.log(`${logPrefix} Call to forwardToPythonService for /add_document completed.`);
        // The response to client is handled by forwardToPythonService

    } catch (error) { 
        console.error(`${logPrefix} Node.js CRITICAL ERROR processing upload for '${originalName}':`, error); // Log the full error object
        console.error(`${logPrefix} Error message:`, error.message);
        console.error(`${logPrefix} Error stack:`, error.stack);
        res.status(500).json({ 
            message: `Node.js server failed to process file upload '${originalName}'.`, 
            error: "NodeFileUploadProcessingError", 
            details: error.message,
            status: "error" 
        });
    } finally {
        // Only unlink if tempFilePath exists and is not the same as finalDestinationPathNode (which it shouldn't be if renameSync worked)
        if (tempFilePath && fs.existsSync(tempFilePath) && tempFilePath !== finalDestinationPathNode) {
            console.log(`${logPrefix} Attempting to delete temp file in finally: ${tempFilePath}`);
            fs.unlink(tempFilePath, err => {
                if (err) console.error(`${logPrefix} Error deleting temp file ${tempFilePath} in finally:`, err.message);
                else console.log(`${logPrefix} Successfully deleted temp file ${tempFilePath} in finally.`);
            });
        }
    }
});

router.get('/files', async (req, res) => {
    const logPrefix = '[Node /api/external-ai-tools/files (RAG List)]';
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ message: 'Authentication required: User ID missing.' });

    const userDocsPathNode = getUserAssetDirectoryNode(userId);
    if (!fs.existsSync(userDocsPathNode)) return res.status(200).json([]); // No directory means no files

    try {
        const filesInDir = fs.readdirSync(userDocsPathNode);
        const userFiles = filesInDir
            .map(filenameInNodeStorage => {
                try {
                    const filePath = path.join(userDocsPathNode, filenameInNodeStorage);
                    const stats = fs.statSync(filePath);
                    const originalNameMatch = filenameInNodeStorage.match(/^\d+-(.*)$/); // From Node's multer setup
                    const originalName = originalNameMatch ? originalNameMatch[1].replace(/_/g, ' ') : filenameInNodeStorage;
                    return { 
                        originalName, 
                        serverFilename: filenameInNodeStorage, // This is the key for delete/rename
                        size: stats.size, 
                        type: path.extname(filenameInNodeStorage).toLowerCase(), 
                        uploadedAt: stats.birthtime.toISOString() 
                    };
                } catch (statError) {
                    console.warn(`${logPrefix} Could not stat file ${filenameInNodeStorage} for user ${userId}, skipping: ${statError.message}`);
                    return null;
                }
            })
            .filter(file => file && !['.pyc', '.json', '.bin', '.DS_Store'].includes(file.type));

        userFiles.sort((a, b) => { // Sort by timestamp in filename (descending)
            const timeA = parseInt(a.serverFilename.split('-')[0]) || 0;
            const timeB = parseInt(b.serverFilename.split('-')[0]) || 0;
            return timeB - timeA;
        });
        res.status(200).json(userFiles);
    } catch (error) {
        console.error(`${logPrefix} Error listing RAG files for User='${userId}':`, error.message);
        res.status(500).json({ message: 'Failed to retrieve user RAG files.', error: error.message, status: "error" });
    }
});

router.get('/files/:serverFilename', (req, res) => { // For downloading RAG source files
    const logPrefix = '[Node /api/external-ai-tools/files/:filename (RAG Download)]';
    const userId = req.headers['x-user-id'];
    const { serverFilename } = req.params;

    if (!userId) return res.status(401).json({ message: 'Authentication required.' });
    if (!serverFilename) return res.status(400).json({ message: 'Filename is required.' });

    const userDocsPathNode = getUserAssetDirectoryNode(userId);
    const filePath = path.join(userDocsPathNode, serverFilename);

    if (!path.resolve(filePath).startsWith(path.resolve(userDocsPathNode))) {
        return res.status(403).json({ message: 'Forbidden.' });
    }
    if (!fs.existsSync(filePath)) return res.status(404).json({ message: 'RAG source file not found.' });

    const originalNameMatch = serverFilename.match(/^\d+-(.*)$/);
    const originalNameForDownload = originalNameMatch ? originalNameMatch[1].replace(/_/g, ' ') : serverFilename;
    
    res.setHeader('Content-Disposition', `attachment; filename="${originalNameForDownload}"`);
    res.sendFile(filePath);
});

router.delete('/files/:serverFilename', async (req, res) => { // Deletes RAG source file & tells Python
    const logPrefix = '[Node /api/external-ai-tools/files (RAG DELETE)]';
    const userId = req.headers['x-user-id'];
    const { serverFilename } = req.params; // This is filename_in_storage for Python

    if (!userId) return res.status(401).json({ message: 'Authentication required.' });
    if (!serverFilename) return res.status(400).json({ message: 'Filename required.' });

    const userDocsPathNode = getUserAssetDirectoryNode(userId);
    const filePathNode = path.join(userDocsPathNode, serverFilename);

    if (!path.resolve(filePathNode).startsWith(path.resolve(userDocsPathNode))) {
         return res.status(403).json({ message: 'Forbidden.' });
    }

    try {
        if (fs.existsSync(filePathNode)) {
            fs.unlinkSync(filePathNode);
            console.log(`${logPrefix} Deleted RAG file from Node disk: ${filePathNode}`);
        } else {
            console.warn(`${logPrefix} RAG file not found on Node disk for deletion: ${filePathNode}, but proceeding to inform Python.`);
        }
        // Always tell Python to remove from index, even if Node's copy was already gone.
        await forwardToPythonService(req, res, '/remove_document', 
            { filename_in_storage: serverFilename /* user_id added by forwarder */ }, 
            false, 'POST');
    } catch (error) { 
        const errorMsg = error.response?.data?.error || error.message;
        console.error(`${logPrefix} Error deleting RAG file '${serverFilename}':`, errorMsg);
        res.status(500).json({ message: `Failed to delete RAG file '${serverFilename}'.`, error: "FileDeletionError", python_error: errorMsg, status: "error" });
    }
});

router.patch('/files/:serverFilename', async (req, res) => { // Renames RAG source file metadata in Python
    const logPrefix = '[Node /api/external-ai-tools/files (RAG RENAME)]';
    const userId = req.headers['x-user-id'];
    const { serverFilename } = req.params; // This is filename_in_storage for Python
    const { newOriginalName } = req.body;

    if (!userId) return res.status(401).json({ message: 'Authentication required.' });
    if (!serverFilename || !newOriginalName) return res.status(400).json({ message: 'Server filename and new original name are required.' });
    
    // Note: This does not rename the file on Node's disk (serverFilename remains the key).
    // It only tells Python to update the 'original_filename' metadata in its index.
    try {
        await forwardToPythonService(req, res, '/update_document_name', {
            filename_in_storage: serverFilename,
            new_original_filename: newOriginalName,
            /* user_id added by forwarder */
        }, false, 'POST');
    } catch (error) {
        const errorMsg = error.response?.data?.error || error.message;
        console.error(`${logPrefix} Error renaming RAG file metadata for '${serverFilename}':`, errorMsg);
        res.status(500).json({ message: 'Failed to rename RAG file metadata.', error: "FileRenameError", python_error: errorMsg, status: "error" });
    }
});

// --- Document Analysis Route (for RAG files already uploaded via /upload) ---
router.post('/analyze_document', (req, res) => {
    const logPrefix = '[Node /api/external-ai-tools/analyze_document]';
    const userId = req.headers['x-user-id'] || req.body?.user_id;
    const { serverFilename } = req.body; // Key to identify the RAG file on Node's storage

    if (!userId) {
        return res.status(401).json({ message: 'User ID is missing.', error:"AuthenticationError", status:"error" });
    }
    if (!serverFilename) {
        return res.status(400).json({ message: 'Server filename (for an existing RAG document) is required for analysis.', error:"MissingParameter", status:"error" });
    }

    const userDocsPathNode = getUserAssetDirectoryNode(userId);
    const filePathForAnalysisOnNode = path.join(userDocsPathNode, serverFilename); 

    if (!path.resolve(filePathForAnalysisOnNode).startsWith(path.resolve(userDocsPathNode))) {
        return res.status(403).json({ message: 'Forbidden: Invalid file path for analysis.', error:"ForbiddenPath", status:"error" });
    }
    if (!fs.existsSync(filePathForAnalysisOnNode)) {
        return res.status(404).json({ message: `RAG document '${serverFilename}' not found for analysis.`, error:"FileNotFound", status:"error" });
    }
    
    const pythonPayload = {
        ...req.body, // Forwards analysis_type, llm_provider, api_keys etc. from client
        file_path_for_analysis: filePathForAnalysisOnNode.replace(/\\/g, '/'), // Python uses this absolute path
        // user_id will be added by forwardToPythonService or is already in req.body
    };
    forwardToPythonService(req, res, '/analyze_document', pythonPayload);
});

// --- Other Tool Forwarding Routes ---
router.post('/search/combined', (req, res) => forwardToPythonService(req, res, '/tools/search/combined', req.body));
router.post('/search/core', (req, res) => forwardToPythonService(req, res, '/tools/search/core', req.body));

router.post('/create/ppt', (req, res) => { 
    const filename = req.query.filename || 'Presentation.pptx';
    // user_id should be in req.query from forwardToPythonService if using GET/text POST
    forwardToPythonService(req, res, '/tools/create/ppt', req.body, false, 'POST', { filename /* user_id added by forwarder if needed */ });
});
router.post('/create/doc', (req, res) => forwardToPythonService(req, res, '/tools/create/doc', req.body));

router.post('/ocr/tesseract', upload.single('pdf_file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.', status: "error" });
    const formData = new FormDataNode();
    formData.append('pdf_file', fs.createReadStream(req.file.path), req.file.originalname);
    // user_id added by forwarder
    try {
        await forwardToPythonService(req, res, '/tools/ocr/tesseract', formData, true);
    } finally {
        fs.unlink(req.file.path, err => err && console.error(`[Node OCR Tesseract] Error deleting temp file:`, err.message));
    }
});
router.post('/ocr/nougat', upload.single('pdf_file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No PDF file uploaded.', status: "error" });
    const formData = new FormDataNode();
    formData.append('pdf_file', fs.createReadStream(req.file.path), req.file.originalname);
    // user_id added by forwarder
    try {
        await forwardToPythonService(req, res, '/tools/ocr/nougat', formData, true);
    } finally {
        fs.unlink(req.file.path, err => err && console.error(`[Node OCR Nougat] Error deleting temp file:`, err.message));
    }
});

router.post('/process/video', upload.single('video_file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No video file uploaded.', status: "error" });
    const formData = new FormDataNode();
    formData.append('video_file', fs.createReadStream(req.file.path), req.file.originalname);
    if (req.body.ollama_model) formData.append('ollama_model', req.body.ollama_model);
    // user_id added by forwarder
    try {
        await forwardToPythonService(req, res, '/tools/process/video', formData, true);
    } finally {
        fs.unlink(req.file.path, err => err && console.error(`[Node Process Video] Error deleting temp video file:`, err.message));
    }
});

router.post('/download/youtube', (req, res) => forwardToPythonService(req, res, '/tools/download/youtube', req.body));
router.post('/download/web_pdfs', (req, res) => forwardToPythonService(req, res, '/tools/download/web_pdfs', req.body));


// Route for downloading files generated by Python tools
router.get('/files/download-tool-output/*', (req, res) => {
    const logPrefix = '[Node Tool Output Download]';
    const requestedRelativePath = req.params[0]; 

    if (!requestedRelativePath) {
        return res.status(400).json({ message: 'File path is required.', error: "MissingPath", status:"error" });
    }
    
    // PYTHON_TOOL_OUTPUT_BASE_DIR is D:\agent\NewBot\python_tool_assets
    // requestedRelativePath is like 'user_XYZ/web_downloads/file.pdf'
    const absoluteFilePath = path.resolve(path.join(PYTHON_TOOL_OUTPUT_BASE_DIR, requestedRelativePath));

    console.log(`${logPrefix} Client requested: '${requestedRelativePath}' -> Mapped to: '${absoluteFilePath}' (Base: ${PYTHON_TOOL_OUTPUT_BASE_DIR})`);

    if (!absoluteFilePath.startsWith(path.resolve(PYTHON_TOOL_OUTPUT_BASE_DIR))) {
        console.warn(`${logPrefix} Forbidden path: '${requestedRelativePath}' resolved to '${absoluteFilePath}'`);
        return res.status(403).json({ message: 'Forbidden: Access denied.', error:"ForbiddenPath", status:"error" });
    }

    if (fs.existsSync(absoluteFilePath)) {
        const originalFilename = path.basename(absoluteFilePath); // Or get from Python response if more complex
        console.log(`${logPrefix} Serving file: ${absoluteFilePath} as ${originalFilename}`);
        res.setHeader('Content-Disposition', `attachment; filename="${originalFilename}"`);
        res.sendFile(absoluteFilePath);
    } else {
        console.error(`${logPrefix} File not found at '${absoluteFilePath}' (requested relPath: '${requestedRelativePath}')`);
        res.status(404).json({ message: 'Requested tool-generated file was not found on server.', error:"FileNotFound", status:"error" });
    }
});


// Centralized Error Handler for this Router (SyntaxError from express.json, etc.)
router.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        console.error('[Node.js externalAiTools.js] Bad JSON received in request body:', err.message);
        if (req.rawBody) { 
            console.error('[Node.js externalAiTools.js] Raw Body Preview:', req.rawBody.substring(0, 200) + (req.rawBody.length > 200 ? '...' : ''));
        }
        return res.status(400).json({
            status: 'error',
            error: 'MalformedJSON',
            message: 'The request body sent to the server is not valid JSON.',
            details: err.message 
        });
    }
    if (res.headersSent) { 
        return next(err);
    }
    console.error('[Node.js externalAiTools.js] Unhandled error in router:', err);
    res.status(err.status || 500).json({
        status: 'error',
        error: err.name || 'UnhandledRouterError',
        message: err.message || 'An unexpected error occurred processing your tool request.'
    });
});

module.exports = router;