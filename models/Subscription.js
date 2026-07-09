import mongoose from "mongoose";

const subscriptionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Package",
      required: true,
    },
    macAddress: {
      type: String,
      trim: true,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    dataUsedMB: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["active", "expired", "paused"],
      default: "active",
    },
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Voucher",
      default: null,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to quickly find active subscriptions for a MAC address
subscriptionSchema.index({ macAddress: 1, status: 1 });

const Subscription = mongoose.model("Subscription", subscriptionSchema);
export default Subscription;
