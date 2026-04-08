const mongoose = require('mongoose');

const impersonationSessionSchema = new mongoose.Schema({
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  target_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  admin_name: { type: String, required: true },
  target_user_name: { type: String, required: true },
  action: { 
    type: String, 
    enum: ['START', 'END', 'SWITCH', 'FORCE_TERMINATE'], 
    required: true,
    index: true 
  },
  timestamp: { type: Date, default: Date.now, index: true },
  ip_address: { type: String, required: true },
  reason: { type: String, required: true },
  duration_seconds: { type: Number },
  actions_performed: [{ type: String }],
  concurrent_sessions_blocked: { type: Boolean, default: false },
  mfa_verified: { type: Boolean, default: false },
  session_token: { type: String },
  is_active: { type: Boolean, default: false, index: true },
  ended_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  force_terminated: { type: Boolean, default: false },
  target_notification_sent: { type: Boolean, default: false }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

impersonationSessionSchema.index({ admin_id: 1, is_active: 1 });
impersonationSessionSchema.index({ target_user_id: 1, is_active: 1 });
impersonationSessionSchema.index({ timestamp: -1 });

impersonationSessionSchema.statics.startSession = async function(adminId, targetId, ip, reason) {
  const admin = await mongoose.model('User').findById(adminId);
  const target = await mongoose.model('User').findById(targetId);
  
  if (!admin || !target) throw new Error('User not found');
  if (admin.role !== 'admin') throw new Error('Admin access required');
  if (target.role === 'admin') throw new Error('Cannot impersonate admin');
  
  const session = new this({
    admin_id: adminId,
    target_user_id: targetId,
    admin_name: admin.name,
    target_user_name: target.name,
    action: 'START',
    ip_address: ip,
    reason,
    is_active: true,
    session_token: require('crypto').randomUUID()
  });
  
  await session.save();
  return session;
};

impersonationSessionSchema.statics.endSession = async function(sessionToken, adminId, force = false) {
  const session = await this.findOne({ session_token: sessionToken, admin_id: adminId });
  if (!session) throw new Error('Session not found');
  
  session.is_active = false;
  session.action = force ? 'FORCE_TERMINATE' : 'END';
  session.ended_by = adminId;
  session.duration_seconds = Math.floor((Date.now() - new Date(session.timestamp).getTime()) / 1000);
  
  await session.save();
  return session;
};

module.exports = mongoose.model('ImpersonationSession', impersonationSessionSchema);

