const { Server } = require('socket.io');

let io;
const onlineUsers = new Set();
const activeByProject = new Map(); // projectId -> Set(userId)

function initSocket(server) {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || '*',
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    socket.on('join:user', (userId) => {
      if (!userId) return;
      socket.data.userId = userId;
      socket.join(`user:${userId}`);
      onlineUsers.add(String(userId));
      io.emit('presence:update', { onlineUserIds: Array.from(onlineUsers) });
    });

    socket.on('join:project', (payload) => {
      const projectId = typeof payload === 'string' ? payload : payload?.projectId;
      const userIdFromPayload = typeof payload === 'object' ? payload?.userId : undefined;
      if (!projectId) return;

      // Allow join order: if client sends userId here, capture it
      if (userIdFromPayload && !socket.data.userId) {
        socket.data.userId = userIdFromPayload;
        onlineUsers.add(String(userIdFromPayload));
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
      if (userId) {
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

module.exports = { initSocket, getIO };

