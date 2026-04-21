import React, { useCallback, useContext, useState, useEffect, useRef } from 'react';
import { Bell, CheckCircle, ArrowLeftRight, UserPlus2, Activity } from 'lucide-react';
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
  const audioCtxRef = useRef(null);
  const audioReadyRef = useRef(false);

  const mergeNotifications = useCallback((incomingNotifications) => {
    if (!Array.isArray(incomingNotifications) || incomingNotifications.length === 0) return;

    setNotifications((previous) => {
      const byId = new Map(previous.map((notification) => [String(notification._id), notification]));
      incomingNotifications.forEach((notification) => {
        if (!notification?._id) return;
        byId.set(String(notification._id), notification);
      });

      return Array.from(byId.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 100);
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!user?._id) return;
    try {
      console.log('[notifications] polling fetch');
      const { data } = await api.get(`/notifications/${user._id}`);
      mergeNotifications(data);
    } catch (err) {
      console.error('Failed to fetch notifications');
    }
  }, [mergeNotifications, user?._id]);

  useEffect(() => {
    if (!user?._id) return;
    fetchNotifications();
    const interval = window.setInterval(fetchNotifications, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchNotifications();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchNotifications, user?._id]);

  useEffect(() => {
    if (!user?._id) return;
    const s = connectSocket();
    joinUserRoom(user._id);

    const onNotification = ({ notification }) => {
      if (!notification) return;
      console.log('[notifications] received via socket', notification?._id);
      mergeNotifications([notification]);
      playNotificationTone();
    };

    const onConnect = () => {
      console.log('[socket] connected', s.id);
      joinUserRoom(user._id);
      fetchNotifications();
    };

    const onDisconnect = (reason) => {
      console.log('[socket] disconnected', reason);
    };

    s.on('connect', onConnect);
    s.on('disconnect', onDisconnect);
    s.on('receiveNotification', onNotification);
    s.on('notification:new', onNotification); // Compatibility while backend rolls out.

    const onPresence = () => {};
    s.on('presence:update', onPresence);
    return () => {
      s.off('connect', onConnect);
      s.off('disconnect', onDisconnect);
      s.off('receiveNotification', onNotification);
      s.off('notification:new', onNotification);
      s.off('presence:update', onPresence);
    };
  }, [fetchNotifications, mergeNotifications, user?._id]);

  useEffect(() => {
    const primeAudio = async () => {
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextCtor) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioContextCtor();
      try {
        if (audioCtxRef.current.state === 'suspended') {
          await audioCtxRef.current.resume();
        }
        audioReadyRef.current = true;
      } catch (e) {}
    };
    window.addEventListener('pointerdown', primeAudio, { once: true });
    return () => window.removeEventListener('pointerdown', primeAudio);
  }, []);

  const playNotificationTone = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    if (!audioCtxRef.current) audioCtxRef.current = new AudioContextCtor();
    const ctx = audioCtxRef.current;
    if (!ctx || (ctx.state === 'suspended' && !audioReadyRef.current)) return;

    const now = ctx.currentTime;
    const makeBeep = (offset, frequency, gainValue) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    };

    try {
      makeBeep(0, 880, 0.05);
      makeBeep(0.12, 1174, 0.04);
    } catch (e) {}
  };

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
  const getNotificationMeta = (type) => {
    switch (type) {
      case 'TASK_ASSIGNED':
      case 'ISSUE_ASSIGNED':
        return { icon: UserPlus2, dot: 'bg-blue-500', text: 'text-blue-700', label: 'Assigned' };
      case 'TASK_UPDATED':
      case 'STATUS_CHANGE':
        return { icon: ArrowLeftRight, dot: 'bg-purple-500', text: 'text-purple-700', label: 'Status' };
      case 'TASK_OVERDUE':
      case 'WORKLOAD_ALERT':
        return { icon: Activity, dot: 'bg-red-500', text: 'text-red-700', label: 'Alert' };
      case 'COMMENT_ADDED':
      case 'MENTION':
      case 'ITERATION_ADDED':
        return { icon: Activity, dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'Comment' };
      default:
        return { icon: Activity, dot: 'bg-gray-500', text: 'text-gray-700', label: 'Update' };
    }
  };

  const groupedNotifications = notifications.reduce((acc, notif) => {
    const d = new Date(notif.createdAt);
    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startNotifDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((startToday - startNotifDay) / (1000 * 60 * 60 * 24));
    const bucket = dayDiff === 0 ? 'Today' : dayDiff === 1 ? 'Yesterday' : 'Earlier';
    if (!acc[bucket]) acc[bucket] = [];
    acc[bucket].push(notif);
    return acc;
  }, {});

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
                  ['Today', 'Yesterday', 'Earlier'].map((section) => {
                    const items = groupedNotifications[section] || [];
                    if (items.length === 0) return null;
                    return (
                      <div key={section} className="mb-2">
                        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                          {section}
                        </div>
                        {items.map((notif) => {
                          const meta = getNotificationMeta(notif.type);
                          const Icon = meta.icon;
                          return (
                            <div
                              key={notif._id}
                              onClick={() => handleNotificationClick(notif)}
                              className={`p-3 rounded-lg mb-1 cursor-pointer transition border ${
                                notif.read
                                  ? 'bg-white hover:bg-gray-50 border-transparent'
                                  : (notif.priority === 'critical' || notif.priority === 'high')
                                    ? 'bg-red-50 hover:bg-red-100 border-red-100'
                                    : 'bg-blue-50 hover:bg-blue-100 border-blue-100'
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div className={`w-7 h-7 mt-0.5 rounded-full flex items-center justify-center text-white ${meta.dot}`}>
                                  <Icon size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${meta.text}`}>
                                    {meta.label}
                                  </div>
                                  <p className={`text-sm ${
                                    notif.read ? 'text-gray-600' : 'text-gray-900 font-semibold'
                                  }`}>
                                    {notif.message}
                                  </p>
                                  <span className="text-xs mt-1 block text-gray-400">
                                    {new Date(notif.createdAt).toLocaleString()}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
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
