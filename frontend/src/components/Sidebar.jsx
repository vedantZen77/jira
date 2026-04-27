import React, { useContext, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import DicebearAvatar from './DicebearAvatar';
import {
  LayoutDashboard,
  Folders,
  CheckSquare,
  Settings,
  LogOut,
  Menu,
  X,
  ClipboardList
} from 'lucide-react';

const Sidebar = () => {
  const { logout, user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const roleDisplay = (value) => {
    const normalized = String(value || '').toLowerCase();
    if (normalized === 'manager') return 'MANAGER';
    if (normalized === 'pgm') return 'PGM';
    if (normalized === 'dev' || normalized === 'developer') return 'DEV';
    if (!normalized) return 'USER';
    return normalized.toUpperCase();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const canViewAnalytics = ['admin', 'manager', 'pgm'].includes(String(user?.role || '').toLowerCase());

  const navLinks = [
    { name: 'Dashboard', path: '/dashboard', icon: <LayoutDashboard size={20} /> },
    { name: 'Projects', path: '/projects', icon: <Folders size={20} /> },
    { name: 'My Issues', path: '/issues/me', icon: <CheckSquare size={20} /> },
    ...(canViewAnalytics ? [{ name: 'Analytics', path: '/analytics', icon: <LayoutDashboard size={20} /> }] : []),
    { name: 'Templates', path: '/templates', icon: <ClipboardList size={20} /> },
    { name: 'Settings', path: '/settings', icon: <Settings size={20} /> },
  ];

  return (
    <>
      <div className="md:hidden flex items-center justify-between p-4 bg-black text-white">
        <span className="text-xl font-bold tracking-wider">Logger</span>
        <button onClick={() => setIsOpen(!isOpen)}>
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      <div className={`${isOpen ? 'block' : 'hidden'} md:flex flex-col w-64 h-full min-h-screen px-4 py-8 bg-slate-700 border-r border-gray-900`}>
        <h2 className="text-3xl font-bold text-center text-blue-500 tracking-widest hidden md:block mb-10">
          LOGGER
        </h2>

        <div className="flex flex-col justify-between flex-1 mt-6 text-gray-300">
          <nav>
            {navLinks.map((link) => (
              <NavLink
                key={link.name}
                to={link.path}
                className={({ isActive }) =>
                  `flex items-center px-4 py-3 mb-2 rounded-lg transition-colors ${isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'hover:bg-gray-900 hover:text-white'
                  }`
                }
                onClick={() => setIsOpen(false)}
              >
                {link.icon}
                <span className="mx-4 font-medium">{link.name}</span>
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center px-4 -mx-2 mb-4">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
              <DicebearAvatar
                seed={user?._id || user?.email || user?.name}
                alt={user?.name || 'User avatar'}
                className="w-10 h-10"
              />
            </div>
            <div className="mx-2">
              <h4 className="mx-2 font-medium text-white">{user?.name}</h4>
              <p className="mx-2 mt-1 text-xs text-gray-400 font-medium">{roleDisplay(user?.role)}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center px-4 py-3 mt-auto text-blue-100 transition-colors rounded-lg hover:text-white hover:bg-red-600"
          >
            <LogOut size={20} />
            <span className="mx-4 font-medium">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
