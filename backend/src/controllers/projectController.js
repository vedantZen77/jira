const Project = require('../models/Project');
const Issue = require('../models/Issue');
const { getIO } = require('../socket');

const isLead = (project, userId) => {
  if (!project || !userId) return false;
  const uid = userId.toString();
  if (project.createdBy?.toString?.() === uid) return true;
  const leads = Array.isArray(project.leads) ? project.leads : [];
  return leads.some((l) => l?.toString?.() === uid);
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

module.exports = {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  updateProjectLeads,
  deleteProject,
};
