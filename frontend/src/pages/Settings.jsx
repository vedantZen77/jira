import React, { useContext, useState } from 'react';
import Layout from '../components/Layout';
import { AuthContext } from '../context/AuthContext';
import { User, Mail, Shield, KeyRound } from 'lucide-react';

const Settings = () => {
  const { user, updateProfile, changePassword } = useContext(AuthContext);
  const [name, setName] = useState(user?.name || '');
  const [role, setRole] = useState(user?.role || 'developer');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState('');
  const [pwError, setPwError] = useState('');

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    setError('');
    try {
      await updateProfile({ name, role });
      setMessage('Profile updated successfully.');
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwSaving(true);
    setPwMessage('');
    setPwError('');
    if (pwNew !== pwConfirm) {
      setPwError('New password and confirm password do not match');
      setPwSaving(false);
      return;
    }
    try {
      await changePassword(pwCurrent, pwNew);
      setPwMessage('Password updated successfully.');
      setPwCurrent('');
      setPwNew('');
      setPwConfirm('');
    } catch (err) {
      setPwError(err);
    } finally {
      setPwSaving(false);
    }
  };

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
          <form onSubmit={handleSave} className="p-6 space-y-6">
            {message && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                {message}
              </div>
            )}
            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex items-center space-x-4 border-b border-gray-50 pb-4">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                <User size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-500">Full Name</p>
                <input
                  type="text"
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="flex items-center space-x-4 border-b border-gray-50 pb-4">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                <Shield size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-500">Role</p>
                <select
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  <option value="admin">Admin</option>
                  <option value="manager">Manager</option>
                  <option value="developer">Developer</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
                <Mail size={20} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-500">Email Address</p>
                <input
                  type="email"
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                  value={user?.email || ''}
                  disabled
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-100 flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400">
              <KeyRound size={20} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800">Change password</h3>
              <p className="text-sm text-gray-500">Update your password securely.</p>
            </div>
          </div>
          <form onSubmit={handleChangePassword} className="p-6 space-y-4">
            {pwMessage && (
              <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
                {pwMessage}
              </div>
            )}
            {pwError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                {pwError}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-gray-600 mb-1">Current password</label>
              <input
                type="password"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={pwCurrent}
                onChange={(e) => setPwCurrent(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">New password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-600 mb-1">Confirm new password</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={pwSaving}
                className="px-5 py-2.5 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-sm"
              >
                {pwSaving ? 'Updating...' : 'Update Password'}
              </button>
            </div>
          </form>
        </div>

      </div>
    </Layout>
  );
};

export default Settings;
