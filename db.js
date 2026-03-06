// db.js - Complete MongoDB version for Vercel with all schemas
const mongoose = require('mongoose');

// Check if we're in production (Vercel) or development
const isVercel = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production';

// MongoDB Connection URI
let MONGODB_URI = process.env.MONGODB_URI;

// Handle MongoDB connection
if (!MONGODB_URI) {
  if (isVercel) {
    console.error('❌ MONGODB_URI environment variable is required on Vercel');
    console.error('Please add MONGODB_URI to your Vercel environment variables.');
    process.exit(1);
  } else {
    console.warn('⚠️ MONGODB_URI not set. Using fallback for development.');
    console.warn('Please create a .env file with your MongoDB connection string.');
    console.warn('Example: MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/wfms');
    console.warn('⚠️ Continuing without database - API calls will fail!');
  }
} else {
// Connect to MongoDB - remove deprecated options
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));
    .then(() => console.log('✅ MongoDB connected successfully'))
    .catch(err => {
      console.error('❌ MongoDB connection error:', err.message);
      if (isVercel) {
        console.error('Fatal error on Vercel - exiting');
        process.exit(1);
      }
    });
}

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
});

// ========== SCHEMA DEFINITIONS ==========

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'worker', enum: ['admin', 'worker'] },
  created_at: { type: Date, default: Date.now }
});

// Task Schema
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'in-progress', 'submitted', 'completed', 'done'] 
  },
  daily_report: { type: String, default: '' },
  submitted_at: { type: Date },
  hours_spent: { type: Number, default: 0 },
  submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approval_status: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'approved', 'rejected'] 
  },
  admin_feedback: { type: String, default: '' },
  approved_at: { type: Date },
  created_at: { type: Date, default: Date.now }
});

// QR Code Schema
const qrCodeSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  qr_token: { type: String, required: true, unique: true },
  qr_data: { type: String, required: true },
  generated_at: { type: Date, default: Date.now },
  first_scan_at: { type: Date },
  scan_count: { type: Number, default: 0 },
  is_activated: { type: Boolean, default: false }
});

// QR Scan Schema
const qrScanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qr_token: { type: String, required: true },
  scanned_at: { type: Date, default: Date.now },
  scanner_ip: { type: String, default: '0.0.0.0' }
});

// Performance Metrics Schema
const performanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  tasks_completed: { type: Number, default: 0 },
  tasks_assigned: { type: Number, default: 0 },
  total_hours_worked: { type: Number, default: 0 },
  completion_rate: { type: Number, default: 0 },
  last_updated: { type: Date, default: Date.now }
});

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { 
    type: String, 
    required: true,
    enum: ['clock_in', 'clock_out', 'break_start', 'break_end']
  },
  timestamp: { type: Date, default: Date.now }
});

// Time Log Schema
const timeLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  time: { type: Date, default: Date.now },
  created_at: { type: Date, default: Date.now }
});

// ========== CREATE MODELS ==========

// Only create models if mongoose is connected, otherwise create placeholder models
let User, Task, QRCode, QRScan, Performance, Attendance, TimeLog;

try {
  User = mongoose.model('User', userSchema);
  Task = mongoose.model('Task', taskSchema);
  QRCode = mongoose.model('QRCode', qrCodeSchema);
  QRScan = mongoose.model('QRScan', qrScanSchema);
  Performance = mongoose.model('Performance', performanceSchema);
  Attendance = mongoose.model('Attendance', attendanceSchema);
  TimeLog = mongoose.model('TimeLog', timeLogSchema);
  
  console.log('✅ MongoDB models created successfully');
} catch (error) {
  console.error('❌ Error creating MongoDB models:', error.message);
  
  // Create placeholder models for when MongoDB is not connected
  // These will throw errors when used, but prevent the app from crashing on startup
  const createPlaceholderModel = (name) => {
    const placeholderSchema = new mongoose.Schema({}, { strict: false });
    return mongoose.models[name] || mongoose.model(name, placeholderSchema);
  };
  
  User = createPlaceholderModel('User');
  Task = createPlaceholderModel('Task');
  QRCode = createPlaceholderModel('QRCode');
  QRScan = createPlaceholderModel('QRScan');
  Performance = createPlaceholderModel('Performance');
  Attendance = createPlaceholderModel('Attendance');
  TimeLog = createPlaceholderModel('TimeLog');
}

// ========== HELPER FUNCTIONS ==========

// Safe database operations with error handling
const dbGet = async (model, query = {}, options = {}) => {
  try {
    if (!model) throw new Error('Model not initialized');
    return await model.findOne(query, options);
  } catch (err) {
    console.error('❌ dbGet error:', err.message);
    return null;
  }
};

const dbAll = async (model, query = {}, options = {}) => {
  try {
    if (!model) throw new Error('Model not initialized');
    return await model.find(query, options);
  } catch (err) {
    console.error('❌ dbAll error:', err.message);
    return [];
  }
};

const dbRun = async (operation) => {
  try {
    return await operation;
  } catch (err) {
    console.error('❌ dbRun error:', err.message);
    throw err;
  }
};

// Create indexes for better performance
const createIndexes = async () => {
  try {
    if (mongoose.connection.readyState === 1) {
      await User.createIndexes();
      await Task.createIndexes();
      await QRCode.createIndexes();
      await QRScan.createIndexes();
      await Performance.createIndexes();
      console.log('✅ Database indexes created');
    }
  } catch (err) {
    console.error('❌ Error creating indexes:', err.message);
  }
};

// Call createIndexes when connected
if (mongoose.connection.readyState === 1) {
  createIndexes();
} else {
  mongoose.connection.once('connected', createIndexes);
}

// ========== EXPORT ==========

module.exports = {
  // Models
  User,
  Task,
  QRCode,
  QRScan,
  Performance,
  Attendance,
  TimeLog,
  
  // Helper functions
  dbGet,
  dbAll,
  dbRun,
  
  // Mongoose instance
  mongoose,
  
  // Connection state helper
  isConnected: () => mongoose.connection.readyState === 1,
  
  // Get connection status
  connectionStatus: () => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return states[mongoose.connection.readyState] || 'unknown';
  }
};