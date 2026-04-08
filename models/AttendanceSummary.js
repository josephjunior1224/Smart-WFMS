// models/AttendanceSummary.js
const mongoose = require('mongoose');

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

attendanceSummarySchema.index({ weekStart: 1, team_id: 1 });
attendanceSummarySchema.index({ weekStart: -1 });

module.exports = mongoose.model('AttendanceSummary', attendanceSummarySchema);