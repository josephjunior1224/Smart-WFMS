// fix-db-final.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'wfms.db');
const db = new sqlite3.Database(dbPath);

console.log('🔧 Starting database fix...');

// Run migrations sequentially
db.serialize(() => {
  // First, check current columns
  db.all("PRAGMA table_info(tasks)", (err, columns) => {
    if (err) {
      console.error('Error checking tasks table:', err);
      return;
    }
    
    console.log('📊 Current columns in tasks table:');
    columns.forEach(col => console.log(`   - ${col.name}`));
    
    // Define columns to add
    const columnsToAdd = [
      { name: 'daily_report', type: 'TEXT' },
      { name: 'submitted_at', type: 'DATETIME' },
      { name: 'hours_spent', type: 'REAL DEFAULT 0' },
      { name: 'submitted_by', type: 'INTEGER' },
      { name: 'approval_status', type: "TEXT DEFAULT 'pending'" },
      { name: 'admin_feedback', type: 'TEXT' },
      { name: 'approved_at', type: 'DATETIME' }
    ];
    
    // Add each missing column
    columnsToAdd.forEach(column => {
      const columnExists = columns.some(col => col.name === column.name);
      
      if (!columnExists) {
        db.run(`ALTER TABLE tasks ADD COLUMN ${column.name} ${column.type}`, (err) => {
          if (err) {
            console.error(`❌ Error adding ${column.name}:`, err.message);
          } else {
            console.log(`✅ Added column: ${column.name}`);
          }
        });
      } else {
        console.log(`ℹ️ Column ${column.name} already exists`);
      }
    });
    
    // Update existing tasks with default values
    db.run("UPDATE tasks SET approval_status = 'pending' WHERE approval_status IS NULL", (err) => {
      if (err) {
        console.error('Error updating approval_status:', err.message);
      } else {
        console.log('✅ Updated existing tasks with default approval_status');
      }
    });
    
    db.run("UPDATE tasks SET hours_spent = 0 WHERE hours_spent IS NULL", (err) => {
      if (err) {
        console.error('Error updating hours_spent:', err.message);
      } else {
        console.log('✅ Updated existing tasks with default hours_spent');
      }
    });
  });
});

// Close the database after all operations complete
setTimeout(() => {
  db.close((err) => {
    if (err) {
      console.error('Error closing database:', err);
    } else {
      console.log('✅ Database fix complete!');
    }
  });
}, 2000);