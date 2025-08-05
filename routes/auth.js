const express = require('express');
const router = express.Router();
const { auth, collections, db } = require('../config/firebase');
const { validateFirebaseToken } = require('../middleware/auth');

/**
 * @route   POST /api/auth/signup
 * @desc    Register a new user
 * @access  Public
 */
router.post('/signup', async (req, res) => {
  try {
    const { email, password, name, username, bio, dateOfBirth } = req.body;
    
    // Validate input
    if (!email || !password || !name || !username) {
      return res.status(400).json({ error: true, message: 'Missing required fields' });
    }
    
    // Check if username already exists
    const usernameQuery = await collections.users.where('username', '==', username).get();
    if (!usernameQuery.empty) {
      return res.status(400).json({ error: true, message: 'Username already taken' });
    }
    
    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });
    
    // Create user document in Firestore
    const userData = {
      uid: userRecord.uid,
      email,
      name,
      username,
      bio: bio || '',
      profilePic: '',
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      followers: [],
      following: [],
      posts: [],
      isVerified: false,
      createdAt: new Date(),
    };
    
    await collections.users.doc(userRecord.uid).set(userData);
    
    // Create custom token for client auth
    const token = await auth.createCustomToken(userRecord.uid);
    
    res.status(201).json({
      error: false,
      message: 'User created successfully',
      data: {
        uid: userRecord.uid,
        token
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to create user'
    });
  }
});

/**
 * @route   POST /api/auth/verify-token
 * @desc    Verify Firebase ID token
 * @access  Public
 */
router.post('/verify-token', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: true, message: 'No token provided' });
    }
    
    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Get user data from Firestore
    const userDoc = await collections.users.doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    res.status(200).json({
      error: false,
      message: 'Token verified successfully',
      data: {
        user: userDoc.data()
      }
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(401).json({
      error: true,
      message: 'Invalid token'
    });
  }
});

/**
 * @route   POST /api/auth/google
 * @desc    Handle Google authentication
 * @access  Public
 */
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    
    if (!idToken) {
      return res.status(400).json({ error: true, message: 'No token provided' });
    }
    
    // Verify the Google ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Check if user exists in Firestore
    const userDoc = await collections.users.doc(decodedToken.uid).get();
    
    if (!userDoc.exists) {
      // Create new user in Firestore
      const userData = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        name: decodedToken.name || '',
        username: decodedToken.email.split('@')[0],
        bio: '',
        profilePic: decodedToken.picture || '',
        dateOfBirth: null,
        followers: [],
        following: [],
        posts: [],
        isVerified: false,
        createdAt: new Date(),
      };
      
      await collections.users.doc(decodedToken.uid).set(userData);
    }
    
    // Create custom token for client auth
    const token = await auth.createCustomToken(decodedToken.uid);
    
    res.status(200).json({
      error: false,
      message: 'Google authentication successful',
      data: {
        uid: decodedToken.uid,
        token
      }
    });
  } catch (error) {
    console.error('Error with Google authentication:', error);
    res.status(401).json({
      error: true,
      message: 'Invalid Google token'
    });
  }
});

/**
 * @route   GET /api/auth/me
 * @desc    Get current user data
 * @access  Private
 */
router.get('/me', validateFirebaseToken, async (req, res) => {
  try {
    const uid = req.user.uid;
    
    // Get user data from Firestore
    const userDoc = await collections.users.doc(uid).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    res.status(200).json({
      error: false,
      data: {
        user: userDoc.data()
      }
    });
  } catch (error) {
    console.error('Error getting user data:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get user data'
    });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Send password reset email
 * @access  Public
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: true, message: 'Email is required' });
    }
    
    await auth.generatePasswordResetLink(email);
    
    res.status(200).json({
      error: false,
      message: 'Password reset email sent'
    });
  } catch (error) {
    console.error('Error sending password reset:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to send password reset email'
    });
  }
});

module.exports = router; 