const { messaging, db, collections } = require('../config/firebase');

/**
 * Send a notification to a user
 * @param {Object} params - Notification parameters
 * @param {string} params.userId - User ID to send notification to
 * @param {string} params.type - Notification type (like, comment, follow, message)
 * @param {string} params.actorId - User ID of the actor who triggered the notification
 * @param {string} params.actorName - Name of the actor
 * @param {string} params.message - Notification message
 * @param {Object} params.data - Additional data for the notification
 * @returns {Promise<void>}
 */
const sendNotification = async ({ userId, type, actorId, actorName, message, data = {} }) => {
  try {
    // Store notification in Firestore
    const notificationRef = collections.notifications.doc();
    const now = new Date();
    
    const notificationData = {
      notificationId: notificationRef.id,
      userId,
      type,
      actorId,
      actorName,
      message,
      data,
      read: false,
      createdAt: now
    };
    
    await notificationRef.set(notificationData);
    
    // Get user's FCM tokens
    const userDoc = await collections.users.doc(userId).get();
    
    if (!userDoc.exists) {
      console.error(`User ${userId} not found for sending notification`);
      return;
    }
    
    const userData = userDoc.data();
    const fcmTokens = userData.fcmTokens || [];
    
    if (fcmTokens.length === 0) {
      console.log(`No FCM tokens found for user ${userId}`);
      return;
    }
    
    // Prepare notification payload
    const payload = {
      notification: {
        title: '5ocial',
        body: message,
        clickAction: 'FLUTTER_NOTIFICATION_CLICK'
      },
      data: {
        type,
        notificationId: notificationRef.id,
        ...data
      }
    };
    
    // Send to all user's devices
    const sendPromises = fcmTokens.map(token => 
      messaging.sendToDevice(token, payload)
        .catch(error => {
          console.error(`Error sending to token ${token}:`, error);
          
          // If token is invalid, remove it
          if (error.code === 'messaging/invalid-registration-token' || 
              error.code === 'messaging/registration-token-not-registered') {
            return collections.users.doc(userId).update({
              fcmTokens: db.FieldValue.arrayRemove(token)
            });
          }
        })
    );
    
    await Promise.all(sendPromises);
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

/**
 * Get notifications for a user
 * @param {string} userId - User ID
 * @param {number} limit - Maximum number of notifications to return
 * @param {string} lastId - Last notification ID for pagination
 * @returns {Promise<Object>} - Notifications and pagination info
 */
const getUserNotifications = async (userId, limit = 20, lastId = null) => {
  try {
    let query = collections.notifications
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(parseInt(limit));
    
    // Apply pagination if lastId provided
    if (lastId) {
      const lastDoc = await collections.notifications.doc(lastId).get();
      if (lastDoc.exists) {
        query = query.startAfter(lastDoc);
      }
    }
    
    const notificationsSnapshot = await query.get();
    const notifications = notificationsSnapshot.docs.map(doc => doc.data());
    
    return {
      notifications,
      lastId: notificationsSnapshot.docs.length > 0 ? notificationsSnapshot.docs[notificationsSnapshot.docs.length - 1].id : null,
      hasMore: notificationsSnapshot.docs.length >= parseInt(limit)
    };
  } catch (error) {
    console.error('Error getting user notifications:', error);
    throw error;
  }
};

/**
 * Mark notifications as read
 * @param {string} userId - User ID
 * @param {Array<string>} notificationIds - Array of notification IDs to mark as read
 * @returns {Promise<void>}
 */
const markNotificationsAsRead = async (userId, notificationIds = []) => {
  try {
    const batch = db.batch();
    
    if (notificationIds.length > 0) {
      // Mark specific notifications as read
      for (const notificationId of notificationIds) {
        const notificationRef = collections.notifications.doc(notificationId);
        const notificationDoc = await notificationRef.get();
        
        if (notificationDoc.exists && notificationDoc.data().userId === userId) {
          batch.update(notificationRef, { read: true });
        }
      }
    } else {
      // Mark all user's notifications as read
      const unreadNotificationsSnapshot = await collections.notifications
        .where('userId', '==', userId)
        .where('read', '==', false)
        .get();
      
      unreadNotificationsSnapshot.forEach(doc => {
        batch.update(doc.ref, { read: true });
      });
    }
    
    await batch.commit();
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    throw error;
  }
};

module.exports = {
  sendNotification,
  getUserNotifications,
  markNotificationsAsRead
}; 