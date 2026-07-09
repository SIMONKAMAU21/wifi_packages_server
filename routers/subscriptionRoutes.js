import express from "express";
import { getActiveSubscription, getAllSubscriptions } from "../controller/subscriptionController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/active", getActiveSubscription);
router.get("/", protect, adminOnly, getAllSubscriptions);

export default router;
