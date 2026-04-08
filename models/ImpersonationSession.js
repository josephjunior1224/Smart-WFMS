// models/ImpersonationSession.js
const mongoose = require('mongoose');

const impersonationSessionSchema = new mongoose.Schema({
  admin_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  target_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  admin_name: { type: String, required: true },
  target_user_name: { type: String, required: true },
  
  action: { type: String, enum: ['START', 'END', 'FORCE_TERMINATE'], required: true },
  timestamp: { type: Date, default: Date.now },
  ended_at: Date,
  
  ip_address: { type: String, required: true },
  reason: { type: String, required: true },
  
  duration_seconds: { type: Number, default: 0 },
  actions_performed: [{ type: String }],
  
  mfa_verified: { type: Boolean, default: false },
  session_token: { type: String, unique: true },
  is_active: { type: Boolean, default: true },
  
  ended_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  force_terminated: { type: Boolean, default: false },
  target_notification_sent: { type: Boolean, default: false }
}, { timestamps: true });

impersonationSessionSchema.index({ admin_id: 1, is_active: 1 });
impersonationSessionSchema.index({ target_user_id: 1, is_active: 1 });
impersonationSessionSchema.index({ timestamp: -1 });

module.exports = mongoose.model('ImpersonationSession', impersonationSessionSchema);