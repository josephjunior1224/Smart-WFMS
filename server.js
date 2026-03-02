// ===============================================
// WFMS Server – Express + SQLite
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
// const socketIO = require('socket.io');  // Commented out for now - real-time features optional

// Import database module (handles SQLite)
const dbModule = require('./db');
const { db, dbRun, dbGet, dbAll, useFirebase } = dbModule;

// Import email service
const emailService = require('./models/emailService');
emailService.initializeEmailService();

// Initialize Express app
const app = express();
const server = http.createServer(app);
// const io = socketIO(server, {  // Commented out for now
//   cors: { origin: '*', methods: ['GET', 'POST'] },
//   transports: ['websocket', 'polling']
// });

const port = process.env.PORT || 8000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const root = process.cwd();
const DATA_DIR = path.join(root, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Track connected users for notifications
const connectedUsers = {};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (helpful for debugging client requests)
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

// --- Public config endpoint for client Firebase initialization ---
app.get('/config', (req, res) => {
  const cfg = {
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.firebaseapp.com` : ''),
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || (process.env.FIREBASE_PROJECT_ID ? `${process.env.FIREBASE_PROJECT_ID}.appspot.com` : ''),
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  };
  res.json(cfg);
});

// Ensure data dir and token file exist
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR); } catch(e){}
try { if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, JSON.stringify({}), 'utf8'); } catch(e){}

// ===============================================
// Database Initialization (SQLite Only)
// ===============================================

async function initializeDatabase() {
  if (useFirebase) {
    console.log('✓ Using Firebase - skipping SQLite schema initialization');
    return;
  }

  try {
    // Create SQLite tables
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'worker',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        assigned_to INTEGER,
        status TEXT DEFAULT 'pending',
        daily_report TEXT,
        submitted_at DATETIME,
        hours_spent REAL DEFAULT 0,
        submitted_by INTEGER,
        approval_status TEXT DEFAULT 'pending',
        admin_feedback TEXT,
        approved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (submitted_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS attendance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS time_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT,
        time DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS qr_scans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        qr_token TEXT,
        scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        scanner_ip TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS user_qr_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        qr_token TEXT UNIQUE NOT NULL,
        qr_data TEXT,
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        first_scan_at DATETIME,
        scan_count INTEGER DEFAULT 0,
        is_activated BOOLEAN DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await dbRun(`
      CREATE TABLE IF NOT EXISTS performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task_id INTEGER,
        tasks_completed INTEGER DEFAULT 0,
        tasks_assigned INTEGER DEFAULT 0,
        total_hours_worked REAL DEFAULT 0,
        completion_rate REAL DEFAULT 0,
        average_completion_time_days REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        UNIQUE(user_id)
      )
    `);

    console.log('✓ SQLite database schema initialized');

    // Seed admin if missing
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@wfms.local';
    const adminPassword = process.env.SEED_ADMIN_PASS || 'admin';

    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [adminEmail]);
    if (!existing) {
      const hash = await bcrypt.hash(adminPassword, 10);
      const result = await dbRun('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', 
        ['Admin', adminEmail, hash, 'admin']);
      
      const adminId = result.id;
      
      // Insert sample task
      await dbRun('INSERT INTO tasks (title, description, assigned_to, status) VALUES (?, ?, ?, ?)',
        ['Welcome Task', 'This is a seeded welcome task.', adminId, 'pending']);
      
      console.log('✓ Seeded admin user and sample task');
    }
  } catch (err) {
    console.error('✗ Database initialization error:', err.message);
    throw err;
  }
}

// ===============================================
// QR API Routes
// ===============================================

// Generate unique QR code for user after signup
app.post('/api/generate-user-qr', async (req, res) => {
  try {
    const { userId, email, name } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    // Check if user already has a QR code
    let existingQR = await dbGet('SELECT * FROM user_qr_codes WHERE user_id = ?', [userId]);
    if (existingQR) {
      // Return existing QR
      return res.json({ 
        ok: true, 
        qrToken: existingQR.qr_token,
        qrData: existingQR.qr_data,
        isActivated: existingQR.is_activated
      });
    }

    const qrToken = uuidv4();
    const qrPayload = JSON.stringify({
      userId: userId,
      email: email,
      name: name,
      token: qrToken,
      timestamp: new Date().toISOString()
    });

    // Generate QR code as data URL
    const qrData = await QR.toDataURL(qrPayload, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

    // Store in database
    await dbRun(
      `INSERT INTO user_qr_codes (user_id, qr_token, qr_data, generated_at) 
       VALUES (?, ?, ?, datetime('now'))`,
      [userId, qrToken, qrData]
    );

    console.log('✓ QR code generated for user:', userId);
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
    const qrCode = await dbGet('SELECT * FROM user_qr_codes WHERE user_id = ?', [userId]);
    
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

// Scan QR code and record date/time
app.post('/api/scan-qr', async (req, res) => {
  try {
    const { qrToken, userId } = req.body;
    if (!qrToken || !userId) {
      return res.status(400).json({ error: 'qrToken and userId required' });
    }

    // Verify QR token belongs to this user
    const qrCode = await dbGet('SELECT * FROM user_qr_codes WHERE qr_token = ? AND user_id = ?', [qrToken, userId]);
    
    if (!qrCode) {
      return res.status(404).json({ error: 'Invalid QR code' });
    }

    const now = new Date();
    const scanIp = req.ip || req.connection.remoteAddress || '0.0.0.0';

    // Record scan
    await dbRun(
      `INSERT INTO qr_scans (user_id, qr_token, scanned_at, scanner_ip) 
       VALUES (?, ?, ?, ?)`,
      [userId, qrToken, now.toISOString(), scanIp]
    );

    // Update QR code activation and scan count
    if (!qrCode.is_activated) {
      await dbRun(
        `UPDATE user_qr_codes 
         SET is_activated = 1, first_scan_at = datetime('now'), scan_count = 1 
         WHERE user_id = ?`,
        [userId]
      );
    } else {
      await dbRun(
        `UPDATE user_qr_codes 
         SET scan_count = scan_count + 1 
         WHERE user_id = ?`,
        [userId]
      );
    }

    console.log('✓ QR code scanned for user:', userId, 'at', now);
    res.json({
      ok: true,
      message: 'QR code scanned successfully',
      scanTime: now.toISOString(),
      scanCount: qrCode.scan_count + 1
    });
  } catch (err) {
    console.error('QR scan error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all QR scan records for a user (admin view)
app.get('/api/qr-scans/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const scans = await dbAll(
      `SELECT id, user_id, scanned_at, scanner_ip FROM qr_scans 
       WHERE user_id = ? 
       ORDER BY scanned_at DESC`,
      [userId]
    );

    const qrCode = await dbGet('SELECT * FROM user_qr_codes WHERE user_id = ?', [userId]);

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
        id: s.id,
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

// Admin: Get all QR scan records for security audit
app.get('/api/admin/qr-scan-records', async (req, res) => {
  try {
    const records = await dbAll(
      `SELECT 
        qs.id, qs.user_id, qs.scanned_at, qs.scanner_ip,
        u.name, u.email,
        uqc.scan_count, uqc.is_activated
      FROM qr_scans qs
      JOIN users u ON qs.user_id = u.id
      LEFT JOIN user_qr_codes uqc ON qs.user_id = uqc.user_id
      ORDER BY qs.scanned_at DESC`
    );

    res.json({
      ok: true,
      records: records.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.name,
        userEmail: r.email,
        scannedAt: r.scanned_at,
        scanTime: new Date(r.scanned_at).toLocaleString(),
        scannerIp: r.scanner_ip,
        qrActivated: r.is_activated,
        totalScans: r.scan_count
      }))
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Legacy QR endpoints (for backward compatibility)
app.post('/api/generate-qr', async (req, res) => {
  try {
    const { username, role } = req.body;
    if (!username) return res.status(400).json({ error: 'username required' });
    
    const token = uuidv4();
    const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    tokens[token] = { username, role, createdAt: new Date().toISOString() };
    fs.writeFileSync(TOKENS_FILE, JSON.stringify(tokens, null, 2), 'utf8');
    
    const qrData = await QR.toDataURL(token);
    res.json({ token, qrData });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.post('/api/validate-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });
    
    const tokens = JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf8') || '{}');
    const info = tokens[token];
    if (!info) return res.status(404).json({ ok: false });
    
    res.json({ ok: true, user: info });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Token validation failed' });
  }
});

// ===============================================
// SQLite API Routes (for SQLite backend)
// ===============================================

// Check if email exists (for validation)
app.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    const user = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    res.json({ exists: !!user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    if (useFirebase) {
      return res.status(400).json({ error: 'Use Firebase Authentication instead' });
    }

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
    const existing = await dbGet('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Email already registered. Please login or use a different email.' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const result = await dbRun(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [name, email, hash, role || 'worker']
    );
    
    res.json({ ok: true, userId: result.id });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    if (useFirebase) {
      return res.status(400).json({ error: 'Use Firebase Authentication instead' });
    }

    const { email, password } = req.body;
    const user = await dbGet(
      'SELECT id, name, email, password, role FROM users WHERE email = ?',
      [email]
    );
    
    if (!user) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    delete user.password;
    
    // Generate JWT token (valid for 7 days)
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Generate refresh token (valid for 30 days)
    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({ 
      ok: true, 
      user,
      token,
      refreshToken,
      expiresIn: 604800 // 7 days in seconds
    });
  } catch (err) {
    console.error(err);
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

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    const user = await dbGet(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [decoded.id]
    );
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new access token
    const newToken = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
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
    // SQLite mode - use email to create/get user
    const { email, name } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    
    // Check if user exists
    let user = await dbGet('SELECT id, name, email, role FROM users WHERE email = ?', [email]);
    
    if (!user) {
      // Create new user with empty password (Google account)
      const result = await dbRun(
        'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
        [name || email, email, '', 'worker']
      );
      user = {
        id: result.id,
        name: name || email,
        email: email,
        role: 'worker'
      };
    }
    
    // Generate JWT tokens
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    res.json({
      ok: true,
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
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
    if (useFirebase) {
      const snapshot = await firebase.db.collection('users').get();
      const users = [];
      snapshot.forEach(doc => {
        users.push({ id: doc.id, ...doc.data() });
      });
      return res.json(users);
    }

    const rows = await dbAll('SELECT id, name, role FROM users');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Add task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, assigned_to } = req.body;

    if (useFirebase) {
      const docRef = await firebase.db.collection('tasks').add({
        title,
        description,
        assigned_to,
        status: 'pending',
        created_at: new Date()
      });
      return res.json({ ok: true, taskId: docRef.id });
    }

    const result = await dbRun(
      'INSERT INTO tasks (title, description, assigned_to, status) VALUES (?, ?, ?, ?)',
      [title, description, assigned_to, 'pending']
    );
    
    res.json({ ok: true, taskId: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    if (useFirebase) {
      const snapshot = await firebase.db.collection('tasks').get();
      const tasks = [];
      snapshot.forEach(doc => {
        tasks.push({ id: doc.id, ...doc.data() });
      });
      return res.json(tasks);
    }

    const rows = await dbAll('SELECT * FROM tasks');
    res.json(rows);
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

    if (useFirebase) {
      await firebase.db.collection('tasks').doc(id).update({ status });
      return res.json({ ok: true });
    }
    
    await dbRun('UPDATE tasks SET status = ? WHERE id = ?', [status, id]);
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

    if (useFirebase) {
      await firebase.db.collection('tasks').doc(id).update({
        status: 'submitted',
        daily_report,
        hours_spent,
        submitted_by,
        submitted_at: new Date(),
        approval_status: 'pending'
      });
      return res.json({ ok: true, taskId: id });
    }

    // Get task and employee info
    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [id]);
    const employee = await dbGet('SELECT * FROM users WHERE id = ?', [submitted_by]);
    const adminUsers = await dbAll('SELECT * FROM users WHERE role = ?', ['admin']);

    // Update task
    const result = await dbRun(
      `UPDATE tasks SET status = ?, daily_report = ?, hours_spent = ?, submitted_by = ?, 
       submitted_at = CURRENT_TIMESTAMP, approval_status = 'pending' WHERE id = ?`,
      [status, daily_report, hours_spent, submitted_by, id]
    );

    // Update performance metrics
    const existingMetrics = await dbGet('SELECT * FROM performance_metrics WHERE user_id = ?', [submitted_by]);
    if (existingMetrics) {
      // Calculate updated metrics
      const completedTasks = await dbAll(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND approval_status = ?',
        [submitted_by, 'approved']
      );
      const assignedTasks = await dbAll(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ?',
        [submitted_by]
      );
      
      const completionRate = assignedTasks[0].count > 0 
        ? (completedTasks[0].count / assignedTasks[0].count) * 100 
        : 0;

      await dbRun(
        `UPDATE performance_metrics 
         SET tasks_completed = ?, tasks_assigned = ?, total_hours_worked = total_hours_worked + ?,
             completion_rate = ?, last_updated = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [completedTasks[0].count, assignedTasks[0].count, hours_spent, completionRate, submitted_by]
      );
    } else {
      // Create new performance metrics record
      await dbRun(
        `INSERT INTO performance_metrics (user_id, task_id, tasks_completed, tasks_assigned, total_hours_worked, completion_rate, last_updated)
         VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [submitted_by, id, 0, 1, hours_spent, 0]
      );
    }

    // Send email notification to all admins
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

    if (useFirebase) {
      await firebase.db.collection('tasks').doc(id).update({
        approval_status: 'approved',
        status: 'completed',
        admin_feedback: feedback,
        approved_at: new Date()
      });
      return res.json({ ok: true });
    }

    // Get task and employee info
    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [id]);
    const employee = await dbGet('SELECT * FROM users WHERE id = ?', [task.submitted_by]);

    await dbRun(
      `UPDATE tasks SET approval_status = 'approved', status = 'completed', 
       admin_feedback = ?, approved_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [feedback, id]
    );

    // Update performance metrics
    const metrics = await dbGet('SELECT * FROM performance_metrics WHERE user_id = ?', [task.submitted_by]);
    if (metrics) {
      const completedTasks = await dbAll(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ? AND approval_status = ?',
        [task.submitted_by, 'approved']
      );
      const assignedTasks = await dbAll(
        'SELECT COUNT(*) as count FROM tasks WHERE assigned_to = ?',
        [task.submitted_by]
      );
      
      const completionRate = assignedTasks[0].count > 0 
        ? (completedTasks[0].count / assignedTasks[0].count) * 100 
        : 0;

      await dbRun(
        `UPDATE performance_metrics 
         SET tasks_completed = ?, completion_rate = ?, last_updated = CURRENT_TIMESTAMP
         WHERE user_id = ?`,
        [completedTasks[0].count, completionRate, task.submitted_by]
      );
    }

    // Send email notification to employee
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

    if (useFirebase) {
      await firebase.db.collection('tasks').doc(id).update({
        approval_status: 'rejected',
        status: 'in-progress',
        admin_feedback: feedback
      });
      return res.json({ ok: true });
    }

    // Get task and employee info
    const task = await dbGet('SELECT * FROM tasks WHERE id = ?', [id]);
    const employee = await dbGet('SELECT * FROM users WHERE id = ?', [task.submitted_by]);

    await dbRun(
      `UPDATE tasks SET approval_status = 'rejected', admin_feedback = ? WHERE id = ?`,
      [feedback, id]
    );

    // Send email notification to employee
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

// Get pending task approvals for admin (SINGLE DEFINITION)
app.get('/api/admin/pending-approvals', async (req, res) => {
  try {
    if (useFirebase) {
      const snapshot = await firebase.db.collection('tasks')
        .where('approval_status', '==', 'pending')
        .get();
      
      const tasks = [];
      snapshot.forEach(doc => {
        tasks.push({ id: doc.id, ...doc.data() });
      });
      return res.json(tasks);
    }

    const rows = await dbAll(
      `SELECT t.*, u.name as submitted_by_name FROM tasks t
       LEFT JOIN users u ON t.submitted_by = u.id
       WHERE t.approval_status = 'pending' ORDER BY t.submitted_at DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error in pending-approvals:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get performance metrics for all employees
app.get('/api/admin/performance-metrics', async (req, res) => {
  try {
    if (useFirebase) {
      return res.status(400).json({ error: 'Not available in Firebase mode' });
    }

    const metrics = await dbAll(
      `SELECT 
        pm.user_id, pm.tasks_completed, pm.tasks_assigned, 
        pm.total_hours_worked, pm.completion_rate,
        u.name, u.email
       FROM performance_metrics pm
       JOIN users u ON pm.user_id = u.id
       WHERE u.role = 'worker'
       ORDER BY pm.completion_rate DESC`
    );

    // If no performance metrics table data, calculate on the fly
    if (!metrics || metrics.length === 0) {
      const users = await dbAll("SELECT * FROM users WHERE role = 'worker'");
      const performanceData = await Promise.all(
        users.map(async (u) => {
          const allTasks = await dbAll('SELECT * FROM tasks WHERE assigned_to = ?', [u.id]);
          const completed = allTasks.filter(t => t.approval_status === 'approved').length;
          const totalHours = allTasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
          const completionRate = allTasks.length > 0 ? (completed / allTasks.length) * 100 : 0;

          return {
            user_id: u.id,
            name: u.name,
            email: u.email,
            tasks_completed: completed,
            tasks_assigned: allTasks.length,
            total_hours_worked: totalHours,
            completion_rate: Math.round(completionRate)
          };
        })
      );
      return res.json(performanceData);
    }

    res.json(metrics);
  } catch (err) {
    console.error('Error in performance-metrics:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get individual employee performance metrics
app.get('/api/employee/performance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const allTasks = await dbAll('SELECT * FROM tasks WHERE assigned_to = ?', [userId]);
    const completed = allTasks.filter(t => t.approval_status === 'approved').length;
    const submitted = allTasks.filter(t => t.approval_status === 'pending' && t.status === 'submitted').length;
    const inProgress = allTasks.filter(t => t.status === 'in-progress').length;
    const totalHours = allTasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
    const completionRate = allTasks.length > 0 ? (completed / allTasks.length) * 100 : 0;

    const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);

    res.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      performance: {
        tasks_completed: completed,
        tasks_submitted_pending: submitted,
        tasks_in_progress: inProgress,
        tasks_assigned: allTasks.length,
        total_hours_worked: parseFloat(totalHours.toFixed(2)),
        completion_rate: Math.round(completionRate)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ===============================================
// QR Code Generation and Scanning
// ===============================================

// Generate QR code token for user (called after signup)
app.post('/api/generate-qr-token', async (req, res) => {
  try {
    const { userId, email, role } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    // Create QR token with user info + timestamp
    const timestamp = new Date().toISOString();
    const qrData = {
      userId,
      email,
      role,
      generatedAt: timestamp
    };
    
    // Generate QR code as base64 image
    const qrString = JSON.stringify(qrData);
    const qrImage = await QR.toDataURL(qrString, { errorCorrectionLevel: 'H' });
    
    res.json({ 
      ok: true, 
      qrCode: qrImage,
      qrData: qrData
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Handle QR code scan - log scan and return user data
app.post('/api/qr-scan', async (req, res) => {
  try {
    const { userId, email, role, qrToken } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    
    // Get scanner IP
    const scannerIp = req.ip || req.connection.remoteAddress || 'unknown';
    
    // Log the QR scan
    await dbRun(
      'INSERT INTO qr_scans (user_id, qr_token, scanner_ip) VALUES (?, ?, ?)',
      [userId, qrToken || 'local-scan', scannerIp]
    );
    
    // Verify user exists and return complete user data
    const user = await dbGet(
      'SELECT id, name, email, role FROM users WHERE id = ?',
      [userId]
    );
    
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    console.log(`✓ QR scanned for user ${user.name} (${email}) at ${new Date().toLocaleString()}`);
    
    res.json({ 
      ok: true, 
      user: user,
      scannedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get QR scan history for a user
app.get('/api/qr-scans/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const scans = await dbAll(
      'SELECT id, scanned_at, scanner_ip FROM qr_scans WHERE user_id = ? ORDER BY scanned_at DESC LIMIT 50',
      [userId]
    );
    res.json(scans);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Attendance: clock in, break start, break end, clock out
app.post('/api/attendance', async (req, res) => {
  try {
    const { user_id, action } = req.body;
    if (!user_id || !action) {
      return res.status(400).json({ error: 'user_id and action required' });
    }

    if (useFirebase) {
      const docRef = await firebase.db.collection('attendance').add({
        user_id,
        action,
        timestamp: new Date()
      });
      return res.json({ ok: true, id: docRef.id });
    }
    
    const result = await dbRun(
      'INSERT INTO attendance (user_id, action) VALUES (?, ?)',
      [user_id, action]
    );
    
    res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get attendance for a user
app.get('/api/attendance/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    if (useFirebase) {
      const snapshot = await firebase.db.collection('attendance')
        .where('user_id', '==', parseInt(user_id))
        .orderBy('timestamp', 'desc')
        .get();
      const records = [];
      snapshot.forEach(doc => {
        records.push({ id: doc.id, ...doc.data() });
      });
      return res.json(records);
    }
    
    const rows = await dbAll(
      'SELECT * FROM attendance WHERE user_id = ? ORDER BY timestamp DESC',
      [user_id]
    );
    
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Time logs (legacy, maps to attendance)
app.post('/api/time', async (req, res) => {
  try {
    const { user_id, action, time } = req.body;

    if (useFirebase) {
      const docRef = await firebase.db.collection('time_logs').add({
        user_id,
        action,
        time: time ? new Date(time) : new Date(),
        created_at: new Date()
      });
      return res.json({ ok: true, id: docRef.id });
    }
    
    const result = await dbRun(
      'INSERT INTO time_logs (user_id, action, time) VALUES (?, ?, ?)',
      [user_id, action, time || new Date().toISOString()]
    );
    
    res.json({ ok: true, id: result.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Get time logs for a user
app.get('/api/time/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;

    if (useFirebase) {
      const snapshot = await firebase.db.collection('time_logs')
        .where('user_id', '==', parseInt(user_id))
        .orderBy('time', 'desc')
        .get();
      const records = [];
      snapshot.forEach(doc => {
        records.push({ id: doc.id, ...doc.data() });
      });
      return res.json(records);
    }
    
    const rows = await dbAll(
      'SELECT * FROM time_logs WHERE user_id = ? ORDER BY time DESC',
      [user_id]
    );
    
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
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
    // Log startup configuration
    console.log('--- WFMS Server Starting ---');
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('Port:', port);
    console.log('Using Firebase backend?', !!useFirebase);
    try { console.log('Database file:', db && db.filename ? db.filename : 'n/a'); } catch(e) {}

    // Initialize database (SQLite) if applicable
    if (!useFirebase) {
      console.log('Initializing database schema...');
      await initializeDatabase();
      console.log('Database initialization complete');
    }

    server.listen(port, () => {
      console.log('\n========================================');
      console.log('✓ Server running at http://localhost:' + port + '/');
      console.log('✓ Database:', useFirebase ? 'Firebase' : 'SQLite');
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