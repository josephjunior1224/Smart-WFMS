// ===============================================
// WFMS Server – Express + MongoDB (FULLY CORRECTED)
// ===============================================
console.log('🚀 STARTING WFMS SERVER - CSRF DISABLED VERSION');
require('dotenv').config();
const logger = require('./logger');

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET', 'MONGODB_URI'];
const optionalEnvVars = ['EMAIL_USER', 'EMAIL_PASS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];

logger.info('🔍 Validating environment variables...');

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    logger.error(`❌ Missing required environment variable: ${envVar}`);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
}

for (const envVar of optionalEnvVars) {
  if (!process.env[envVar]) {
    logger.warn(`⚠️ Optional environment variable missing: ${envVar}`);
  }
}

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const express = require('express');
// const helmet = require('helmet');
const csrf = require('csurf');
const cookieParser = require('cookie-parser');
const NodeCache = require('node-cache');
const userCache = new NodeCache({ stdTTL: 300 });
const QR = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');

// Report generation libraries
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Import MongoDB models and helpers
const { 
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
  connectionStatus
} = require('./db');
// Add this after your imports
console.log('\n🔍 === MODEL IMPORT CHECK ===');
console.log('User:', typeof User);
console.log('Task:', typeof Task);
console.log('Team:', typeof Team);
console.log('QRCode:', typeof QRCode);
console.log('===========================\n');
// Import email service
const emailService = require('./models/emailService');
emailService.initializeEmailService();

// Initialize Express app
const app = express();
const server = http.createServer(app);

const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? [process.env.FRONTEND_URL, 'https://your-domain.com']
    : ['http://localhost:3000', 'http://localhost:8000', 'http://127.0.0.1:8000'],
  credentials: true,
  optionsSuccessStatus: 200
};

const io = socketIO(server, {
  cors: {
    origin: function(origin, callback) {
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*') || (corsOptions.origin && corsOptions.origin.includes(origin))) {
        return callback(null, true);
      }
      callback(new Error('CORS origin not allowed'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

const port = process.env.PORT || 8001;

// Validate JWT_SECRET (don't abort in development to aid local dev)
if (!process.env.JWT_SECRET) {
  logger.warn('⚠️ JWT_SECRET not set. Using a development fallback.');
  if (process.env.NODE_ENV === 'production') {
    logger.error('❌ JWT_SECRET environment variable is required in production');
    process.exit(1);
  }
}
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const root = process.cwd();
const DATA_DIR = path.join(root, 'data');
const TOKENS_FILE = path.join(DATA_DIR, 'tokens.json');

// Track connected users for notifications
const connectedUsers = {};
const userSockets = new Map(); // Map userId -> socketId
const socketUsers = new Map(); // Map socketId -> userId

// Ensure data dir exists (for legacy token storage)
try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e){}
try { if (!fs.existsSync(TOKENS_FILE)) fs.writeFileSync(TOKENS_FILE, JSON.stringify({}), 'utf8'); } catch(e){}

const UPLOAD_DIR = path.join(root, 'uploads');
try { if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true }); } catch(e) {}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
  }),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// ===============================================
// Rate Limiting
// ===============================================

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    return res.status(429).json({ ok: false, error: 'Too many requests, please try again later.' });
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    if (req.path === '/api/login' || req.path === '/api/signup') {
      return req.body?.email?.toLowerCase?.() || req.ip;
    }
    return req.ip;
  },
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for: ${req.body?.email || req.ip}`);
    return res.status(429).json({ ok: false, error: 'Too many login attempts, please try again later.' });
  }
});

// Database connection is handled in `db.js` (centralized).
// `db.js` exports connection helpers and models. Avoid duplicate
// `mongoose.connect(...)` calls here to prevent confusing startup.

// Middleware - IMPORTANT: JSON parser must be early
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Security headers (Helmet)
const helmet = require('helmet');
app.use(helmet({
  contentSecurityPolicy: false, // Disable if you need inline scripts
  crossOriginEmbedderPolicy: false
}));

// HTTPS enforcement in production
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// CORS middleware
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Apply rate limiters AFTER JSON middleware
app.use('/api/', limiter);
app.use('/api/login', authLimiter);
app.use('/api/signup', authLimiter);

// Stricter rate limiting for auth routes
const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: { ok: false, error: 'Too many login attempts, please try again later.' }
});

app.use('/api/login', strictAuthLimiter);
app.use('/api/signup', strictAuthLimiter);
app.use('/api/qr/generate', rateLimit({ windowMs: 60 * 60 * 1000, max: 10 }));
app.use('/api/tasks', rateLimit({ windowMs: 60 * 1000, max: 30 }));

if (process.env.NODE_ENV !== 'production') {
  app.post('/api/admin/reset-rate-limit', (req, res) => {
    try {
      limiter.resetKey(req.ip);
      authLimiter.resetKey(req.ip);
      return res.json({ ok: true, message: 'Rate limit reset for IP: ' + req.ip });
    } catch (err) {
      console.error('Error resetting rate limit:', err);
      return res.status(500).json({ ok: false, error: 'Could not reset rate limit' });
    }
  });
}


// ===============================================
// Session & Passport Configuration
// ===============================================

// Validate Google OAuth credentials
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  logger.warn('⚠️ Google OAuth credentials not set. Google login will be disabled.');
}

// Session middleware
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  logger.error('❌ SESSION_SECRET environment variable is required in production');
  process.exit(1);
}

app.use(session({
  name: 'sessionId',
  secret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
    domain: process.env.NODE_ENV === 'production' ? '.your-domain.com' : undefined
  }
}));

//// CSRF protection - DISABLED FOR API ROUTES in development
if (process.env.NODE_ENV === 'production') {
  // Only enable CSRF in production
  const csrfProtection = csrf({ cookie: true });
  
  // Apply to non-API routes only
  app.use((req, res, next) => {
    // Skip API routes
    if (req.path.startsWith('/api/')) {
      return next();
    }
    // Apply CSRF to non-API POST/PUT/DELETE/PATCH
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
      return csrfProtection(req, res, next);
    }
    next();
  });
  
  app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });
} else {
  // Development mode - simple placeholder
  app.get('/api/csrf-token', (req, res) => {
    res.json({ csrfToken: 'dev-csrf-token' });
  });
}
// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:8000/api/auth/google/callback'
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user exists by email
        let user = await User.findOne({ email: profile.emails[0].value });
        
        if (!user) {
          // Create new user from Google profile
          user = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            password: '', // No password for Google users
            role: 'worker', // Default role, can be changed by admin
            googleId: profile.id,
            avatar: profile.photos[0]?.value,
            created_at: new Date()
          });
          await user.save();
          logger.info('✅ New Google user created:', user.email);
        }
        
        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  ));
}

// Request logging middleware
app.use((req, res, next) => {
  try {
    const now = new Date().toISOString();
    const ua = req.headers['user-agent'] || '-';
    const ref = req.headers['referer'] || req.headers['referrer'] || '-';
    logger.info(`[${now}] ${req.method} ${req.originalUrl} - UA: ${ua} - Referer: ${ref}`);
  } catch (e) {
    logger.warn('Error in request logging middleware', e);
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
try {
  emailService.initializeEmailService();
} catch (err) {
  logger.warn('⚠️ Email service initialization failed:', err.message);
}
// Serve index.html for the root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
// ===============================================
// Socket.IO Real-Time Communications (ENHANCED)
// ===============================================

io.on('connection', (socket) => {
  const clientIp = socket.handshake.address;
  logger.info(`✓ New client connected: ${socket.id} from ${clientIp}`);

  // User registers their connection
  socket.on('register-user', (userId) => {
    if (!userId) {
      logger.warn('⚠️ Register-user called without userId');
      return;
    }
    
    // Store in maps
    connectedUsers[userId] = socket.id;
    userSockets.set(userId, socket.id);
    socketUsers.set(socket.id, userId);
    
    logger.info(`✓ User ${userId} registered for notifications (socket: ${socket.id})`);
    
    // Send confirmation
    socket.emit('connected', { 
      status: 'ok', 
      message: 'Connected to notification server',
      userId: userId,
      timestamp: new Date().toISOString()
    });
    
    // Broadcast to admins that user is online
    broadcastToAdmins({
      type: 'user_status',
      userId: userId,
      status: 'online',
      timestamp: new Date().toISOString()
    });
  });

  // Send notification to specific user
  socket.on('send-notification', async (data) => {
    const { recipientId, message, type, taskId, title } = data;
    
    if (!recipientId || !message) {
      socket.emit('error', { message: 'recipientId and message required' });
      return;
    }
    
    const recipientSocketId = connectedUsers[recipientId];
    
    if (recipientSocketId) {
      io.to(recipientSocketId).emit('notification', {
        type: type || 'info',
        message: message,
        taskId: taskId,
        title: title,
        timestamp: new Date().toISOString(),
        read: false
      });
      
      logger.info(`📬 Notification sent to user ${recipientId}: ${type || 'info'}`);
    } else {
      logger.info(`⚠️ User ${recipientId} is offline, notification not sent`);
      socket.emit('notification-failed', { 
        recipientId, 
        reason: 'User offline' 
      });
    }
  });

  // Broadcast to all admins
  socket.on('broadcast-to-admins', async (data) => {
    const { message, type, taskId } = data;
    
    // Get all admin users from database
    try {
      const admins = await User.find({ role: 'admin' });
      
      admins.forEach(admin => {
        const adminSocketId = connectedUsers[admin._id.toString()];
        if (adminSocketId) {
          io.to(adminSocketId).emit('notification', {
            type: type || 'broadcast',
            message: message,
            taskId: taskId,
            timestamp: new Date().toISOString(),
            broadcast: true
          });
        }
      });
      
      logger.info(`📢 Broadcast sent to ${admins.length} admins`);
    } catch (err) {
      logger.error('Error broadcasting to admins:', err);
    }
  });

  // Mark notification as read
  socket.on('mark-read', (data) => {
    const { notificationId } = data;
    socket.emit('marked-read', { notificationId, status: 'ok' });
  });

  // Get user's online status
  socket.on('get-user-status', (userId) => {
    const isOnline = !!connectedUsers[userId];
    socket.emit('user-status', { userId, online: isOnline });
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    const userId = socketUsers.get(socket.id);
    
    if (userId) {
      logger.info(`✓ User ${userId} disconnected (socket: ${socket.id}, reason: ${reason})`);
      
      // Remove from maps
      delete connectedUsers[userId];
      userSockets.delete(userId);
      socketUsers.delete(socket.id);
      
      // Broadcast to admins that user is offline
      broadcastToAdmins({
        type: 'user_status',
        userId: userId,
        status: 'offline',
        reason: reason,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.info(`✓ Unregistered client disconnected: ${socket.id} (reason: ${reason})`);
    }
  });

  // Handle errors
  socket.on('error', (error) => {
    logger.error(`❌ Socket error for ${socket.id}:`, error);
  });
});

// Helper function to broadcast to all admins
async function broadcastToAdmins(data) {
  try {
    const admins = await User.find({ role: 'admin' });
    
    admins.forEach(admin => {
      const adminSocketId = connectedUsers[admin._id.toString()];
      if (adminSocketId) {
        io.to(adminSocketId).emit('notification', data);
      }
    });
  } catch (err) {
    logger.error('Error broadcasting to admins:', err);
  }
}

// QR and Attendance Helper Functions
async function recordAttendance(userId, action, ip) {
  // Validate action sequence
  const lastAttendance = await Attendance.findOne({ user_id: userId })
    .sort({ timestamp: -1 });
  
  // Prevent duplicate actions
  if (lastAttendance && lastAttendance.action === action) {
    throw new Error(`Already ${action.replace('_', ' ')}ed`);
  }
  
  // Create attendance record
  const attendance = new Attendance({
    user_id: userId,
    action: action,
    timestamp: new Date(),
    ip_address: ip
  });
  await attendance.save();
  
  // Create time log
  const timeLog = new TimeLog({
    user_id: userId,
    action: action,
    time: new Date()
  });
  await timeLog.save();
  
  // Calculate hours if clock out
  if (action === 'clock_out') {
    await calculateWorkHours(userId);
  }
  
  return { recorded: true, action: action, timestamp: attendance.timestamp };
}

async function calculateWorkHours(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const records = await Attendance.find({
    user_id: userId,
    timestamp: { $gte: today }
  }).sort({ timestamp: 1 });
  
  let totalMinutes = 0;
  let clockIn = null;
  let breakMinutes = 0;
  let breakStart = null;
  
  for (const record of records) {
    if (record.action === 'clock_in') clockIn = record.timestamp;
    else if (record.action === 'clock_out' && clockIn) {
      totalMinutes += (record.timestamp - clockIn) / (1000 * 60);
      clockIn = null;
    } else if (record.action === 'break_start') breakStart = record.timestamp;
    else if (record.action === 'break_end' && breakStart) {
      breakMinutes += (record.timestamp - breakStart) / (1000 * 60);
      breakStart = null;
    }
  }
  
  const netMinutes = totalMinutes - breakMinutes;
  const hoursWorked = netMinutes / 60;
  
  // Update performance metrics
  await Performance.findOneAndUpdate(
    { user_id: userId },
    { $inc: { total_hours_worked: hoursWorked } },
    { upsert: true }
  );
  
  return { hoursWorked, totalMinutes: netMinutes, breakMinutes };
}

async function validateScanSequence(userId, action) {
  const lastAttendance = await Attendance.findOne({ user_id: userId })
    .sort({ timestamp: -1 });
  
  const validTransitions = {
    'clock_in': ['none', 'clock_out'],
    'clock_out': ['clock_in', 'break_end'],
    'break_start': ['clock_in', 'break_end'],
    'break_end': ['break_start']
  };
  
  const lastAction = lastAttendance?.action || 'none';
  const valid = validTransitions[action]?.includes(lastAction);
  
  if (!valid) {
    throw new Error(`Cannot ${action} after ${lastAction}`);
  }
  
  return true;
}

async function validateBreakDuration(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const breaksToday = await Attendance.find({
    user_id: userId,
    action: { $in: ['break_start', 'break_end'] },
    timestamp: { $gte: today }
  });
  
  let totalBreakMinutes = 0;
  let breakStart = null;
  
  for (const record of breaksToday) {
    if (record.action === 'break_start') breakStart = record.timestamp;
    else if (record.action === 'break_end' && breakStart) {
      totalBreakMinutes += (record.timestamp - breakStart) / (1000 * 60);
      breakStart = null;
    }
  }
  
  const maxBreakMinutes = 60; // 1 hour max
  
  if (totalBreakMinutes >= maxBreakMinutes) {
    throw new Error(`You have already taken ${totalBreakMinutes} minutes of break today`);
  }
  
  return true;
}

// Audit and notification functions
async function logQRAction(userId, action, resource, details, req) {
  await AuditLog.create({
    user_id: userId,
    action: action,
    resource: resource,
    details: details,
    ip_address: req.ip,
    user_agent: req.headers['user-agent']
  });
}

async function sendQRRevokedEmail(email, name, reason) {
  // Implementation for sending email
  console.log(`Sending QR revoked email to ${email} for ${name}: ${reason}`);
}

async function sendQRCodeEmail(email, name, qrData) {
  // Implementation for sending QR code email
  console.log(`Sending QR code email to ${email} for ${name}`);
}

// ===============================================
// Database Initialization
// ===============================================

async function initializeDatabase() {
  // Wait for connection to be ready
  const maxAttempts = 10;
  let attempts = 0;
  
  while (!isConnected() && attempts < maxAttempts) {
    logger.info(`⏳ Waiting for database connection... (${attempts + 1}/${maxAttempts})`);
    await new Promise(resolve => setTimeout(resolve, 1000));
    attempts++;
  }
  
  if (!isConnected()) {
    logger.warn('⚠️ MongoDB not connected after waiting. Please check your MONGODB_URI environment variable.');
    logger.warn('Current connection status:', connectionStatus());
    return;
  }

  try {
    logger.info('📦 Checking database for initial data...');
    
    // Check if any users exist
    const userCount = await User.countDocuments();
    
    if (userCount === 0) {
      logger.info('👤 No users found. Creating default admin user...');
      
      // Create admin user
      const adminPassword = await bcrypt.hash('admin123', 10);
      const admin = new User({
        name: 'Admin User',
        email: 'admin@wfms.com',
        password: adminPassword,
        role: 'admin'
      });
      await admin.save();
      
      logger.info('✅ Default admin created - Email: admin@wfms.com / Password: admin123');
      
      // Create sample worker
      const workerPassword = await bcrypt.hash('worker123', 10);
      const worker = new User({
        name: 'John Worker',
        email: 'john@wfms.com',
        password: workerPassword,
        role: 'worker'
      });
      await worker.save();
      
      logger.info('✅ Sample worker created - Email: john@wfms.com / Password: worker123');
      
      // Create sample task
      const sampleTask = new Task({
        title: 'Welcome Task',
        description: 'This is your first task. Complete it and submit a report.',
        assigned_to: worker._id,
        status: 'pending',
        created_at: new Date()
      });
      await sampleTask.save();
      
      logger.info('✅ Sample task created and assigned to John Worker');
      
    } else {
      logger.info(`✅ Database already has ${userCount} users`);
      
      // List all users for debugging
      const users = await User.find({}, 'name email role');
      logger.info('📊 Current users:');
      users.forEach(u => logger.info(`   - ${u.name} (${u.email}) - ${u.role}`));
    }
    
  } catch (err) {
    logger.error('✗ Database initialization error:', err.message);
  }
}

async function getDatabaseStats() {
  try {
    const stats = {
      users: await User.countDocuments(),
      tasks: await Task.countDocuments(),
      teams: await Team.countDocuments(),
      activeUsers: await User.countDocuments({ is_active: true }),
      pendingTasks: await Task.countDocuments({ approval_status: 'pending' }),
      completedTasks: await Task.countDocuments({ approval_status: 'approved' }),
      qrCodes: await QRCode.countDocuments(),
      qrScans: await QRScan.countDocuments()
    };
    return stats;
  } catch (err) {
    console.error('Error getting database stats:', err);
    return { error: err.message };
  }
}

// ===============================================
// Authentication Middleware
// ===============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ ok: false, error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ ok: false, error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const requireAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ ok: false, error: 'Admin access required' });
  }
};

// Generic role-based middleware
const requireRole = (role) => {
  return (req, res, next) => {
    if (req.user && req.user.role === role) {
      next();
    } else {
      res.status(403).json({ ok: false, error: `${role} access required` });
    }
  };
};

// Input validation middleware for improved data quality
const validateTask = (req, res, next) => {
  const { title, assigned_to, description } = req.body;

  if (!title || title.length < 3 || title.length > 200) {
    return res.status(400).json({ ok: false, error: 'Title must be between 3 and 200 characters' });
  }

  if (assigned_to && !mongoose.Types.ObjectId.isValid(assigned_to)) {
    return res.status(400).json({ ok: false, error: 'Invalid assigned_to ID' });
  }

  if (description && description.length > 5000) {
    return res.status(400).json({ ok: false, error: 'Description too long (max 5000 characters)' });
  }

  next();
};

// ===============================================
// API Routes
// ===============================================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    const dbStatus = isConnected() ? 'connected' : 'disconnected';
    const dbStats = await getDatabaseStats();

    res.json({
      status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        stats: dbStats
      },
      memory: process.memoryUsage(),
      version: process.version,
      environment: process.env.NODE_ENV,
      connectedUsers: Object.keys(connectedUsers).length
    });
  } catch (err) {
    logger.error('Health check error:', err);
    res.status(500).json({ ok: false, error: 'Health check failed', details: err.message });
  }
});

// Check if email exists
app.post('/api/check-email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ ok: false, error: 'Email required' });
    
    const user = await User.findOne({ email });
    res.json({ ok: true, exists: !!user });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
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
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        ok: false, 
        error: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character' 
      });
    }
    
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
    
    logger.info(`✅ New user registered: ${email} (${role || 'worker'})`);
    
    res.json({ ok: true, userId: user._id });
  } catch (err) {
    logger.error('Signup error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  logger.info('📍 /api/login route handler called');
  
  try {
    const { email, password } = req.body;
    
    logger.info(`🔐 Login attempt for: ${email}`);
    
    if (!email || !password) {
      logger.warn('⚠️ Missing email or password');
      return res.status(400).json({ ok: false, error: 'Email and password required' });
    }
    
    // Check database connection
    if (!isConnected()) {
      logger.error('❌ Database not connected!');
      return res.status(500).json({ 
        ok: false, 
        error: 'Database connection error. Please try again in a moment.' 
      });
    }
    
    logger.info('🔍 Searching for user in database...');
    const user = await User.findOne({ email });
    
    if (!user) {
      logger.info(`❌ User not found: ${email}`);
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    logger.info(`👤 User found: ${user.name}`);
    logger.info('🔐 Comparing passwords...');
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      logger.info(`❌ Invalid password for: ${email}`);
      return res.status(401).json({ ok: false, error: 'Invalid credentials' });
    }
    
    logger.info('✅ Password matched');
    
    const userObj = user.toObject();
    delete userObj.password;
    
    logger.info('🎫 Generating tokens...');
    const token = jwt.sign(
      { 
        id: user._id, 
        role: user.role,
        // Don't include name in token
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    logger.info(`✅ Login successful for: ${email} (${user.role})`);
    
    res.json({ 
      ok: true, 
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      token,
      refreshToken,
      expiresIn: 604800 // 7 days in seconds
    });
  } catch (err) {
    logger.error('❌ Login error:', err.message);
    logger.error('Stack trace:', err.stack);
    res.status(500).json({ ok: false, error: err.message || 'Internal server error' });
  }
});

// Refresh token endpoint
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
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ 
      ok: true,
      token: newToken,
      expiresIn: 604800
    });
  } catch (err) {
    logger.error('Token refresh error:', err);
    res.status(401).json({ ok: false, error: 'Invalid refresh token' });
  }
});

// Password reset flow
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.json({ ok: true, message: 'If email exists, reset link will be sent' });
    }

    const resetToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '1h' });
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:8000'}/reset-password?token=${resetToken}`;

    if (emailService) {
      await emailService.sendEmail(
        user.email,
        'Password Reset Request',
        `<h2>Reset Your Password</h2><p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 1 hour.</p>`
      );
    }

    res.json({ ok: true, message: 'Reset link sent to email' });
  } catch (err) {
    logger.error('Forgot password error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({
      _id: decoded.id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ ok: false, error: 'Invalid or expired token' });
    }

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ ok: false, error: 'New password must be at least 8 characters' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ ok: true, message: 'Password reset successful' });
  } catch (err) {
    logger.error('Reset password error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// GOOGLE OAUTH ROUTES
// ===============================================

// Start Google OAuth flow
app.get('/api/auth/google',
  passport.authenticate('google', { 
    scope: ['profile', 'email'],
    prompt: 'select_account'
  })
);

// Google OAuth callback
app.get('/api/auth/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/?error=google-auth-failed',
    session: false
  }),
  (req, res) => {
    // Generate JWT token for the user
    const user = req.user;
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
    
    // Redirect to frontend with token
    const frontendUrl = process.env.FRONTEND_URL || 
      (process.env.NODE_ENV === 'production' 
        ? 'https://your-domain.com' 
        : 'http://localhost:8000');
      
    res.redirect(`${frontendUrl}?token=${token}&refreshToken=${refreshToken}`);
  }
);

// Get current user from token
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ ok: true, user: req.user });
});

// Get all users
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const cachedUsers = userCache.get('all_users');
    if (cachedUsers) {
      return res.json({ ok: true, users: cachedUsers, cached: true });
    }

    const users = await User.find({}, 'name role email').lean();
    const formattedUsers = users.map(user => ({
      id: user._id,
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    }));

    userCache.set('all_users', formattedUsers);
    res.json({ ok: true, users: formattedUsers });
  } catch (err) {
    logger.error('Get all users error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get user by ID
app.get('/api/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID format' });
    }
    
    const user = await User.findById(userId, 'name email role');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    res.json({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    if (name) user.name = name;

    if (email && email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({ ok: false, error: 'Email already in use' });
      }
      user.email = email;
    }

    if (currentPassword && newPassword) {
      const isValid = await bcrypt.compare(currentPassword, user.password);
      if (!isValid) {
        return res.status(401).json({ ok: false, error: 'Current password is incorrect' });
      }
      user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();

    res.json({
      ok: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    logger.error('Profile update error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const cacheKey = `admin_users_${page}_${limit}`;

    // Check cache first
    const cachedResult = userCache.get(cacheKey);
    if (cachedResult) {
      return res.json(cachedResult);
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find({})
        .select('-password')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments()
    ]);

    const result = {
      ok: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };

    // Cache the result for 5 minutes
    userCache.set(cacheKey, result);

    res.json(result);
  } catch (err) {
    logger.error('Admin users error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Update user role
app.put('/api/admin/users/:userId/role', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'worker', 'manager', 'team_lead'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(userId, { role, updated_at: new Date() }, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, user });
  } catch (err) {
    logger.error('Admin update role error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Deactivate user
app.put('/api/admin/users/:userId/deactivate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findByIdAndUpdate(userId, { is_active: false, updated_at: new Date() }, { new: true }).select('-password');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    if (connectedUsers[userId]) {
      io.to(connectedUsers[userId]).emit('force-logout');
      delete connectedUsers[userId];
    }

    res.json({ ok: true, user });
  } catch (err) {
    logger.error('Admin deactivate user error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===============================================
// ADMIN REPORT GENERATION ROUTES
// ===============================================

// Generate PDF Report
app.get('/api/admin/report/pdf', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};

    if (startDate && endDate) {
      dateFilter.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Aggregate data for report
    const [users, tasks, attendance, qrScans] = await Promise.all([
      User.find({}).select('-password').sort({ created_at: -1 }),
      Task.find(dateFilter).populate('assigned_to', 'name email').sort({ created_at: -1 }),
      Attendance.find(dateFilter).populate('user_id', 'name email').sort({ created_at: -1 }),
      QRScan.find(dateFilter).populate('user_id', 'name email').sort({ scanned_at: -1 })
    ]);

    // Create PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: 'WFMS Administrative Report',
        Author: 'WFMS System',
        Subject: 'Comprehensive Workforce Management Report'
      }
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="wfms-report-${new Date().toISOString().split('T')[0]}.pdf"`);

    // Pipe PDF to response
    doc.pipe(res);

    // Header
    doc.fontSize(24).font('Helvetica-Bold').text('Workforce Management System', { align: 'center' });
    doc.moveDown();
    doc.fontSize(18).text('Administrative Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Generated on: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, { align: 'center' });
    doc.moveDown(2);

    // Executive Summary
    doc.fontSize(16).font('Helvetica-Bold').text('Executive Summary');
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Total Users: ${users.length}`);
    doc.text(`Active Tasks: ${tasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length}`);
    doc.text(`Completed Tasks: ${tasks.filter(t => t.status === 'completed').length}`);
    doc.text(`Total Attendance Records: ${attendance.length}`);
    doc.text(`QR Scans: ${qrScans.length}`);
    doc.moveDown(2);

    // User Statistics
    doc.fontSize(16).font('Helvetica-Bold').text('User Statistics');
    doc.moveDown();
    const roleStats = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    Object.entries(roleStats).forEach(([role, count]) => {
      doc.fontSize(12).text(`${role.charAt(0).toUpperCase() + role.slice(1)}: ${count}`);
    });
    doc.moveDown(2);

    // Recent Tasks
    if (tasks.length > 0) {
      doc.fontSize(16).font('Helvetica-Bold').text('Recent Tasks');
      doc.moveDown();
      tasks.slice(0, 10).forEach(task => {
        doc.fontSize(12).text(`• ${task.title} - ${task.status} (${task.assigned_to?.name || 'Unassigned'})`);
      });
      doc.moveDown(2);
    }

    // Attendance Summary
    if (attendance.length > 0) {
      doc.fontSize(16).font('Helvetica-Bold').text('Attendance Summary');
      doc.moveDown();
      const attendanceByUser = attendance.reduce((acc, record) => {
        const userName = record.user_id?.name || 'Unknown';
        acc[userName] = (acc[userName] || 0) + 1;
        return acc;
      }, {});

      Object.entries(attendanceByUser).forEach(([user, count]) => {
        doc.fontSize(12).text(`• ${user}: ${count} records`);
      });
      doc.moveDown(2);
    }

    // QR Scan Activity
    if (qrScans.length > 0) {
      doc.fontSize(16).font('Helvetica-Bold').text('QR Scan Activity');
      doc.moveDown();
      qrScans.slice(0, 10).forEach(scan => {
        doc.fontSize(12).text(`• ${scan.user_id?.name || 'Unknown'} - ${scan.action} (${new Date(scan.scanned_at).toLocaleDateString()})`);
      });
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(10).font('Helvetica').text('This report was generated by the WFMS Administrative System', { align: 'center' });

    // Finalize PDF
    doc.end();

  } catch (err) {
    logger.error('PDF Report generation error:', err);
    res.status(500).json({ ok: false, error: 'Failed to generate PDF report' });
  }
});

// Generate Excel Report
app.get('/api/admin/report/excel', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};

    if (startDate && endDate) {
      dateFilter.created_at = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    // Aggregate data for report
    const [users, tasks, attendance, qrScans] = await Promise.all([
      User.find({}).select('-password').sort({ created_at: -1 }),
      Task.find(dateFilter).populate('assigned_to', 'name email').sort({ created_at: -1 }),
      Attendance.find(dateFilter).populate('user_id', 'name email').sort({ created_at: -1 }),
      QRScan.find(dateFilter).populate('user_id', 'name email').sort({ scanned_at: -1 })
    ]);

    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'WFMS System';
    workbook.lastModifiedBy = 'WFMS Admin';
    workbook.created = new Date();
    workbook.modified = new Date();

    // Users Sheet
    const usersSheet = workbook.addWorksheet('Users');
    usersSheet.columns = [
      { header: 'Name', key: 'name', width: 20 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Role', key: 'role', width: 15 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Created', key: 'created', width: 20 }
    ];

    // Style header row
    usersSheet.getRow(1).font = { bold: true };
    usersSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    users.forEach(user => {
      usersSheet.addRow({
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.is_active ? 'Active' : 'Inactive',
        created: user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'
      });
    });

    // Tasks Sheet
    const tasksSheet = workbook.addWorksheet('Tasks');
    tasksSheet.columns = [
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Assigned To', key: 'assigned_to', width: 20 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Priority', key: 'priority', width: 10 },
      { header: 'Created', key: 'created', width: 20 }
    ];

    tasksSheet.getRow(1).font = { bold: true };
    tasksSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    tasks.forEach(task => {
      tasksSheet.addRow({
        title: task.title,
        description: task.description || '',
        assigned_to: task.assigned_to?.name || 'Unassigned',
        status: task.status,
        priority: task.priority || 'Medium',
        created: task.created_at ? new Date(task.created_at).toLocaleDateString() : 'N/A'
      });
    });

    // Attendance Sheet
    const attendanceSheet = workbook.addWorksheet('Attendance');
    attendanceSheet.columns = [
      { header: 'Employee', key: 'employee', width: 20 },
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Check In', key: 'check_in', width: 20 },
      { header: 'Check Out', key: 'check_out', width: 20 },
      { header: 'Status', key: 'status', width: 10 }
    ];

    attendanceSheet.getRow(1).font = { bold: true };
    attendanceSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    attendance.forEach(record => {
      attendanceSheet.addRow({
        employee: record.user_id?.name || 'Unknown',
        date: record.created_at ? new Date(record.created_at).toLocaleDateString() : 'N/A',
        check_in: record.check_in_time ? new Date(record.check_in_time).toLocaleTimeString() : 'N/A',
        check_out: record.check_out_time ? new Date(record.check_out_time).toLocaleTimeString() : 'N/A',
        status: record.status || 'Present'
      });
    });

    // QR Scans Sheet
    const qrSheet = workbook.addWorksheet('QR Scans');
    qrSheet.columns = [
      { header: 'Employee', key: 'employee', width: 20 },
      { header: 'Action', key: 'action', width: 15 },
      { header: 'Scanned At', key: 'scanned_at', width: 20 },
      { header: 'IP Address', key: 'ip', width: 15 }
    ];

    qrSheet.getRow(1).font = { bold: true };
    qrSheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    qrScans.forEach(scan => {
      qrSheet.addRow({
        employee: scan.user_id?.name || 'Unknown',
        action: scan.action,
        scanned_at: new Date(scan.scanned_at).toLocaleString(),
        ip: scan.scanner_ip || 'N/A'
      });
    });

    // Summary Sheet
    const summarySheet = workbook.addWorksheet('Summary');
    summarySheet.columns = [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 15 }
    ];

    summarySheet.getRow(1).font = { bold: true };
    summarySheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    const summaryData = [
      { metric: 'Total Users', value: users.length },
      { metric: 'Active Users', value: users.filter(u => u.is_active).length },
      { metric: 'Total Tasks', value: tasks.length },
      { metric: 'Completed Tasks', value: tasks.filter(t => t.status === 'completed').length },
      { metric: 'Pending Tasks', value: tasks.filter(t => t.status === 'pending').length },
      { metric: 'In Progress Tasks', value: tasks.filter(t => t.status === 'in_progress').length },
      { metric: 'Total Attendance Records', value: attendance.length },
      { metric: 'Total QR Scans', value: qrScans.length }
    ];

    summaryData.forEach(item => {
      summarySheet.addRow(item);
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="wfms-report-${new Date().toISOString().split('T')[0]}.xlsx"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();

  } catch (err) {
    logger.error('Excel Report generation error:', err);
    res.status(500).json({ ok: false, error: 'Failed to generate Excel report' });
  }
});

// Generate Custom Date Range Report
app.post('/api/admin/report/custom', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate, reportType, includeInactive = false } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ ok: false, error: 'Start date and end date are required' });
    }

    const dateFilter = {
      created_at: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    let data = {};

    switch (reportType) {
      case 'users':
        data.users = await User.find(includeInactive ? {} : { is_active: true })
          .select('-password')
          .sort({ created_at: -1 });
        break;

      case 'tasks':
        data.tasks = await Task.find(dateFilter)
          .populate('assigned_to', 'name email')
          .sort({ created_at: -1 });
        break;

      case 'attendance':
        data.attendance = await Attendance.find(dateFilter)
          .populate('user_id', 'name email')
          .sort({ created_at: -1 });
        break;

      case 'qr_scans':
        data.qrScans = await QRScan.find(dateFilter)
          .populate('user_id', 'name email')
          .sort({ scanned_at: -1 });
        break;

      case 'full':
      default:
        const [users, tasks, attendance, qrScans] = await Promise.all([
          User.find(includeInactive ? {} : { is_active: true }).select('-password').sort({ created_at: -1 }),
          Task.find(dateFilter).populate('assigned_to', 'name email').sort({ created_at: -1 }),
          Attendance.find(dateFilter).populate('user_id', 'name email').sort({ created_at: -1 }),
          QRScan.find(dateFilter).populate('user_id', 'name email').sort({ scanned_at: -1 })
        ]);

        data = {
          users,
          tasks,
          attendance,
          qrScans,
          summary: {
            totalUsers: users.length,
            totalTasks: tasks.length,
            completedTasks: tasks.filter(t => t.status === 'completed').length,
            totalAttendance: attendance.length,
            totalScans: qrScans.length,
            dateRange: { startDate, endDate }
          }
        };
        break;
    }

    res.json({
      ok: true,
      reportType,
      dateRange: { startDate, endDate },
      generatedAt: new Date(),
      data
    });

  } catch (err) {
    logger.error('Custom Report generation error:', err);
    res.status(500).json({ ok: false, error: 'Failed to generate custom report' });
  }
});

// ===============================================
// QR AUTHENTICATION BACKEND ROUTES
// ===============================================

// Verify QR token
app.post('/api/verify-qr-token', async (req, res) => {
    try {
        const { userId, qrToken } = req.body;
        
        // Validate input
        if (!userId || !qrToken) {
            return res.status(400).json({ ok: false, error: 'userId and qrToken are required' });
        }
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ ok: false, error: 'Invalid userId format' });
        }
        
        const qrCode = await QRCode.findOne({ 
            user_id: userId, 
            qr_token: qrToken 
        });
        
        if (!qrCode) {
            return res.status(404).json({ ok: false, error: 'Invalid QR code' });
        }
        
        // Log this verification
        const scanIp = req.ip || req.connection.remoteAddress || '0.0.0.0';
        
        const scan = new QRScan({
            user_id: userId,
            qr_token: qrToken,
            scanned_at: new Date(),
            scanner_ip: scanIp,
            action: 'verification'
        });
        await scan.save();
        
        // Update scan count
        qrCode.scan_count += 1;
        if (!qrCode.is_activated) {
            qrCode.is_activated = true;
            qrCode.first_scan_at = new Date();
        }
        await qrCode.save();
        
        res.json({ 
            ok: true, 
            message: 'QR code verified',
            scanCount: qrCode.scan_count
        });
        
    } catch (err) {
        logger.error('QR verification error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// QR-based login
app.post('/api/qr-login', async (req, res) => {
    try {
        const { userId, qrToken } = req.body;
        
        // Validate input
        if (!userId || !qrToken) {
            return res.status(400).json({ ok: false, error: 'userId and qrToken are required' });
        }
        
        if (!mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({ ok: false, error: 'Invalid userId format' });
        }
        
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ ok: false, error: 'User not found' });
        }
        
        const qrCode = await QRCode.findOne({ 
            user_id: userId, 
            qr_token: qrToken 
        });
        
        if (!qrCode) {
            return res.status(401).json({ ok: false, error: 'Invalid QR code' });
        }
        
        // Log this login
        const scanIp = req.ip || req.connection.remoteAddress || '0.0.0.0';
        
        const scan = new QRScan({
            user_id: userId,
            qr_token: qrToken,
            scanned_at: new Date(),
            scanner_ip: scanIp,
            action: 'qr_login'
        });
        await scan.save();
        
        // Update scan count
        qrCode.scan_count += 1;
        await qrCode.save();
        
        // Generate JWT token
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
            token,
            refreshToken,
            expiresIn: 604800,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
        
    } catch (err) {
        logger.error('QR login error:', err);
        res.status(500).json({ ok: false, error: err.message });
    }
});

// QR generation rate limiter
const qrGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 QR generations per hour
  message: { ok: false, error: 'Too many QR generation attempts. Please try again later.' }
});

// Unified QR generation
app.post('/api/qr/generate', async (req, res) => {
  try {
    const { userId, email, name } = req.body;

    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId required' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid userId format' });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

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
      email: email || user.email,
      name: name || user.name,
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
      qr_data: qrData,
      generated_at: new Date(),
      expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days expiry
    });

    await qrCode.save();

    res.json({
      ok: true,
      qrToken,
      qrData,
      isActivated: false,
      expiresAt: qrCode.expires_at
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ ok: false, error: 'QR generation failed' });
  }
});
// QR Scan endpoint - Unified QR scanning
app.post('/api/qr/scan', async (req, res) => {
  try {
    const { qrToken, action, timestamp } = req.body;
    
    console.log('📱 QR Scan request:', { qrToken, action, timestamp });
    
    if (!qrToken) {
      return res.status(400).json({ ok: false, error: 'QR token required' });
    }
    
    // Find the QR code in database
    const qrCode = await QRCode.findOne({ qr_token: qrToken }).populate('user_id');
    
    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'Invalid QR code' });
    }
    
    // Check if QR is expired
    if (qrCode.expires_at && new Date() > qrCode.expires_at) {
      return res.status(401).json({ ok: false, error: 'QR code expired' });
    }
    
    // Get the user
    const user = qrCode.user_id;
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    // Record the scan
    const scanIp = req.ip || req.connection.remoteAddress || '0.0.0.0';
    
    const scan = new QRScan({
      user_id: user._id,
      qr_token: qrToken,
      scanned_at: new Date(),
      scanner_ip: scanIp,
      action: action || 'verification'
    });
    await scan.save();
    
    // Update QR code scan count
    qrCode.scan_count += 1;
    if (!qrCode.is_activated) {
      qrCode.is_activated = true;
      qrCode.first_scan_at = new Date();
    }
    qrCode.last_scan_at = new Date();
    await qrCode.save();
    
    // Handle different actions
    if (action === 'login') {
      // Generate JWT token for login
      const token = jwt.sign(
        { 
          id: user._id, 
          role: user.role, 
          name: user.name, 
          email: user.email 
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      
      const refreshToken = jwt.sign(
        { id: user._id },
        JWT_SECRET,
        { expiresIn: '30d' }
      );
      
      return res.json({
        ok: true,
        message: 'QR login successful',
        token: token,
        refreshToken: refreshToken,
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        expiresIn: 604800,
        scanCount: qrCode.scan_count
      });
      
    } else if (['clock_in', 'clock_out', 'break_start', 'break_end'].includes(action)) {
      // Handle attendance actions
      const attendance = new Attendance({
        user_id: user._id,
        action: action,
        timestamp: new Date(),
        ip_address: scanIp,
        notes: `QR ${action}`
      });
      await attendance.save();
      
      // Also create time log
      const timeLog = new TimeLog({
        user_id: user._id,
        action: action,
        time: new Date()
      });
      await timeLog.save();
      
      return res.json({
        ok: true,
        message: `${action.replace('_', ' ')} recorded successfully`,
        action: action,
        timestamp: new Date().toISOString(),
        scanCount: qrCode.scan_count
      });
      
    } else {
      // Just verification
      return res.json({
        ok: true,
        message: 'QR code verified',
        userId: user._id,
        userName: user.name,
        userEmail: user.email,
        userRole: user.role,
        scanCount: qrCode.scan_count,
        scanTime: scan.scanned_at
      });
    }
    
  } catch (err) {
    console.error('QR scan error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
// Unified QR scan/verify
app.post('/api/qr/verify', async (req, res) => {
  try {
    const { qrToken, userId } = req.body;

    if (!qrToken) {
      return res.status(400).json({ ok: false, error: 'qrToken required' });
    }

    const qrCode = await QRCode.findOne({ qr_token: qrToken });

    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'Invalid QR code' });
    }

    // Check expiration
    if (qrCode.expires_at && new Date() > qrCode.expires_at) {
      return res.status(401).json({ ok: false, error: 'QR code expired' });
    }

    // If userId provided, verify it matches
    if (userId && qrCode.user_id.toString() !== userId) {
      return res.status(403).json({ ok: false, error: 'QR code does not belong to this user' });
    }

    const scanIp = req.ip || req.connection.remoteAddress || '0.0.0.0';

    const scan = new QRScan({
      user_id: qrCode.user_id,
      qr_token: qrToken,
      scanned_at: new Date(),
      scanner_ip: scanIp,
      action: 'verification'
    });
    await scan.save();

    qrCode.scan_count += 1;
    if (!qrCode.is_activated) {
      qrCode.is_activated = true;
      qrCode.first_scan_at = new Date();
    }
    await qrCode.save();

    res.json({
      ok: true,
      message: 'QR code verified',
      userId: qrCode.user_id,
      scanCount: qrCode.scan_count,
      scanTime: scan.scanned_at
    });

  } catch (err) {
    console.error('QR verification error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QR validation endpoint
app.get('/api/qr/validate/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const qrCode = await QRCode.findOne({ qr_token: token }).populate('user_id', 'name email');
    
    if (!qrCode) {
      return res.json({ ok: false, error: 'Invalid QR code', valid: false });
    }
    
    if (qrCode.status !== 'active') {
      return res.json({ 
        ok: false, 
        error: `QR code is ${qrCode.status}`, 
        valid: false,
        status: qrCode.status
      });
    }
    
    if (new Date() > qrCode.expires_at) {
      return res.json({ 
        ok: false, 
        error: 'QR code expired', 
        valid: false,
        expired: true,
        expires_at: qrCode.expires_at
      });
    }
    
    res.json({
      ok: true,
      valid: true,
      user: {
        name: qrCode.user_id.name,
        email: qrCode.user_id.email
      },
      expires_at: qrCode.expires_at,
      days_remaining: Math.ceil((qrCode.expires_at - new Date()) / (1000 * 60 * 60 * 24))
    });
  } catch (err) {
    console.error('QR validation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
// Get user's own QR code (for display in dashboard)
app.get('/api/qr/my-qr', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    let qrCode = await QRCode.findOne({ user_id: userId });
    
    // If no QR code exists or it's expired, generate a new one
    if (!qrCode || (qrCode.expires_at && new Date() > qrCode.expires_at)) {
      const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days
      const qrToken = uuidv4();
      
      const payload = JSON.stringify({
        userId: userId,
        email: req.user.email,
        name: req.user.name,
        token: qrToken,
        role: req.user.role,
        expiresAt: expiresAt.toISOString()
      });
      
      const qrData = await QR.toDataURL(payload, {
        errorCorrectionLevel: 'H',
        width: 300,
        margin: 2
      });
      
      if (qrCode) {
        // Update existing
        qrCode.qr_token = qrToken;
        qrCode.qr_data = qrData;
        qrCode.expires_at = expiresAt;
        qrCode.updated_at = new Date();
        await qrCode.save();
      } else {
        // Create new
        qrCode = new QRCode({
          user_id: userId,
          qr_token: qrToken,
          qr_data: qrData,
          generated_at: new Date(),
          expires_at: expiresAt
        });
        await qrCode.save();
      }
    }
    
    res.json({
      ok: true,
      qrData: qrCode.qr_data,
      qrToken: qrCode.qr_token,
      expiresAt: qrCode.expires_at,
      scanCount: qrCode.scan_count || 0,
      isActivated: qrCode.is_activated || false,
      generatedAt: qrCode.generated_at
    });
    
  } catch (err) {
    console.error('Error fetching user QR:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
// Admin QR revocation endpoint
app.post('/api/admin/qr/revoke/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    const qrCode = await QRCode.findOne({ user_id: userId });
    
    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'No QR code found for this user' });
    }
    
    qrCode.status = 'revoked';
    qrCode.revoked_at = new Date();
    qrCode.revoked_reason = reason || 'Revoked by admin';
    qrCode.revoked_by = req.user.id;
    await qrCode.save();
    
    // Log audit
    await logQRAction(userId, 'qr_revoked', 'qr_code', { reason, revoked_by: req.user.id }, req);
    
    // Notify user
    const user = await User.findById(userId);
    if (user && connectedUsers[userId]) {
      io.to(connectedUsers[userId]).emit('qr_revoked', {
        reason: reason,
        message: 'Your QR code has been revoked. Please contact admin.'
      });
    }
    
    // Send email notification
    if (user) {
      await sendQRRevokedEmail(user.email, user.name, reason);
    }
    
    res.json({ ok: true, message: 'QR code revoked successfully' });
  } catch (err) {
    console.error('QR revocation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Bulk QR generation
app.post('/api/admin/qr/bulk-generate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userIds, sendEmail } = req.body;
    
    if (!userIds || !Array.isArray(userIds)) {
      return res.status(400).json({ ok: false, error: 'userIds array required' });
    }
    
    const results = [];
    
    for (const userId of userIds) {
      try {
        let qrCode = await QRCode.findOne({ user_id: userId });
        
        if (qrCode && qrCode.status === 'active' && qrCode.expires_at > new Date()) {
          results.push({
            userId,
            status: 'existing',
            qrData: qrCode.qr_data,
            expires_at: qrCode.expires_at
          });
          continue;
        }
        
        // Generate new QR
        const user = await User.findById(userId);
        if (!user) {
          results.push({ userId, status: 'failed', error: 'User not found' });
          continue;
        }
        
        const qrToken = uuidv4();
        const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        
        const payload = {
          userId,
          email: user.email,
          name: user.name,
          token: qrToken,
          expiresAt: expiresAt.toISOString()
        };
        
        const qrData = await QR.toDataURL(JSON.stringify(payload), {
          errorCorrectionLevel: 'H',
          width: 300,
          margin: 2
        });
        
        qrCode = new QRCode({
          user_id: userId,
          qr_token: qrToken,
          qr_data: qrData,
          expires_at: expiresAt,
          generated_by: req.user.id
        });
        
        await qrCode.save();
        
        // Send email if requested
        if (sendEmail) {
          await sendQRCodeEmail(user.email, user.name, qrData);
        }
        
        results.push({
          userId,
          status: 'generated',
          qrData: qrData,
          expires_at: expiresAt
        });
        
      } catch (err) {
        results.push({ userId, status: 'failed', error: err.message });
      }
    }
    
    // Create bulk operation log
    await AuditLog.create({
      user_id: req.user.id,
      action: 'qr_bulk_generate',
      resource: 'qr_code',
      details: { userIds: userIds, count: userIds.length, results: results },
      ip_address: req.ip
    });
    
    res.json({
      ok: true,
      total: userIds.length,
      successful: results.filter(r => r.status !== 'failed').length,
      failed: results.filter(r => r.status === 'failed').length,
      results: results
    });
    
  } catch (err) {
    console.error('Bulk QR generation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QR analytics endpoint
app.get('/api/admin/qr/analytics', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { period = 'week', groupBy = 'day' } = req.query;
    
    const now = new Date();
    let startDate;
    
    switch (period) {
      case 'day': startDate = new Date(now.setHours(0, 0, 0, 0)); break;
      case 'week': startDate = new Date(now.setDate(now.getDate() - 7)); break;
      case 'month': startDate = new Date(now.setMonth(now.getMonth() - 1)); break;
      case 'year': startDate = new Date(now.setFullYear(now.getFullYear() - 1)); break;
      default: startDate = new Date(now.setDate(now.getDate() - 30));
    }
    
    // Total stats
    const [
      totalQRCodes,
      activeQRCodes,
      expiredQRCodes,
      revokedQRCodes,
      totalScans,
      uniqueUsers
    ] = await Promise.all([
      QRCode.countDocuments(),
      QRCode.countDocuments({ status: 'active', expires_at: { $gt: new Date() } }),
      QRCode.countDocuments({ status: 'expired' }),
      QRCode.countDocuments({ status: 'revoked' }),
      QRScan.countDocuments({ scanned_at: { $gte: startDate } }),
      QRScan.distinct('user_id', { scanned_at: { $gte: startDate } })
    ]);
    
    // Scans over time
    const scansOverTime = await QRScan.aggregate([
      { $match: { scanned_at: { $gte: startDate } } },
      {
        $group: {
          _id: {
            year: { $year: '$scanned_at' },
            month: { $month: '$scanned_at' },
            day: { $dayOfMonth: '$scanned_at' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } }
    ]);
    
    // Scans by action
    const scansByAction = await QRScan.aggregate([
      { $match: { scanned_at: { $gte: startDate } } },
      { $group: { _id: '$action', count: { $sum: 1 } } }
    ]);
    
    // Top users by scans
    const topUsers = await QRScan.aggregate([
      { $match: { scanned_at: { $gte: startDate } } },
      { $group: { _id: '$user_id', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      }
    ]);
    
    // Daily average
    const daysDiff = Math.ceil((new Date() - startDate) / (1000 * 60 * 60 * 24));
    const avgDailyScans = totalScans / daysDiff;
    
    res.json({
      ok: true,
      period: period,
      summary: {
        total_qr_codes: totalQRCodes,
        active_qr_codes: activeQRCodes,
        expired_qr_codes: expiredQRCodes,
        revoked_qr_codes: revokedQRCodes,
        total_scans: totalScans,
        unique_users: uniqueUsers.length,
        avg_daily_scans: avgDailyScans.toFixed(2)
      },
      scans_over_time: scansOverTime.map(s => ({
        date: `${s._id.year}-${s._id.month}-${s._id.day}`,
        count: s.count
      })),
      scans_by_action: scansByAction.map(s => ({
        action: s._id,
        count: s.count
      })),
      top_users: topUsers.map(u => ({
        user_id: u._id,
        name: u.user[0]?.name || 'Unknown',
        email: u.user[0]?.email || 'Unknown',
        scan_count: u.count
      }))
    });
    
  } catch (err) {
    console.error('QR analytics error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QR scans history with pagination
app.get('/api/qr/scans/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      action, 
      fromDate, 
      toDate,
      sortBy = 'scanned_at',
      sortOrder = 'desc'
    } = req.query;
    
    // Verify access
    if (req.user.id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ ok: false, error: 'Access denied' });
    }
    
    // Build filter
    let filter = { user_id: userId };
    if (action) filter.action = action;
    if (fromDate) filter.scanned_at = { $gte: new Date(fromDate) };
    if (toDate) filter.scanned_at = { ...filter.scanned_at, $lte: new Date(toDate) };
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    const [scans, total] = await Promise.all([
      QRScan.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      QRScan.countDocuments(filter)
    ]);
    
    const qrCode = await QRCode.findOne({ user_id: userId });
    
    res.json({
      ok: true,
      scans: scans.map(scan => ({
        id: scan._id,
        action: scan.action,
        scanned_at: scan.scanned_at,
        scanner_ip: scan.scanner_ip,
        user_agent: scan.user_agent,
        location: scan.location_name || null
      })),
      qrCode: qrCode ? {
        scan_count: qrCode.scan_count,
        is_activated: qrCode.is_activated,
        first_scan_at: qrCode.first_scan_at,
        last_scan_at: qrCode.last_scan_at,
        expires_at: qrCode.expires_at,
        status: qrCode.status
      } : null,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
    
  } catch (err) {
    console.error('Error fetching QR scans:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// QR stats endpoint
app.get('/api/qr/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const qrCode = await QRCode.findOne({ user_id: userId });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalScans, todayScans, thisWeekScans, thisMonthScans] = await Promise.all([
      QRScan.countDocuments({ user_id: userId }),
      QRScan.countDocuments({ user_id: userId, scanned_at: { $gte: today } }),
      QRScan.countDocuments({ 
        user_id: userId, 
        scanned_at: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } 
      }),
      QRScan.countDocuments({ 
        user_id: userId, 
        scanned_at: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } 
      })
    ]);
    
    const scansByAction = await QRScan.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(userId) } },
      { $group: { _id: '$action', count: { $sum: 1 } } }
    ]);
    
    const daysUntilExpiry = qrCode 
      ? Math.ceil((qrCode.expires_at - new Date()) / (1000 * 60 * 60 * 24))
      : null;
    
    res.json({
      ok: true,
      stats: {
        total_scans: totalScans,
        today_scans: todayScans,
        this_week_scans: thisWeekScans,
        this_month_scans: thisMonthScans,
        scans_by_action: scansByAction.map(s => ({ action: s._id, count: s.count })),
        qr_active: qrCode?.status === 'active',
        days_until_expiry: daysUntilExpiry,
        scan_count: qrCode?.scan_count || 0,
        last_scan: qrCode?.last_scan_at || null
      }
    });
    
  } catch (err) {
    console.error('QR stats error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbStatus = isConnected() ? 'connected' : 'disconnected';
  
  // Check QR system health
  let qrSystemStatus = 'healthy';
  let qrIssues = [];
  
  try {
    // Check QR collection
    const qrCount = await QRCode.countDocuments();
    const activeQRCount = await QRCode.countDocuments({ 
      status: 'active', 
      expires_at: { $gt: new Date() } 
    });
    
    // Check recent scans
    const recentScans = await QRScan.countDocuments({
      scanned_at: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
    });
    
    if (activeQRCount === 0 && qrCount > 0) {
      qrIssues.push('No active QR codes found');
      qrSystemStatus = 'warning';
    }
    
    if (recentScans === 0 && qrCount > 0) {
      qrIssues.push('No QR scans in the last 5 minutes');
    }
    
    // Check QR generation service
    const testQR = await QR.toDataURL(JSON.stringify({ test: true }), { width: 100 });
    if (!testQR) {
      qrIssues.push('QR generation service failing');
      qrSystemStatus = 'unhealthy';
    }
    
  } catch (err) {
    qrIssues.push(`QR system error: ${err.message}`);
    qrSystemStatus = 'unhealthy';
  }
  
  res.json({
    status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: {
      status: dbStatus,
      stats: await getDatabaseStats()
    },
    qr_system: {
      status: qrSystemStatus,
      issues: qrIssues,
      last_check: new Date().toISOString()
    },
    memory: process.memoryUsage(),
    version: process.version,
    environment: process.env.NODE_ENV
  });
});

// ========== TASK ROUTES WITH NOTIFICATIONS ==========

// Get all tasks with pagination and optimized query
app.get('/api/tasks', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const skip = (page - 1) * limit;

    const [tasks, total] = await Promise.all([
      Task.find()
        .select('title description status assigned_to approval_status hours_spent created_at')
        .populate('assigned_to', 'name email')
        .populate('submitted_by', 'name email')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Task.countDocuments()
    ]);

    res.json({
      ok: true,
      data: tasks,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    logger.error('Error fetching tasks:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
// Add task with notification
app.post('/api/tasks', authenticateToken, requireAdmin, validateTask, async (req, res) => {
  try {
    const { title, description, assigned_to, priority, category, tags } = req.body;

    const task = new Task({
      title,
      description,
      assigned_to,
      priority: priority || 'medium',
      category: category || 'General',
      tags: tags || [],
      status: 'pending',
      created_at: new Date()
    });
    
    await task.save();
    
    // Populate assigned user info
    await task.populate('assigned_to', 'name email');

    // Get the assigned user's info
    const assignedUser = await User.findById(assigned_to);
    
    // Send real-time notification to the assigned user
    if (assigned_to && connectedUsers[assigned_to.toString()]) {
      io.to(connectedUsers[assigned_to.toString()]).emit('notification', {
        type: 'task_assigned',
        message: `New task assigned: ${title}`,
        taskId: task._id,
        title: title,
        timestamp: new Date().toISOString()
      });
      logger.info(`📬 Real-time notification sent to user ${assigned_to} for new task`);
    }
    
    // Also notify all admins about the new task
    broadcastToAdmins({
      type: 'task_created',
      message: `New task created and assigned to ${assignedUser?.name || 'a user'}: ${title}`,
      taskId: task._id,
      timestamp: new Date().toISOString()
    });
    
    res.json({ ok: true, taskId: task._id, task: task });
  } catch (err) {
    logger.error('Error creating task:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update task status
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID format' });
    }
    
    const task = await Task.findByIdAndUpdate(id, { status }, { new: true })
      .populate('assigned_to', 'name email');
    
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    
    // Notify assigned user about status change
    if (task && task.assigned_to && connectedUsers[task.assigned_to._id.toString()]) {
      io.to(connectedUsers[task.assigned_to._id.toString()]).emit('notification', {
        type: 'task_updated',
        message: `Task "${task.title}" status updated to: ${status}`,
        taskId: task._id,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ ok: true, task });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Delete task
app.delete('/api/tasks/:taskId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID' });
    }

    const task = await Task.findByIdAndDelete(taskId);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    res.json({ ok: true, message: 'Task deleted successfully' });
  } catch (err) {
    logger.error('Delete task error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Reassign task
app.put('/api/tasks/:taskId/reassign', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { newAssigneeId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(taskId) || !mongoose.Types.ObjectId.isValid(newAssigneeId)) {
      return res.status(400).json({ ok: false, error: 'Invalid ID format' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    const newAssignee = await User.findById(newAssigneeId);
    if (!newAssignee) {
      return res.status(404).json({ ok: false, error: 'New assignee not found' });
    }

    const oldAssigneeId = task.assigned_to.toString();
    task.assigned_to = newAssigneeId;
    task.updated_at = new Date();
    await task.save();

    if (connectedUsers[oldAssigneeId]) {
      io.to(connectedUsers[oldAssigneeId]).emit('notification', {
        type: 'task_removed',
        message: `Task "${task.title}" has been reassigned to someone else.`,
        taskId: task._id
      });
    }

    if (connectedUsers[newAssigneeId]) {
      io.to(connectedUsers[newAssigneeId]).emit('notification', {
        type: 'task_assigned',
        message: `New task assigned: ${task.title}`,
        taskId: task._id
      });
    }

    res.json({ ok: true, task });
  } catch (err) {
    logger.error('Reassign task error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin: Bulk assign tasks
app.post('/api/tasks/bulk-assign', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, assigneeIds } = req.body;
    if (!title || !assigneeIds || !Array.isArray(assigneeIds) || assigneeIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'Title and assigneeIds array required' });
    }

    const tasks = [];
    for (const assigneeId of assigneeIds) {
      if (!mongoose.Types.ObjectId.isValid(assigneeId)) {
        continue;
      }
      const task = new Task({
        title,
        description,
        assigned_to: assigneeId,
        status: 'pending',
        created_at: new Date()
      });
      await task.save();
      tasks.push(task);

      if (connectedUsers[assigneeId]) {
        io.to(connectedUsers[assigneeId]).emit('notification', {
          type: 'task_assigned',
          message: `New task assigned: ${title}`,
          taskId: task._id
        });
      }
    }

    res.json({ ok: true, tasks, count: tasks.length });
  } catch (err) {
    logger.error('Bulk assign task error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add task comments
app.post('/api/tasks/:taskId/comments', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ ok: false, error: 'Comment content required' });
    }

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    task.comments.push({ user: req.user.id, content: content.trim(), created_at: new Date() });
    await task.save();

    if (task.assigned_to.toString() !== req.user.id && connectedUsers[task.assigned_to.toString()]) {
      io.to(connectedUsers[task.assigned_to.toString()]).emit('notification', {
        type: 'task_comment',
        message: `New comment on task "${task.title}" from ${req.user.email || req.user.id}`,
        taskId: task._id
      });
    }

    res.json({ ok: true, comment: task.comments[task.comments.length - 1] });
  } catch (err) {
    logger.error('Add comment error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/tasks/:taskId/comments', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(taskId)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID' });
    }

    const task = await Task.findById(taskId).populate('comments.user', 'name email avatar');
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    res.json({ ok: true, comments: task.comments });
  } catch (err) {
    logger.error('Get comments error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Submit task report
// Submit task report - FIXED VERSION
app.post('/api/tasks/:id/submit-report', async (req, res) => {
  try {
    const { id } = req.params;
    const { daily_report, status, hours_spent, submitted_by } = req.body;
    
    logger.info(`📝 Task report submission for task ${id} by user ${submitted_by}`);
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID format' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(submitted_by)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID format' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    
    // Verify the user is assigned to this task
    if (task.assigned_to.toString() !== submitted_by) {
      return res.status(403).json({ ok: false, error: 'You are not assigned to this task' });
    }
    
    const employee = await User.findById(submitted_by);
    const adminUsers = await User.find({ role: 'admin' });

    // Update task with report
    task.status = status || 'pending';
    task.daily_report = daily_report;
    task.hours_spent = hours_spent || 0;
    task.submitted_by = submitted_by;
    task.submitted_at = new Date();
    task.approval_status = 'pending';
    
    await task.save();
    
    await task.populate('submitted_by', 'name email');

    // Update performance metrics
    let performance = await Performance.findOne({ user_id: submitted_by });
    
    const completedTasks = await Task.countDocuments({ 
      assigned_to: submitted_by, 
      approval_status: 'approved' 
    });
    
    const assignedTasks = await Task.countDocuments({ 
      assigned_to: submitted_by 
    });
    
    const pendingTasks = await Task.countDocuments({
      assigned_to: submitted_by,
      approval_status: 'pending',
      submitted_by: { $exists: true }
    });
    
    const inProgressTasks = await Task.countDocuments({
      assigned_to: submitted_by,
      status: 'in-progress',
      submitted_by: { $exists: false }
    });
    
    const completionRate = assignedTasks > 0 
      ? (completedTasks / assignedTasks) * 100 
      : 0;

    if (performance) {
      performance.tasks_completed = completedTasks;
      performance.tasks_assigned = assignedTasks;
      performance.total_hours_worked = (performance.total_hours_worked || 0) + hours_spent;
      performance.completion_rate = completionRate;
      performance.last_updated = new Date();
      
      await performance.save();
    } else {
      performance = new Performance({
        user_id: submitted_by,
        tasks_completed: completedTasks,
        tasks_assigned: assignedTasks,
        total_hours_worked: hours_spent,
        completion_rate: completionRate,
        tasks_in_progress: inProgressTasks,
        tasks_pending: pendingTasks
      });
      await performance.save();
    }

    // Send notifications to all admins
    if (adminUsers && adminUsers.length > 0) {
      adminUsers.forEach(admin => {
        const adminId = admin._id.toString();
        if (connectedUsers[adminId]) {
          io.to(connectedUsers[adminId]).emit('notification', {
            type: 'approval_status',
            message: `📋 Task report submitted by ${employee?.name || 'Employee'}: ${task.title}`,
            taskId: task._id,
            title: task.title,
            submittedBy: employee?.name,
            hoursSpent: hours_spent,
            timestamp: new Date().toISOString()
          });
          logger.info(`📬 Approval notification sent to admin ${adminId}`);
        }
      });
    }

    logger.info(`✓ Task report submitted for approval (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true, taskId: id });
  } catch (err) {
    logger.error('❌ Error submitting task report:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Task file upload
app.post('/api/tasks/:id/upload', upload.single('attachment'), async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID format' });
    }
    if (!req.file) {
      return res.status(400).json({ ok: false, error: 'No file uploaded' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    task.attachments.push({
      filename: req.file.filename,
      originalName: req.file.originalname,
      path: req.file.path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploaded_by: req.body.uploaded_by ? req.body.uploaded_by : null
    });
    await task.save();

    res.json({ ok: true, attachment: task.attachments.slice(-1)[0] });
  } catch (err) {
    logger.error('❌ Error uploading task file:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin approval endpoint with notification
app.post('/api/tasks/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID format' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    
    const employee = await User.findById(task.submitted_by);

    task.approval_status = 'approved';
    task.status = 'completed';
    task.admin_feedback = feedback;
    task.approved_at = new Date();
    
    await task.save();

    // Update performance metrics
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

    // Send real-time notification to the employee
    if (employee && connectedUsers[employee._id.toString()]) {
      io.to(connectedUsers[employee._id.toString()]).emit('notification', {
        type: 'approval_status',
        message: `✅ Your task "${task.title}" has been approved! ${feedback ? 'Feedback: ' + feedback : ''}`,
        taskId: task._id,
        title: task.title,
        feedback: feedback,
        status: 'approved',
        timestamp: new Date().toISOString()
      });
      logger.info(`📬 Approval notification sent to employee ${employee._id}`);
    }

    // Send email notification to employee
    if (employee) {
      try {
        await emailService.sendTaskApprovalEmail(
          employee.email,
          employee.name,
          task.title,
          feedback || 'Well done!'
        );
      } catch (emailErr) {
        logger.error('Email sending failed:', emailErr.message);
      }
    }

    logger.info(`✓ Task approved (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin rejection endpoint with notification
app.post('/api/tasks/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;
    const { feedback } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid task ID format' });
    }

    const task = await Task.findById(id);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }
    
    const employee = await User.findById(task.submitted_by);

    task.approval_status = 'rejected';
    task.admin_feedback = feedback;
    
    await task.save();

    // Send real-time notification to the employee
    if (employee && connectedUsers[employee._id.toString()]) {
      io.to(connectedUsers[employee._id.toString()]).emit('notification', {
        type: 'approval_status',
        message: `⚠️ Your task "${task.title}" needs revisions: ${feedback}`,
        taskId: task._id,
        title: task.title,
        feedback: feedback,
        status: 'rejected',
        timestamp: new Date().toISOString()
      });
      logger.info(`📬 Rejection notification sent to employee ${employee._id}`);
    }

    // Send email notification to employee
    if (employee) {
      try {
        await emailService.sendTaskRejectionEmail(
          employee.email,
          employee.name,
          task.title,
          feedback || 'Please review and resubmit'
        );
      } catch (emailErr) {
        logger.error('Email sending failed:', emailErr.message);
      }
    }

    logger.info(`✓ Task rejected (Task ID: ${id}, Employee: ${employee?.name})`);
    res.json({ ok: true });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
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
    .populate('assigned_to', 'name email')
    .sort({ submitted_at: -1 });
    
    const formattedTasks = tasks.map(task => {
      const taskObj = task.toObject();
      taskObj.submitted_by_name = task.submitted_by?.name || 'Unknown';
      taskObj.assigned_to_name = task.assigned_to?.name || 'Unknown';
      return taskObj;
    });
    
    res.json(formattedTasks);
  } catch (err) {
    logger.error('Error in pending-approvals:', err);
    res.status(500).json({ ok: false, error: err.message });
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
    .populate('assigned_to', 'name email')
    .sort({ submitted_at: -1 });
    
    const formattedTasks = tasks.map(task => {
      const taskObj = task.toObject();
      taskObj.submitted_by_name = task.submitted_by?.name || 'Unknown';
      taskObj.assigned_to_name = task.assigned_to?.name || 'Unknown';
      return taskObj;
    });
    
    res.json(formattedTasks);
  } catch (err) {
    logger.error('Error in pending-approvals:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// ADD IMPERSONATION ENDPOINT RIGHT HERE ↓↓↓
// ============================================

// Impersonate user (Super Admin only)
app.post('/api/admin/impersonate', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'User ID required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID format' });
    }
    
    // Find the user to impersonate
    const targetUser = await User.findById(userId);
    if (!targetUser) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }
    
    // Create a token for the target user
    const token = jwt.sign(
      { 
        id: targetUser._id, 
        role: targetUser.role, 
        name: targetUser.name, 
        email: targetUser.email 
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const refreshToken = jwt.sign(
      { id: targetUser._id },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    // Log the impersonation for audit
    try {
      await AuditLog.create({
        user_id: req.user.id,
        action: 'impersonate',
        resource: 'user',
        resource_id: targetUser._id,
        details: {
          impersonated_user: targetUser.name,
          impersonated_email: targetUser.email,
          admin_name: req.user.name
        },
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      });
    } catch (logErr) {
      console.warn('Failed to log impersonation:', logErr.message);
    }
    
    console.log(`🔑 Admin ${req.user.name} is impersonating ${targetUser.name} (${targetUser.role})`);
    
    res.json({
      ok: true,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.role
      },
      token,
      refreshToken,
      expiresIn: 604800 // 7 days in seconds
    });
    
  } catch (err) {
    logger.error('Impersonation error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ============================================
// CONTINUE WITH YOUR OTHER ROUTES ↓↓↓
// ============================================

// ========== TEAM MANAGEMENT ROUTES ==========
// ... rest of your code
// ========== TEAM MANAGEMENT ROUTES ==========

// Create a new team (admin only)
app.post('/api/teams', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { name, description, team_lead, members } = req.body;
    
    if (!name) {
      return res.status(400).json({ ok: false, error: 'Team name is required' });
    }
    
    // Check if team already exists
    const existingTeam = await Team.findOne({ name });
    if (existingTeam) {
      return res.status(409).json({ ok: false, error: 'Team name already exists' });
    }
    
    const team = new Team({
      name,
      description,
      team_lead: team_lead || null,
      members: members || [],
      created_by: req.user.id,
      created_at: new Date()
    });
    
    await team.save();
    
    // Notify all team members
    if (members && members.length > 0) {
      members.forEach(memberId => {
        if (connectedUsers[memberId]) {
          io.to(connectedUsers[memberId]).emit('notification', {
            type: 'team_added',
            message: `You have been added to team: ${name}`,
            teamId: team._id,
            teamName: name,
            timestamp: new Date().toISOString()
          });
        }
      });
    }
    
    // Notify team lead
    if (team_lead && connectedUsers[team_lead]) {
      io.to(connectedUsers[team_lead]).emit('notification', {
        type: 'team_lead',
        message: `You are now the team lead for: ${name}`,
        teamId: team._id,
        teamName: name,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ ok: true, team });
    
  } catch (err) {
    logger.error('Error creating team:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get all teams
app.get('/api/teams', authenticateToken, async (req, res) => {
  try {
    const teams = await Team.find()
      .populate('team_lead', 'name email')
      .populate('members', 'name email')
      .populate('created_by', 'name email')
      .sort({ created_at: -1 });
    
    res.json(teams);
  } catch (err) {
    logger.error('Error fetching teams:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get team by ID
app.get('/api/teams/:teamId', authenticateToken, async (req, res) => {
  try {
    const { teamId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ ok: false, error: 'Invalid team ID format' });
    }
    
    const team = await Team.findById(teamId)
      .populate('team_lead', 'name email')
      .populate('members', 'name email role')
      .populate('created_by', 'name email');
    
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    res.json(team);
  } catch (err) {
    logger.error('Error fetching team:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add members to team
app.post('/api/teams/:teamId/members', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId } = req.params;
    const { memberIds } = req.body;
    
    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'memberIds array required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ ok: false, error: 'Invalid team ID format' });
    }
    
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    // Add new members (avoid duplicates)
    const newMembers = memberIds.filter(id => !team.members.includes(id));
    team.members = [...team.members, ...newMembers];
    await team.save();
    
    // Notify new members
    newMembers.forEach(memberId => {
      if (connectedUsers[memberId]) {
        io.to(connectedUsers[memberId]).emit('notification', {
          type: 'team_added',
          message: `You have been added to team: ${team.name}`,
          teamId: team._id,
          teamName: team.name,
          timestamp: new Date().toISOString()
        });
      }
    });
    
    const updatedTeam = await Team.findById(teamId)
      .populate('members', 'name email');
    
    res.json({ ok: true, team: updatedTeam });
    
  } catch (err) {
    logger.error('Error adding team members:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Remove member from team
app.delete('/api/teams/:teamId/members/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { teamId, userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(teamId) || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid ID format' });
    }
    
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    team.members = team.members.filter(id => id.toString() !== userId);
    await team.save();
    
    // Notify removed member
    if (connectedUsers[userId]) {
      io.to(connectedUsers[userId]).emit('notification', {
        type: 'team_removed',
        message: `You have been removed from team: ${team.name}`,
        teamId: team._id,
        teamName: team.name,
        timestamp: new Date().toISOString()
      });
    }
    
    res.json({ ok: true, message: 'Member removed from team' });
    
  } catch (err) {
    logger.error('Error removing team member:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get team tasks (tasks assigned to team members)
app.get('/api/teams/:teamId/tasks', authenticateToken, async (req, res) => {
  try {
    const { teamId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ ok: false, error: 'Invalid team ID format' });
    }
    
    const team = await Team.findById(teamId);
    if (!team) {
      return res.status(404).json({ ok: false, error: 'Team not found' });
    }
    
    // Get all tasks assigned to team members
    const tasks = await Task.find({
      assigned_to: { $in: team.members }
    })
    .populate('assigned_to', 'name email')
    .populate('submitted_by', 'name email')
    .sort({ created_at: -1 });
    
    res.json(tasks);
    
  } catch (err) {
    logger.error('Error fetching team tasks:', err);
    res.status(500).json({ ok: false, error: err.message });
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
      const pending = tasks.filter(t => t.approval_status === 'pending').length;
      const rejected = tasks.filter(t => t.approval_status === 'rejected').length;
      const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
      const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;
      
      performanceData.push({
        user_id: worker._id,
        name: worker.name,
        email: worker.email,
        tasks_completed: completed,
        tasks_pending: pending,
        tasks_rejected: rejected,
        tasks_assigned: tasks.length,
        total_hours_worked: parseFloat(totalHours.toFixed(2)),
        completion_rate: Math.round(completionRate)
      });
    }
    
    res.json(performanceData);
  } catch (err) {
    logger.error('Error in performance-metrics:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get individual employee performance metrics
app.get('/api/employee/performance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid user ID format' });
    }

    const tasks = await Task.find({ assigned_to: userId });
    const completed = tasks.filter(t => t.approval_status === 'approved').length;
    const submitted = tasks.filter(t => t.approval_status === 'pending' && t.status === 'submitted').length;
    const inProgress = tasks.filter(t => t.status === 'in-progress').length;
    const totalHours = tasks.reduce((sum, t) => sum + (t.hours_spent || 0), 0);
    const completionRate = tasks.length > 0 ? (completed / tasks.length) * 100 : 0;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

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
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== QR CODE ROUTES ==========

// Generate QR code for user
app.post('/api/generate-user-qr', async (req, res) => {
  try {
    const { userId, email, name } = req.body;
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid userId format' });
    }

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
    logger.error('QR generation error:', err);
    res.status(500).json({ ok: false, error: 'QR generation failed' });
  }
});

// Get user QR code
app.get('/api/user-qr/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid userId format' });
    }
    
    const qrCode = await QRCode.findOne({ user_id: userId });
    
    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'QR code not found' });
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
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Scan QR code
app.post('/api/scan-qr', async (req, res) => {
  try {
    let { qrToken, userId, scanResult } = req.body;

    // Support old payload style and raw scan content
    if (!qrToken && scanResult) {
      if (typeof scanResult === 'string') {
        try {
          const payload = JSON.parse(scanResult);
          qrToken = qrToken || payload.token || payload.qr_token;
          userId = userId || payload.userId || payload.user_id || payload.id;
        } catch (e) {
          // If scanResult is token only
          qrToken = qrToken || scanResult;
        }
      }
    }

    if (!qrToken) {
      return res.status(400).json({ ok: false, error: 'qrToken required' });
    }

    let qrCode;
    if (userId && mongoose.Types.ObjectId.isValid(userId)) {
      qrCode = await QRCode.findOne({ qr_token: qrToken, user_id: userId });
    } else {
      // fallback: find by token only and optionally link userId from record
      qrCode = await QRCode.findOne({ qr_token: qrToken });
      if (qrCode) userId = qrCode.user_id.toString();
    }

    if (!qrCode) {
      return res.status(404).json({ ok: false, error: 'Invalid QR code' });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid userId format' });
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

    // Notify user about successful scan
    if (connectedUsers[userId]) {
      io.to(connectedUsers[userId]).emit('notification', {
        type: 'qr_scanned',
        message: `QR code scanned successfully at ${now.toLocaleString()}`,
        scanTime: now.toISOString(),
        timestamp: new Date().toISOString()
      });
    }

    // Notify admins about scan
    broadcastToAdmins({
      type: 'qr_scan',
      message: `User ${userId} scanned QR code`,
      userId: userId,
      scanTime: now.toISOString(),
      timestamp: new Date().toISOString()
    });

    res.json({
      ok: true,
      message: 'QR code scanned successfully',
      scanTime: now.toISOString(),
      scanCount: qrCode.scan_count
    });
  } catch (err) {
    logger.error('QR scan error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get QR scan records for a user
app.get('/api/qr-scans/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid userId format' });
    }
    
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
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
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
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== ATTENDANCE ROUTES ==========

// Record attendance
app.post('/api/attendance', async (req, res) => {
  try {
    const { user_id, action } = req.body;
    if (!user_id || !action) {
      return res.status(400).json({ ok: false, error: 'user_id and action required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ ok: false, error: 'Invalid user_id format' });
    }
    
    const attendance = new Attendance({
      user_id,
      action,
      timestamp: new Date()
    });
    
    await attendance.save();
    
    // Notify admins about attendance action
    broadcastToAdmins({
      type: 'attendance',
      message: `User ${user_id} performed action: ${action}`,
      userId: user_id,
      action: action,
      timestamp: new Date().toISOString()
    });
    
    res.json({ ok: true, id: attendance._id });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get attendance for a user
app.get('/api/attendance/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ ok: false, error: 'Invalid user_id format' });
    }
    
    const records = await Attendance.find({ user_id })
      .sort({ timestamp: -1 });
    
    res.json({ ok: true, records });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Record time log
app.post('/api/time', async (req, res) => {
  try {
    const { user_id, action, time } = req.body;
    
    if (!user_id || !action) {
      return res.status(400).json({ ok: false, error: 'user_id and action required' });
    }
    
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ ok: false, error: 'Invalid user_id format' });
    }

    const timeLog = new TimeLog({
      user_id,
      action,
      time: time || new Date()
    });
    
    await timeLog.save();
    
    res.json({ ok: true, id: timeLog._id });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get time logs for a user
app.get('/api/time/:user_id', async (req, res) => {
  try {
    const { user_id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(user_id)) {
      return res.status(400).json({ ok: false, error: 'Invalid user_id format' });
    }
    
    const logs = await TimeLog.find({ user_id })
      .sort({ time: -1 });
    
    res.json(logs);
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========== LEGACY QR ENDPOINTS ==========

// Generate QR token (legacy)
app.post('/api/generate-qr-token', async (req, res) => {
  try {
    const { userId, email, role } = req.body;
    if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ ok: false, error: 'Invalid userId format' });
    }
    
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
    logger.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Generate QR (legacy and fallback to user QR generation)
app.post('/api/generate-qr', async (req, res) => {
  try {
    const { userId, email, name, username, role } = req.body;

    // Prefer modern user QR process if userId is provided
    if (userId) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ ok: false, error: 'Invalid userId format' });
      }

      let existingQR = await QRCode.findOne({ user_id: userId });
      if (existingQR) {
        return res.json({ ok: true, qrToken: existingQR.qr_token, qrData: existingQR.qr_data, isActivated: existingQR.is_activated });
      }

      const qrToken = uuidv4();
      const qrPayload = JSON.stringify({ userId, email, name, token: qrToken, timestamp: new Date().toISOString() });
      const qrData = await QR.toDataURL(qrPayload, { errorCorrectionLevel: 'H', type: 'image/png', width: 300, margin: 2 });

      const qrCode = new QRCode({ user_id: userId, qr_token: qrToken, qr_data: qrData });
      await qrCode.save();

      return res.json({ ok: true, qrToken, qrData, isActivated: false });
    }

    // Legacy behavior for compatibility
    if (!username) {
      return res.status(400).json({ ok: false, error: 'username required' });
    }

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
    res.json({ ok: true, token, qrData });
  } catch (err) {
    logger.error(err);
    res.status(500).json({ ok: false, error: 'QR generation failed' });
  }
});

// Validate token (legacy)
app.post('/api/validate-token', (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ ok: false, error: 'token required' });
    
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
    logger.error(err);
    res.status(500).json({ ok: false, error: 'Token validation failed' });
  }
});

// ===============================================
// API 404 Handler
// Handle undefined API routes BEFORE error handler
// ===============================================

app.all('/api/*', (req, res) => {
  // If we get here, an API route wasn't matched
  res.status(404).json({ 
    ok: false, 
    error: 'API endpoint not found',
    method: req.method,
    path: req.path
  });
});

// ===============================================
// Global Error Handler Middleware
// MUST be defined BEFORE catch-all routes but AFTER all other middleware
// ===============================================

app.use((err, req, res, next) => {
  logger.error('❌ Unhandled error:', err.message);
  logger.error('Stack trace:', err.stack);
  
  // Don't override response headers if already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Always return JSON for API requests
  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      ok: false,
      error: err.message || 'Internal server error'
    });
  }
  
  // For non-API requests, let it fall through
  next(err);
});

// ===============================================
// Static Files & Fallback SPA Route
// ===============================================
// Root route - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// Serve static files
app.use(express.static(root));

// Password reset routes
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Don't reveal if email exists
      return res.json({ ok: true, message: 'If email exists, reset link will be sent' });
    }

    const resetToken = jwt.sign(
      { id: user._id },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Store reset token (add to user schema)
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    // Send email with reset link
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    if (transporter) {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: 'Password Reset Request',
        html: `
          <h2>Reset Your Password</h2>
          <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
          <p>This link expires in 1 hour.</p>
        `
      });
    }

    res.json({ ok: true, message: 'Reset link sent to email' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Reset password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findOne({
      _id: decoded.id,
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ ok: false, error: 'Invalid or expired token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ ok: true, message: 'Password reset successful' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// User profile update
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { name, email, currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    // If changing password, verify current password
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ ok: false, error: 'Current password required' });
      }

      const isValidPassword = await bcrypt.compare(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(400).json({ ok: false, error: 'Current password is incorrect' });
      }

      // Validate new password strength
      if (newPassword.length < 8) {
        return res.status(400).json({ ok: false, error: 'Password must be at least 8 characters' });
      }

      user.password = await bcrypt.hash(newPassword, 10);
    }

    // Update other fields
    if (name) user.name = name.trim();
    if (email) {
      // Check if email is already taken
      const existingUser = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ ok: false, error: 'Email already in use' });
      }
      user.email = email.toLowerCase().trim();
    }

    user.updated_at = new Date();
    await user.save();

    // Return updated user (exclude password)
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department,
      position: user.position,
      phone: user.phone,
      avatar: user.avatar,
      preferences: user.preferences,
      created_at: user.created_at,
      updated_at: user.updated_at
    };

    res.json({ ok: true, user: userResponse });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin user management endpoints
app.get('/api/admin/users', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, search, role, department, is_active } = req.query;

    let query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role) query.role = role;
    if (department) query.department = department;
    if (is_active !== undefined) query.is_active = is_active === 'true';

    const users = await User.find(query)
      .select('-password -resetPasswordToken -resetPasswordExpires')
      .sort({ created_at: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    const total = await User.countDocuments(query);

    res.json({
      ok: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update user role
app.put('/api/admin/users/:userId/role', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['admin', 'worker', 'team_lead', 'manager'].includes(role)) {
      return res.status(400).json({ ok: false, error: 'Invalid role' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role, updated_at: new Date() },
      { new: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Deactivate/activate user
app.put('/api/admin/users/:userId/deactivate', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { userId } = req.params;
    const { is_active } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { is_active, updated_at: new Date() },
      { new: true }
    ).select('-password -resetPasswordToken -resetPasswordExpires');

    if (!user) {
      return res.status(404).json({ ok: false, error: 'User not found' });
    }

    res.json({ ok: true, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Task deletion (admin only)
app.delete('/api/tasks/:taskId', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const { taskId } = req.params;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    // Delete associated files if any
    if (task.attachments && task.attachments.length > 0) {
      const fs = require('fs').promises;
      const path = require('path');

      for (const attachment of task.attachments) {
        try {
          await fs.unlink(path.join(__dirname, attachment.path));
        } catch (err) {
          console.warn(`Failed to delete attachment: ${attachment.path}`, err.message);
        }
      }
    }

    await Task.findByIdAndDelete(taskId);

    // Log the deletion
    await AuditLog.create({
      user_id: req.user.id,
      action: 'delete_task',
      resource_type: 'task',
      resource_id: taskId,
      details: { task_title: task.title },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    res.json({ ok: true, message: 'Task deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Task reassignment (admin or team lead)
app.put('/api/tasks/:taskId/reassign', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { new_assigned_to, new_assigned_team } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    const task = await Task.findById(taskId).populate('assigned_to', 'name email');
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    // Check permissions: admin can reassign any task, team leads can reassign tasks in their teams
    if (userRole !== 'admin') {
      const user = await User.findById(userId);
      if (!user.teams.includes(task.assigned_team) && task.assigned_team) {
        return res.status(403).json({ ok: false, error: 'Not authorized to reassign this task' });
      }
    }

    // Validate new assignee exists
    if (new_assigned_to) {
      const newAssignee = await User.findById(new_assigned_to);
      if (!newAssignee) {
        return res.status(404).json({ ok: false, error: 'New assignee not found' });
      }
    }

    // Update task
    const updateData = { updated_at: new Date() };
    if (new_assigned_to) updateData.assigned_to = new_assigned_to;
    if (new_assigned_team !== undefined) updateData.assigned_team = new_assigned_team;

    const updatedTask = await Task.findByIdAndUpdate(taskId, updateData, { new: true })
      .populate('assigned_to', 'name email')
      .populate('assigned_team', 'name')
      .populate('created_by', 'name');

    // Log the reassignment
    await AuditLog.create({
      user_id: userId,
      action: 'reassign_task',
      resource_type: 'task',
      resource_id: taskId,
      details: {
        old_assigned_to: task.assigned_to?._id,
        new_assigned_to: new_assigned_to,
        task_title: task.title
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    // Notify new assignee via socket
    if (new_assigned_to && io) {
      io.to(new_assigned_to).emit('task_assigned', {
        task: updatedTask,
        message: `Task "${task.title}" has been reassigned to you`
      });
    }

    res.json({ ok: true, task: updatedTask });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Bulk task assignment (admin or team lead)
app.post('/api/tasks/bulk-assign', authenticateToken, async (req, res) => {
  try {
    const { taskIds, assigned_to, assigned_team } = req.body;
    const userId = req.user.id;
    const userRole = req.user.role;

    if (!taskIds || !Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({ ok: false, error: 'Task IDs array required' });
    }

    if (!assigned_to && !assigned_team) {
      return res.status(400).json({ ok: false, error: 'Either assigned_to or assigned_team required' });
    }

    // Validate assignee exists
    if (assigned_to) {
      const assignee = await User.findById(assigned_to);
      if (!assignee) {
        return res.status(404).json({ ok: false, error: 'Assignee not found' });
      }
    }

    // Validate team exists
    if (assigned_team) {
      const team = await Team.findById(assigned_team);
      if (!team) {
        return res.status(404).json({ ok: false, error: 'Team not found' });
      }
    }

    // Check permissions for each task
    const tasks = await Task.find({ _id: { $in: taskIds } });
    if (tasks.length !== taskIds.length) {
      return res.status(404).json({ ok: false, error: 'Some tasks not found' });
    }

    if (userRole !== 'admin') {
      const user = await User.findById(userId);
      for (const task of tasks) {
        if (!user.teams.includes(task.assigned_team) && task.assigned_team) {
          return res.status(403).json({ ok: false, error: 'Not authorized to modify some tasks' });
        }
      }
    }

    // Update tasks
    const updateData = { updated_at: new Date() };
    if (assigned_to) updateData.assigned_to = assigned_to;
    if (assigned_team) updateData.assigned_team = assigned_team;

    const result = await Task.updateMany(
      { _id: { $in: taskIds } },
      updateData
    );

    // Log bulk assignment
    await AuditLog.create({
      user_id: userId,
      action: 'bulk_assign_tasks',
      resource_type: 'task',
      details: {
        task_ids: taskIds,
        assigned_to: assigned_to,
        assigned_team: assigned_team,
        count: taskIds.length
      },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    // Notify assignee via socket
    if (assigned_to && io) {
      const updatedTasks = await Task.find({ _id: { $in: taskIds } })
        .populate('assigned_to', 'name email')
        .populate('created_by', 'name');

      io.to(assigned_to).emit('bulk_tasks_assigned', {
        tasks: updatedTasks,
        message: `${taskIds.length} tasks have been assigned to you`
      });
    }

    res.json({
      ok: true,
      message: `${result.modifiedCount} tasks updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Add task comment
app.post('/api/tasks/:taskId/comments', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { content } = req.body;
    const userId = req.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ ok: false, error: 'Comment content required' });
    }

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    // Check if user can comment (assigned user, team member, or admin)
    const user = await User.findById(userId);
    const canComment = user.role === 'admin' ||
                      task.assigned_to.toString() === userId ||
                      (task.assigned_team && user.teams.includes(task.assigned_team));

    if (!canComment) {
      return res.status(403).json({ ok: false, error: 'Not authorized to comment on this task' });
    }

    const newComment = {
      user: userId,
      content: content.trim(),
      created_at: new Date()
    };

    task.comments.push(newComment);
    task.updated_at = new Date();
    await task.save();

    // Populate comment user data
    await task.populate('comments.user', 'name avatar');

    // Log the comment
    await AuditLog.create({
      user_id: userId,
      action: 'add_task_comment',
      resource_type: 'task',
      resource_id: taskId,
      details: { task_title: task.title },
      ip_address: req.ip,
      user_agent: req.get('User-Agent')
    });

    // Notify task assignee and team members via socket
    if (io) {
      const notificationTargets = new Set();

      // Add task assignee
      if (task.assigned_to && task.assigned_to.toString() !== userId) {
        notificationTargets.add(task.assigned_to.toString());
      }

      // Add team members if task is assigned to a team
      if (task.assigned_team) {
        const team = await Team.findById(task.assigned_team);
        if (team) {
          team.members.forEach(memberId => {
            if (memberId.toString() !== userId) {
              notificationTargets.add(memberId.toString());
            }
          });
        }
      }

      // Send notification
      notificationTargets.forEach(targetId => {
        io.to(targetId).emit('task_comment', {
          taskId: task._id,
          taskTitle: task.title,
          comment: newComment,
          commenter: { id: user._id, name: user.name }
        });
      });
    }

    res.json({ ok: true, comment: task.comments[task.comments.length - 1] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get task comments
app.get('/api/tasks/:taskId/comments', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.id;

    const task = await Task.findById(taskId).populate('comments.user', 'name avatar');
    if (!task) {
      return res.status(404).json({ ok: false, error: 'Task not found' });
    }

    // Check if user can view comments
    const user = await User.findById(userId);
    const canView = user.role === 'admin' ||
                   task.assigned_to.toString() === userId ||
                   (task.assigned_team && user.teams.includes(task.assigned_team));

    if (!canView) {
      return res.status(403).json({ ok: false, error: 'Not authorized to view task comments' });
    }

    res.json({ ok: true, comments: task.comments });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Attendance dashboard data
app.get('/api/attendance/dashboard', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, user_id, department } = req.query;
    const userRole = req.user.role;
    const userId = req.user.id;

    // Set default date range (last 30 days)
    const endDate = end_date ? new Date(end_date) : new Date();
    const startDate = start_date ? new Date(start_date) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    let query = {
      timestamp: { $gte: startDate, $lte: endDate }
    };

    // Filter by user permissions
    if (userRole !== 'admin') {
      if (user_id && user_id === userId) {
        query.user_id = userId;
      } else {
        // Non-admin users can only see their own attendance
        query.user_id = userId;
      }
    } else {
      // Admin can filter by specific user or department
      if (user_id) {
        query.user_id = user_id;
      }
      if (department) {
        // Find users in the department and filter attendance
        const usersInDept = await User.find({ department }).select('_id');
        const userIds = usersInDept.map(u => u._id);
        query.user_id = { $in: userIds };
      }
    }

    // Get attendance records with user details
    const attendanceRecords = await Attendance.find(query)
      .populate('user_id', 'name email department position')
      .sort({ timestamp: -1 })
      .lean();

    // Calculate dashboard metrics
    const totalRecords = attendanceRecords.length;
    const uniqueUsers = new Set(attendanceRecords.map(r => r.user_id._id.toString())).size;

    // Group by date for daily attendance
    const dailyAttendance = {};
    attendanceRecords.forEach(record => {
      const date = record.timestamp.toISOString().split('T')[0];
      if (!dailyAttendance[date]) {
        dailyAttendance[date] = { date, count: 0, users: new Set() };
      }
      dailyAttendance[date].count++;
      dailyAttendance[date].users.add(record.user_id._id.toString());
    });

    // Convert to array and calculate unique users per day
    const dailyStats = Object.values(dailyAttendance).map(day => ({
      date: day.date,
      total_scans: day.count,
      unique_users: day.users.size
    })).sort((a, b) => b.date.localeCompare(a.date));

    // Department breakdown
    const departmentStats = {};
    attendanceRecords.forEach(record => {
      const dept = record.user_id.department || 'Unknown';
      if (!departmentStats[dept]) {
        departmentStats[dept] = { department: dept, count: 0, users: new Set() };
      }
      departmentStats[dept].count++;
      departmentStats[dept].users.add(record.user_id._id.toString());
    });

    const departmentBreakdown = Object.values(departmentStats).map(dept => ({
      department: dept.department,
      total_scans: dept.count,
      unique_users: dept.users.size
    }));

    // Recent activity (last 10 records)
    const recentActivity = attendanceRecords.slice(0, 10).map(record => ({
      id: record._id,
      user: {
        id: record.user_id._id,
        name: record.user_id.name,
        email: record.user_id.email,
        department: record.user_id.department
      },
      timestamp: record.timestamp,
      action: record.action || 'check_in'
    }));

    res.json({
      ok: true,
      dashboard: {
        summary: {
          total_records: totalRecords,
          unique_users: uniqueUsers,
          date_range: {
            start: startDate.toISOString().split('T')[0],
            end: endDate.toISOString().split('T')[0]
          }
        },
        daily_stats: dailyStats,
        department_breakdown: departmentBreakdown,
        recent_activity: recentActivity
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

    // Get basic system stats
    const stats = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        status: dbStatus,
        name: mongoose.connection.name || 'unknown'
      },
      version: process.version,
      environment: process.env.NODE_ENV || 'development'
    };

    // Check if critical services are available
    if (dbStatus !== 'connected') {
      stats.status = 'unhealthy';
      return res.status(503).json(stats);
    }

    res.json(stats);
  } catch (err) {
    console.error('Health check error:', err);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// Detailed health check (admin only)
app.get('/api/health/detailed', authenticateToken, requireRole('admin'), async (req, res) => {
  try {
    const dbStats = await getDatabaseStats();
    const connectionStatus = connectionStatus();

    const detailedStats = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      database: {
        status: connectionStatus,
        name: mongoose.connection.name,
        stats: dbStats
      },
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV
      },
      performance: {
        pid: process.pid,
        cpuUsage: process.cpuUsage(),
        resourceUsage: process.resourceUsage()
      }
    };

    if (connectionStatus !== 'connected') {
      detailedStats.status = 'unhealthy';
      return res.status(503).json(detailedStats);
    }

    res.json(detailedStats);
  } catch (err) {
    console.error('Detailed health check error:', err);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: err.message
    });
  }
});

// Fallback: serve index.html for SPA routing (only for non-API routes)
app.get('*', (req, res) => {
  // Never serve HTML for API paths
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'API endpoint not found' });
  }
  res.sendFile(path.join(root, 'index.html'));
});


// ===============================================
// Start Server
// ===============================================

async function startServer() {
  try {
    logger.info('\n--- WFMS Server Starting ---');
    logger.info('Environment:', process.env.NODE_ENV || 'development');
    logger.info('Port:', port);
    logger.info('Database:', 'MongoDB');
    logger.info('Initial connection status:', connectionStatus());

    await initializeDatabase();

    server.listen(port, () => {
      logger.info('\n========================================');
      logger.info(`✓ Server running at http://localhost:${port}/`);
      logger.info('✓ WebSocket server ready for real-time notifications');
      logger.info('✓ Database:', isConnected() ? 'MongoDB Connected' : 'MongoDB Disconnected');
      logger.info('✓ JWT Secret:', JWT_SECRET.substring(0, 10) + '...');
      logger.info('========================================\n');
    });

    server.on('error', (err) => {
      logger.error('✗ Server error event:', err);
    });
  } catch (err) {
    logger.error('✗ Failed to start server:', err.message);
    process.exit(1);
  }
}

startServer();module.exports = app;
// For Vercel serverless deployment
module.exports = app;
