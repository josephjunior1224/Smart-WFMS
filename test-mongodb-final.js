// test-mongodb-final.js
require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGODB_URI;
console.log('🔍 Testing MongoDB Connection...');
console.log('URI starts with:', uri ? uri.substring(0, 30) + '...' : '❌ Not found');
console.log('Full URI (first 50 chars):', uri ? uri.substring(0, 50) + '...' : 'N/A');

if (!uri) {
  console.error('❌ MONGODB_URI not found in .env file!');
  process.exit(1);
}

console.log('🔄 Attempting to connect... (this may take a few seconds)');

// Remove deprecated options - they're not needed in newer Mongoose versions
mongoose.connect(uri)
.then(() => {
  console.log('✅✅✅ SUCCESS! Connected to MongoDB Atlas');
  console.log('📊 Database name:', mongoose.connection.name);
  console.log('📊 Host:', mongoose.connection.host);
  
  // List all collections
  return mongoose.connection.db.listCollections().toArray();
})
.then(collections => {
  console.log('📊 Existing collections:', collections.map(c => c.name).join(', ') || 'none');
  mongoose.connection.close();
  console.log('👋 Connection closed');
})
.catch(err => {
  console.error('❌❌❌ Connection failed!');
  console.error('Error code:', err.code);
  console.error('Error message:', err.message);
  console.error('Full error:', err);
});