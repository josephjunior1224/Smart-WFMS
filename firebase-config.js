/**
 * Firebase Configuration
 * Initializes Firebase Admin SDK for backend operations
 */

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Initialize Firebase Admin SDK
const svcPathEnv = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || 'firebase-service-account.json';
const serviceAccountPath = path.isAbsolute(svcPathEnv) ? svcPathEnv : path.join(__dirname, svcPathEnv);

if (!process.env.FIREBASE_PROJECT_ID) {
  console.warn('⚠️  Firebase environment variables not configured');
  console.warn('Please set FIREBASE_PROJECT_ID and other Firebase variables in .env');
}

try {
  // Prefer service account JSON if present
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: process.env.FIREBASE_DATABASE_URL || undefined,
      projectId: process.env.FIREBASE_PROJECT_ID || undefined
    });
    console.log('✓ Firebase Admin SDK initialized with service account at', serviceAccountPath);
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_DATABASE_URL) {
    // Try to initialize using environment credentials (for some hosting environments)
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID,
      databaseURL: process.env.FIREBASE_DATABASE_URL
    });
    console.log('✓ Firebase Admin SDK initialized with environment credentials');
  } else {
    console.warn('✗ Firebase service account file not found at', serviceAccountPath);
    console.warn('Firebase will be disabled until properly configured');
  }
} catch (err) {
  console.error('✗ Firebase initialization error:', err.message);
  console.error('Firebase will be disabled until properly configured');
}

// Export Firestore, Realtime Database, and Auth references
module.exports = {
  db: admin.firestore(),
  realtimeDB: admin.database(),
  auth: admin.auth(),
  admin: admin,
  isInitialized: admin.apps.length > 0
};
