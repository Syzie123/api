const express = require('express');
const router = express.Router();
const { collections, db } = require('../config/firebase');

/**
 * @route   POST /api/stories/upload
 * @desc    Upload a new story
 * @access  Private
 */
router.post('/upload', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { mediaUrl, isVideo } = req.body;
    
    // Validate input
    if (!mediaUrl) {
      return res.status(400).json({ error: true, message: 'Media URL is required' });
    }
    
    // Get user data
    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Create story document
    const storyRef = collections.stories.doc();
    const createdAt = new Date();
    
    // Stories expire after 24 hours
    const expiresAt = new Date(createdAt);
    expiresAt.setHours(expiresAt.getHours() + 24);
    
    const storyData = {
      storyId: storyRef.id,
      userId: uid,
      username: userData.username,
      userProfilePic: userData.profilePic,
      mediaUrl,
      isVideo: Boolean(isVideo),
      viewers: [],
      createdAt,
      expiresAt
    };
    
    await storyRef.set(storyData);
    
    res.status(201).json({
      error: false,
      message: 'Story uploaded successfully',
      data: {
        storyId: storyRef.id
      }
    });
  } catch (error) {
    console.error('Error uploading story:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to upload story'
    });
  }
});

/**
 * @route   GET /api/stories/feed
 * @desc    Get stories for user's feed
 * @access  Private
 */
router.get('/feed', async (req, res) => {
  try {
    const uid = req.user.uid;
    
    // Get user data to get following list
    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Include user's own stories and stories from users they follow
    const userIds = [...userData.following, uid];
    
    // Get current time
    const now = new Date();
    
    // Get stories that haven't expired yet
    const storiesSnapshot = await collections.stories
      .where('userId', 'in', userIds)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt')
      .get();
    
    // Group stories by user
    const storiesByUser = {};
    
    storiesSnapshot.forEach(doc => {
      const storyData = doc.data();
      const userId = storyData.userId;
      
      if (!storiesByUser[userId]) {
        storiesByUser[userId] = {
          userId: userId,
          username: storyData.username,
          profilePic: storyData.userProfilePic,
          hasStory: true,
          isViewed: (storyData.viewers || []).includes(uid),
          items: []
        };
      }
      
      // Check if this specific story is viewed by the current user
      const isStoryViewed = (storyData.viewers || []).includes(uid);
      
      // If any story is not viewed, mark the user's stories as not viewed
      if (!isStoryViewed) {
        storiesByUser[userId].isViewed = false;
      }
      
      storiesByUser[userId].items.push({
        id: storyData.storyId,
        mediaUrl: storyData.mediaUrl,
        isVideo: storyData.isVideo,
        createdAt: storyData.createdAt
      });
    });
    
    // Convert to array and sort by latest story
    const storiesFeed = Object.values(storiesByUser).sort((a, b) => {
      // Sort viewed stories to the end
      if (a.isViewed !== b.isViewed) {
        return a.isViewed ? 1 : -1;
      }
      
      // For stories with same viewed status, sort by latest
      const aLatest = Math.max(...a.items.map(s => s.createdAt.toMillis()));
      const bLatest = Math.max(...b.items.map(s => s.createdAt.toMillis()));
      return bLatest - aLatest;
    });
    
    res.status(200).json({
      success: true,
      data: storiesFeed
    });
  } catch (error) {
    console.error('Error getting stories feed:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get stories feed'
    });
  }
});

/**
 * @route   GET /api/stories/user/:userId
 * @desc    Get stories by user ID
 * @access  Private
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const currentUserId = req.user.uid;
    const { userId } = req.params;
    
    // Check if user exists
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Get current time
    const now = new Date();
    
    // Get stories that haven't expired yet
    const storiesSnapshot = await collections.stories
      .where('userId', '==', userId)
      .where('expiresAt', '>', now)
      .orderBy('expiresAt')
      .orderBy('createdAt')
      .get();
    
    const stories = [];
    
    storiesSnapshot.forEach(doc => {
      const storyData = doc.data();
      stories.push({
        id: storyData.storyId,
        mediaUrl: storyData.mediaUrl,
        isVideo: storyData.isVideo,
        createdAt: storyData.createdAt,
        isViewed: (storyData.viewers || []).includes(currentUserId)
      });
    });
    
    res.status(200).json({
      success: true,
      data: stories
    });
  } catch (error) {
    console.error('Error getting user stories:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get user stories'
    });
  }
});

/**
 * @route   POST /api/stories/:storyId/view
 * @desc    Mark a story as viewed
 * @access  Private
 */
router.post('/:storyId/view', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { storyId } = req.params;
    
    // Get story document
    const storyDoc = await collections.stories.doc(storyId).get();
    
    if (!storyDoc.exists) {
      return res.status(404).json({ error: true, message: 'Story not found' });
    }
    
    const storyData = storyDoc.data();
    
    // Check if user already viewed the story
    if (storyData.viewers.includes(uid)) {
      return res.status(200).json({
        error: false,
        message: 'Story already viewed'
      });
    }
    
    // Add user to viewers array
    await collections.stories.doc(storyId).update({
      viewers: [...storyData.viewers, uid]
    });
    
    res.status(200).json({
      error: false,
      message: 'Story marked as viewed'
    });
  } catch (error) {
    console.error('Error marking story as viewed:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to mark story as viewed'
    });
  }
});

/**
 * @route   DELETE /api/stories/:storyId
 * @desc    Delete a story
 * @access  Private
 */
router.delete('/:storyId', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { storyId } = req.params;
    
    // Get story document
    const storyDoc = await collections.stories.doc(storyId).get();
    
    if (!storyDoc.exists) {
      return res.status(404).json({ error: true, message: 'Story not found' });
    }
    
    const storyData = storyDoc.data();
    
    // Check if user is the story owner
    if (storyData.userId !== uid) {
      return res.status(403).json({ error: true, message: 'Not authorized to delete this story' });
    }
    
    // Delete story
    await collections.stories.doc(storyId).delete();
    
    res.status(200).json({
      error: false,
      message: 'Story deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting story:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to delete story'
    });
  }
});

module.exports = router; 