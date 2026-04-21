const Issue = require('../models/Issue');
const Project = require('../models/Project');
const { getIO } = require('../socket');
const { processNotificationEvent, NOTIFICATION_EVENTS } = require('../services/notificationEngine');
const LABEL_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];

const populateIssueQuery = (query) =>
  query
    .populate('assignee', 'name email avatar')
    .populate('assignees', 'name email avatar')
    .populate('reporter', 'name email avatar')
    .populate('projectId', 'name key')
    .populate('dependencies', 'title status priority')
    .populate('checklist.assignee', 'name email avatar role')
    .populate('lifeline.assigned.assignee', 'name email avatar')
    .populate('lifeline.assigned.actor', 'name email avatar')
    .populate('lifeline.status.actor', 'name email avatar')
    .populate('lifeline.iterations.author', 'name email avatar');

const normalizeIssueAssigneeIds = (issueDoc) => {
  const rawAssignees = Array.isArray(issueDoc?.assignees) && issueDoc.assignees.length > 0
    ? issueDoc.assignees
    : issueDoc?.assignee
      ? [issueDoc.assignee]
      : [];
  return rawAssignees.map((a) => String(a?._id || a)).filter(Boolean);
};

const normalizeIssueLabels = (labels) => {
  if (!Array.isArray(labels)) return [];
  const normalized = labels
    .map((label) => {
      if (typeof label === 'string') {
        const text = label.trim();
        if (!text) return null;
        return { text, color: 'blue' };
      }
      const text = String(label?.text || '').trim();
      if (!text) return null;
      const color = LABEL_COLORS.includes(label?.color) ? label.color : 'blue';
      return { text, color };
    })
    .filter(Boolean);

  // keep unique by text+color to avoid duplicates
  const seen = new Set();
  return normalized.filter((label) => {
    const key = `${label.text.toLowerCase()}::${label.color}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeChecklist = (checklist) => {
  if (!Array.isArray(checklist)) return [];
  return checklist
    .map((item) => {
      const text = String(item?.text || '').trim();
      if (!text) return null;
      const assignee = item?.assignee?._id ? item.assignee._id : item?.assignee;
      return {
        text,
        completed: Boolean(item?.completed),
        assignee: assignee || null,
      };
    })
    .filter(Boolean);
};

const normalizeDependencyIds = (dependencyIds, issueIdToExclude) => {
  if (!Array.isArray(dependencyIds)) return [];
  const seen = new Set();
  return dependencyIds
    .map((dependencyId) => String(dependencyId?._id || dependencyId || '').trim())
    .filter((dependencyId) => {
      if (!dependencyId) return false;
      if (issueIdToExclude && String(issueIdToExclude) === dependencyId) return false;
      if (seen.has(dependencyId)) return false;
      seen.add(dependencyId);
      return true;
    });
};

const buildDependencyUpdateSummary = (issueTitle, addedIds = [], removedIds = [], titleById = new Map()) => {
  const addedCount = addedIds.length;
  const removedCount = removedIds.length;
  if (addedCount === 0 && removedCount === 0) return null;

  const formatTitles = (ids) => {
    const titles = ids
      .map((id) => titleById.get(String(id)))
      .filter(Boolean)
      .slice(0, 2);
    if (titles.length === 0) return null;
    return titles.join(', ');
  };

  const summaryParts = [];
  if (addedCount > 0) summaryParts.push(`+${addedCount}`);
  if (removedCount > 0) summaryParts.push(`-${removedCount}`);

  const detailParts = [];
  const addedTitles = formatTitles(addedIds);
  const removedTitles = formatTitles(removedIds);
  if (addedTitles) detailParts.push(`added: ${addedTitles}`);
  if (removedTitles) detailParts.push(`removed: ${removedTitles}`);

  const details = detailParts.length > 0 ? ` (${detailParts.join(' | ')})` : '';
  return `Dependencies updated (${summaryParts.join(', ')}) on task: ${issueTitle}${details}`;
};

// @desc    Get all issues for a project
// @route   GET /api/issues/project/:projectId
// @access  Private
const getIssuesByProject = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10), 1), 500);
    const skip = (page - 1) * limit;

    const issues = await populateIssueQuery(
      Issue.find({ projectId: req.params.projectId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
    );

    res.json(issues);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single issue
// @route   GET /api/issues/:id
// @access  Private
const getIssueById = async (req, res) => {
  try {
    const issue = await populateIssueQuery(Issue.findById(req.params.id));

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    res.json(issue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create an issue
// @route   POST /api/issues
// @access  Private
const createIssue = async (req, res) => {
  try {
    const {
      title,
      description,
      issueType,
      status,
      priority,
      projectId,
      assignee,
      assignees,
      labels,
      dueDate,
      storyPoints,
      riskLevel,
      dependencies,
      checklist,
    } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const assigneeIds = Array.isArray(assignees)
      ? assignees
      : assignee
        ? [assignee]
        : [];
    const normalizedAssignees = assigneeIds.filter(Boolean);

    const issue = new Issue({
      title,
      description,
      issueType,
      status,
      priority,
      projectId,
      assignee: normalizedAssignees.length > 0 ? normalizedAssignees[0] : null,
      assignees: normalizedAssignees,
      labels: normalizeIssueLabels(labels),
      riskLevel,
      dependencies: normalizeDependencyIds(dependencies, null),
      checklist: normalizeChecklist(checklist),
      dueDate,
      storyPoints,
      reporter: req.user._id,
      lifeline: {
        assigned: normalizedAssignees.map((assigneeId) => ({
          assignee: assigneeId,
          action: 'assigned',
          actor: req.user._id,
          changedAt: new Date(),
        })),
        status: [
          {
            from: null,
            to: status || 'Todo',
            actor: req.user._id,
            changedAt: new Date(),
          },
        ],
        iterations: [],
      },
    });

    const createdIssue = await issue.save();

    // Notification engine: assignment + workload/role-aware alerts.
    await processNotificationEvent(NOTIFICATION_EVENTS.TASK_ASSIGNED, {
      actorId: req.user._id,
      issueId: createdIssue._id,
    });

    // Return populated issue for creator UI consistency
    const populated = await populateIssueQuery(Issue.findById(createdIssue._id));

    const boardAssigneeIds = Array.isArray(populated.assignees) && populated.assignees.length > 0
      ? populated.assignees.map((a) => (a?._id ? a._id : a))
      : populated.assignee
        ? [populated.assignee?._id ? populated.assignee._id : populated.assignee]
        : [];
    const reporterId = populated.reporter?._id ? populated.reporter._id : populated.reporter;

    // Board updates
    getIO().to(`project:${projectId}`).emit('issue:created', { issue: populated });

    // User-centric updates
    if (reporterId) {
      getIO().to(`user:${reporterId}`).emit('issue:created', { issue: populated });
    }
    for (const aId of boardAssigneeIds) {
      if (!aId) continue;
      if (String(aId) !== String(reporterId)) {
        getIO().to(`user:${aId}`).emit('issue:created', { issue: populated });
      }
    }

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update an issue
// @route   PUT /api/issues/:id
// @access  Private
const updateIssue = async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    // Update fields
    const fieldsToUpdate = [
      'title',
      'description',
      'issueType',
      'status',
      'priority',
      'assignee',
      'assignees',
      'labels',
      'checklist',
      'dueDate',
      'storyPoints',
      'riskLevel',
      'dependencies',
    ];

    const oldAssignees = normalizeIssueAssigneeIds(issue);
    const oldDependencyIds = normalizeDependencyIds(issue.dependencies, issue._id);

    let assigneeChanged = false;
    let statusChanged = false;
    let hasMeaningfulUpdate = false;
    let oldStatus = issue.status;
    let dependencyChange = { addedIds: [], removedIds: [] };

    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        hasMeaningfulUpdate = true;
        if (field === 'assignee' && req.body[field] !== (issue.assignee ? issue.assignee.toString() : null)) {
           assigneeChanged = true;
        }
        if (field === 'assignees' && Array.isArray(req.body[field])) {
          const next = req.body[field].filter(Boolean).map(String);
          const old = oldAssignees.map(String);
          if (next.join(',') !== old.join(',')) {
            assigneeChanged = true;
          }
        }
        if (field === 'status' && req.body[field] !== issue.status) {
           statusChanged = true;
        }
        if (field === 'labels') {
          issue[field] = normalizeIssueLabels(req.body[field]);
        } else if (field === 'checklist') {
          issue[field] = normalizeChecklist(req.body[field]);
        } else if (field === 'dependencies') {
          const nextDependencyIds = normalizeDependencyIds(req.body[field], issue._id);
          const oldSet = new Set(oldDependencyIds.map(String));
          const nextSet = new Set(nextDependencyIds.map(String));
          const addedIds = nextDependencyIds.filter((id) => !oldSet.has(String(id)));
          const removedIds = oldDependencyIds.filter((id) => !nextSet.has(String(id)));
          dependencyChange = { addedIds, removedIds };
          issue[field] = nextDependencyIds;
        } else {
          issue[field] = req.body[field];
        }
      }
    });

    // Normalize: keep `assignee` and `assignees` consistent
    if (Array.isArray(issue.assignees)) {
      issue.assignees = issue.assignees.filter(Boolean);
      issue.assignee = issue.assignees.length > 0 ? issue.assignees[0] : null;
    } else {
      issue.assignees = issue.assignee ? [issue.assignee] : [];
    }

    const nextAssignees = normalizeIssueAssigneeIds(issue);
    if (!issue.lifeline || typeof issue.lifeline !== 'object') {
      issue.lifeline = { assigned: [], status: [], iterations: [] };
    }
    if (!Array.isArray(issue.lifeline.assigned)) issue.lifeline.assigned = [];
    if (!Array.isArray(issue.lifeline.status)) issue.lifeline.status = [];
    if (!Array.isArray(issue.lifeline.iterations)) issue.lifeline.iterations = [];

    if (assigneeChanged) {
      const oldSet = new Set(oldAssignees.map(String));
      const nextSet = new Set(nextAssignees.map(String));
      for (const assigneeId of nextSet) {
        if (!oldSet.has(String(assigneeId))) {
          issue.lifeline.assigned.push({
            assignee: assigneeId,
            action: 'assigned',
            actor: req.user._id,
            changedAt: new Date(),
          });
        }
      }
      for (const assigneeId of oldSet) {
        if (!nextSet.has(String(assigneeId))) {
          issue.lifeline.assigned.push({
            assignee: assigneeId,
            action: 'unassigned',
            actor: req.user._id,
            changedAt: new Date(),
          });
        }
      }
    }

    if (statusChanged) {
      issue.lifeline.status.push({
        from: oldStatus || null,
        to: issue.status,
        actor: req.user._id,
        changedAt: new Date(),
      });
    }

    const updatedIssue = await issue.save();
    
    if (assigneeChanged) {
      await processNotificationEvent(NOTIFICATION_EVENTS.TASK_ASSIGNED, {
        actorId: req.user._id,
        issueId: updatedIssue._id,
      });
    }

    if (hasMeaningfulUpdate) {
      const changedDependencyIds = Array.from(new Set([
        ...(dependencyChange.addedIds || []).map(String),
        ...(dependencyChange.removedIds || []).map(String),
      ]));
      const dependencyTitleById = new Map();
      if (changedDependencyIds.length > 0) {
        const changedDependencyIssues = await Issue.find({ _id: { $in: changedDependencyIds } })
          .select('title')
          .lean();
        changedDependencyIssues.forEach((dependencyIssue) => {
          dependencyTitleById.set(String(dependencyIssue._id), dependencyIssue.title);
        });
      }

      await processNotificationEvent(NOTIFICATION_EVENTS.TASK_UPDATED, {
        actorId: req.user._id,
        issueId: updatedIssue._id,
        updateSummary: buildDependencyUpdateSummary(
          updatedIssue.title,
          dependencyChange.addedIds || [],
          dependencyChange.removedIds || [],
          dependencyTitleById
        ),
      });
    }

    // Return populated issue
    const populatedIssue = await populateIssueQuery(Issue.findById(updatedIssue._id));

    try {
      const projectId = populatedIssue.projectId?._id ? populatedIssue.projectId._id : populatedIssue.projectId;
      getIO().to(`project:${projectId}`).emit('issue:updated', { issue: populatedIssue });

      const reporterId = populatedIssue.reporter?._id ? populatedIssue.reporter._id : populatedIssue.reporter;

      if (reporterId) {
        getIO().to(`user:${reporterId}`).emit('issue:updated', { issue: populatedIssue });
      }
      const assigneeIds = Array.isArray(populatedIssue.assignees) && populatedIssue.assignees.length > 0
        ? populatedIssue.assignees.map((a) => (a?._id ? a._id : a))
        : (populatedIssue.assignee ? [populatedIssue.assignee?._id ? populatedIssue.assignee._id : populatedIssue.assignee] : []);
      for (const aId of assigneeIds) {
        if (aId && String(aId) !== String(reporterId)) {
          getIO().to(`user:${aId}`).emit('issue:updated', { issue: populatedIssue });
        }
      }
    } catch (e) {}
      
    res.json(populatedIssue);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete an issue
// @route   DELETE /api/issues/:id
// @access  Private
const deleteIssue = async (req, res) => {
  try {
    const issue = await Issue.findById(req.params.id);

    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    const reporterId = issue.reporter?.toString();
    const requesterId = req.user?._id?.toString();
    if (!reporterId || !requesterId || reporterId !== requesterId) {
      return res.status(403).json({ message: 'Only the ticket creator can delete this ticket.' });
    }

    const projectId = issue.projectId?._id ? issue.projectId._id : issue.projectId;
    const issueId = issue._id;
    const assigneeId = issue.assignee?._id ? issue.assignee._id : issue.assignee;
    const assigneeIds = Array.isArray(issue.assignees) && issue.assignees.length > 0
      ? issue.assignees.map((a) => (a?._id ? a._id : a))
      : (assigneeId ? [assigneeId] : []);

    await issue.deleteOne();

    try {
      const payload = { issueId: String(issueId) };
      getIO().to(`project:${projectId}`).emit('issue:deleted', payload);
      if (reporterId) getIO().to(`user:${reporterId}`).emit('issue:deleted', payload);
      for (const aId of assigneeIds) {
        if (aId && String(aId) !== String(reporterId)) {
          getIO().to(`user:${aId}`).emit('issue:deleted', payload);
        }
      }
    } catch (e) {}
    res.json({ message: 'Issue removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update issue priority
// @route   PATCH /api/issues/:id/priority
// @access  Private
const updateIssuePriority = async (req, res) => {
  try {
    const { priority } = req.body;
    if (!priority) {
      return res.status(400).json({ message: 'Priority is required' });
    }
    const allowed = ['Low', 'Medium', 'High', 'Critical'];
    if (!allowed.includes(priority)) {
      return res.status(400).json({ message: 'Invalid priority' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    issue.priority = priority;
    const updated = await issue.save();

    const populated = await populateIssueQuery(Issue.findById(updated._id));

    try {
      const projectId = updated.projectId?._id ? updated.projectId._id : updated.projectId;
      getIO().to(`project:${projectId}`).emit('issue:updated', { issue: populated });
      const reporterId = populated.reporter?._id ? populated.reporter._id : populated.reporter;
      if (reporterId) getIO().to(`user:${reporterId}`).emit('issue:updated', { issue: populated });
      const assigneeIds = Array.isArray(populated.assignees) && populated.assignees.length > 0
        ? populated.assignees.map((a) => (a?._id ? a._id : a))
        : (populated.assignee ? [populated.assignee?._id ? populated.assignee._id : populated.assignee] : []);
      for (const aId of assigneeIds) {
        if (aId && String(aId) !== String(reporterId)) {
          getIO().to(`user:${aId}`).emit('issue:updated', { issue: populated });
        }
      }
    } catch (e) {}

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update issue due date
// @route   PATCH /api/issues/:id/due-date
// @access  Private
const updateIssueDueDate = async (req, res) => {
  try {
    const { dueDate } = req.body;
    const parsed = dueDate ? new Date(dueDate) : null;
    if (dueDate && Number.isNaN(parsed.getTime())) {
      return res.status(400).json({ message: 'Invalid due date' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    issue.dueDate = parsed;
    const updated = await issue.save();

    const populated = await populateIssueQuery(Issue.findById(updated._id));

    try {
      const projectId = updated.projectId?._id ? updated.projectId._id : updated.projectId;
      getIO().to(`project:${projectId}`).emit('issue:updated', { issue: populated });
      const reporterId = populated.reporter?._id ? populated.reporter._id : populated.reporter;
      if (reporterId) getIO().to(`user:${reporterId}`).emit('issue:updated', { issue: populated });
      const assigneeIds = Array.isArray(populated.assignees) && populated.assignees.length > 0
        ? populated.assignees.map((a) => (a?._id ? a._id : a))
        : (populated.assignee ? [populated.assignee?._id ? populated.assignee._id : populated.assignee] : []);
      for (const aId of assigneeIds) {
        if (aId && String(aId) !== String(reporterId)) {
          getIO().to(`user:${aId}`).emit('issue:updated', { issue: populated });
        }
      }
    } catch (e) {}

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update issue checklist
// @route   PATCH /api/issues/:id/checklist
// @access  Private
const updateIssueChecklist = async (req, res) => {
  try {
    const { checklist } = req.body;
    if (!Array.isArray(checklist)) {
      return res.status(400).json({ message: 'checklist must be an array' });
    }

    const normalized = normalizeChecklist(checklist);

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    issue.checklist = normalized;
    await issue.save();

    const populated = await populateIssueQuery(Issue.findById(issue._id));

    try {
      const projectId = issue.projectId?._id ? issue.projectId._id : issue.projectId;
      getIO().to(`project:${projectId}`).emit('issue:updated', { issue: populated });

      const reporterId = populated.reporter?._id ? populated.reporter._id : populated.reporter;

      if (reporterId) getIO().to(`user:${reporterId}`).emit('issue:updated', { issue: populated });
      const assigneeIds = Array.isArray(populated.assignees) && populated.assignees.length > 0
        ? populated.assignees.map((a) => (a?._id ? a._id : a))
        : (populated.assignee ? [populated.assignee?._id ? populated.assignee._id : populated.assignee] : []);
      for (const aId of assigneeIds) {
        if (aId && String(aId) !== String(reporterId)) {
          getIO().to(`user:${aId}`).emit('issue:updated', { issue: populated });
        }
      }
    } catch (e) {}

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Add an iteration update in issue lifeline
// @route   POST /api/issues/:id/lifeline/iterations
// @access  Private (assignees only)
const addIssueIteration = async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ message: 'Iteration content is required' });
    }

    const issue = await Issue.findById(req.params.id);
    if (!issue) {
      return res.status(404).json({ message: 'Issue not found' });
    }

    const assigneeIds = normalizeIssueAssigneeIds(issue);
    const canAdd = assigneeIds.includes(String(req.user._id));
    if (!canAdd) {
      return res.status(403).json({ message: 'Only assignees can add iteration updates' });
    }

    if (!issue.lifeline || typeof issue.lifeline !== 'object') {
      issue.lifeline = { assigned: [], status: [], iterations: [] };
    }
    if (!Array.isArray(issue.lifeline.iterations)) issue.lifeline.iterations = [];

    issue.lifeline.iterations.push({
      author: req.user._id,
      content,
      createdAt: new Date(),
    });
    await issue.save();
    const createdIteration = issue.lifeline.iterations[issue.lifeline.iterations.length - 1];

    await processNotificationEvent(NOTIFICATION_EVENTS.ITERATION_ADDED, {
      actorId: req.user._id,
      actorName: req.user?.name,
      issueId: issue._id,
      iterationId: createdIteration?._id,
      iterationContent: content,
    });

    const populatedIssue = await populateIssueQuery(Issue.findById(issue._id));
    try {
      const projectId = populatedIssue.projectId?._id ? populatedIssue.projectId._id : populatedIssue.projectId;
      getIO().to(`project:${projectId}`).emit('issue:updated', { issue: populatedIssue });

      const reporterId = populatedIssue.reporter?._id ? populatedIssue.reporter._id : populatedIssue.reporter;
      const assigneeIds = Array.isArray(populatedIssue.assignees) && populatedIssue.assignees.length > 0
        ? populatedIssue.assignees.map((a) => (a?._id ? a._id : a))
        : (populatedIssue.assignee ? [populatedIssue.assignee?._id ? populatedIssue.assignee._id : populatedIssue.assignee] : []);

      const projectParticipants = await Project.findById(projectId).select('createdBy leads members').lean();
      const participantIds = new Set([
        reporterId ? String(reporterId) : null,
        ...assigneeIds.map((value) => (value ? String(value) : null)),
        projectParticipants?.createdBy ? String(projectParticipants.createdBy) : null,
        ...(Array.isArray(projectParticipants?.leads) ? projectParticipants.leads.map((value) => String(value)) : []),
        ...(Array.isArray(projectParticipants?.members) ? projectParticipants.members.map((value) => String(value)) : []),
      ].filter(Boolean));

      participantIds.forEach((participantId) => {
        getIO().to(`user:${participantId}`).emit('issue:updated', { issue: populatedIssue });
      });
    } catch (e) {}

    res.status(201).json(populatedIssue);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getIssuesByProject,
  getIssueById,
  createIssue,
  updateIssue,
  updateIssuePriority,
  updateIssueDueDate,
  deleteIssue,
  updateIssueChecklist,
  addIssueIteration,
};
