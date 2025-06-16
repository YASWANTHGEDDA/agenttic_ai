const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
    userId: {
        type: String,
        required: true,
        index: true // Add index for faster queries
    },
    sessionId: {
        type: String,
        required: true,
        index: true // Add index for faster queries
    },
    role: {
        type: String,
        required: true,
        enum: ['user', 'assistant', 'system']
    },
    content: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
    metadata: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    }
});

// Create compound index for efficient querying of messages by session
ChatMessageSchema.index({ sessionId: 1, timestamp: 1 });

// Create compound index for efficient querying of messages by user and session
ChatMessageSchema.index({ userId: 1, sessionId: 1 });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema); 