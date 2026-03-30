require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env file!');
  process.exit(1);
}

console.log('🔍 Connecting to MongoDB...');
console.log('URI starts with:', MONGODB_URI.substring(0, 30) + '...');

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  created_at: Date
});

const User = mongoose.model('User', userSchema);

mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(async () => {
  console.log('✅ Connected to MongoDB');
  
  const users = await User.find({});
  console.log('\n📊 Users in database:', users.length);
  
  if (users.length === 0) {
    console.log('No users found. You need to create some users first.');
  } else {
    users.forEach((user, i) => {
      console.log(`\n👤 User ${i + 1}:`);
      console.log(`  ID: ${user._id}`);
      console.log(`  Name: ${user.name}`);
      console.log(`  Email: ${user.email}`);
      console.log(`  Role: ${user.role}`);
    });
  }
  
  await mongoose.connection.close();
  console.log('\n👋 Connection closed');
})
.catch(err => {
  console.error('❌ Error:', err.message);
});