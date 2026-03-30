import React, { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import Layout from '../components/Layout';
import api from '../utils/api';
import { CheckSquare, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import TicketDetailsModal from '../components/TicketDetailsModal';
import { connectSocket, joinUserRoom } from '../utils/socket';

const MyIssues = () => {
  const { user } = useContext(AuthContext);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedIssue, setSelectedIssue] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const selectedIssueRef = useRef(null);

  useEffect(() => {
    const fetchMyIssues = async () => {
      try {
        const { data: projects } = await api.get('/projects');
        let allIssues = [];
        for (const project of projects) {
           const { data: projectIssues } = await api.get(`/issues/project/${project._id}`, { params: { populateProject: true } });
           // Re-attach project details to issue since we might need the name
           const annotatedIssues = projectIssues.map(i => ({ ...i, projectObj: project }));
           allIssues = [...allIssues, ...annotatedIssues];
        }
        
        const myTasks = allIssues.filter((i) => {
          const reporterMatch = i.reporter?._id === user._id;
          const assigneeMatch = i.assignee?._id === user._id;
          const assigneesMatch = Array.isArray(i.assignees)
            ? i.assignees.some((a) => (a?._id ? a._id === user._id : String(a) === String(user._id)))
            : false;
          return reporterMatch || assigneeMatch || assigneesMatch;
        });
        
        setIssues(myTasks);
        setLoading(false);
      } catch (err) {
        setLoading(false);
      }
    };
    
    if (user) fetchMyIssues();
  }, [user]);

  useEffect(() => {
    selectedIssueRef.current = selectedIssue;
  }, [selectedIssue]);

  // Real-time updates for created/updated/deleted issues
  useEffect(() => {
    if (!user?._id) return;

    const s = connectSocket();
    joinUserRoom(user._id);

    const attachProjectObj = (issue) => {
      if (issue?.projectObj) return issue;
      if (issue?.projectId) {
        const p = issue.projectId;
        return { ...issue, projectObj: { _id: p._id || p, key: p.key, name: p.name } };
      }
      return issue;
    };

    const matchesMe = (issue) => {
      const uid = String(user._id);
      const reporterId = issue?.reporter?._id ? issue.reporter._id : issue?.reporter;
      const assigneeId = issue?.assignee?._id ? issue.assignee._id : issue?.assignee;
      const assignees = Array.isArray(issue?.assignees) ? issue.assignees : [];
      const assigneesMatch = assignees.some((a) => {
        const id = a?._id ? a._id : a;
        return id && String(id) === uid;
      });
      return (reporterId && String(reporterId) === uid) || (assigneeId && String(assigneeId) === uid) || assigneesMatch;
    };

    const onIssueCreated = ({ issue }) => {
      if (!issue) return;
      if (!matchesMe(issue)) return;

      const issueWithProject = attachProjectObj(issue);
      setIssues((prev) => {
        const exists = prev.some((i) => String(i._id) === String(issueWithProject._id));
        if (exists) {
          return prev.map((i) => (String(i._id) === String(issueWithProject._id) ? issueWithProject : i));
        }
        return [issueWithProject, ...prev];
      });
    };

    const onIssueUpdated = ({ issue }) => {
      if (!issue) return;

      setIssues((prev) => {
        const issueWithProject = attachProjectObj(issue);
        const shouldExist = matchesMe(issueWithProject);
        const exists = prev.some((i) => String(i._id) === String(issueWithProject._id));

        if (!exists && shouldExist) return [issueWithProject, ...prev];
        if (exists && shouldExist) return prev.map((i) => (String(i._id) === String(issueWithProject._id) ? issueWithProject : i));
        if (exists && !shouldExist) return prev.filter((i) => String(i._id) !== String(issueWithProject._id));
        return prev;
      });

      if (selectedIssueRef.current && String(selectedIssueRef.current._id) === String(issue._id)) {
        setSelectedIssue(issue);
        if (issue?.projectId) {
          setSelectedProject({
            _id: issue.projectId._id || issue.projectId,
            key: issue.projectId.key,
            name: issue.projectId.name,
          });
        }
      }
    };

    const onIssueDeleted = ({ issueId }) => {
      if (!issueId) return;
      setIssues((prev) => prev.filter((i) => String(i._id) !== String(issueId)));
      setSelectedIssue((prev) => (prev && String(prev._id) === String(issueId) ? null : prev));
      setSelectedProject((prev) => prev);
    };

    s.on('issue:created', onIssueCreated);
    s.on('issue:updated', onIssueUpdated);
    s.on('issue:deleted', onIssueDeleted);

    return () => {
      s.off('issue:created', onIssueCreated);
      s.off('issue:updated', onIssueUpdated);
      s.off('issue:deleted', onIssueDeleted);
    };
  }, [user?._id]);

  const filteredIssues = issues.filter(issue => 
    issue.title.toLowerCase().includes(filterText.toLowerCase()) &&
    (filterStatus ? issue.status === filterStatus : true) &&
    (filterPriority ? issue.priority === filterPriority : true) &&
    (filterType ? issue.issueType === filterType : true)
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'Todo': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'In Progress': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'In Review': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'Testing': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Done': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <Layout title="My Issues">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center">
            <CheckSquare className="mr-3 text-blue-600" />
            My Issues
          </h2>
          <p className="text-gray-500 text-sm mt-1">Issues assigned to or reported by you</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto mt-4 md:mt-0">
           <div className="relative w-full sm:w-48">
             <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
             <input 
               type="text" 
               placeholder="Search title..." 
               className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
               value={filterText}
               onChange={(e) => setFilterText(e.target.value)}
             />
           </div>
           
           <select 
             className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
             value={filterStatus}
             onChange={(e) => setFilterStatus(e.target.value)}
           >
             <option value="">All Statuses</option>
             <option value="Todo">Todo</option>
             <option value="In Progress">In Progress</option>
             <option value="In Review">In Review</option>
             <option value="Testing">Testing</option>
             <option value="Done">Done</option>
           </select>

           <select 
             className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
             value={filterPriority}
             onChange={(e) => setFilterPriority(e.target.value)}
           >
             <option value="">All Priorities</option>
             <option value="Critical">Critical</option>
             <option value="High">High</option>
             <option value="Medium">Medium</option>
             <option value="Low">Low</option>
           </select>

           <select 
             className="w-full sm:w-auto px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
             value={filterType}
             onChange={(e) => setFilterType(e.target.value)}
           >
             <option value="">All Types</option>
             <option value="Task">Task</option>
             <option value="Bug">Bug</option>
             <option value="Feature">Feature</option>
             <option value="Epic">Epic</option>
           </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
        {loading ? (
           <p className="p-6 text-center text-blue-500 font-semibold tracking-wider">Loading...</p>
        ) : filteredIssues.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
             <CheckSquare size={40} className="mx-auto text-gray-300 mb-3" />
             <p className="font-medium text-lg text-gray-600">No issues found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 uppercase text-xs tracking-wider text-gray-500">
                  <th className="py-3 px-4 font-semibold rounded-tl-lg">Issue</th>
                  <th className="py-3 px-4 font-semibold">Priority</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Project</th>
                  <th className="py-3 px-4 font-semibold rounded-tr-lg text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredIssues.map(issue => (
                  <tr
                    key={issue._id}
                    className={`hover:bg-gray-50 transition group cursor-pointer ${
                      issue.dueDate && new Date(issue.dueDate).getTime() < Date.now() && issue.status !== 'Done'
                        ? 'bg-red-50'
                        : ''
                    }`}
                    onClick={() => {
                      setSelectedIssue(issue);
                      setSelectedProject(issue.projectObj || issue.projectId);
                    }}
                  >
                    <td className="py-4 px-4 font-medium text-gray-800">
                      <div className="flex flex-col">
                        <span className="text-gray-900 font-semibold group-hover:text-blue-600 transition mb-1 line-clamp-1">
                          {issue.title}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center">
                           <span className="px-1.5 py-0.5 bg-gray-100 border border-gray-200 rounded text-[10px] uppercase font-bold mr-2">{issue.issueType}</span>
                           {issue.projectObj?.key}-{issue._id.slice(-4).toUpperCase()}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-sm">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold
                           ${issue.priority==='Critical' ? 'bg-red-50 text-red-700 border-red-200' :
                             issue.priority==='High' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                             issue.priority==='Medium' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                             'bg-gray-50 text-gray-700 border-gray-200'
                           } border`}>
                         {issue.priority}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-sm">
                      <span className={`font-semibold px-2.5 py-1 z-10 rounded text-xs border ${getStatusColor(issue.status)}`}>{issue.status}</span>
                    </td>
                    <td className="py-4 px-4 text-sm">
                       <span className="text-gray-600">{issue.projectObj?.name}</span>
                    </td>
                    <td className="py-4 px-4 text-sm text-right">
                       <Link
                         to={`/project/${issue.projectId}`}
                         onClick={e => e.stopPropagation()}
                         className="opacity-0 group-hover:opacity-100 text-blue-600 hover:underline font-semibold transition-opacity"
                       >
                         Go to Board
                       </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selectedIssue && selectedProject && (
        <TicketDetailsModal
          issue={selectedIssue}
          project={selectedProject}
          onClose={() => {
            setSelectedIssue(null);
            setSelectedProject(null);
          }}
          onUpdate={(updatedIssue) => {
            setIssues(prev =>
              prev.map(i => i._id === updatedIssue._id ? { ...i, ...updatedIssue } : i)
            );
            setSelectedIssue(updatedIssue);
          }}
        />
      )}
    </Layout>
  );
};

export default MyIssues;
