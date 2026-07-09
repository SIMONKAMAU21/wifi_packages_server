import express from "express";
import {
  generateVouchers,
  getVouchers,
  deleteVoucher,
  exportVouchersToMikroTik,
} from "../controller/voucherController.js";
import { protect, adminOnly } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, adminOnly, getVouchers);
router.post("/generate", protect, adminOnly, generateVouchers);
router.delete("/:id", protect, adminOnly, deleteVoucher);
router.get("/export-mikrotik", protect, adminOnly, exportVouchersToMikroTik);

export default router;
