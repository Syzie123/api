const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const authRoutes = require('./routes/auth');
const postRoutes = require('./routes/posts');
const storyRoutes = require('./routes/stories');
const userRoutes = require('./routes/users');
const chatRoutes = require('./routes/chats');
const uploadRoutes = require('./routes/uploads');
const { validateFirebaseToken } = require('./middleware/auth');

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', validateFirebaseToken, postRoutes);
app.use('/api/stories', validateFirebaseToken, storyRoutes);
app.use('/api/users', validateFirebaseToken, userRoutes);
app.use('/api/chats', validateFirebaseToken, chatRoutes);
app.use('/api/uploads', validateFirebaseToken, uploadRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: true,
    message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message
  });
});

// Export for serverless use
module.exports = app;

// Start server if not in serverless environment
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
} 