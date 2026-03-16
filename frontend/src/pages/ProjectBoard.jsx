import React, { useState, useEffect, useContext } from 'react';
import { useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { Plus, MoreHorizontal, Users, UserPlus } from 'lucide-react';
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

const getPriorityIcon = (priority) => {
  switch (priority) {
    case 'Critical': return <span className="text-red-600 font-bold" title="Critical">↑↑</span>;
    case 'High': return <span className="text-red-500 font-bold" title="High">↑</span>;
    case 'Medium': return <span className="text-orange-400 font-bold" title="Medium">=</span>;
    case 'Low': return <span className="text-blue-400 font-bold" title="Low">↓</span>;
    default: return null;
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

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [newIssue, setNewIssue] = useState({
    title: '', description: '', issueType: 'Task', priority: 'Medium', assignee: ''
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
      setLoading(false);
    } catch (err) {
      setError('Failed to load project data');
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  const handleCreateIssue = async (e) => {
    e.preventDefault();
    try {
      await api.post('/issues', { ...newIssue, projectId: id });
      setIsCreateModalOpen(false);
      setNewIssue({ title: '', description: '', issueType: 'Task', priority: 'Medium' });
      fetchProjectData();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create issue');
    }
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

  const availableMembers = project ? [project.createdBy, ...project.members] : [];

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
        <span>Lead: {project.createdBy?.name}</span>
      </div>
      
      {/* Project Members display (with remove option for lead) */}
      <div className="flex flex-wrap items-center gap-2 mt-4 bg-white p-3 rounded-lg shadow-sm border border-gray-100 inline-flex">
        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">TEAM</span>
        {project.createdBy && (
          <div className="flex items-center bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium border border-blue-100">
             <span className="w-4 h-4 rounded-full bg-blue-200 flex items-center justify-center mr-1.5 font-bold">{project.createdBy.name.charAt(0)}</span>
             {project.createdBy.name} (Lead)
          </div>
        )}
        {project.members.map(member => (
           <div key={member._id} className="flex items-center bg-gray-50 text-gray-700 px-2.5 py-1 rounded-full text-xs font-medium border border-gray-200 group">
             <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center mr-1.5 text-white font-bold">{member.name.charAt(0)}</span>
             {member.name}
             {user?._id === project.createdBy?._id && (
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
        {user?._id === project.createdBy?._id && (
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
        </div>
        <div className="flex space-x-3">
          <button onClick={() => setIsCreateModalOpen(true)} className="flex items-center bg-blue-600 text-white px-4 py-2.5 rounded-lg shadow-sm hover:bg-blue-700 transition text-sm font-medium">
            <Plus size={18} className="mr-2" /> Create Issue
          </button>
        </div>
      </div>

      {/* Kanban Board Container */}
      <div className="flex gap-6 overflow-x-auto pb-8 h-[calc(100vh-260px)]">
        {statuses.map((status) => {
          const columnIssues = filteredIssues.filter((issue) => issue.status === status);
          return (
            <div
              key={status}
              className="flex flex-col bg-gray-100 rounded-xl min-w-[320px] max-w-[320px] p-4 border border-gray-200"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(status)}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider ${getStatusColor(status)}`}>
                    {status}
                  </span>
                  <span className="text-gray-500 text-sm font-semibold">{columnIssues.length}</span>
                </div>
                <button className="text-gray-400 hover:text-gray-700"><MoreHorizontal size={20} /></button>
              </div>

              {/* Tickets Map */}
              <div className="flex flex-col gap-3 overflow-y-auto pr-1 pb-2">
                {columnIssues.map((issue) => (
                  <div 
                    key={issue._id}
                    draggable
                    onDragStart={() => handleDragStart(issue._id)}
                    className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 hover:shadow-md cursor-pointer transition flex flex-col group relative"
                    onClick={() => setSelectedIssue(issue)}
                  >
                    <div className="text-xs font-semibold text-gray-500 tracking-wide mb-1 flex items-center justify-between">
                      {project.key}-{issue._id.slice(-4).toUpperCase()}
                      <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{issue.issueType}</span>
                    </div>
                    <h4 className="text-gray-900 font-semibold leading-tight line-clamp-2 mb-3">
                      {issue.title}
                    </h4>
                    
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        {getPriorityIcon(issue.priority)}
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
                      
                      {/* Simple status change dropdown to avoid complex DND for now */}
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
                  <div className="w-full py-8 flex flex-col items-center justify-center border-2 border-dashed border-gray-300 rounded-lg text-gray-400">
                    <Plus size={24} className="mb-2 opacity-50" />
                    <span className="text-sm font-medium">Drop tickets here</span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
