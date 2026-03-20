import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { connectSocket, joinProjectRoom, leaveProjectRoom } from '../utils/socket';
import { getAvatarUrl } from '../utils/avatar';
import { Plus, MoreHorizontal, Users, UserPlus, Shield, ChevronDown } from 'lucide-react';
import TicketDetailsModal from '../components/TicketDetailsModal';

const statuses = ['Backlog', 'Todo', 'In Progress', 'In Review', 'Testing', 'Done'];

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

const ProjectBoard = () => {
  const { id } = useParams();
  const { user } = useContext(AuthContext);
  
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
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState([]);
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [newIssue, setNewIssue] = useState({
    title: '', description: '', issueType: 'Task', priority: 'Medium', assignee: '', status: 'Todo'
  });
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
      alert(err.response?.data?.message || 'Failed to update leads');
    }
  };

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    try {
      await api.post('/issues', { ...newIssue, projectId: id });
      setIsCreateModalOpen(false);
      setNewIssue({ title: '', description: '', issueType: 'Task', priority: 'Medium', assignee: '', status: 'Todo' });
      fetchProjectData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create issue');
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
      alert('Failed to update status');
      fetchProjectData(); // Revert on failure
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!selectedUserId) return;
    try {
      const currentMemberIds = project.members.map(m => m._id);
      if (currentMemberIds.includes(selectedUserId) || project.createdBy._id === selectedUserId) {
        alert("User is already a member");
        return;
      }
      await api.put(`/projects/${id}`, { members: [...currentMemberIds, selectedUserId] });
      setIsAddMemberModalOpen(false);
      setSelectedUserId('');
      fetchProjectData();
    } catch (err) {
      alert('Failed to add member');
    }
  };

  const filteredIssues = issues.filter(issue => {
    const query = filterText.toLowerCase().trim();
    if (!query) return true;
    const titleMatch = issue.title.toLowerCase().includes(query);
    const assigneeMatch = issue.assignee && issue.assignee.name.toLowerCase().includes(query);
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
       const uName = i.assignee ? i.assignee.name : 'Unassigned';
       assigneeStats[uName] = (assigneeStats[uName] || 0) + 1;
    }
  });
  const sortedAssignees = Object.entries(assigneeStats).sort((a,b) => b[1] - a[1]);

  if (loading) return <Layout><div className="flex justify-center items-center h-full text-blue-500 font-semibold tracking-wider">Loading Board...</div></Layout>;
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
                <img
                  src={getAvatarUrl(uid)}
                  alt="Active user"
                  className="w-7 h-7"
                  referrerPolicy="no-referrer"
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
                     } catch(err) { alert('Failed to remove member'); }
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
            const assignees = Array.from(
              new Map(
                filteredIssues.map((i) => [i.assignee?._id || 'unassigned', i.assignee || null])
              ).entries()
            );
            assignees.forEach(([k, a]) => {
              lanes.push({
                key: `assignee:${k}`,
                title: a ? `Assignee: ${a.name}` : 'Assignee: Unassigned',
                filterFn: (i) => (a ? i.assignee?._id === a._id : !i.assignee),
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
                              
                              <div className="mt-auto flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  {getPriorityPill(issue.priority)}
                                  <div className="flex -space-x-1.5 object-cover">
                                     {issue.assignee ? (
                                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold border-2 border-white ring-1 ring-gray-100" title={issue.assignee.name}>
                                          {issue.assignee.name.charAt(0)}
                                        </div>
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
                  <option value="Epic">Epic</option>
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
                <label className="block text-sm font-semibold text-gray-700 mb-1">Assignee</label>
                <select 
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={newIssue.assignee}
                  onChange={(e) => setNewIssue({...newIssue, assignee: e.target.value})}
                >
                  <option value="">Unassigned</option>
                  {availableMembers.map(m => (
                    <option key={m._id} value={m._id}>{m.name}</option>
                  ))}
                </select>
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
