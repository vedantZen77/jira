const Notification = require('../models/Notification');
const { emitNotificationToUser } = require('../socket');

const createAndDispatchNotification = async ({
  userId,
  message,
  type = 'MENTION',
  priority = 'medium',
  link = '/',
  metadata = {},
  dedupeWindowMs = 0,
}) => {
  if (!userId || !message) return null;

  const normalizedUserId = String(userId);
  const dedupeKey = metadata?.dedupeKey ? String(metadata.dedupeKey) : null;

  if (dedupeKey && dedupeWindowMs > 0) {
    const since = new Date(Date.now() - dedupeWindowMs);
    const existing = await Notification.findOne({
      userId: normalizedUserId,
      type,
      'metadata.dedupeKey': dedupeKey,
      createdAt: { $gte: since },
    }).lean();
    if (existing) {
      console.log(`[notification] deduped userId=${normalizedUserId} type=${type} key=${dedupeKey}`);
      return existing;
    }
  }

  const notification = await Notification.create({
    userId: normalizedUserId,
    message,
    type,
    priority,
    link,
    metadata: {
      taskId: metadata?.taskId ? String(metadata.taskId) : null,
      projectId: metadata?.projectId ? String(metadata.projectId) : null,
      commentId: metadata?.commentId ? String(metadata.commentId) : null,
      actorId: metadata?.actorId ? String(metadata.actorId) : null,
      dedupeKey,
    },
  });
  console.log(`[notification] stored userId=${normalizedUserId} type=${type} notificationId=${notification._id}`);

  const emitted = emitNotificationToUser(normalizedUserId, notification);
  if (!emitted) {
    console.log(`[notification] user offline userId=${normalizedUserId} notificationId=${notification._id}`);
  }

  return notification;
};

module.exports = { createAndDispatchNotification };
