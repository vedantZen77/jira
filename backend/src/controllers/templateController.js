const Template = require('../models/Template');
const Project = require('../models/Project');
const Issue = require('../models/Issue');
const Notification = require('../models/Notification');
const { getIO } = require('../socket');

const isLead = (project, userId) => {
  if (!project || !userId) return false;
  const uid = userId.toString();
  if (project.createdBy?.toString?.() === uid) return true;
  const leads = Array.isArray(project.leads) ? project.leads : [];
  return leads.some((l) => l?.toString?.() === uid);
};

const normalizeTemplateTickets = (tickets) => {
  if (!Array.isArray(tickets)) return [];
  return tickets
    .map((t) => ({
      ticketId: t?.ticketId,
      order: Number.isFinite(Number(t?.order)) ? Number(t.order) : 0,
    }))
    .filter((t) => t.ticketId);
};

const getIssueId = (id) => (id?._id ? id._id : id);

const emitIssueToRooms = async (issue) => {
  if (!issue?._id || !issue?.projectId) return;
  const projectId = issue.projectId._id ? issue.projectId._id : issue.projectId;
  const assigneeId = issue.assignee?._id ? issue.assignee._id : issue.assignee;
  const reporterId = issue.reporter?._id ? issue.reporter._id : issue.reporter;

  getIO().to(`project:${projectId}`).emit('issue:created', { issue });
  if (reporterId) getIO().to(`user:${reporterId}`).emit('issue:created', { issue });
  if (assigneeId && String(assigneeId) !== String(reporterId)) {
    getIO().to(`user:${assigneeId}`).emit('issue:created', { issue });
  }
};

// GET /api/templates?scope=global|project&projectId=...
const getTemplates = async (req, res) => {
  try {
    const { scope, projectId, includeTickets } = req.query;
    const query = { createdBy: req.user._id };
    if (scope) query.scope = scope;
    if (scope === 'project') query.projectId = projectId;

    // By default, list only templates. Include ticket refs when asked.
    let q = Template.find(query).sort({ createdAt: -1 });
    if (includeTickets === 'true') {
      q = q.populate('tickets.ticketId');
    }
    const templates = await q;

    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/templates
// body: { name, description, scope, projectId?, tickets: [{ticketId, order}] }
const createTemplate = async (req, res) => {
  try {
    const { name, description, scope, projectId, tickets } = req.body;

    if (!scope || !['global', 'project'].includes(scope)) {
      return res.status(400).json({ message: 'Invalid template scope' });
    }
    if (scope === 'project' && !projectId) {
      return res.status(400).json({ message: 'projectId is required for project templates' });
    }

    const normalizedTickets = normalizeTemplateTickets(tickets);
    if (normalizedTickets.length === 0) {
      return res.status(400).json({ message: 'Template must include at least one ticket' });
    }

    // Authorization: templates are user-scoped
    const template = new Template({
      name,
      description,
      scope,
      projectId: scope === 'project' ? projectId : undefined,
      tickets: normalizedTickets.map((t, idx) => ({
        ticketId: t.ticketId,
        order: Number.isFinite(t.order) ? t.order : idx,
      })),
      createdBy: req.user._id,
    });

    const created = await template.save();
    res.status(201).json(created);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// DELETE /api/templates/:id
const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (String(template.createdBy) !== String(req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }
    await template.deleteOne();
    res.json({ message: 'Template deleted' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/templates/:id/tickets
// body: { ticketId }
const addTicketToTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { ticketId } = req.body;
    if (!ticketId) return res.status(400).json({ message: 'ticketId is required' });

    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (String(template.createdBy) !== String(req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const exists = template.tickets.some((t) => String(t.ticketId) === String(ticketId));
    if (exists) return res.status(200).json(template);

    // If template is project-scoped, ticket must belong to that project.
    if (template.scope === 'project' && template.projectId) {
      const src = await Issue.findById(ticketId).select('projectId');
      if (!src) return res.status(404).json({ message: 'Ticket not found' });
      if (String(src.projectId) !== String(template.projectId)) {
        return res.status(400).json({ message: 'Ticket does not belong to this project template' });
      }
    }

    const ticketCount = template.tickets.length;
    template.tickets.push({ ticketId, order: ticketCount });
    const updated = await template.save();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// GET /api/templates/:id/tickets
// Returns ordered list of issues for preview/import.
const getTemplateTickets = async (req, res) => {
  try {
    const { id } = req.params;
    const { includeDeleted } = req.query;

    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (String(template.createdBy) !== String(req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const ordered = Array.isArray(template.tickets) ? [...template.tickets] : [];
    ordered.sort((a, b) => (a.order || 0) - (b.order || 0));
    const ticketIds = ordered.map((t) => t.ticketId);
    const issues = await Issue.find({ _id: { $in: ticketIds } })
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar')
      .populate('projectId', 'name key')
      .lean();

    const byId = new Map(issues.map((i) => [String(i._id), i]));
    const result = ordered
      .map((t) => {
        const issue = byId.get(String(t.ticketId));
        if (!issue) return null;
        return { ticketId: t.ticketId, order: t.order, issue };
      })
      .filter(Boolean);

    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/projects/:projectId/templates/apply
// body: { templateId, selectedTicketIds?: string[] }
const applyTemplateToProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { templateId, selectedTicketIds } = req.body;

    if (!templateId) return res.status(400).json({ message: 'templateId is required' });

    const project = await Project.findById(projectId);
    if (!project) return res.status(404).json({ message: 'Project not found' });
    if (!isLead(project, req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const template = await Template.findById(templateId);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (String(template.createdBy) !== String(req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    if (template.scope === 'project' && String(template.projectId) !== String(projectId)) {
      return res.status(400).json({ message: 'Template is not valid for this project' });
    }

    const ordered = Array.isArray(template.tickets) ? [...template.tickets] : [];
    ordered.sort((a, b) => (a.order || 0) - (b.order || 0));
    const ticketOrderMap = new Map(ordered.map((t) => [String(t.ticketId), t.order || 0]));

    const allTicketIds = ordered.map((t) => t.ticketId);
    const selectedIds = Array.isArray(selectedTicketIds) && selectedTicketIds.length > 0
      ? selectedTicketIds
      : allTicketIds.map((id) => String(id));

    const selectedIdSet = new Set(selectedIds.map(String));
    const filteredOrdered = ordered.filter((t) => selectedIdSet.has(String(t.ticketId)));
    if (filteredOrdered.length === 0) return res.status(400).json({ message: 'No tickets selected' });

    // Fetch source issues
    const issues = await Issue.find({ _id: { $in: filteredOrdered.map((t) => t.ticketId) } })
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar')
      .lean();

    const byId = new Map(issues.map((i) => [String(i._id), i]));

    // Clone into new Issues for this project.
    // Default: imported tickets always start in Backlog.
    const now = new Date();
    const docs = filteredOrdered
      .map((t) => {
        const src = byId.get(String(t.ticketId));
        if (!src) return null;
        return {
          title: src.title,
          description: src.description,
          issueType: src.issueType || 'Task',
          status: 'Backlog',
          priority: src.priority || 'Medium',
          projectId,
          assignee: null,
          assignees: [],
          reporter: req.user._id,
          labels: Array.isArray(src.labels) ? src.labels : [],
          // Copy checklist items, but always reset completion state on import.
          checklist: Array.isArray(src.checklist)
            ? src.checklist.map((item) => ({
                text: item?.text || '',
                completed: false,
              }))
            : [],
          dueDate: null,
          storyPoints: src.storyPoints,
          // Recurring is handled by RecurringSchedule, not by templates,
          // so we clear recurring metadata on import.
          recurring: undefined,
          lastGeneratedAt: undefined,
          completedAt: undefined,
          createdAt: now,
          updatedAt: now,
        };
      })
      .filter(Boolean);

    if (docs.length === 0) return res.status(400).json({ message: 'No valid source issues found' });

    const createdIssues = await Issue.insertMany(docs, { ordered: false });
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
      if (assigneeId && String(assigneeId) !== String(reporterId)) {
        const notification = await Notification.create({
          user: assigneeId,
          type: 'ISSUE_ASSIGNED',
          message: `You have been assigned to a new issue: ${issue.title}`,
          link: `/project/${projectId}`,
        });
        try {
          getIO().to(`user:${assigneeId}`).emit('notification:new', { notification });
        } catch (e) {}
      }
    }

    res.status(201).json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// PUT /api/templates/:id
// Allows editing template metadata and ticket reference list (no ticket content duplication).
const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (String(template.createdBy) !== String(req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const { name, description, scope, projectId, tickets } = req.body;
    const nextScope = scope || template.scope;

    if (!nextScope || !['global', 'project'].includes(nextScope)) {
      return res.status(400).json({ message: 'Invalid template scope' });
    }
    if (nextScope === 'project' && !projectId) {
      return res.status(400).json({ message: 'projectId is required for project templates' });
    }

    const normalizedTickets = tickets ? normalizeTemplateTickets(tickets) : template.tickets;
    if (!Array.isArray(normalizedTickets) || normalizedTickets.length === 0) {
      return res.status(400).json({ message: 'Template must include at least one ticket' });
    }

    if (name !== undefined) template.name = name;
    if (description !== undefined) template.description = description;
    template.scope = nextScope;
    template.projectId = nextScope === 'project' ? projectId : undefined;
    template.tickets = normalizedTickets.map((t, idx) => ({
      ticketId: t.ticketId,
      order: Number.isFinite(Number(t.order)) ? Number(t.order) : idx,
    }));

    const updated = await template.save();
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = {
  getTemplates,
  createTemplate,
  deleteTemplate,
  addTicketToTemplate,
  getTemplateTickets,
  applyTemplateToProject,
  updateTemplate,
};

