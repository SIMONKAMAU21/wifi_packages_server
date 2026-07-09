import Transaction from "../models/Transaction.js";
import Subscription from "../models/Subscription.js";
import Voucher from "../models/Voucher.js";
import Package from "../models/Package.js";

// @desc    Get Admin Dashboard Stats (metrics and charts)
// @route   GET /api/admin/stats
// @access  Private/Admin
export const getDashboardStats = async (req, res) => {
  try {
    // 1. Calculate Total Revenue
    const revenueResult = await Transaction.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    // 2. Count Active Subscriptions
    // We should double check expirations first
    const now = new Date();
    await Subscription.updateMany(
      { status: "active", endTime: { $lt: now } },
      { status: "expired" }
    );
    const activeUsers = await Subscription.countDocuments({ status: "active" });

    // 3. Count Vouchers by Status
    const totalVouchers = await Voucher.countDocuments({});
    const unusedVouchers = await Voucher.countDocuments({ status: "unused" });
    const usedVouchers = await Voucher.countDocuments({ status: "used" });

    // 4. Count Total Packages
    const totalPackages = await Package.countDocuments({});

    // 5. Package Popularity Distribution
    const popularityResult = await Transaction.aggregate([
      { $match: { status: "completed" } },
      { $group: { _id: "$packageId", count: { $sum: 1 }, revenue: { $sum: "$amount" } } },
    ]);
    
    // Populate package names for popularity data
    const popularity = await Promise.all(
      popularityResult.map(async (item) => {
        const pkg = await Package.findById(item._id);
        return {
          name: pkg ? pkg.name : "Deleted Plan",
          count: item.count,
          revenue: item.revenue,
        };
      })
    );

    // 6. Recent Transactions (last 10)
    const recentTransactions = await Transaction.find({})
      .populate("userId", "username phone")
      .populate("packageId", "name price")
      .sort({ createdAt: -1 })
      .limit(10);

    // 7. Sales History Chart (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const salesHistoryResult = await Transaction.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: sevenDaysAgo },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$amount" },
          salesCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Format sales history to fill in dates with 0 sales if they had none
    const salesHistory = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      const match = salesHistoryResult.find((s) => s._id === dateStr);
      salesHistory.push({
        date: dateStr,
        revenue: match ? match.revenue : 0,
        salesCount: match ? match.salesCount : 0,
      });
    }

    res.json({
      metrics: {
        totalRevenue,
        activeUsers,
        totalVouchers,
        unusedVouchers,
        usedVouchers,
        totalPackages,
      },
      popularity,
      recentTransactions,
      salesHistory,
    });
  } catch (error) {
    res.status(500).json({ message: "Failed to load dashboard metrics", error: error.message });
  }
};
