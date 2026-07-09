import mongoose from "mongoose";

const routerJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["create", "disable", "remove"],
      required: true,
    },
    // Whatever the job needs to build its RouterOS script
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "delivered", "completed", "failed"],
      default: "pending",
    },
    deliveredAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    error: { type: String, default: null },
  },
  { timestamps: true },
);

// Fast lookup for the poll route
routerJobSchema.index({ status: 1, createdAt: 1 });

const RouterJob = mongoose.model("RouterJob", routerJobSchema);
export default RouterJob;
