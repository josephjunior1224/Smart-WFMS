// api/index.js - Vercel Serverless Entry Point for WFMS
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const QR = require('qrcode');

// Import your database connection
const dbModule = require('../db');
const { connectDB, User, Task, QRCode, QRScan, Performance } = dbModule;

// Import email service
const emailService = require('../models/emailService');

const app = express();

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// Initialize email service
emailService.initializeEmailService();

// JWT Secret (use environment variable in production)
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// ========== AUTH ROUTES ==========
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
      expiresIn: 604800
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already registered' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const user = new User({
      name,
      email,
      password: hash,
      role: role || 'worker'
    });
    
    await user.save();
    
    res.json({ ok: true, userId: user._id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== USER ROUTES ==========
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'name role');
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== TASK ROUTES ==========
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await Task.find().populate('assigned_to', 'name');
    res.json(tasks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

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

app.post('/api/tasks/:id/submit-report', async (req, res) => {
  try {
    const { id } = req.params;
    const { daily_report, status, hours_spent, submitted_by } = req.body;
    
    const task = await Task.findById(id);
    task.status = status;
    task.daily_report = daily_report;
    task.hours_spent = hours_spent;
    task.submitted_by = submitted_by;
    task.submitted_at = new Date();
    task.approval_status = 'pending';
    
    await task.save();
    
    res.json({ ok: true, taskId: id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== QR CODE ROUTES ==========
app.post('/api/generate-user-qr', async (req, res) => {
  try {
    const { userId, email, name } = req.body;
    
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
      width: 300
    });
    
    const qrCode = new QRCode({
      user_id: userId,
      qr_token: qrToken,
      qr_data: qrData
    });
    
    await qrCode.save();
    
    res.json({ ok: true, qrToken, qrData, isActivated: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.post('/api/scan-qr', async (req, res) => {
  try {
    const { qrToken, userId } = req.body;
    
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== PERFORMANCE ROUTES ==========
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ========== STATIC FILES ==========
// Serve static files from the public directory
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

// Serve index.html for any other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// ========== EXPORT FOR VERCEL ==========
module.exports = app;

// ========== LOCAL DEVELOPMENT ==========
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`🚀 Local server running at http://localhost:${PORT}`);
  });
}