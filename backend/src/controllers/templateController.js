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

const buildTemplateSnapshot = (issue) => ({
  title: issue?.title || 'Untitled',
  description: issue?.description || '',
  issueType: issue?.issueType || 'Task',
  priority: issue?.priority || 'Medium',
  labels: Array.isArray(issue?.labels) ? issue.labels : [],
  checklist: Array.isArray(issue?.checklist)
    ? issue.checklist.map((item) => ({
        text: String(item?.text || ''),
        completed: Boolean(item?.completed),
      }))
    : [],
  storyPoints: Number.isFinite(Number(issue?.storyPoints)) ? Number(issue.storyPoints) : undefined,
});

const orderedTemplateTickets = (tickets) => {
  if (!Array.isArray(tickets)) return [];
  return tickets
    .slice()
    .sort((a, b) => (a?.order || 0) - (b?.order || 0))
    .map((t, idx) => ({
      _id: t?._id,
      ticketId: t?.ticketId || null,
      order: Number.isFinite(Number(t?.order)) ? Number(t.order) : idx,
      snapshot: t?.snapshot && (t.snapshot.title || t.snapshot.description || t.snapshot.issueType)
        ? {
            title: t.snapshot.title || 'Untitled',
            description: t.snapshot.description || '',
            issueType: t.snapshot.issueType || 'Task',
            priority: t.snapshot.priority || 'Medium',
            labels: Array.isArray(t.snapshot.labels) ? t.snapshot.labels : [],
            checklist: Array.isArray(t.snapshot.checklist) ? t.snapshot.checklist : [],
            storyPoints: Number.isFinite(Number(t.snapshot.storyPoints))
              ? Number(t.snapshot.storyPoints)
              : undefined,
          }
        : null,
    }))
    .filter((t) => t.ticketId || t.snapshot);
};

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

    const uniqueIds = Array.from(new Set(normalizedTickets.map((t) => String(t.ticketId))));
    const sourceIssues = await Issue.find({ _id: { $in: uniqueIds } }).lean();
    const issueById = new Map(sourceIssues.map((i) => [String(i._id), i]));

    const templateTickets = normalizedTickets
      .map((t, idx) => {
        const source = issueById.get(String(t.ticketId));
        if (!source) return null;
        return {
          ticketId: source._id,
          order: Number.isFinite(t.order) ? t.order : idx,
          snapshot: buildTemplateSnapshot(source),
        };
      })
      .filter(Boolean);

    if (templateTickets.length === 0) {
      return res.status(400).json({ message: 'No valid source tickets found' });
    }

    // Authorization: templates are user-scoped
    const template = new Template({
      name,
      description,
      scope,
      projectId: scope === 'project' ? projectId : undefined,
      tickets: templateTickets,
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

    const exists = template.tickets.some((t) => t.ticketId && String(t.ticketId) === String(ticketId));
    if (exists) return res.status(200).json(template);

    // If template is project-scoped, ticket must belong to that project.
    const sourceIssue = await Issue.findById(ticketId).lean();
    if (!sourceIssue) return res.status(404).json({ message: 'Ticket not found' });
    if (template.scope === 'project' && template.projectId) {
      if (String(sourceIssue.projectId) !== String(template.projectId)) {
        return res.status(400).json({ message: 'Ticket does not belong to this project template' });
      }
    }

    const ticketCount = template.tickets.length;
    template.tickets.push({
      ticketId,
      order: ticketCount,
      snapshot: buildTemplateSnapshot(sourceIssue),
    });
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

    const template = await Template.findById(id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    if (String(template.createdBy) !== String(req.user._id)) {
      return res.status(401).json({ message: 'User not authorized' });
    }

    const ordered = orderedTemplateTickets(template.tickets);
    const ticketIds = ordered.map((t) => t.ticketId).filter(Boolean);
    const issues = await Issue.find({ _id: { $in: ticketIds } })
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar')
      .populate('projectId', 'name key')
      .lean();

    const byId = new Map(issues.map((i) => [String(i._id), i]));
    let snapshotsBackfilled = false;
    if (Array.isArray(template.tickets)) {
      template.tickets.forEach((t) => {
        if (!t?.ticketId || t?.snapshot?.title) return;
        const live = byId.get(String(t.ticketId));
        if (!live) return;
        t.snapshot = buildTemplateSnapshot(live);
        snapshotsBackfilled = true;
      });
    }
    if (snapshotsBackfilled) {
      await template.save();
    }

    const result = ordered
      .map((t, idx) => {
        const liveIssue = t.ticketId ? byId.get(String(t.ticketId)) : null;
        const snapshot = t.snapshot || null;
        const source = liveIssue || snapshot;
        if (!source) return null;
        const templateTicketId = String(t._id || t.ticketId || `${idx}`);
        const issue = liveIssue
          ? {
              ...liveIssue,
              _id: templateTicketId,
              sourceIssueId: String(liveIssue._id),
            }
          : {
              _id: templateTicketId,
              sourceIssueId: null,
              title: snapshot.title || 'Untitled',
              description: snapshot.description || '',
              issueType: snapshot.issueType || 'Task',
              priority: snapshot.priority || 'Medium',
              labels: Array.isArray(snapshot.labels) ? snapshot.labels : [],
              checklist: Array.isArray(snapshot.checklist) ? snapshot.checklist : [],
              storyPoints: snapshot.storyPoints,
              assignee: null,
              reporter: null,
              projectId: null,
            };
        return {
          templateTicketId,
          ticketId: t.ticketId || null,
          order: t.order,
          source: liveIssue ? 'live' : 'snapshot',
          issue,
        };
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

    const ordered = orderedTemplateTickets(template.tickets);
    const allTicketIds = ordered.map((t) => String(t._id || t.ticketId)).filter(Boolean);
    const selectedIds = Array.isArray(selectedTicketIds) && selectedTicketIds.length > 0
      ? selectedTicketIds
      : allTicketIds;

    const selectedIdSet = new Set(selectedIds.map(String));
    const filteredOrdered = ordered.filter((t) => {
      const templateTicketId = String(t._id || t.ticketId || '');
      const sourceTicketId = t.ticketId ? String(t.ticketId) : '';
      return selectedIdSet.has(templateTicketId) || (sourceTicketId && selectedIdSet.has(sourceTicketId));
    });
    if (filteredOrdered.length === 0) return res.status(400).json({ message: 'No tickets selected' });

    // Fetch source issues (when still available) and fallback to snapshot.
    const sourceIds = filteredOrdered.map((t) => t.ticketId).filter(Boolean);
    const issues = await Issue.find({ _id: { $in: sourceIds } })
      .populate('assignee', 'name email avatar')
      .populate('reporter', 'name email avatar')
      .lean();

    const byId = new Map(issues.map((i) => [String(i._id), i]));
    let snapshotsBackfilled = false;
    if (Array.isArray(template.tickets)) {
      template.tickets.forEach((t) => {
        if (!t?.ticketId || t?.snapshot?.title) return;
        const live = byId.get(String(t.ticketId));
        if (!live) return;
        t.snapshot = buildTemplateSnapshot(live);
        snapshotsBackfilled = true;
      });
    }
    if (snapshotsBackfilled) {
      await template.save();
    }

    // Clone into new Issues for this project.
    // Default: imported tickets always start in Backlog.
    const now = new Date();
    const docs = filteredOrdered
      .map((t) => {
        const src = (t.ticketId ? byId.get(String(t.ticketId)) : null) || t.snapshot;
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

    const normalizedTickets = tickets ? normalizeTemplateTickets(tickets) : orderedTemplateTickets(template.tickets);
    if (!Array.isArray(normalizedTickets) || normalizedTickets.length === 0) {
      return res.status(400).json({ message: 'Template must include at least one ticket' });
    }

    const sourceIds = Array.from(new Set(normalizedTickets.map((t) => t.ticketId).filter(Boolean).map(String)));
    const sourceIssues = sourceIds.length ? await Issue.find({ _id: { $in: sourceIds } }).lean() : [];
    const issueById = new Map(sourceIssues.map((i) => [String(i._id), i]));

    const currentOrdered = orderedTemplateTickets(template.tickets);
    const currentByTicketId = new Map(
      currentOrdered
        .filter((t) => t.ticketId)
        .map((t) => [String(t.ticketId), t])
    );
    const currentByEntryId = new Map(
      currentOrdered
        .filter((t) => t._id)
        .map((t) => [String(t._id), t])
    );

    const hydratedTickets = normalizedTickets
      .map((t, idx) => {
        const requestedId = String(t.ticketId || '');
        const source = issueById.get(requestedId);
        const existing = currentByTicketId.get(requestedId) || currentByEntryId.get(requestedId);
        if (!source && !existing?.snapshot) return null;
        return {
          ticketId: source?._id || existing?.ticketId || null,
          order: Number.isFinite(Number(t.order)) ? Number(t.order) : idx,
          snapshot: source ? buildTemplateSnapshot(source) : existing.snapshot,
        };
      })
      .filter(Boolean);

    if (hydratedTickets.length === 0) {
      return res.status(400).json({ message: 'No valid source tickets found' });
    }

    if (name !== undefined) template.name = name;
    if (description !== undefined) template.description = description;
    template.scope = nextScope;
    template.projectId = nextScope === 'project' ? projectId : undefined;
    template.tickets = hydratedTickets;

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

