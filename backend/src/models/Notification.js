const mongoose = require('mongoose');

const notificationSchema = mongoose.Schema({
  // Store user as string for simple targeted delivery and polling fallback.
  userId: {
    type: String,
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  // Keep optional metadata used by existing UI notifications.
  type: {
    type: String,
    enum: [
      'TASK_ASSIGNED',
      'TASK_UPDATED',
      'COMMENT_ADDED',
      'ITERATION_ADDED',
      'TASK_OVERDUE',
      'WORKLOAD_ALERT',
      'ROLE_ALERT',
      'MENTION',
      // Backward compatibility for existing notifications.
      'ISSUE_ASSIGNED',
      'STATUS_CHANGE',
    ],
    default: 'MENTION',
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  },
  link: {
    type: String,
    default: '/',
  },
  metadata: {
    taskId: {
      type: String,
      default: null,
    },
    projectId: {
      type: String,
      default: null,
    },
    commentId: {
      type: String,
      default: null,
    },
    actorId: {
      type: String,
      default: null,
    },
    dedupeKey: {
      type: String,
      default: null,
    },
  },
  read: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});

// Auto-delete notifications after 30 days from creation.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, 'metadata.taskId': 1 });

const Notification = mongoose.model('Notification', notificationSchema);
module.exports = Notification;
