const Issue = require('../models/Issue');
const User = require('../models/User');

const buildIssueMatch = (query = {}) => {
  const match = {
    ...(query.projectId ? { projectId: query.projectId } : {}),
  };
  if (query.state === 'open') match.status = { $ne: 'Done' };
  if (query.state === 'closed') match.status = 'Done';
  return match;
};

// GET /api/analytics/summary
// High-level counts for dashboard cards
const summary = async (req, res) => {
  try {
    const now = new Date();
    const match = buildIssueMatch(req.query);
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
      ...buildIssueMatch(req.query),
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
    const match = buildIssueMatch(req.query);
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
      ...buildIssueMatch(req.query),
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
      ...buildIssueMatch(req.query),
      isDeleted: { $ne: true },
    };
    const data = await Issue.aggregate([
      { $match: match },
      {
        $project: {
          status: 1,
          // Multi-assignee aware:
          // - if `assignees` exists and has values, count for each assignee
          // - else fall back to legacy `assignee`
          assigneeIds: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ['$assignees', []] } }, 0] },
              '$assignees',
              ['$assignee'],
            ],
          },
        },
      },
      { $unwind: { path: '$assigneeIds', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$assigneeIds',
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

// GET /api/analytics/dev-performance
// Developer-focused ticket ownership + transition activity.
const devPerformance = async (req, res) => {
  try {
    const match = buildIssueMatch(req.query);
    const issues = await Issue.find(match)
      .select('status assignee assignees lifeline')
      .lean();

    const userStats = new Map();
    const ensureUser = (userId) => {
      if (!userId) return null;
      const key = String(userId);
      if (!userStats.has(key)) {
        userStats.set(key, {
          userId: key,
          total: 0,
          done: 0,
          open: 0,
          statusMoves: 0,
        });
      }
      return userStats.get(key);
    };

    issues.forEach((issue) => {
      const assigneeIds = Array.isArray(issue.assignees) && issue.assignees.length > 0
        ? issue.assignees
        : issue.assignee
          ? [issue.assignee]
          : [];
      const uniqueIds = Array.from(new Set(assigneeIds.map((id) => String(id)).filter(Boolean)));

      const moveEvents = Math.max((Array.isArray(issue?.lifeline?.status) ? issue.lifeline.status.length : 0) - 1, 0);
      uniqueIds.forEach((uid) => {
        const stats = ensureUser(uid);
        if (!stats) return;
        stats.total += 1;
        stats.statusMoves += moveEvents;
        if (issue.status === 'Done') stats.done += 1;
        else stats.open += 1;
      });
    });

    const userIds = Array.from(userStats.keys());
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }, 'name email').lean()
      : [];
    const userById = new Map(users.map((u) => [String(u._id), u]));

    const developers = Array.from(userStats.values())
      .map((row) => ({
        ...row,
        name: userById.get(row.userId)?.name || 'Unknown',
        email: userById.get(row.userId)?.email || '',
      }))
      .sort((a, b) => b.done - a.done || b.total - a.total);

    const selectedUserId = req.query.userId ? String(req.query.userId) : '';
    const selected = selectedUserId ? developers.find((d) => d.userId === selectedUserId) || null : null;

    res.json({ developers, selected });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/analytics/moving-tickets
// Tickets with most status transitions.
const movingTickets = async (req, res) => {
  try {
    const match = buildIssueMatch(req.query);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 50);
    const issues = await Issue.find(match)
      .select('title status priority lifeline projectId assignees assignee')
      .populate('projectId', 'name key')
      .populate('assignee', 'name')
      .populate('assignees', 'name')
      .lean();

    const rows = issues
      .map((issue) => {
        const moves = Math.max((Array.isArray(issue?.lifeline?.status) ? issue.lifeline.status.length : 0) - 1, 0);
        const assigneeNames = Array.isArray(issue.assignees) && issue.assignees.length > 0
          ? issue.assignees.map((u) => u?.name).filter(Boolean)
          : issue.assignee?.name
            ? [issue.assignee.name]
            : [];
        return {
          issueId: String(issue._id),
          title: issue.title || 'Untitled',
          status: issue.status || 'Todo',
          priority: issue.priority || 'Medium',
          project: issue.projectId?.name || '',
          projectKey: issue.projectId?.key || '',
          assignees: assigneeNames,
          moves,
        };
      })
      .sort((a, b) => b.moves - a.moves || a.title.localeCompare(b.title))
      .slice(0, limit);

    res.json(rows);
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
  devPerformance,
  movingTickets,
};

