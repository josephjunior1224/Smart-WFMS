const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Use SQLite for local development
const dbPath = path.join(__dirname, 'wfms.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ SQLite connection error:', err.message);
  } else {
    console.log('✓ Connected to SQLite database at', dbPath);
  }
});

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON', (err) => {
  if (err) console.error('Could not enable foreign keys:', err);
});

// Promisify database operations
const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows || []);
    });
  });
};

const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

module.exports = {
  db: db,
  dbAll: dbAll,
  dbRun: dbRun,
  dbGet: dbGet,
  useFirebase: process.env.DATABASE_TYPE === 'firebase'
};
