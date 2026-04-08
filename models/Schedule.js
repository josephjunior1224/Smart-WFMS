// models/Schedule.js - WFM Scheduling (Phase 1)
const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  // Links
  team_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Team', 
    required: true,
    index: true 
  },
  generated_for_period: {
    start: { type: Date, required: true },  // Week/Month start
    end: { type: Date, required: true }     // Week/Month end
  },
  
  // Schedule Generation
  status: { 
    type: String, 
    enum: ['draft', 'generated', 'optimized', 'approved', 'published'], 
    default: 'draft' 
  },
  generated_at: { type: Date, default: Date.now },
  optimized_at: Date,
  approved_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Team Coverage (Step 4)
  staffingForecast: [{
    interval: String,     // "2024-01-15T10:00:00"
    forecastedVolume: Number,
    requiredStaff: Number,
    scheduledStaff: Number,
    coverageGap: Number
  }],
  
  // Individual Agent Shifts
  agentShifts: [{
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    shift: {
      start: Date,
      end: Date,
      breaks: [{ start: Date, end: Date, type: String }], // "short_break", "lunch"
      totalHours: Number
    },
    assignedSkills: [String],
    adherence: {
      scheduled: Number,    // % on schedule
      actual: Number,
      exceptions: [String]  // "early logout", "late arrival"
    }
  }],
  
  // Optimization Results
  optimizationScore: Number,  // 92.5 (higher = better)
  violations: [{
    type: String,         // "understaffed", "overtime"
    interval: String,
    severity: String      // "warning", "critical"
  }],
  
  // Real-time Intraday (Step 5)
  intradayAdjustments: [{
    agent_id: mongoose.Schema.Types.ObjectId,
    adjustment: String,   // "break_delayed_30m"
    timestamp: Date,
    approved_by: mongoose.Schema.Types.ObjectId
  }]
}, {
  timestamps: true
});

// Indexes for performance
scheduleSchema.index({ team_id: 1, status: 1 });
scheduleSchema.index({ 'generated_for_period.start': 1 });
scheduleSchema.index({ 'agentShifts.agent_id': 1 });
scheduleSchema.index({ optimizationScore: -1 });

const Schedule = mongoose.model('Schedule', scheduleSchema);
module.exports = Schedule;

console.log('✅ Schedule model created (forecasting, shifts, adherence, optimization)');

