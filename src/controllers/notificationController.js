const Notification = require("../models/Notification");

const getMyNotifications = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const filter = { recipient: req.user.userId };
    if (req.query.read !== undefined) {
      filter.read = req.query.read === "true";
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({
        recipient: req.user.userId,
        read: false,
      }),
    ]);

    return res.status(200).json({
      message: "Notifications fetched successfully",
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      unreadCount,
      notifications,
    });
  } catch (error) {
    next(error);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    if (notification.recipient.toString() !== req.user.userId) {
      return res.status(403).json({
        message: "You can only update your own notifications",
      });
    }

    if (!notification.read) {
      notification.read = true;
      notification.readAt = new Date();
      await notification.save();
    }

    return res.status(200).json({
      message: "Notification marked as read",
      notification,
    });
  } catch (error) {
    next(error);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user.userId, read: false },
      { read: true, readAt: new Date() },
    );

    return res
      .status(200)
      .json({ message: "All notifications marked as read" });
  } catch (error) {
    next(error);
  }
};

module.exports = { getMyNotifications, markAsRead, markAllAsRead };
