// db.js - Compatible with older Node versions
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  if (process.env.VERCEL) {
    console.error('Please add MONGODB_URI to your Vercel environment variables');
  }
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI)
  .then(function() {
    console.log('✅ MongoDB connected successfully');
  })
  .catch(function(err) {
    console.error('❌ MongoDB connection error:', err.message);
  });

// ========== SCHEMAS ==========
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'worker', enum: ['admin', 'worker'] },
  created_at: { type: Date, default: Date.now }
});

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

const qrCodeSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  qr_token: { type: String, required: true, unique: true },
  qr_data: String,
  generated_at: { type: Date, default: Date.now },
  first_scan_at: Date,
  scan_count: { type: Number, default: 0 },
  is_activated: { type: Boolean, default: false }
});

const qrScanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qr_token: String,
  scanned_at: { type: Date, default: Date.now },
  scanner_ip: String
});

const performanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  tasks_completed: { type: Number, default: 0 },
  tasks_assigned: { type: Number, default: 0 },
  total_hours_worked: { type: Number, default: 0 },
  completion_rate: { type: Number, default: 0 },
  last_updated: { type: Date, default: Date.now }
});

const attendanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: String,
  timestamp: { type: Date, default: Date.now }
});

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

// ========== EXPORT ==========
module.exports = {
  User,
  Task,
  QRCode,
  QRScan,
  Performance,
  Attendance,
  TimeLog,
  isConnected: function() { 
    return mongoose.connection.readyState === 1; 
  },
  connectionStatus: function() {
    var states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    return states[mongoose.connection.readyState] || 'unknown';
  }
};