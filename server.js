// ===============================================
// WFMS Server – Express + MongoDB
// ===============================================
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const express = require('express');
const QR = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const http = require('http');

// Import MongoDB models and helpers
const { 
  User, 
  Task, 
  QRCode, 
  QRScan, 
  Performance, 
  Attendance, 
  TimeLog,
  isConnected,
  connectionStatus
} = require('./db');

// Import email service
const emailService = require('./models/emailService');

// Initialize Express app
const app = express();
const server = http.createServer(app);

const port = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const root = process.cwd();
const DATA_DIR = path.join(root, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Ensure data dir exists (for legacy token storage)
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch(e){}
try { if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, JSON.stringify({}), 'utf8'); } catch(e){}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  try {
    const now = new Date().toISOString();
    const ua = req.headers['user-agent'] || '-';
    const ref = req.headers['referer'] || req.headers['referrer'] || '-';
    console.log(`[${now}] ${req.method} ${req.originalUrl} - UA: ${ua} - Referer: ${ref}`);
  } catch (e) {
    console.warn('Error in request logging middleware', e);
  }
  next();
});

// Optional Basic Auth middleware for tunnels (enable with ENABLE_BASIC_AUTH=true)
if (process.env.ENABLE_BASIC_AUTH === 'true') {
  const authUser = process.env.BASIC_AUTH_USER || 'wfms';
  const authPass = process.env.BASIC_AUTH_PASS || 'mysecretpassword';
  app.use((req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Basic ')) {
      res.setHeader('WWW-Authenticate', 'Basic realm="WFMS"');
      return res.status(401).send('Authentication required');
    }
    const cred = Buffer.from(auth.split(' ')[1], 'base64').toString('utf8');
    const [user, pass] = cred.split(':');
    if (user === authUser && pass === authPass) return next();
    res.setHeader('WWW-Authenticate', 'Basic realm="WFMS"');
    return res.status(401).send('Invalid credentials');
  });
}

// Initialize email service
emailService.initializeEmailService();

// ===============================================
// Database Initialization (MongoDB)
// ===============================================

async function initializeDatabase() {
  console.log('Checking MongoDB connection...');
  
  if (!isConnected()) {
    console.warn('⚠️ MongoDB not connected. Please check your MONGODB_URI environment variable.');
    console.warn('Current connection status:', connectionStatus());
    return;
  }

  try {
    // Check if admin user exists
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@wfms.local';
    const adminPassword = process.env.SEED_ADMIN_PASS || 'admin';

    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (!existingAdmin) {
      // Create admin user
      const hash = await bcrypt.hash(adminPassword, 10);
      const admin = new User({
        name: 'Admin',
        email: adminEmail,
        password: hash,
        role: 'admin'
      });
      await admin.save();
      
      // Create sample task
      const sampleTask = new Task({
        title: 'Welcome Task',
        description: 'This is a seeded welcome task.',
        assigned_to: admin._id,
        status: 'pending'
      });
      await sampleTask.save();
      
      console.log('✓ Seeded admin user and sample task');
    } else {
      console.log('✓ Admin user already exists');
    }
  } catch (err) {
    console.error('✗ Database initialization error:', err.message);
  }
}

// ===============================================
// API Routes
// ===============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'WFMS API is running',
    database: connectionStatus(),
    timestamp: new Date().toISOString()
  });
});

// Check if email exists
app.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    const user = await User.findOne({ email });
    res.json({ exists: !!user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Validate inputs
    if (!email) return res.status(400).json({ ok: false, error: 'Email is required' });
    if (!name) return res.status(400).json({ ok: false, error: 'Full name is required' });
    if (!password) return res.status(400).json({ ok: false, error: 'Password is required' });
    if (password.length < 6) return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters' });
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email format' });
    }
    
    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already registered. Please login or use a different email.' });
    }
    
    // Hash password
    const hash = await bcrypt.hash(password, 10);
    
    // Create new user
    const user = new User({
      name,
      email,
      password: hash,
      role: role || 'worker'
    });
    
    await user.save();
    
    res.json({ ok: true, userId: user._id });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    const userObj = user.toObject();
    delete userObj.password;
    
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({ 
      ok: true, 
      user: userObj,
      token,
      refreshToken,
      expiresIn: 604800 // 7 days in seconds
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Refresh token endpoint
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: 'Refresh token required' });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newToken = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      ok: true,
      token: newToken,
      expiresIn: 604800
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// Google OAuth endpoint
app.post('/api/auth/google', async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    // Check if user exists
    let user = await User.findOne({ email });
    
    if (!user) {
      // Create new user with empty password (Google account)
      const newUser = new User({
        name: name || email,
        email,
        password: '',
        role: 'worker'
      });
      await newUser.save();
      user = newUser;
    }
    
    const userObj = user.toObject();
    delete userObj.password;
    
    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      ok: true,
      userId: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      user: userObj,
      token,
      refreshToken,
      expiresIn: 604800
    });
  } catch (err) {
    console.error('Google auth error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name role email');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find()
      .populate('assigned_to', 'name email')
      .populate('submitted_by', 'name email');
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Add task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, assigned_to } = req.body;

    const task = new Task({
      title,
      description,
      assigned_to,
      status: 'pending'
    });
    
    await task.save();
    
    res.json({ ok: true, taskId: task._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Update task status
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    await Task.findByIdAndUpdate(id, { status });
    
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Submit task report
app.post('/api/tasks/:id/submit-report', async (req, res) => {
  try {
    const { id } = req.params;
    const { daily_report, status, hours_spent, submitted_by } = req.body;

    const task = await Task.findById(id);
    const employee = await User.findById(submitted_by);
    const adminUsers = await User.find({ role: 'admin' });

    task.status = status;
    task.daily_report = daily_report;
    task.hours_spent = hours_spent;
    task.submitted_by = submitted_by;
    task.submitted_at = new Date();
    task.approval_status = 'pending';
    
    await task.save();

    let performance = await Performance.findOne({ user_id: submitted_by });
    
    if (performance) {
      const completedTasks = await Task.countDocuments({ 
        assigned_to: submitted_by, 
        approval_status: 'approved' 
      });
      
      const assignedTasks = await Task.countDocuments({ 
        assigned_to: submitted_by 
      });
      
      const completionRate = assignedTasks > 0 
        ? (completedTasks / assignedTasks) * 100 
        : 0;

      performance.tasks_completed = completedTasks;
      performance.tasks_assigned = assignedTasks;
      performance.total_hours_worked = (performance.total_hours_worked || 0) + hours_spent;
      performance.completion_rate = completionRate;
      performance.last_updated = new Date();
      
      await performance.save();
    } else {
      performance = new Performance({
        user_id: submitted_by,
        task_id: id,
        tasks_completed: 0,
        tasks_assigned: 1,
        total_hours_worked: hours_spent,
        completion_rate: 0
      });
      await performance.save();
    }

    if (employee && adminUsers.length > 0) {
      for (const admin of adminUsers) {
        await emailService.sendTaskSubmissionEmail(
          admin.email,
          admin.name,
          employee.name,
          task.title,
          id,
          daily_report
        );
      }
    }

    console.log(`✓ Task report submitted for approval (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true, taskId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin approval endpoint
app.post('/api/tasks/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    const task = await Task.findById(id);
    const employee = await User.findById(task.submitted_by);

    task.approval_status = 'approved';
    task.status = 'completed';
    task.admin_feedback = feedback;
    task.approved_at = new Date();
    
    await task.save();

    const performance = await Performance.findOne({ user_id: task.submitted_by });
    if (performance) {
      const completedTasks = await Task.countDocuments({ 
        assigned_to: task.submitted_by, 
        approval_status: 'approved' 
      });
      const assignedTasks = await Task.countDocuments({ 
        assigned_to: task.submitted_by 
      });
      
      const completionRate = assignedTasks > 0 
        ? (completedTasks / assignedTasks) * 100 
        : 0;

      performance.tasks_completed = completedTasks;
      performance.completion_rate = completionRate;
      performance.last_updated = new Date();
      
      await performance.save();
    }

    if (employee) {
      await emailService.sendTaskApprovalEmail(
        employee.email,
        employee.name,
        task.title,
        feedback || 'Well done!'
      );
    }

    console.log(`✓ Task approved (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin rejection endpoint
app.post('/api/tasks/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;

    const task = await Task.findById(id);
    const employee = await User.findById(task.submitted_by);

    task.approval_status = 'rejected';
    task.admin_feedback = feedback;
    
    await task.save();

    if (employee) {
      await emailService.sendTaskRejectionEmail(
        employee.email,
        employee.name,
        task.title,
        feedback || 'Please review and resubmit'
      );
    }

    console.log(`✓ Task rejected (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get pending task approvals for admin
app.get('/api/admin/pending-approvals', async (req, res) => {
  try {
    const tasks = await Task.find({ 
      approval_status: 'pending',
      submitted_by: { $exists: true, $ne: null }
    })
    .populate('submitted_by', 'name email')
    .sort({ submitted_at: -1 });
    
    const formattedTasks = tasks.map(task => {
      const taskObj = task.toObject();
      taskObj.submitted_by_name = task.submitted_by?.name || 'Unknown';
      return taskObj;
    });
    
    res.json(formattedTasks);
  } catch (err) {
    console.error('Error in pending-approvals:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get performance metrics for all employees
app.get('/api/admin/performance-metrics', async (req, res) => {
  try {
    const workers = await User.find({ role: 'worker' });
    const performanceData = [];
    
    for (const worker of workers) {
      const tasks = await Task.find({ assigned_to: worker._id });
      const completed = tasks.filter(t => t.approval_status === 'approved').length;
      const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
      const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
      
      performanceData.push({
        user_id: worker._id,
        name: worker.name,
        email: worker.email,
        tasks_completed: completed,
        tasks_assigned: tasks.length,
        total_hours_worked: totalHours,
        completion_rate: Math.round(completionRate)
      });
    }
    
    res.json(performanceData);
  } catch (err) {
    console.error('Error in performance-metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get individual employee performance metrics
app.get('/api/employee/performance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const tasks = await Task.find({ assigned_to: userId });
    const completed = tasks.filter(t => t.approval_status === 'approved').length;
    const submitted = tasks.filter(t => t.approval_status === 'pending' && t.status === 'submitted').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
    const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;

    const user = await User.findById(userId);

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      performance: {
        tasks_completed: completed,
        tasks_submitted_pending: submitted,
        tasks_in_progress: inProgress,
        tasks_assigned: tasks.length,
        total_hours_worked: parseFloat(totalHours.toFixed(2)),
        completion_rate: Math.round(completionRate)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Generate QR code for user
app.post('/api/generate-user-qr', async (req, res) => {
  try {
    const { userId, email, name } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    let existingQR = await QRCode.findOne({ user_id: userId });
    if (existingQR) {
      return res.json({ 
        ok: true, 
        qrToken: existingQR.qr_token,
        qrData: existingQR.qr_data,
        isActivated: existingQR.is_activated
      });
    }

    const qrToken = uuidv4();
    const qrPayload = JSON.stringify({
      userId,
      email,
      name,
      token: qrToken,
      timestamp: new Date().toISOString()
    });

    const qrData = await QR.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2
    });

    const qrCode = new QRCode({
      user_id: userId,
      qr_token: qrToken,
      qr_data: qrData
    });
    
    await qrCode.save();

    res.json({ 
      ok: true, 
      qrToken,
      qrData,
      isActivated: false
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// Get user QR code
app.get('/api/user-qr/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const qrCode = await QRCode.findOne({ user_id: userId });
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }

    res.json({
      ok: true,
      qrToken: qrCode.qr_token,
      qrData: qrCode.qr_data,
      isActivated: qrCode.is_activated,
      generatedAt: qrCode.generated_at,
      firstScanAt: qrCode.first_scan_at,
      scanCount: qrCode.scan_count
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Scan QR code
app.post('/api/scan-qr', async (req, res) => {
  try {
    const { qrToken, userId } = req.body;
    if (!qrToken || !userId) {
      return res.status(400).json({ error: 'qrToken and userId required' });
    }

    const qrCode = await QRCode.findOne({ qr_token: qrToken, user_id: userId });
    
    if (!qrCode) {
      return res.status(404).json({ error: 'Invalid QR code' });
    }

    const now = new Date();
    const scanIp = req.ip || req.connection.remoteAddress || '0.0.0.0';

    const scan = new QRScan({
      user_id: userId,
      qr_token: qrToken,
      scanned_at: now,
      scanner_ip: scanIp
    });
    
    await scan.save();

    if (!qrCode.is_activated) {
      qrCode.is_activated = true;
      qrCode.first_scan_at = now;
      qrCode.scan_count = 1;
    } else {
      qrCode.scan_count += 1;
    }
    
    await qrCode.save();

    res.json({
      ok: true,
      message: 'QR code scanned successfully',
      scanTime: now.toISOString(),
      scanCount: qrCode.scan_count
    });
  } catch (err) {
    console.error('QR scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get QR scan records for a user
app.get('/api/qr-scans/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const scans = await QRScan.find({ user_id: userId })
      .sort({ scanned_at: -1 });

    const qrCode = await QRCode.findOne({ user_id: userId });

    res.json({
      ok: true,
      qrCode: qrCode ? {
        qrToken: qrCode.qr_token,
        generatedAt: qrCode.generated_at,
        isActivated: qrCode.is_activated,
        firstScanAt: qrCode.first_scan_at,
        scanCount: qrCode.scan_count
      } : null,
      scans: scans.map(s => ({
        id: s._id,
        scannedAt: s.scanned_at,
        scannerIp: s.scanner_ip,
        scanTime: new Date(s.scanned_at).toLocaleString()
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Admin: Get all QR scan records
app.get('/api/admin/qr-scan-records', async (req, res) => {
  try {
    const scans = await QRScan.find()
      .populate('user_id', 'name email')
      .sort({ scanned_at: -1 });
    
    const records = await Promise.all(scans.map(async (scan) => {
      const qrCode = await QRCode.findOne({ user_id: scan.user_id._id });
      return {
        id: scan._id,
        userId: scan.user_id._id,
        userName: scan.user_id.name,
        userEmail: scan.user_id.email,
        scannedAt: scan.scanned_at,
        scanTime: new Date(scan.scanned_at).toLocaleString(),
        scannerIp: scan.scanner_ip,
        qrActivated: qrCode?.is_activated || false,
        totalScans: qrCode?.scan_count || 0
      };
    }));

    res.json({
      ok: true,
      records
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Record attendance
app.post('/api/attendance', async (req, res) => {
  try {
    const { user_id, action } = req.body;
    if (!user_id || !action) {
      return res.status(400).json({ error: 'user_id and action required' });
    }
    
    const attendance = new Attendance({
      user_id,
      action,
      timestamp: new Date()
    });
    
    await attendance.save();
    
    res.json({ ok: true, id: attendance._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get attendance for a user
app.get('/api/attendance/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const records = await Attendance.find({ user_id })
      .sort({ timestamp: -1 });
    
    res.json(records);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Record time log
app.post('/api/time', async (req, res) => {
  try {
    const { user_id, action, time } = req.body;

    const timeLog = new TimeLog({
      user_id,
      action,
      time: time || new Date()
    });
    
    await timeLog.save();
    
    res.json({ ok: true, id: timeLog._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get time logs for a user
app.get('/api/time/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    const logs = await TimeLog.find({ user_id })
      .sort({ time: -1 });
    
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Legacy QR endpoints (for backward compatibility)
app.post('/api/generate-qr-token', async (req, res) => {
  try {
    const { userId, email, role } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    const timestamp = new Date().toISOString();
    const qrData = {
      userId,
      email,
      role,
      generatedAt: timestamp
    };
    
    const qrString = JSON.stringify(qrData);
    const qrImage = await QR.toDataURL(qrString, { errorCorrectionLevel: 'H' });
    
    res.json({ 
      ok: true, 
      qrCode: qrImage,
      qrData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Generate QR (file-based legacy)
app.post('/api/generate-qr', async (req, res) => {
  try {
    const { username, role } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    
    const token = uuidv4();
    let tokens = {};
    try {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    } catch (e) {
      tokens = {};
    }
    
    tokens[token] = { username, role, createdAt: new Date().toISOString() };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    
    const qrData = await QR.toDataURL(token);
    res.json({ token, qrData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

// Validate token (legacy)
app.post('/api/validate-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    
    let tokens = {};
    try {
      tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    } catch (e) {
      tokens = {};
    }
    
    const info = tokens[token];
    if (!info) return res.status(404).json({ ok: false });
    
    res.json({ ok: true, user: info });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token validation failed' });
  }
});

// ===============================================
// Static Files & Fallback
// ===============================================

app.use(express.static(root));
app.get('*', (req, res) => res.sendFile(path.join(root, 'index.html')));

// ===============================================
// Start Server
// ===============================================

async function startServer() {
  try {
    console.log('--- WFMS Server Starting ---');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Port:', port);
    console.log('Database:', 'MongoDB');
    console.log('Connection status:', connectionStatus());

    await initializeDatabase();

    server.listen(port, () => {
      console.log('\n========================================');
      console.log('✓ Server running at http://localhost:' + port + '/');
      console.log('✓ Database:', isConnected() ? 'MongoDB Connected' : 'MongoDB Disconnected');
      console.log('========================================\n');
    });

    server.on('error', (err) => {
      console.error('✗ Server error event:', err);
    });
  } catch (err) {
    console.error('✗ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();