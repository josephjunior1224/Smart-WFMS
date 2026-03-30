// db.js - Complete MongoDB configuration with all models
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.warn('⚠️ MONGODB_URI environment variable is not set. Database connection will fail without it.');
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ MONGODB_URI environment variable is required in production');
    process.exit(1);
  }
}

console.log('🔄 Connecting to MongoDB...');

// Connection options
const connectionOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 2,
};

// Connect to MongoDB with retry logic (skip in non-configured development)
let connectionRetries = 0;
const MAX_RETRIES = 5;

const connectWithRetry = () => {
  if (!MONGODB_URI) {
    console.warn('Skipping MongoDB connection: MONGODB_URI not provided');
    return;
  }

  mongoose.connect(MONGODB_URI, connectionOptions)
    .then(() => {
      console.log('✅ MongoDB connected successfully');
      console.log('📊 Database:', mongoose.connection.name);
      console.log('📊 Host:', mongoose.connection.host);
      connectionRetries = 0;
    })
    .catch(err => {
      connectionRetries++;
      console.error(`❌ MongoDB connection error (attempt ${connectionRetries}/${MAX_RETRIES}):`, err.message);

      if (connectionRetries < MAX_RETRIES) {
        const delay = 5000 * connectionRetries;
        console.log(`⏳ Retrying MongoDB connection in ${delay / 1000}s...`);
        setTimeout(connectWithRetry, delay);
      } else {
        console.error('❌ Max MongoDB connection retries reached.');
        if (process.env.NODE_ENV === 'production') process.exit(1);
      }
    });
};

connectWithRetry();

// Connection event handlers
mongoose.connection.on('error', err => {
  console.error('❌ MongoDB connection error:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected');
});

// Handle application termination
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('👋 MongoDB connection closed');
  process.exit(0);
});

// ========== SCHEMAS ==========

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: { type: String, required: true },
  role: { 
    type: String, 
    default: 'worker', 
    enum: ['admin', 'worker', 'team_lead', 'manager'] 
  },
  avatar: { type: String, default: null },
  department: { type: String, default: 'General' },
  position: { type: String, default: 'Employee' },
  phone: { type: String, default: '' },
  googleId: { type: String, sparse: true, index: true, default: null },
  teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
  preferences: {
    notifications: { type: Boolean, default: true },
    emailNotifications: { type: Boolean, default: true },
    theme: { type: String, default: 'dark' }
  },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  last_login: { type: Date, default: null },
  is_active: { type: Boolean, default: true }
});

// Add cascade delete for user deletion
userSchema.pre('remove', async function(next) {
  try {
    await QRCode.deleteMany({ user_id: this._id });
    await QRScan.deleteMany({ user_id: this._id });
    next();
  } catch (err) {
    next(err);
  }
});

// Task Schema
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  priority: { 
    type: String, 
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  category: { type: String, default: 'General' },
  tags: [{ type: String }],
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assigned_team: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  status: { 
    type: String, 
    enum: ['pending', 'in-progress', 'completed', 'blocked', 'review'],
    default: 'pending'
  },
  daily_report: { type: String, default: '' },
  submitted_at: { type: Date },
  hours_spent: { type: Number, default: 0, min: 0 },
  submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approval_status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'not_submitted'],
    default: 'not_submitted'
  },
  admin_feedback: { type: String, default: '' },
  approved_at: { type: Date },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // File attachments
  attachments: [{
    filename: { type: String, required: true },
    originalName: { type: String, required: true },
    path: { type: String, required: true },
    size: { type: Number },
    mimeType: { type: String },
    uploaded_at: { type: Date, default: Date.now },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  
  // Comments/Discussion
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, required: true },
    created_at: { type: Date, default: Date.now }
  }],
  
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  due_date: { type: Date },
  completed_at: { type: Date }
});

// Team Schema
const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: '' },
  department: { type: String, default: 'General' },
  team_lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  is_active: { type: Boolean, default: true }
});

// QR Code Schema
const qrCodeSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  qr_token: { type: String, required: true, unique: true },
  qr_data: { type: String, required: true },
  generated_at: { type: Date, default: Date.now },
  first_scan_at: { type: Date },
  last_scan_at: { type: Date },
  scan_count: { type: Number, default: 0 },
  is_activated: { type: Boolean, default: false },
  expires_at: { 
    type: Date, 
    required: true,
    default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
  },
  status: { 
    type: String, 
    enum: ['active', 'expired', 'revoked', 'suspended'], 
    default: 'active' 
  },
  last_action: { 
    type: String, 
    enum: ['login', 'clock_in', 'clock_out', 'break_start', 'break_end', 'verification', 'none'],
    default: 'none' 
  },
  last_action_at: { type: Date },
  generated_by_ip: { type: String },
  generated_by_user_agent: { type: String },
  bound_device_id: { type: String },
  bound_device_name: { type: String },
  allow_any_device: { type: Boolean, default: true },
  revoked_at: { type: Date },
  revoked_reason: { type: String },
  revoked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

// QR Scan Schema
const qrScanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qr_token: { type: String, required: true },
  scanned_at: { type: Date, default: Date.now },
  scanner_ip: { type: String },
  action: { 
    type: String, 
    enum: ['login', 'clock_in', 'clock_out', 'break_start', 'break_end', 'verification', 'attendance'],
    required: true 
  },
  user_agent: { type: String, default: '' },
  device_type: { 
    type: String, 
    enum: ['mobile', 'tablet', 'desktop', 'unknown'],
    default: 'unknown' 
  },
  browser: { type: String, default: '' },
  os: { type: String, default: '' },
  purpose: { 
    type: String, 
    enum: ['authentication', 'attendance', 'verification', 'recovery'],
    default: 'authentication' 
  },
  latitude: { type: Number },
  longitude: { type: Number },
  device_fingerprint: { type: String },
  location_name: { type: String }
});

// Performance Schema
const performanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  tasks_completed: { type: Number, default: 0 },
  tasks_assigned: { type: Number, default: 0 },
  tasks_in_progress: { type: Number, default: 0 },
  tasks_pending_review: { type: Number, default: 0 },
  tasks_rejected: { type: Number, default: 0 },
  total_hours_worked: { type: Number, default: 0 },
  completion_rate: { type: Number, default: 0 },
  
  // Task priority breakdown
  high_priority_completed: { type: Number, default: 0 },
  medium_priority_completed: { type: Number, default: 0 },
  low_priority_completed: { type: Number, default: 0 },
  critical_completed: { type: Number, default: 0 },
  
  // Monthly stats
  monthly_stats: [{
    month: { type: String },
    year: { type: Number },
    tasks_completed: { type: Number, default: 0 },
    tasks_assigned: { type: Number, default: 0 },
    hours_worked: { type: Number, default: 0 }
  }],
  
  last_updated: { type: Date, default: Date.now }
});

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { 
    type: String, 
    enum: ['clock_in', 'clock_out', 'break_start', 'break_end'],
    required: true 
  },
  timestamp: { type: Date, default: Date.now },
  ip_address: { type: String },
  notes: { type: String }
});

// Time Log Schema
const timeLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { 
    type: String, 
    enum: ['clock_in', 'clock_out', 'break_start', 'break_end', 'task_work'],
    required: true 
  },
  time: { type: Date, default: Date.now },
  task_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  created_at: { type: Date, default: Date.now }
});

// Token Blacklist Schema
const tokenBlacklistSchema = new mongoose.Schema({
  token: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  revoked_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true }
});

// Webhook Schema
const webhookSchema = new mongoose.Schema({
  name: { type: String, required: true },
  url: { type: String, required: true },
  events: [{ type: String, enum: ['qr_scan', 'qr_generate', 'qr_revoke'] }],
  secret: { type: String, required: true },
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now }
});

// Alert Schema
const alertSchema = new mongoose.Schema({
  type: { type: String, enum: ['security', 'system', 'user'], required: true },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  title: { type: String, required: true },
  message: { type: String, required: true },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  metadata: { type: mongoose.Schema.Types.Mixed },
  is_read: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now }
});

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resource_id: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  ip_address: { type: String },
  user_agent: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// Security Alert Schema
const securityAlertSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, required: true },
  patterns: [{ type: String }],
  ip: { type: String },
  user_agent: { type: String },
  created_at: { type: Date, default: Date.now }
});

// Session Schema
const sessionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  token: { type: String, required: true },
  login_method: { type: String, enum: ['password', 'google', 'qr'], default: 'password' },
  login_time: { type: Date, default: Date.now },
  last_activity: { type: Date, default: Date.now },
  ip_address: { type: String },
  user_agent: { type: String },
  device_fingerprint: { type: String },
  is_active: { type: Boolean, default: true }
});

// Webhook Failure Schema
const webhookFailureSchema = new mongoose.Schema({
  webhook_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook' },
  payload: { type: mongoose.Schema.Types.Mixed },
  error: { type: String },
  timestamp: { type: Date, default: Date.now }
});

// ========== Database Indexes ==========
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });
taskSchema.index({ assigned_to: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ approval_status: 1 });
taskSchema.index({ created_at: -1 });
attendanceSchema.index({ user_id: 1, timestamp: -1 });
timeLogSchema.index({ user_id: 1, time: -1 });
qrCodeSchema.index({ qr_token: 1 }, { unique: true });
qrCodeSchema.index({ user_id: 1 });
qrCodeSchema.index({ status: 1 });
qrCodeSchema.index({ expires_at: 1 });
qrScanSchema.index({ user_id: 1 });
qrScanSchema.index({ scanned_at: -1 });
qrScanSchema.index({ action: 1 });
qrScanSchema.index({ qr_token: 1 });
tokenBlacklistSchema.index({ token: 1 });
tokenBlacklistSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
auditLogSchema.index({ user_id: 1 });
auditLogSchema.index({ timestamp: -1 });
sessionSchema.index({ user_id: 1 });
sessionSchema.index({ token: 1 });
alertSchema.index({ created_at: -1 });
alertSchema.index({ is_read: 1 });

// ========== MODELS ==========
const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);
const Team = mongoose.model('Team', teamSchema);
const QRCode = mongoose.model('QRCode', qrCodeSchema);
const QRScan = mongoose.model('QRScan', qrScanSchema);
const Performance = mongoose.model('Performance', performanceSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);
const TimeLog = mongoose.model('TimeLog', timeLogSchema);
const TokenBlacklist = mongoose.model('TokenBlacklist', tokenBlacklistSchema);
const Webhook = mongoose.model('Webhook', webhookSchema);
const Alert = mongoose.model('Alert', alertSchema);
const AuditLog = mongoose.model('AuditLog', auditLogSchema);
const SecurityAlert = mongoose.model('SecurityAlert', securityAlertSchema);
const Session = mongoose.model('Session', sessionSchema);
const WebhookFailure = mongoose.model('WebhookFailure', webhookFailureSchema);

// ========== HELPER FUNCTIONS ==========
const isConnected = () => mongoose.connection.readyState === 1;

const connectionStatus = () => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  return states[mongoose.connection.readyState] || 'unknown';
};

const getDatabaseStats = async () => {
  try {
    const stats = {
      users: await User.countDocuments(),
      tasks: await Task.countDocuments(),
      teams: await Team.countDocuments(),
      activeUsers: await User.countDocuments({ is_active: true }),
      pendingTasks: await Task.countDocuments({ approval_status: 'pending' }),
      completedTasks: await Task.countDocuments({ approval_status: 'approved' })
    };
    return stats;
  } catch (err) {
    console.error('Error getting database stats:', err);
    return null;
  }
};

// ========== EXPORT ==========
module.exports = {
  User,
  Task,
  Team,
  QRCode,
  QRScan,
  Performance,
  Attendance,
  TimeLog,
  TokenBlacklist,
  Webhook,
  Alert,
  AuditLog,
  SecurityAlert,
  Session,
  WebhookFailure,
  isConnected,
  connectionStatus,
  getDatabaseStats,
  mongoose
};