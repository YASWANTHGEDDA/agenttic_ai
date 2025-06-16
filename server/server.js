const express = require('express');
const cors = require('cors');
const path = require('path');
const { getLocalIPs } = require('./utils/networkUtils'); // Ensure this utility exists
const fs = require('fs');
const axios = require('axios');
// const os = require('os'); // os module was imported but not used directly, can be removed if not needed elsewhere
const mongoose = require('mongoose');
require('dotenv').config();
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

const connectDB = require('./config/db'); // Ensure this path is correct
const { performAssetCleanup } = require('./utils/assetCleanup'); // Ensure this path is correct

// --- Route Imports ---
const networkRoutes = require('./routes/network');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat'); // Assuming chat.js now handles history
const uploadRoutes = require('./routes/upload');
const filesRoutes = require('./routes/files');
const syllabusRoutes = require('./routes/syllabus');
const analysisRoutes = require('./routes/analysis');
const externalAiToolsRoutes = require('./routes/externalAiTools'); // For Python tools
const historyRoutes = require('./routes/history');

const DEFAULT_PORT = process.env.PORT || 5003; // Use PORT from .env or default to 5003
const DEFAULT_MONGO_URI = 'mongodb://localhost:27017/chatbotGeminiDB';
const DEFAULT_PYTHON_SERVICE_URL = 'http://localhost:5001'; // Default for Python service

let port = DEFAULT_PORT; // Will be parsed later
let mongoUri = process.env.MONGO_URI || '';
let pythonServiceUrl = process.env.PYTHON_AI_CORE_SERVICE_URL || '';
// Global API keys at server startup are removed, assuming per-user/per-request handling

const app = express();

// --- Middleware ---
app.use(cors()); // Enable CORS for all routes
app.use(express.json({ limit: '50mb' })); // For parsing application/json
app.use(express.urlencoded({ limit: '50mb', extended: true })); // For parsing application/x-www-form-urlencoded

// --- Base Route ---
app.get('/', (req, res) => res.send('Chatbot Backend API (FusedChatbot Server) is running...'));

// --- API Routes ---
app.use('/api/network', networkRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes); // Includes chat history operations
app.use('/api/upload', uploadRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/syllabus', syllabusRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/external-ai-tools', externalAiToolsRoutes); // Mount the external AI tools router
app.use('/api/history', historyRoutes);

// --- Global Error Handler ---
// Must be the last piece of middleware
app.use((err, req, res, next) => {
    console.error("Unhandled Error in Express:", err.stack || err);
    const statusCode = err.status || err.statusCode || 500;
    let message = err.message || 'An internal server error occurred.';

    // Avoid sending detailed error messages in production for 500 errors
    if (process.env.NODE_ENV === 'production' && statusCode === 500) {
        message = 'An internal server error occurred.';
    }

    // Send JSON response for API routes
    if (req.originalUrl.startsWith('/api/')) {
         return res.status(statusCode).json({ message: message, error: err.name || "Error" });
    }
    // Fallback for non-API routes (though you might not have many)
    res.status(statusCode).send(message);
});

let serverInstance; // To store the HTTP server instance

// --- Graceful Shutdown ---
const gracefulShutdown = async (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    readline.close(); // Close the readline interface if it's open
    try {
        if (serverInstance) {
            serverInstance.close(async () => {
                console.log('HTTP server closed.');
                try {
                    await mongoose.connection.close();
                    console.log('MongoDB connection closed.');
                } catch (dbCloseError) {
                    console.error("Error closing MongoDB connection:", dbCloseError);
                }
                process.exit(0);
            });
        } else { // If server didn't start, just close DB and exit
             try {
                 await mongoose.connection.close();
                 console.log('MongoDB connection closed (server not started).');
             } catch (dbCloseError) {
                 console.error("Error closing MongoDB connection (server not started):", dbCloseError);
             }
            process.exit(0);
        }
        // Force exit if shutdown takes too long
        setTimeout(() => {
            console.error('Graceful shutdown timed out, forcing exit.');
            process.exit(1);
        }, 10000); // 10 seconds timeout
    } catch (shutdownError) {
        console.error("Error during graceful shutdown initiation:", shutdownError);
        process.exit(1);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT')); // For CTRL+C

// --- Health Check for Python Service ---
async function checkPythonService(url) {
    if (!url || !url.startsWith('http')) { // Basic URL validation
        console.warn(`! Python AI Core service URL is invalid or not configured ('${url}'). Cannot check health.`);
        return false;
    }
    console.log(`\nChecking Python AI Core service health at ${url}...`);
    try {
        const response = await axios.get(`${url}/health`, { timeout: 7000 });
        if (response.status === 200 && response.data?.status === 'ok') {
            console.log('✓ Python AI Core service is available and healthy.');
            if(response.data.embedding_model_name) console.log(`  Embedding Model: ${response.data.embedding_model_name}`);
            if(response.data.default_index_loaded !== undefined) console.log(`  Default Index Loaded: ${response.data.default_index_loaded}`);
            // You can add more specific checks based on your Python /health response
            if (response.data.message) console.log(`  Python Health Message: ${response.data.message}`);
            return true;
        } else {
             console.warn(`! Python AI Core service responded but is not healthy: Status ${response.status}`);
             if(response.data) console.warn(`  Response Data: ${JSON.stringify(response.data)}`);
             return false;
        }
    } catch (error) {
        console.warn('! Python AI Core service is not reachable or an error occurred during health check.');
        if (error.code) console.warn(`  Error Code: ${error.code}`);
        if (error.message) console.warn(`  Error Message: ${error.message}`);
        if (error.code === 'ECONNREFUSED') {
             console.warn(`  Connection refused. Ensure the Python service (ai_core_service/app.py) is running on the configured port.`);
        }
        console.warn('  Features dependent on this service may be impaired.');
        return false;
    }
}

// --- Ensure Server Directories ---
async function ensureServerDirectories() {
    const dirs = [
        path.join(__dirname, 'assets'),          // For general static assets, if any (e.g. RAG source docs served by Node)
        path.join(__dirname, 'backup_assets'),   // For backups generated by Node
        path.join(__dirname, 'uploads_node_temp') // For temporary file uploads handled by Multer in Node
    ];
    console.log("\nEnsuring essential Node.js server directories exist...");
    try {
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                await fs.promises.mkdir(dir, { recursive: true });
                console.log(`  Created directory: ${dir}`);
            }
        }
        console.log("✓ Essential Node.js server directories checked/created.");
    } catch (error) {
        console.error('!!! Error creating Node.js server directories:', error);
        throw error; // Critical error, stop server start
    }
}

// --- Interactive Question for Configuration ---
function askQuestion(query) {
    return new Promise(resolve => readline.question(query, resolve));
}

// --- Main Configuration and Startup Logic ---
async function configureAndStart() {
    console.log("--- Starting Server Configuration ---");

    // API Key Handling: Removed global GEMINI_API_KEY check.
    // API keys are now expected to be handled per user or per request,
    // likely fetched from DB and passed to Python service if needed.
    console.log("✓ API keys will be managed on a per-user/per-request basis.");

    if (!mongoUri) {
        console.warn("\nMongoDB URI not found in .env (MONGO_URI).");
        const answer = await askQuestion(`Enter MongoDB URI or press Enter for default (${DEFAULT_MONGO_URI}): `);
        mongoUri = answer.trim() || DEFAULT_MONGO_URI;
    }
    console.log(`Using MongoDB URI: ${mongoUri}`);
    process.env.MONGO_URI = mongoUri; // Ensure it's in process.env for connectDB

    if (!pythonServiceUrl) {
        console.warn("\nPython AI Core Service URL not found in .env (PYTHON_AI_CORE_SERVICE_URL).");
        const answer = await askQuestion(`Enter Python AI Core Service URL or press Enter for default (${DEFAULT_PYTHON_SERVICE_URL}): `);
        pythonServiceUrl = answer.trim() || DEFAULT_PYTHON_SERVICE_URL;
    }
    console.log(`Using Python AI Core Service URL: ${pythonServiceUrl}`);
    process.env.PYTHON_AI_CORE_SERVICE_URL = pythonServiceUrl; // For route handlers

    const currentPort = parseInt(port, 10); // Use the port variable defined at the top
    console.log(`Node.js server will attempt to listen on port: ${currentPort}`);

    readline.close();
    console.log("--- Configuration Complete ---");

    await startServer(currentPort); // Pass the configured port to startServer
}

async function startServer(PORT_TO_USE) { // Accept port as an argument
    console.log("\n--- Starting Server Initialization ---");
    try {
        await ensureServerDirectories();
        await connectDB(mongoUri); // Uses MONGO_URI from process.env
        await performAssetCleanup();
        await checkPythonService(pythonServiceUrl); // Uses PYTHON_AI_CORE_SERVICE_URL from process.env

        serverInstance = app.listen(PORT_TO_USE, '0.0.0.0', () => {
            const nodeEnv = process.env.NODE_ENV || 'development';
            console.log(`\n======================================================================`);
            console.log(`🚀 Node.js Server (FusedChatbot Backend) is running!`);
            console.log(`   Mode: ${nodeEnv}`);
            console.log(`   Port: ${PORT_TO_USE}`);
            const localIPs = getLocalIPs();
            console.log(`   Listening on: http://localhost:${PORT_TO_USE}`);
            localIPs.forEach(ip => {
                // Filter out loopback and link-local if not desired
                if (ip !== '127.0.0.1' && ip !== 'localhost' && !ip.startsWith('169.254')) {
                    console.log(`                 http://${ip}:${PORT_TO_USE} (on your network)`);
                }
            });
            console.log(`   MongoDB Connected To: ${mongoUri.substring(0, mongoUri.lastIndexOf('/'))}/...`);
            console.log(`   Python AI Core Service Expected At: ${pythonServiceUrl}`);
            console.log(`======================================================================\n`);
        });

    } catch (error) {
        console.error("\n!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.error("!!! FAILED TO START NODE.JS SERVER                           !!!");
        if (error.code === 'EADDRINUSE') {
            console.error(`!!! Port ${PORT_TO_USE} is already in use. ` +
                          `Please check if another application is using this port, ` +
                          `or change the PORT in your server/.env file.`);
        } else {
            console.error(`!!! Error: ${error.message}`);
            console.error(error.stack); // Print full stack for other errors
        }
        console.error("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
        process.exit(1);
    }
}

// --- Execute ---
configureAndStart();