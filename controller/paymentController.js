import axios from "axios";
import dotenv from "dotenv";
import Package from "../models/Package.js";
import Voucher from "../models/Voucher.js";
import Transaction from "../models/Transaction.js";
import Subscription from "../models/Subscription.js";
import User from "../models/User.js";
import { createHotspotUser } from "../services/routeros.service.js"; // NEW

dotenv.config();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

// Helper to generate a random transaction reference
const generateTxRef = (prefix = "TX") => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let ref = "";
  for (let i = 0; i < 10; i++) {
    ref += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${prefix}_${ref}`;
};

// @desc    Initiate a Paystack payment for a package (returns authorization_url for client to redirect to)
// @route   POST /api/payments/checkout
// @access  Private (or Public for guest checkout)
export const processCheckout = async (req, res) => {
  try {
    const { packageId, userId, phone, email, macAddress, ipAddress } = req.body;

    if (!packageId) {
      return res.status(400).json({ message: "Package ID is required" });
    }

    const pkg = await Package.findById(packageId);
    if (!pkg) {
      return res.status(404).json({ message: "Package not found" });
    }

    // Get or Create User
    let activeUserId = userId;
    let targetUser;

    if (!activeUserId) {
      const guestUsername = phone
        ? `guest_${phone}`
        : `mac_${macAddress.replace(/:/g, "")}`;
      targetUser = await User.findOne({ username: guestUsername });

      if (!targetUser) {
        targetUser = await User.create({
          username: guestUsername,
          phone: phone || "",
          password: "guest_password_123",
          role: "user",
        });
      }
      activeUserId = targetUser._id;
    } else {
      targetUser = await User.findById(activeUserId);
    }

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // NOTE: this is hardcoded to your test email right now — see flag below
    const userEmail = email || targetUser.email || "simonkamau7466@gmail.com";

    let voucher = await Voucher.findOne({
      packageId: pkg._id,
      status: "unused",
    });

    if (!voucher) {
      const randomCode = `PAY-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      voucher = await Voucher.create({
        code: randomCode,
        packageId: pkg._id,
        status: "unused",
      });
    }

    const txRef = generateTxRef("PSTK");

    const transaction = await Transaction.create({
      userId: activeUserId,
      packageId: pkg._id,
      amount: pkg.price,
      status: "pending",
      paymentMethod: "Paystack",
      reference: txRef,
    });

    const paystackData = {
      email: userEmail,
      amount: Math.round(pkg.price * 100),
      currency: "KES",
      channels: ["mobile_money", "card"],
      reference: txRef,
      callback_url:
        process.env.PAYSTACK_CALLBACK_URL ||
        "https://standard.paystack.co/close",
      metadata: {
        userId: String(activeUserId),
        packageId: String(pkg._id),
        voucherId: String(voucher._id),
        transactionId: String(transaction._id),
        macAddress: macAddress || "",
        ipAddress: ipAddress || "",
      },
    };

    const paystackResponse = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      paystackData,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    console.log(
      "authorization_url:",
      paystackResponse.data.data.authorization_url,
    );

    return res.status(200).json({
      success: true,
      message: "Payment initialized. Redirect the user to complete payment.",
      authorization_url: paystackResponse.data.data.authorization_url,
      access_code: paystackResponse.data.data.access_code,
      reference: txRef,
    });
  } catch (error) {
    console.error(
      "Paystack checkout error:",
      error.response?.data || error.message,
    );
    return res
      .status(500)
      .json({ message: "Checkout failed", error: error.message });
  }
};

// @desc    Verify a Paystack payment and activate the package
// @route   GET /api/payments/verify/:reference
export const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res
        .status(400)
        .json({ message: "Transaction reference is required" });
    }

    const result = await completeSubscriptionFromReference(reference);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    res.status(200).json({
      success: true,
      message: "Payment verified and package activated successfully!",
      credentials: result.credentials,
      subscription: result.subscription,
      transaction: result.transaction,
    });
  } catch (error) {
    console.error(
      "Paystack verification error:",
      error.response?.data || error.message,
    );
    res
      .status(500)
      .json({ message: "Verification failed", error: error.message });
  }
};

// @desc    Paystack webhook
// @route   POST /api/payments/webhook
export const paystackWebhook = async (req, res) => {
  try {
    const crypto = await import("crypto");
    const hash = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const reference = event.data.reference;
      await completeSubscriptionFromReference(reference);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Webhook processing error:", error.message);
    res.sendStatus(200);
  }
};

// Shared logic: verifies with Paystack, activates the subscription, and now
// also provisions the actual MikroTik hotspot user so the internet access works.
const completeSubscriptionFromReference = async (reference) => {
  const transaction = await Transaction.findOne({ reference });
  if (!transaction) {
    return { success: false, message: "Transaction not found" };
  }

  if (transaction.status === "completed") {
    const existingSubscription = await Subscription.findOne({
      transactionId: transaction._id,
    });
    const voucher = existingSubscription
      ? await Voucher.findById(existingSubscription.voucherId)
      : null;
    return {
      success: true,
      message: "Already processed",
      credentials: voucher
        ? { username: voucher.code, password: voucher.code }
        : undefined,
      subscription: existingSubscription,
      transaction: {
        reference: transaction.reference,
        amount: transaction.amount,
      },
    };
  }

  const paystackResponse = await axios.get(
    `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
    {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    },
  );

  const data = paystackResponse.data.data;

  if (data.status !== "success") {
    transaction.status = "failed";
    await transaction.save();
    return { success: false, message: `Payment status: ${data.status}` };
  }

  const { userId, packageId, voucherId, macAddress, ipAddress } = data.metadata;

  const pkg = await Package.findById(packageId);
  const voucher = await Voucher.findById(voucherId);

  if (!pkg || !voucher) {
    return {
      success: false,
      message: "Package or voucher no longer available",
    };
  }

  transaction.status = "completed";
  await transaction.save();

  voucher.status = "used";
  voucher.usedBy = userId;
  voucher.usedAt = new Date();
  await voucher.save();

  await Subscription.updateMany(
    {
      $or: [{ userId }, { macAddress: macAddress || "" }],
      status: "active",
    },
    { status: "expired" },
  );

  const startTime = new Date();
  const endTime = new Date(
    startTime.getTime() + pkg.durationMinutes * 60 * 1000,
  );

  const subscription = await Subscription.create({
    userId,
    packageId: pkg._id,
    macAddress: macAddress || "",
    ipAddress: ipAddress || "",
    startTime,
    endTime,
    status: "active",
    voucherId: voucher._id,
    transactionId: transaction._id,
  });

  // NEW: provision the actual hotspot user on MikroTik so the credentials
  // returned to the client will genuinely grant internet access.
  try {
    await createHotspotUser({
      username: voucher.code,
      password: voucher.code,
      durationMinutes: pkg.durationMinutes,
      bandwidthLimitMbps: pkg.bandwidthLimitMbps,
      dataLimitMB: pkg.dataLimitMB,
    });
  } catch (routerError) {
    console.error(
      "Failed to create hotspot user on MikroTik:",
      routerError.message,
    );
    // Payment succeeded and DB records exist — don't fail the response,
    // but this needs monitoring/alerting since the user won't be able to connect.
  }

  return {
    success: true,
    credentials: {
      username: voucher.code,
      password: voucher.code,
    },
    subscription: {
      id: subscription._id,
      packageName: pkg.name,
      startTime,
      endTime,
      durationMinutes: pkg.durationMinutes,
    },
    transaction: {
      reference: transaction.reference,
      amount: transaction.amount,
    },
  };
};

// @desc    Redeem Voucher (activate a package via direct voucher input — no payment involved)
// @route   POST /api/payments/redeem-voucher
export const redeemVoucher = async (req, res) => {
  try {
    const { code, userId, macAddress, ipAddress } = req.body;

    if (!code) {
      return res.status(400).json({ message: "Voucher code is required" });
    }

    const voucher = await Voucher.findOne({
      code: code.toUpperCase(),
    }).populate("packageId");
    if (!voucher) {
      return res.status(404).json({ message: "Invalid voucher code" });
    }

    if (voucher.status !== "unused") {
      return res
        .status(400)
        .json({ message: `Voucher is already ${voucher.status}` });
    }

    const pkg = voucher.packageId;

    let activeUserId = userId;
    let targetUser;

    if (!activeUserId) {
      const guestUsername = `mac_${macAddress.replace(/:/g, "")}`;
      targetUser = await User.findOne({ username: guestUsername });
      if (!targetUser) {
        targetUser = await User.create({
          username: guestUsername,
          password: "guest_password_123",
          role: "user",
        });
      }
      activeUserId = targetUser._id;
    } else {
      targetUser = await User.findById(activeUserId);
    }

    const startTime = new Date();
    const endTime = new Date(
      startTime.getTime() + pkg.durationMinutes * 60 * 1000,
    );

    await Subscription.updateMany(
      {
        $or: [{ userId: activeUserId }, { macAddress: macAddress || "" }],
        status: "active",
      },
      { status: "expired" },
    );

    const subscription = await Subscription.create({
      userId: activeUserId,
      packageId: pkg._id,
      macAddress: macAddress || "",
      ipAddress: ipAddress || "",
      startTime,
      endTime,
      status: "active",
      voucherId: voucher._id,
    });

    const txRef = `VOUCH_${voucher.code}_${Date.now().toString().slice(-4)}`;
    await Transaction.create({
      userId: activeUserId,
      packageId: pkg._id,
      amount: pkg.price,
      status: "completed",
      paymentMethod: "Voucher",
      reference: txRef,
    });

    voucher.status = "used";
    voucher.usedBy = activeUserId;
    voucher.usedAt = new Date();
    await voucher.save();

    // NEW: provision the hotspot user here too, since redemption also
    // grants access without going through Paystack.
    try {
      await createHotspotUser({
        username: voucher.code,
        password: voucher.code,
        durationMinutes: pkg.durationMinutes,
        bandwidthLimitMbps: pkg.bandwidthLimitMbps,
        dataLimitMB: pkg.dataLimitMB,
      });
    } catch (routerError) {
      console.error(
        "Failed to create hotspot user on MikroTik:",
        routerError.message,
      );
    }

    res.status(200).json({
      success: true,
      message: "Voucher redeemed successfully!",
      credentials: {
        username: voucher.code,
        password: voucher.code,
      },
      subscription: {
        id: subscription._id,
        packageName: pkg.name,
        startTime,
        endTime,
        durationMinutes: pkg.durationMinutes,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Voucher redemption failed", error: error.message });
  }
};
