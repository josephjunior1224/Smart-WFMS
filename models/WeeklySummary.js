// models/WeeklySummary.js - Attendance Analytics
const mongoose = require('mongoose');
const AttendanceLog = require('./AttendanceLog');

const weeklySummarySchema = new mongoose.Schema({
  week_start: { type: Date, required: true, index: true },
  week_end: { type: Date, required: true },
  total_employees: { type: Number, default: 0 },
  present_days: { type: Number, default: 0 },
  late_arrivals: { type: Number, default: 0 },
  early_departures: { type: Number, default: 0 },
  absent_days: { type: Number, default: 0 },
  ot_hours: { type: Number, default: 0 },
  employee_stats: [{
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    total_hours: { type: Number, default: 0 },
    late_count: { type: Number, default: 0 },
    early_count: { type: Number, default: 0 },
    absent_days: { type: Number, default: 0 },
    ot_hours: { type: Number, default: 0 },
    status: { type: String, enum: ['excellent', 'good', 'warning', 'poor'] }
  }],
  generated_at: { type: Date, default: Date.now }
});

weeklySummarySchema.statics.getCurrentWeekStart = function() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  return monday;
};

weeklySummarySchema.statics.generateWeek = async function(weekStart, options = {}) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const match = {
    date: {
      $gte: weekStart,
      $lte: weekEnd
    }
  };

  if (options.team_id) match.team_id = options.team_id;
  if (options.department) match['user_id.department'] = options.department;

  // Aggregate raw data
  const stats = await AttendanceLog.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$user_id',
        total_hours: { $sum: '$total_hours' },
        late_count: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        early_count: { $sum: { $cond: [{ $eq: ['$status', 'early'] }, 1, 0] } },
        absent_days: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        ot_hours: { $sum: '$ot_hours' },
        present_days: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    { $unwind: '$user' },
    {
      $addFields: {
        status: {
          $switch: {
            branches: [
              { case: { $lt: ['$late_count', 1] }, then: 'excellent' },
              { case: { $lt: ['$late_count', 3] }, then: 'good' },
              { case: { $lt: ['$late_count', 5] }, then: 'warning' }
            ],
            default: 'poor'
          }
        }
      }
    }
  ]);

  const totals = stats.reduce((acc, s) => ({
    total_employees: acc.total_employees + 1,
    total_hours: acc.total_hours + (s.total_hours || 0),
    late_arrivals: acc.late_arrivals + s.late_count,
    early_departures: acc.early_departures + s.early_count,
    absent_days: acc.absent_days + s.absent_days,
    overtime_hours: acc.overtime_hours + s.ot_hours,
    present_days: acc.present_days + s.present_days
  }), { total_employees: 0, total_hours: 0, late_arrivals: 0, early_departures: 0, absent_days: 0, overtime_hours: 0, present_days: 0 });

  const summary = new this({
    week_start: weekStart,
    week_end: weekEnd,
    total_employees: totals.total_employees,
    total_hours: totals.total_hours,
    late_arrivals: totals.late_arrivals,
    early_departures: totals.early_departures,
    absent_days: totals.absent_days,
    ot_hours: totals.overtime_hours,
    employee_stats: stats
  });

  return summary.save();
};

weeklySummarySchema.statics.exportCSV = async function(summaryId) {
  const summary = await this.findById(summaryId).populate('employee_stats.user_id');
  if (!summary) throw new Error('Summary not found');

  let csv = 'Name,Department,Total Hours,Late Count,Early Count,Absent Days,OT Hours,Status\n';
  summary.employee_stats.forEach(stat => {
    csv += `"${stat.user_id.name}","${stat.user_id.department}",${stat.total_hours},${stat.late_count},${stat.early_count},${stat.absent_days},${stat.ot_hours},"${stat.status}"\n`;
  });

  return csv;
};

module.exports = mongoose.model('WeeklySummary', weeklySummarySchema);

