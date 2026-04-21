import React, { useState, useEffect, useContext, useRef } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  X,
  Send,
  Calendar,
  MoreHorizontal,
  Trash2,
  ArrowRight,
  UserPlus,
  UserMinus,
  CircleDot,
  Plus,
} from 'lucide-react';

const TicketDetailsModal = ({
  issue,
  project,
  onClose,
  onUpdate,
  initialTab = 'details',
  initialLifelineTab = 'assigned',
}) => {
  const LABEL_COLORS = [
    { id: 'red', className: 'bg-red-500' },
    { id: 'orange', className: 'bg-orange-500' },
    { id: 'yellow', className: 'bg-yellow-500' },
    { id: 'green', className: 'bg-green-500' },
    { id: 'blue', className: 'bg-blue-500' },
    { id: 'purple', className: 'bg-purple-500' },
  ];
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [lifelineTab, setLifelineTab] = useState(initialLifelineTab);
  const [editMode, setEditMode] = useState(false);
  const [editedIssue, setEditedIssue] = useState({ ...issue });
  const [newIteration, setNewIteration] = useState('');
  const [mentionMenu, setMentionMenu] = useState({
    open: false,
    query: '',
    start: -1,
    end: -1,
    activeIndex: 0,
  });
  const [loading, setLoading] = useState(false);

  // Template integration (Add this ticket to a template)
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const [actionsOpen, setActionsOpen] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [assigneeSelectId, setAssigneeSelectId] = useState('');
  const actionsMenuRef = useRef(null);
  const iterationInputRef = useRef(null);
  const iterationListRef = useRef(null);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newChecklistAssigneeId, setNewChecklistAssigneeId] = useState('');
  const [newLabelText, setNewLabelText] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('blue');
  const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
  const [projectIssueOptions, setProjectIssueOptions] = useState([]);
  const [isDependencyModalOpen, setIsDependencyModalOpen] = useState(false);
  const [dependencySearchText, setDependencySearchText] = useState('');
  const [selectedDependencyId, setSelectedDependencyId] = useState('');
  const [isSubtaskAssigneeModalOpen, setIsSubtaskAssigneeModalOpen] = useState(false);
  const [subtaskAssigneeSearchText, setSubtaskAssigneeSearchText] = useState('');
  const [selectedSubtaskAssigneeId, setSelectedSubtaskAssigneeId] = useState('');
  const [activeSubtaskIndex, setActiveSubtaskIndex] = useState(null);

  const getUrgencyStyles = () => {
    const dueOverdue = issue?.dueDate && new Date(issue.dueDate).getTime() < Date.now() && issue.status !== 'Done';
    if (dueOverdue) return { header: 'bg-red-50 border-red-100', badge: 'bg-red-100 text-red-700' };
    switch (issue?.priority) {
      case 'Critical': return { header: 'bg-rose-50 border-rose-100', badge: 'bg-rose-100 text-rose-700' };
      case 'High': return { header: 'bg-orange-50 border-orange-100', badge: 'bg-orange-100 text-orange-700' };
      case 'Medium': return { header: 'bg-blue-50 border-blue-100', badge: 'bg-blue-100 text-blue-700' };
      case 'Low': return { header: 'bg-gray-50 border-gray-100', badge: 'bg-gray-200 text-gray-700' };
      default: return { header: 'bg-gray-50 border-gray-100', badge: 'bg-gray-200 text-gray-700' };
    }
  };
  const urgency = getUrgencyStyles();

  const availableMembers = (() => {
    if (!project) return [];
    const all = [project.createdBy, ...(project.members || []), ...(project.leads || [])].filter(Boolean);
    const byId = new Map();
    all.forEach((u) => {
      const id = u?._id || u;
      if (!id) return;
      const key = String(id);
      if (!byId.has(key)) byId.set(key, u);
    });
    return Array.from(byId.values());
  })();

  const isIssueCreator = String(issue?.reporter?._id || issue?.reporter) === String(user?._id);

  const handleDeleteIssue = async () => {
    if (!isIssueCreator) return;
    if (!window.confirm('Delete this ticket? This cannot be undone.')) return;
    try {
      setLoading(true);
      await api.delete(`/issues/${issue._id}`);
      onClose?.();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete issue', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToTemplate = async () => {
    if (!selectedTemplateId) {
      showToast('Select a template first', 'warning');
      return;
    }
    try {
      setLoading(true);
      await api.post(`/templates/${selectedTemplateId}/tickets`, { ticketId: issue._id });
      showToast('Added to template', 'success');
      setSelectedTemplateId('');
      setShowTemplatePicker(false);
      setActionsOpen(false);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add to template', 'error');
    } finally {
      setLoading(false);
    }
  };

  const currentAssigneeObjs = (() => {
    const raw =
      Array.isArray(issue?.assignees) && issue.assignees.length > 0
        ? issue.assignees
        : issue?.assignee
          ? [issue.assignee]
          : [];

    return raw
      .map((a) => {
        if (!a) return null;
        if (a?._id) return a;
        const id = a?._id || a;
        const found = availableMembers.find((u) => String(u?._id || u) === String(id));
        return found || null;
      })
      .filter(Boolean);
  })();

  const currentAssigneeIds = currentAssigneeObjs.map((u) => String(u._id));
  const isIssueAssignee = currentAssigneeIds.includes(String(user?._id));
  const canManageSubtasks = isIssueCreator || isIssueAssignee;
  const lifelineAssigned = Array.isArray(issue?.lifeline?.assigned)
    ? [...issue.lifeline.assigned].sort((a, b) => new Date(b.changedAt || 0) - new Date(a.changedAt || 0))
    : [];
  const lifelineStatus = Array.isArray(issue?.lifeline?.status)
    ? [...issue.lifeline.status].sort((a, b) => new Date(b.changedAt || 0) - new Date(a.changedAt || 0))
    : [];
  const lifelineIterations = Array.isArray(issue?.lifeline?.iterations)
    ? [...issue.lifeline.iterations].sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    : [];
  const normalizedLabels = Array.isArray(issue?.labels)
    ? issue.labels
        .map((label) => {
          if (typeof label === 'string') {
            const text = label.trim();
            return text ? { text, color: 'blue' } : null;
          }
          const text = String(label?.text || '').trim();
          if (!text) return null;
          return {
            text,
            color: LABEL_COLORS.some((c) => c.id === label?.color) ? label.color : 'blue',
          };
        })
        .filter(Boolean)
    : [];

  const getInitial = (name) => (String(name || '?').trim().charAt(0) || '?').toUpperCase();
  const formatDateTime = (value) => {
    const parsed = value ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed.toLocaleString() : 'Unknown time';
  };
  const getStatusBadge = (status) => {
    switch (status) {
      case 'Backlog':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Todo':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'In Progress':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'In Review':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'Testing':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'Done':
        return 'bg-green-50 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getUserObject = (raw) => {
    if (!raw) return null;
    if (raw?._id) return raw;
    return availableMembers.find((member) => String(member?._id || member) === String(raw)) || null;
  };

  const currentDependencyIds = Array.isArray(issue?.dependencies)
    ? issue.dependencies.map((dependency) => String(dependency?._id || dependency))
    : [];
  const dependencyMap = new Map(projectIssueOptions.map((ticket) => [String(ticket._id), ticket]));
  const currentDependencies = currentDependencyIds
    .map((dependencyId) => dependencyMap.get(String(dependencyId)) || { _id: dependencyId, title: dependencyId })
    .filter(Boolean);

  const handleAssigneesUpdate = async (nextIds) => {
    const normalized = Array.isArray(nextIds) ? nextIds.filter(Boolean).map(String) : [];
    const payload = {
      assignees: normalized,
      assignee: normalized.length > 0 ? normalized[0] : null,
    };
    try {
      setLoading(true);
      const { data } = await api.put(`/issues/${issue._id}`, payload);
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, ...data }));
      setAssigneeSelectId('');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update assignees', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveAssignee = (id) => {
    const next = currentAssigneeIds.filter((x) => String(x) !== String(id));
    handleAssigneesUpdate(next);
  };

  const handleAddAssignee = () => {
    if (!assigneeSelectId) return;
    const next = Array.from(new Set([...currentAssigneeIds, String(assigneeSelectId)]));
    handleAssigneesUpdate(next);
  };

  const handleAddLabel = async () => {
    const text = newLabelText.trim();
    if (!text) return false;
    const exists = normalizedLabels.some((l) => l.text.toLowerCase() === text.toLowerCase() && l.color === newLabelColor);
    if (exists) return false;
    try {
      setLoading(true);
      const { data } = await api.put(`/issues/${issue._id}`, {
        labels: [...normalizedLabels, { text, color: newLabelColor }],
      });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, ...data }));
      setNewLabelText('');
      return true;
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add label', 'error');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveLabel = async (index) => {
    try {
      setLoading(true);
      const next = normalizedLabels.filter((_, idx) => idx !== index);
      const { data } = await api.put(`/issues/${issue._id}`, { labels: next });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, ...data }));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to remove label', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadTemplates = async () => {
      if (!issue?._id || !project?._id) return;
      setTemplatesLoading(true);
      try {
        const [globalRes, projectRes] = await Promise.all([
          api.get('/templates', { params: { scope: 'global' } }),
          api.get('/templates', { params: { scope: 'project', projectId: project._id } }),
        ]);
        const globalTemplates = Array.isArray(globalRes.data) ? globalRes.data : [];
        const projectTemplates = Array.isArray(projectRes.data) ? projectRes.data : [];
        setTemplates([...globalTemplates, ...projectTemplates]);
      } catch (e) {
        setTemplates([]);
      } finally {
        setTemplatesLoading(false);
      }
    };
    loadTemplates();
  }, [issue?._id, project?._id]);

  useEffect(() => {
    const loadProjectIssues = async () => {
      if (!project?._id) return;
      try {
        const { data } = await api.get(`/issues/project/${project._id}`);
        const options = Array.isArray(data) ? data.filter((ticket) => String(ticket._id) !== String(issue?._id)) : [];
        setProjectIssueOptions(options);
      } catch (error) {
        setProjectIssueOptions([]);
      }
    };
    loadProjectIssues();
  }, [project?._id, issue?._id]);

  // Close actions menu when clicking outside
  useEffect(() => {
    if (!actionsOpen) return;
    const onDown = (e) => {
      if (!actionsMenuRef.current) return;
      if (!actionsMenuRef.current.contains(e.target)) {
        setActionsOpen(false);
        setShowTemplatePicker(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [actionsOpen]);

  useEffect(() => {
    if (activeTab === 'lifeline' && lifelineTab === 'iteration') {
      const timer = setTimeout(() => {
        iterationInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [activeTab, lifelineTab]);

  useEffect(() => {
    if (activeTab !== 'lifeline' || lifelineTab !== 'iteration') return;
    const list = iterationListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [activeTab, lifelineTab, lifelineIterations.length]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const { data } = await api.put(`/issues/${issue._id}`, editedIssue);
      onUpdate(data);
      setEditMode(false);
    } catch (err) {
      showToast('Failed to update issue', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handlePriorityChange = async (priority) => {
    try {
      setLoading(true);
      const { data } = await api.patch(`/issues/${issue._id}/priority`, { priority });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, priority: data.priority }));
    } catch (err) {
      showToast('Failed to update priority', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDueDateChange = async (dueDate) => {
    try {
      setLoading(true);
      const { data } = await api.patch(`/issues/${issue._id}/due-date`, { dueDate });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, dueDate: data.dueDate }));
    } catch (err) {
      showToast('Failed to update due date', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleRiskLevelChange = async (riskLevel) => {
    try {
      setLoading(true);
      const { data } = await api.put(`/issues/${issue._id}`, { riskLevel });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, riskLevel: data.riskLevel }));
    } catch (err) {
      showToast('Failed to update risk level', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleDependenciesChange = async (dependencyIds) => {
    try {
      setLoading(true);
      const { data } = await api.put(`/issues/${issue._id}`, { dependencies: dependencyIds });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, dependencies: data.dependencies }));
    } catch (err) {
      showToast('Failed to update dependencies', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDependency = async () => {
    if (!selectedDependencyId) return;
    const next = Array.from(new Set([...currentDependencyIds, String(selectedDependencyId)]));
    await handleDependenciesChange(next);
    setSelectedDependencyId('');
    setDependencySearchText('');
    setIsDependencyModalOpen(false);
  };

  const handleRemoveDependency = async (dependencyId) => {
    const next = currentDependencyIds.filter((id) => String(id) !== String(dependencyId));
    await handleDependenciesChange(next);
  };

  const handleChecklistToggle = async (index) => {
    if (!Array.isArray(issue?.checklist)) return;
    const source = editMode && Array.isArray(editedIssue?.checklist) ? editedIssue.checklist : issue.checklist;
    const current = Array.isArray(source) ? source : [];
    if (!current[index]) return;

    const next = current.map((item, i) =>
      i === index ? { ...item, completed: !item.completed } : item
    );

    try {
      setLoading(true);
      const { data } = await api.patch(`/issues/${issue._id}/checklist`, { checklist: next });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, checklist: data.checklist }));
    } catch (err) {
      showToast('Failed to update checklist', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddChecklistItem = async () => {
    const text = newChecklistText.trim();
    if (!text) return;
    const current = Array.isArray(issue?.checklist) ? issue.checklist : [];
    const next = [...current, { text, completed: false, assignee: newChecklistAssigneeId || user?._id || null }];
    try {
      setLoading(true);
      const { data } = await api.patch(`/issues/${issue._id}/checklist`, { checklist: next });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, checklist: data.checklist }));
      setNewChecklistText('');
      setNewChecklistAssigneeId('');
    } catch (err) {
      showToast('Failed to add checklist item', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleChecklistAssigneeChange = async (index, assigneeId) => {
    const current = Array.isArray(issue?.checklist) ? issue.checklist : [];
    if (!current[index]) return;
    const next = current.map((item, idx) => (
      idx === index ? { ...item, assignee: assigneeId || null } : item
    ));
    try {
      setLoading(true);
      const { data } = await api.patch(`/issues/${issue._id}/checklist`, { checklist: next });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, checklist: data.checklist }));
    } catch (err) {
      showToast('Failed to update subtask assignee', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openSubtaskAssigneeModal = (index) => {
    const current = Array.isArray(issue?.checklist) ? issue.checklist : [];
    const currentAssigneeId = current[index]?.assignee?._id || current[index]?.assignee || '';
    setActiveSubtaskIndex(index);
    setSelectedSubtaskAssigneeId(String(currentAssigneeId || ''));
    setSubtaskAssigneeSearchText('');
    setIsSubtaskAssigneeModalOpen(true);
  };

  const closeSubtaskAssigneeModal = () => {
    setIsSubtaskAssigneeModalOpen(false);
    setSubtaskAssigneeSearchText('');
    setSelectedSubtaskAssigneeId('');
    setActiveSubtaskIndex(null);
  };

  const submitSubtaskAssigneeModal = async () => {
    if (activeSubtaskIndex === null || activeSubtaskIndex === undefined) return;
    await handleChecklistAssigneeChange(activeSubtaskIndex, selectedSubtaskAssigneeId || null);
    closeSubtaskAssigneeModal();
  };

  const handleDeleteChecklistItem = async (index) => {
    const current = Array.isArray(issue?.checklist) ? issue.checklist : [];
    if (!current[index]) return;
    const next = current.filter((_, i) => i !== index);
    try {
      setLoading(true);
      const { data } = await api.patch(`/issues/${issue._id}/checklist`, { checklist: next });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, checklist: data.checklist }));
    } catch (err) {
      showToast('Failed to delete subtask', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddIteration = async (e) => {
    e.preventDefault();
    if (!newIteration.trim()) return;
    try {
      setLoading(true);
      const { data } = await api.post(`/issues/${issue._id}/lifeline/iterations`, { content: newIteration.trim() });
      onUpdate(data);
      setEditedIssue((prev) => ({ ...prev, ...data }));
      setNewIteration('');
      setTimeout(() => iterationInputRef.current?.focus(), 0);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to add iteration update', 'error');
    } finally {
      setLoading(false);
    }
  };

  const mentionOptions = (() => {
    const base = [{ id: 'everyone', label: 'everyone' }];
    availableMembers.forEach((member) => {
      const id = String(member?._id || '');
      const label = String(member?.name || '').trim();
      if (!id || !label) return;
      base.push({ id, label });
    });
    const seen = new Set();
    return base.filter((entry) => {
      const key = String(entry.label || '').toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })();

  const getMentionContext = (text, caretIndex) => {
    const safeText = String(text || '');
    const safeCaret = Number.isFinite(caretIndex) ? caretIndex : safeText.length;
    const beforeCaret = safeText.slice(0, safeCaret);
    const match = beforeCaret.match(/(?:^|\s)@([^\s\[\]]*)$/);
    if (!match) return null;
    return {
      query: String(match[1] || ''),
      start: safeCaret - String(match[1] || '').length - 1,
      end: safeCaret,
    };
  };

  const getFilteredMentionOptions = (query) => {
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized) return mentionOptions;
    return mentionOptions.filter((option) => option.label.toLowerCase().includes(normalized));
  };

  const updateMentionMenu = (textareaEl) => {
    if (!textareaEl) return;
    const context = getMentionContext(textareaEl.value, textareaEl.selectionStart);
    if (!context) {
      setMentionMenu((prev) => ({ ...prev, open: false }));
      return;
    }
    const filtered = getFilteredMentionOptions(context.query);
    if (filtered.length === 0) {
      setMentionMenu((prev) => ({ ...prev, open: false }));
      return;
    }
    setMentionMenu({
      open: true,
      query: context.query,
      start: context.start,
      end: context.end,
      activeIndex: 0,
    });
  };

  const applyMentionSelection = (option) => {
    const activeOption = option || getFilteredMentionOptions(mentionMenu.query)[mentionMenu.activeIndex] || null;
    if (!activeOption) return;
    const safeStart = mentionMenu.start >= 0 ? mentionMenu.start : newIteration.length;
    const safeEnd = mentionMenu.end >= 0 ? mentionMenu.end : newIteration.length;
    const prefix = newIteration.slice(0, safeStart);
    const suffix = newIteration.slice(safeEnd);
    const inserted = `@[${activeOption.label}] `;
    const nextValue = `${prefix}${inserted}${suffix}`;
    const caretPos = prefix.length + inserted.length;

    setNewIteration(nextValue);
    setMentionMenu((prev) => ({ ...prev, open: false }));
    setTimeout(() => {
      if (!iterationInputRef.current) return;
      iterationInputRef.current.focus();
      iterationInputRef.current.setSelectionRange(caretPos, caretPos);
    }, 0);
  };

  const normalizeMentionToken = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const mentionRegex = /(@\[[^\]]+\]|@[a-zA-Z0-9._-]+)/g;
  const currentUserMentionTokens = new Set(
    [
      normalizeMentionToken(user?.name),
      normalizeMentionToken(String(user?.name || '').replace(/\s+/g, '')),
      normalizeMentionToken(String(user?.email || '').split('@')[0]),
    ].filter(Boolean)
  );

  const getMentionTokenValue = (mentionText) => {
    const raw = mentionText.startsWith('@[') && mentionText.endsWith(']')
      ? mentionText.slice(2, -1)
      : mentionText.slice(1);
    return normalizeMentionToken(raw);
  };

  const renderIterationContent = (content, isOwnMessage) => {
    const text = String(content || '');
    if (!text) return null;

    const nodes = [];
    let lastIndex = 0;
    let index = 0;
    for (const match of text.matchAll(mentionRegex)) {
      const mentionText = match[0];
      const start = match.index || 0;
      const end = start + mentionText.length;

      if (start > lastIndex) {
        nodes.push(<span key={`text-${index++}`}>{text.slice(lastIndex, start)}</span>);
      }

      const tokenValue = getMentionTokenValue(mentionText);
      const isEveryone = tokenValue === 'everyone';
      const isTaggedToMe = isEveryone || currentUserMentionTokens.has(tokenValue);
      const mentionClass = isTaggedToMe
        ? isOwnMessage
          ? 'bg-white/20 text-white ring-1 ring-white/40'
          : 'bg-amber-100 text-amber-800 ring-1 ring-amber-200'
        : isOwnMessage
          ? 'bg-white/15 text-white'
          : 'bg-blue-50 text-blue-700';

      nodes.push(
        <span key={`mention-${index++}`} className={`inline-block px-1.5 py-0.5 rounded font-semibold ${mentionClass}`}>
          {mentionText}
        </span>
      );
      lastIndex = end;
    }

    if (lastIndex < text.length) {
      nodes.push(<span key={`text-${index++}`}>{text.slice(lastIndex)}</span>);
    }

    return nodes;
  };

  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-60 overflow-y-auto h-full w-full z-50 flex justify-center items-center backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden relative">
        
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${urgency.header}`}>
          <div className="flex items-center space-x-3">
            <span className={`text-sm font-bold px-2 py-1 rounded ${urgency.badge}`}>
              {project.key}-{issue._id.slice(-4).toUpperCase()}
            </span>
            {editMode ? (
              <input 
                type="text" 
                className="text-xl font-bold text-gray-800 border-b-2 border-blue-500 focus:outline-none bg-transparent"
                value={editedIssue.title}
                onChange={(e) => setEditedIssue({...editedIssue, title: e.target.value})}
              />
            ) : (
              <h2 className="text-xl font-bold text-gray-800">{issue.title}</h2>
            )}
          </div>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition">
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Main Area */}
          <div className="flex-1 p-6 overflow-y-auto">
            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
              <button 
                className={`py-2 px-4 font-semibold text-sm ${activeTab === 'details' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('details')}
              >
                Details
              </button>
              <button 
                className={`py-2 px-4 font-semibold text-sm ${activeTab === 'lifeline' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('lifeline')}
              >
                Lifeline
              </button>
            </div>

            {activeTab === 'details' ? (
              <div>
                <h3 className="font-semibold text-gray-700 mb-2">Description</h3>
                {editMode ? (
                  <textarea
                    className="w-full p-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[150px]"
                    value={editedIssue.description || ''}
                    onChange={(e) => setEditedIssue({...editedIssue, description: e.target.value})}
                  />
                ) : (
                  <div className="bg-gray-50 p-4 rounded-lg min-h-[150px] text-gray-700 whitespace-pre-wrap">
                    {issue.description || <span className="text-gray-400 italic">No description provided.</span>}
                  </div>
                )}

                {editMode && (
                  <div className="mt-4 flex justify-end space-x-2">
                    <button onClick={() => setEditMode(false)} className="px-4 py-2 font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200">Cancel</button>
                    <button onClick={handleSave} disabled={loading} className="px-4 py-2 font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">Save Changes</button>
                  </div>
                )}
                {!editMode && (
                  <div className="mt-4">
                     <button onClick={() => setEditMode(true)} className="text-sm text-blue-600 font-semibold hover:underline">Edit Description</button>
                  </div>
                )}

                <div className="mt-6 border border-gray-200 rounded-xl bg-white p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-700">Subtasks</h3>
                    {!canManageSubtasks && (
                      <span className="text-[11px] text-gray-400">Only creator/assignees can edit</span>
                    )}
                  </div>

                  <div className="mt-3 space-y-2">
                    {Array.isArray(issue?.checklist) && issue.checklist.length > 0 ? (
                      issue.checklist.map((item, idx) => (
                        <div
                          key={`${idx}-${item?.text || 'item'}`}
                          className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 bg-gray-50"
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(item?.completed)}
                            onChange={() => canManageSubtasks && handleChecklistToggle(idx)}
                            disabled={loading || !canManageSubtasks}
                            className="w-4 h-4 accent-blue-600"
                          />
                          <span
                            className={`flex-1 text-sm text-gray-700 ${
                              item?.completed ? 'line-through text-gray-400' : ''
                            }`}
                          >
                            {item?.text}
                          </span>
                          <div className="min-w-[160px]">
                            <div className="flex items-center gap-1.5">
                              <div className="flex items-center bg-gray-50 text-gray-700 px-2 py-1 rounded-full text-[11px] font-medium border border-gray-200 max-w-[130px]">
                                <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center mr-1 text-white font-bold">
                                  {getUserObject(item?.assignee)?.name?.charAt(0) || '?'}
                                </span>
                                <span className="truncate">
                                  {getUserObject(item?.assignee)?.name || 'Unassigned'}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => openSubtaskAssigneeModal(idx)}
                                disabled={loading || !canManageSubtasks}
                                className="inline-flex items-center justify-center w-6 h-6 rounded-full text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition disabled:opacity-50"
                                title="Assign subtask"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                            <div className="mt-1 text-[10px] text-gray-500 truncate">
                              Working on: {getUserObject(item?.assignee)?.name || 'Nobody yet'}
                            </div>
                          </div>
                          {canManageSubtasks && (
                            <button
                              type="button"
                              onClick={() => handleDeleteChecklistItem(idx)}
                              disabled={loading}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-50"
                              title="Delete subtask"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-gray-400">No subtasks yet.</div>
                    )}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="text"
                      value={newChecklistText}
                      onChange={(e) => setNewChecklistText(e.target.value)}
                      placeholder="Add subtask..."
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={loading || !canManageSubtasks}
                    />
                    <button
                      type="button"
                      onClick={handleAddChecklistItem}
                      disabled={loading || !canManageSubtasks || !newChecklistText.trim()}
                      className="px-3 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition text-sm"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-gray-200 pb-3">
                  {[
                    { id: 'assigned', label: `Assigned (${lifelineAssigned.length})` },
                    { id: 'status', label: `Status (${lifelineStatus.length})` },
                    { id: 'iteration', label: `Iteration (${lifelineIterations.length})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setLifelineTab(tab.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        lifelineTab === tab.id
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div ref={iterationListRef} className="flex-1 overflow-y-auto mb-4 space-y-3 pr-2">
                  {lifelineTab === 'assigned' && (
                    <>
                      {lifelineAssigned.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No assignment activity yet.</div>
                      ) : (
                        lifelineAssigned.map((entry, idx) => (
                          <div key={`${entry._id || idx}-assigned`} className="relative pl-10">
                            <div className="absolute left-4 top-2 bottom-0 w-px bg-gray-200" />
                            <div className="absolute left-1.5 top-2 h-5 w-5 rounded-full bg-white border-2 border-blue-200 flex items-center justify-center">
                              <CircleDot size={10} className="text-blue-600" />
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                                    {getInitial(entry.assignee?.name)}
                                  </span>
                                  <span className="text-sm font-semibold text-gray-800 truncate">
                                    {entry.assignee?.name || 'Unknown user'}
                                  </span>
                                </div>
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border ${
                                    entry.action === 'unassigned'
                                      ? 'bg-red-50 text-red-700 border-red-200'
                                      : 'bg-green-50 text-green-700 border-green-200'
                                  }`}
                                >
                                  {entry.action === 'unassigned' ? <UserMinus size={12} /> : <UserPlus size={12} />}
                                  {entry.action === 'unassigned' ? 'Arrow Out' : 'Arrow In'}
                                </span>
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                by {entry.actor?.name || 'Unknown'} on {formatDateTime(entry.changedAt)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {lifelineTab === 'status' && (
                    <>
                      {lifelineStatus.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No status history available.</div>
                      ) : (
                        lifelineStatus.map((entry, idx) => (
                          <div key={`${entry._id || idx}-status`} className="relative pl-10">
                            <div className="absolute left-4 top-2 bottom-0 w-px bg-gray-200" />
                            <div className="absolute left-1.5 top-2 h-5 w-5 rounded-full bg-white border-2 border-purple-200 flex items-center justify-center">
                              <CircleDot size={10} className="text-purple-600" />
                            </div>
                            <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                              <div className="flex flex-wrap items-center gap-2">
                                {entry.from ? (
                                  <>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusBadge(entry.from)}`}>
                                      {entry.from}
                                    </span>
                                    <ArrowRight size={14} className="text-gray-400" />
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusBadge(entry.to)}`}>
                                      {entry.to}
                                    </span>
                                  </>
                                ) : (
                                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusBadge(entry.to)}`}>
                                    Created as {entry.to}
                                  </span>
                                )}
                              </div>
                              <div className="mt-2 text-xs text-gray-500">
                                by {entry.actor?.name || 'Unknown'} on {formatDateTime(entry.changedAt)}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </>
                  )}

                  {lifelineTab === 'iteration' && (
                    <>
                      {lifelineIterations.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">No iteration updates yet.</div>
                      ) : (
                        lifelineIterations.map((entry, idx) => {
                          const isOwnMessage = String(entry.author?._id || '') === String(user?._id || '');
                          return (
                          <div
                            key={`${entry._id || idx}-iteration`}
                            className={`flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className="max-w-[85%]">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center">
                                  {getInitial(entry.author?.name)}
                                </span>
                                <span className="text-xs font-semibold text-gray-700">{entry.author?.name || 'Unknown'}</span>
                                <span className="text-[11px] text-gray-400">{formatDateTime(entry.createdAt)}</span>
                              </div>
                              <div
                                className={`rounded-2xl border px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                                  isOwnMessage
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-800 border-gray-200'
                                }`}
                              >
                                {renderIterationContent(entry.content, isOwnMessage)}
                              </div>
                            </div>
                          </div>
                          );
                        })
                      )}
                    </>
                  )}
                </div>

                {lifelineTab === 'iteration' && (
                  <form onSubmit={handleAddIteration} className="sticky bottom-0 border-t pt-3 bg-white">
                    <div className="flex items-end gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2">
                    <div className="flex-1">
                      <textarea
                        ref={iterationInputRef}
                        rows={1}
                        className="w-full px-3 py-2 bg-transparent text-sm resize-none max-h-32 min-h-[40px] focus:outline-none"
                        placeholder="Write an iteration update... (use @[name] or @everyone)"
                        value={newIteration}
                        onChange={(e) => {
                          setNewIteration(e.target.value);
                          updateMentionMenu(e.target);
                        }}
                        onClick={(e) => updateMentionMenu(e.target)}
                        onKeyUp={(e) => updateMentionMenu(e.target)}
                        onKeyDown={(e) => {
                          if (mentionMenu.open) {
                            const filtered = getFilteredMentionOptions(mentionMenu.query);
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setMentionMenu((prev) => ({
                                ...prev,
                                activeIndex: filtered.length === 0
                                  ? 0
                                  : Math.min(prev.activeIndex + 1, filtered.length - 1),
                              }));
                              return;
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setMentionMenu((prev) => ({
                                ...prev,
                                activeIndex: filtered.length === 0
                                  ? 0
                                  : Math.max(prev.activeIndex - 1, 0),
                              }));
                              return;
                            }
                            if (e.key === 'Enter' || e.key === 'Tab') {
                              e.preventDefault();
                              applyMentionSelection(filtered[mentionMenu.activeIndex]);
                              return;
                            }
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              setMentionMenu((prev) => ({ ...prev, open: false }));
                              return;
                            }
                          }
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (!loading && newIteration.trim()) handleAddIteration(e);
                          }
                        }}
                        onBlur={() => {
                          setTimeout(() => {
                            setMentionMenu((prev) => ({ ...prev, open: false }));
                          }, 120);
                        }}
                        disabled={loading}
                      />
                      {mentionMenu.open && (
                        <div className="mt-2 border border-gray-200 rounded-lg bg-white shadow-lg max-h-44 overflow-y-auto">
                          {getFilteredMentionOptions(mentionMenu.query).map((option, idx) => (
                            <button
                              key={`${option.id}-${option.label}`}
                              type="button"
                              className={`w-full text-left px-3 py-2 text-sm transition ${
                                idx === mentionMenu.activeIndex
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'text-gray-700 hover:bg-gray-50'
                              }`}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                applyMentionSelection(option);
                              }}
                            >
                              @{option.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={!newIteration.trim() || loading}
                      className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={18} />
                    </button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>

          {/* Sidebar Area */}
          <div className="w-1/3 bg-gray-50 border-l border-gray-200 p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800 tracking-wide uppercase text-xs">Details</h3>
              <div className="relative" ref={actionsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setActionsOpen((v) => !v);
                    setShowTemplatePicker(false);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition"
                  title="Actions"
                >
                  <MoreHorizontal size={18} />
                </button>
                {actionsOpen && (
                  <div className="absolute right-0 mt-2 w-52 rounded-xl shadow-2xl border border-gray-100 bg-white overflow-hidden z-50">
                    <div className="px-3 py-2 text-xs font-semibold text-gray-500 border-b border-gray-100">
                      Ticket actions
                    </div>
                    <div className="p-2 space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowTemplatePicker(true);
                          setActionsOpen(false);
                        }}
                        className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-800 transition"
                      >
                        Add to Template
                      </button>
                      {isIssueCreator && (
                        <button
                          type="button"
                          onClick={() => {
                            setActionsOpen(false);
                            handleDeleteIssue();
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-sm font-semibold text-red-700 transition"
                        >
                          Delete Ticket
                        </button>
                      )}
                      {!isIssueCreator && (
                        <div className="px-3 py-2 text-xs text-gray-400">
                          Only creator can delete.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Status</label>
                {editMode ? (
                  <select 
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                    value={editedIssue.status}
                    onChange={(e) => setEditedIssue({...editedIssue, status: e.target.value})}
                  >
                    {['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing', 'Done'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                   <div className="mt-1 font-medium text-gray-800 bg-gray-200 px-3 py-1.5 rounded inline-block text-sm">{issue.status}</div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Priority</label>
                <div className="mt-1 rounded-xl border border-gray-200 bg-white p-2">
                  <select 
                    className="h-10 w-full px-3 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={editedIssue.priority}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    disabled={loading}
                  >
                    {['Low', 'Medium', 'High', 'Critical'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Due Date</label>
                <div className="mt-1 rounded-xl border border-gray-200 bg-white p-2">
                  <div className="relative">
                    <Calendar className="absolute left-3 top-3 text-gray-400" size={16} />
                    <input
                      type="date"
                      className="h-10 w-full pl-9 pr-3 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={editedIssue.dueDate ? new Date(editedIssue.dueDate).toISOString().slice(0, 10) : ''}
                      onChange={(e) => handleDueDateChange(e.target.value || null)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Issue Type</label>
                {editMode ? (
                  <select 
                    className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                    value={editedIssue.issueType}
                    onChange={(e) => setEditedIssue({...editedIssue, issueType: e.target.value})}
                  >
                    {['Bug', 'Feature', 'Task'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                   <div className="mt-1 font-medium text-gray-800 text-sm flex items-center">
                     <span className="px-2 py-0.5 bg-gray-100 rounded border">{issue.issueType}</span>
                   </div>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Risk Level</label>
                <div className="mt-1 rounded-xl border border-gray-200 bg-white p-2">
                  <select
                    className="h-10 w-full px-3 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={editedIssue.riskLevel || 'Low'}
                    onChange={(e) => handleRiskLevelChange(e.target.value)}
                    disabled={loading}
                  >
                    {['Low', 'Medium', 'High', 'Critical'].map((level) => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Dependencies</label>
                <div className="mt-1 rounded-xl border border-gray-200 bg-white p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {currentDependencies.length === 0 && (
                      <span className="text-xs text-gray-400 italic">No dependencies</span>
                    )}
                    {currentDependencies.map((dependencyIssue) => (
                      <div
                        key={String(dependencyIssue._id)}
                        className="flex items-center bg-gray-50 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200"
                        title={dependencyIssue.title}
                      >
                        <span className="max-w-[140px] truncate">
                          {dependencyIssue.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveDependency(dependencyIssue._id)}
                          className="ml-2 text-gray-400 hover:text-red-500 focus:outline-none"
                          disabled={loading}
                          title="Remove dependency"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsDependencyModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                      disabled={loading}
                    >
                      <Plus size={12} />
                      Add dependency
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] text-gray-400">
                    Link tickets that this task depends on.
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 mt-4">
                <label className="text-xs font-semibold text-gray-500 uppercase">Labels</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {normalizedLabels.length === 0 ? (
                    <span className="text-xs text-gray-400 italic">No labels</span>
                  ) : (
                    normalizedLabels.map((label, idx) => (
                      <div key={`${label.text}-${idx}`} className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-gray-200 bg-white text-xs">
                        <span className={`inline-block w-2 h-2 rounded-full ${LABEL_COLORS.find((c) => c.id === label.color)?.className || 'bg-blue-500'}`} />
                        <span className="font-medium text-gray-700">{label.text}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLabel(idx)}
                          className="text-gray-400 hover:text-red-500 ml-0.5"
                          disabled={loading}
                          title="Remove label"
                        >
                          &times;
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsLabelModalOpen(true)}
                  className="mt-3 px-3 py-2 rounded-lg font-semibold text-sm text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200"
                >
                  Add Label
                </button>
              </div>

              <div className="pt-4 border-t border-gray-200 mt-4">
                <label className="text-xs font-semibold text-gray-500 uppercase">Assignees</label>
                {currentAssigneeObjs.length === 0 ? (
                  <div className="mt-2 text-sm italic text-gray-500">Unassigned</div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {currentAssigneeObjs.map((u) => (
                      <div
                        key={String(u._id)}
                        className="flex items-center bg-gray-50 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200"
                      >
                        <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center mr-2 text-white font-bold">
                          {u.name?.charAt(0) || '?'}
                        </span>
                        <span className="whitespace-nowrap">{u.name}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignee(u._id)}
                          className="ml-2 text-gray-400 hover:text-red-500 focus:outline-none"
                          title="Remove assignee"
                          aria-label="Remove assignee"
                          disabled={loading}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-3 rounded-xl border border-gray-200 bg-white p-2">
                  <div className="flex items-center gap-2">
                    <select
                      className="h-10 flex-1 px-3 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={assigneeSelectId}
                      onChange={(e) => setAssigneeSelectId(e.target.value)}
                    >
                      <option value="">Add person...</option>
                      {availableMembers
                        .filter((u) => !currentAssigneeIds.includes(String(u?._id)))
                        .map((u) => (
                          <option key={String(u._id)} value={u._id}>
                            {u.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      onClick={handleAddAssignee}
                      disabled={!assigneeSelectId || loading}
                      className="h-10 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      title="Add assignee"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-200 mt-4">
                <label className="text-xs font-semibold text-gray-500 uppercase">Reporter</label>
                <div className="flex items-center mt-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold mr-2">
                    {issue.reporter?.name?.charAt(0) || '?'}
                  </div>
                  <span className="text-sm font-medium text-gray-800">{issue.reporter?.name || 'Unknown'}</span>
                </div>
              </div>

              {showTemplatePicker && (
                <div className="pt-4 border-t border-gray-200 mt-4">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Add to Template</label>
                    <button
                      type="button"
                      onClick={() => setShowTemplatePicker(false)}
                      className="text-xs text-gray-400 hover:text-gray-700"
                      title="Close"
                    >
                      Cancel
                    </button>
                  </div>
                  {templatesLoading ? (
                    <div className="text-sm text-gray-500">Loading templates...</div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <select
                        className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                      >
                        <option value="">Select template...</option>
                        {templates.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAddToTemplate}
                        disabled={!selectedTemplateId || loading || templatesLoading}
                        className="px-4 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        title="Add this ticket to a template"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              )}
              
            </div>
            
          </div>
        </div>

      </div>
      {isLabelModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-xl bg-white border border-gray-200 shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Add Label</h4>
              <button
                type="button"
                onClick={() => setIsLabelModalOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={newLabelText}
                onChange={(e) => setNewLabelText(e.target.value)}
                placeholder="Label text..."
                className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
              <div className="flex items-center gap-2">
                {LABEL_COLORS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    onClick={() => setNewLabelColor(color.id)}
                    className={`w-6 h-6 rounded-full ${color.className} ${newLabelColor === color.id ? 'ring-2 ring-offset-2 ring-gray-400' : ''}`}
                    title={color.id}
                  />
                ))}
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsLabelModalOpen(false)}
                className="px-3 py-2 rounded-lg font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const created = await handleAddLabel();
                  if (created) setIsLabelModalOpen(false);
                }}
                disabled={loading || !newLabelText.trim()}
                className="px-3 py-2 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Label
              </button>
            </div>
          </div>
        </div>
      )}
      {isDependencyModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Add Dependency</h4>
              <button
                type="button"
                onClick={() => {
                  setIsDependencyModalOpen(false);
                  setDependencySearchText('');
                  setSelectedDependencyId('');
                }}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={dependencySearchText}
                onChange={(e) => setDependencySearchText(e.target.value)}
                placeholder="Type to search ticket..."
                className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedDependencyId}
                onChange={(e) => setSelectedDependencyId(e.target.value)}
              >
                <option value="">Select dependency...</option>
                {projectIssueOptions
                  .filter((dependencyIssue) => !currentDependencyIds.includes(String(dependencyIssue._id)))
                  .filter((dependencyIssue) => {
                    const query = dependencySearchText.trim().toLowerCase();
                    if (!query) return true;
                    return String(dependencyIssue.title || '').toLowerCase().includes(query);
                  })
                  .map((dependencyIssue) => (
                    <option key={dependencyIssue._id} value={dependencyIssue._id}>
                      {dependencyIssue.title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsDependencyModalOpen(false);
                  setDependencySearchText('');
                  setSelectedDependencyId('');
                }}
                className="px-3 py-2 rounded-lg font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddDependency}
                disabled={loading || !selectedDependencyId}
                className="px-3 py-2 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}
      {isSubtaskAssigneeModalOpen && (
        <div className="absolute inset-0 z-50 bg-black/30 backdrop-blur-[1px] flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-gray-200 shadow-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-gray-800 uppercase tracking-wide">Assign Subtask</h4>
              <button
                type="button"
                onClick={closeSubtaskAssigneeModal}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                value={subtaskAssigneeSearchText}
                onChange={(e) => setSubtaskAssigneeSearchText(e.target.value)}
                placeholder="Type to search member..."
                className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                className="w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={selectedSubtaskAssigneeId}
                onChange={(e) => setSelectedSubtaskAssigneeId(e.target.value)}
              >
                <option value="">Unassigned</option>
                {availableMembers
                  .filter((member) => {
                    const query = subtaskAssigneeSearchText.trim().toLowerCase();
                    if (!query) return true;
                    return String(member.name || '').toLowerCase().includes(query);
                  })
                  .map((member) => (
                    <option key={String(member._id)} value={member._id}>
                      {member.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeSubtaskAssigneeModal}
                className="px-3 py-2 rounded-lg font-semibold text-sm text-gray-600 bg-gray-100 hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitSubtaskAssigneeModal}
                disabled={loading || activeSubtaskIndex === null}
                className="px-3 py-2 rounded-lg font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketDetailsModal;
