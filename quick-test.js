
const mongoose = require('mongoose');
const uri = 'mongodb+srv://josephjuniorottowilson_db_user:12blackSt%40*@cluster0.tvdktss.mongodb.net/wfms?retryWrites=true&w=majority&appName=Cluster0';
console.log('?? Testing MongoDB connection...');
console.log('URI (hidden password):', uri.replace(/:[^@]*@/, ':****@'));
mongoose.connect(uri, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('? SUCCESS! Connected to MongoDB');
  console.log('Database:', mongoose.connection.name);
  console.log('Host:', mongoose.connection.host);
  return mongoose.connection.close();
})
.then(() => console.log('?? Connection closed'))
.catch(err => {
  console.error('? Connection failed:');
  console.error('Error name:', err.name);
  console.error('Error message:', err.message);
  if (err.cause) console.error('Cause:', err.cause);
});
