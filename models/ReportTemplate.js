// models/ReportTemplate.js - Shared "Use Template" System
// Supports scheduling/attendance/analytics/team templates

const mongoose = require('mongoose');
const { AnalyticsService } = require('./Analytics');
const Logger = require('./Logger');

const reportTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    enum: ['schedule_shift', 'attendance_rules', 'performance_report', 'team_structure', 'approval_workflow'],
    required: true,
    index: true
  },
  module: { 
    type: String, 
    enum: ['scheduling', 'attendance', 'analytics', 'teams'],
    required: true 
  },
  description: String,
  
  // Template configuration (flexible)
  config: { 
    type: mongoose.Schema.Types.Mixed, 
    required: true,
    example: {
      // Example: Weekly Adherence Report
      period_type: 'week',
      metrics: ['adherence_pct', 'absenteeism_rate', 'ot_hours', 'late_arrivals'],
      filters: { team_ids: [], department: null },
      charts: ['bar_adherence', 'pie_ot', 'table_top_performers'],
      compare_periods: true // WoW/MoM
      
      // Example: Night Shift Schedule
      // shifts: [{ start: '22:00', end: '06:00', roles: ['agent'] }],
      // breaks: [{ duration: 30, stagger: true }],
      // overtime_limit: 2
    }
  },
  
  preview_data: String, // Cached preview PNG/HTML
  is_public: { type: Boolean, default: false },
  used_count: { type: Number, default: 0 },
  last_used: Date,
  
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  categories: [String] // 'HR', 'Operations', 'Finance'
}, {
  timestamps: true
});

// Indexes
reportTemplateSchema.index({ type: 1, module: 1 });
reportTemplateSchema.index({ is_public: 1, used_count: -1 });
reportTemplateSchema.index({ categories: 1 });

reportTemplateSchema.statics.useTemplate = async function(templateId, overrides = {}) {
  const template = await this.findById(templateId).populate('created_by', 'name');
  if (!template) throw new Error('Template not found');
  
  Logger.audit('template_used', null, null, { 
    template_id: templateId, 
    type: template.type,
    overrides 
  }, null, 'analytics');
  
  template.used_count += 1;
  template.last_used = new Date();
  await template.save();
  
  // Dispatch to appropriate service
  switch (template.module) {
    case 'analytics':
      return AnalyticsService.generateReport(template.config, overrides);
    case 'scheduling':
      return generateScheduleFromTemplate(template.config, overrides);
    case 'attendance':
      return applyAttendanceRules(template.config, overrides);
    case 'teams':
      return createTeamFromTemplate(template.config, overrides);
    default:
      throw new Error(`Unsupported module: ${template.module}`);
  }
};

// Preview generation (async)
reportTemplateSchema.methods.generatePreview = async function() {
  // Generate sample data visualization
  // TODO: Use Puppeteer/chart.js for PNG preview
  this.preview_data = `<div>Preview for ${this.name}<br>Config: ${JSON.stringify(this.config, null, 2)}</div>`;
  await this.save();
};

// Static methods
reportTemplateSchema.statics.getTemplatesByType = async function(type, module) {
  return this.find({ type, module })
    .populate('created_by', 'name email')
    .sort({ used_count: -1, created_at: -1 });
};

reportTemplateSchema.statics.getPopularTemplates = async function(limit = 12) {
  return this.find({ is_public: true })
    .sort({ used_count: -1, created_at: -1 })
    .limit(limit)
    .populate('created_by', 'name');
};

const ReportTemplate = mongoose.model('ReportTemplate', reportTemplateSchema);
module.exports = ReportTemplate;

// Template helper functions (to be implemented per module)
async function generateScheduleFromTemplate(config, overrides) {
  // Implementation for schedule templates
  console.log('📅 Generating schedule from template:', config);
  return { success: true, schedules: [] };
}

async function applyAttendanceRules(config, overrides) {
  // Bulk update AttendanceLog rules
  console.log('📋 Applying attendance rules:', config);
  return { updated: 0 };
}

async function createTeamFromTemplate(config, overrides) {
  // Auto-populate Team with template structure
  console.log('👥 Creating team from template:', config);
  return { team: null };
}

