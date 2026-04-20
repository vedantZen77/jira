import { io } from 'socket.io-client';

let socket;
let joinedUserId;
let hasJoinListener = false;

function getSocketBaseUrl() {
  const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
  // If VITE_API_URL ends with /api, connect sockets to the same host origin
  const normalizedBase = apiBase.replace(/\/api\/?$/, '');

  // Force secure transport in production deployments.
  if (/^http:\/\//i.test(normalizedBase) && !/localhost|127\.0\.0\.1/i.test(normalizedBase)) {
    return normalizedBase.replace(/^http:\/\//i, 'https://');
  }
  return normalizedBase;
}

export function connectSocket() {
  if (!socket) {
    socket = io(getSocketBaseUrl(), {
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      timeout: 20000,
    });
  }

  if (socket && !hasJoinListener) {
    hasJoinListener = true;
    const rejoin = () => {
      if (joinedUserId) {
        socket.emit('register', joinedUserId);
      }
    };
    socket.on('connect', rejoin);
    socket.on('reconnect', rejoin);
  }

  return socket;
}

export function disconnectSocket() {
  if (!socket) return;
  socket.disconnect();
  socket = undefined;
  hasJoinListener = false;
}

export function joinUserRoom(userId) {
  if (!userId) return;
  joinedUserId = String(userId);
  const s = connectSocket();
  if (s.connected) {
    s.emit('register', joinedUserId);
  }
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

