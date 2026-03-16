import React, { useContext } from 'react';
import Layout from '../components/Layout';
import { AuthContext } from '../context/AuthContext';
import { User, Mail, Shield, AlertCircle } from 'lucide-react';

const Settings = () => {
  const { user } = useContext(AuthContext);

  return (
    <Layout title="Account Settings">
      <div className="max-w-3xl">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Profile Settings</h2>
        
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
          <div className="p-6 border-b border-gray-100 flex items-center space-x-6">
            <div className="w-20 h-20 rounded-full bg-blue-100 flex flex-col justify-center items-center overflow-hidden border-4 border-white shadow-md">
              <span className="text-3xl font-bold text-blue-600">
                 {user?.name?.charAt(0) || 'U'}
              </span>
            </div>
            <div>
              <h3 className="text-2xl font-bold text-gray-800">{user?.name}</h3>
              <p className="text-gray-500 font-medium flex items-center mt-1">
                <Shield size={16} className="mr-1.5" /> Role: {user?.role || 'Developer'}
              </p>
            </div>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center space-x-4 border-b border-gray-50 pb-4">
               <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                  <User size={20} />
               </div>
               <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-500">Full Name</p>
                  <p className="font-medium text-gray-800">{user?.name}</p>
               </div>
               <button className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition">Edit</button>
            </div>
            <div className="flex items-center space-x-4">
               <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                  <Mail size={20} />
               </div>
               <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-500">Email Address</p>
                  <p className="font-medium text-gray-800">{user?.email}</p>
               </div>
               <button className="text-sm font-semibold text-blue-600 hover:text-blue-800 transition">Update</button>
            </div>
          </div>
        </div>

        <div className="bg-orange-50 rounded-xl border border-orange-200 p-5 flex items-start space-x-4">
           <AlertCircle className="text-orange-500 mt-0.5 flex-shrink-0" size={24} />
           <div>
             <h4 className="font-bold text-orange-800 text-sm">Demo Restrictions</h4>
             <p className="text-sm text-orange-700 mt-1 leading-relaxed">
               Because this is a demonstration environment, profile editing and password changes are currently disabled. You can view your current settings above.
             </p>
           </div>
        </div>

      </div>
    </Layout>
  );
};

export default Settings;
