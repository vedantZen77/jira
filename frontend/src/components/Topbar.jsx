import React, { useContext, useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { AuthContext } from '../context/AuthContext';
import { connectSocket, joinUserRoom } from '../utils/socket';

const Topbar = ({ title }) => {
  const [notifications, setNotifications] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const navigate = useNavigate();
  const dropdownRef = useRef(null);
  const { user } = useContext(AuthContext);

  const fetchNotifications = async () => {
    try {
      const { data } = await api.get('/notifications');
      setNotifications(data);
    } catch (err) {
      console.error('Failed to fetch notifications');
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (!user?._id) return;
    const s = connectSocket();
    joinUserRoom(user._id);

    const onNotification = ({ notification }) => {
      if (!notification) return;
      setNotifications((prev) => [notification, ...prev].slice(0, 50));
    };

    s.on('notification:new', onNotification);

    const onPresence = () => {};
    s.on('presence:update', onPresence);
    return () => {
      s.off('notification:new', onNotification);
      s.off('presence:update', onPresence);
    };
  }, [user?._id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleNotificationClick = async (notif) => {
    if (!notif.read) {
      try {
        await api.put(`/notifications/${notif._id}/read`);
        setNotifications(notifications.map(n => n._id === notif._id ? { ...n, read: true } : n));
      } catch (err) { }
    }
    setShowDropdown(false);
    navigate(notif.link);
  };

  const markAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch (err) { }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="flex items-center justify-between px-8 py-4 border-b border-gray-200 shadow-sm relative bg-white text-gray-800">
      <div className="flex items-center">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{title || 'Dashboard'}</h1>
      </div>

      <div className="flex items-center space-x-4">
        <div className="relative" ref={dropdownRef}>
          <button 
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center text-gray-500 hover:text-blue-500 focus:outline-none relative"
          >
            <Bell className="w-6 h-6" />
            {unreadCount > 0 && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 border-2 border-white rounded-full"></span>}
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-80 rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden flex flex-col max-h-96 bg-white">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-sm text-gray-800">Notifications</h3>
                {unreadCount > 0 && (
                  <button onClick={markAllRead} className="text-xs text-blue-600 hover:underline flex items-center">
                    <CheckCircle size={14} className="mr-1" /> Mark all read
                  </button>
                )}
              </div>
              <div className="overflow-y-auto flex-1 p-2">
                {notifications.length === 0 ? (
                  <div className="text-center py-6 text-sm text-gray-500">No notifications</div>
                ) : (
                  notifications.map(notif => (
                    <div 
                      key={notif._id} 
                      onClick={() => handleNotificationClick(notif)}
                      className={`p-3 rounded-lg mb-1 cursor-pointer transition ${
                        notif.read
                          ? 'bg-white hover:bg-gray-50'
                          : 'bg-blue-50 hover:bg-blue-100'
                      }`}
                    >
                      <p className={`text-sm ${
                        notif.read ? 'text-gray-600' : 'text-gray-900 font-semibold'
                      }`}>{notif.message}</p>
                      <span className="text-xs mt-1 block text-gray-400">
                        {new Date(notif.createdAt).toLocaleString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Topbar;
