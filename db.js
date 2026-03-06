// db.js - MongoDB version for Vercel
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  process.exit(1);
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ========== SCHEMAS ==========

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
  description: String,
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, default: 'pending' },
  daily_report: String,
  submitted_at: Date,
  hours_spent: { type: Number, default: 0 },
  submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approval_status: { type: String, default: 'pending' },
  admin_feedback: String,
  approved_at: Date,
  created_at: { type: Date, default: Date.now }
});

// QR Code Schema
const qrCodeSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qr_token: { type: String, required: true, unique: true },
  qr_data: String,
  generated_at: { type: Date, default: Date.now },
  first_scan_at: Date,
  scan_count: { type: Number, default: 0 },
  is_activated: { type: Boolean, default: false }
});

// QR Scan Schema
const qrScanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qr_token: String,
  scanned_at: { type: Date, default: Date.now },
  scanner_ip: String
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
  action: String,
  timestamp: { type: Date, default: Date.now }
});

// Time Log Schema
const timeLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: String,
  time: Date,
  created_at: { type: Date, default: Date.now }
});

// ========== MODELS ==========
const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);
const QRCode = mongoose.model('QRCode', qrCodeSchema);
const QRScan = mongoose.model('QRScan', qrScanSchema);
const Performance = mongoose.model('Performance', performanceSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);
const TimeLog = mongoose.model('TimeLog', timeLogSchema);

// ========== HELPER FUNCTIONS ==========
const dbGet = async (model, query = {}) => {
  try {
    return await model.findOne(query);
  } catch (err) {
    console.error('dbGet error:', err);
    return null;
  }
};

const dbAll = async (model, query = {}) => {
  try {
    return await model.find(query);
  } catch (err) {
    console.error('dbAll error:', err);
    return [];
  }
};

const dbRun = async (operation) => {
  try {
    return await operation;
  } catch (err) {
    console.error('dbRun error:', err);
    throw err;
  }
};

module.exports = {
  User,
  Task,
  QRCode,
  QRScan,
  Performance,
  Attendance,
  TimeLog,
  dbGet,
  dbAll,
  dbRun,
  mongoose
};