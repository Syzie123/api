const { db, collections, storage } = require('../config/firebase');

/**
 * Delete expired stories
 * This function should be scheduled to run periodically (e.g., every hour)
 */
const cleanupExpiredStories = async () => {
  try {
    console.log('Starting cleanup of expired stories');
    
    const now = new Date();
    
    // Get all stories that have expired
    const expiredStoriesSnapshot = await collections.stories
      .where('expiresAt', '<', now)
      .get();
    
    if (expiredStoriesSnapshot.empty) {
      console.log('No expired stories found');
      return;
    }
    
    console.log(`Found ${expiredStoriesSnapshot.size} expired stories to delete`);
    
    // Delete stories in batches (Firestore has a limit of 500 operations per batch)
    const batchSize = 450;
    let batch = db.batch();
    let operationCount = 0;
    let totalDeleted = 0;
    
    // Track media URLs to delete from storage
    const mediaUrls = [];
    
    for (const doc of expiredStoriesSnapshot.docs) {
      const storyData = doc.data();
      
      // Add story to batch for deletion
      batch.delete(doc.ref);
      operationCount++;
      
      // Track media URL for deletion
      if (storyData.mediaUrl) {
        mediaUrls.push(storyData.mediaUrl);
      }
      
      // If batch is full, commit it and start a new one
      if (operationCount >= batchSize) {
        await batch.commit();
        totalDeleted += operationCount;
        console.log(`Deleted batch of ${operationCount} stories`);
        
        batch = db.batch();
        operationCount = 0;
      }
    }
    
    // Commit any remaining operations
    if (operationCount > 0) {
      await batch.commit();
      totalDeleted += operationCount;
      console.log(`Deleted final batch of ${operationCount} stories`);
    }
    
    console.log(`Successfully deleted ${totalDeleted} expired stories`);
    
    // Delete media files from storage
    for (const mediaUrl of mediaUrls) {
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
    
    console.log(`Attempted to delete ${mediaUrls.length} media files from storage`);
    
    return {
      success: true,
      storiesDeleted: totalDeleted,
      mediaFilesProcessed: mediaUrls.length
    };
  } catch (error) {
    console.error('Error cleaning up expired stories:', error);
    throw error;
  }
};

module.exports = {
  cleanupExpiredStories
}; 