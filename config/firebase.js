const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  // Check if running in production environment (Vercel)
  if (process.env.FIREBASE_PRIVATE_KEY) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        // Replace escaped newlines in the private key
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
  } else {
    // For local development, use service account file
    const serviceAccount = require('../../serviceAccountKey.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: "social-3409d.appspot.com"
    });
  }
}

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();
const messaging = admin.messaging();

// Collections
const collections = {
  users: db.collection('users'),
  posts: db.collection('posts'),
  comments: db.collection('comments'),
  stories: db.collection('stories'),
  chats: db.collection('chats'),
  messages: db.collection('messages'),
  follows: db.collection('follows'),
  notifications: db.collection('notifications')
};

module.exports = {
  admin,
  db,
  auth,
  storage,
  messaging,
  collections
}; 