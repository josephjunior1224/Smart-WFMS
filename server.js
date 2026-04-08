// ===============================================
// WFMS SERVER - COMPLETE REBUILD v3.1
// ===============================================

console.log('🚀 STARTING WFMS SERVER v3.1');
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
  role: { type: String, enum: ['admin', 'manager', 'employee', 'worker'], default: 'employee' },
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
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  category: { type: String, default: 'General' },
  due_date: Date,
  daily_report: { type: String, default: '' },
  hours_spent: { type: Number, default: 0 },
  approval_status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  admin_feedback: { type: String, default: '' },
  submitted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  submitted_at: Date,
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: Date,
  attachments: [{
    filename: String,
    originalName: String,
    path: String,
    size: Number,
    mimeType: String,
    uploaded_at: { type: Date, default: Date.now }
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
  notes: { type: String, default: '' }
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
  tasks_rejected: { type: Number, default: 0 },
  total_hours_worked: { type: Number, default: 0 },
  completion_rate: { type: Number, default: 0 },
  last_updated: { type: Date, default: Date.now }
});

const Performance = mongoose.model('Performance', performanceSchema);

// Team Schema
const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  department: { type: String, default: '' },
  team_lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

const Team = mongoose.model('Team', teamSchema);

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

  socket.on('send-notification', (data) => {
    const { recipientId, message, type } = data;
    if (recipientId && connectedUsers[recipientId]) {
      io.to(connectedUsers[recipientId]).emit('notification', {
        type: type || 'info',
        message,
        timestamp: new Date().toISOString()
      });
    }
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

// Broadcast helper
function broadcastToAdmins(message) {
  console.log('Broadcast:', message);
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
  if (req.user?.role === 'admin') {
    next();
  } else {
    res.status(403).json({ ok: false, error: 'Admin access required' });
  }
};

// ===============================================
// API ROUTES
// ===============================================

// Health check
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

// Check email exists
app.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    res.json({ ok: true, exists: !!user });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ ok: false, error: 'Name, email, and password required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
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
      department: department || ''
    });

    await user.save();

    // Generate QR code
    const qrToken = uuidv4();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const qrUrl = `${baseUrl}/qr/auto/${qrToken}`;
    const qrData = await QR.toDataURL(qrUrl, { width: 400, margin: 2 });

    const qrCode = new QRCode({
      user_id: user._id,
      qr_token: qrToken,
      qr_data: qrData,
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    });
    await qrCode.save();

    user.qr_token = qrToken;
    user.qr_code_data = qrData;
    await user.save();

    res.json({
      ok: true,
      userId: user._id,
      qrToken,
      qrData
    });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Login
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

    // Create session
    await Session.create({
      user_id: user._id,
      token: token,
      login_method: 'password',
      login_time: new Date(),
      ip_address: req.ip,
      user_agent: req.headers['user-agent']
    });

    // Record attendance login
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

// Refresh token
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

// Get current user
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({}, '-password').sort({ created_at: -1 });
    res.json({ ok: true, users });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get user by ID
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

// Update profile
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
// TASK ROUTES
// ===============================================

// Get tasks
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

// Get my tasks
app.get('/api/tasks/my-tasks', authenticateToken, async (req, res) => {
  try {
    const tasks = await Task.find({ assigned_to: req.user.id })
      .sort({ created_at: -1 })
      .limit(50);
    res.json({ ok: true, tasks });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create task (admin only)
app.post('/api/tasks', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, assigned_to, priority, due_date } = req.body;

    if (!title) {
      return res.status(400).json({ ok: false, error: 'Task title required' });
    }

    const task = new Task({
      title,
      description: description || '',
      assigned_to,
      assigned_by: req.user.id,
      priority: priority || 'medium',
      due_date: due_date ? new Date(due_date) : null,
      status: 'pending',
      approval_status: 'pending'
    });

    await task.save();
    await task.populate('assigned_to', 'name email');

    // Notify assigned user
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

// Update task
app.put('/api/tasks/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, priority, description } = req.body;

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    // Check permission
    if (req.user.role !== 'admin' && task.assigned_to?.toString() !== req.user.id) {
      return res.status(403).json({ ok: false, error: 'Not authorized' });
    }

    if (status) task.status = status;
    if (priority) task.priority = priority;
    if (description) task.description = description;
    task.updated_at = new Date();

    await task.save();

    res.json({ ok: true, task });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Submit task report
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

    // Update performance
    let perf = await Performance.findOne({ user_id: req.user.id });
    if (perf) {
      perf.tasks_pending = await Task.countDocuments({ assigned_to: req.user.id, approval_status: 'pending' });
      await perf.save();
    } else {
      perf = new Performance({ user_id: req.user.id, tasks_pending: 1 });
      await perf.save();
    }

    // Notify admins
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

// Approve task (admin only)
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

    // Update performance
    let perf = await Performance.findOne({ user_id: task.assigned_to });
    if (!perf) {
      perf = new Performance({ user_id: task.assigned_to });
    }
    perf.tasks_completed = await Task.countDocuments({ assigned_to: task.assigned_to, approval_status: 'approved' });
    perf.tasks_assigned = await Task.countDocuments({ assigned_to: task.assigned_to });
    perf.completion_rate = perf.tasks_assigned > 0 ? (perf.tasks_completed / perf.tasks_assigned) * 100 : 0;
    await perf.save();

    // Notify employee
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

// Reject task (admin only)
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

    // Notify employee
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

// Delete task (admin only)
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

// Get pending approvals (admin only)
app.get('/api/admin/pending-approvals', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const tasks = await Task.find({ approval_status: 'pending', status: 'submitted' })
      .populate('assigned_to', 'name email')
      .populate('submitted_by', 'name email')
      .sort({ submitted_at: -1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// ATTENDANCE ROUTES
// ===============================================

// Record attendance
app.post('/api/attendance', authenticateToken, async (req, res) => {
  try {
    const { action } = req.body;
    if (!action) {
      return res.status(400).json({ ok: false, error: 'Action required' });
    }

    const result = await recordAttendance(req.user.id, action, req);
    res.json({ ok: true, result });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get my attendance
app.get('/api/attendance/my', authenticateToken, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const records = await Attendance.find({
      user_id: req.user.id,
      timestamp: { $gte: startDate }
    }).sort({ timestamp: -1 });

    res.json({ ok: true, records });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get attendance for user (admin only)
app.get('/api/attendance/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const records = await Attendance.find({ user_id: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(100);
    res.json({ ok: true, records });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Attendance summary
app.get('/api/attendance/summary/weekly', authenticateToken, async (req, res) => {
  try {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1);
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const query = { timestamp: { $gte: startOfWeek, $lte: endOfWeek } };
    if (req.user.role !== 'admin') {
      query.user_id = req.user.id;
    }

    const records = await Attendance.find(query);
    const uniqueUsers = new Set(records.map(r => r.user_id.toString())).size;

    res.json({
      ok: true,
      summary: {
        week_start: startOfWeek.toISOString().split('T')[0],
        week_end: endOfWeek.toISOString().split('T')[0],
        total_records: records.length,
        unique_users: uniqueUsers
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// DASHBOARD STATS
// ===============================================

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [totalEmployees, presentToday, pendingTasks, completedTasks] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
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
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// ADMIN ROUTES
// ===============================================

// Get all users (admin)
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

// Update user role (admin)
app.put('/api/admin/users/:userId/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'manager', 'employee', 'worker'].includes(role)) {
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

// Deactivate user (admin)
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

// Get performance metrics (admin)
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

// ===============================================
// QR CODE ROUTES
// ===============================================

// Generate QR for user
app.post('/api/qr/generate', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    let qrCode = await QRCode.findOne({ user_id: userId });
    if (qrCode && qrCode.status === 'active' && qrCode.expires_at > new Date()) {
      return res.json({
        ok: true,
        qrToken: qrCode.qr_token,
        qrData: qrCode.qr_data,
        expiresAt: qrCode.expires_at
      });
    }

    const qrToken = uuidv4();
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const qrUrl = `${baseUrl}/qr/auto/${qrToken}`;
    const qrData = await QR.toDataURL(qrUrl, { width: 400, margin: 2 });

    if (qrCode) {
      qrCode.qr_token = qrToken;
      qrCode.qr_data = qrData;
      qrCode.expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
      qrCode.status = 'active';
      await qrCode.save();
    } else {
      qrCode = new QRCode({
        user_id: userId,
        qr_token: qrToken,
        qr_data: qrData,
        expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
      });
      await qrCode.save();
    }

    res.json({
      ok: true,
      qrToken: qrCode.qr_token,
      qrData: qrCode.qr_data,
      expiresAt: qrCode.expires_at
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get my QR
app.get('/api/qr/my-qr', authenticateToken, async (req, res) => {
  try {
    const qrCode = await QRCode.findOne({ user_id: req.user.id });
    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'QR code not found' });
    }
    res.json({
      ok: true,
      qrData: qrCode.qr_data,
      qrToken: qrCode.qr_token,
      expiresAt: qrCode.expires_at,
      scanCount: qrCode.scan_count
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QR Login endpoint
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
      return res.status(401).json({ ok: false, error: 'QR code expired' });
    }

    const user = qrCode.user_id;
    if (!user.is_active) {
      return res.status(401).json({ ok: false, error: 'Account deactivated' });
    }

    // Record scan
    await QRScan.create({
      user_id: user._id,
      qr_token: token,
      scanned_at: new Date(),
      scanner_ip: req.ip,
      action: 'login'
    });

    qrCode.scan_count += 1;
    if (!qrCode.is_activated) {
      qrCode.is_activated = true;
      qrCode.first_scan_at = new Date();
    }
    qrCode.last_scan_at = new Date();
    await qrCode.save();

    // Generate token
    const jwtToken = jwt.sign(
      { id: user._id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    await recordAttendance(user._id, 'login', req, { skipValidation: true });

    res.json({
      ok: true,
      token: jwtToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QR scan endpoint
app.post('/api/qr/scan', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ ok: false, error: 'QR token required' });
    }

    const qrCode = await QRCode.findOne({ qr_token: token }).populate('user_id');
    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'Invalid QR code' });
    }

    await QRScan.create({
      user_id: qrCode.user_id._id,
      qr_token: token,
      scanned_at: new Date(),
      scanner_ip: req.ip,
      action: 'scan'
    });

    qrCode.scan_count += 1;
    await qrCode.save();

    res.json({
      ok: true,
      message: 'QR scanned successfully',
      userName: qrCode.user_id.name
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QR auto-login redirect
app.get('/qr/auto/:token', (req, res) => {
  const { token } = req.params;
  const frontendUrl = process.env.FRONTEND_URL || `http://localhost:${PORT}`;
  res.redirect(`${frontendUrl}/qr-login?token=${token}`);
});

// ===============================================
// TEAM ROUTES
// ===============================================

// Get all teams
app.get('/api/teams', authenticateToken, async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('team_lead', 'name email')
      .populate('manager', 'name email')
      .populate('members', 'name email');
    res.json({ ok: true, teams });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Create team (admin only)
app.post('/api/teams', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, department, team_lead, members } = req.body;

    const existing = await Team.findOne({ name });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Team name already exists' });
    }

    const team = new Team({
      name,
      description: description || '',
      department: department || '',
      team_lead: team_lead || null,
      members: members || [],
      created_by: req.user.id
    });

    await team.save();
    res.json({ ok: true, team });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// UTILITY ROUTES
// ===============================================

// Logs count
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
        is_active: true
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
    // Wait for MongoDB connection
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
      console.log('========================================\n');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await mongoose.connection.close();
  server.close(() => process.exit(0));
});

module.exports = app;