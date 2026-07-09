import mongoose from "mongoose";

const packageSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    durationMinutes: {
      type: Number,
      required: true,
      min: 1, // e.g. 60 for 1 hour, 1440 for 1 day
    },
    bandwidthLimitMbps: {
      type: Number,
      default: 0, // 0 means unlimited
    },
    dataLimitMB: {
      type: Number,
      default: 0, // 0 means unlimited
    },
    description: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const Package = mongoose.model("Package", packageSchema);
export default Package;
