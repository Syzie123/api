const express = require('express');
const router = express.Router();
const { collections, storage, db } = require('../config/firebase');
const { sendNotification } = require('../utils/notifications');

/**
 * @route   GET /api/users/:username
 * @desc    Get user by username or ID
 * @access  Private
 */
router.get('/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    // First try to get user by ID (if username is actually a user ID)
    try {
      const userDoc = await collections.users.doc(username).get();
      if (userDoc.exists) {
        const userData = userDoc.data();
        
        // Remove sensitive information
        delete userData.email;
        
        return res.status(200).json({
          success: true,
          data: userData
        });
      }
    } catch (err) {
      console.log('Not a valid user ID, trying username lookup');
    }
    
    // If not found by ID, try by username
    const userQuery = await collections.users
      .where('username', '==', username)
      .limit(1)
      .get();
    
    if (userQuery.empty) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userQuery.docs[0].data();
    
    // Remove sensitive information
    delete userData.email;
    
    res.status(200).json({
      success: true,
      data: userData
    });
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get user'
    });
  }
});

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { name, username, bio } = req.body;
    
    // Validate input
    if (!name && !username && !bio) {
      return res.status(400).json({ error: true, message: 'No fields to update' });
    }
    
    // Check if username already exists (if username is being updated)
    if (username) {
      const usernameQuery = await collections.users
        .where('username', '==', username)
        .where('uid', '!=', uid)
        .get();
      
      if (!usernameQuery.empty) {
        return res.status(400).json({ error: true, message: 'Username already taken' });
      }
    }
    
    // Update user document
    const updateData = {};
    if (name) updateData.name = name;
    if (username) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;
    
    await collections.users.doc(uid).update(updateData);
    
    // Get updated user data
    const updatedUserDoc = await collections.users.doc(uid).get();
    
    res.status(200).json({
      error: false,
      message: 'Profile updated successfully',
      data: {
        user: updatedUserDoc.data()
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to update profile'
    });
  }
});

/**
 * @route   POST /api/users/follow/:userId
 * @desc    Follow a user
 * @access  Private
 */
router.post('/follow/:userId', async (req, res) => {
  try {
    const currentUserId = req.user.uid;
    const { userId } = req.params;
    
    // Check if trying to follow self
    if (currentUserId === userId) {
      return res.status(400).json({ error: true, message: 'Cannot follow yourself' });
    }
    
    // Check if target user exists
    const targetUserDoc = await collections.users.doc(userId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    // Get current user data
    const currentUserDoc = await collections.users.doc(currentUserId).get();
    const currentUserData = currentUserDoc.data();
    
    // Check if already following
    if (currentUserData.following.includes(userId)) {
      return res.status(400).json({ error: true, message: 'Already following this user' });
    }
    
    // Transaction to update both users
    await db.runTransaction(async (transaction) => {
      // Update current user's following list
      transaction.update(collections.users.doc(currentUserId), {
        following: [...currentUserData.following, userId]
      });
      
      // Update target user's followers list
      const targetUserData = targetUserDoc.data();
      transaction.update(collections.users.doc(userId), {
        followers: [...targetUserData.followers, currentUserId]
      });
      
      // Create follow record in follows collection
      transaction.set(collections.follows.doc(`${currentUserId}_${userId}`), {
        followerId: currentUserId,
        followingId: userId,
        createdAt: new Date()
      });
    });
    
    // Send notification to target user
    await sendNotification({
      userId,
      type: 'follow',
      actorId: currentUserId,
      actorName: currentUserData.name,
      message: `${currentUserData.name} started following you`,
      data: {
        followerId: currentUserId
      }
    });
    
    res.status(200).json({
      error: false,
      message: 'User followed successfully'
    });
  } catch (error) {
    console.error('Error following user:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to follow user'
    });
  }
});

/**
 * @route   POST /api/users/unfollow/:userId
 * @desc    Unfollow a user
 * @access  Private
 */
router.post('/unfollow/:userId', async (req, res) => {
  try {
    const currentUserId = req.user.uid;
    const { userId } = req.params;
    
    // Check if target user exists
    const targetUserDoc = await collections.users.doc(userId).get();
    if (!targetUserDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    // Get current user data
    const currentUserDoc = await collections.users.doc(currentUserId).get();
    const currentUserData = currentUserDoc.data();
    
    // Check if actually following
    if (!currentUserData.following.includes(userId)) {
      return res.status(400).json({ error: true, message: 'Not following this user' });
    }
    
    // Transaction to update both users
    await db.runTransaction(async (transaction) => {
      // Update current user's following list
      transaction.update(collections.users.doc(currentUserId), {
        following: currentUserData.following.filter(id => id !== userId)
      });
      
      // Update target user's followers list
      const targetUserData = targetUserDoc.data();
      transaction.update(collections.users.doc(userId), {
        followers: targetUserData.followers.filter(id => id !== currentUserId)
      });
      
      // Delete follow record
      transaction.delete(collections.follows.doc(`${currentUserId}_${userId}`));
    });
    
    res.status(200).json({
      error: false,
      message: 'User unfollowed successfully'
    });
  } catch (error) {
    console.error('Error unfollowing user:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to unfollow user'
    });
  }
});

/**
 * @route   GET /api/users/:userId/followers
 * @desc    Get user's followers
 * @access  Private
 */
router.get('/:userId/followers', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, lastId } = req.query;
    
    // Check if user exists
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    let query = collections.follows
      .where('followingId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.follows.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const followsSnapshot = await query.get();
    const followers = [];
    
    // Get user data for each follower
    for (const doc of followsSnapshot.docs) {
      const followData = doc.data();
      const followerDoc = await collections.users.doc(followData.followerId).get();
      
      if (followerDoc.exists) {
        const followerData = followerDoc.data();
        followers.push({
          uid: followerData.uid,
          username: followerData.username,
          name: followerData.name,
          profilePic: followerData.profilePic,
          isVerified: followerData.isVerified
        });
      }
    }
    
    res.status(200).json({
      error: false,
      data: {
        followers,
        lastId: followsSnapshot.docs.length > 0 ? followsSnapshot.docs[followsSnapshot.docs.length - 1].id : null,
        hasMore: followsSnapshot.docs.length >= parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting followers:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get followers'
    });
  }
});

/**
 * @route   GET /api/users/:userId/following
 * @desc    Get users that a user is following
 * @access  Private
 */
router.get('/:userId/following', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, lastId } = req.query;
    
    // Check if user exists
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    let query = collections.follows
      .where('followerId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.follows.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const followsSnapshot = await query.get();
    const following = [];
    
    // Get user data for each followed user
    for (const doc of followsSnapshot.docs) {
      const followData = doc.data();
      const followingDoc = await collections.users.doc(followData.followingId).get();
      
      if (followingDoc.exists) {
        const followingData = followingDoc.data();
        following.push({
          uid: followingData.uid,
          username: followingData.username,
          name: followingData.name,
          profilePic: followingData.profilePic,
          isVerified: followingData.isVerified
        });
      }
    }
    
    res.status(200).json({
      error: false,
      data: {
        following,
        lastId: followsSnapshot.docs.length > 0 ? followsSnapshot.docs[followsSnapshot.docs.length - 1].id : null,
        hasMore: followsSnapshot.docs.length >= parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting following:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get following'
    });
  }
});

/**
 * @route   GET /api/users/search
 * @desc    Search for users by username or name
 * @access  Private
 */
router.get('/search', async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;
    
    if (!query) {
      return res.status(400).json({ error: true, message: 'Search query is required' });
    }
    
    // Search by username (case insensitive)
    const usernameResults = await collections.users
      .where('username', '>=', query.toLowerCase())
      .where('username', '<=', query.toLowerCase() + '\uf8ff')
      .limit(parseInt(limit))
      .get();
    
    // Search by name (case insensitive)
    const nameResults = await collections.users
      .where('name', '>=', query)
      .where('name', '<=', query + '\uf8ff')
      .limit(parseInt(limit))
      .get();
    
    // Combine results and remove duplicates
    const users = [];
    const userIds = new Set();
    
    usernameResults.forEach(doc => {
      const userData = doc.data();
      if (!userIds.has(userData.uid)) {
        userIds.add(userData.uid);
        users.push({
          uid: userData.uid,
          username: userData.username,
          name: userData.name,
          profilePic: userData.profilePic,
          isVerified: userData.isVerified
        });
      }
    });
    
    nameResults.forEach(doc => {
      const userData = doc.data();
      if (!userIds.has(userData.uid)) {
        userIds.add(userData.uid);
        users.push({
          uid: userData.uid,
          username: userData.username,
          name: userData.name,
          profilePic: userData.profilePic,
          isVerified: userData.isVerified
        });
      }
    });
    
    res.status(200).json({
      error: false,
      data: {
        users: users.slice(0, parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error searching users:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to search users'
    });
  }
});

module.exports = router; 