const Issue = require('../models/Issue');
const Project = require('../models/Project');
const User = require('../models/User');
const { createAndDispatchNotification } = require('./notificationService');
const { NOTIFICATION_EVENTS } = require('./notificationEvents');

const ACTIVE_STATUSES = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing'];
const WORKLOAD_ALERT_THRESHOLD = Number(process.env.WORKLOAD_ALERT_THRESHOLD || 8);

const uniqueIds = (ids) => Array.from(new Set((ids || []).filter(Boolean).map((value) => String(value))));

const getIssueAssigneeIds = (issue) => {
  const assignees = Array.isArray(issue?.assignees) && issue.assignees.length > 0
    ? issue.assignees
    : issue?.assignee
      ? [issue.assignee]
      : [];
  return uniqueIds(assignees.map((assignee) => (assignee?._id ? assignee._id : assignee)));
};

const parseMentionNames = (content) => {
  if (!content) return [];
  const matches = String(content).match(/@([a-zA-Z0-9._-]+)/g) || [];
  return uniqueIds(matches.map((token) => token.slice(1).toLowerCase()));
};

const resolveMentionedUserIds = async (project, content) => {
  const mentionNames = parseMentionNames(content);
  if (mentionNames.length === 0) return [];

  const candidateIds = uniqueIds([
    project?.createdBy?._id || project?.createdBy,
    ...(project?.leads || []).map((lead) => lead?._id || lead),
    ...(project?.members || []).map((member) => member?._id || member),
  ]);
  if (candidateIds.length === 0) return [];

  const users = await User.find({ _id: { $in: candidateIds } }, 'name').lean();
  return uniqueIds(
    users
      .filter((user) => mentionNames.includes(String(user.name || '').toLowerCase()))
      .map((user) => user._id)
  );
};

const getProjectManagerIds = async (projectId) => {
  const project = await Project.findById(projectId).populate('createdBy leads members', 'role').lean();
  if (!project) return [];

  const candidateIds = uniqueIds([
    project.createdBy?._id || project.createdBy,
    ...(project.leads || []).map((lead) => lead?._id || lead),
    ...(project.members || []).map((member) => member?._id || member),
  ]);
  if (candidateIds.length === 0) return [];

  const users = await User.find({ _id: { $in: candidateIds } }, 'role').lean();
  return uniqueIds(
    users
      .filter((user) => ['admin', 'manager'].includes(String(user.role || '').toLowerCase()))
      .map((user) => user._id)
  );
};

const sendWorkloadAlertsIfNeeded = async (issue, actorId) => {
  const assigneeIds = getIssueAssigneeIds(issue);
  if (assigneeIds.length === 0) return;

  const managerIds = await getProjectManagerIds(issue.projectId?._id || issue.projectId);

  for (const assigneeId of assigneeIds) {
    const activeCount = await Issue.countDocuments({
      $or: [{ assignee: assigneeId }, { assignees: assigneeId }],
      status: { $in: ACTIVE_STATUSES },
    });
    if (activeCount < WORKLOAD_ALERT_THRESHOLD) continue;

    const message = `Workload alert: you have ${activeCount} active tasks.`;
    await createAndDispatchNotification({
      userId: assigneeId,
      type: 'WORKLOAD_ALERT',
      priority: 'high',
      message,
      link: `/project/${issue.projectId?._id || issue.projectId}`,
      metadata: {
        taskId: issue._id,
        projectId: issue.projectId?._id || issue.projectId,
        actorId,
        dedupeKey: `workload:${assigneeId}:${new Date().toISOString().slice(0, 10)}`,
      },
      dedupeWindowMs: 6 * 60 * 60 * 1000,
    });

    for (const managerId of managerIds) {
      if (String(managerId) === String(assigneeId)) continue;
      await createAndDispatchNotification({
        userId: managerId,
        type: 'ROLE_ALERT',
        priority: 'high',
        message: `Team workload alert: user has ${activeCount} active tasks.`,
        link: `/project/${issue.projectId?._id || issue.projectId}`,
        metadata: {
          taskId: issue._id,
          projectId: issue.projectId?._id || issue.projectId,
          actorId,
          dedupeKey: `manager-workload:${managerId}:${assigneeId}:${new Date().toISOString().slice(0, 10)}`,
        },
        dedupeWindowMs: 6 * 60 * 60 * 1000,
      });
    }
  }
};

const processNotificationEvent = async (eventType, payload = {}) => {
  const actorId = payload.actorId ? String(payload.actorId) : null;
  const issueId = payload.issueId || payload.taskId;
  const issue = issueId
    ? await Issue.findById(issueId).populate('assignee assignees reporter projectId')
    : null;
  if (!issue) return;

  const projectId = issue.projectId?._id || issue.projectId;
  const project = await Project.findById(projectId).populate('createdBy leads members', 'name role');
  const assigneeIds = getIssueAssigneeIds(issue);
  const reporterId = issue.reporter?._id ? String(issue.reporter._id) : String(issue.reporter || '');
  const watcherIds = uniqueIds([
    ...(payload.watcherIds || []),
    project?.createdBy?._id || project?.createdBy,
    ...(project?.leads || []).map((lead) => lead?._id || lead),
  ]);

  let recipients = [];
  let priority = issue.priority === 'Critical' ? 'critical' : issue.priority === 'High' ? 'high' : 'medium';
  let message = '';
  let type = eventType;

  if (eventType === NOTIFICATION_EVENTS.TASK_ASSIGNED) {
    recipients = assigneeIds;
    message = `Task assigned: ${issue.title}`;
    type = 'TASK_ASSIGNED';
  } else if (eventType === NOTIFICATION_EVENTS.TASK_UPDATED) {
    recipients = uniqueIds([reporterId, ...assigneeIds, ...watcherIds]);
    message = `Task updated: ${issue.title}`;
    type = 'TASK_UPDATED';
  } else if (eventType === NOTIFICATION_EVENTS.COMMENT_ADDED) {
    recipients = uniqueIds([reporterId, ...assigneeIds, ...watcherIds]);
    message = `New comment on task: ${issue.title}`;
    type = 'COMMENT_ADDED';

    const mentionedUserIds = await resolveMentionedUserIds(project, payload.commentContent || '');
    for (const mentionedUserId of mentionedUserIds) {
      if (String(mentionedUserId) === actorId) continue;
      await createAndDispatchNotification({
        userId: mentionedUserId,
        type: 'MENTION',
        priority,
        message: `You were mentioned on task: ${issue.title}`,
        link: `/project/${projectId}`,
        metadata: {
          taskId: issue._id,
          projectId,
          commentId: payload.commentId,
          actorId,
        },
      });
    }
  } else if (eventType === NOTIFICATION_EVENTS.TASK_OVERDUE) {
    const managerIds = await getProjectManagerIds(projectId);
    recipients = uniqueIds([...assigneeIds, ...managerIds]);
    message = `Task overdue: ${issue.title}`;
    type = 'TASK_OVERDUE';
    priority = 'critical';
  } else {
    return;
  }

  const filteredRecipients = recipients.filter((recipientId) => String(recipientId) !== String(actorId));
  console.log(`[notification-event] type=${eventType} task=${issue._id} recipients=${filteredRecipients.length}`);

  for (const recipientId of filteredRecipients) {
    const isOverdueAlert = type === 'TASK_OVERDUE';
    await createAndDispatchNotification({
      userId: recipientId,
      type,
      priority,
      message,
      link: `/project/${projectId}`,
      metadata: {
        taskId: issue._id,
        projectId,
        commentId: payload.commentId,
        actorId,
        dedupeKey: isOverdueAlert
          ? `overdue:${issue._id}:${recipientId}:${new Date().toISOString().slice(0, 10)}`
          : null,
      },
      dedupeWindowMs: isOverdueAlert ? 24 * 60 * 60 * 1000 : 0,
    });
  }

  await sendWorkloadAlertsIfNeeded(issue, actorId);
};

module.exports = {
  processNotificationEvent,
  NOTIFICATION_EVENTS,
};
