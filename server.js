// ===============================================
// WFMS SERVER - COMPLETE PRODUCTION BUILD
// ===============================================

console.log('🚀 STARTING WFMS SERVER v5.0 - COMPLETE FEATURE SET');
require('dotenv').config();

// ===============================================
// CORE MODULES
// ===============================================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const http = require('http');
const QR = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const NodeCache = require('node-cache');
const socketIo = require('socket.io');
const ExcelJS = require('exceljs');

// ===============================================
// CONFIGURATION
// ===============================================
const PORT = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'wfms-super-secret-key-change-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/wfms';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Cache setup
const cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// ===============================================
// EXPRESS APP SETUP
// ===============================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: NODE_ENV === 'production' ? [process.env.FRONTEND_URL || 'https://your-domain.com'] : ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8000'],
    credentials: true
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: true, credentials: true }));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

// Static files
app.use(express.static(path.join(__dirname)));

// ===============================================
// MULTER SETUP FOR FILE UPLOADS
// ===============================================
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'));
    }
  }
});

// ===============================================
// RATE LIMITING
// ===============================================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 1000,
  message: { ok: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Too many login attempts, try again later.' }
});
app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);

// ===============================================
// MONGODB CONNECTION
// ===============================================
let dbConnected = false;

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB Connected');
    dbConnected = true;
  })
  .catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    dbConnected = false;
  });

mongoose.connection.on('error', err => {
  console.error('MongoDB error:', err);
  dbConnected = false;
});

mongoose.connection.on('reconnect', () => {
  console.log('MongoDB reconnected');
  dbConnected = true;
});

const isConnected = () => dbConnected && mongoose.connection.readyState === 1;

// ===============================================
// DATABASE MODELS
// ===============================================

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'superadmin', 'manager', 'employee', 'worker'], default: 'employee' },
  department: { type: String, default: '' },
  position: { type: String, default: '' },
  phone: { type: String, default: '' },
  avatar: { type: String, default: '' },
  is_active: { type: Boolean, default: true },
  can_impersonate: { type: Boolean, default: false },
  qr_token: { type: String },
  qr_code_data: { type: String },
  qr_created_at: Date,
  qr_expires_at: Date,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Task Schema
const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, default: '' },
  assigned_to: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['pending', 'in-progress', 'completed', 'submitted'], default: 'pending' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent', 'critical'], default: 'medium' },
  category: { type: String, default: 'General' },
  due_date: Date,
  started_at: Date,
  completed_at: Date,
  progress: { type: Number, default: 0, min: 0, max: 100 },
  daily_report: { type: String, default: '' },
  hours_spent: { type: Number, default: 0 },
  approval_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  admin_feedback: { type: String, default: '' },
  submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submitted_at: Date,
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: Date,
  timeLogs: [{
    hours: Number,
    description: String,
    logged_at: { type: Date, default: Date.now },
    logged_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimeType: String,
    uploaded_at: { type: Date, default: Date.now },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  comments: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    created_at: { type: Date, default: Date.now }
  }],
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const Task = mongoose.model('Task', taskSchema);

// Attendance Schema
const attendanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, enum: ['clock_in', 'clock_out', 'break_start', 'break_end', 'login'], required: true },
  timestamp: { type: Date, default: Date.now },
  ip_address: { type: String, default: '' },
  notes: { type: String, default: '' },
  location: { type: String, default: '' },
  device_info: { type: String, default: '' }
});

const Attendance = mongoose.model('Attendance', attendanceSchema);

// QR Code Schema
const qrCodeSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qr_token: { type: String, required: true, unique: true },
  qr_data: { type: String, required: true },
  generated_at: { type: Date, default: Date.now },
  expires_at: { type: Date },
  is_activated: { type: Boolean, default: false },
  first_scan_at: Date,
  last_scan_at: Date,
  scan_count: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'revoked', 'expired'], default: 'active' },
  revoked_at: Date,
  revoked_reason: String,
  revoked_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const QRCode = mongoose.model('QRCode', qrCodeSchema);

// QR Scan Schema
const qrScanSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  qr_token: { type: String, required: true },
  scanned_at: { type: Date, default: Date.now },
  scanner_ip: { type: String, default: '' },
  action: { type: String, default: 'scan' },
  location: String
});

const QRScan = mongoose.model('QRScan', qrScanSchema);

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String, required: true },
  resource: { type: String },
  resource_id: { type: String },
  details: { type: mongoose.Schema.Types.Mixed },
  ip_address: { type: String },
  user_agent: { type: String },
  created_at: { type: Date, default: Date.now }
});

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

// Performance Schema
const performanceSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
  tasks_assigned: { type: Number, default: 0 },
  tasks_completed: { type: Number, default: 0 },
  tasks_pending: { type: Number, default: 0 },
  tasks_in_progress: { type: Number, default: 0 },
  tasks_rejected: { type: Number, default: 0 },
  total_hours_worked: { type: Number, default: 0 },
  completion_rate: { type: Number, default: 0 },
  attendance_rate: { type: Number, default: 0 },
  last_updated: { type: Date, default: Date.now }
});

const Performance = mongoose.model('Performance', performanceSchema);

// Team Schema
const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  department: { type: String, default: '' },
  costCenter: { type: String, default: '' },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  teamLead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assistantLead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['member', 'lead', 'assistant', 'trainer'], default: 'member' },
    joined_at: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'transferred'], default: 'active' }
  }],
  defaultShiftPattern: {
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '17:00' },
    breakDuration: { type: Number, default: 30 },
    workDays: [{ type: Number, enum: [0, 1, 2, 3, 4, 5, 6] }]
  },
  schedulingRules: {
    minStaffPerShift: { type: Number, default: 1 },
    maxOvertimeHours: { type: Number, default: 10 },
    shiftSwapApprovalRequired: { type: Boolean, default: true },
    timeOffRequestLeadDays: { type: Number, default: 14 }
  },
  status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
  location: { type: String, default: '' },
  timezone: { type: String, default: 'UTC' },
  stats: {
    memberCount: { type: Number, default: 0 },
    activeMemberCount: { type: Number, default: 0 },
    averageAttendance: { type: Number, default: 0 },
    averagePerformance: { type: Number, default: 0 }
  },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now }
});

teamSchema.methods.addMember = async function(userId, role = 'member') {
  if (!this.members.some(m => m.user_id.toString() === userId.toString())) {
    this.members.push({ user_id: userId, role, joined_at: new Date() });
    this.stats.memberCount = this.members.length;
    this.stats.activeMemberCount = this.members.filter(m => m.status === 'active').length;
    await this.save();
  }
  return this;
};

teamSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(m => m.user_id.toString() !== userId.toString());
  this.stats.memberCount = this.members.length;
  this.stats.activeMemberCount = this.members.filter(m => m.status === 'active').length;
  await this.save();
  return this;
};

teamSchema.methods.updateMemberRole = async function(userId, newRole) {
  const member = this.members.find(m => m.user_id.toString() === userId.toString());
  if (member) {
    member.role = newRole;
    await this.save();
  }
  return this;
};

const Team = mongoose.model('Team', teamSchema);

// Attendance Summary Schema
const attendanceSummarySchema = new mongoose.Schema({
  weekStart: { type: Date, required: true },
  weekEnd: { type: Date, required: true },
  team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  department: { type: String },
  summary: {
    totalEmployees: { type: Number, default: 0 },
    totalPresent: { type: Number, default: 0 },
    totalAbsent: { type: Number, default: 0 },
    totalLate: { type: Number, default: 0 },
    totalOvertime: { type: Number, default: 0 },
    averageHours: { type: Number, default: 0 }
  },
  employeeDetails: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    department: String,
    totalHours: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    status: { type: String, enum: ['excellent', 'good', 'warning', 'poor'], default: 'good' }
  }],
  generated_at: { type: Date, default: Date.now },
  generated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

const AttendanceSummary = mongoose.model('AttendanceSummary', attendanceSummarySchema);

// Report Template Schema
const reportTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['attendance', 'performance', 'schedule', 'team'], required: true },
  description: { type: String, default: '' },
  config: {
    metrics: [{ type: String }],
    filters: {
      teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],
      departments: [{ type: String }],
      dateRange: { type: String, enum: ['week', 'month', 'quarter', 'year'], default: 'week' },
      compareWithPrevious: { type: Boolean, default: true }
    },
    chartTypes: [{ type: String }],
    exportFormat: { type: String, enum: ['pdf', 'excel', 'csv'], default: 'pdf' }
  },
  usageCount: { type: Number, default: 0 },
  lastUsed: Date,
  isPublic: { type: Boolean, default: false },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now }
});

const ReportTemplate = mongoose.model('ReportTemplate', reportTemplateSchema);

// Impersonation Session Schema
const impersonationSessionSchema = new mongoose.Schema({
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  target_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admin_name: { type: String, required: true },
  target_user_name: { type: String, required: true },
  action: { type: String, enum: ['START', 'END', 'FORCE_TERMINATE'], required: true },
  timestamp: { type: Date, default: Date.now },
  ended_at: Date,
  ip_address: { type: String, required: true },
  reason: { type: String, required: true },
  duration_seconds: { type: Number, default: 0 },
  actions_performed: [{ type: String }],
  mfa_verified: { type: Boolean, default: false },
  session_token: { type: String, unique: true },
  is_active: { type: Boolean, default: true },
  ended_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  force_terminated: { type: Boolean, default: false },
  target_notification_sent: { type: Boolean, default: false }
}, { timestamps: true });

const ImpersonationSession = mongoose.model('ImpersonationSession', impersonationSessionSchema);

// Session Schema
const sessionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  token: { type: String },
  login_method: { type: String, enum: ['password', 'qr', 'google'], default: 'password' },
  login_time: { type: Date, default: Date.now },
  last_activity: { type: Date, default: Date.now },
  ip_address: { type: String },
  user_agent: { type: String },
  is_active: { type: Boolean, default: true }
});

const Session = mongoose.model('Session', sessionSchema);

// Leave Request Schema
const leaveRequestSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['annual', 'sick', 'unpaid', 'emergency'], required: true },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: Date,
  comments: String,
  created_at: { type: Date, default: Date.now }
});

const LeaveRequest = mongoose.model('LeaveRequest', leaveRequestSchema);

// ===============================================
// SOCKET.IO SETUP
// ===============================================
const connectedUsers = {};

io.on('connection', (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on('register-user', (userId) => {
    if (userId) {
      connectedUsers[userId] = socket.id;
      console.log(`✅ User ${userId} registered`);
      socket.emit('connected', { status: 'ok', userId });
    }
  });

  socket.on('join-dashboard', () => {
    socket.join('dashboard-room');
    console.log('Client joined dashboard room');
  });

  socket.on('disconnect', () => {
    for (const [userId, socketId] of Object.entries(connectedUsers)) {
      if (socketId === socket.id) {
        delete connectedUsers[userId];
        console.log(`🔌 User ${userId} disconnected`);
        break;
      }
    }
  });
});

async function broadcastDashboardUpdate() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      totalEmployees: await User.countDocuments({ role: { $nin: ['admin', 'superadmin'] } }),
      presentToday: await Attendance.countDocuments({ timestamp: { $gte: today }, action: 'clock_in' }),
      pendingTasks: await Task.countDocuments({ approval_status: 'pending' }),
      completedTasks: await Task.countDocuments({ approval_status: 'approved' })
    };
    
    io.to('dashboard-room').emit('dashboard-update', stats);
  } catch (err) {
    console.error('Dashboard broadcast error:', err);
  }
}

// ===============================================
// HELPER FUNCTIONS
// ===============================================

async function getDatabaseStats() {
  try {
    return {
      users: await User.countDocuments(),
      tasks: await Task.countDocuments(),
      activeUsers: await User.countDocuments({ is_active: true }),
      pendingTasks: await Task.countDocuments({ approval_status: 'pending' })
    };
  } catch (err) {
    return { error: err.message };
  }
}

async function recordAttendance(userId, action, req, options = {}) {
  const allowedActions = ['clock_in', 'clock_out', 'break_start', 'break_end', 'login'];
  if (!allowedActions.includes(action)) {
    throw new Error('Invalid attendance action');
  }

  const ip = req?.ip || req?.connection?.remoteAddress || '0.0.0.0';

  const attendance = new Attendance({
    user_id: userId,
    action: action,
    timestamp: new Date(),
    ip_address: ip,
    notes: options.notes || ''
  });
  await attendance.save();

  return { recorded: true, action, timestamp: attendance.timestamp, attendanceId: attendance._id };
}

// ===============================================
// AUTHENTICATION MIDDLEWARE
// ===============================================

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ ok: false, error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    if (decoded.is_impersonating) {
      req.isImpersonating = true;
      req.originalAdminId = decoded.admin_id;
      req.impersonationSessionToken = decoded.session_token;
    }
    
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(403).json({ ok: false, error: 'Invalid or expired token' });
  }
};

const requireAdmin = async (req, res, next) => {
  if (req.user?.role === 'admin' || req.user?.role === 'superadmin') {
    next();
  } else {
    res.status(403).json({ ok: false, error: 'Admin access required' });
  }
};

const requireSuperAdmin = async (req, res, next) => {
  if (req.user?.role === 'superadmin') {
    next();
  } else {
    res.status(403).json({ ok: false, error: 'Superadmin access required' });
  }
};

// ===============================================
// AUTH ROUTES
// ===============================================

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: { connected: isConnected() },
    environment: NODE_ENV
  });
});

app.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    res.json({ ok: true, exists: !!user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Name, email, and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hashedPassword,
      role: role || 'employee',
      department: department || '',
      is_active: true
    });

    await user.save();

    // Generate QR code for the user
    const qrToken = uuidv4();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const qrLoginUrl = `${baseUrl}/qr-login.html?token=${qrToken}`;
    
    const qrData = await QR.toDataURL(qrLoginUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 500,
      margin: 2,
      color: { dark: '#00F0FF', light: '#0B0B0B' }
    });
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    const qrCode = new QRCode({
      user_id: user._id,
      qr_token: qrToken,
      qr_data: qrData,
      generated_at: new Date(),
      expires_at: expiresAt,
      status: 'active',
      scan_count: 0
    });
    
    await qrCode.save();
    
    user.qr_token = qrToken;
    user.qr_code_data = qrData;
    user.qr_expires_at = expiresAt;
    await user.save();

    res.json({
      ok: true,
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      qrData: qrData,
      qrToken: qrToken,
      expiresAt: expiresAt,
      message: 'Account created successfully! Save your QR code for easy login.'
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(401).json({ ok: false, error: 'Account is deactivated' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const refreshToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });

    await Session.create({
      user_id: user._id,
      token: token,
      login_method: 'password',
      login_time: new Date(),
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    await recordAttendance(user._id, 'login', req, { skipValidation: true });

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      },
      token,
      refreshToken,
      expiresIn: 604800
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ ok: false, error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'User not found' });
    }

    const newToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ ok: true, token: newToken, expiresIn: 604800 });
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Invalid refresh token' });
  }
});

app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ created_at: -1 });
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, department, position, phone, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    if (name) user.name = name;
    if (department) user.department = department;
    if (position) user.position = position;
    if (phone) user.phone = phone;

    if (email && email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ ok: false, error: 'Email already in use' });
      }
      user.email = email;
    }

    if (currentPassword && newPassword) {
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return res.status(401).json({ ok: false, error: 'Current password is incorrect' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    user.updated_at = new Date();
    await user.save();

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        position: user.position,
        phone: user.phone
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// QR CODE ROUTES
// ===============================================

app.post('/api/qr/generate-user', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    let qrCode = await QRCode.findOne({ user_id: userId });
    
    if (qrCode && qrCode.status === 'active' && new Date() < qrCode.expires_at) {
      return res.json({
        ok: true,
        qrToken: qrCode.qr_token,
        qrData: qrCode.qr_data,
        expiresAt: qrCode.expires_at,
        isNew: false
      });
    }
    
    const qrToken = uuidv4();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const qrLoginUrl = `${baseUrl}/qr-login.html?token=${qrToken}`;
    
    const qrData = await QR.toDataURL(qrLoginUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 500,
      margin: 2,
      color: { dark: '#00F0FF', light: '#0B0B0B' }
    });
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);
    
    if (qrCode) {
      qrCode.qr_token = qrToken;
      qrCode.qr_data = qrData;
      qrCode.expires_at = expiresAt;
      qrCode.status = 'active';
      qrCode.generated_at = new Date();
      await qrCode.save();
    } else {
      qrCode = new QRCode({
        user_id: userId,
        qr_token: qrToken,
        qr_data: qrData,
        generated_at: new Date(),
        expires_at: expiresAt,
        status: 'active',
        scan_count: 0
      });
      await qrCode.save();
    }
    
    await User.findByIdAndUpdate(userId, {
      qr_token: qrToken,
      qr_code_data: qrData,
      qr_expires_at: expiresAt
    });
    
    res.json({
      ok: true,
      qrToken,
      qrData,
      expiresAt,
      isNew: true
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/qr/my-code', authenticateToken, async (req, res) => {
  try {
    let qrCode = await QRCode.findOne({ user_id: req.user.id });
    
    if (!qrCode || qrCode.status !== 'active' || new Date() > qrCode.expires_at) {
      const response = await fetch(`${req.protocol}://${req.get('host')}/api/qr/generate-user`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
      });
      const data = await response.json();
      if (data.ok) {
        qrCode = await QRCode.findOne({ user_id: req.user.id });
      }
    }
    
    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'QR code not found' });
    }
    
    const scanHistory = await QRScan.find({ user_id: req.user.id })
      .sort({ scanned_at: -1 })
      .limit(10);
    
    res.json({
      ok: true,
      qrData: qrCode.qr_data,
      qrToken: qrCode.qr_token,
      expiresAt: qrCode.expires_at,
      scanCount: qrCode.scan_count || 0,
      scanHistory: scanHistory.map(s => ({
        scanned_at: s.scanned_at,
        scanner_ip: s.scanner_ip,
        action: s.action
      }))
    });
  } catch (err) {
    console.error('Get QR error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/qr-login', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ ok: false, error: 'QR token required' });
    }
    
    const qrCode = await QRCode.findOne({ qr_token: token }).populate('user_id');
    
    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'Invalid QR code' });
    }
    
    if (qrCode.expires_at && new Date() > qrCode.expires_at) {
      return res.status(401).json({ ok: false, error: 'QR code has expired. Please generate a new one.' });
    }
    
    if (qrCode.status === 'revoked') {
      return res.status(401).json({ ok: false, error: 'QR code has been revoked. Please contact admin.' });
    }
    
    const user = qrCode.user_id;
    
    if (!user || !user.is_active) {
      return res.status(401).json({ ok: false, error: 'Account is deactivated' });
    }
    
    await QRScan.create({
      user_id: user._id,
      qr_token: token,
      scanned_at: new Date(),
      scanner_ip: req.ip || req.connection?.remoteAddress || '0.0.0.0',
      action: 'login',
      user_agent: req.headers['user-agent']
    });
    
    qrCode.scan_count = (qrCode.scan_count || 0) + 1;
    qrCode.last_scan_at = new Date();
    if (!qrCode.is_activated) {
      qrCode.is_activated = true;
      qrCode.first_scan_at = new Date();
    }
    await qrCode.save();
    
    const jwtToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
    
    try {
      await recordAttendance(user._id, 'login', req, { skipValidation: true });
    } catch (attErr) {
      console.log('Attendance record skipped for QR login');
    }
    
    res.json({
      ok: true,
      token: jwtToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      },
      scanCount: qrCode.scan_count,
      message: `Welcome back, ${user.name}!`
    });
  } catch (err) {
    console.error('QR login error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/qr/regenerate', authenticateToken, async (req, res) => {
  try {
    await QRCode.updateOne({ user_id: req.user.id }, { status: 'expired' });
    
    const response = await fetch(`${req.protocol}://${req.get('host')}/api/qr/generate-user`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// ATTENDANCE ROUTES
// ===============================================

app.post('/api/attendance', authenticateToken, async (req, res) => {
  try {
    const { action } = req.body;
    
    if (!action) {
      return res.status(400).json({ ok: false, error: 'Action required' });
    }
    
    const allowedActions = ['clock_in', 'clock_out', 'break_start', 'break_end'];
    if (!allowedActions.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Invalid action' });
    }
    
    const result = await recordAttendance(req.user.id, action, req);
    
    if (result.recorded) {
      res.json({ ok: true, message: `${action} recorded`, timestamp: result.timestamp });
    } else {
      res.status(400).json({ ok: false, error: result.reason || 'Failed to record attendance' });
    }
  } catch (err) {
    console.error('Attendance record error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/attendance/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const records = await Attendance.find({
      user_id: userId,
      timestamp: { $gte: startDate }
    }).sort({ timestamp: -1 });
    
    res.json({ ok: true, records });
  } catch (err) {
    console.error('My attendance error:', err);
    res.status(500).json({ ok: false, records: [], error: err.message });
  }
});

app.get('/api/attendance/summary/weekly', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    let query = { timestamp: { $gte: startOfWeek, $lte: endOfWeek } };
    
    if (req.user.role !== 'admin') {
      query.user_id = req.user.id;
    }
    
    const records = await Attendance.find(query).populate('user_id', 'name email department');
    const uniqueUsers = new Set(records.map(r => r.user_id?._id?.toString() || r.user_id?.toString()));
    
    const userMap = new Map();
    records.forEach(record => {
      const userId = record.user_id?._id?.toString() || record.user_id?.toString();
      if (!userMap.has(userId)) {
        userMap.set(userId, {
          user_id: userId,
          name: record.user_id?.name || 'Unknown',
          department: record.user_id?.department || '',
          totalHours: 0,
          lateDays: 0,
          absentDays: 0,
          status: 'good'
        });
      }
      const userData = userMap.get(userId);
      if (record.action === 'clock_in') {
        userData.totalHours += 8;
      }
      if (record.notes?.includes('late')) {
        userData.lateDays++;
      }
    });
    
    const employeeDetails = Array.from(userMap.values());
    const totalEmployees = employeeDetails.length;
    const totalPresent = employeeDetails.filter(e => e.absentDays < 5).length;
    const totalAbsent = employeeDetails.filter(e => e.absentDays === 5).length;
    const totalLate = employeeDetails.reduce((sum, e) => sum + e.lateDays, 0);
    const averageHours = employeeDetails.length ? employeeDetails.reduce((sum, e) => sum + e.totalHours, 0) / employeeDetails.length : 0;
    
    res.json({
      ok: true,
      summary: {
        weekStart: startOfWeek,
        weekEnd: endOfWeek,
        summary: {
          totalEmployees,
          totalPresent,
          totalAbsent,
          totalLate,
          totalOvertime: 0,
          averageHours
        },
        employeeDetails
      }
    });
  } catch (err) {
    console.error('Attendance summary error:', err);
    res.status(500).json({ ok: false, error: err.message, summary: null });
  }
});

app.post('/api/attendance/summary/weekly/generate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { weekStart, teamId, department } = req.body;
    
    let startDate = weekStart ? new Date(weekStart) : new Date();
    startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    endDate.setHours(23, 59, 59, 999);
    
    let userQuery = {};
    if (teamId) {
      const team = await Team.findById(teamId);
      if (team) {
        userQuery._id = { $in: team.members.map(m => m.user_id) };
      }
    }
    if (department) {
      userQuery.department = department;
    }
    
    const users = await User.find(userQuery).select('name email department');
    const attendanceRecords = await Attendance.find({
      user_id: { $in: users.map(u => u._id) },
      timestamp: { $gte: startDate, $lte: endDate }
    });
    
    const employeeDetails = users.map(user => {
      const userRecords = attendanceRecords.filter(r => r.user_id.toString() === user._id.toString());
      const clockIns = userRecords.filter(r => r.action === 'clock_in').length;
      const lateArrivals = userRecords.filter(r => r.notes?.includes('late')).length;
      const totalHours = clockIns * 8;
      
      let status = 'good';
      if (clockIns === 5) status = 'excellent';
      else if (clockIns >= 4) status = 'good';
      else if (clockIns >= 3) status = 'warning';
      else status = 'poor';
      
      return {
        user_id: user._id,
        name: user.name,
        department: user.department,
        totalHours,
        lateDays: lateArrivals,
        absentDays: 5 - clockIns,
        overtime: 0,
        status
      };
    });
    
    const summary = new AttendanceSummary({
      weekStart: startDate,
      weekEnd: endDate,
      team_id: teamId,
      department,
      summary: {
        totalEmployees: users.length,
        totalPresent: employeeDetails.filter(e => e.absentDays < 5).length,
        totalAbsent: employeeDetails.filter(e => e.absentDays === 5).length,
        totalLate: employeeDetails.reduce((sum, e) => sum + e.lateDays, 0),
        totalOvertime: 0,
        averageHours: employeeDetails.reduce((sum, e) => sum + e.totalHours, 0) / users.length || 0
      },
      employeeDetails,
      generated_by: req.user.id
    });
    
    await summary.save();
    
    res.json({ ok: true, summary });
  } catch (err) {
    console.error('Generate summary error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/my/attendance/correction', authenticateToken, async (req, res) => {
  try {
    const { date, expectedTime, actualTime, reason } = req.body;
    
    const admins = await User.find({ role: 'admin' });
    admins.forEach(admin => {
      if (connectedUsers[admin._id.toString()]) {
        io.to(connectedUsers[admin._id.toString()]).emit('notification', {
          type: 'correction_request',
          message: `Attendance correction requested by ${req.user.name}`,
          details: { date, reason }
        });
      }
    });
    
    res.json({ ok: true, message: 'Correction request submitted' });
  } catch (err) {
    console.error('Correction error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// TASK ROUTES
// ===============================================

app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const query = req.user.role === 'admin' ? {} : { assigned_to: req.user.id };
    if (status) query.status = status;
    
    const [tasks, total] = await Promise.all([
      Task.find(query)
        .populate('assigned_to', 'name email')
        .populate('submitted_by', 'name email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Task.countDocuments(query)
    ]);
    
    res.json({
      ok: true,
      tasks,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tasks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, assigned_to, priority, due_date, category } = req.body;
    
    if (!title) {
      return res.status(400).json({ ok: false, error: 'Task title required' });
    }
    
    const task = new Task({
      title,
      description: description || '',
      assigned_to,
      assigned_by: req.user.id,
      priority: priority || 'medium',
      category: category || 'General',
      due_date: due_date ? new Date(due_date) : null,
      status: 'pending',
      approval_status: 'pending'
    });
    
    await task.save();
    await task.populate('assigned_to', 'name email');
    
    if (assigned_to && connectedUsers[assigned_to]) {
      io.to(connectedUsers[assigned_to]).emit('notification', {
        type: 'task_assigned',
        message: `New task: ${title}`,
        taskId: task._id
      });
    }
    
    res.json({ ok: true, task });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tasks/:id/submit-report', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { daily_report, hours_spent } = req.body;
    
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    
    if (task.assigned_to?.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }
    
    task.daily_report = daily_report || '';
    task.hours_spent = hours_spent || 0;
    task.status = 'submitted';
    task.approval_status = 'pending';
    task.submitted_by = req.user.id;
    task.submitted_at = new Date();
    task.updated_at = new Date();
    await task.save();
    
    const admins = await User.find({ role: 'admin' });
    admins.forEach(admin => {
      if (connectedUsers[admin._id.toString()]) {
        io.to(connectedUsers[admin._id.toString()]).emit('notification', {
          type: 'task_submitted',
          message: `Task submitted: ${task.title}`,
          taskId: task._id,
          submittedBy: req.user.name
        });
      }
    });
    
    res.json({ ok: true, message: 'Task submitted for approval' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tasks/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;
    
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    
    task.approval_status = 'approved';
    task.status = 'completed';
    task.admin_feedback = feedback || '';
    task.approved_by = req.user.id;
    task.approved_at = new Date();
    await task.save();
    
    if (task.assigned_to && connectedUsers[task.assigned_to.toString()]) {
      io.to(connectedUsers[task.assigned_to.toString()]).emit('notification', {
        type: 'task_approved',
        message: `Task "${task.title}" has been approved!`,
        taskId: task._id,
        feedback: feedback
      });
    }
    
    res.json({ ok: true, message: 'Task approved' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/tasks/:id/reject', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;
    
    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    
    task.approval_status = 'rejected';
    task.admin_feedback = feedback || 'Needs revision';
    task.approved_by = req.user.id;
    task.approved_at = new Date();
    await task.save();
    
    if (task.assigned_to && connectedUsers[task.assigned_to.toString()]) {
      io.to(connectedUsers[task.assigned_to.toString()]).emit('notification', {
        type: 'task_rejected',
        message: `Task "${task.title}" needs revisions: ${feedback}`,
        taskId: task._id,
        feedback: feedback
      });
    }
    
    res.json({ ok: true, message: 'Task rejected' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/tasks/:taskId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params;
    const task = await Task.findByIdAndDelete(taskId);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    res.json({ ok: true, message: 'Task deleted' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/admin/pending-approvals', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tasks = await Task.find({ 
      approval_status: 'pending',
      submitted_by: { $exists: true, $ne: null }
    })
    .populate('submitted_by', 'name email')
    .populate('assigned_to', 'name email')
    .sort({ submitted_at: -1 });
    
    res.json(tasks);
  } catch (err) {
    console.error('Pending approvals error:', err);
    res.status(500).json([]);
  }
});

// ===============================================
// TEAM ROUTES
// ===============================================

app.post('/api/teams', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, department, costCenter, manager, teamLead, defaultShiftPattern, schedulingRules } = req.body;
    
    const existing = await Team.findOne({ name });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Team name already exists' });
    }
    
    const team = new Team({
      name,
      description: description || '',
      department: department || '',
      costCenter: costCenter || '',
      manager: manager || null,
      teamLead: teamLead || null,
      defaultShiftPattern: defaultShiftPattern || { startTime: '09:00', endTime: '17:00', breakDuration: 30 },
      schedulingRules: schedulingRules || { minStaffPerShift: 1, maxOvertimeHours: 10 },
      created_by: req.user.id,
      status: 'active'
    });
    
    await team.save();
    
    if (manager) {
      await team.addMember(manager, 'lead');
    }
    if (teamLead && teamLead !== manager) {
      await team.addMember(teamLead, 'lead');
    }
    
    await AuditLog.create({
      user_id: req.user.id,
      action: 'team_created',
      resource: 'team',
      resource_id: team._id.toString(),
      details: { team_name: name, department },
      ip_address: req.ip
    });
    
    res.json({ ok: true, team });
  } catch (err) {
    console.error('Create team error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/teams', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, department, status, manager } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    if (search) query.name = { $regex: search, $options: 'i' };
    if (department) query.department = department;
    if (status) query.status = status;
    if (manager) query.manager = manager;
    
    const [teams, total] = await Promise.all([
      Team.find(query)
        .populate('manager', 'name email')
        .populate('teamLead', 'name email')
        .populate('members.user_id', 'name email role')
        .sort({ name: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Team.countDocuments(query)
    ]);
    
    res.json({
      ok: true,
      teams,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/teams/:teamId', authenticateToken, async (req, res) => {
  try {
    const team = await Team.findById(req.params.teamId)
      .populate('manager', 'name email role department')
      .populate('teamLead', 'name email role')
      .populate('assistantLead', 'name email role')
      .populate('members.user_id', 'name email role department position');
    
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    
    const memberIds = team.members.map(m => m.user_id._id);
    const attendanceRecords = await Attendance.find({
      user_id: { $in: memberIds },
      timestamp: { $gte: weekStart }
    });
    
    const memberStats = team.members.map(member => {
      const userRecords = attendanceRecords.filter(r => r.user_id.toString() === member.user_id._id.toString());
      const presentCount = userRecords.filter(r => r.action === 'clock_in').length;
      return {
        user_id: member.user_id,
        role: member.role,
        attendance_days: presentCount,
        attendance_rate: memberIds.length ? (presentCount / 5) * 100 : 0
      };
    });
    
    res.json({ ok: true, team, memberStats });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/teams/:teamId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { name, description, department, costCenter, manager, teamLead, defaultShiftPattern, schedulingRules, status } = req.body;
    
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    if (name && name !== team.name) {
      const existing = await Team.findOne({ name });
      if (existing) {
        return res.status(409).json({ ok: false, error: 'Team name already exists' });
      }
      team.name = name;
    }
    
    if (description !== undefined) team.description = description;
    if (department !== undefined) team.department = department;
    if (costCenter !== undefined) team.costCenter = costCenter;
    if (manager !== undefined) team.manager = manager;
    if (teamLead !== undefined) team.teamLead = teamLead;
    if (defaultShiftPattern !== undefined) team.defaultShiftPattern = defaultShiftPattern;
    if (schedulingRules !== undefined) team.schedulingRules = schedulingRules;
    if (status !== undefined) team.status = status;
    
    team.updated_by = req.user.id;
    team.updated_at = new Date();
    await team.save();
    
    await AuditLog.create({
      user_id: req.user.id,
      action: 'team_updated',
      resource: 'team',
      resource_id: teamId,
      details: { changes: req.body },
      ip_address: req.ip
    });
    
    res.json({ ok: true, team });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/teams/:teamId/members', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { userIds, role = 'member' } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ ok: false, error: 'userIds array required' });
    }
    
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    const addedUsers = [];
    for (const userId of userIds) {
      if (!team.members.some(m => m.user_id.toString() === userId)) {
        team.members.push({ user_id: userId, role, joined_at: new Date() });
        addedUsers.push(userId);
      }
    }
    
    team.stats.memberCount = team.members.length;
    team.stats.activeMemberCount = team.members.filter(m => m.status === 'active').length;
    await team.save();
    
    addedUsers.forEach(userId => {
      if (connectedUsers[userId]) {
        io.to(connectedUsers[userId]).emit('notification', {
          type: 'team_added',
          message: `You have been added to team: ${team.name}`,
          teamId: team._id,
          teamName: team.name
        });
      }
    });
    
    res.json({ ok: true, addedUsers, team });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/teams/:teamId/members/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    const member = team.members.find(m => m.user_id.toString() === userId);
    if (!member) {
      return res.status(404).json({ ok: false, error: 'Member not found in team' });
    }
    
    if (team.manager && team.manager.toString() === userId) {
      return res.status(400).json({ ok: false, error: 'Cannot remove team manager. Assign a new manager first.' });
    }
    
    team.members = team.members.filter(m => m.user_id.toString() !== userId);
    team.stats.memberCount = team.members.length;
    await team.save();
    
    if (connectedUsers[userId]) {
      io.to(connectedUsers[userId]).emit('notification', {
        type: 'team_removed',
        message: `You have been removed from team: ${team.name}`,
        teamId: team._id
      });
    }
    
    res.json({ ok: true, message: 'Member removed from team' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/teams/:teamId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { reassignToTeamId, forceDelete } = req.body;
    
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    if (team.members.length > 0 && !forceDelete && !reassignToTeamId) {
      return res.status(400).json({ 
        ok: false, 
        error: `Team has ${team.members.length} members. Reassign them first or use forceDelete.`,
        memberCount: team.members.length
      });
    }
    
    if (reassignToTeamId && team.members.length > 0) {
      const targetTeam = await Team.findById(reassignToTeamId);
      if (targetTeam) {
        for (const member of team.members) {
          await targetTeam.addMember(member.user_id, member.role);
        }
      }
    }
    
    if (forceDelete) {
      await Team.findByIdAndDelete(teamId);
    } else {
      team.status = 'archived';
      await team.save();
    }
    
    await AuditLog.create({
      user_id: req.user.id,
      action: 'team_deleted',
      resource: 'team',
      resource_id: teamId,
      details: { team_name: team.name, memberCount: team.members.length, reassignedTo: reassignToTeamId },
      ip_address: req.ip
    });
    
    res.json({ ok: true, message: 'Team removed successfully' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// MY TASKS ROUTES (Employee View)
// ===============================================

app.get('/api/my/tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, priority } = req.query;
    
    let query = { assigned_to: userId };
    if (status) query.status = status;
    if (priority) query.priority = priority;
    
    const tasks = await Task.find(query)
      .populate('assigned_by', 'name')
      .sort({ due_date: 1, created_at: -1 });
    
    const stats = {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in-progress').length,
      completed: tasks.filter(t => t.status === 'completed').length,
      overdue: tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length
    };
    
    res.json({ ok: true, tasks, stats });
  } catch (err) {
    console.error('My tasks error:', err);
    res.status(500).json({ ok: false, tasks: [], stats: {}, error: err.message });
  }
});

app.put('/api/my/tasks/:taskId/status', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { status, progress, notes } = req.body;
    
    const task = await Task.findOne({ _id: taskId, assigned_to: req.user.id });
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found or not assigned to you' });
    }
    
    if (status) {
      task.status = status;
      if (status === 'in-progress' && !task.started_at) {
        task.started_at = new Date();
      }
      if (status === 'completed') {
        task.completed_at = new Date();
      }
    }
    
    if (progress !== undefined) task.progress = progress;
    if (notes) {
      if (!task.comments) task.comments = [];
      task.comments.push({ user: req.user.id, content: notes, created_at: new Date() });
    }
    
    task.updated_at = new Date();
    await task.save();
    
    res.json({ ok: true, task });
  } catch (err) {
    console.error('Update task status error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// MY ATTENDANCE ROUTES (Employee View)
// ===============================================

app.get('/api/my/attendance', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { period = 'week' } = req.query;
    
    const now = new Date();
    let startDate, endDate;
    
    if (period === 'week') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - now.getDay() + 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 6);
      endDate.setHours(23, 59, 59, 999);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    
    const records = await Attendance.find({
      user_id: userId,
      timestamp: { $gte: startDate, $lte: endDate }
    }).sort({ timestamp: -1 });
    
    const clockIns = records.filter(r => r.action === 'clock_in').length;
    const lateArrivals = records.filter(r => r.notes?.includes('late')).length;
    const totalHours = clockIns * 8;
    const expectedDays = period === 'week' ? 5 : 22;
    const attendanceRate = expectedDays > 0 ? (clockIns / expectedDays) * 100 : 0;
    
    res.json({
      ok: true,
      attendance: records,
      summary: {
        totalDays: clockIns,
        attendanceRate: Math.round(attendanceRate),
        lateArrivals,
        totalHours,
        expectedDays,
        remainingDays: Math.max(0, expectedDays - clockIns)
      },
      period: { start: startDate, end: endDate }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// LEAVE REQUEST ROUTES
// ===============================================

app.post('/api/leave/request', authenticateToken, async (req, res) => {
  try {
    const { type, start_date, end_date, reason } = req.body;
    
    if (!type || !start_date || !end_date || !reason) {
      return res.status(400).json({ ok: false, error: 'All fields required' });
    }
    
    const leaveRequest = new LeaveRequest({
      user_id: req.user.id,
      type,
      start_date: new Date(start_date),
      end_date: new Date(end_date),
      reason,
      status: 'pending'
    });
    
    await leaveRequest.save();
    
    const admins = await User.find({ role: 'admin' });
    admins.forEach(admin => {
      if (connectedUsers[admin._id.toString()]) {
        io.to(connectedUsers[admin._id.toString()]).emit('notification', {
          type: 'leave_request',
          message: `Leave request from ${req.user.name}`,
          details: { type, start_date, end_date, reason }
        });
      }
    });
    
    res.json({ ok: true, leaveRequest });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/leave/my-requests', authenticateToken, async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ user_id: req.user.id })
      .sort({ created_at: -1 });
    res.json({ ok: true, requests });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/admin/leave/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const requests = await LeaveRequest.find({ status: 'pending' })
      .populate('user_id', 'name email department')
      .sort({ created_at: 1 });
    res.json({ ok: true, requests });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/admin/leave/:requestId/:action', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { requestId, action } = req.params;
    
    const leaveRequest = await LeaveRequest.findById(requestId).populate('user_id');
    if (!leaveRequest) {
      return res.status(404).json({ ok: false, error: 'Request not found' });
    }
    
    leaveRequest.status = action === 'approve' ? 'approved' : 'rejected';
    leaveRequest.approved_by = req.user.id;
    leaveRequest.approved_at = new Date();
    await leaveRequest.save();
    
    if (connectedUsers[leaveRequest.user_id._id.toString()]) {
      io.to(connectedUsers[leaveRequest.user_id._id.toString()]).emit('notification', {
        type: 'leave_updated',
        message: `Your leave request has been ${leaveRequest.status}`,
        details: { type: leaveRequest.type, status: leaveRequest.status }
      });
    }
    
    res.json({ ok: true, leaveRequest });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// REPORT TEMPLATES ROUTES
// ===============================================

app.get('/api/report-templates', authenticateToken, async (req, res) => {
  try {
    const { type } = req.query;
    const query = type ? { type } : {};
    const templates = await ReportTemplate.find(query)
      .populate('created_by', 'name')
      .sort({ usageCount: -1 });
    
    res.json({ ok: true, templates });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/report-templates', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, type, description, config } = req.body;
    
    const template = new ReportTemplate({
      name,
      type,
      description,
      config: config || { dateRange: 'week', compareWithPrevious: true },
      created_by: req.user.id
    });
    
    await template.save();
    res.json({ ok: true, template });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/report-templates/:templateId/use', authenticateToken, async (req, res) => {
  try {
    const { templateId } = req.params;
    
    const template = await ReportTemplate.findById(templateId);
    if (!template) {
      return res.status(404).json({ ok: false, error: 'Template not found' });
    }
    
    template.usageCount += 1;
    template.lastUsed = new Date();
    await template.save();
    
    res.json({
      ok: true,
      report: {
        type: template.type,
        generatedAt: new Date(),
        message: `Report generated from ${template.name}`
      },
      templateUsed: template.name
    });
  } catch (err) {
    console.error('Use template error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete('/api/report-templates/:templateId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await ReportTemplate.findByIdAndDelete(req.params.templateId);
    res.json({ ok: true, message: 'Template deleted' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// ANALYTICS ROUTES
// ===============================================

app.get('/api/analytics/performance', authenticateToken, async (req, res) => {
  try {
    const { teamId, period = 'week' } = req.query;
    
    const now = new Date();
    let currentStart, currentEnd;
    
    if (period === 'week') {
      currentStart = new Date(now);
      currentStart.setDate(now.getDate() - now.getDay() + 1);
      currentStart.setHours(0, 0, 0, 0);
      currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + 6);
      currentEnd.setHours(23, 59, 59, 999);
    } else {
      currentStart = new Date(now.getFullYear(), now.getMonth(), 1);
      currentEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    
    let userIds = [];
    if (teamId) {
      const team = await Team.findById(teamId);
      if (team) {
        userIds = team.members.map(m => m.user_id);
      }
    } else {
      const users = await User.find({ role: { $nin: ['admin', 'superadmin'] } });
      userIds = users.map(u => u._id);
    }
    
    const currentAttendance = await Attendance.find({
      user_id: { $in: userIds },
      timestamp: { $gte: currentStart, $lte: currentEnd },
      action: 'clock_in'
    });
    
    const currentTasks = await Task.find({
      assigned_to: { $in: userIds },
      approval_status: 'approved',
      approved_at: { $gte: currentStart, $lte: currentEnd }
    });
    
    const currentMetrics = {
      attendanceRate: userIds.length ? (currentAttendance.length / (userIds.length * 5)) * 100 : 0,
      taskCompletionRate: userIds.length ? (currentTasks.length / Math.max(userIds.length, 1)) * 10 : 0,
      totalHours: currentAttendance.length * 8,
      period: { start: currentStart, end: currentEnd }
    };
    
    const topPerformers = await Task.aggregate([
      { $match: { assigned_to: { $in: userIds }, approval_status: 'approved' } },
      { $group: { _id: '$assigned_to', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
      { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } }
    ]);
    
    res.json({
      ok: true,
      analytics: {
        current: currentMetrics,
        topPerformers: topPerformers.map(p => ({
          name: p.user[0]?.name || 'Unknown',
          completedTasks: p.count
        })),
        teamStats: {
          totalMembers: userIds.length,
          activeMembers: userIds.length
        }
      }
    });
  } catch (err) {
    console.error('Analytics error:', err);
    res.status(500).json({ 
      ok: true, 
      analytics: {
        current: { attendanceRate: 0, taskCompletionRate: 0, totalHours: 0 },
        topPerformers: [],
        teamStats: { totalMembers: 0, activeMembers: 0 }
      }
    });
  }
});

// ===============================================
// IMPERSONATION ROUTES
// ===============================================

app.post('/api/admin/impersonate/start', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { target_user_id, reason } = req.body;
    
    if (!target_user_id || !reason) {
      return res.status(400).json({ ok: false, error: 'target_user_id and reason required' });
    }
    
    const targetUser = await User.findById(target_user_id);
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'Target user not found' });
    }
    
    if (targetUser.role === 'admin' || targetUser.role === 'superadmin') {
      return res.status(403).json({ ok: false, error: 'Cannot impersonate another admin' });
    }
    
    const activeSession = await ImpersonationSession.findOne({
      admin_id: req.user.id,
      is_active: true
    });
    
    if (activeSession) {
      return res.status(400).json({ ok: false, error: 'You already have an active impersonation session. End it first.' });
    }
    
    const sessionToken = require('crypto').randomUUID();
    
    const session = new ImpersonationSession({
      admin_id: req.user.id,
      target_user_id: targetUser._id,
      admin_name: req.user.name,
      target_user_name: targetUser.name,
      action: 'START',
      timestamp: new Date(),
      ip_address: req.ip,
      reason: reason,
      mfa_verified: true,
      session_token: sessionToken,
      is_active: true
    });
    
    await session.save();
    
    const impersonationToken = jwt.sign(
      {
        id: targetUser._id,
        email: targetUser.email,
        role: targetUser.role,
        name: targetUser.name,
        is_impersonating: true,
        admin_id: req.user.id,
        session_token: sessionToken
      },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    res.json({
      ok: true,
      impersonation_token: impersonationToken,
      session_token: sessionToken,
      target_user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role
      },
      expires_in: 3600
    });
  } catch (err) {
    console.error('Impersonation start error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/admin/impersonation/end', authenticateToken, async (req, res) => {
  try {
    const { session_token } = req.body;
    
    if (!session_token) {
      return res.status(400).json({ ok: false, error: 'session_token required' });
    }
    
    const session = await ImpersonationSession.findOne({ session_token, is_active: true });
    if (!session) {
      return res.status(404).json({ ok: false, error: 'Active session not found' });
    }
    
    if (session.admin_id.toString() !== req.user.id && req.user.role !== 'superadmin') {
      return res.status(403).json({ ok: false, error: 'Not authorized to end this session' });
    }
    
    session.action = 'END';
    session.ended_at = new Date();
    session.duration_seconds = Math.floor((session.ended_at - session.timestamp) / 1000);
    session.is_active = false;
    session.ended_by = req.user.id;
    
    await session.save();
    
    res.json({ ok: true, message: 'Impersonation session ended', duration: session.duration_seconds });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/admin/impersonation/sessions', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const sessions = await ImpersonationSession.find({ is_active: true })
      .populate('admin_id', 'name email')
      .populate('target_user_id', 'name email role')
      .sort({ timestamp: -1 });
    
    res.json({ ok: true, sessions });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// EXPORT REPORTS ROUTES
// ===============================================

app.get('/api/reports/attendance/csv', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate, teamId } = req.query;
    
    let start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let end = endDate ? new Date(endDate) : new Date();
    
    let query = { timestamp: { $gte: start, $lte: end } };
    
    if (teamId) {
      const team = await Team.findById(teamId);
      if (team) {
        query.user_id = { $in: team.members.map(m => m.user_id) };
      }
    }
    
    const records = await Attendance.find(query)
      .populate('user_id', 'name email department')
      .sort({ timestamp: -1 });
    
    let csv = 'Date,Employee Name,Department,Action,Time,IP Address\n';
    for (const record of records) {
      csv += `"${new Date(record.timestamp).toLocaleDateString()}","${record.user_id?.name || 'Unknown'}","${record.user_id?.department || '-'}","${record.action}","${new Date(record.timestamp).toLocaleTimeString()}","${record.ip_address || '-'}"\n`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="attendance-report-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/reports/tasks/csv', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tasks = await Task.find({})
      .populate('assigned_to', 'name email')
      .populate('submitted_by', 'name')
      .sort({ created_at: -1 });
    
    let csv = 'Title,Assigned To,Status,Priority,Approval Status,Hours Spent,Created Date,Due Date\n';
    for (const task of tasks) {
      csv += `"${task.title}","${task.assigned_to?.name || 'Unassigned'}","${task.status}","${task.priority}","${task.approval_status}",${task.hours_spent || 0},"${new Date(task.created_at).toLocaleDateString()}","${task.due_date ? new Date(task.due_date).toLocaleDateString() : '-'}"\n`;
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="tasks-report-${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/reports/excel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WFMS System';
    workbook.created = new Date();
    
    const usersSheet = workbook.addWorksheet('Users');
    usersSheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Status', key: 'status', width: 10 }
    ];
    
    const users = await User.find({}, '-password');
    users.forEach(user => {
      usersSheet.addRow({
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department || '-',
        status: user.is_active ? 'Active' : 'Inactive'
      });
    });
    
    const tasksSheet = workbook.addWorksheet('Tasks');
    tasksSheet.columns = [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Assigned To', key: 'assigned_to', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Approval', key: 'approval', width: 10 }
    ];
    
    const tasks = await Task.find({}).populate('assigned_to', 'name');
    tasks.forEach(task => {
      tasksSheet.addRow({
        title: task.title,
        assigned_to: task.assigned_to?.name || 'Unassigned',
        status: task.status,
        priority: task.priority,
        approval: task.approval_status
      });
    });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="wfms-report-${new Date().toISOString().split('T')[0]}.xlsx"`);
    
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Excel export error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// ADMIN ROUTES
// ===============================================

app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 50, search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const [users, total] = await Promise.all([
      User.find(query).select('-password').sort({ created_at: -1 }).skip(skip).limit(parseInt(limit)),
      User.countDocuments(query)
    ]);
    
    res.json({
      ok: true,
      users,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/admin/users/:userId/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    
    if (!['admin', 'superadmin', 'manager', 'employee', 'worker'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }
    
    const user = await User.findByIdAndUpdate(userId, { role, updated_at: new Date() }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.put('/api/admin/users/:userId/deactivate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;
    
    const user = await User.findByIdAndUpdate(userId, { is_active, updated_at: new Date() }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/admin/performance-metrics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({ role: { $ne: 'admin' } });
    const performanceData = [];
    
    for (const user of users) {
      const tasks = await Task.find({ assigned_to: user._id });
      const completed = tasks.filter(t => t.approval_status === 'approved').length;
      const pending = tasks.filter(t => t.approval_status === 'pending').length;
      const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
      const completionRate = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
      
      performanceData.push({
        user_id: user._id,
        name: user.name,
        email: user.email,
        tasks_assigned: tasks.length,
        tasks_completed: completed,
        tasks_pending: pending,
        total_hours_worked: totalHours,
        completion_rate: completionRate
      });
    }
    
    res.json(performanceData);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalEmployees, presentToday, pendingTasks, completedTasks] = await Promise.all([
      User.countDocuments({ role: { $nin: ['admin', 'superadmin'] } }),
      Attendance.countDocuments({ timestamp: { $gte: today }, action: 'clock_in' }),
      Task.countDocuments({ approval_status: 'pending' }),
      Task.countDocuments({ approval_status: 'approved' })
    ]);
    
    const attendanceRate = totalEmployees > 0 ? Math.round((presentToday / totalEmployees) * 100) : 0;
    
    res.json({
      ok: true,
      stats: {
        totalEmployees,
        presentToday,
        attendanceRate,
        pendingTasks,
        completedTasks
      }
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/logs/count', authenticateToken, async (req, res) => {
  try {
    const count = await AuditLog.countDocuments();
    res.json({ ok: true, count });
  } catch (err) {
    res.json({ ok: true, count: 0 });
  }
});

// ===============================================
// CREATE DEFAULT ADMIN
// ===============================================

async function createDefaultAdmin() {
  try {
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const admin = new User({
        name: 'System Administrator',
        email: 'admin@wfms.com',
        password: hashedPassword,
        role: 'admin',
        department: 'IT',
        is_active: true,
        can_impersonate: true
      });
      await admin.save();
      console.log('✅ Default admin created: admin@wfms.com / admin123');
    }
  } catch (err) {
    console.error('Error creating admin:', err.message);
  }
}

// ===============================================
// START SERVER
// ===============================================

async function startServer() {
  try {
    if (isConnected()) {
      await createDefaultAdmin();
    } else {
      console.log('⚠️ Waiting for MongoDB connection...');
      mongoose.connection.once('open', async () => {
        await createDefaultAdmin();
      });
    }
    
    server.listen(PORT, () => {
      console.log('\n========================================');
      console.log(`🚀 WFMS Server running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${NODE_ENV}`);
      console.log(`💾 Database: ${isConnected() ? 'Connected' : 'Disconnected'}`);
      console.log('\n📋 Available Features:');
      console.log('   ✅ Authentication (Login/Signup/QR)');
      console.log('   ✅ Team Management (Full CRUD)');
      console.log('   ✅ Attendance Summary & Export');
      console.log('   ✅ Performance Analytics');
      console.log('   ✅ Report Templates & "Use Template"');
      console.log('   ✅ Impersonation (Admin Only)');
      console.log('   ✅ My Attendance (Employee)');
      console.log('   ✅ My Tasks (Employee)');
      console.log('   ✅ Task Management (Admin)');
      console.log('   ✅ Leave Request System');
      console.log('   ✅ QR Code Auto-Login');
      console.log('========================================\n');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

module.exports = app;