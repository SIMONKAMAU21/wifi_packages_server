import Voucher from "../models/Voucher.js";
import Package from "../models/Package.js";

// Helper to convert minutes to MikroTik time format (e.g. 1d, 2h, 45m)
const formatMikrotikTime = (minutes) => {
  if (minutes % 1440 === 0) {
    return `${minutes / 1440}d`;
  } else if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  } else {
    return `${minutes}m`;
  }
};

// Helper to generate a random alphanumeric voucher code
const generateRandomCode = (length = 8) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Avoid ambiguous chars like O, 0, I, 1
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

// @desc    Bulk generate vouchers
// @route   POST /api/vouchers/generate
// @access  Private/Admin
export const generateVouchers = async (req, res) => {
  try {
    const { packageId, quantity, prefix } = req.body;

    if (!packageId || !quantity) {
      return res.status(400).json({ message: "Package ID and Quantity are required" });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    const vouchers = [];
    const pre = prefix ? prefix.trim().toUpperCase() : "WIFI";

    for (let i = 0; i < quantity; i++) {
      let uniqueCode = "";
      let codeExists = true;

      // Keep generating until unique code is found
      while (codeExists) {
        uniqueCode = `${pre}-${generateRandomCode(6)}`;
        const existing = await Voucher.findOne({ code: uniqueCode });
        if (!existing) {
          codeExists = false;
        }
      }

      vouchers.push({
        code: uniqueCode,
        packageId: pkg._id,
        status: "unused",
      });
    }

    const createdVouchers = await Voucher.insertMany(vouchers);
    res.status(201).json({
      message: `Successfully generated ${quantity} vouchers.`,
      vouchers: createdVouchers,
    });
  } catch (error) {
    res.status(500).json({ message: "Voucher generation failed", error: error.message });
  }
};

// @desc    Get all vouchers
// @route   GET /api/vouchers
// @access  Private/Admin
export const getVouchers = async (req, res) => {
  try {
    const vouchers = await Voucher.find({})
      .populate("packageId", "name price durationMinutes")
      .populate("usedBy", "username phone")
      .sort({ createdAt: -1 });
    res.json(vouchers);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch vouchers", error: error.message });
  }
};

// @desc    Delete voucher
// @route   DELETE /api/vouchers/:id
// @access  Private/Admin
export const deleteVoucher = async (req, res) => {
  try {
    const voucher = await Voucher.findById(req.params.id);
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    await Voucher.findByIdAndDelete(req.params.id);
    res.json({ message: "Voucher deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete voucher", error: error.message });
  }
};

// @desc    Export vouchers to MikroTik script (.rsc)
// @route   GET /api/vouchers/export-mikrotik
// @access  Private/Admin
export const exportVouchersToMikroTik = async (req, res) => {
  try {
    const vouchers = await Voucher.find({ status: "unused" }).populate(
      "packageId"
    );

    if (vouchers.length === 0) {
      return res.status(400).json({ message: "No unused vouchers found to export" });
    }

    let script = `# MikroTik Hotspot Voucher Configuration Script\n`;
    script += `# Generated on ${new Date().toISOString()}\n`;
    script += `# Import this file via FTP/Files and run '/import filename.rsc' in the terminal\n\n`;
    script += `/ip hotspot user\n`;

    vouchers.forEach((v) => {
      const pkg = v.packageId;
      const limitUptime = formatMikrotikTime(pkg.durationMinutes);
      
      let rateLimitCmd = "";
      if (pkg.bandwidthLimitMbps > 0) {
        // Limit upload to half of download or equal speed (e.g. 2M/5M or 5M/5M)
        const dl = `${pkg.bandwidthLimitMbps}M`;
        const ul = `${Math.ceil(pkg.bandwidthLimitMbps / 2)}M`;
        rateLimitCmd = ` rate-limit="${ul}/${dl}"`;
      }

      let limitBytesCmd = "";
      if (pkg.dataLimitMB > 0) {
        // dataLimitMB to bytes (1MB = 1,048,576 bytes)
        const bytes = pkg.dataLimitMB * 1024 * 1024;
        limitBytesCmd = ` limit-bytes-total=${bytes}`;
      }

      // Add user to MikroTik Hotspot
      script += `add name="${v.code}" password="${v.code}" limit-uptime=${limitUptime}${rateLimitCmd}${limitBytesCmd} comment="Plan: ${pkg.name} | Price: ${pkg.price}"\n`;
    });

    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", "attachment; filename=mikrotik_vouchers.rsc");
    res.send(script);
  } catch (error) {
    res.status(500).json({ message: "Export failed", error: error.message });
  }
};
