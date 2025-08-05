const express = require('express');
const router = express.Router();
const { collections, storage, db } = require('../config/firebase');
const { sendNotification } = require('../utils/notifications');
const { extractHashtags } = require('../utils/helpers');

/**
 * @route   POST /api/posts/create
 * @desc    Create a new post
 * @access  Private
 */
router.post('/create', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { caption, mediaUrls, isVideo } = req.body;
    
    // Validate input
    if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
      return res.status(400).json({ error: true, message: 'Media URLs are required' });
    }
    
    // Get user data
    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Extract hashtags from caption
    const hashtags = caption ? extractHashtags(caption) : [];
    
    // Create post document
    const postRef = collections.posts.doc();
    const postData = {
      postId: postRef.id,
      userId: uid,
      username: userData.username,
      userProfilePic: userData.profilePic,
      caption: caption || '',
      mediaUrls,
      isVideo: Boolean(isVideo),
      likes: [],
      commentCount: 0,
      createdAt: new Date(),
      hashtags
    };
    
    await postRef.set(postData);
    
    // Update user's posts array
    await collections.users.doc(uid).update({
      posts: [...userData.posts, postRef.id]
    });
    
    res.status(201).json({
      success: true,
      message: 'Post created successfully',
      data: {
        ...postData,
        _id: postData.postId // Ensure _id is available for compatibility
      }
    });
  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to create post'
    });
  }
});

/**
 * @route   GET /api/posts/:postId
 * @desc    Get post by ID
 * @access  Private
 */
router.get('/:postId', async (req, res) => {
  try {
    const { postId } = req.params;
    
    // Get post document
    const postDoc = await collections.posts.doc(postId).get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: true, message: 'Post not found' });
    }
    
    // Get comments for the post
    const commentsSnapshot = await collections.comments
      .where('postId', '==', postId)
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();
    
    const comments = commentsSnapshot.docs.map(doc => doc.data());
    
    res.status(200).json({
      error: false,
      data: {
        post: postDoc.data(),
        comments
      }
    });
  } catch (error) {
    console.error('Error getting post:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get post'
    });
  }
});

/**
 * @route   POST /api/posts/:postId/like
 * @desc    Like a post
 * @access  Private
 */
router.post('/:postId/like', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { postId } = req.params;
    
    // Get post document
    const postDoc = await collections.posts.doc(postId).get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: true, message: 'Post not found' });
    }
    
    const postData = postDoc.data();
    
    // Check if user already liked the post
    if (postData.likes.includes(uid)) {
      return res.status(400).json({ error: true, message: 'Post already liked' });
    }
    
    // Add user to likes array
    await collections.posts.doc(postId).update({
      likes: [...postData.likes, uid]
    });
    
    // Send notification to post owner if it's not the same user
    if (postData.userId !== uid) {
      // Get current user data for notification
      const userDoc = await collections.users.doc(uid).get();
      const userData = userDoc.data();
      
      await sendNotification({
        userId: postData.userId,
        type: 'like',
        actorId: uid,
        actorName: userData.name,
        message: `${userData.name} liked your post`,
        data: {
          postId
        }
      });
    }
    
    res.status(200).json({
      error: false,
      message: 'Post liked successfully'
    });
  } catch (error) {
    console.error('Error liking post:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to like post'
    });
  }
});

/**
 * @route   POST /api/posts/:postId/unlike
 * @desc    Unlike a post
 * @access  Private
 */
router.post('/:postId/unlike', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { postId } = req.params;
    
    // Get post document
    const postDoc = await collections.posts.doc(postId).get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: true, message: 'Post not found' });
    }
    
    const postData = postDoc.data();
    
    // Check if user has liked the post
    if (!postData.likes.includes(uid)) {
      return res.status(400).json({ error: true, message: 'Post not liked yet' });
    }
    
    // Remove user from likes array
    await collections.posts.doc(postId).update({
      likes: postData.likes.filter(id => id !== uid)
    });
    
    res.status(200).json({
      error: false,
      message: 'Post unliked successfully'
    });
  } catch (error) {
    console.error('Error unliking post:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to unlike post'
    });
  }
});

/**
 * @route   POST /api/posts/:postId/comment
 * @desc    Add a comment to a post
 * @access  Private
 */
router.post('/:postId/comment', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { postId } = req.params;
    const { text } = req.body;
    
    // Validate input
    if (!text || text.trim() === '') {
      return res.status(400).json({ error: true, message: 'Comment text is required' });
    }
    
    // Get post document
    const postDoc = await collections.posts.doc(postId).get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: true, message: 'Post not found' });
    }
    
    // Get user data
    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    const postData = postDoc.data();
    
    // Create comment document
    const commentRef = collections.comments.doc();
    const commentData = {
      commentId: commentRef.id,
      postId,
      userId: uid,
      username: userData.username,
      userProfilePic: userData.profilePic,
      text,
      createdAt: new Date()
    };
    
    // Transaction to create comment and update post's comment count
    await db.runTransaction(async (transaction) => {
      transaction.set(commentRef, commentData);
      transaction.update(collections.posts.doc(postId), {
        commentCount: postData.commentCount + 1
      });
    });
    
    // Send notification to post owner if it's not the same user
    if (postData.userId !== uid) {
      await sendNotification({
        userId: postData.userId,
        type: 'comment',
        actorId: uid,
        actorName: userData.name,
        message: `${userData.name} commented on your post: "${text.substring(0, 30)}${text.length > 30 ? '...' : ''}"`,
        data: {
          postId,
          commentId: commentRef.id
        }
      });
    }
    
    res.status(201).json({
      error: false,
      message: 'Comment added successfully',
      data: {
        comment: commentData
      }
    });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to add comment'
    });
  }
});

/**
 * @route   GET /api/posts/:postId/comments
 * @desc    Get comments for a post
 * @access  Private
 */
router.get('/:postId/comments', async (req, res) => {
  try {
    const { postId } = req.params;
    const { limit = 20, lastId } = req.query;
    
    // Check if post exists
    const postDoc = await collections.posts.doc(postId).get();
    if (!postDoc.exists) {
      return res.status(404).json({ error: true, message: 'Post not found' });
    }
    
    let query = collections.comments
      .where('postId', '==', postId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.comments.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const commentsSnapshot = await query.get();
    const comments = commentsSnapshot.docs.map(doc => doc.data());
    
    res.status(200).json({
      error: false,
      data: {
        comments,
        lastId: commentsSnapshot.docs.length > 0 ? commentsSnapshot.docs[commentsSnapshot.docs.length - 1].id : null,
        hasMore: commentsSnapshot.docs.length >= parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting comments:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get comments'
    });
  }
});

/**
 * @route   GET /api/posts/feed
 * @desc    Get posts for user's feed
 * @access  Private
 */
router.get('/feed', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { limit = 10, lastId } = req.query;
    
    // Get user data to get following list
    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Include user's own posts and posts from users they follow
    const userIds = [...userData.following, uid];
    
    let query = collections.posts
      .where('userId', 'in', userIds)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.posts.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const postsSnapshot = await query.get();
    const posts = postsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        _id: data.postId || doc.id // Ensure _id is available for compatibility
      };
    });
    
    res.status(200).json({
      success: true,
      data: posts,
      lastId: postsSnapshot.docs.length > 0 ? postsSnapshot.docs[postsSnapshot.docs.length - 1].id : null,
      hasMore: postsSnapshot.docs.length >= parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting feed:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get feed'
    });
  }
});

/**
 * @route   GET /api/posts/user/:userId
 * @desc    Get posts by user ID
 * @access  Private
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, lastId } = req.query;
    
    // Check if user exists
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    let query = collections.posts
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.posts.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const postsSnapshot = await query.get();
    const posts = postsSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        ...data,
        _id: data.postId || doc.id // Ensure _id is available for compatibility
      };
    });
    
    res.status(200).json({
      success: true,
      data: posts,
      lastId: postsSnapshot.docs.length > 0 ? postsSnapshot.docs[postsSnapshot.docs.length - 1].id : null,
      hasMore: postsSnapshot.docs.length >= parseInt(limit)
    });
  } catch (error) {
    console.error('Error getting user posts:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get user posts'
    });
  }
});

/**
 * @route   DELETE /api/posts/:postId
 * @desc    Delete a post
 * @access  Private
 */
router.delete('/:postId', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { postId } = req.params;
    
    // Get post document
    const postDoc = await collections.posts.doc(postId).get();
    
    if (!postDoc.exists) {
      return res.status(404).json({ error: true, message: 'Post not found' });
    }
    
    const postData = postDoc.data();
    
    // Check if user is the post owner
    if (postData.userId !== uid) {
      return res.status(403).json({ error: true, message: 'Not authorized to delete this post' });
    }
    
    // Get user data
    const userDoc = await collections.users.doc(uid).get();
    const userData = userDoc.data();
    
    // Transaction to delete post and update user's posts array
    await db.runTransaction(async (transaction) => {
      // Delete post
      transaction.delete(collections.posts.doc(postId));
      
      // Update user's posts array
      transaction.update(collections.users.doc(uid), {
        posts: userData.posts.filter(id => id !== postId)
      });
      
      // Delete all comments for the post
      const commentsSnapshot = await collections.comments.where('postId', '==', postId).get();
      commentsSnapshot.forEach(doc => {
        transaction.delete(doc.ref);
      });
    });
    
    // Delete media files from storage
    // This is handled separately as it's not part of the transaction
    for (const mediaUrl of postData.mediaUrls) {
      try {
        // Extract the storage path from the URL
        const path = mediaUrl.split('social-3409d.appspot.com/')[1].split('?')[0];
        if (path) {
          await storage.bucket().file(decodeURIComponent(path)).delete();
        }
      } catch (error) {
        console.error('Error deleting media file:', error);
        // Continue with other files even if one fails
      }
    }
    
    res.status(200).json({
      error: false,
      message: 'Post deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to delete post'
    });
  }
});

/**
 * @route   GET /api/posts/explore
 * @desc    Get posts for explore page
 * @access  Private
 */
router.get('/explore', async (req, res) => {
  try {
    const { limit = 20, lastId } = req.query;
    
    let query = collections.posts
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.posts.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const postsSnapshot = await query.get();
    const posts = postsSnapshot.docs.map(doc => doc.data());
    
    res.status(200).json({
      error: false,
      data: {
        posts,
        lastId: postsSnapshot.docs.length > 0 ? postsSnapshot.docs[postsSnapshot.docs.length - 1].id : null,
        hasMore: postsSnapshot.docs.length >= parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting explore posts:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get explore posts'
    });
  }
});

/**
 * @route   GET /api/posts/hashtag/:tag
 * @desc    Get posts by hashtag
 * @access  Private
 */
router.get('/hashtag/:tag', async (req, res) => {
  try {
    const { tag } = req.params;
    const { limit = 20, lastId } = req.query;
    
    let query = collections.posts
      .where('hashtags', 'array-contains', tag)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.posts.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const postsSnapshot = await query.get();
    const posts = postsSnapshot.docs.map(doc => doc.data());
    
    res.status(200).json({
      error: false,
      data: {
        posts,
        lastId: postsSnapshot.docs.length > 0 ? postsSnapshot.docs[postsSnapshot.docs.length - 1].id : null,
        hasMore: postsSnapshot.docs.length >= parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting hashtag posts:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get hashtag posts'
    });
  }
});

/**
 * @route   POST /api/posts/direct-create
 * @desc    Create a new post directly in Firebase (fallback for indexing issues)
 * @access  Private
 */
router.post('/direct-create', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { caption, mediaUrls, isVideo, hashtags } = req.body;
    
    // Validate input
    if (!mediaUrls || !Array.isArray(mediaUrls) || mediaUrls.length === 0) {
      return res.status(400).json({ error: true, message: 'Media URLs are required' });
    }
    
    // Get user data
    const userDoc = await collections.users.doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    
    // Extract hashtags from caption if not provided
    const extractedHashtags = hashtags || (caption ? extractHashtags(caption) : []);
    
    // Create post document with a specific ID to avoid indexing issues
    const postId = `post_${uid}_${Date.now()}`;
    const postRef = collections.posts.doc(postId);
    const postData = {
      postId: postId,
      userId: uid,
      username: userData.username,
      userProfilePic: userData.profilePic,
      caption: caption || '',
      mediaUrls,
      isVideo: Boolean(isVideo),
      likes: [],
      commentCount: 0,
      createdAt: new Date(),
      hashtags: extractedHashtags
    };
    
    await postRef.set(postData);
    
    // Update user's posts array
    await collections.users.doc(uid).update({
      posts: [...userData.posts, postId]
    });
    
    res.status(201).json({
      success: true,
      message: 'Post created successfully via direct method',
      data: {
        ...postData,
        _id: postData.postId // Ensure _id is available for compatibility
      }
    });
  } catch (error) {
    console.error('Error creating post directly:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to create post directly'
    });
  }
});

/**
 * @route   POST /api/posts/simple-create
 * @desc    Create a new post with simplified data (last resort)
 * @access  Private
 */
router.post('/simple-create', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { caption, mediaUrl, isVideo, hashtags } = req.body;
    
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
    
    // Extract hashtags from caption if not provided
    const extractedHashtags = hashtags || (caption ? extractHashtags(caption) : []);
    
    // Create post document with a simple ID
    const postId = `simple_${Date.now()}`;
    const postRef = collections.posts.doc(postId);
    const postData = {
      postId: postId,
      userId: uid,
      username: userData.username,
      userProfilePic: userData.profilePic,
      caption: caption || '',
      mediaUrls: [mediaUrl],
      isVideo: Boolean(isVideo),
      likes: [],
      commentCount: 0,
      createdAt: new Date(),
      hashtags: extractedHashtags
    };
    
    await postRef.set(postData);
    
    // Update user's posts array
    await collections.users.doc(uid).update({
      posts: [...userData.posts, postId]
    });
    
    res.status(201).json({
      success: true,
      message: 'Post created successfully via simple method',
      data: {
        ...postData,
        _id: postData.postId // Ensure _id is available for compatibility
      }
    });
  } catch (error) {
    console.error('Error creating simple post:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to create simple post'
    });
  }
});

/**
 * @route   GET /api/posts/by-user/:userId
 * @desc    Alternative method to get posts by user ID (fallback)
 * @access  Private
 */
router.get('/by-user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20 } = req.query;
    
    // Check if user exists
    const userDoc = await collections.users.doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    const userData = userDoc.data();
    const userPosts = [];
    
    // Get posts directly from user's posts array
    if (userData.posts && userData.posts.length > 0) {
      // Only get the last 'limit' posts
      const postsToFetch = userData.posts.slice(-parseInt(limit));
      
      // Fetch each post
      for (const postId of postsToFetch) {
        try {
          const postDoc = await collections.posts.doc(postId).get();
          if (postDoc.exists) {
            const data = postDoc.data();
            userPosts.push({
              ...data,
              _id: data.postId || postId // Ensure _id is available for compatibility
            });
          }
        } catch (e) {
          console.error(`Error fetching post ${postId}:`, e);
        }
      }
    }
    
    res.status(200).json({
      success: true,
      data: userPosts
    });
  } catch (error) {
    console.error('Error getting user posts by direct method:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get user posts'
    });
  }
});

module.exports = router; 