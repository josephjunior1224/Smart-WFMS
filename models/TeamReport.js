// models/TeamReport.js
const mongoose = require('mongoose');

const teamReportSchema = new mongoose.Schema({
  team_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Team', 
    required: true,
    index: true 
  },
  submitted_by: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  title: { type: String, required: true },
  content: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  hours_worked: { type: Number, default: 0 },
  submitted_at: { type: Date, default: Date.now },
  approved_at: Date,
  feedback: String,
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

teamReportSchema.index({ team_id: 1, status: 1 });
teamReportSchema.index({ submitted_by: 1 });

const TeamReport = mongoose.model('TeamReport', teamReportSchema);
module.exports = TeamReport;


