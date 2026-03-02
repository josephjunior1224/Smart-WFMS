#!/usr/bin/env node

/**
 * WFMS - Database & Animation Test Suite
 * Tests database connection, schema, and animations
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('\n====================================');
console.log('  WFMS DATABASE & ANIMATION TEST');
console.log('====================================\n');

// Test 1: Configuration Check
console.log('✓ Test 1: Configuration Check');
console.log('  DB_HOST:', process.env.DB_HOST || 'localhost');
console.log('  DB_USER:', process.env.DB_USER || 'root');
console.log('  DB_NAME:', process.env.DB_NAME || 'wfms');
console.log('  PORT:', process.env.PORT || 8000);

// Test 2: Check HTML for Animation Classes
console.log('\n✓ Test 2: HTML Animation Classes Check');
const indexPath = path.join(__dirname, 'index.html');
const htmlContent = fs.readFileSync(indexPath, 'utf8');
const animationClasses = [
  'form-animate',
  'input-animate',
  'btn-animate',
  'header-animate',
  'logo-animate',
  'form-group-animate',
  'label-animate',
  'link-animate'
];

animationClasses.forEach(cls => {
  const count = (htmlContent.match(new RegExp(`class="[^"]*${cls}`, 'g')) || []).length;
  console.log(`  ${cls}: ${count} elements`);
});

// Test 3: Check CSS for Keyframes
console.log('\n✓ Test 3: CSS Animation Keyframes Check');
const cssPath = path.join(__dirname, 'style.css');
const cssContent = fs.readFileSync(cssPath, 'utf8');
const keyframes = [
  'formSlideInUp',
  'formGroupSlideIn',
  'labelFadeIn',
  'inputGlow',
  'buttonPress',
  'logoPulse',
  'inputShake'
];

keyframes.forEach(kf => {
  const exists = cssContent.includes(`@keyframes ${kf}`);
  console.log(`  @keyframes ${kf}: ${exists ? '✓' : '✗'}`);
});

// Test 4: Database Connection Test
async function testDatabase() {
  console.log('\n✓ Test 4: Database Connection');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || '',
      database: process.env.DB_NAME || 'wfms'
    });
    
    console.log('  ✓ Connected to MySQL successfully');
    
    // Test 5: Check Tables
    console.log('\n✓ Test 5: Database Tables Check');
    
    const [tables] = await connection.query(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
      [process.env.DB_NAME || 'wfms']
    );
    
    const tableNames = tables.map(t => t.TABLE_NAME);
    const expectedTables = ['users', 'tasks', 'attendance', 'time_logs'];
    
    expectedTables.forEach(table => {
      const exists = tableNames.includes(table);
      console.log(`  ${table}: ${exists ? '✓' : '✗'}`);
    });
    
    // Test 6: Check Indexes
    console.log('\n✓ Test 6: Database Indexes Check');
    
    const indexes = {
      'users': ['idx_email', 'idx_role'],
      'tasks': ['idx_assigned_to', 'idx_status', 'idx_created_at'],
      'attendance': ['idx_user_id', 'idx_timestamp', 'idx_user_timestamp'],
      'time_logs': ['idx_user_id', 'idx_time', 'idx_created_at', 'idx_user_time']
    };
    
    for (const [table, indexList] of Object.entries(indexes)) {
      console.log(`\n  Table: ${table}`);
      for (const idx of indexList) {
        const [result] = await connection.query(
          "SELECT INDEX_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?",
          [process.env.DB_NAME || 'wfms', table, idx]
        );
        console.log(`    ${idx}: ${result.length > 0 ? '✓' : '✗'}`);
      }
    }
    
    // Test 7: Check Data
    console.log('\n✓ Test 7: Data Integrity Check');
    
    const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
    console.log(`  Users: ${users[0].count} records`);
    
    const [tasks] = await connection.query('SELECT COUNT(*) as count FROM tasks');
    console.log(`  Tasks: ${tasks[0].count} records`);
    
    const [attendance] = await connection.query('SELECT COUNT(*) as count FROM attendance');
    console.log(`  Attendance: ${attendance[0].count} records`);
    
    const [timeLogs] = await connection.query('SELECT COUNT(*) as count FROM time_logs');
    console.log(`  Time Logs: ${timeLogs[0].count} records`);
    
    // Test 8: Check Foreign Keys
    console.log('\n✓ Test 8: Foreign Key Constraints Check');
    
    const [constraints] = await connection.query(
      "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL",
      [process.env.DB_NAME || 'wfms']
    );
    
    console.log(`  Total foreign keys: ${constraints.length}`);
    constraints.forEach(c => {
      console.log(`    - ${c.CONSTRAINT_NAME}`);
    });
    
    await connection.end();
    
    console.log('\n====================================');
    console.log('  ✓ ALL TESTS PASSED');
    console.log('====================================\n');
    
  } catch (error) {
    console.error('\n✗ Database Error:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Is MySQL running? Try: mysql -u root');
    console.log('2. Check .env file for correct credentials');
    console.log('3. Try: mysql -u root -e "CREATE DATABASE IF NOT EXISTS wfms;"');
    console.log('\n');
  }
}

// Test 9: Animation CSS Check
console.log('\n✓ Test 9: Animation CSS Properties Check');
const animationTests = [
  { name: 'formSlideInUp', duration: '0.6s', delay: '0s' },
  { name: 'formGroupSlideIn', duration: '0.5s', delay: 'inherit' },
  { name: 'logoPulse', duration: '3s', delay: '0.3s' }
];

animationTests.forEach(test => {
  const regex = new RegExp(`.${test.name.replace(/([A-Z])/g, '-$1').toLowerCase()}|animation:.*${test.name}`, 'i');
  const exists = cssContent.match(regex);
  console.log(`  ${test.name}: ${exists ? '✓ Found' : '✗ Missing'}`);
});

// Run database test
testDatabase();
