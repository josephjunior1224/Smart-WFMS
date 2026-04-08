// models/Team.js - Complete Team Management Model
const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema({
  // Basic Info
  name: { type: String, required: true, unique: true },
  description: { type: String, default: '' },
  department: { type: String, default: '' },
  costCenter: { type: String, default: '' },
  
  // Leadership
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  teamLead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assistantLead: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Members
  members: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['member', 'lead', 'assistant', 'trainer'], default: 'member' },
    joined_at: { type: Date, default: Date.now },
    status: { type: String, enum: ['active', 'inactive', 'transferred'], default: 'active' }
  }],
  
  // Shift & Schedule Rules
  defaultShiftPattern: {
    startTime: { type: String, default: '09:00' },
    endTime: { type: String, default: '17:00' },
    breakDuration: { type: Number, default: 30 }, // minutes
    workDays: [{ type: Number, enum: [0,1,2,3,4,5,6] }] // 0=Sunday, 6=Saturday
  },
  
  schedulingRules: {
    minStaffPerShift: { type: Number, default: 1 },
    maxOvertimeHours: { type: Number, default: 10 },
    shiftSwapApprovalRequired: { type: Boolean, default: true },
    timeOffRequestLeadDays: { type: Number, default: 14 }
  },
  
  // Metadata
  status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active' },
  location: { type: String, default: '' },
  timezone: { type: String, default: 'UTC' },
  
  // Statistics (denormalized for quick access)
  stats: {
    memberCount: { type: Number, default: 0 },
    activeMemberCount: { type: Number, default: 0 },
    averageAttendance: { type: Number, default: 0 },
    averagePerformance: { type: Number, default: 0 }
  },
  
  // Audit
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now },
  updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updated_at: { type: Date, default: Date.now }
});

// Indexes
teamSchema.index({ name: 1 });
teamSchema.index({ department: 1 });
teamSchema.index({ manager: 1 });
teamSchema.index({ status: 1 });

// Methods
teamSchema.methods.addMember = async function(userId, role = 'member') {
  if (!this.members.some(m => m.user_id.toString() === userId.toString())) {
    this.members.push({ user_id: userId, role, joined_at: new Date() });
    this.stats.memberCount = this.members.length;
    this.stats.activeMemberCount = this.members.filter(m => m.status === 'active').length;
    await this.save();
  }
  return this;
};

teamSchema.methods.removeMember = async function(userId) {
  this.members = this.members.filter(m => m.user_id.toString() !== userId.toString());
  this.stats.memberCount = this.members.length;
  this.stats.activeMemberCount = this.members.filter(m => m.status === 'active').length;
  await this.save();
  return this;
};

teamSchema.methods.updateMemberRole = async function(userId, newRole) {
  const member = this.members.find(m => m.user_id.toString() === userId.toString());
  if (member) {
    member.role = newRole;
    await this.save();
  }
  return this;
};

const Team = mongoose.model('Team', teamSchema);
module.exports = Team;