import React, { useContext, useEffect, useMemo, useState } from 'react';
import Layout from '../components/Layout';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Search, Plus, Trash2, Pencil } from 'lucide-react';

const priorities = ['Low', 'Medium', 'High', 'Critical'];

const getPriorityPill = (priority) => {
  switch (priority) {
    case 'Critical':
      return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-100">Critical</span>;
    case 'High':
      return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 border border-orange-100">High</span>;
    case 'Medium':
      return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">Medium</span>;
    case 'Low':
      return <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-gray-50 text-gray-700 border border-gray-100">Low</span>;
    default:
      return null;
  }
};

const TemplateCardPreview = ({ issue, selected, onToggle, disabled }) => {
  if (!issue) return null;
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
        disabled
          ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
          : selected
            ? 'border-blue-300 bg-blue-50'
            : 'border-gray-200 hover:bg-white'
      }`}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={disabled ? undefined : onToggle}
        disabled={disabled}
        className="mt-1"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="font-semibold text-sm text-gray-900 truncate">{issue.title || 'Untitled'}</div>
          <div className="shrink-0">{getPriorityPill(issue.priority)}</div>
        </div>
        <div className="text-xs text-gray-500 mt-1 truncate">
          {issue.issueType || 'Task'} {issue.assignee?.name ? `• ${issue.assignee.name}` : ''}
        </div>
        {Array.isArray(issue.labels) && issue.labels.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {issue.labels.slice(0, 3).map((lab, idx) => (
              <span
                key={`${lab}-${idx}`}
                className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200"
              >
                {typeof lab === 'string' ? lab : (lab?.text || '')}
              </span>
            ))}
          </div>
        )}
      </div>
    </label>
  );
};

const TaskTemplates = () => {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [templates, setTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);

  // Create template form
  const [scope, setScope] = useState('global'); // global | project
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Ticket selection
  const [sourceProjectId, setSourceProjectId] = useState('');
  const [ticketQuery, setTicketQuery] = useState('');
  const [sourceIssues, setSourceIssues] = useState([]);
  const [editingTicketRows, setEditingTicketRows] = useState([]);
  const [selectedTicketIds, setSelectedTicketIds] = useState([]);

  // Edit mode
  const [editingTemplateId, setEditingTemplateId] = useState('');

  // Add tickets to an existing template
  const [isAddTicketsOpen, setIsAddTicketsOpen] = useState(false);
  const [addTicketsTemplate, setAddTicketsTemplate] = useState(null);
  const [addTicketsSourceProjectId, setAddTicketsSourceProjectId] = useState('');
  const [addTicketsQuery, setAddTicketsQuery] = useState('');
  const [addTicketsSourceIssues, setAddTicketsSourceIssues] = useState([]);
  const [addTicketsSelectedTicketIds, setAddTicketsSelectedTicketIds] = useState([]);

  const effectiveProjectId = scope === 'project' ? projectId : undefined;

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      try {
        const [projRes, usersRes] = await Promise.all([api.get('/projects'), api.get('/auth/users')]);
        setProjects(Array.isArray(projRes.data) ? projRes.data : []);
        setUsers(Array.isArray(usersRes.data) ? usersRes.data : []);

        const firstProjectId = projRes.data?.[0]?._id;
        if (!projectId && firstProjectId) setProjectId(firstProjectId);
        if (!sourceProjectId && firstProjectId) setSourceProjectId(firstProjectId);
      } finally {
        setLoading(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    // For project templates, the ticket source must match the target project.
    if (scope === 'project' && effectiveProjectId) setSourceProjectId(effectiveProjectId);
  }, [scope, effectiveProjectId]);

  const fetchTemplates = async () => {
    try {
      const params = { scope };
      if (scope === 'project' && effectiveProjectId) params.projectId = effectiveProjectId;
      const { data } = await api.get('/templates', { params });
      setTemplates(Array.isArray(data) ? data : []);
    } catch (e) {
      setTemplates([]);
    }
  };

  useEffect(() => {
    if (!user) return;
    if (scope === 'project' && !effectiveProjectId) return;
    fetchTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, scope, projectId]);

  const fetchSourceIssues = async (pid) => {
    if (!pid) return;
    try {
      const { data } = await api.get(`/issues/project/${pid}`);
      setSourceIssues(Array.isArray(data) ? data : []);
    } catch (e) {
      setSourceIssues([]);
    }
  };

  const fetchAddTicketsIssues = async (pid) => {
    if (!pid) return;
    try {
      const { data } = await api.get(`/issues/project/${pid}`);
      setAddTicketsSourceIssues(Array.isArray(data) ? data : []);
    } catch (e) {
      setAddTicketsSourceIssues([]);
    }
  };

  useEffect(() => {
    if (!sourceProjectId) return;
    fetchSourceIssues(sourceProjectId);
    if (!editingTemplateId) {
      setSelectedTicketIds([]);
      setTicketQuery('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceProjectId, editingTemplateId]);

  // Add tickets modal: load source issues when it opens / changes project
  useEffect(() => {
    if (!isAddTicketsOpen) return;
    if (!addTicketsSourceProjectId) return;
    fetchAddTicketsIssues(addTicketsSourceProjectId);
    setAddTicketsSelectedTicketIds([]);
    setAddTicketsQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAddTicketsOpen, addTicketsSourceProjectId]);

  const filteredIssues = useMemo(() => {
    const q = ticketQuery.trim().toLowerCase();
    if (!q) return sourceIssues;
    return sourceIssues.filter((i) => (i.title || '').toLowerCase().includes(q));
  }, [ticketQuery, sourceIssues]);

  const filteredEditingRows = useMemo(() => {
    const q = ticketQuery.trim().toLowerCase();
    if (!editingTemplateId) return [];
    const rows = Array.isArray(editingTicketRows) ? editingTicketRows : [];
    if (!q) return rows;
    return rows.filter((row) => (row?.issue?.title || '').toLowerCase().includes(q));
  }, [ticketQuery, editingTemplateId, editingTicketRows]);

  const editingSelectableRows = useMemo(() => {
    if (!editingTemplateId) return [];

    const existingRows = (Array.isArray(editingTicketRows) ? editingTicketRows : [])
      .map((row, idx) => {
        const templateTicketId = row?.templateTicketId || row?.ticketId || row?.issue?._id || `row-${idx}`;
        const payloadTicketId = row?.ticketId || row?.templateTicketId || row?.issue?._id;
        if (!payloadTicketId) return null;
        return {
          selectableId: `tmpl:${String(templateTicketId)}`,
          payloadTicketId: String(payloadTicketId),
          issue: row?.issue,
        };
      })
      .filter(Boolean);

    const existingSourceIds = new Set(
      existingRows
        .map((r) => r?.issue?.sourceIssueId || r?.issue?._id)
        .filter(Boolean)
        .map(String)
    );

    const addableRows = (Array.isArray(sourceIssues) ? sourceIssues : [])
      .filter((issue) => issue?._id && !existingSourceIds.has(String(issue._id)))
      .map((issue) => ({
        selectableId: `live:${String(issue._id)}`,
        payloadTicketId: String(issue._id),
        issue,
      }));

    return [...existingRows, ...addableRows];
  }, [editingTemplateId, editingTicketRows, sourceIssues]);

  const filteredEditingSelectableRows = useMemo(() => {
    const q = ticketQuery.trim().toLowerCase();
    if (!editingTemplateId) return [];
    if (!q) return editingSelectableRows;
    return editingSelectableRows.filter((row) => (row?.issue?.title || '').toLowerCase().includes(q));
  }, [ticketQuery, editingTemplateId, editingSelectableRows]);

  const selectedSet = useMemo(() => new Set(selectedTicketIds.map(String)), [selectedTicketIds]);

  const addTicketsFilteredIssues = useMemo(() => {
    const q = addTicketsQuery.trim().toLowerCase();
    if (!q) return addTicketsSourceIssues;
    return addTicketsSourceIssues.filter((i) => (i.title || '').toLowerCase().includes(q));
  }, [addTicketsQuery, addTicketsSourceIssues]);

  const addTicketsSelectedSet = useMemo(
    () => new Set(addTicketsSelectedTicketIds.map(String)),
    [addTicketsSelectedTicketIds]
  );

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      showToast('Template name is required', 'warning');
      return;
    }
    if (scope === 'project' && !effectiveProjectId) {
      showToast('Select target project for project template', 'warning');
      return;
    }
    if (selectedTicketIds.length === 0) {
      showToast('Select at least 1 ticket for the template', 'warning');
      return;
    }

    const payload = {
      name: name.trim(),
      description,
      scope,
      ...(scope === 'project' ? { projectId: effectiveProjectId } : {}),
      tickets: selectedTicketIds.map((tid, idx) => {
        if (!editingTemplateId) {
          return { ticketId: tid, order: idx };
        }
        const row = editingSelectableRows.find((r) => String(r.selectableId) === String(tid));
        // Use live ticketId when available, fallback to template ticket id to preserve snapshot rows.
        const persistedId = row?.payloadTicketId || tid;
        return { ticketId: persistedId, order: idx };
      }),
    };

    setSaving(true);
    try {
      if (editingTemplateId) {
        await api.put(`/templates/${editingTemplateId}`, payload);
      } else {
        await api.post('/templates', payload);
      }

      // Reset form
      setEditingTemplateId('');
      setName('');
      setDescription('');
      setEditingTicketRows([]);
      setSelectedTicketIds([]);
      setTicketQuery('');
      fetchTemplates();
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to create template', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Delete this template?')) return;
    try {
      await api.delete(`/templates/${templateId}`);
      fetchTemplates();
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to delete template', 'error');
    }
  };

  const handleEditTemplate = async (template) => {
    if (!template?._id) return;
    try {
      setEditingTemplateId(template._id);
      setName(template.name || '');
      setDescription(template.description || '');
      setScope(template.scope || 'global');

      const templateProjectId =
        template.scope === 'project' ? (template.projectId?._id || template.projectId || '') : '';

      if (template.scope === 'project') setProjectId(templateProjectId);

      // If project-scoped, the ticket source is the same project.
      // If global, infer ticket source project from the first ticket in the template.
      if (template.scope === 'project') {
        setSourceProjectId(templateProjectId);
      } else {
        setSourceProjectId('');
      }

      const { data: rows } = await api.get(`/templates/${template._id}/tickets`);
      const normalizedRows = Array.isArray(rows) ? rows : [];
      setEditingTicketRows(normalizedRows);
      const firstProjectId = normalizedRows?.[0]?.issue?.projectId?._id || normalizedRows?.[0]?.issue?.projectId || '';
      if (firstProjectId) setSourceProjectId(String(firstProjectId));
      const orderedTicketIds = normalizedRows
        .map((row) => `tmpl:${String(row?.templateTicketId || row?.ticketId || row?.issue?._id || '')}`)
        .filter(Boolean)
        .map(String);
      setSelectedTicketIds(orderedTicketIds);
      setTicketQuery('');
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to load template for editing', 'error');
    }
  };

  const openAddTicketsModal = async (template) => {
    if (!template?._id) return;
    setAddTicketsTemplate(template);
    const defaultProjectId =
      template.scope === 'project'
        ? (template.projectId?._id || template.projectId || '')
        : (sourceProjectId || projects?.[0]?._id || '');

    setAddTicketsSourceProjectId(String(defaultProjectId || ''));
    setAddTicketsQuery('');
    setAddTicketsSelectedTicketIds([]);
    setIsAddTicketsOpen(true);
  };

  const handleAddTicketsToTemplate = async () => {
    if (!addTicketsTemplate?._id) return;
    if (!Array.isArray(addTicketsSelectedTicketIds) || addTicketsSelectedTicketIds.length === 0) {
      showToast('Select at least one ticket to add', 'warning');
      return;
    }

    try {
      setSaving(true);
      const tidList = addTicketsSelectedTicketIds.map(String);
      await Promise.all(
        tidList.map((tid) => api.post(`/templates/${addTicketsTemplate._id}/tickets`, { ticketId: tid }))
      );
      setIsAddTicketsOpen(false);
      setAddTicketsTemplate(null);
      setAddTicketsSelectedTicketIds([]);
      setAddTicketsQuery('');
      fetchTemplates();
    } catch (e) {
      showToast(e.response?.data?.message || 'Failed to add tickets to template', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout title="Task Templates">
        <div className="flex justify-center items-center h-full text-blue-600 font-semibold">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout title="Task Templates">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{editingTemplateId ? 'Edit Template' : 'Create Template'}</h2>
          <p className="text-sm text-gray-500 mt-2">
            Store references to existing tickets and import them selectively into any project later.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6">
          <form onSubmit={handleCreateTemplate}>
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Name</label>
              <input
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Game QA Template"
                required
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
              <textarea
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this template include?"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Scope</label>
                <select
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={scope}
                  onChange={(e) => {
                    setScope(e.target.value);
                    setSelectedTicketIds([]);
                  }}
                >
                  <option value="global">Global (all projects)</option>
                  <option value="project">Project specific</option>
                </select>
              </div>

              {scope === 'project' ? (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Project</label>
                  <select
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.key} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

              {scope === 'global' ? (
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Select Tickets (source project)
                  </label>
                  <select
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={sourceProjectId}
                    onChange={(e) => setSourceProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.key} - {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

            <div className="mb-4">
              <div className="relative w-full">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search tickets by title..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={ticketQuery}
                  onChange={(e) => setTicketQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1 pb-2 scrollbar-hide">
              {(editingTemplateId ? filteredEditingSelectableRows : filteredIssues).length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-10">
                  {editingTemplateId
                    ? 'No template tickets found for update.'
                    : 'No tickets found.'}
                </div>
              ) : (
                (editingTemplateId ? filteredEditingSelectableRows : filteredIssues).map((rowOrIssue) => {
                  const issue = editingTemplateId ? rowOrIssue?.issue : rowOrIssue;
                  const selectableId = editingTemplateId
                    ? String(rowOrIssue?.selectableId)
                    : String(rowOrIssue?._id);
                  const previewIssue = editingTemplateId ? { ...issue, _id: selectableId } : issue;
                  return (
                  <TemplateCardPreview
                    key={selectableId}
                    issue={previewIssue}
                    selected={selectedSet.has(selectableId)}
                    onToggle={() => {
                      const id = selectableId;
                      setSelectedTicketIds((prev) => {
                        const set = new Set(prev.map(String));
                        if (set.has(id)) set.delete(id);
                        else set.add(id);
                        return Array.from(set);
                      });
                    }}
                  />
                );
                })
              )}
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                type="button"
                onClick={() => {
                  setEditingTemplateId('');
                  setName('');
                  setDescription('');
                  setEditingTicketRows([]);
                  setSelectedTicketIds([]);
                  setTicketQuery('');
                }}
                className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (editingTemplateId ? 'Saving...' : 'Creating...') : editingTemplateId ? 'Update Template' : 'Create Template'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h3 className="font-bold text-gray-900 mb-4">Your Templates</h3>
          {templates.length === 0 ? (
            <div className="text-sm text-gray-500">No templates for this scope.</div>
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1 pb-2 scrollbar-hide">
              {templates.map((t) => (
                <div key={t._id} className="flex items-start justify-between gap-4 p-4 border border-gray-200 rounded-xl">
                  <div className="min-w-0">
                    <div className="font-semibold text-gray-900 truncate">{t.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {t.scope}{t.scope === 'project' && t.projectId ? ` • ${t.projectId.key}` : ''} • {t.tickets?.length || 0} tickets
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleEditTemplate(t)}
                      className="p-2 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition"
                      title="Edit template"
                    >
                      <Pencil size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(t._id)}
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition"
                      title="Delete template"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default TaskTemplates;

