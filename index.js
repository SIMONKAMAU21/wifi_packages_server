import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { connectDb } from "./config/db.js";

import authRouter from "./routers/authRoutes.js";
import packageRouter from "./routers/packageRoutes.js";
import voucherRouter from "./routers/voucherRoutes.js";
import paymentRouter from "./routers/paymentRoutes.js";
import subscriptionRouter from "./routers/subscriptionRoutes.js";
import adminRouter from "./routers/adminRoutes.js";

import User from "./models/User.js";
import bcrypt from "bcryptjs";

dotenv.config();

const seedAdmin = async () => {
  try {
    const adminExists = await User.findOne({ role: "admin" });
    if (!adminExists) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash("admin123", salt);
      await User.create({
        username: "admin",
        password: hashedPassword,
        role: "admin",
        phone: "0700000000",
        email: "admin@wifi.com",
      });
      console.warn("🚀 Seeded default admin user: Username 'admin' and Password 'admin123'");
    } else {
      console.log("Database already has admin user.");
    }
  } catch (error) {
    console.error("Failed to seed admin:", error.message);
  }
};

connectDb()
  .then(() => seedAdmin())
  .catch(console.dir);

const app = express();

// Configure CORS to allow access from any client domain (important for hotspot devices)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Base health check route
app.get("/", (req, res) => {
  res.send(`Health check: WiFi Billing Server running on port ${PORT}... 🚀`);
});

// Route imports
app.use("/api/auth", authRouter);
app.use("/api/packages", packageRouter);
app.use("/api/vouchers", voucherRouter);
app.use("/api/payments", paymentRouter);
app.use("/api/subscriptions", subscriptionRouter);
app.use("/api/admin", adminRouter);

// Server configuration
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.warn(`Server is up and running on port 🚀: ${PORT}`);
});

export default app;