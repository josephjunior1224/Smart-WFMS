// models/TeamReport.js - Team Leader Reports
const mongoose = require('mongoose');

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
  timestamps: true
});

teamReportSchema.index({ team_id: 1, leader_id: 1, submitted_at: -1 });

module.exports = mongoose.model('TeamReport', teamReportSchema);

