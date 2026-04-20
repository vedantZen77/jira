const Notification = require('../models/Notification');

// @desc    Get user notifications
// @route   GET /api/notifications/:userId
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const requestedUserId = String(req.params.userId || req.user?._id || '');
    if (!requestedUserId) {
      return res.status(400).json({ message: 'userId is required' });
    }

    if (req.user && String(req.user._id) !== requestedUserId) {
      return res.status(403).json({ message: 'User not authorized' });
    }

    const notifications = await Notification.find({ userId: requestedUserId })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (notification) {
      if (notification.userId !== String(req.user._id)) {
        res.status(401).json({ message: 'User not authorized' });
        return;
      }
      notification.read = true;
      const updatedNotification = await notification.save();
      res.json(updatedNotification);
    } else {
      res.status(404).json({ message: 'Notification not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Mark all unread notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { userId: String(req.user._id), read: false },
            { $set: { read: true } }
        );
        res.json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead
};
