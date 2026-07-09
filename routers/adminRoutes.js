import express from "express";
import { getDashboardStats } from "../controller/adminController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/stats", protect, adminOnly, getDashboardStats);

export default router;
