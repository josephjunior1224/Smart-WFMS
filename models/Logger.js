// models/Logger.js - System Log Model & CRUD Service
const mongoose = require('mongoose');
const db = require('../db');

const logSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now, index: true },
  level: { type: String, enum: ['error', 'warn', 'info', 'debug'], default: 'info' },
  message: { type: String, required: true },
  metadata: { type: mongoose.Schema.Types.Mixed },
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: { type: String },
  ip_address: { type: String },
  user_agent: { type: String },
  annotation: { type: String },
  annotated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  deleted: { type: Boolean, default: false },
  deleted_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

const Logger = mongoose.model('Log', logSchema);

module.exports = {
  Logger,
  getRecentLogs(limit = 100, filters = {}, pagination = {}) {
    const query = { deleted: false, ...filters };
    return Logger.find(query)
      .populate('user_id', 'name email')
      .populate('annotated_by', 'name')
      .populate('deleted_by', 'name')
      .sort({ timestamp: -1 })
      .limit(limit)
      .skip(pagination.page ? (pagination.page - 1) * 100 : 0);
  },
  async annotateLog(id, annotation, userId) {
    return Logger.findByIdAndUpdate(id, { annotation, annotated_by: userId }, { new: true });
  },
  async deleteLog(id, userId) {
    return Logger.findByIdAndUpdate(id, { deleted: true, deleted_by: userId }, { new: true });
  },
  async purgeOld(days = 90) {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const result = await Logger.deleteMany({ timestamp: { $lt: cutoff }, deleted: true });
    return result;
  },
  async exportLogs(filters) {
    const logs = await Logger.find({ deleted: false, ...filters }).sort({ timestamp: -1 }).lean();
    return logs;
  },
  audit(action, userId, resource, details) {
    const log = new Logger({
      level: 'info',
      action,
      user_id: userId,
      resource,
      metadata: details
    });
    log.save();
  }
};

