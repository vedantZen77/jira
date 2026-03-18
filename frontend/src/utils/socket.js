import { io } from 'socket.io-client';

let socket;

function getSocketBaseUrl() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  // If VITE_API_URL ends with /api, connect sockets to the same host origin
  return apiBase.replace(/\/api\/?$/, '');
}

export function connectSocket() {
  if (socket) return socket;
  socket = io(getSocketBaseUrl(), {
    transports: ['websocket'],
    withCredentials: true,
  });
  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = undefined;
}

export function joinUserRoom(userId) {
  if (!userId) return;
  const s = connectSocket();
  s.emit('join:user', userId);
}

export function joinProjectRoom(projectId) {
  if (!projectId) return;
  const s = connectSocket();
  const userInfo = localStorage.getItem('userInfo');
  const userId = userInfo ? JSON.parse(userInfo)?._id : undefined;
  s.emit('join:project', { projectId, userId });
}

export function leaveProjectRoom(projectId) {
  if (!projectId) return;
  const s = connectSocket();
  s.emit('leave:project', { projectId });
}

export function getSocket() {
  return socket;
}

