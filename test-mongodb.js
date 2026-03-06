// test-mongodb.js
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
console.log('🔍 Testing MongoDB Connection...');
console.log('URI starts with:', uri ? uri.substring(0, 30) + '...' : '❌ Not found');

if (!uri) {
  console.error('❌ MONGODB_URI not found in .env file!');
  process.exit(1);
}

mongoose.connect(uri)
  .then(() => {
    console.log('✅ SUCCESS! Connected to MongoDB Atlas');
    console.log('Database:', mongoose.connection.name);
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('❌ Connection failed:', err.message);
  });