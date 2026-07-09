import express from "express";
import { processCheckout, redeemVoucher } from "../controller/paymentController.js";

const router = express.Router();

router.post("/checkout", processCheckout);
router.post("/redeem-voucher", redeemVoucher);

export default router;
