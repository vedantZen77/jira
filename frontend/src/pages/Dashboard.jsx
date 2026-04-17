import React, { useState, useEffect, useContext, useRef } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Layout from '../components/Layout';
import api from '../utils/api';
import { Plus, Briefcase, ChevronRight, Search, Key, Trash2, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { user } = useContext(AuthContext);
  const { showToast } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const [newProject, setNewProject] = useState({ name: '', key: '', description: '' });
  const [deletingId, setDeletingId] = useState(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef(null);

  const isLead = (project) => {
    if (!project || !user?._id) return false;
    if (project.createdBy && project.createdBy.toString) {
      if (project.createdBy.toString() === user._id) return true;
    }
    if (project.createdBy?._id === user._id) return true;
    const leads = Array.isArray(project.leads) ? project.leads : [];
    return leads.some((l) => (l?.toString ? l.toString() === user._id : l?._id === user._id));
  };

  const fetchProjects = async () => {
    try {
      const { data } = await api.get('/projects');
      setProjects(data);
      setLoading(false);
    } catch (err) {
      setError('Failed to fetch projects');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchProjects();
    }
  }, [user]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      await api.post('/projects', newProject);
      setIsModalOpen(false);
      setNewProject({ name: '', key: '', description: '' });
      fetchProjects();
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to create project', 'error');
    }
  };

  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(filterText.toLowerCase()) || 
    project.key.toLowerCase().includes(filterText.toLowerCase())
  );

  const handleDeleteProject = async (project) => {
    if (!window.confirm(`Delete project "${project.name}"? This action cannot be undone.`)) {
      return;
    }
    try {
      setDeletingId(project._id);
      await api.delete(`/projects/${project._id}`);
      setProjects(projects.filter(p => p._id !== project._id));
    } catch (err) {
      showToast(err.response?.data?.message || 'Failed to delete project', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const triggerImportPicker = () => {
    importInputRef.current?.click();
  };

  const handleImportProject = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      setImporting(true);
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const { data } = await api.post('/projects/import', parsed);
      await fetchProjects();
      showToast(
        `Project imported successfully. ${data?.importedIssues || 0} tickets and ${data?.importedComments || 0} comments restored.`,
        'success',
        3600
      );
    } catch (err) {
      showToast(err.response?.data?.message || err.message || 'Failed to import project backup', 'error');
    } finally {
      setImporting(false);
    }
  };

  if (loading) return <Layout title="Dashboard"><div className="flex justify-center items-center h-full text-blue-500 font-semibold tracking-wider">Loading...</div></Layout>;

  return (
    <Layout title="Dashboard">
      {/* Header Actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900">Your projects</h2>
          <p className="text-sm mt-1 text-gray-500">Manage and track work across your teams.</p>
        </div>
        <div className="flex space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
             <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
             <input 
               type="text" 
               placeholder="Search projects..." 
               className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
               value={filterText}
               onChange={(e) => setFilterText(e.target.value)}
             />
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg shadow-sm hover:bg-blue-700 transition font-medium whitespace-nowrap"
          >
            <Plus size={18} className="mr-2" />
            Create Project
          </button>
          <button
            type="button"
            onClick={triggerImportPicker}
            disabled={importing}
            className="flex items-center px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg shadow-sm hover:bg-gray-50 transition font-medium whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
            title="Import project backup JSON"
          >
            <Upload size={16} className="mr-2" />
            {importing ? 'Importing...' : 'Import Project'}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            onChange={handleImportProject}
            className="hidden"
          />
        </div>
      </div>

      {error ? (
        <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200 mb-6 font-medium shadow-sm">{error}</div>
      ) : null}

      {/* Projects Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Placeholder for loading state if needed, though handled by initial `if (loading)` */}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <Briefcase className="text-gray-400" size={32} />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">No projects found</h3>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto">
            {filterText ? "No projects match your search criteria." : "You haven't created or joined any projects yet. Create your first project to get started."}
          </p>
          {!filterText && (
            <button 
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-semibold hover:bg-blue-100 transition"
            >
              <Plus size={18} className="mr-2" />
              Create Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div key={project._id} className="group">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 group-hover:shadow-xl group-hover:border-blue-400 focus:outline-none transition-all duration-300 h-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-blue-50 to-blue-100 rounded-bl-full -z-10 opacity-50 group-hover:scale-110 transition-transform duration-500"></div>
                
                <div className="flex items-start justify-between mb-5">
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center font-bold text-lg shadow-inner">
                      {project.key}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-800 tracking-tight group-hover:text-blue-600 transition-colors">{project.name}</h3>
                      <p className="text-xs text-gray-400 font-medium">
                        {isLead(project) ? 'You are the lead' : 'Shared with you'}
                      </p>
                    </div>
                  </div>
                  {isLead(project) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteProject(project)}
                      disabled={deletingId === project._id}
                      className="ml-3 inline-flex items-center justify-center h-8 w-8 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                      title="Delete project"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                
                <p className="text-gray-600 text-sm mb-6 line-clamp-2 leading-relaxed">
                  {project.description || 'No description provided.'}
                </p>
                
                <div className="flex items-center justify-between mt-auto border-t border-gray-100 pt-4">
                   <div className="flex -space-x-2">
                      <div
                        className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold border-2 border-white z-10"
                        title={user?.name || 'You'}
                      >
                        {user?.name?.charAt(0)}
                      </div>
                      {Array.isArray(project.members) && project.members.slice(0, 3).map((m, idx) => (
                        <div
                          key={m._id || idx}
                          className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-xs font-bold border-2 border-white"
                          title={m?.name || 'Member'}
                          style={{ zIndex: 9 - idx }}
                        >
                          {(m?.name || '?').charAt(0)}
                        </div>
                      ))}
                      {Array.isArray(project.members) && project.members.length > 3 && (
                        <div
                          className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-[11px] font-bold border-2 border-white"
                          title={project.members.slice(3).map(m => m?.name).filter(Boolean).join(', ') || 'More members'}
                          style={{ zIndex: 1 }}
                        >
                          +{project.members.length - 3}
                        </div>
                      )}
                   </div>
                   <Link
                     to={`/project/${project._id}`}
                     className="inline-flex items-center text-blue-600 font-semibold text-sm group-hover:underline"
                   >
                     View Board
                     <ChevronRight size={16} className="ml-1" />
                   </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 overflow-y-auto h-full w-full z-50 flex justify-center items-center backdrop-blur-sm">
          <div className="relative bg-white rounded-xl shadow-2xl p-8 w-full max-w-md mx-4 transform transition-all">
            <h3 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
              <Briefcase className="mr-3 text-blue-600" />
              Create Project
            </h3>
            <form onSubmit={handleCreateProject}>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="name">
                  Project Name
                </label>
                <input
                  type="text"
                  id="name"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  placeholder="e.g. Website Overhaul"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  required
                />
              </div>
              <div className="mb-5">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="key">
                  Project Key <span className="text-gray-400 font-normal">(e.g., DEV, APP)</span>
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 text-gray-400" size={18} />
                  <input
                    type="text"
                    id="key"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow uppercase"
                    placeholder="KEY"
                    maxLength={10}
                    value={newProject.key}
                    onChange={(e) => setNewProject({ ...newProject, key: e.target.value.toUpperCase() })}
                    required
                  />
                </div>
              </div>
              <div className="mb-8">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5" htmlFor="description">
                  Description <span className="text-gray-400 font-normal">(Optional)</span>
                </label>
                <textarea
                  id="description"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  placeholder="What is this project about?"
                  rows="3"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                ></textarea>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-md hover:shadow-lg transition-all"
                >
                  Create Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

export default Dashboard;
