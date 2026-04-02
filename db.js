// ============================================
// db.js - Complete MongoDB Configuration
// ============================================

const mongoose = require('mongoose');

// Get MongoDB URI from environment
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.warn('⚠️ MONGODB_URI environment variable is not set.');
    if (process.env.NODE_ENV === 'production') {
        console.error('❌ MONGODB_URI is required in production');
        process.exit(1);
    }
}

// Connection options
const connectionOptions = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
    minPoolSize: 2,
};

// ============================================
// SCHEMA DEFINITIONS
// ============================================

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
        index: true
    },
    password: { type: String, required: true },
    role: {
        type: String,
        default: 'worker',
        enum: ['admin', 'worker', 'team_lead', 'manager'],
        index: true
    },
    avatar: { type: String, default: null },
    department: { type: String, default: 'General' },
    position: { type: String, default: 'Employee' },
    phone: { type: String, default: '' },

    // QR Code Fields
    qr_token: { type: String, unique: true, sparse: true, index: true },
    qr_code_data: { type: String, default: null },
    qr_created_at: { type: Date, default: null },
    qr_expires_at: { type: Date, default: null },
    last_qr_scan: { type: Date, default: null },
    qr_scan_count: { type: Number, default: 0 },

    // OAuth
    googleId: { type: String, sparse: true, index: true, default: null },

    // Relationships
    teams: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Team' }],

    // Preferences
    preferences: {
        notifications: { type: Boolean, default: true },
        emailNotifications: { type: Boolean, default: true },
        theme: { type: String, default: 'dark' },
        qr_login_enabled: { type: Boolean, default: true },
        qr_notifications: { type: Boolean, default: true }
    },

    // Security
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    two_factor_enabled: { type: Boolean, default: false },
    two_factor_secret: { type: String },

    // Session tracking
    last_login: { type: Date, default: null },
    last_ip: { type: String },
    login_attempts: { type: Number, default: 0 },
    locked_until: { type: Date },

    // Status
    is_active: { type: Boolean, default: true, index: true },
    email_verified: { type: Boolean, default: false },

    // Timestamps
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// User Virtuals
userSchema.virtual('profile').get(function() {
    return {
        name: this.name,
        email: this.email,
        role: this.role,
        department: this.department,
        position: this.position,
        avatar: this.avatar
    };
});

userSchema.virtual('has_qr').get(function() {
    return !!(this.qr_token && this.qr_code_data);
});

userSchema.virtual('qr_status').get(function() {
    if (!this.qr_token) return 'not_generated';
    if (this.qr_expires_at && this.qr_expires_at < new Date()) return 'expired';
    return 'active';
});

// User Methods
userSchema.methods.isLocked = function() {
    return this.locked_until && this.locked_until > new Date();
};

userSchema.methods.incrementLoginAttempts = async function() {
    this.login_attempts += 1;
    if (this.login_attempts >= 5) {
        this.locked_until = new Date(Date.now() + 30 * 60 * 1000);
    }
    await this.save();
};

userSchema.methods.resetLoginAttempts = async function() {
    this.login_attempts = 0;
    this.locked_until = null;
    await this.save();
};

// User Statics
userSchema.statics.findByEmail = function(email) {
    return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.getActiveCount = function() {
    return this.countDocuments({ is_active: true });
};

userSchema.statics.findByRole = function(role) {
    return this.find({ role: role, is_active: true });
};

// ============================================
// Task Schema
// ============================================
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
    due_date: { type: Date },
    completed_at: { type: Date },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// ============================================
// Team Schema
// ============================================
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

// ============================================
// Team Report Schema (leader reports + admin approval)
// ============================================
const teamReportSchema = new mongoose.Schema({
    team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true, index: true },
    leader_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    period_start: { type: Date },
    period_end: { type: Date },
    content: { type: String, default: '' },
    attachments: [{ type: String }],
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    submitted_at: { type: Date, default: Date.now },
    approved_at: { type: Date },
    approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

teamReportSchema.index({ team_id: 1, leader_id: 1, submitted_at: -1 });

// ============================================
// QR Code Schema
// ============================================
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
        default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
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

// ============================================
// QR Scan Schema
// ============================================
const qrScanSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    qr_token: { type: String, required: true, index: true },
    scanned_at: { type: Date, default: Date.now, index: true },
    scanner_ip: { type: String, required: true, default: 'unknown' },
    action: {
        type: String,
        enum: ['login', 'clock_in', 'clock_out', 'break_start', 'break_end', 'verification', 'attendance'],
        required: true,
        index: true
    },
    user_agent: { type: String, default: '' },
    device_type: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    purpose: {
        type: String,
        enum: ['authentication', 'attendance', 'verification', 'recovery'],
        default: 'authentication'
    },
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    location_name: { type: String, default: '' },
    device_fingerprint: { type: String, index: true },
    session_id: { type: String, default: '' },
    success: { type: Boolean, default: true, index: true },
    error_message: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// QR Scan Indexes
qrScanSchema.index({ user_id: 1, scanned_at: -1 });
qrScanSchema.index({ qr_token: 1, scanned_at: -1 });
qrScanSchema.index({ user_id: 1, action: 1, scanned_at: -1 });

// QR Scan Virtuals
qrScanSchema.virtual('formatted_date').get(function() {
    return this.scanned_at ? this.scanned_at.toLocaleString() : '';
});

qrScanSchema.virtual('time_ago').get(function() {
    if (!this.scanned_at) return '';
    const diff = Date.now() - this.scanned_at.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days !== 1 ? 's' : ''} ago`;
});

// ============================================
// Performance Schema
// ============================================
const performanceSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    tasks_completed: { type: Number, default: 0 },
    tasks_assigned: { type: Number, default: 0 },
    tasks_in_progress: { type: Number, default: 0 },
    tasks_pending_review: { type: Number, default: 0 },
    tasks_rejected: { type: Number, default: 0 },
    total_hours_worked: { type: Number, default: 0 },
    completion_rate: { type: Number, default: 0 },
    high_priority_completed: { type: Number, default: 0 },
    medium_priority_completed: { type: Number, default: 0 },
    low_priority_completed: { type: Number, default: 0 },
    critical_completed: { type: Number, default: 0 },
    monthly_stats: [{
        month: { type: String },
        year: { type: Number },
        tasks_completed: { type: Number, default: 0 },
        tasks_assigned: { type: Number, default: 0 },
        hours_worked: { type: Number, default: 0 }
    }],
    last_updated: { type: Date, default: Date.now }
});

// ============================================
// Attendance Schema
// ============================================
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

// ============================================
// Time Log Schema
// ============================================
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

// ============================================
// Token Blacklist Schema
// ============================================
const tokenBlacklistSchema = new mongoose.Schema({
    token: { type: String, required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    revoked_at: { type: Date, default: Date.now },
    expires_at: { type: Date, required: true }
});

// ============================================
// Webhook Schema
// ============================================
const webhookSchema = new mongoose.Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    events: [{ type: String, enum: ['qr_scan', 'qr_generate', 'qr_revoke'] }],
    secret: { type: String, required: true },
    is_active: { type: Boolean, default: true },
    created_at: { type: Date, default: Date.now }
});

// ============================================
// Alert Schema
// ============================================
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

// ============================================
// Audit Log Schema
// ============================================
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

// ============================================
// Security Alert Schema
// ============================================
const securityAlertSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true },
    patterns: [{ type: String }],
    ip: { type: String },
    user_agent: { type: String },
    created_at: { type: Date, default: Date.now }
});

// ============================================
// Session Schema
// ============================================
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

// ============================================
// Webhook Failure Schema
// ============================================
const webhookFailureSchema = new mongoose.Schema({
    webhook_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Webhook' },
    payload: { type: mongoose.Schema.Types.Mixed },
    error: { type: String },
    timestamp: { type: Date, default: Date.now }
});

// ============================================
// CREATE MODELS
// ============================================
const User = mongoose.model('User', userSchema);
const Task = mongoose.model('Task', taskSchema);
const Team = mongoose.model('Team', teamSchema);
const TeamReport = require('./models/TeamReport');
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

// ============================================
// HELPER FUNCTIONS
// ============================================
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

// ============================================
// EXPORT ALL MODELS AND HELPERS
// ============================================
module.exports = {
    User,
    Task,
    Team,
    TeamReport,
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
    mongoose,
    MONGODB_URI,
    connectionOptions
};