const mongoose = require('mongoose');
const Project = require('../models/Project');
const Issue = require('../models/Issue');
const Comment = require('../models/Comment');
const User = require('../models/User');
const { getIO } = require('../socket');

const isLead = (project, userId) => {
  if (!project || !userId) return false;
  const uid = userId.toString();
  if (project.createdBy?.toString?.() === uid) return true;
  const leads = Array.isArray(project.leads) ? project.leads : [];
  return leads.some((l) => l?.toString?.() === uid);
};

const ISSUE_TYPES = ['Bug', 'Feature', 'Task', 'Epic', 'Subtask'];
const ISSUE_STATUSES = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing', 'Done'];
const ISSUE_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'];

const validObjectIdString = (value) => {
  if (!value) return null;
  const asString = String(value);
  return /^[0-9a-fA-F]{24}$/.test(asString) ? asString : null;
};

const parseDateOrNull = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// @desc    Get all projects for a user
// @route   GET /api/projects
// @access  Private
const getProjects = async (req, res) => {
  try {
    const projects = await Project.find({
      $or: [
        { createdBy: req.user._id },
        { leads: req.user._id },
        { members: req.user._id },
      ],
    })
      .populate('createdBy', 'name email avatar')
      .populate('leads', 'name email avatar')
      .populate('members', 'name email avatar');

    res.json(projects);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get single project
// @route   GET /api/projects/:id
// @access  Private
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id)
      .populate('createdBy', 'name email avatar')
      .populate('leads', 'name email avatar')
      .populate('members', 'name email avatar');

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    res.json(project);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create project
// @route   POST /api/projects
// @access  Private
const createProject = async (req, res) => {
  try {
    const { name, key, description, members } = req.body;

    const project = new Project({
      name,
      key,
      description,
      leads: [req.user._id],
      members: members || [],
      createdBy: req.user._id,
    });

    const createdProject = await project.save();
    res.status(201).json(createdProject);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update project
// @route   PUT /api/projects/:id
// @access  Private
const updateProject = async (req, res) => {
  try {
    const { name, key, description, members } = req.body;

    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Normalize older projects that predate leads[]
    if (!Array.isArray(project.leads) || project.leads.length === 0) {
      project.leads = [project.createdBy];
    }

    if (!isLead(project, req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    project.name = name || project.name;
    project.key = key || project.key;
    project.description = description || project.description;
    if (members) project.members = members;

    const updatedProject = await project.save();
    res.json(updatedProject);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update project leads (replace list)
// @route   PUT /api/projects/:id/leads
// @access  Private (leads only)
const updateProjectLeads = async (req, res) => {
  try {
    const { leads } = req.body;
    if (!Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ message: 'Leads must be a non-empty array' });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Normalize older projects that predate leads[]
    if (!Array.isArray(project.leads) || project.leads.length === 0) {
      project.leads = [project.createdBy];
    }

    // Authorization must be checked against current project state (before mutation)
    if (!isLead(project, req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const creatorId = String(project.createdBy);
    const prevLeads = new Set([...(project.leads || []).map(String), creatorId]);

    // Ensure creator is always a lead
    const nextLeadsArr = Array.from(new Set([...leads.map(String), creatorId]));
    const nextLeads = new Set(nextLeadsArr);

    // Lead/member rule:
    // - When a user becomes a lead, remove them from members
    // - When a user is removed as a lead, add them back to members
    const memberSet = new Set([...(project.members || []).map(String)]);
    memberSet.delete(creatorId); // creator is a lead, not a member

    const addedLeads = [];
    nextLeads.forEach((id) => {
      if (!prevLeads.has(id)) addedLeads.push(id);
    });

    const removedLeads = [];
    prevLeads.forEach((id) => {
      if (id !== creatorId && !nextLeads.has(id)) removedLeads.push(id);
    });

    // Promote -> remove from members
    addedLeads.forEach((id) => memberSet.delete(id));
    // Demote -> add back to members
    removedLeads.forEach((id) => memberSet.add(id));

    project.leads = nextLeadsArr;
    project.members = Array.from(memberSet);

    const updated = await project.save();
    const populated = await Project.findById(updated._id)
      .populate('createdBy', 'name email avatar')
      .populate('leads', 'name email avatar')
      .populate('members', 'name email avatar');

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete project
// @route   DELETE /api/projects/:id
// @access  Private
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    // Normalize older projects that predate leads[]
    if (!Array.isArray(project.leads) || project.leads.length === 0) {
      project.leads = [project.createdBy];
    }

    if (!isLead(project, req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    // Delete all issues that belong to this project so analytics stays correct.
    const issues = await Issue.find({ projectId: project._id }, '_id');
    await Issue.deleteMany({ projectId: project._id });
    // Notify any connected boards to remove deleted tickets immediately.
    try {
      const io = getIO();
      const issueIds = issues.map((i) => i._id);
      issueIds.forEach((issueId) => io.to(`project:${project._id}`).emit('issue:deleted', { issueId: String(issueId) }));
    } catch (e) {}

    await project.deleteOne();
    res.json({ message: 'Project removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Export full project backup (project + tickets + comments)
// @route   GET /api/projects/:id/export
// @access  Private
const exportProjectBackup = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    if (!isLead(project, req.user._id)) {
      return res.status(403).json({ message: 'User not authorized' });
    }

    const issues = await Issue.find({ projectId: project._id }).sort({ createdAt: 1 }).lean();
    const issueIds = issues.map((issue) => issue._id);
    const comments = issueIds.length
      ? await Comment.find({ ticketId: { $in: issueIds } }).sort({ createdAt: 1 }).lean()
      : [];

    const relatedUserIds = new Set();
    relatedUserIds.add(String(project.createdBy));
    (Array.isArray(project.leads) ? project.leads : []).forEach((id) => relatedUserIds.add(String(id)));
    (Array.isArray(project.members) ? project.members : []).forEach((id) => relatedUserIds.add(String(id)));
    issues.forEach((issue) => {
      if (issue.assignee) relatedUserIds.add(String(issue.assignee));
      if (issue.reporter) relatedUserIds.add(String(issue.reporter));
      (Array.isArray(issue.assignees) ? issue.assignees : []).forEach((id) => relatedUserIds.add(String(id)));
    });
    comments.forEach((comment) => {
      if (comment.author) relatedUserIds.add(String(comment.author));
    });

    const users = await User.find({ _id: { $in: Array.from(relatedUserIds) } }, 'name email avatar role').lean();

    const payload = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      exportedBy: {
        id: String(req.user._id),
        email: req.user.email,
        name: req.user.name,
      },
      users: users.map((u) => ({
        id: String(u._id),
        name: u.name,
        email: u.email,
        avatar: u.avatar,
        role: u.role,
      })),
      project: {
        sourceId: String(project._id),
        name: project.name,
        key: project.key,
        description: project.description || '',
        createdBy: project.createdBy ? String(project.createdBy) : null,
        members: Array.isArray(project.members) ? project.members.map((m) => String(m)) : [],
        leads: Array.isArray(project.leads) ? project.leads.map((l) => String(l)) : [],
        createdAt: project.createdAt || null,
        updatedAt: project.updatedAt || null,
      },
      issues: issues.map((issue) => ({
        sourceId: String(issue._id),
        title: issue.title,
        description: issue.description || '',
        issueType: issue.issueType,
        status: issue.status,
        priority: issue.priority,
        assignee: issue.assignee ? String(issue.assignee) : null,
        assignees: Array.isArray(issue.assignees) ? issue.assignees.map((a) => String(a)) : [],
        reporter: issue.reporter ? String(issue.reporter) : null,
        labels: Array.isArray(issue.labels) ? issue.labels : [],
        dueDate: issue.dueDate || null,
        storyPoints: issue.storyPoints ?? null,
        checklist: Array.isArray(issue.checklist) ? issue.checklist : [],
        recurring: issue.recurring || null,
        lifeline: issue.lifeline || { assigned: [], status: [], iterations: [] },
        lastGeneratedAt: issue.lastGeneratedAt || null,
        completedAt: issue.completedAt || null,
        createdAt: issue.createdAt || null,
        updatedAt: issue.updatedAt || null,
      })),
      comments: comments.map((comment) => ({
        sourceId: String(comment._id),
        ticketSourceId: String(comment.ticketId),
        author: comment.author ? String(comment.author) : null,
        content: comment.content,
        createdAt: comment.createdAt || null,
        updatedAt: comment.updatedAt || null,
      })),
    };

    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Import full project backup from JSON payload
// @route   POST /api/projects/import
// @access  Private
const importProjectBackup = async (req, res) => {
  try {
    const backup = req.body?.backup && typeof req.body.backup === 'object' ? req.body.backup : req.body;
    if (!backup || typeof backup !== 'object') {
      return res.status(400).json({ message: 'Invalid backup payload' });
    }

    const projectInput = backup.project;
    const issuesInput = Array.isArray(backup.issues) ? backup.issues : [];
    const commentsInput = Array.isArray(backup.comments) ? backup.comments : [];

    if (!projectInput || typeof projectInput !== 'object') {
      return res.status(400).json({ message: 'Backup project data is missing' });
    }

    const name = String(projectInput.name || '').trim() || 'Imported Project';
    const key = String(projectInput.key || 'IMP').toUpperCase().trim().slice(0, 10) || 'IMP';
    const description = typeof projectInput.description === 'string' ? projectInput.description : '';

    const backupLeadIds = Array.isArray(projectInput.leads) ? projectInput.leads : [];
    const backupMemberIds = Array.isArray(projectInput.members) ? projectInput.members : [];
    const issueParticipantIds = [];
    issuesInput.forEach((issue) => {
      if (issue?.assignee) issueParticipantIds.push(issue.assignee);
      if (issue?.reporter) issueParticipantIds.push(issue.reporter);
      if (Array.isArray(issue?.assignees)) issueParticipantIds.push(...issue.assignees);
    });
    const commentAuthorIds = commentsInput.map((comment) => comment?.author).filter(Boolean);
    const candidateUserIds = Array.from(
      new Set(
        [...backupLeadIds, ...backupMemberIds, ...issueParticipantIds, ...commentAuthorIds]
          .map(validObjectIdString)
          .filter(Boolean)
      )
    );
    const existingUsers = candidateUserIds.length
      ? await User.find({ _id: { $in: candidateUserIds } }, '_id').lean()
      : [];
    const existingUserSet = new Set(existingUsers.map((u) => String(u._id)));

    const restoredLeadIds = Array.from(
      new Set(
        backupLeadIds
          .map(validObjectIdString)
          .filter((id) => id && existingUserSet.has(id))
      )
    ).filter((id) => id !== String(req.user._id));

    const restoredMemberIds = Array.from(
      new Set(
        backupMemberIds
          .map(validObjectIdString)
          .filter((id) => id && existingUserSet.has(id))
      )
    ).filter((id) => id !== String(req.user._id) && !restoredLeadIds.includes(id));

    const additionalMemberIds = Array.from(
      new Set(
        [...issueParticipantIds, ...commentAuthorIds]
          .map(validObjectIdString)
          .filter((id) => id && existingUserSet.has(id))
      )
    ).filter((id) => id !== String(req.user._id) && !restoredLeadIds.includes(id));

    const allMemberIds = Array.from(new Set([...restoredMemberIds, ...additionalMemberIds]));

    const createdProject = await Project.create({
      name,
      key,
      description,
      createdBy: req.user._id,
      leads: [req.user._id, ...restoredLeadIds],
      members: allMemberIds,
    });

    const assignableUserSet = new Set([
      String(req.user._id),
      ...restoredLeadIds.map(String),
      ...allMemberIds.map(String),
    ]);

    const issueIdMap = new Map();
    const issueDocs = issuesInput.map((issue, index) => {
      const sourceId = validObjectIdString(issue?.sourceId) || validObjectIdString(issue?._id);
      const backupAssignees = Array.isArray(issue?.assignees) ? issue.assignees : [];
      const assigneeIdsRaw = backupAssignees.length > 0
        ? backupAssignees
        : issue?.assignee
          ? [issue.assignee]
          : [];
      const normalizedAssigneeIds = Array.from(
        new Set(
          assigneeIdsRaw
            .map(validObjectIdString)
            .filter((id) => id && assignableUserSet.has(id))
        )
      );
      const issueType = ISSUE_TYPES.includes(issue?.issueType) ? issue.issueType : 'Task';
      const status = ISSUE_STATUSES.includes(issue?.status) ? issue.status : 'Todo';
      const priority = ISSUE_PRIORITIES.includes(issue?.priority) ? issue.priority : 'Medium';
      const newId = new mongoose.Types.ObjectId();

      const issueDoc = {
        _id: newId,
        title: String(issue?.title || '').trim() || `Imported Issue ${index + 1}`,
        description: typeof issue?.description === 'string' ? issue.description : '',
        issueType,
        status,
        priority,
        projectId: createdProject._id,
        assignee: normalizedAssigneeIds[0] || null,
        assignees: normalizedAssigneeIds,
        reporter: (() => {
          const reporterId = validObjectIdString(issue?.reporter);
          if (reporterId && assignableUserSet.has(reporterId)) return reporterId;
          return req.user._id;
        })(),
        labels: Array.isArray(issue?.labels)
          ? issue.labels.filter((l) => typeof l === 'string' && l.trim().length > 0)
          : [],
        dueDate: parseDateOrNull(issue?.dueDate),
        storyPoints: Number.isFinite(Number(issue?.storyPoints)) ? Number(issue.storyPoints) : undefined,
        completedAt: parseDateOrNull(issue?.completedAt),
        recurring:
          issue?.recurring && typeof issue.recurring === 'object'
            ? {
                type: ['daily', 'weekly', 'monthly'].includes(issue.recurring.type)
                  ? issue.recurring.type
                  : undefined,
              }
            : undefined,
        lifeline:
          issue?.lifeline && typeof issue.lifeline === 'object'
            ? {
                assigned: Array.isArray(issue.lifeline.assigned)
                  ? issue.lifeline.assigned
                      .map((entry) => ({
                        assignee: validObjectIdString(entry?.assignee),
                        action: ['assigned', 'unassigned'].includes(entry?.action) ? entry.action : null,
                        actor: validObjectIdString(entry?.actor) || req.user._id,
                        changedAt: parseDateOrNull(entry?.changedAt) || new Date(),
                      }))
                      .filter((entry) => entry.assignee && entry.action)
                  : [],
                status: Array.isArray(issue.lifeline.status)
                  ? issue.lifeline.status
                      .map((entry) => ({
                        from: ISSUE_STATUSES.includes(entry?.from) ? entry.from : null,
                        to: ISSUE_STATUSES.includes(entry?.to) ? entry.to : status,
                        actor: validObjectIdString(entry?.actor) || req.user._id,
                        changedAt: parseDateOrNull(entry?.changedAt) || new Date(),
                      }))
                      .filter((entry) => entry.to)
                  : [],
                iterations: Array.isArray(issue.lifeline.iterations)
                  ? issue.lifeline.iterations
                      .map((entry) => ({
                        author: validObjectIdString(entry?.author) || req.user._id,
                        content: String(entry?.content || '').trim(),
                        createdAt: parseDateOrNull(entry?.createdAt) || new Date(),
                      }))
                      .filter((entry) => entry.content)
                  : [],
              }
            : {
                assigned: normalizedAssigneeIds.map((assigneeId) => ({
                  assignee: assigneeId,
                  action: 'assigned',
                  actor: req.user._id,
                  changedAt: new Date(),
                })),
                status: [
                  {
                    from: null,
                    to: status,
                    actor: req.user._id,
                    changedAt: new Date(),
                  },
                ],
                iterations: [],
              },
        lastGeneratedAt: parseDateOrNull(issue?.lastGeneratedAt),
        checklist: Array.isArray(issue?.checklist)
          ? issue.checklist
              .map((item) => ({
                text: String(item?.text || '').trim(),
                completed: Boolean(item?.completed),
              }))
              .filter((item) => item.text)
          : [],
      };

      if (sourceId) issueIdMap.set(sourceId, issueDoc._id);
      return issueDoc;
    });

    const insertedIssues = issueDocs.length ? await Issue.insertMany(issueDocs) : [];

    const commentDocs = commentsInput
      .map((comment) => {
        const sourceIssueId = validObjectIdString(comment?.ticketSourceId) || validObjectIdString(comment?.ticketId);
        if (!sourceIssueId) return null;
        const newTicketId = issueIdMap.get(sourceIssueId);
        if (!newTicketId) return null;
        const content = String(comment?.content || '').trim();
        if (!content) return null;
        return {
          ticketId: newTicketId,
          author:
            (() => {
              const authorId = validObjectIdString(comment?.author);
              if (authorId && assignableUserSet.has(authorId)) return authorId;
              return req.user._id;
            })(),
          content,
        };
      })
      .filter(Boolean);

    if (commentDocs.length) {
      await Comment.insertMany(commentDocs);
    }

    res.status(201).json({
      message: 'Project imported successfully',
      projectId: createdProject._id,
      importedIssues: insertedIssues.length,
      importedComments: commentDocs.length,
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  updateProjectLeads,
  deleteProject,
  exportProjectBackup,
  importProjectBackup,
};
