const Issue = require('../models/Issue');
const Project = require('../models/Project');
const Notification = require('../models/Notification');

// @desc    Get all issues for a project
// @route   GET /api/issues/project/:projectId
// @access  Private
const getIssuesByProject = async (req, res) => {
  try {
    const issues = await Issue.find({ projectId: req.params.projectId })
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar');

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

    // Create notification for assignee
    if (assignee && assignee.toString() !== req.user._id.toString()) {
      await Notification.create({
        user: assignee,
        type: 'ISSUE_ASSIGNED',
        message: `You have been assigned to a new issue: ${title}`,
        link: `/project/${projectId}`
      });
    }

    res.status(201).json(createdIssue);
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
      await Notification.create({
        user: newAssignee,
        type: 'ISSUE_ASSIGNED',
        message: `You have been assigned to the issue: ${updatedIssue.title}`,
        link: `/project/${updatedIssue.projectId}`
      });
    }

    if (statusChanged) {
      // Notify reporter if they didn't make the change
      if (updatedIssue.reporter && updatedIssue.reporter.toString() !== req.user._id.toString()) {
         await Notification.create({
           user: updatedIssue.reporter,
           type: 'STATUS_CHANGE',
           message: `Status of your issue "${updatedIssue.title}" changed to ${updatedIssue.status}`,
           link: `/project/${updatedIssue.projectId}`
         });
      }
      // Notify assignee if they didn't make the change
      if (updatedIssue.assignee && updatedIssue.assignee.toString() !== req.user._id.toString() && updatedIssue.assignee.toString() !== updatedIssue.reporter?.toString()) {
         await Notification.create({
           user: updatedIssue.assignee,
           type: 'STATUS_CHANGE',
           message: `Status of assigned issue "${updatedIssue.title}" changed to ${updatedIssue.status}`,
           link: `/project/${updatedIssue.projectId}`
         });
      }
    }

    // Return populated issue
    const populatedIssue = await Issue.findById(updatedIssue._id)
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar');
      
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

    await issue.deleteOne();
    res.json({ message: 'Issue removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getIssuesByProject,
  getIssueById,
  createIssue,
  updateIssue,
  deleteIssue,
};
