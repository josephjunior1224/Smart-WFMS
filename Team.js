// models/Team.js
const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  department: { type: String, default: 'General' },
  team_lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  team_reports: [{
    report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamReport' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    submitted_at: Date,
    approved_at: Date,
    leader_feedback: String
  }],
  created_at: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
});

teamSchema.index({ team_lead: 1 });
teamSchema.index({ 'members': 1 });
teamSchema.index({ 'team_reports.status': 1 });

const Team = mongoose.model('Team', teamSchema);
module.exports = Team;