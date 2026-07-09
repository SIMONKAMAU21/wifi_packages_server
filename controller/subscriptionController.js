import Subscription from "../models/Subscription.js";

// @desc    Get active subscription by MAC address or User ID (determines portal timer)
// @route   POST /api/subscriptions/active
// @access  Public
export const getActiveSubscription = async (req, res) => {
  try {
    const { macAddress, userId } = req.body;

    if (!macAddress && !userId) {
      return res.status(400).json({ message: "MAC Address or User ID is required" });
    }

    const query = { status: "active" };
    if (macAddress && userId) {
      query.$or = [{ macAddress }, { userId }];
    } else if (macAddress) {
      query.macAddress = macAddress;
    } else {
      query.userId = userId;
    }

    // Find the latest active subscription
    const subscription = await Subscription.findOne(query)
      .populate("packageId", "name bandwidthLimitMbps dataLimitMB durationMinutes")
      .sort({ startTime: -1 });

    if (!subscription) {
      return res.json({ active: false });
    }

    // Check if the subscription has expired in the background
    const now = new Date();
    if (now > subscription.endTime) {
      subscription.status = "expired";
      await subscription.save();
      return res.json({ active: false });
    }

    // Calculate remaining seconds
    const remainingSeconds = Math.max(0, Math.floor((subscription.endTime.getTime() - now.getTime()) / 1000));

    res.json({
      active: true,
      subscription: {
        _id: subscription._id,
        packageName: subscription.packageId.name,
        bandwidthLimitMbps: subscription.packageId.bandwidthLimitMbps,
        dataLimitMB: subscription.packageId.dataLimitMB,
        startTime: subscription.startTime,
        endTime: subscription.endTime,
        remainingSeconds,
        macAddress: subscription.macAddress,
        ipAddress: subscription.ipAddress,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to check subscription status", error: error.message });
  }
};

// @desc    List all subscriptions (admin only)
// @route   GET /api/subscriptions
// @access  Private/Admin
export const getAllSubscriptions = async (req, res) => {
  try {
    // Populate packages and user details
    const subscriptions = await Subscription.find({})
      .populate("packageId", "name price durationMinutes")
      .populate("userId", "username phone")
      .sort({ createdAt: -1 });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch subscriptions", error: error.message });
  }
};
