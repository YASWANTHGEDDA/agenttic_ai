// // // client/src/services/api.js
// // import axios from 'axios';

// // // --- Configuration: Dynamically determine API Base URL ---
// // const getApiBaseUrl = () => {
// //     const backendHostEnv = process.env.REACT_APP_BACKEND_HOST;
// //     const backendPortEnv = process.env.REACT_APP_BACKEND_PORT;
// //     const protocol = window.location.protocol;
// //     let backendHost, backendPort;

// //     if (backendHostEnv && backendPortEnv) {
// //         backendHost = backendHostEnv;
// //         backendPort = backendPortEnv;
// //     } else {
// //         const hostname = window.location.hostname;
// //         // Default to port 5003 if not specified
// //         backendPort = process.env.NODE_PORT || process.env.REACT_APP_BACKEND_PORT || 5003;
// //         // Use localhost for development, otherwise use the window's hostname
// //         backendHost = (hostname === 'localhost' || hostname === '127.0.0.1') ? 'localhost' : hostname;
// //     }
// //     return `${protocol}//${backendHost}:${backendPort}/api`;
// // };

// // const API_BASE_URL = getApiBaseUrl();
// // console.log("API Base URL (api.js):", API_BASE_URL);

// // // --- Axios Instances ---
// // // Standard instance with a 5-minute timeout for most requests
// // const api = axios.create({
// //     baseURL: API_BASE_URL,
// //     timeout: 300000, 
// // });

// // // Instance with a long timeout for slow tasks like video processing
// // const longRunningApi = axios.create({
// //     baseURL: API_BASE_URL,
// //     timeout: 30 * 60 * 1000, // 30 minutes
// // });

// // // --- Interceptors ---
// // const applyInterceptors = (apiInstance) => {
// //     // Request interceptor to add the user ID header
// //     apiInstance.interceptors.request.use(
// //         (config) => {
// //             const userId = localStorage.getItem('userId');
// //             if (userId) {
// //                 config.headers['x-user-id'] = userId;
// //             } else if (!config.url.includes('/auth/')) {
// //                  console.warn("API Interceptor: userId not found for non-auth request to", config.url);
// //             }
// //             // Ensure correct content type unless it's a file upload
// //             if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
// //                 config.headers['Content-Type'] = 'application/json';
// //             }
// //             return config;
// //         }, (error) => {
// //             console.error("API Request Interceptor Error:", error);
// //             return Promise.reject(error);
// //         }
// //     );

// //     // Response interceptor for global error handling
// //     apiInstance.interceptors.response.use(
// //         (response) => response,
// //         (error) => {
// //             // Handle unauthorized errors by logging the user out
// //             if (error.response && error.response.status === 401) {
// //                 console.warn("API Interceptor: 401 Unauthorized. Clearing auth & redirecting to /login.");
// //                 localStorage.clear();
// //                 if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
// //                      window.location.href = '/login?sessionExpired=true';
// //                 }
// //             }
// //             // Create a unified error message, prioritizing backend-specific errors
// //             const errorMessage = error.response?.data?.error ||
// //                                  error.response?.data?.message ||
// //                                  error.message ||
// //                                  'An unknown API error occurred';
// //             console.error("API Error:", errorMessage, "URL:", error.config?.url, "Status:", error.response?.status);
// //             const customError = new Error(errorMessage);
// //             customError.response = error.response;
// //             return Promise.reject(customError);
// //         }
// //     );
// // };

// // // Apply interceptors to both instances
// // applyInterceptors(api);
// // applyInterceptors(longRunningApi);

// // // --- Authentication ---
// // export const signupUser = (userData) => api.post('/auth/signup', userData).then(res => res.data);
// // export const signinUser = (userData) => api.post('/auth/signin', userData).then(res => res.data);
// // export const saveApiKeys = (keyData) => api.post('/auth/keys', keyData).then(res => res.data);

// // // --- Chat Interaction ---
// // export const sendMessage = (messageData) => api.post('/chat/message', messageData).then(res => res.data);
// // export const saveChatHistory = (historyData) => api.post('/chat/history', historyData).then(res => res.data);
// // export const getChatSessions = () => api.get('/chat/sessions').then(res => res.data);
// // export const getSessionDetails = (sessionId) => api.get(`/chat/session/${sessionId}`).then(res => res.data);
// // export const deleteChatSession = (sessionId) => api.delete(`/chat/session/${sessionId}`).then(res => res.data);

// // // --- File Management (for RAG) ---
// // export const uploadFile = (formData) => api.post('/upload', formData).then(res => res.data);
// // export const getUserFiles = () => api.get('/files').then(res => res.data);
// // export const renameUserFile = (serverFilename, newOriginalName) => api.patch(`/files/${serverFilename}`, { newOriginalName }).then(res => res.data);
// // export const deleteUserFile = (serverFilename) => api.delete(`/files/${serverFilename}`).then(res => res.data);

// // // --- Document Analysis ---
// // export const analyzeDocument = (analysisData) => api.post('/analysis/document', analysisData).then(res => res.data);

// // // =================================================================================
// // // --- External AI Tool Service Functions ---
// // // =================================================================================
// // const EXTERNAL_AI_TOOLS_PROXY_PATH = `/external-ai-tools`;

// // // --- Academic Search ---
// // export const searchCoreApi = (query, coreApiKey, maxPages = 1, downloadPdfs = false) => {
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/search/core`, {
// //         query,
// //         core_api_key: coreApiKey,
// //         max_pages: maxPages,
// //         download_pdfs: downloadPdfs
// //     }).then(res => res.data);
// // };

// // export const searchCombinedAcademic = (searchParams) => {
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/search/combined`, searchParams).then(res => res.data);
// // };

// // // --- Content Creation ---
// // export const createPresentationFromMarkdown = (markdownContent, filename = 'Presentation.pptx') => {
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/create/ppt?filename=${encodeURIComponent(filename)}`,
// //         markdownContent,
// //         { headers: { 'Content-Type': 'text/markdown' } }
// //     ).then(res => res.data);
// // };

// // export const createDocumentFromMarkdown = (markdownContent, contentKey, filename = 'Document.docx') => {
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/create/doc`, {
// //         markdown_content: markdownContent,
// //         content_key: contentKey,
// //         filename
// //     }).then(res => res.data);
// // };

// // // --- OCR ---
// // export const ocrPdfWithTesseract = (pdfFile) => {
// //     const formData = new FormData();
// //     formData.append('pdf_file', pdfFile);
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/ocr/tesseract`, formData).then(res => res.data);
// // };

// // export const ocrPdfWithNougat = (pdfFile) => {
// //     const formData = new FormData();
// //     formData.append('pdf_file', pdfFile);
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/ocr/nougat`, formData).then(res => res.data);
// // };

// // // --- Video Processing ---
// // export const processVideo = (videoFile, options = {}) => {
// //     const formData = new FormData();
// //     formData.append('video_file', videoFile);
// //     if (options.ollama_model) {
// //         formData.append('ollama_model', options.ollama_model);
// //     }
// //     // Use the long-running API instance for this call
// //     return longRunningApi.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/process/video`, formData).then(res => res.data);
// // };

// // // --- Web Resource Downloads ---
// // export const downloadWebPdfs = (query, maxDownloads = 3) => {
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/download/web_pdfs`, {
// //         query,
// //         max_downloads: maxDownloads
// //     }).then(res => res.data);
// // };

// // export const downloadYouTubeMedia = (youtubeUrl, qualityProfile = '720p') => {
// //     return api.post(`${EXTERNAL_AI_TOOLS_PROXY_PATH}/download/youtube`, {
// //         url: youtubeUrl,
// //         quality: qualityProfile
// //     }).then(res => res.data);
// // };

// // // --- Helper for File Downloads ---
// // export const getProxiedFileDownloadUrl = (relativePathFromServer) => {
// //     if (!relativePathFromServer || typeof relativePathFromServer !== 'string') {
// //         console.warn("getProxiedFileDownloadUrl received invalid path:", relativePathFromServer);
// //         return "#";
// //     }
// //     const cleanRelativePath = relativePathFromServer.startsWith('/')
// //         ? relativePathFromServer.substring(1)
// //         : relativePathFromServer;
// //     return `${API_BASE_URL}${EXTERNAL_AI_TOOLS_PROXY_PATH}/files/${cleanRelativePath}`;
// // };

// // // --- Default Export ---
// // export default api;

// import axios from 'axios';

// // --- Configuration: Dynamically determine API Base URL ---
// const getApiBaseUrl = () => {
//     const backendHostEnv = process.env.REACT_APP_BACKEND_HOST;
//     const backendPortEnv = process.env.REACT_APP_BACKEND_PORT;
//     const protocol = window.location.protocol;
//     let backendHost, backendPort;

//     if (backendHostEnv && backendPortEnv) {
//         backendHost = backendHostEnv;
//         backendPort = backendPortEnv;
//     } else {
//         const hostname = window.location.hostname;
//         // Default to port 5003 if not specified
//         backendPort = process.env.NODE_PORT || process.env.REACT_APP_BACKEND_PORT || 5003;
//         // Use localhost for development, otherwise use the window's hostname
//         backendHost = (hostname === 'localhost' || hostname === '127.0.0.1') ? 'localhost' : hostname;
//     }
//     return `${protocol}//${backendHost}:${backendPort}/api`;
// };

// const API_BASE_URL = getApiBaseUrl();
// console.log("API Base URL (api.js):", API_BASE_URL);

// // --- Axios Instances ---
// // Standard instance for most requests
// const api = axios.create({
//     baseURL: API_BASE_URL,
//     timeout: 300000, // 5 minutes
// });

// // Instance with a long timeout for slow tasks like video processing or large file indexing
// const longRunningApi = axios.create({
//     baseURL: API_BASE_URL,
//     timeout: 30 * 60 * 1000, // 30 minutes
// });

// // --- Interceptors ---
// const applyInterceptors = (apiInstance) => {
//     // Request interceptor to add the user ID header to every request
//     apiInstance.interceptors.request.use(
//         (config) => {
//             const userId = localStorage.getItem('userId');
//             if (userId) {
//                 config.headers['x-user-id'] = userId;
//             } else if (!config.url.includes('/auth/')) {
//                  console.warn("API Interceptor: userId not found for non-auth request to", config.url);
//             }
//             // Set default content type unless it's a file upload (which sets its own boundary)
//             if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
//                 config.headers['Content-Type'] = 'application/json';
//             }
//             return config;
//         }, (error) => {
//             console.error("API Request Interceptor Error:", error);
//             return Promise.reject(error);
//         }
//     );

//     // Response interceptor for global error handling
//     apiInstance.interceptors.response.use(
//         (response) => response,
//         (error) => {
//             // Handle unauthorized errors by logging the user out
//             if (error.response && error.response.status === 401) {
//                 console.warn("API Interceptor: 401 Unauthorized. Clearing auth & redirecting to /login.");
//                 localStorage.clear();
//                 if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
//                      window.location.href = '/login?sessionExpired=true';
//                 }
//             }
//             // Create a unified error message, prioritizing specific backend errors
//             const errorMessage = error.response?.data?.python_error || // Error proxied from Python
//                                  error.response?.data?.error ||        // General error from Node.js
//                                  error.response?.data?.message ||    // Message-based error from Node.js
//                                  error.message ||                      // Axios-level error (e.g., network)
//                                  'An unknown API error occurred';
//             console.error("API Error:", errorMessage, "URL:", error.config?.url, "Status:", error.response?.status);
            
//             // Create a new Error object to pass to the calling function's catch block
//             const customError = new Error(errorMessage);
//             customError.response = error.response;
//             return Promise.reject(customError);
//         }
//     );
// };

// // Apply interceptors to both standard and long-running API instances
// applyInterceptors(api);
// applyInterceptors(longRunningApi);


// // =================================================================================
// // --- API Service Functions ---
// // =================================================================================

// const PROXY_PATH = `/external-ai-tools`;

// // --- Authentication ---
// export const signupUser = (userData) => api.post('/auth/signup', userData).then(res => res.data);
// export const signinUser = (userData) => api.post('/auth/signin', userData).then(res => res.data);
// export const saveApiKeys = (keyData) => api.post('/auth/keys', keyData).then(res => res.data);

// // --- Chat & History ---
// export const sendMessage = (messageData) => api.post('/chat/message', messageData).then(res => res.data);
// // FIX: Added saveChatHistory back
// export const saveChatHistory = (historyData) => api.post('/history/save', historyData).then(res => res.data);
// export const getChatSessions = () => api.get('/history/sessions').then(res => res.data);
// export const getSessionDetails = (sessionId) => api.get(`/history/session/${sessionId}`).then(res => res.data);
// export const deleteChatSession = (sessionId) => api.delete(`/history/session/${sessionId}`).then(res => res.data);

// // --- RAG File Management (Proxied) ---
// export const uploadFile = (formData) => api.post(`${PROXY_PATH}/upload`, formData).then(res => res.data);
// export const getUserFiles = () => api.get(`${PROXY_PATH}/files`).then(res => res.data);
// export const renameUserFile = (serverFilename, newOriginalName) => api.patch(`${PROXY_PATH}/files/${serverFilename}`, { newOriginalName }).then(res => res.data);
// export const deleteUserFile = (serverFilename) => api.delete(`${PROXY_PATH}/files/${serverFilename}`).then(res => res.data);

// // --- Document Analysis (Proxied) ---
// export const analyzeDocument = (analysisData) => api.post(`${PROXY_PATH}/analyze_document`, analysisData).then(res => res.data);

// // --- Academic Search Tools (Proxied) ---
// export const searchCoreApi = (params) => api.post(`${PROXY_PATH}/search/core`, params).then(res => res.data);
// export const searchCombinedAcademic = (params) => api.post(`${PROXY_PATH}/search/combined`, params).then(res => res.data);

// // --- Content Creation Tools (Proxied) ---
// export const createPresentationFromMarkdown = (markdownContent, filename) => {
//     return api.post(`${PROXY_PATH}/create/ppt?filename=${encodeURIComponent(filename)}`, markdownContent, { headers: { 'Content-Type': 'text/markdown' } }).then(res => res.data);
// };
// export const createDocumentFromMarkdown = (payload) => api.post(`${PROXY_PATH}/create/doc`, payload).then(res => res.data);

// // --- OCR Tools (Proxied) ---
// export const ocrPdfWithTesseract = (pdfFile) => {
//     const formData = new FormData();
//     formData.append('pdf_file', pdfFile);
//     return api.post(`${PROXY_PATH}/ocr/tesseract`, formData).then(res => res.data);
// };
// export const ocrPdfWithNougat = (pdfFile) => {
//     const formData = new FormData();
//     formData.append('pdf_file', pdfFile);
//     return api.post(`${PROXY_PATH}/ocr/nougat`, formData).then(res => res.data);
// };

// // --- Video Processing Tool (Proxied, Long-Running) ---
// export const processVideo = (videoFile, options = {}) => {
//     const formData = new FormData();
//     formData.append('video_file', videoFile);
//     if (options.ollama_model) {
//         formData.append('ollama_model', options.ollama_model);
//     }
//     return longRunningApi.post(`${PROXY_PATH}/process/video`, formData).then(res => res.data);
// };

// // --- Web Resource Download Tools (Proxied) ---
// export const downloadWebPdfs = (params) => api.post(`${PROXY_PATH}/download/web_pdfs`, params).then(res => res.data);
// export const downloadYouTubeMedia = (params) => api.post(`${PROXY_PATH}/download/youtube`, params).then(res => res.data);


// // --- File Download Helper ---
// /**
//  * Constructs a full URL to download a file generated by a Python tool.
//  * @param {string} relativePathFromServer - The relative path returned by the server (e.g., 'python_tool_assets/user_123/...')
//  * @returns {string} The full, direct download URL.
//  */
// // FIX: Renamed back to getProxiedFileDownloadUrl to fix component imports
// export const getProxiedFileDownloadUrl = (relativePathFromServer) => {
//     if (!relativePathFromServer || typeof relativePathFromServer !== 'string') {
//         console.warn("getProxiedFileDownloadUrl received invalid path:", relativePathFromServer);
//         return "#";
//     }
//     // Remove any leading slash to ensure correct URL joining
//     const cleanRelativePath = relativePathFromServer.startsWith('/')
//         ? relativePathFromServer.substring(1)
//         : relativePathFromServer;
    
//     // This points to the dedicated download route in externalAiTools.js
//     return `${API_BASE_URL}${PROXY_PATH}/files/download-tool-output/${cleanRelativePath}`;
// };

// export default api;

// client/src/services/api.js
import axios from 'axios';

// --- Configuration: Dynamically determine API Base URL ---
const getApiBaseUrl = () => {
    const backendHostEnv = process.env.REACT_APP_BACKEND_HOST;
    const backendPortEnv = process.env.REACT_APP_BACKEND_PORT;
    const protocol = window.location.protocol;
    let backendHost, backendPort;

    if (backendHostEnv && backendPortEnv) {
        backendHost = backendHostEnv;
        backendPort = backendPortEnv;
    } else {
        const hostname = window.location.hostname;
        backendPort = process.env.NODE_PORT || process.env.REACT_APP_BACKEND_PORT || 5003;
        backendHost = (hostname === 'localhost' || hostname === '127.0.0.1') ? 'localhost' : hostname;
    }
    return `${protocol}//${backendHost}:${backendPort}/api`;
};

const API_BASE_URL = getApiBaseUrl();
console.log("API Base URL (api.js):", API_BASE_URL);

// --- Axios Instances ---
const api = axios.create({
    baseURL: API_BASE_URL,
    timeout: 300000, // 5 minutes
});

const longRunningApi = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30 * 60 * 1000, // 30 minutes
});

// --- Interceptors ---
const applyInterceptors = (apiInstance) => {
    apiInstance.interceptors.request.use(
        (config) => {
            const userId = localStorage.getItem('userId');
            if (userId) {
                config.headers['x-user-id'] = userId;
            } else if (!config.url.includes('/auth/')) {
                 console.warn("API Interceptor: userId not found for non-auth request to", config.url);
            }
            if (!(config.data instanceof FormData) && !config.headers['Content-Type']) {
                config.headers['Content-Type'] = 'application/json';
            }
            return config;
        }, (error) => {
            console.error("API Request Interceptor Error:", error);
            return Promise.reject(error);
        }
    );

    apiInstance.interceptors.response.use(
        (response) => response,
        (error) => {
            if (error.response && error.response.status === 401) {
                console.warn("API Interceptor: 401 Unauthorized. Clearing auth & redirecting to /login.");
                localStorage.clear();
                if (window.location.pathname !== '/login' && window.location.pathname !== '/signup') {
                     window.location.href = '/login?sessionExpired=true';
                }
            }
            const errorMessage = error.response?.data?.python_error ||
                                 error.response?.data?.details || // Prefer details if available for MalformedJSON
                                 error.response?.data?.error ||
                                 error.response?.data?.message ||
                                 error.message ||
                                 'An unknown API error occurred';
            console.error("API Error:", errorMessage, "URL:", error.config?.url, "Status:", error.response?.status);
            const customError = new Error(errorMessage);
            customError.response = error.response; // Attach full response to the error
            return Promise.reject(customError);
        }
    );
};

applyInterceptors(api);
applyInterceptors(longRunningApi);

const PROXY_PATH = `/external-ai-tools`;

// --- Authentication ---
export const signupUser = (userData) => api.post('/auth/signup', userData).then(res => res.data);
export const signinUser = (userData) => api.post('/auth/signin', userData).then(res => res.data);
export const saveApiKeys = (keyData) => api.post('/auth/keys', keyData).then(res => res.data);

// --- Chat & History ---
export const sendMessage = (messageData) => api.post('/chat/message', messageData).then(res => res.data);
export const saveChatHistory = (historyData) => api.post('/history/save', historyData).then(res => res.data);
export const getChatSessions = () => api.get('/history/sessions').then(res => res.data);
export const getSessionDetails = (sessionId) => api.get(`/history/session/${sessionId}`).then(res => res.data);
export const deleteChatSession = (sessionId) => api.delete(`/history/session/${sessionId}`).then(res => res.data);

// --- RAG File Management (Proxied) ---
export const uploadFile = (formData) => api.post(`${PROXY_PATH}/upload`, formData).then(res => res.data);
export const getUserFiles = () => api.get(`${PROXY_PATH}/files`).then(res => res.data);
export const renameUserFile = (serverFilename, newOriginalName) => api.patch(`${PROXY_PATH}/files/${serverFilename}`, { newOriginalName }).then(res => res.data);
export const deleteUserFile = (serverFilename) => api.delete(`${PROXY_PATH}/files/${serverFilename}`).then(res => res.data);

// --- Document Analysis (Proxied) ---
export const analyzeDocument = (analysisData) => api.post(`${PROXY_PATH}/analyze_document`, analysisData).then(res => res.data);

// --- Academic Search Tools (Proxied) ---
// MODIFIED: searchCoreApi now takes a single params object
export const searchCoreApi = (params) => api.post(`${PROXY_PATH}/search/core`, params).then(res => res.data);
export const searchCombinedAcademic = (params) => api.post(`${PROXY_PATH}/search/combined`, params).then(res => res.data);

// --- Content Creation Tools (Proxied) ---
export const createPresentationFromMarkdown = (markdownContent, filename) => {
    return api.post(`${PROXY_PATH}/create/ppt?filename=${encodeURIComponent(filename)}`, markdownContent, { headers: { 'Content-Type': 'text/markdown' } }).then(res => res.data);
};
// MODIFIED: createDocumentFromMarkdown now takes a single payload object
export const createDocumentFromMarkdown = (payload) => api.post(`${PROXY_PATH}/create/doc`, payload).then(res => res.data);

// --- OCR Tools (Proxied) ---
export const ocrPdfWithTesseract = (pdfFile) => {
    const formData = new FormData();
    formData.append('pdf_file', pdfFile);
    return api.post(`${PROXY_PATH}/ocr/tesseract`, formData).then(res => res.data);
};
export const ocrPdfWithNougat = (pdfFile) => {
    const formData = new FormData();
    formData.append('pdf_file', pdfFile);
    return api.post(`${PROXY_PATH}/ocr/nougat`, formData).then(res => res.data);
};

// --- Video Processing Tool (Proxied, Long-Running) ---
export const processVideo = (videoFile, options = {}) => {
    const formData = new FormData();
    formData.append('video_file', videoFile);
    if (options.ollama_model) {
        formData.append('ollama_model', options.ollama_model);
    }
    return longRunningApi.post(`${PROXY_PATH}/process/video`, formData).then(res => res.data);
};

// --- Web Resource Download Tools (Proxied) ---
// MODIFIED: downloadWebPdfs now takes a single params object
export const downloadWebPdfs = (params) => api.post(`${PROXY_PATH}/download/web_pdfs`, params).then(res => res.data);
// MODIFIED: downloadYouTubeMedia now takes a single params object
export const downloadYouTubeMedia = (params) => api.post(`${PROXY_PATH}/download/youtube`, params).then(res => res.data);

// --- File Download Helper ---
export const getProxiedFileDownloadUrl = (relativePathFromServer) => {
    if (!relativePathFromServer || typeof relativePathFromServer !== 'string') {
        console.warn("getProxiedFileDownloadUrl received invalid path:", relativePathFromServer);
        return "#";
    }
    const cleanRelativePath = relativePathFromServer.startsWith('/')
        ? relativePathFromServer.substring(1)
        : relativePathFromServer;
    return `${API_BASE_URL}${PROXY_PATH}/files/download-tool-output/${cleanRelativePath}`;
};

export default api;