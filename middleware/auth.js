const { auth } = require('../config/firebase');

/**
 * Middleware to validate Firebase ID token
 */
const validateFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: true, message: 'Unauthorized: No token provided' });
    }
    
    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the ID token
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Add the decoded token to the request object
    req.user = decodedToken;
    
    next();
  } catch (error) {
    console.error('Error validating Firebase token:', error);
    return res.status(401).json({ error: true, message: 'Unauthorized: Invalid token' });
  }
};

module.exports = {
  validateFirebaseToken
}; 