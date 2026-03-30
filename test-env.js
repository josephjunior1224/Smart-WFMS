require('dotenv').config();
console.log('=== ENVIRONMENT VARIABLE TEST ===');
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('JWT_SECRET:', process.env.JWT_SECRET);
console.log('PORT:', process.env.PORT);
console.log('==================================');