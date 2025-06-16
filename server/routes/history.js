// server/routes/history.js
const express = require('express');
const router = express.Router();
const ChatHistory = require('../models/ChatHistory'); // Assuming this is your Mongoose model for chat sessions/history entries
const ChatMessage = require('../models/ChatMessage'); // Assuming you have a separate model for individual messages

// Import your authentication middleware
// Ensure authMiddleware.js exports tempAuth correctly (e.g., module.exports = { tempAuth }; or exports.tempAuth = ...)
const { tempAuth } = require('../middleware/authMiddleware');

// @route   GET api/history/sessions
// @desc    Get all chat session metadata for the logged-in user
// @access  Private
router.get('/sessions', tempAuth, async (req, res) => {
    try {
        const userId = req.user.id; // From tempAuth middleware
        
        // Find sessions for the user, sort by most recently updated
        // Adjust fields selected as needed by your frontend
        const sessions = await ChatHistory.find({ userId: userId })
            .sort({ updatedAt: -1 }) // Show most recent first
            .select('sessionId title firstMessagePreview createdAt updatedAt lastMessageTimestamp modelProvider'); // Select relevant fields

        if (!sessions) {
            return res.status(200).json([]); // Return empty array if no sessions
        }
        res.json(sessions);
    } catch (error) {
        console.error('Error fetching chat sessions:', error.message);
        res.status(500).json({ message: 'Server error while fetching chat sessions.' });
    }
});

// @route   GET api/history/session/:sessionId
// @desc    Get all messages for a specific chat session
// @access  Private
router.get('/session/:sessionId', tempAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { sessionId } = req.params;

        // First, verify the user owns the session (optional, but good practice)
        const sessionInfo = await ChatHistory.findOne({ sessionId: sessionId, userId: userId });
        if (!sessionInfo) {
            return res.status(404).json({ message: 'Session not found or access denied.' });
        }

        // Fetch all messages for that session, sorted by timestamp
        const messages = await ChatMessage.find({ sessionId: sessionId, userId: userId })
            .sort({ timestamp: 1 }); // Sort messages chronologically

        res.json({
            sessionId: sessionInfo.sessionId,
            title: sessionInfo.title,
            // other session metadata you want to return
            messages: messages 
        });

    } catch (error) {
        console.error('Error fetching session details:', error.message);
        res.status(500).json({ message: 'Server error while fetching session details.' });
    }
});


// @route   DELETE api/history/session/:sessionId
// @desc    Delete a specific chat session and its associated messages for the logged-in user
// @access  Private
router.delete('/session/:sessionId', tempAuth, async (req, res) => {
    const userId = req.user.id; // From the token validated by tempAuth
    const { sessionId } = req.params;
    
    console.log(`Attempting to delete session: ${sessionId} for user: ${userId}`);

    if (!sessionId) {
        return res.status(400).json({ message: 'Session ID is required.' });
    }

    try {
        // 1. Delete the ChatHistory/ChatSession document
        const deletedSessionInfo = await ChatHistory.findOneAndDelete({
            sessionId: sessionId,
            userId: userId  // Ensure the user owns this session
        });

        if (!deletedSessionInfo) {
            // This means either the session didn't exist or it didn't belong to this user
            console.warn(`Session not found or user mismatch for deletion: SessionID=${sessionId}, User=${userId}`);
            return res.status(404).json({ message: 'Chat session not found or you do not have permission to delete it.' });
        }

        // 2. Delete all associated ChatMessage documents for that session and user
        // This is crucial to clean up individual messages if they are in a separate collection.
        // If your ChatHistory model stores messages as an array within itself, this step is not needed.
        if (ChatMessage) { // Only if ChatMessage model is defined and used
            const messageDeletionResult = await ChatMessage.deleteMany({
                sessionId: sessionId, // Use the sessionId from the deleted session
                userId: userId      // Ensure messages also belong to the user
            });
            console.log(`Deleted ${messageDeletionResult.deletedCount} associated messages for session ${sessionId}.`);
        } else {
            console.log("ChatMessage model not imported or used; assuming messages are part of ChatHistory document or handled elsewhere.");
        }
        
        console.log(`Successfully deleted chat session ${sessionId} and its messages for user ${userId}.`);
        res.json({ status: 'success', message: 'Chat session and associated messages deleted successfully.', deletedSessionId: sessionId });

    } catch (error) {
        console.error('Error deleting chat session:', error);
        res.status(500).json({ message: 'Server error while deleting chat session.', error: error.message });
    }
});

module.exports = router;