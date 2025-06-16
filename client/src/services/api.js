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