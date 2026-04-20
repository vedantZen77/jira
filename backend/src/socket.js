const { Server } = require('socket.io');
const { createCorsOptions } = require('./config/corsOptions');

let io;
const onlineUsers = new Set();
const activeByProject = new Map(); // projectId -> Set(userId)
const userSocketMap = new Map(); // userId -> socketId

function initSocket(server) {
  io = new Server(server, {
    cors: createCorsOptions(),
    transports: ['polling', 'websocket'],
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected socketId=${socket.id}`);

    const registerUser = (userId) => {
      if (!userId) return;
      const normalizedUserId = String(userId);
      socket.data.userId = normalizedUserId;
      socket.join(`user:${normalizedUserId}`);
      userSocketMap.set(normalizedUserId, socket.id);
      onlineUsers.add(normalizedUserId);
      console.log(`[socket] register userId=${normalizedUserId} socketId=${socket.id}`);
      io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers) });
    };

    // New event name for notification registration.
    socket.on('register', registerUser);
    // Keep backward compatibility with existing frontend calls.
    socket.on('join:user', registerUser);

    socket.on('join:project', (payload) => {
      const projectId = typeof payload === 'string' ? payload : payload?.projectId;
      const userIdFromPayload = typeof payload === 'object' ? payload?.userId : undefined;
      if (!projectId) return;

      // Allow join order: if client sends userId here, capture it
      if (userIdFromPayload && !socket.data.userId) {
        const normalizedUserId = String(userIdFromPayload);
        socket.data.userId = normalizedUserId;
        userSocketMap.set(normalizedUserId, socket.id);
        onlineUsers.add(normalizedUserId);
        io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers) });
      }

      socket.join(`project:${projectId}`);
      const userId = socket.data?.userId;
      if (userId) {
        const key = String(projectId);
        const set = activeByProject.get(key) || new Set();
        set.add(String(userId));
        activeByProject.set(key, set);
        socket.data.activeProjects = socket.data.activeProjects || new Set();
        socket.data.activeProjects.add(key);
        io.to(`project:${projectId}`).emit('board:presence', { projectId: key, activeUserIds: Array.from(set) });
      }
    });

    socket.on('leave:project', (payload) => {
      const projectId = typeof payload === 'string' ? payload : payload?.projectId;
      if (!projectId) return;
      const key = String(projectId);
      socket.leave(`project:${projectId}`);

      const userId = socket.data?.userId;
      if (userId) {
        const set = activeByProject.get(key);
        if (set && set.delete(String(userId))) {
          if (set.size === 0) activeByProject.delete(key);
          io.to(`project:${projectId}`).emit('board:presence', { projectId: key, activeUserIds: Array.from(set || []) });
        }
      }
      if (socket.data?.activeProjects) {
        socket.data.activeProjects.delete(key);
      }
    });

    socket.on('disconnect', () => {
      const userId = socket.data?.userId;
      console.log(`[socket] disconnected socketId=${socket.id} userId=${userId || 'unknown'}`);
      if (userId) {
        if (userSocketMap.get(String(userId)) === socket.id) {
          userSocketMap.delete(String(userId));
        }
        onlineUsers.delete(String(userId));
        io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers) });

        // Remove from active projects this socket joined
        const joined = socket.data?.activeProjects ? Array.from(socket.data.activeProjects) : [];
        joined.forEach((projectId) => {
          const set = activeByProject.get(projectId);
          if (set && set.delete(String(userId))) {
            if (set.size === 0) activeByProject.delete(projectId);
            io.to(`project:${projectId}`).emit('board:presence', { projectId, activeUserIds: Array.from(set || []) });
          }
        });
      }
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized');
  }
  return io;
}

function getSocketIdByUserId(userId) {
  if (!userId) return null;
  return userSocketMap.get(String(userId)) || null;
}

function emitNotificationToUser(userId, notification) {
  const socketId = getSocketIdByUserId(userId);
  if (!io || !socketId) return false;

  io.to(socketId).emit('receiveNotification', { notification });
  // Backward compatibility while clients migrate.
  io.to(socketId).emit('notification:new', { notification });
  console.log(`[socket] notification emitted userId=${userId} socketId=${socketId} notificationId=${notification?._id || 'unknown'}`);
  return true;
}

module.exports = { initSocket, getIO, getSocketIdByUserId, emitNotificationToUser };

