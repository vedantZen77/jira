import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { connectSocket, joinProjectRoom, leaveProjectRoom } from '../utils/socket';
import DicebearAvatar from '../components/DicebearAvatar';
import { Plus, MoreHorizontal, Users, UserPlus, Shield, ChevronDown, Download } from 'lucide-react';
import TicketDetailsModal from '../components/TicketDetailsModal';

const statuses = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing', 'Done'];
const LABEL_COLORS = [
  { id: 'red', className: 'bg-red-500' },
  { id: 'orange', className: 'bg-orange-500' },
  { id: 'yellow', className: 'bg-yellow-500' },
  { id: 'green', className: 'bg-green-500' },
  { id: 'blue', className: 'bg-blue-500' },
  { id: 'purple', className: 'bg-purple-500' },
];

const normalizeIssueLabels = (labels) => {
  if (!Array.isArray(labels)) return [];
  return labels
    .map((label) => {
      if (typeof label === 'string') {
        const text = label.trim();
        return text ? { text, color: 'blue' } : null;
      }
      const text = String(label?.text || '').trim();
      if (!text) return null;
      const color = LABEL_COLORS.some((c) => c.id === label?.color) ? label.color : 'blue';
      return { text, color };
    })
    .filter(Boolean);
};

const getStatusColor = (status) => {
  switch (status) {
    case 'Backlog': return 'bg-gray-200 text-gray-700';
    case 'Todo': return 'bg-blue-100 text-blue-700';
    case 'In Progress': return 'bg-yellow-100 text-yellow-700';
    case 'In Review': return 'bg-purple-100 text-purple-700';
    case 'Testing': return 'bg-orange-100 text-orange-700';
    case 'Done': return 'bg-green-100 text-green-700';
    default: return 'bg-gray-100 text-gray-700';
  }
};

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

const getCardAccent = (issue) => {
  const overdue = issue?.dueDate && new Date(issue.dueDate).getTime() < Date.now() && issue.status !== 'Done';
  if (overdue) return 'border-l-red-300';
  switch (issue?.priority) {
    case 'Critical': return 'border-l-rose-300';
    case 'High': return 'border-l-orange-300';
    case 'Medium': return 'border-l-blue-300';
    case 'Low': return 'border-l-gray-200';
    default: return 'border-l-gray-200';
  }
};

const getIssueAssigneeList = (issue) => {
  const list = Array.isArray(issue?.assignees) && issue.assignees.length > 0
    ? issue.assignees
    : issue?.assignee
      ? [issue.assignee]
      : [];
  return list.filter(Boolean);
};

const ChecklistProgressBar = ({ issue }) => {
  const checklist = Array.isArray(issue?.checklist) ? issue.checklist : [];
  const total = checklist.length;
  if (!total) return null;
  const completed = checklist.filter((i) => Boolean(i?.completed)).length;
  const pct = Math.round((completed / total) * 100);
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-[10px] font-semibold text-gray-500 mb-1">
        <span>Subtasks</span>
        <span className="text-green-700">{completed}/{total} ({pct}%)</span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const ProjectBoard = () => {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  
  const [project, setProject] = useState(null);
  const [issues, setIssues] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterText, setFilterText] = useState('');
  const [swimlane, setSwimlane] = useState('none'); // none | assignee | priority
  const [activeUserIds, setActiveUserIds] = useState([]);
  const [leadSearch, setLeadSearch] = useState('');

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [isLeadsModalOpen, setIsLeadsModalOpen] = useState(false);
  const [isApplyTemplatesOpen, setIsApplyTemplatesOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [templatesGlobal, setTemplatesGlobal] = useState([]);
  const [templatesProject, setTemplatesProject] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templateTickets, setTemplateTickets] = useState([]);
  const [selectedImportTicketIds, setSelectedImportTicketIds] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templateTicketsLoading, setTemplateTicketsLoading] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [newIssue, setNewIssue] = useState({
    title: '', description: '', issueType: 'Task', priority: 'Medium', assignee: '', assignees: [], status: 'Todo', labels: []
  });
  const [newLabelText, setNewLabelText] = useState('');
  const [newLabelColor, setNewLabelColor] = useState('blue');
  const [draggingIssueId, setDraggingIssueId] = useState(null);

  // Fetch logic
  const fetchProjectData = async () => {
    try {
      const [projectRes, issuesRes, usersRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/issues/project/${id}`),
        api.get(`/auth/users`)
      ]);
      setProject(projectRes.data);
      setIssues(issuesRes.data);
      setUsers(usersRes.data);
      setSelectedLeadIds(
        Array.isArray(projectRes.data.leads) && projectRes.data.leads.length > 0
          ? projectRes.data.leads.map((l) => (l?._id ? l._id : l))
          : [projectRes.data.createdBy?._id || projectRes.data.createdBy]
      );
      setLoading(false);
    } catch (err) {
      setError('Failed to load project data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    const s = connectSocket();
    joinProjectRoom(id);

    const onIssueUpdated = ({ issue }) => {
      if (!issue?._id) return;
      setIssues((prev) => prev.map((i) => (i._id === issue._id ? issue : i)));
      setSelectedIssue((prev) => (prev?._id === issue._id ? issue : prev));
    };

    const onIssueCreated = ({ issue }) => {
      if (!issue?._id) return;
      setIssues((prev) => {
        if (prev.some((i) => i._id === issue._id)) return prev;
        return [issue, ...prev];
      });
    };

    const onIssueDeleted = ({ issueId }) => {
      if (!issueId) return;
      setIssues((prev) => prev.filter((i) => i._id !== issueId));
      setSelectedIssue((prev) => (prev?._id === issueId ? null : prev));
    };

    s.on('issue:updated', onIssueUpdated);
    s.on('issue:created', onIssueCreated);
    s.on('issue:deleted', onIssueDeleted);

    const onBoardPresence = ({ projectId, activeUserIds: ids }) => {
      if (String(projectId) !== String(id)) return;
      setActiveUserIds(Array.isArray(ids) ? ids : []);
    };
    s.on('board:presence', onBoardPresence);
    return () => {
      s.off('issue:updated', onIssueUpdated);
      s.off('issue:created', onIssueCreated);
      s.off('issue:deleted', onIssueDeleted);
      s.off('board:presence', onBoardPresence);
      leaveProjectRoom(id);
    };
  }, [id]);

  const isLead = () => {
    if (!project || !user?._id) return false;
    if (project.createdBy?._id === user._id || project.createdBy === user._id) return true;
    const leads = Array.isArray(project.leads) ? project.leads : [];
    return leads.some((l) => (l?._id ? l._id === user._id : String(l) === String(user._id)));
  };

  const handleSaveLeads = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/projects/${id}/leads`, { leads: selectedLeadIds });
      setIsLeadsModalOpen(false);
      fetchProjectData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to update leads', 'error');
    }
  };

  const fetchTemplatesForApply = async () => {
    setTemplatesLoading(true);
    try {
      const [globalRes, projectRes] = await Promise.all([
        api.get('/templates', { params: { scope: 'global' } }),
        api.get('/templates', { params: { scope: 'project', projectId: id } }),
      ]);
      setTemplatesGlobal(Array.isArray(globalRes.data) ? globalRes.data : []);
      setTemplatesProject(Array.isArray(projectRes.data) ? projectRes.data : []);
      setSelectedTemplateId('');
      setTemplateTickets([]);
      setSelectedImportTicketIds([]);
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to load templates', 'error');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleApplyTemplates = async (e) => {
    e.preventDefault();
    if (!selectedTemplateId) {
      showToast('Select a template', 'warning');
      return;
    }
    if (!Array.isArray(selectedImportTicketIds) || selectedImportTicketIds.length === 0) {
      showToast('Select at least one ticket to import', 'warning');
      return;
    }
    try {
      await api.post(`/projects/${id}/templates/apply`, {
        templateId: selectedTemplateId,
        selectedTicketIds: selectedImportTicketIds,
      });
      setIsApplyTemplatesOpen(false);
      setSelectedTemplateId('');
      setTemplateTickets([]);
      setSelectedImportTicketIds([]);
      // Ensure UI resets and columns reflect status immediately
      fetchProjectData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to apply templates', 'error');
    }
  };

  useEffect(() => {
    const loadTickets = async () => {
      if (!selectedTemplateId) {
        setTemplateTickets([]);
        setSelectedImportTicketIds([]);
        return;
      }
      setTemplateTicketsLoading(true);
      try {
        const { data } = await api.get(`/templates/${selectedTemplateId}/tickets`);
        const tickets = Array.isArray(data)
          ? data
              .map((row) => {
                const issue = row?.issue;
                if (!issue) return null;
                const selectableId = String(row?.templateTicketId || row?.ticketId || issue?._id || '');
                if (!selectableId) return null;
                return { ...issue, _id: selectableId };
              })
              .filter(Boolean)
          : [];
        setTemplateTickets(tickets);
        setSelectedImportTicketIds([]);
      } catch (err) {
        setTemplateTickets([]);
        setSelectedImportTicketIds([]);
      } finally {
        setTemplateTicketsLoading(false);
      }
    };
    if (isApplyTemplatesOpen) loadTickets();
  }, [selectedTemplateId, isApplyTemplatesOpen]);

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    try {
      const nextAssignees = Array.isArray(newIssue.assignees) && newIssue.assignees.length > 0
        ? newIssue.assignees
        : (newIssue.assignee ? [newIssue.assignee] : []);
      await api.post('/issues', {
        ...newIssue,
        assignees: nextAssignees,
        assignee: nextAssignees[0] || null,
        projectId: id,
      });
      setIsCreateModalOpen(false);
      setNewIssue({ title: '', description: '', issueType: 'Task', priority: 'Medium', assignee: '', assignees: [], status: 'Todo', labels: [] });
      setNewLabelText('');
      setNewLabelColor('blue');
      fetchProjectData();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create issue', 'error');
    }
  };

  const openCreateForStatus = (status) => {
    setNewIssue((prev) => ({ ...prev, status }));
    setIsCreateModalOpen(true);
  };

  const handleDragStart = (issueId) => {
    setDraggingIssueId(issueId);
  };

  const handleDrop = (status) => {
    if (!draggingIssueId) return;
    handleStatusChange(draggingIssueId, status);
    setDraggingIssueId(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleStatusChange = async (issueId, newStatus) => {
    try {
      // Optimistic update
      setIssues(issues.map(i => i._id === issueId ? { ...i, status: newStatus } : i));
      await api.put(`/issues/${issueId}`, { status: newStatus });
    } catch (err) {
      showToast('Failed to update status', 'error');
      fetchProjectData(); // Revert on failure
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUserId) return;
    try {
      const currentMemberIds = project.members.map(m => m._id);
      if (currentMemberIds.includes(selectedUserId) || project.createdBy._id === selectedUserId) {
        showToast('User is already a member', 'warning');
        return;
      }
      await api.put(`/projects/${id}`, { members: [...currentMemberIds, selectedUserId] });
      setIsAddMemberModalOpen(false);
      setSelectedUserId('');
      fetchProjectData();
    } catch (err) {
      showToast('Failed to add member', 'error');
    }
  };

  const handleExportProject = async () => {
    const confirmed = window.confirm(
      'Export this project backup now? This will download JSON only and keep the project unchanged.'
    );
    if (!confirmed) return;

    try {
      setExporting(true);
      const { data } = await api.get(`/projects/${id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const dateTag = new Date().toISOString().slice(0, 10);
      const safeProjectName = String(project.name || 'project')
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 80) || 'project';
      anchor.href = url;
      anchor.download = `${safeProjectName}-${dateTag}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      showToast('Project exported successfully. Your project is still active.', 'success');
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to export project', 'error');
    } finally {
      setExporting(false);
    }
  };

  const filteredIssues = issues.filter(issue => {
    const query = filterText.toLowerCase().trim();
    if (!query) return true;
    const titleMatch = issue.title.toLowerCase().includes(query);
    const assigneeMatch = getIssueAssigneeList(issue).some((a) => (a?.name || '').toLowerCase().includes(query));
    const ticketKey = `${project.key}-${issue._id.slice(-4).toUpperCase()}`;
    const ticketMatch = ticketKey.toLowerCase().includes(query);
    return titleMatch || assigneeMatch || ticketMatch;
  });

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

  // Stats calculation
  const totalIssues = issues.length;
  const doneIssues = issues.filter(i => i.status === 'Done').length;
  const inProgressIssues = issues.filter(i => i.status === 'In Progress').length;
  const reviewingIssues = issues.filter(i => i.status === 'In Review' || i.status === 'Testing').length;
  
  const assigneeStats = {};
  issues.forEach(i => {
    if (i.status !== 'Done') {
       const assignees = getIssueAssigneeList(i);
       if (assignees.length === 0) {
         assigneeStats.Unassigned = (assigneeStats.Unassigned || 0) + 1;
       } else {
         assignees.forEach((a) => {
           const n = a?.name || 'Unknown';
           assigneeStats[n] = (assigneeStats[n] || 0) + 1;
         });
       }
    }
  });
  const sortedAssignees = Object.entries(assigneeStats).sort((a,b) => b[1] - a[1]);

  if (loading && !project) return <Layout title="Board"><div className="h-full" /></Layout>;
  if (loading && project) return (
    <Layout title={`${project.key} Board`}>
      <div className="mb-6" />
    </Layout>
  );
  if (error) return <Layout><div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div></Layout>;

  return (
    <Layout title={`${project.key} Board`}>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">{project.name}</h2>
      <div className="flex flex-wrap items-center text-sm text-gray-500 mt-2 gap-3">
        <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium text-xs">Key: {project.key}</span>
        <span>
          Leads:{' '}
          {Array.isArray(project.leads) && project.leads.length > 0
            ? project.leads.map(l => l?.name).filter(Boolean).join(', ')
            : project.createdBy?.name}
        </span>
        {isLead() && (
          <button
            type="button"
            onClick={() => setIsLeadsModalOpen(true)}
            className="ml-1 inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            <Shield size={14} className="mr-1" />
            Manage leads
          </button>
        )}

        {isLead() && (
          <button
            type="button"
            onClick={() => {
              setIsApplyTemplatesOpen(true);
              fetchTemplatesForApply();
            }}
            className="ml-1 inline-flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 transition"
          >
            Apply templates
          </button>
        )}
      </div>

      {activeUserIds.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <span className="font-semibold text-gray-600">Active now</span>
          <div className="flex -space-x-2">
            {activeUserIds.slice(0, 8).map((uid) => (
              <div
                key={uid}
                className="group relative w-7 h-7 rounded-full border-2 border-white overflow-hidden bg-gray-100"
              >
                <DicebearAvatar
                  seed={uid}
                  alt="Active user"
                  className="w-7 h-7"
                  title={(users.find(u => u._id === uid)?.name) || (project?.members?.find(m => m._id === uid)?.name) || (project?.leads?.find(l => l._id === uid)?.name) || (project?.createdBy?._id === uid ? project?.createdBy?.name : uid)}
                />
                <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="whitespace-nowrap rounded-md bg-gray-900 text-white text-[11px] font-semibold px-2 py-1 shadow-lg">
                    {(users.find(u => u._id === uid)?.name) || (project?.members?.find(m => m._id === uid)?.name) || (project?.leads?.find(l => l._id === uid)?.name) || (project?.createdBy?._id === uid ? project?.createdBy?.name : 'User')}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {activeUserIds.length > 8 && <span className="text-gray-400">+{activeUserIds.length - 8}</span>}
        </div>
      )}
      
      {/* Project Members display (with remove option for lead) */}
      <div className="flex flex-wrap items-center gap-2 mt-4 bg-white p-3 rounded-lg shadow-sm border border-gray-100 inline-flex">
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">TEAM</span>
        {project.createdBy && (
          <div className="flex items-center bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-100">
             <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center mr-1.5 font-bold">{project.createdBy.name.charAt(0)}</span>
             {project.createdBy.name} (Creator)
          </div>
        )}
        {Array.isArray(project.leads) && project.leads.filter(l => l?._id && l._id !== project.createdBy?._id).map(lead => (
          <div key={lead._id} className="flex items-center bg-purple-50 text-purple-700 px-2.5 py-1 rounded-full text-xs font-medium border border-purple-100">
            <span className="w-4 h-4 rounded-full bg-purple-200 flex items-center justify-center mr-1.5 font-bold">{lead.name.charAt(0)}</span>
            {lead.name} (Lead)
          </div>
        ))}
        {project.members.map(member => (
           <div key={member._id} className="flex items-center bg-gray-50 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 group">
             <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center mr-1.5 text-white font-bold">{member.name.charAt(0)}</span>
             {member.name}
             {isLead() && (
               <button 
                 onClick={async () => {
                   if(window.confirm(`Remove ${member.name} from project?`)) {
                     try {
                       const updatedMembers = project.members.map(m=>m._id).filter(id => id !== member._id);
                       await api.put(`/projects/${id}`, { members: updatedMembers });
                       fetchProjectData();
                    } catch(err) { showToast('Failed to remove member', 'error'); }
                   }
                 }}
                 className="ml-2 text-gray-400 hover:text-red-500 focus:outline-none"
                 title="Remove member"
               >
                 &times;
               </button>
             )}
           </div>
        ))}
        {isLead() && (
          <button onClick={() => setIsAddMemberModalOpen(true)} className="ml-1 flex items-center text-xs font-semibold text-blue-600 hover:text-blue-800 transition">
            <Plus size={14} className="mr-0.5" /> Add
          </button>
        )}
      </div>

      {/* Project Lead Stats Dashboard */}
      {user?._id === project.createdBy?._id && (
        <div className="mt-6 mb-2 grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center items-center">
            <span className="text-gray-500 text-xs font-bold tracking-wider mb-1 uppercase">Total Tickets</span>
            <span className="text-3xl font-black text-gray-800">{totalIssues}</span>
          </div>
          <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex flex-col justify-center items-center">
            <span className="text-blue-600 text-xs font-bold tracking-wider mb-1 uppercase">In Progress</span>
            <span className="text-3xl font-black text-blue-700">{inProgressIssues}</span>
          </div>
          <div className="bg-purple-50 p-4 rounded-xl border border-purple-100 flex flex-col justify-center items-center">
            <span className="text-purple-600 text-xs font-bold tracking-wider mb-1 uppercase">Reviewing</span>
            <span className="text-3xl font-black text-purple-700">{reviewingIssues}</span>
          </div>
          <div className="bg-green-50 p-4 rounded-xl border border-green-100 flex flex-col justify-center items-center">
            <span className="text-green-600 text-xs font-bold tracking-wider mb-1 uppercase">Done</span>
            <span className="text-3xl font-black text-green-700">{doneIssues}</span>
          </div>
          <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 col-span-1 md:col-span-1 flex flex-col justify-center overflow-hidden">
             <span className="text-gray-500 text-xs font-bold tracking-wider mb-2 uppercase block text-center">Active Workload</span>
             <div className="flex-1 overflow-y-auto pr-1">
               {sortedAssignees.length === 0 ? <p className="text-xs text-gray-400 text-center">No active work</p> : sortedAssignees.map(([name, count]) => (
                  <div key={name} className="flex justify-between items-center mb-1 text-sm">
                    <span className="text-gray-700 font-medium truncate pr-2">{name}</span>
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs font-bold">{count}</span>
                  </div>
               ))}
             </div>
          </div>
        </div>
      )}
    </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:space-x-3 w-full md:w-auto gap-3">
          <input 
            type="text" 
            placeholder="Search by title, assignee, or ticket (KEY-1234)..." 
            className="px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-80 text-sm" 
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
          <div className="relative w-full md:w-56">
            <select
              className="w-full appearance-none px-4 py-2.5 pr-10 border border-gray-200 rounded-xl bg-white text-sm font-semibold text-gray-700 shadow-sm hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              value={swimlane}
              onChange={(e) => setSwimlane(e.target.value)}
            >
              <option value="none">No swimlanes</option>
              <option value="assignee">Swimlanes: Assignee</option>
              <option value="priority">Swimlanes: Priority</option>
            </select>
            <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div className="flex space-x-3">
          {isLead() && (
            <>
              <button
                type="button"
                onClick={handleExportProject}
                disabled={exporting}
                className="flex items-center bg-white text-gray-700 border border-gray-300 px-4 py-2.5 rounded-lg shadow-sm hover:bg-gray-50 transition text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                title="Export full project backup"
              >
                <Download size={16} className="mr-2" />
                {exporting ? 'Exporting...' : 'Export Project'}
              </button>
            </>
          )}
          <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center bg-blue-600 text-white px-4 py-2.5 rounded-lg shadow-sm hover:bg-blue-700 transition text-sm font-medium">
            <Plus size={18} className="mr-2" /> Create Issue
          </button>
        </div>
      </div>

      {/* Kanban Board Container (with optional swimlanes) */}
      <div className="flex flex-col gap-6 pb-8">
        {(() => {
          const lanes = [];
          if (swimlane === 'none') {
            lanes.push({ key: 'all', title: null, filterFn: () => true });
          } else if (swimlane === 'assignee') {
            const byAssignee = new Map();
            filteredIssues.forEach((i) => {
              const assignees = getIssueAssigneeList(i);
              if (assignees.length === 0) {
                byAssignee.set('unassigned', null);
                return;
              }
              assignees.forEach((a) => {
                const k = String(a?._id || a);
                if (!byAssignee.has(k)) byAssignee.set(k, a);
              });
            });
            const assignees = Array.from(byAssignee.entries());
            assignees.forEach(([k, a]) => {
              lanes.push({
                key: `assignee:${k}`,
                title: a ? `Assignee: ${a.name}` : 'Assignee: Unassigned',
                filterFn: (i) => {
                  const issueAssignees = getIssueAssigneeList(i);
                  if (!a) return issueAssignees.length === 0;
                  return issueAssignees.some((x) => String(x?._id || x) === String(a?._id || a));
                },
              });
            });
          } else {
            ['Critical', 'High', 'Medium', 'Low'].forEach((p) => {
              lanes.push({
                key: `priority:${p}`,
                title: `Priority: ${p}`,
                filterFn: (i) => i.priority === p,
              });
            });
          }

          return lanes.map((lane) => {
            const laneIssues = filteredIssues.filter(lane.filterFn);
            return (
              <div key={lane.key}>
                {lane.title && (
                  <div className="mb-3 text-sm font-semibold text-gray-700">{lane.title}</div>
                )}
                <div className="flex gap-6 overflow-x-auto pb-2 scrollbar-hide">
                  {statuses.map((status) => {
                    const columnIssues = laneIssues.filter((issue) => issue.status === status);
                    return (
                      <div
                        key={`${lane.key}:${status}`}
                        className="flex flex-col bg-gray-100 rounded-xl min-w-[280px] max-w-[280px] p-3 border border-gray-200 min-h-[480px] h-[calc(100vh-300px)] max-h-[720px] overflow-hidden"
                        onDragOver={handleDragOver}
                        onDrop={() => handleDrop(status)}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
                              {status}
                            </span>
                            <span className="text-gray-500 text-sm font-semibold">{columnIssues.length}</span>
                          </div>
                          <button className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white transition" title="Column options">
                            <MoreHorizontal size={18} />
                          </button>
                        </div>

                        <div className="flex flex-col gap-3 overflow-y-auto pr-1 pb-2 flex-1 min-h-0 scrollbar-hide">
                          {columnIssues.map((issue) => (
                            <div 
                              key={issue._id}
                              draggable
                              onDragStart={() => handleDragStart(issue._id)}
                              className={`bg-white p-3 rounded-xl shadow-sm border border-gray-200 border-l-4 ${getCardAccent(issue)} hover:shadow-md cursor-pointer transition flex flex-col group relative`}
                              onClick={() => setSelectedIssue(issue)}
                            >
                              <div className="text-xs font-semibold text-gray-500 tracking-wide mb-1 flex items-center justify-between">
                                {project.key}-{issue._id.slice(-4).toUpperCase()}
                                <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{issue.issueType}</span>
                              </div>
                              <h4 className="text-gray-900 font-semibold leading-tight line-clamp-2 mb-2 text-sm">
                                {issue.title}
                              </h4>
                              {issue.dueDate && (
                                <div className={`text-xs mb-2 ${
                                  new Date(issue.dueDate).getTime() < Date.now() && issue.status !== 'Done'
                                    ? 'text-red-600 font-semibold'
                                    : 'text-gray-500'
                                }`}>
                                  Due: {new Date(issue.dueDate).toLocaleDateString()}
                                </div>
                              )}

                              <ChecklistProgressBar issue={issue} />
                              
                              <div className="mt-auto flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  {getPriorityPill(issue.priority)}
                                  <div className="flex items-center gap-1">
                                    {normalizeIssueLabels(issue.labels).slice(0, 6).map((label, idx) => (
                                      <span
                                        key={`${issue._id}-label-dot-${idx}`}
                                        className={`inline-block w-2.5 h-2.5 rounded-full ${LABEL_COLORS.find((c) => c.id === label.color)?.className || 'bg-blue-500'}`}
                                        title={label.text}
                                      />
                                    ))}
                                  </div>
                                  <div className="flex -space-x-1.5 object-cover">
                                     {getIssueAssigneeList(issue).length > 0 ? (
                                       <>
                                         {getIssueAssigneeList(issue).slice(0, 3).map((a, idx) => (
                                           <div
                                             key={`${issue._id}-assignee-${idx}-${String(a?._id || a)}`}
                                             className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold border-2 border-white ring-1 ring-gray-100"
                                             title={a?.name || 'Assignee'}
                                           >
                                             {(a?.name || '?').charAt(0)}
                                           </div>
                                         ))}
                                         {getIssueAssigneeList(issue).length > 3 && (
                                           <div
                                             className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-700 text-[10px] font-bold border-2 border-white ring-1 ring-gray-100"
                                             title={`${getIssueAssigneeList(issue).length - 3} more assignees`}
                                           >
                                             +{getIssueAssigneeList(issue).length - 3}
                                           </div>
                                         )}
                                       </>
                                     ) : (
                                       <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-gray-400 text-[10px]" title="Unassigned">?</div>
                                     )}
                                  </div>
                                </div>

                                <select 
                                  className="text-xs bg-gray-50 border border-gray-200 rounded p-1 text-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 opacity-0 group-hover:opacity-100 absolute right-3 bottom-3 transition-opacity"
                                  value={issue.status}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    handleStatusChange(issue._id, e.target.value);
                                  }}
                                  onClick={e => e.stopPropagation()}
                                >
                                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                              </div>
                            </div>
                          ))}
                          
                          {columnIssues.length === 0 && (
                            <button
                              type="button"
                              onClick={() => openCreateForStatus(status)}
                              className="w-full py-10 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-gray-400 hover:text-gray-600 hover:border-gray-400 hover:bg-white/60 transition"
                              title="Add ticket"
                            >
                              <Plus size={26} className="mb-2 opacity-60" />
                              <span className="text-sm font-semibold">Drop tickets here</span>
                              <span className="text-xs mt-1 text-gray-400 font-medium">or click to add</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}
      </div>

      {/* Create Issue Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg mx-4">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Create Issue</h3>
            <form onSubmit={handleCreateIssue}>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Issue Type</label>
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newIssue.issueType}
                  onChange={(e) => setNewIssue({...newIssue, issueType: e.target.value})}
                >
                  <option value="Task">Task</option>
                  <option value="Bug">Bug</option>
                  <option value="Feature">Feature</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newIssue.title}
                  onChange={(e) => setNewIssue({...newIssue, title: e.target.value})}
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  value={newIssue.description}
                  onChange={(e) => setNewIssue({...newIssue, description: e.target.value})}
                ></textarea>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Priority</label>
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newIssue.priority}
                  onChange={(e) => setNewIssue({...newIssue, priority: e.target.value})}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Labels</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {normalizeIssueLabels(newIssue.labels).length === 0 ? (
                    <span className="text-xs text-gray-400 italic">No labels added</span>
                  ) : (
                    normalizeIssueLabels(newIssue.labels).map((label, idx) => (
                      <div key={`${label.text}-${idx}`} className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-gray-200 bg-white text-xs">
                        <span className={`inline-block w-2 h-2 rounded-full ${LABEL_COLORS.find((c) => c.id === label.color)?.className || 'bg-blue-500'}`} />
                        <span className="font-medium text-gray-700">{label.text}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setNewIssue((prev) => ({
                              ...prev,
                              labels: normalizeIssueLabels(prev.labels).filter((_, i) => i !== idx),
                            }))
                          }
                          className="text-gray-400 hover:text-red-500"
                        >
                          &times;
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newLabelText}
                    onChange={(e) => setNewLabelText(e.target.value)}
                    placeholder="Label text..."
                  />
                  <div className="flex items-center gap-1 border border-gray-300 rounded-lg px-2 py-2 bg-white">
                    {LABEL_COLORS.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => setNewLabelColor(color.id)}
                        className={`w-4 h-4 rounded-full ${color.className} ${newLabelColor === color.id ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const text = newLabelText.trim();
                      if (!text) return;
                      const existing = normalizeIssueLabels(newIssue.labels).some(
                        (l) => l.text.toLowerCase() === text.toLowerCase() && l.color === newLabelColor
                      );
                      if (existing) return;
                      setNewIssue((prev) => ({
                        ...prev,
                        labels: [...normalizeIssueLabels(prev.labels), { text, color: newLabelColor }],
                      }));
                      setNewLabelText('');
                    }}
                    className="px-3 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700"
                  >
                    Add
                  </button>
                </div>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Assignees</label>
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newIssue.assignees}
                  onChange={(e) => {
                    const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                    setNewIssue({ ...newIssue, assignees: selected, assignee: selected[0] || '' });
                  }}
                  multiple
                >
                  {availableMembers.map(m => (
                    <option key={m._id} value={m._id}>{m.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-gray-400">Hold Ctrl/Cmd to select multiple users.</p>
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setIsCreateModalOpen(false)} className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {isAddMemberModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4">
            <h3 className="text-2xl font-bold text-gray-800 mb-6">Add Member to Project</h3>
            <form onSubmit={handleAddMember}>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Select User</label>
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  required
                >
                  <option value="" disabled>Select a user...</option>
                  {users.map(u => (
                    <option key={u._id} value={u._id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setIsAddMemberModalOpen(false)} className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
                <button type="submit" className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">Add User</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Leads Modal */}
      {isLeadsModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4">
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Manage Leads</h3>
            <p className="text-sm text-gray-500 mb-6">Select users who can manage this project (creator is always a lead).</p>
            <form onSubmit={handleSaveLeads}>
              <div className="mb-4">
                <input
                  type="text"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder="Search users..."
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                />
              </div>
              <div className="mb-6">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Leads</label>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-[240px] overflow-y-auto">
                    {users
                      .filter((u) => {
                        const q = leadSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          u.name.toLowerCase().includes(q) ||
                          u.email.toLowerCase().includes(q) ||
                          (u.role || '').toLowerCase().includes(q)
                        );
                      })
                      .map((u) => {
                        const checked = selectedLeadIds.map(String).includes(String(u._id));
                        return (
                          <label key={u._id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => {
                                setSelectedLeadIds((prev) => {
                                  const set = new Set(prev.map(String));
                                  if (e.target.checked) set.add(String(u._id));
                                  else set.delete(String(u._id));
                                  return Array.from(set);
                                });
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-sm text-gray-800 truncate">{u.name}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200 uppercase">
                                  {u.role}
                                </span>
                              </div>
                              <div className="text-xs text-gray-500 truncate">{u.email}</div>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setIsLeadsModalOpen(false)} className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">
                  Save Leads
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Apply Templates Modal */}
      {isApplyTemplatesOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-2xl mx-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-2xl font-bold text-gray-800">Apply Template</h3>
                <p className="text-sm text-gray-500 mt-1">Select a template, then choose which tickets to import.</p>
              </div>
              <button
                type="button"
                onClick={() => setIsApplyTemplatesOpen(false)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-200 transition"
                title="Close"
              >
                &times;
              </button>
            </div>

            {templatesLoading ? (
              <div className="text-sm text-gray-500 py-10 text-center">Loading templates...</div>
            ) : (
              <form onSubmit={handleApplyTemplates}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Global Templates</div>
                    {templatesGlobal.length === 0 ? (
                      <div className="text-sm text-gray-400">No global templates.</div>
                    ) : (
                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {templatesGlobal.map((t) => {
                          const checked = selectedTemplateId && String(t._id) === String(selectedTemplateId);
                          return (
                            <label
                              key={t._id}
                              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                                checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                checked={checked}
                                onChange={() => setSelectedTemplateId(String(t._id))}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-800 truncate">{t.name}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {(Array.isArray(t.tickets) ? t.tickets.length : 0)} tickets
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Project Templates</div>
                    {templatesProject.length === 0 ? (
                      <div className="text-sm text-gray-400">No project templates.</div>
                    ) : (
                      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                        {templatesProject.map((t) => {
                          const checked = selectedTemplateId && String(t._id) === String(selectedTemplateId);
                          return (
                            <label
                              key={t._id}
                              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                                checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                checked={checked}
                                onChange={() => setSelectedTemplateId(String(t._id))}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-gray-800 truncate">{t.name}</div>
                                <div className="text-xs text-gray-500 mt-1">
                                  {(Array.isArray(t.tickets) ? t.tickets.length : 0)} tickets
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {selectedTemplateId ? (
                  <div className="mt-6">
                    <div className="text-sm font-semibold text-gray-800 mb-3">Tickets in this template</div>
                    {templateTicketsLoading ? (
                      <div className="text-sm text-gray-500">Loading tickets...</div>
                    ) : templateTickets.length === 0 ? (
                      <div className="text-sm text-gray-400">No tickets in this template.</div>
                    ) : (
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 scrollbar-hide">
                        {templateTickets.map((issue) => {
                          const checked = selectedImportTicketIds.map(String).includes(String(issue._id));
                          const priorityPill = getPriorityPill(issue.priority);
                          return (
                            <label
                              key={issue._id}
                              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${
                                checked ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:bg-white'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const id = String(issue._id);
                                  setSelectedImportTicketIds((prev) => {
                                    const set = new Set(prev.map(String));
                                    if (set.has(id)) set.delete(id);
                                    else set.add(id);
                                    return Array.from(set);
                                  });
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="font-semibold text-gray-900 truncate">{issue.title}</div>
                                  <div>{priorityPill}</div>
                                </div>
                                <div className="text-xs text-gray-500 mt-1 truncate">
                                  {issue.issueType || 'Task'}
                                  {Array.isArray(issue.labels) && issue.labels.length > 0
                                    ? ` • ${normalizeIssueLabels(issue.labels).slice(0, 3).map((l) => l.text).join(', ')}`
                                    : ''}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : null}

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsApplyTemplatesOpen(false)}
                    className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={!selectedTemplateId || selectedImportTicketIds.length === 0}
                  >
                    Apply
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Ticket Details Modal */}
      {selectedIssue && (
        <TicketDetailsModal
          issue={selectedIssue}
          project={project}
          onClose={() => setSelectedIssue(null)}
          onUpdate={(updatedIssue) => {
            setIssues(issues.map(i => i._id === updatedIssue._id ? updatedIssue : i));
            setSelectedIssue(updatedIssue);
          }}
        />
      )}
    </Layout>
  );
};

export default ProjectBoard;
