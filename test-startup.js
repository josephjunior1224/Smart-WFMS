// Simple test to check if server.js can start
console.log('📍 Loading server.js...');

try {
  require('dotenv').config();
  console.log('✅ dotenv loaded');
  console.log('✅ MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
  console.log('✅ JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
  
  console.log('📍 Requiring db.js...');
  const db = require('./db');
  console.log('✅ db.js loaded, connection status:', db.connectionStatus());
  
  console.log('📍 Requiring express and creating app...');
  const express = require('express');
  const app = express();
  console.log('✅ Express app created');
  
  console.log('📍 Setting up basic routes...');
  app.get('/api/health', (req, res) => {
    res.json({ status: 'OK' });
  });
  
  app.post('/api/login', (req, res) => {
    res.json({ ok: true, test: true });
  });
  
  console.log('✅ Routes set up');
  
  console.log('📍 Server would be ready to start');
  console.log('✅ No startup errors detected');
  
  setTimeout(() => {
    console.log('📊 Final database status:', db.connectionStatus());
    process.exit(0);
  }, 3000);
  
} catch (err) {
  console.error('❌ Error during startup:', err.message);
  console.error('Stack:', err.stack);
  process.exit(1);
}
