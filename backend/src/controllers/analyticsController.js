const Issue = require('../models/Issue');

// GET /api/analytics/summary
// High-level counts for dashboard cards
const summary = async (req, res) => {
  try {
    const now = new Date();
    const match = req.query.projectId ? { projectId: req.query.projectId } : {};
    const [total, done, open, overdue] = await Promise.all([
      Issue.countDocuments(match),
      Issue.countDocuments({ ...match, status: 'Done' }),
      Issue.countDocuments({ ...match, status: { $ne: 'Done' } }),
      Issue.countDocuments({
        ...match,
        status: { $ne: 'Done' },
        dueDate: { $type: 'date', $lt: now },
      }),
    ]);
    res.json({ total, done, open, overdue });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/analytics/tasks-per-day
// Count issues completed per day (based on completedAt)
const tasksPerDay = async (req, res) => {
  try {
    const match = {
      completedAt: { $type: 'date' },
      ...(req.query.projectId ? { projectId: req.query.projectId } : {}),
    };
    const data = await Issue.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            y: { $year: '$completedAt' },
            m: { $month: '$completedAt' },
            d: { $dayOfMonth: '$completedAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          date: {
            $dateFromParts: { year: '$_id.y', month: '$_id.m', day: '$_id.d' },
          },
          count: 1,
        },
      },
      { $sort: { date: 1 } },
    ]);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/analytics/status
// Status distribution
const statusDistribution = async (req, res) => {
  try {
    const match = {
      ...(req.query.projectId ? { projectId: req.query.projectId } : {}),
    };
    if (req.query.state === 'open') match.status = { $ne: 'Done' };
    if (req.query.state === 'closed') match.status = 'Done';
    const data = await Issue.aggregate([
      { $match: match },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $project: { _id: 0, status: '$_id', count: 1 } },
      { $sort: { status: 1 } },
    ]);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/analytics/avg-completion-time
// Average completion time in hours (completedAt - createdAt)
const avgCompletionTime = async (req, res) => {
  try {
    const match = {
      completedAt: { $type: 'date' },
      ...(req.query.projectId ? { projectId: req.query.projectId } : {}),
    };
    const data = await Issue.aggregate([
      { $match: match },
      {
        $project: {
          diffMs: { $subtract: ['$completedAt', '$createdAt'] },
        },
      },
      {
        $group: {
          _id: null,
          avgMs: { $avg: '$diffMs' },
        },
      },
      {
        $project: {
          _id: 0,
          avgHours: { $divide: ['$avgMs', 1000 * 60 * 60] },
        },
      },
    ]);
    res.json(data[0] || { avgHours: 0 });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/analytics/workload-per-user
// Open issues per assignee
const workloadPerUser = async (req, res) => {
  try {
    const match = {
      ...(req.query.projectId ? { projectId: req.query.projectId } : {}),
    };
    if (req.query.state === 'open') match.status = { $ne: 'Done' };
    if (req.query.state === 'closed') match.status = 'Done';
    const data = await Issue.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$assignee',
          openCount: { $sum: { $cond: [{ $ne: ['$status', 'Done'] }, 1, 0] } },
          doneCount: { $sum: { $cond: [{ $eq: ['$status', 'Done'] }, 1, 0] } },
          totalCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: '$user.name',
          email: '$user.email',
          openCount: 1,
          doneCount: 1,
          totalCount: 1,
        },
      },
      { $sort: { totalCount: -1 } },
    ]);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  summary,
  tasksPerDay,
  statusDistribution,
  avgCompletionTime,
  workloadPerUser,
};

