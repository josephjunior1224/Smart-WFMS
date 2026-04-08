// models/TeamMetrics.js - Performance Analytics (Phase 1)
const mongoose = require('mongoose');

const teamMetricsSchema = new mongoose.Schema({
  team_id: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Team', 
    required: true,
    unique: true 
  },
  
  // Step 6: Core WFM Metrics
  period: {
    start: { type: Date, required: true },
    end: { type: Date, required: true }
  },
  
  // Adherence (Step 5)
  adherence: {
    team_avg: { type: Number, default: 0 },     // 85%
    target: { type: Number, default: 85 },
    outliers: [{ agent_id: mongoose.Schema.Types.ObjectId, adherence: Number }]
  },
  
  // Service Level (Step 1)
  service_level: {
    achieved: { type: Number, default: 0 },     // 82%
    target: { type: Number, default: 80 },
    calls_answered_20s: Number,
    total_calls: Number,
    avg_wait_time: Number                      // seconds
  },
  
  // Occupancy
  occupancy: {
    actual: { type: Number, default: 0 },      // 92%
    target_min: { type: Number, default: 85 },
    target_max: { type: Number, default: 95 },
    idle_time_pct: Number
  },
  
  // Shrinkage (Step 1)
  shrinkage: {
    actual_pct: { type: Number, default: 0 },  // 18%
    planned_pct: { type: Number, default: 20 },
    breakdown: {
      breaks: { type: Number, default: 0 },
      training: { type: Number, default: 0 },
      meetings: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    }
  },
  
  // Step 7: Optimization Insights
  recommendations: [{
    type: String,     // "increase_staffing", "adjust_breaks"
    priority: String, // "high", "medium", "low"
    impact: Number    // estimated SL improvement %
  }],
  
  // Audit
  calculated_at: { type: Date, default: Date.now },
  source_schedule: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule' }
}, {
  timestamps: true
});

// Indexes for dashboard queries
teamMetricsSchema.index({ team_id: 1, 'period.start': -1 });
teamMetricsSchema.index({ 'adherence.team_avg': -1 });
teamMetricsSchema.index({ 'service_level.achieved': -1 });
teamMetricsSchema.index({ 'shrinkage.actual_pct': 1 });

const TeamMetrics = mongoose.model('TeamMetrics', teamMetricsSchema);
module.exports = TeamMetrics;

console.log('✅ TeamMetrics model created (adherence, SL, occupancy, shrinkage tracking)');

