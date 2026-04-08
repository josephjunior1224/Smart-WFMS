// migrate-mysql.js - MySQL migrations for Attendance + Logs tables
const mysql = require('mysql2/promise');
require('dotenv').config();

async function migrate() {
  let pool = null;
  try {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'wfms',
      waitForConnections: true,
      connectionLimit: 10
    });

    const db = await pool.getConnection();
    console.log('🔧 MySQL Migration started...');

    // 1. Create attendance_logs table if not exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS attendance_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        action VARCHAR(50) NOT NULL,
        timestamp DATETIME NOT NULL,
        ip VARCHAR(45),
        INDEX idx_user_action (user_id, action),
        INDEX idx_timestamp (timestamp)
      )
    `);
    console.log('✅ attendance_logs table ready');

    // 2. Create system_logs table if not exists
    await db.execute(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        timestamp DATETIME NOT NULL,
        level VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        user_id INT,
        module VARCHAR(50),
        ip VARCHAR(45),
        INDEX idx_timestamp (timestamp),
        INDEX idx_level (level),
        INDEX idx_user (user_id)
      )
    `);
    console.log('✅ system_logs table ready');

    // Insert sample data for testing
    await db.execute(`
      INSERT INTO attendance_logs (user_id, action, timestamp, ip) VALUES 
      (1, 'clock_in', NOW(), '127.0.0.1'),
      (1, 'clock_out', DATE_SUB(NOW(), INTERVAL 8 HOUR), '127.0.0.1'),
      (2, 'clock_in', NOW(), '192.168.1.100')
      ON DUPLICATE KEY UPDATE timestamp = timestamp
    `);
    console.log('✅ Sample attendance data inserted');

    await db.execute(`
      INSERT INTO system_logs (timestamp, level, message, user_id, module, ip) VALUES 
      (NOW(), 'INFO', 'System started', NULL, 'server', '127.0.0.1'),
      (NOW(), 'INFO', 'User logged in', 1, 'auth', '192.168.1.100')
      ON DUPLICATE KEY UPDATE timestamp = timestamp
    `);
    console.log('✅ Sample log data inserted');

    db.release();
    console.log('🎉 MySQL Migration COMPLETE! Run `npm start` to test.');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    if (pool) pool.end();
  }
}

migrate();

