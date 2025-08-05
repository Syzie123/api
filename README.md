# Social App Backend API

This is the backend API for the Social app, a Flutter-based social media application. The API is built with Node.js, Express, and Firebase.

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Create a `serviceAccountKey.json` file in the root directory with your Firebase service account credentials.
4. Create a `.env` file with the following variables:
   ```
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=your-client-email
   FIREBASE_PRIVATE_KEY=your-private-key
   FIREBASE_STORAGE_BUCKET=your-storage-bucket
   ```
5. Run the development server:
   ```
   npm run dev
   ```

## Deployment

The API is deployed on Vercel. To deploy:

1. Install the Vercel CLI:
   ```
   npm install -g vercel
   ```
2. Login to Vercel:
   ```
   vercel login
   ```
3. Deploy:
   ```
   npm run deploy
   ```

## API Endpoints

### Authentication

- `POST /api/auth/register`: Register a new user
- `POST /api/auth/login`: Login with email and password

### Users

- `GET /api/users/:username`: Get user by username or ID
- `PUT /api/users/profile`: Update user profile
- `POST /api/users/follow/:userId`: Follow a user
- `POST /api/users/unfollow/:userId`: Unfollow a user
- `GET /api/users/:userId/followers`: Get user's followers
- `GET /api/users/:userId/following`: Get users that a user is following
- `GET /api/users/search`: Search for users by username or name

### Posts

- `POST /api/posts/create`: Create a new post
- `POST /api/posts/direct-create`: Create a new post directly in Firebase (fallback)
- `POST /api/posts/simple-create`: Create a new post with simplified data (last resort)
- `GET /api/posts/:postId`: Get post by ID
- `POST /api/posts/:postId/like`: Like a post
- `POST /api/posts/:postId/unlike`: Unlike a post
- `POST /api/posts/:postId/comment`: Add a comment to a post
- `GET /api/posts/:postId/comments`: Get comments for a post
- `GET /api/posts/feed`: Get posts for user's feed
- `GET /api/posts/user/:userId`: Get posts by user ID
- `GET /api/posts/by-user/:userId`: Alternative method to get posts by user ID (fallback)
- `DELETE /api/posts/:postId`: Delete a post
- `GET /api/posts/explore`: Get posts for explore page
- `GET /api/posts/hashtag/:tag`: Get posts by hashtag

### Stories

- `POST /api/stories/upload`: Upload a new story
- `GET /api/stories/feed`: Get stories for user's feed
- `GET /api/stories/user/:userId`: Get stories by user ID
- `POST /api/stories/:storyId/view`: Mark a story as viewed
- `DELETE /api/stories/:storyId`: Delete a story

### Uploads

- `POST /api/uploads/image`: Upload an image
- `POST /api/uploads/video`: Upload a video
- `POST /api/uploads/placeholder`: Generate a placeholder image URL

### Chats

- `GET /api/chats`: Get all chats for the current user
- `POST /api/chats/create`: Create a new chat
- `POST /api/chats/:chatId/send`: Send a message in a chat
- `GET /api/chats/:chatId/messages`: Get messages for a chat
- `POST /api/chats/:chatId/read`: Mark a chat as read

## Response Format

All API responses follow this format:

```json
{
  "success": true,
  "data": {
    // Response data
  }
}
```

Or in case of an error:

```json
{
  "error": true,
  "message": "Error message"
}
```

## Authentication

All endpoints except `/api/auth/*` and `/api/health` require authentication. To authenticate, include a Firebase ID token in the Authorization header:

```
Authorization: Bearer <token>
```