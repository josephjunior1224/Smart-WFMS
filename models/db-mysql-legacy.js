const mysql = require('mysql2/promise');
require('dotenv').config();

// Determine database type from environment
const USE_FIREBASE = process.env.DATABASE_TYPE === 'firebase';

let pool = null;
let firebase = null;

// Initialize MySQL if not using Firebase
if (!USE_FIREBASE) {
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'wfms',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelayMs: 0,
    multipleStatements: true // Allow multiple SQL statements
  });

  // Test connection on startup
  pool.getConnection()
    .then(conn => {
      console.log('✓ MySQL Database pool connected successfully');
      console.log(`✓ Host: ${process.env.DB_HOST || 'localhost'}`);
      console.log(`✓ Database: ${process.env.DB_NAME || 'wfms'}`);
      conn.release();
    })
    .catch(err => {
      console.error('✗ MySQL connection failed:', err.message);
      console.error('Please ensure MySQL is running and .env is configured correctly');
    });

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('✗ Unexpected error on idle client:', err);
    process.exit(-1);
  });
} else {
  // Initialize Firebase
  try {
    firebase = require('../firebase-config');
    if (firebase.isInitialized) {
      console.log('✓ Firebase initialized successfully');
      console.log(`✓ Project ID: ${process.env.FIREBASE_PROJECT_ID}`);
    } else {
      console.error('✗ Firebase initialization failed');
    }
  } catch (err) {
    console.error('✗ Firebase initialization error:', err.message);
  }
}

module.exports = {
  pool: pool,
  firebase: firebase,
  useFirebase: USE_FIREBASE
};
