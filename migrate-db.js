// migrate-db.js - Run this once to update your database schema
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'wfms.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Starting database migration...');

// Run migrations sequentially
db.serialize(() => {
  // Check if columns exist and add them if they don't
  db.get("PRAGMA table_info(tasks)", (err, rows) => {
    if (err) {
      console.error('Error checking tasks table:', err);
      return;
    }
    
    console.log('📊 Checking tasks table structure...');
    
    // Add approval_status column if missing
    db.run("ALTER TABLE tasks ADD COLUMN approval_status TEXT DEFAULT 'pending'", (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding approval_status:', err);
      } else if (!err) {
        console.log('✅ Added approval_status column');
      } else {
        console.log('ℹ️ approval_status column already exists');
      }
    });
    
    // Add submitted_at column if missing
    db.run("ALTER TABLE tasks ADD COLUMN submitted_at DATETIME", (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding submitted_at:', err);
      } else if (!err) {
        console.log('✅ Added submitted_at column');
      } else {
        console.log('ℹ️ submitted_at column already exists');
      }
    });
    
    // Add submitted_by column if missing
    db.run("ALTER TABLE tasks ADD COLUMN submitted_by INTEGER", (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding submitted_by:', err);
      } else if (!err) {
        console.log('✅ Added submitted_by column');
      } else {
        console.log('ℹ️ submitted_by column already exists');
      }
    });
    
    // Add admin_feedback column if missing
    db.run("ALTER TABLE tasks ADD COLUMN admin_feedback TEXT", (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding admin_feedback:', err);
      } else if (!err) {
        console.log('✅ Added admin_feedback column');
      } else {
        console.log('ℹ️ admin_feedback column already exists');
      }
    });
    
    // Add approved_at column if missing
    db.run("ALTER TABLE tasks ADD COLUMN approved_at DATETIME", (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding approved_at:', err);
      } else if (!err) {
        console.log('✅ Added approved_at column');
      } else {
        console.log('ℹ️ approved_at column already exists');
      }
    });
    
    // Add hours_spent column if missing (might already exist)
    db.run("ALTER TABLE tasks ADD COLUMN hours_spent REAL DEFAULT 0", (err) => {
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding hours_spent:', err);
      } else if (!err) {
        console.log('✅ Added hours_spent column');
      } else {
        console.log('ℹ️ hours_spent column already exists');
      }
    });
  });
  
  // Update any existing tasks to have default approval_status
  db.run("UPDATE tasks SET approval_status = 'pending' WHERE approval_status IS NULL", (err) => {
    if (err) {
      console.error('Error updating approval_status:', err);
    } else {
      console.log('✅ Updated existing tasks with default approval_status');
    }
  });
});

// Close the database after all operations
setTimeout(() => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('🔧 Database migration complete!');
    }
  });
}, 1000);