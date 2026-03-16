import React, { useState, useEffect } from 'react';
import Layout from '../components/Layout';
import api from '../utils/api';
import { Search, Briefcase, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const Projects = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterText, setFilterText] = useState('');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const { data } = await api.get('/projects');
        setProjects(data);
        setLoading(false);
      } catch (err) {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const filteredProjects = projects.filter(project => 
    project.name.toLowerCase().includes(filterText.toLowerCase()) || 
    project.key.toLowerCase().includes(filterText.toLowerCase())
  );

  return (
    <Layout title="All Projects">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Projects Directory</h2>
          <p className="text-gray-500 text-sm mt-1">List of all projects you have access to</p>
        </div>
        <div className="relative w-full md:w-72">
           <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
           <input 
             type="text" 
             placeholder="Search projects by name or key..." 
             className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
             value={filterText}
             onChange={(e) => setFilterText(e.target.value)}
           />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-2">
        {loading ? (
          <p className="p-6 text-center text-blue-500 font-semibold tracking-wider">Loading...</p>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Briefcase size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="font-medium text-lg text-gray-600">No projects found.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredProjects.map(project => (
              <div key={project._id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-gray-50 transition rounded-lg m-1">
                <div className="flex items-center space-x-4 mb-3 sm:mb-0">
                  <div className="w-12 h-12 bg-blue-100 text-blue-700 rounded-lg flex items-center justify-center font-bold shadow-inner">
                    {project.key}
                  </div>
                  <div>
                    <Link to={`/project/${project._id}`} className="text-lg font-bold text-gray-800 hover:text-blue-600 transition">
                      {project.name}
                    </Link>
                    <p className="text-sm text-gray-500">Lead: {project.createdBy?.name || 'Unknown'}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <div className="flex -space-x-2 mr-4 hidden md:flex">
                     {project.members && project.members.slice(0, 3).map(m => (
                       <div key={m._id} className="w-8 h-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-gray-600 text-[10px] font-bold" title={m.name}>
                         {m.name.charAt(0)}
                       </div>
                     ))}
                     {project.members && project.members.length > 3 && (
                       <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-gray-500 text-[10px]">+</div>
                     )}
                  </div>
                  <Link to={`/project/${project._id}`} className="flex items-center text-sm font-semibold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-3 py-1.5 rounded transition">
                    View Board <ChevronRight size={16} className="ml-1" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Projects;
