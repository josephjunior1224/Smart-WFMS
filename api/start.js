// start.js - Local development entry point
require('dotenv').config();
const app = require('./api/index');

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 MongoDB: ${process.env.MONGODB_URI ? 'Connected' : 'Not set - check .env file'}`);
});