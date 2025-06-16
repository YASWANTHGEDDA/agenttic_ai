// server/routes/auth.js
const express = require('express');
const { v4: uuidv4 } = require('uuid'); // For generating session IDs
const User = require('../models/User'); // Mongoose User model
const { encrypt } = require('../services/encryptionService'); // --- MODIFICATION: Import encryption service
const { tempAuth } = require('../middleware/authMiddleware'); // --- MODIFICATION: Import auth middleware
require('dotenv').config();

const router = express.Router();

// --- @route   POST /api/auth/signup ---
// --- @desc    Register a new user ---
// --- @access  Public ---
router.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please provide username and password' });
  }
  if (password.length < 6) {
     return res.status(400).json({ message: 'Password must be at least 6 characters long' });
  }

  try {
    // *** THIS IS THE CORRECT VALIDATION LOGIC ***
    // It checks if a user with the given username already exists.
    const existingUser = await User.findOne({ username });
    if (existingUser) {
      // It correctly returns a 400 error if the user exists.
      return res.status(400).json({ message: 'Username already exists' });
    }

    const newUser = new User({ username, password });
    await newUser.save();

    const sessionId = uuidv4();

    res.status(201).json({
      _id: newUser._id,
      username: newUser.username,
      sessionId: sessionId,
      // --- MODIFICATION START ---
      hasProvidedApiKeys: newUser.hasProvidedApiKeys, // Will be false by default
      // --- MODIFICATION END ---
      message: 'User registered successfully',
    });

  } catch (error) {
    console.error('Signup Error:', error);
    if (error.code === 11000) {
        return res.status(400).json({ message: 'Username already exists.' });
    }
    res.status(500).json({ message: 'Server error during signup' });
  }
});

// --- @route   POST /api/auth/signin ---
// --- @desc    Authenticate user (using custom static method) ---
// --- @access  Public ---
router.post('/signin', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Please provide username and password' });
  }

  try {
    const user = await User.findByCredentials(username, password);

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const sessionId = uuidv4();

    res.status(200).json({
      _id: user._id,
      username: user.username,
      sessionId: sessionId,
      // --- MODIFICATION START ---
      hasProvidedApiKeys: user.hasProvidedApiKeys,
      // --- MODIFICATION END ---
      message: 'Login successful',
    });

  } catch (error) {
    console.error('Signin Error:', error);
    if (error.message === "Password field not available for comparison.") {
        console.error("Developer Error: Password field was not selected before comparison attempt.");
        return res.status(500).json({ message: 'Internal server configuration error during signin.' });
    }
    res.status(500).json({ message: 'Server error during signin' });
  }
});

// --- @route   POST /api/auth/keys ---
// --- @desc    Save user's API keys ---
// --- @access  Private ---
// --- MODIFICATION START ---
router.post('/keys', tempAuth, async (req, res) => {
  const { geminiApiKey, grokApiKey } = req.body;
  const userId = req.user.id; // Assuming authMiddleware adds user object with id to req

  if (!geminiApiKey || !grokApiKey) {
    return res.status(400).json({ message: 'Please provide both Gemini and Grok API keys.' });
  }

  try {
    const encryptedGeminiKey = encrypt(geminiApiKey);
    const encryptedGrokKey = encrypt(grokApiKey);

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    user.geminiApiKey = encryptedGeminiKey;
    user.grokApiKey = encryptedGrokKey;
    user.hasProvidedApiKeys = true;

    await user.save();

    res.status(200).json({ message: 'API keys saved successfully.' });

  } catch (error) {
    console.error('Error saving API keys:', error);
    res.status(500).json({ message: 'Server error while saving API keys.' });
  }
});
// --- MODIFICATION END ---

module.exports = router;