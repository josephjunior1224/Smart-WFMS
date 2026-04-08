// models/Attendance.js - MySQL attendance queries
const db = require('./db.js').pool;

const Attendance = {
  // Record attendance action (clock in/out/break)
  async record(userId, action, req = null) {
    const ip = req?.ip || req?.connection?.remoteAddress || 'unknown';
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const query = `
      INSERT INTO attendance_logs (user_id, action, timestamp, ip) 
      VALUES (?, ?, ?, ?)
    `;
    try {
      const [result] = await db.execute(query, [userId, action, timestamp, ip]);
      return { success: true, id: result.insertId };
    } catch (err) {
      console.error('Attendance record error:', err);
      return { success: false, error: err.message };
    }
  },

  // Get current week summary (Mon-Sun)
  async getWeekSummary() {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay() + 1); // Monday
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Sunday
    endOfWeek.setHours(23, 59, 59, 999);

    const startStr = startOfWeek.toISOString().slice(0, 19).replace('T', ' ');
    const endStr = endOfWeek.toISOString().slice(0, 19).replace('T', ' ');

    const summaryQuery = `
      SELECT 
        COUNT(DISTINCT user_id) as total_employees,
        SUM(CASE WHEN action = 'clock_in' THEN 1 ELSE 0 END) as present_days,
        COUNT(CASE WHEN action = 'clock_out' AND TIME(timestamp) > '18:00:00' THEN 1 END) as overtime,
        COUNT(DISTINCT DATE(timestamp)) as work_days
      FROM attendance_logs 
      WHERE timestamp BETWEEN ? AND ? AND action IN ('clock_in', 'clock_out')
    `;

    try {
      const [summary] = await db.execute(summaryQuery, [startStr, endStr]);
      const row = summary[0];
      
      // Calculate absent (assuming 5 workdays)
      const workDays = 5;
      const present = row.total_employees || 0;
      const absent = Math.max(0, workDays - row.present_days);
      const late = 0; // TODO: implement late detection vs scheduled time

      return {
        week_start: startStr.split(' ')[0],
        week_end: endStr.split(' ')[0],
        total_employees: present,
        present: present,
        absent,
        late: late,
        overtime: row.overtime || 0,
        total_hours: 0 // TODO: calculate from clock_in/out pairs
      };
    } catch (err) {
      console.error('Week summary error:', err);
      return { error: err.message };
    }
  },

  // Personal attendance for user
  async getUserAttendance(userId, days = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 19).replace('T', ' ');

    const query = `
      SELECT action, timestamp, ip 
      FROM attendance_logs 
      WHERE user_id = ? AND timestamp > ?
      ORDER BY timestamp DESC
      LIMIT 50
    `;

    try {
      const [rows] = await db.execute(query, [userId, cutoffStr]);
      return rows;
    } catch (err) {
      console.error('User attendance error:', err);
      return [];
    }
  }
};

module.exports = Attendance;

