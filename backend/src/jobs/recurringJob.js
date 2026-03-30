const cron = require('node-cron');
const Issue = require('../models/Issue');
const Notification = require('../models/Notification');
const RecurringSchedule = require('../models/RecurringSchedule');
const { getIO } = require('../socket');

const cloneChecklist = (checklist) => {
  if (!Array.isArray(checklist)) return [];
  return checklist.map((item) => ({
    text: item?.text || '',
    completed: Boolean(item?.completed),
  }));
};

const getTemplateStatus = (template) => template?.defaultStatus || 'Backlog';

const addInterval = (date, recurringType) => {
  const d = new Date(date);
  if (recurringType === 'daily') d.setDate(d.getDate() + 1);
  if (recurringType === 'weekly') d.setDate(d.getDate() + 7);
  if (recurringType === 'monthly') {
    // Preserve day as much as possible
    const day = d.getDate();
    d.setMonth(d.getMonth() + 1);
    // If month overflowed, revert to last day of month
    if (d.getDate() < day) d.setDate(0);
  }
  return d;
};

const emitIssueToRooms = async (issue) => {
  if (!issue?._id) return;
  const projectId = issue.projectId?._id ? issue.projectId._id : issue.projectId;
  const assigneeId = issue.assignee?._id ? issue.assignee._id : issue.assignee;
  const reporterId = issue.reporter?._id ? issue.reporter._id : issue.reporter;

  getIO().to(`project:${projectId}`).emit('issue:created', { issue });
  if (reporterId) getIO().to(`user:${reporterId}`).emit('issue:created', { issue });
  if (assigneeId && String(assigneeId) !== String(reporterId)) {
    getIO().to(`user:${assigneeId}`).emit('issue:created', { issue });
  }
};

function startRecurringJob() {
  // Every hour
  cron.schedule('0 * * * *', async () => {
    const now = new Date();

    try {
      const schedules = await RecurringSchedule.find({})
        .populate('templateId')
        .limit(500);

      const due = schedules.filter((s) => {
        if (!s.lastGeneratedAt) return true;
        const nextDue = addInterval(s.lastGeneratedAt, s.recurring);
        return nextDue.getTime() <= now.getTime();
      });

      if (due.length === 0) return;

      const issuesToInsert = [];
      const dueScheduleIds = [];

      for (const s of due) {
        const t = s.templateId;
        if (!t) continue;
        // Reference-based templates: generate from ticket references
        if (Array.isArray(t.tickets) && t.tickets.length > 0) {
          const orderedRefs = [...t.tickets].sort((a, b) => (a.order || 0) - (b.order || 0));
          const ticketIds = orderedRefs.map((r) => r.ticketId).filter(Boolean);
          if (ticketIds.length === 0) continue;

          const srcIssues = await Issue.find({ _id: { $in: ticketIds } }).lean();
          const byId = new Map(srcIssues.map((i) => [String(i._id), i]));

          orderedRefs.forEach((r) => {
            const src = byId.get(String(r.ticketId));
            if (!src) return;
            issuesToInsert.push({
              title: src.title,
              description: src.description,
              issueType: src.issueType || 'Task',
              status: 'Backlog',
              priority: src.priority || 'Medium',
              projectId: s.projectId,
              assignee: null,
              assignees: [],
              reporter: s.createdBy,
              labels: Array.isArray(src.labels) ? src.labels : [],
              checklist: Array.isArray(src.checklist) ? cloneChecklist(src.checklist) : [],
              dueDate: null,
              storyPoints: src.storyPoints,
              recurring: undefined,
              lastGeneratedAt: undefined,
              completedAt: undefined,
              createdAt: now,
              updatedAt: now,
            });
          });

          dueScheduleIds.push(s._id);
        }
      }

      const createdIssues = await Issue.insertMany(issuesToInsert, { ordered: false });
      const createdIds = createdIssues.map((i) => i._id);

      const populated = await Issue.find({ _id: { $in: createdIds } })
        .populate('assignee', 'name email avatar')
        .populate('assignees', 'name email avatar')
        .populate('reporter', 'name email avatar')
        .populate('projectId', 'name key');

      for (const issue of populated) {
        await emitIssueToRooms(issue);

        const assigneeId = issue.assignee?._id ? issue.assignee._id : issue.assignee;
        const reporterId = issue.reporter?._id ? issue.reporter._id : issue.reporter;
        if (assigneeId && reporterId && String(assigneeId) !== String(reporterId)) {
          const notification = await Notification.create({
            user: assigneeId,
            type: 'ISSUE_ASSIGNED',
            message: `You have been assigned to a new issue: ${issue.title}`,
            link: `/project/${issue.projectId}`,
          });
          try {
            getIO().to(`user:${assigneeId}`).emit('notification:new', { notification });
          } catch (e) {}
        }
      }

      await RecurringSchedule.updateMany(
        { _id: { $in: dueScheduleIds } },
        { $set: { lastGeneratedAt: now } }
      );
    } catch (e) {
      console.error('Recurring job failed:', e);
    }
  });
}

module.exports = { startRecurringJob };

