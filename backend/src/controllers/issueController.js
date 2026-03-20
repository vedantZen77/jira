const Issue = require('../models/Issue');
const Project = require('../models/Project');
const Notification = require('../models/Notification');
const { getIO } = require('../socket');

// @desc    Get all issues for a project
// @route   GET /api/issues/project/:projectId
// @access  Private
const getIssuesByProject = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '200', 10), 1), 500);
    const skip = (page - 1) * limit;

    const issues = await Issue.find({ projectId: req.params.projectId })
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

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
    const issue = await Issue.findById(req.params.id)
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar')
      .populate('projectId', 'name key');

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
      labels,
      dueDate,
      storyPoints,
    } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ message: 'Project not found' });
    }

    const issue = new Issue({
      title,
      description,
      issueType,
      status,
      priority,
      projectId,
      assignee,
      labels,
      dueDate,
      storyPoints,
      reporter: req.user._id,
    });

    const createdIssue = await issue.save();

    // Emit to board room so other users see it immediately
    try {
      const populatedIssue = await Issue.findById(createdIssue._id)
        .populate('assignee', 'name email avatar')
        .populate('reporter', 'name email avatar');
      getIO().to(`project:${projectId}`).emit('issue:created', { issue: populatedIssue });
    } catch (e) {}

    // Create notification for assignee
    if (assignee && assignee.toString() !== req.user._id.toString()) {
      const notification = await Notification.create({
        user: assignee,
        type: 'ISSUE_ASSIGNED',
        message: `You have been assigned to a new issue: ${title}`,
        link: `/project/${projectId}`
      });
      try {
        getIO().to(`user:${assignee}`).emit('notification:new', { notification });
      } catch (e) {}
    }

    // Return populated issue for creator UI consistency
    const populated = await Issue.findById(createdIssue._id)
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar');

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
      'labels',
      'dueDate',
      'storyPoints',
    ];

    let assigneeChanged = false;
    let statusChanged = false;
    let newAssignee = null;
    let oldStatus = issue.status;

    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === 'assignee' && req.body[field] !== (issue.assignee ? issue.assignee.toString() : null)) {
           assigneeChanged = true;
           newAssignee = req.body[field];
        }
        if (field === 'status' && req.body[field] !== issue.status) {
           statusChanged = true;
        }
        issue[field] = req.body[field];
      }
    });

    const updatedIssue = await issue.save();
    
    // Notifications mapping
    if (assigneeChanged && newAssignee && newAssignee.toString() !== req.user._id.toString()) {
      const notification = await Notification.create({
        user: newAssignee,
        type: 'ISSUE_ASSIGNED',
        message: `You have been assigned to the issue: ${updatedIssue.title}`,
        link: `/project/${updatedIssue.projectId}`
      });
      try {
        getIO().to(`user:${newAssignee}`).emit('notification:new', { notification });
      } catch (e) {}
    }

    if (statusChanged) {
      // Notify reporter if they didn't make the change
      if (updatedIssue.reporter && updatedIssue.reporter.toString() !== req.user._id.toString()) {
         const notification = await Notification.create({
           user: updatedIssue.reporter,
           type: 'STATUS_CHANGE',
           message: `Status of your issue "${updatedIssue.title}" changed to ${updatedIssue.status}`,
           link: `/project/${updatedIssue.projectId}`
         });
         try {
           getIO().to(`user:${updatedIssue.reporter}`).emit('notification:new', { notification });
         } catch (e) {}
      }
      // Notify assignee if they didn't make the change
      if (updatedIssue.assignee && updatedIssue.assignee.toString() !== req.user._id.toString() && updatedIssue.assignee.toString() !== updatedIssue.reporter?.toString()) {
         const notification = await Notification.create({
           user: updatedIssue.assignee,
           type: 'STATUS_CHANGE',
           message: `Status of assigned issue "${updatedIssue.title}" changed to ${updatedIssue.status}`,
           link: `/project/${updatedIssue.projectId}`
         });
         try {
           getIO().to(`user:${updatedIssue.assignee}`).emit('notification:new', { notification });
         } catch (e) {}
      }
    }

    // Return populated issue
    const populatedIssue = await Issue.findById(updatedIssue._id)
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar');

    try {
      getIO().to(`project:${updatedIssue.projectId}`).emit('issue:updated', { issue: populatedIssue });
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

    const projectId = issue.projectId;
    const issueId = issue._id;
    await issue.deleteOne();

    try {
      getIO().to(`project:${projectId}`).emit('issue:deleted', { issueId: String(issueId) });
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

    const populated = await Issue.findById(updated._id)
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar');

    try {
      getIO().to(`project:${updated.projectId}`).emit('issue:updated', { issue: populated });
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

    const populated = await Issue.findById(updated._id)
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar');

    try {
      getIO().to(`project:${updated.projectId}`).emit('issue:updated', { issue: populated });
    } catch (e) {}

    res.json(populated);
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
};
