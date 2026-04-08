// Enhanced app.js with Attendance + Logs endpoints
// Fully synchronized with index.html and app.client.js

const express = require('express');
const Attendance = require('./models/Attendance');

// FIXED: Complete the Logger import
const Logger = require('./models/Logger');

const app = express();

// Middleware already configured in server.js - just add routes

// ===== ATTENDANCE ROUTES =====
// Record attendance (clock in/out/break)
app.post('/api/attendance', async (req, res) => {
  try {
    const { user_id, action } = req.body;
    
    if (!user_id || !action) {
      return res.status(400).json({ ok: false, error: 'user_id and action required' });
    }

    // Validate action
    const validActions = ['clock_in', 'clock_out', 'break_start', 'break_end'];
    if (!validActions.includes(action)) {
      return res.status(400).json({ ok: false, error: 'Invalid action. Use: clock_in, clock_out, break_start, break_end' });
    }

    const result = await Attendance.record(user_id, action, req);
    
    if (result && result.success !== false) {
      // Update total logs stat via socket if connected
      if (global.io && typeof global.io.emit === 'function') {
        global.io.emit('attendance_updated', { user_id, action, timestamp: new Date() });
      }
      return res.json({ ok: true, result: result || { success: true, message: `${action} recorded` } });
    }
    
    res.status(500).json({ ok: false, error: result?.error || 'Attendance recording failed' });
  } catch (err) {
    console.error('Attendance error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Week summary (Mon-Sun)
app.get('/api/attendance/summary', async (req, res) => {
  try {
    const summary = await Attendance.getWeekSummary();
    
    if (summary && summary.error) {
      return res.status(500).json({ ok: false, error: summary.error });
    }
    
    // Emit socket update
    if (global.io && typeof global.io.emit === 'function') {
      global.io.emit('attendance_summary_updated', summary);
    }
    
    res.json({ ok: true, summary: summary || { total_records: 0, unique_users: 0, week_records: 0 } });
  } catch (err) {
    console.error('Week summary error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Personal attendance for a specific user
app.get('/api/attendance/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const records = await Attendance.getUserAttendance(userId);
    res.json({ ok: true, records: records || [] });
  } catch (err) {
    console.error('Personal attendance error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Legacy endpoint for compatibility
app.get('/api/attendance/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const records = await Attendance.getUserAttendance(userId);
    res.json({ ok: true, records: records || [] });
  } catch (err) {
    console.error('Personal attendance error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== LOGS ROUTES =====
app.post('/api/logs', async (req, res) => {
  try {
    const { level, message, user_id, module } = req.body;
    
    if (!message) {
      return res.status(400).json({ ok: false, error: 'message required' });
    }
    
    const success = await Logger.log(level || 'info', message || '', user_id, module || 'general', req);
    
    if (success && global.io && typeof global.io.emit === 'function') {
      global.io.emit('logs_updated');
    }
    
    res.json({ ok: true });
  } catch (err) {
    console.error('Log post error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get logs with filters
app.get('/api/logs', async (req, res) => {
  try {
    const { limit = 100, date, level, userId, module } = req.query;
    const filters = {};
    
    if (date) filters.date = date;
    if (level) filters.level = level;
    if (userId) filters.userId = userId;
    if (module) filters.module = module;
    
    const logs = await Logger.getRecentLogs(parseInt(limit), filters);
    const count = await Logger.getLogCount();
    
    res.json({ ok: true, logs: logs || [], total: count || 0 });
  } catch (err) {
    console.error('Logs get error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Update totalLogs stat - simplified endpoint
app.get('/api/stats/logs-count', async (req, res) => {
  try {
    const count = await Logger.getLogCount();
    res.json({ ok: true, totalLogs: count || 0 });
  } catch (err) {
    console.error('Logs count error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ===== ADDITIONAL HELPER ENDPOINTS FOR COMPATIBILITY =====

// Get all logs count (alias)
app.get('/api/logs/count', async (req, res) => {
  try {
    const count = await Logger.getLogCount();
    res.json({ ok: true, count: count || 0 });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Get recent logs with pagination
app.get('/api/logs/recent', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await Logger.getRecentLogs(parseInt(limit));
    res.json({ ok: true, logs: logs || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Export the app for use in server.js
module.exports = app;