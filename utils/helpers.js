/**
 * Extract hashtags from text
 * @param {string} text - Text to extract hashtags from
 * @returns {Array<string>} - Array of hashtags without the # symbol
 */
const extractHashtags = (text) => {
  if (!text) return [];
  
  const hashtagRegex = /#(\w+)/g;
  const matches = text.match(hashtagRegex);
  
  if (!matches) return [];
  
  return matches.map(tag => tag.substring(1).toLowerCase());
};

/**
 * Generate a random username based on name and random number
 * @param {string} name - User's name
 * @returns {string} - Generated username
 */
const generateUsername = (name) => {
  if (!name) return '';
  
  // Remove special characters and spaces, convert to lowercase
  const baseName = name.toLowerCase().replace(/[^\w\s]/gi, '').replace(/\s+/g, '');
  
  // Add random number between 1000-9999
  const randomNum = Math.floor(Math.random() * 9000) + 1000;
  
  return `${baseName}${randomNum}`;
};

/**
 * Format file size
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Check if a string is a valid URL
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether the URL is valid
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Generate a slug from a string
 * @param {string} text - Text to generate slug from
 * @returns {string} - Generated slug
 */
const generateSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')     // Replace spaces with -
    .replace(/&/g, '-and-')   // Replace & with 'and'
    .replace(/[^\w\-]+/g, '') // Remove all non-word characters
    .replace(/\-\-+/g, '-');  // Replace multiple - with single -
};

/**
 * Get file extension from URL or filename
 * @param {string} url - URL or filename
 * @returns {string} - File extension
 */
const getFileExtension = (url) => {
  if (!url) return '';
  
  return url.split('.').pop().toLowerCase();
};

/**
 * Check if a file is an image based on extension
 * @param {string} url - URL or filename
 * @returns {boolean} - Whether the file is an image
 */
const isImageFile = (url) => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
  const extension = getFileExtension(url);
  
  return imageExtensions.includes(extension);
};

/**
 * Check if a file is a video based on extension
 * @param {string} url - URL or filename
 * @returns {boolean} - Whether the file is a video
 */
const isVideoFile = (url) => {
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov', 'avi', 'wmv', 'flv', 'mkv'];
  const extension = getFileExtension(url);
  
  return videoExtensions.includes(extension);
};

module.exports = {
  extractHashtags,
  generateUsername,
  formatFileSize,
  isValidUrl,
  generateSlug,
  getFileExtension,
  isImageFile,
  isVideoFile
}; 