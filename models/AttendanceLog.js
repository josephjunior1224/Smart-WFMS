// models/AttendanceLog.js - Full Attendance CRUD Schema
const mongoose = require('mongoose');
const { User } = require('../db');

const attendanceLogSchema = new mongoose.Schema({
  // Links
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true },

  // Date
  date: { type: Date, required: true, index: true }, // YYYY-MM-DD

  // Clock Times
  clock_in: { type: Date },
  clock_out: { type: Date },
  breaks_total: { type: Number, default: 0, min: 0 }, // minutes

  // Status (calculated)
  status: {
    type: String,
    enum: ['present', 'late', 'early', 'absent', 'partial', 'OT', 'manual'],
    default: 'present',
    index: true
  },
  late_minutes: { type: Number, default: 0, min: 0 },
  early_minutes: { type: Number, default: 0, min: 0 },
  ot_hours: { type: Number, default: 0, min: 0 },
  total_hours: { type: Number, default: 0, min: 0 },

  // Manual Entry
  is_manual: { type: Boolean, default: false },
  manual_reason: { type: String },

  // Exceptions/Approvals (Step C)
  exception_type: { type: String, enum: ['none', 'late_request', 'early_leave', 'forgot_punch', 'excused_absence'] },
  exception_notes: { type: String },
  approved: { type: Boolean, default: false },
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  approved_at: { type: Date },

  // Audit
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  modified_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  modification_reason: { type: String }, // "Corrected badge delay"

  notes: { type: String, default: '' }
}, {
  timestamps: true
});

// Indexes
attendanceLogSchema.index({ user_id: 1, date: 1 }, { unique: true });
attendanceLogSchema.index({ team_id: 1, date: 1 });
attendanceLogSchema.index({ date: 1 });
attendanceLogSchema.index({ status: 1 });
attendanceLogSchema.index({ approved: 1, is_manual: 1 });

// Virtuals
attendanceLogSchema.virtual('is_editable').get(function() {
  return this.approved !== false && !this.is_manual; // Don't edit auto-generated
});

attendanceLogSchema.virtual('week_of').get(function() {
  const start = new Date(this.date);
  start.setDate(start.getDate() - start.getDay() + 1); // Monday
  return start;
});

// Methods
attendanceLogSchema.methods.calculateHours = async function() {
  if (!this.clock_in || !this.clock_out) return 0;

  const totalMs = this.clock_out - this.clock_in;
  this.total_hours = totalMs / (36e5); // hours

  // Expected shift 09:00-17:00
  const expected_in = new Date(this.date);
  expected_in.setHours(9, 0, 0, 0);
  const expected_out = new Date(this.date);
  expected_out.setHours(17, 0, 0, 0);

  const lateMin = (this.clock_in - expected_in) / 6e4;
  const earlyMin = (expected_out - this.clock_out) / 6e4;

  this.late_minutes = Math.max(0, lateMin);
  this.early_minutes = Math.max(0, earlyMin);
  this.ot_hours = Math.max(0, this.total_hours - 8);

  if (lateMin > 15) this.status = 'late';
  else if (earlyMin > 15) this.status = 'early';
  else if (!this.clock_in && !this.clock_out) this.status = 'absent';
  else this.status = 'present';

  await this.save();
};

const AttendanceLog = mongoose.model('AttendanceLog', attendanceLogSchema);

module.exports = AttendanceLog;
console.log('✅ AttendanceLog model ready (full CRUD + exceptions)');

