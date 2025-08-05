const express = require('express');
const router = express.Router();
const { collections, db } = require('../config/firebase');
const { sendNotification } = require('../utils/notifications');

/**
 * @route   GET /api/chats
 * @desc    Get all chats for a user
 * @access  Private
 */
router.get('/', async (req, res) => {
  try {
    const uid = req.user.uid;
    
    // Get chats where the user is a participant
    const chatsSnapshot = await collections.chats
      .where('participants', 'array-contains', uid)
      .orderBy('lastMessageAt', 'desc')
      .get();
    
    const chats = [];
    
    // Get additional data for each chat
    for (const doc of chatsSnapshot.docs) {
      const chatData = doc.data();
      
      // Get the other participant's data
      const otherParticipantId = chatData.participants.find(id => id !== uid);
      const otherParticipantDoc = await collections.users.doc(otherParticipantId).get();
      
      if (otherParticipantDoc.exists) {
        const otherParticipantData = otherParticipantDoc.data();
        
        chats.push({
          chatId: chatData.chatId,
          otherUser: {
            uid: otherParticipantId,
            name: otherParticipantData.name,
            username: otherParticipantData.username,
            profilePic: otherParticipantData.profilePic
          },
          lastMessage: chatData.lastMessage,
          lastMessageAt: chatData.lastMessageAt,
          unreadCount: chatData.unreadCount && chatData.unreadCount[uid] ? chatData.unreadCount[uid] : 0
        });
      }
    }
    
    res.status(200).json({
      error: false,
      data: {
        chats
      }
    });
  } catch (error) {
    console.error('Error getting chats:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get chats'
    });
  }
});

/**
 * @route   POST /api/chats/create
 * @desc    Create or get a chat with another user
 * @access  Private
 */
router.post('/create', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { otherUserId } = req.body;
    
    // Validate input
    if (!otherUserId) {
      return res.status(400).json({ error: true, message: 'Other user ID is required' });
    }
    
    // Check if other user exists
    const otherUserDoc = await collections.users.doc(otherUserId).get();
    if (!otherUserDoc.exists) {
      return res.status(404).json({ error: true, message: 'User not found' });
    }
    
    // Check if chat already exists
    const participants = [uid, otherUserId].sort();
    const chatId = participants.join('_');
    
    const chatDoc = await collections.chats.doc(chatId).get();
    
    if (chatDoc.exists) {
      // Chat already exists, return it
      const chatData = chatDoc.data();
      
      // Get other participant data
      const otherParticipantData = otherUserDoc.data();
      
      res.status(200).json({
        error: false,
        message: 'Chat already exists',
        data: {
          chat: {
            chatId: chatData.chatId,
            otherUser: {
              uid: otherUserId,
              name: otherParticipantData.name,
              username: otherParticipantData.username,
              profilePic: otherParticipantData.profilePic
            },
            lastMessage: chatData.lastMessage,
            lastMessageAt: chatData.lastMessageAt,
            unreadCount: chatData.unreadCount && chatData.unreadCount[uid] ? chatData.unreadCount[uid] : 0
          }
        }
      });
    } else {
      // Create new chat
      const now = new Date();
      const chatData = {
        chatId,
        participants,
        createdAt: now,
        lastMessageAt: now,
        lastMessage: {
          text: '',
          senderId: '',
          type: 'text'
        },
        unreadCount: {
          [uid]: 0,
          [otherUserId]: 0
        }
      };
      
      await collections.chats.doc(chatId).set(chatData);
      
      // Get other participant data
      const otherParticipantData = otherUserDoc.data();
      
      res.status(201).json({
        error: false,
        message: 'Chat created successfully',
        data: {
          chat: {
            chatId,
            otherUser: {
              uid: otherUserId,
              name: otherParticipantData.name,
              username: otherParticipantData.username,
              profilePic: otherParticipantData.profilePic
            },
            lastMessage: chatData.lastMessage,
            lastMessageAt: chatData.lastMessageAt,
            unreadCount: 0
          }
        }
      });
    }
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to create chat'
    });
  }
});

/**
 * @route   POST /api/chats/:chatId/send
 * @desc    Send a message in a chat
 * @access  Private
 */
router.post('/:chatId/send', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { chatId } = req.params;
    const { text, mediaUrl, type = 'text' } = req.body;
    
    // Validate input
    if (type === 'text' && (!text || text.trim() === '')) {
      return res.status(400).json({ error: true, message: 'Message text is required' });
    }
    
    if (type === 'image' && !mediaUrl) {
      return res.status(400).json({ error: true, message: 'Media URL is required for image messages' });
    }
    
    // Check if chat exists
    const chatDoc = await collections.chats.doc(chatId).get();
    
    if (!chatDoc.exists) {
      return res.status(404).json({ error: true, message: 'Chat not found' });
    }
    
    const chatData = chatDoc.data();
    
    // Check if user is a participant in the chat
    if (!chatData.participants.includes(uid)) {
      return res.status(403).json({ error: true, message: 'Not authorized to send messages in this chat' });
    }
    
    // Get the other participant's ID
    const otherParticipantId = chatData.participants.find(id => id !== uid);
    
    // Create message document
    const messageRef = collections.messages.doc();
    const now = new Date();
    
    const messageData = {
      messageId: messageRef.id,
      chatId,
      senderId: uid,
      text: text || '',
      mediaUrl: mediaUrl || '',
      type,
      read: false,
      createdAt: now
    };
    
    // Transaction to create message and update chat
    await db.runTransaction(async (transaction) => {
      // Create message
      transaction.set(messageRef, messageData);
      
      // Update chat's last message and unread count
      const chatRef = collections.chats.doc(chatId);
      
      // Increment unread count for the other participant
      const unreadCount = { ...chatData.unreadCount };
      unreadCount[otherParticipantId] = (unreadCount[otherParticipantId] || 0) + 1;
      
      transaction.update(chatRef, {
        lastMessage: {
          text: type === 'text' ? text : 'Sent an image',
          senderId: uid,
          type
        },
        lastMessageAt: now,
        unreadCount
      });
    });
    
    // Send push notification to other participant
    try {
      // Get sender data
      const senderDoc = await collections.users.doc(uid).get();
      const senderData = senderDoc.data();
      
      await sendNotification({
        userId: otherParticipantId,
        type: 'message',
        actorId: uid,
        actorName: senderData.name,
        message: `${senderData.name}: ${type === 'text' ? text : 'Sent you an image'}`,
        data: {
          chatId,
          messageId: messageRef.id
        }
      });
    } catch (notificationError) {
      console.error('Error sending notification:', notificationError);
      // Continue even if notification fails
    }
    
    res.status(201).json({
      error: false,
      message: 'Message sent successfully',
      data: {
        message: messageData
      }
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to send message'
    });
  }
});

/**
 * @route   GET /api/chats/:chatId/messages
 * @desc    Get messages for a chat
 * @access  Private
 */
router.get('/:chatId/messages', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { chatId } = req.params;
    const { limit = 20, lastId } = req.query;
    
    // Check if chat exists
    const chatDoc = await collections.chats.doc(chatId).get();
    
    if (!chatDoc.exists) {
      return res.status(404).json({ error: true, message: 'Chat not found' });
    }
    
    const chatData = chatDoc.data();
    
    // Check if user is a participant in the chat
    if (!chatData.participants.includes(uid)) {
      return res.status(403).json({ error: true, message: 'Not authorized to view messages in this chat' });
    }
    
    let query = collections.messages
      .where('chatId', '==', chatId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.messages.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const messagesSnapshot = await query.get();
    const messages = messagesSnapshot.docs.map(doc => doc.data());
    
    // Mark messages as read
    const batch = db.batch();
    let unreadCount = 0;
    
    messagesSnapshot.docs.forEach(doc => {
      const messageData = doc.data();
      if (messageData.senderId !== uid && !messageData.read) {
        batch.update(doc.ref, { read: true });
        unreadCount++;
      }
    });
    
    // Update chat's unread count if needed
    if (unreadCount > 0) {
      const unreadCountUpdate = { ...chatData.unreadCount };
      unreadCountUpdate[uid] = Math.max(0, (unreadCountUpdate[uid] || 0) - unreadCount);
      
      batch.update(collections.chats.doc(chatId), {
        unreadCount: unreadCountUpdate
      });
    }
    
    await batch.commit();
    
    res.status(200).json({
      error: false,
      data: {
        messages,
        lastId: messagesSnapshot.docs.length > 0 ? messagesSnapshot.docs[messagesSnapshot.docs.length - 1].id : null,
        hasMore: messagesSnapshot.docs.length >= parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to get messages'
    });
  }
});

/**
 * @route   POST /api/chats/:chatId/read
 * @desc    Mark all messages in a chat as read
 * @access  Private
 */
router.post('/:chatId/read', async (req, res) => {
  try {
    const uid = req.user.uid;
    const { chatId } = req.params;
    
    // Check if chat exists
    const chatDoc = await collections.chats.doc(chatId).get();
    
    if (!chatDoc.exists) {
      return res.status(404).json({ error: true, message: 'Chat not found' });
    }
    
    const chatData = chatDoc.data();
    
    // Check if user is a participant in the chat
    if (!chatData.participants.includes(uid)) {
      return res.status(403).json({ error: true, message: 'Not authorized to access this chat' });
    }
    
    // Get unread messages
    const unreadMessagesSnapshot = await collections.messages
      .where('chatId', '==', chatId)
      .where('senderId', '!=', uid)
      .where('read', '==', false)
      .get();
    
    if (!unreadMessagesSnapshot.empty) {
      // Mark all messages as read
      const batch = db.batch();
      
      unreadMessagesSnapshot.docs.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
      
      // Update chat's unread count
      const unreadCountUpdate = { ...chatData.unreadCount };
      unreadCountUpdate[uid] = 0;
      
      batch.update(collections.chats.doc(chatId), {
        unreadCount: unreadCountUpdate
      });
      
      await batch.commit();
    }
    
    res.status(200).json({
      error: false,
      message: 'Messages marked as read'
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({
      error: true,
      message: error.message || 'Failed to mark messages as read'
    });
  }
});

module.exports = router; 