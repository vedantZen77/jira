import React, { useState, useEffect, useContext, useRef } from 'react';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { X, MessageSquare, Send, Calendar, MoreHorizontal } from 'lucide-react';

const TicketDetailsModal = ({ issue, project, onClose, onUpdate }) => {
  const { user } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState('details');
  const [editMode, setEditMode] = useState(false);
  const [editedIssue, setEditedIssue] = useState({ ...issue });
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(false);

  // Template integration (Add this ticket to a template)
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');

  const [actionsOpen, setActionsOpen] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [assigneeSelectId, setAssigneeSelectId] = useState('');
  const actionsMenuRef = useRef(null);

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
      alert(err.response?.data?.message || 'Failed to delete issue');
    } finally {
      setLoading(false);
    }
  };

  const handleAddToTemplate = async () => {
    if (!selectedTemplateId) {
      alert('Select a template first');
      return;
    }
    try {
      setLoading(true);
      await api.post(`/templates/${selectedTemplateId}/tickets`, { ticketId: issue._id });
      alert('Added to template');
      setSelectedTemplateId('');
      setShowTemplatePicker(false);
      setActionsOpen(false);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to add to template');
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
      alert(err.response?.data?.message || 'Failed to update assignees');
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

  useEffect(() => {
    if (activeTab === 'comments') {
      fetchComments();
    }
  }, [activeTab]);

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

  const fetchComments = async () => {
    try {
      const { data } = await api.get(`/comments/issue/${issue._id}`);
      setComments(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      const { data } = await api.put(`/issues/${issue._id}`, editedIssue);
      onUpdate(data);
      setEditMode(false);
    } catch (err) {
      alert('Failed to update issue');
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
      alert('Failed to update priority');
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
      alert('Failed to update due date');
    } finally {
      setLoading(false);
    }
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
      alert('Failed to update checklist');
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      const { data } = await api.post('/comments', { ticketId: issue._id, content: newComment });
      setComments([...comments, data]);
      setNewComment('');
    } catch (err) {
      alert('Failed to add comment');
    }
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
                className={`py-2 px-4 font-semibold text-sm ${activeTab === 'comments' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                onClick={() => setActiveTab('comments')}
              >
                Comments
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
              </div>
            ) : (
              <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto mb-4 space-y-4 pr-2">
                  {comments.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">No comments yet. Be the first to comment!</div>
                  ) : (
                    comments.map(comment => (
                      <div key={comment._id} className="flex space-x-3">
                        <div className="w-8 h-8 rounded-full bg-blue-500 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold">
                          {comment.author?.name?.charAt(0) || 'U'}
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg rounded-tl-none flex-1">
                          <div className="flex justify-between items-baseline mb-1">
                            <span className="font-semibold text-sm text-gray-800">{comment.author?.name}</span>
                            <span className="text-xs text-gray-400">{new Date(comment.createdAt).toLocaleString()}</span>
                          </div>
                          <p className="text-sm text-gray-700">{comment.content}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                
                <form onSubmit={handleAddComment} className="flex items-end space-x-2 border-t pt-4">
                  <div className="flex-1 relative">
                    <MessageSquare className="absolute left-3 top-3 text-gray-400" size={18} />
                    <input 
                      type="text" 
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Add a comment..."
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                    />
                  </div>
                  <button type="submit" disabled={!newComment.trim()} className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Send size={18} />
                  </button>
                </form>
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
                <select 
                  className="w-full mt-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm"
                  value={editedIssue.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  disabled={loading}
                >
                  {['Low', 'Medium', 'High', 'Critical'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase">Due Date</label>
                <div className="mt-1 relative">
                  <Calendar className="absolute left-3 top-2.5 text-gray-400" size={16} />
                  <input
                    type="date"
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded bg-white text-sm"
                    value={editedIssue.dueDate ? new Date(editedIssue.dueDate).toISOString().slice(0, 10) : ''}
                    onChange={(e) => handleDueDateChange(e.target.value || null)}
                    disabled={loading}
                  />
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
                    {['Bug', 'Feature', 'Task', 'Epic'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                   <div className="mt-1 font-medium text-gray-800 text-sm flex items-center">
                     <span className="px-2 py-0.5 bg-gray-100 rounded border">{issue.issueType}</span>
                   </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 mt-4">
                <label className="text-xs font-semibold text-gray-500 uppercase">Checklist</label>
                <div className="mt-2 space-y-2">
                  {Array.isArray(issue?.checklist) && issue.checklist.length > 0 ? (
                    issue.checklist.map((item, idx) => (
                      <label key={`${idx}-${item?.text || 'item'}`} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(item?.completed)}
                          onChange={() => handleChecklistToggle(idx)}
                          disabled={loading}
                          className="mt-1 w-4 h-4 accent-blue-600"
                        />
                        <span
                          className={`text-sm text-gray-700 leading-tight ${item?.completed ? 'line-through text-gray-400' : ''}`}
                        >
                          {item?.text}
                        </span>
                      </label>
                    ))
                  ) : (
                    <div className="text-sm text-gray-400">No checklist</div>
                  )}
                </div>
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

                <div className="mt-3 flex items-center gap-2">
                  <select
                    className="flex-1 px-3 py-2 border border-gray-300 rounded bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                    className="px-3 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Add assignee"
                  >
                    Add
                  </button>
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
    </div>
  );
};

export default TicketDetailsModal;
