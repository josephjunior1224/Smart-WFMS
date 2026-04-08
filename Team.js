// models/Team.js - Enhanced WFM Schema (Phase 1)
const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  // Core Attributes
  name: { type: String, required: true, unique: true },
  description: String,
  department: { type: String, default: 'General' },
  
  // Hierarchy & Management
  team_lead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // Section manager
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // WFM Attributes (Step 1)
  defaultSkillSet: [String], // e.g., ["English", "Billing", "CRM"]
  operatingHours: {
    start: String, // "07:00"
    end: String,   // "15:00"
    timezone: { type: String, default: 'local' }
  },
  shrinkageTarget: { type: Number, default: 20 }, // 20%
  serviceLevelGoal: {
    target: { type: Number, default: 80 },    // 80%
    threshold: { type: Number, default: 20 }  // 20 seconds
  },
  
  // Scheduling Rules (Step 3)
  minStaffPerInterval: { type: Number, default: 4 },
  schedulingRules: {
    breakRules: [{
      duration: Number,     // 15 mins
      frequency: String,    // "every 2 hours"
      stagger: Boolean      // No two agents same time
    }],
    mealRules: [{
      duration: Number,     // 30 mins
      stagger: Boolean
    }],
    overtimeLimit: { type: Number, default: 2 }, // hours/week
    timeOffApproval: { type: Boolean, default: true }
  },
  
  // Team Reports & Metrics (Step 6)
  team_reports: [{
    report_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamReport' },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    submitted_at: Date,
    approved_at: Date,
    leader_feedback: String
  }],
  
  // Audit Trail
  created_at: { type: Date, default: Date.now },
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: Date,
  status: { type: String, enum: ['active', 'inactive'], default: 'active' }
});

// Indexes for performance
teamSchema.index({ team_lead: 1 });
teamSchema.index({ 'members': 1 });
teamSchema.index({ department: 1 });
teamSchema.index({ 'team_reports.status': 1 });
teamSchema.index({ status: 1 });
teamSchema.index({ 'operatingHours.start': 1, 'operatingHours.end': 1 });

// Pre-save hook for updated_at
teamSchema.pre('save', function(next) {
  this.updated_at = new Date();
  next();
});

const Team = mongoose.model('Team', teamSchema);
module.exports = Team;

console.log('✅ Enhanced Team schema loaded (WFM attributes + rules)');

