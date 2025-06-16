// server/models/SystemSetting.js
const mongoose = require('mongoose');
// const { encrypt, decrypt } = require('../services/encryptionService'); // Import if you implement encryption

const SystemSettingSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: 'globalAdminSettings', // Use a fixed _id for easy retrieval of this single document
    },
    defaultApiKeys: {
        gemini: { type: String, select: false }, // Store encrypted, select: false
        groq: { type: String, select: false },   // Store encrypted, select: false
        // Add other providers here if needed
    },
    defaultOllamaUrl: {
        type: String,
        trim: true,
    },
    // You can add other system-wide configurations here
    // e.g., default RAG k-value, default LLM provider for new users, etc.
    updatedBy: { // To track who last updated these settings
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    }
}, { timestamps: true });

// Example pre-save hook if you were encrypting:
// SystemSettingSchema.pre('save', async function(next) {
//     if (this.isModified('defaultApiKeys.gemini') && this.defaultApiKeys.gemini) {
//         this.defaultApiKeys.gemini = encrypt(this.defaultApiKeys.gemini);
//     }
//     if (this.isModified('defaultApiKeys.groq') && this.defaultApiKeys.groq) {
//         this.defaultApiKeys.groq = encrypt(this.defaultApiKeys.groq);
//     }
//     next();
// });

const SystemSetting = mongoose.model('SystemSetting', SystemSettingSchema);

module.exports = SystemSetting;