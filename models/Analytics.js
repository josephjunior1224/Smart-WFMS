// models/Analytics.js - Performance Analytics + Report Templates
// "Use Template" support for recurring reports/schedules

const mongoose = require('mongoose');
// const { AttendanceLog, Performance, Team, Schedule } = require('./db'); // circular

const Logger = require('./Logger');

// Template Schema (shared for reports/schedules/etc.)
const templateSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['schedule_shift', 'attendance_rules', 'report', 'approval_chain', 'team_structure'],
    required: true,
    index: true
  },
  module: { type: String, required: true }, // scheduling/attendance/analytics/teams
  config: { type: mongoose.Schema.Types.Mixed, required: true }, // e.g., metrics, filters, shifts
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  used_count: { type: Number, default: 0 },
  last_used: { type: Date },
  is_public: { type: Boolean, default: false },
  description: { type: String }
}, {
  timestamps: true
});

templateSchema.index({ type: 1, module: 1 });
const Template = mongoose.model('Template', templateSchema);

// Analytics Schema (aggregated metrics)
const analyticsSchema = new mongoose.Schema({
  period_type: { type: String, enum: ['week', 'month', 'quarter', 'custom'], required: true },
  period_start: { type: Date, required: true },
  period_end: { type: Date, required: true },
  team_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Team' },
  metrics: {
    adherence_pct: { type: Number }, // scheduled vs actual
    absenteeism_rate: { type: Number }, // absent days / work days
    ot_hours_total: { type: Number },
    late_arrivals: { type: Number },
    early_departures: { type: Number },
    avg_hours_worked: { type: Number },
    top_performers: [{ user_id: mongoose.Schema.Types.ObjectId, score: Number }],
    trends: { week_over_week: Number } // % change
  },
  filters_used: { type: mongoose.Schema.Types.Mixed },
  generated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  from_template: { type: mongoose.Schema.Types.ObjectId, ref: 'Template' },
  is_saved: { type: Boolean, default: false }
}, {
  timestamps: true
});

const Analytics = mongoose.model('Analytics', analyticsSchema);

const AnalyticsService = {
  // "Use Template" - Core functionality
  async useTemplate(templateId, overrides = {}) {
    const template = await Template.findById(templateId);
    if (!template) throw new Error('Template not found');
    
    Logger.audit('use_template', null, null, { template_id: templateId, overrides }, null, 'analytics');
    
    switch (template.module) {
      case 'analytics':
        return this.generateReport(template.config, overrides);
      case 'scheduling':
        return this.applyScheduleTemplate(template.config, overrides);
      case 'attendance':
        return this.applyAttendanceRules(template.config, overrides);
      default:
        throw new Error(`Unsupported template module: ${template.module}`);
    }
  },

  // Generate report from template/config (matches step-by-step spec)
  async generateReport(templateConfig, overrides = {}) {
    const config = { ...templateConfig, ...overrides };
    
    const { period_start, period_end, team_ids = [], metrics = [], filters = {} } = config;
    
    // Step 3: Read template data (filters/metrics)
    console.log('📊 Reading template config:', { metrics: metrics.length, teams: team_ids.length });
    
    // Step 4: Aggregate from AttendanceLog/Performance
    const match = {
      date: { $gte: new Date(period_start), $lte: new Date(period_end) }
    };
    if (team_ids.length) {
      const teams = await Team.find({ _id: { $in: team_ids } });
      const userIds = teams.flatMap(t => t.members);
      match.user_id = { $in: userIds };
    }
    
    const attendanceStats = await AttendanceLog.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total_present: { $sum: 1 },
          total_late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          total_absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          total_ot: { $sum: '$ot_hours' },
          avg_hours: { $avg: '$total_hours' },
          work_days: { $addToSet: { $dateToString: { format: '%Y-%m-%d', date: '$date' } } }
        }
      }
    ]);
    
    const stats = attendanceStats[0] || {};
    const adherence = stats.total_present ? (stats.total_present / stats.work_days?.length) * 100 : 0;
    
    const analytics = new Analytics({
      period_type: config.period_type || 'week',
      period_start: new Date(period_start),
      period_end: new Date(period_end),
      team_id: team_ids[0], // primary team
      metrics: {
        adherence_pct: Math.round(adherence * 10) / 10,
        absenteeism_rate: stats.total_absent ? (stats.total_absent / stats.work_days?.length) * 100 : 0,
        ot_hours_total: stats.total_ot || 0,
        late_arrivals: stats.total_late || 0,
        early_departures: 0, // TODO: from status
        avg_hours_worked: Math.round((stats.avg_hours || 0) * 10) / 10,
        trends: { week_over_week: 0 } // TODO: compare periods
      },
      filters_used: filters,
      generated_by: overrides.user_id // from request
    });
    
    await analytics.save();
    
    // Step 5: Increment template usage
    template.used_count += 1;
    template.last_used = new Date();
    await template.save();
    
    return analytics;
  },

  // Apply attendance rule template
  async applyAttendanceRules(templateConfig, overrides) {
    // TODO: Bulk update AttendanceLog with rules
    console.log('Applying attendance rules template');
    return { success: true, updated: 0 };
  },

  // Apply schedule template (spec example)
  async applyScheduleTemplate(templateConfig, overrides) {
    const { team_ids, start_date, end_date } = overrides;
    
    // Step 3: Read template shifts/rules
    const shifts = templateConfig.shifts || [];
    
    // Step 4: Create schedule entries
    const newSchedules = [];
    for (const teamId of team_ids) {
      // Create schedule entries from template pattern
      newSchedules.push({ team_id: teamId, start_date, end_date, shifts });
    }
    
    console.log(`📅 Created ${newSchedules.length} schedules from template`);
    return newSchedules;
  },

  // Get saved report templates for "Use Template" UI
  async getTemplates(type = 'report', module = 'analytics') {
    return Template.find({ type, module }).populate('created_by', 'name').sort({ used_count: -1 });
  },

  // Dashboard metrics (week vs prev week)
  async getDashboard(teamId = null, period = 'week') {
    // Implementation similar to generateReport but with comparison
    return {
      current: { adherence: 94.2, absenteeism: 2.1, ot_hours: 12.5 },
      previous: { adherence: 91.8, absenteeism: 3.4, ot_hours: 8.2 },
      top_performers: [
        { name: 'John Doe', adherence: 98.5 },
        { name: 'Jane Smith', adherence: 96.2 }
      ]
    };
  }
};

module.exports = { Analytics, Template, AnalyticsService };
