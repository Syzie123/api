const express = require('express');
const router = express.Router();
const { storage } = require('../config/firebase');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

/**
 * @route   POST /api/uploads/image
 * @desc    Upload an image
 * @access  Private
 */
router.post('/image', upload.single('image'), async (req, res) => {
  try {
    const uid = req.user.uid;
    
    if (!req.file) {
      return res.status(400).json({ error: true, message: 'No file uploaded' });
    }
    
    // Generate a unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${uid}_${uuidv4()}${fileExtension}`;
    const filePath = `uploads/images/${fileName}`;
    
    // Create a temporary file
    const tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, req.file.buffer);
    
    // Upload to Firebase Storage
    await storage.bucket().upload(tempFilePath, {
      destination: filePath,
      metadata: {
        contentType: req.file.mimetype,
      },
    });
    
    // Delete the temporary file
    fs.unlinkSync(tempFilePath);
    
    // Get the public URL
    const file = storage.bucket().file(filePath);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '01-01-2500', // Far future expiration
    });
    
    res.status(200).json({
      success: true,
      data: {
        url,
        fileName,
        contentType: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error('Error uploading image:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to upload image',
    });
  }
});

/**
 * @route   POST /api/uploads/video
 * @desc    Upload a video
 * @access  Private
 */
router.post('/video', upload.single('video'), async (req, res) => {
  try {
    const uid = req.user.uid;
    
    if (!req.file) {
      return res.status(400).json({ error: true, message: 'No file uploaded' });
    }
    
    // Generate a unique filename
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `${uid}_${uuidv4()}${fileExtension}`;
    const filePath = `uploads/videos/${fileName}`;
    
    // Create a temporary file
    const tempFilePath = path.join(os.tmpdir(), fileName);
    fs.writeFileSync(tempFilePath, req.file.buffer);
    
    // Upload to Firebase Storage
    await storage.bucket().upload(tempFilePath, {
      destination: filePath,
      metadata: {
        contentType: req.file.mimetype,
      },
    });
    
    // Delete the temporary file
    fs.unlinkSync(tempFilePath);
    
    // Get the public URL
    const file = storage.bucket().file(filePath);
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '01-01-2500', // Far future expiration
    });
    
    res.status(200).json({
      success: true,
      data: {
        url,
        fileName,
        contentType: req.file.mimetype,
      },
    });
  } catch (error) {
    console.error('Error uploading video:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to upload video',
    });
  }
});

/**
 * @route   POST /api/uploads/placeholder
 * @desc    Generate a placeholder image URL
 * @access  Private
 */
router.post('/placeholder', async (req, res) => {
  try {
    const { width = 500, height = 500, text = 'Placeholder' } = req.body;
    
    // Generate a placeholder URL from a service like placeholder.com
    const url = `https://via.placeholder.com/${width}x${height}?text=${encodeURIComponent(text)}`;
    
    res.status(200).json({
      success: true,
      data: {
        url,
        isPlaceholder: true,
      },
    });
  } catch (error) {
    console.error('Error generating placeholder:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to generate placeholder',
    });
  }
});

module.exports = router; 