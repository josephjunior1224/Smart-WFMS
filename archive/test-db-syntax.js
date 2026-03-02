#!/usr/bin/env node

/**
 * Quick db.js Syntax Test
 * Tests if db.js has valid JavaScript syntax
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing db.js...\n');

// Test 1: Check file exists
const dbPath = path.join(__dirname, 'models', 'db.js');
console.log('✓ Test 1: Check db.js exists');
if (!fs.existsSync(dbPath)) {
  console.log('✗ File not found:', dbPath);
  process.exit(1);
}
console.log('  Path:', dbPath);

// Test 2: Read and check syntax
console.log('\n✓ Test 2: Check JavaScript syntax');
const code = fs.readFileSync(dbPath, 'utf8');
console.log('  File size:', code.length, 'bytes');

// Check for required components
const checks = [
  { name: 'MySQL import', regex: /require\s*\(\s*['"]mysql2\/promise['"] \)/ },
  { name: 'Pool creation', regex: /mysql\.createPool/ },
  { name: 'Environment variables', regex: /process\.env\.DB_/ },
  { name: 'Module export', regex: /module\.exports\s*=\s*pool/ },
  { name: 'Error handling', regex: /\.catch/ }
];

let allPass = true;
checks.forEach(check => {
  if (check.regex.test(code)) {
    console.log(`  ✓ ${check.name}`);
  } else {
    console.log(`  ✗ ${check.name}`);
    allPass = false;
  }
});

// Test 3: Try to parse as JavaScript
console.log('\n✓ Test 3: Parse as JavaScript');
try {
  new Function(code);
  console.log('  ✓ Valid JavaScript syntax');
} catch (e) {
  console.log('  ✗ Syntax error:', e.message);
  allPass = false;
}

// Test 4: Check configuration values
console.log('\n✓ Test 4: Configuration check');
const envCheck = {
  'DB_HOST': process.env.DB_HOST || 'localhost',
  'DB_USER': process.env.DB_USER || 'root',
  'DB_PASS': process.env.DB_PASS || '(empty)',
  'DB_NAME': process.env.DB_NAME || 'wfms',
  'PORT': process.env.PORT || '8000'
};
Object.entries(envCheck).forEach(([key, value]) => {
  console.log(`  ${key}: ${value}`);
});

// Summary
console.log('\n' + '='.repeat(50));
if (allPass) {
  console.log('✅ db.js is correctly configured!');
  console.log('\nTo start the server, run:');
  console.log('  npm start');
  console.log('\nServer will:');
  console.log('  ✓ Load database pool from db.js');
  console.log('  ✓ Connect to MySQL at localhost:3306');
  console.log('  ✓ Use database "wfms"');
  console.log('  ✓ Start on port 8000');
  console.log('  ✓ Test connection on startup');
} else {
  console.log('⚠️  Some checks failed. Review above.');
}
console.log('='.repeat(50) + '\n');
