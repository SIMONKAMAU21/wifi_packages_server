import express from "express";
import { getPendingScript, ackJob } from "../services/routeros.service.js";

const router = express.Router();

// MikroTik polls this every ~20-30s via a scheduler script
router.get("/pending", async (req, res) => {
  try {
    const script = await getPendingScript();
    res.set("Content-Type", "text/plain");
    res.status(200).send(script);
  } catch (error) {
    res.status(500).send(`# error: ${error.message}`);
  }
});

// The router's script calls this after it runs the commands
router.post("/ack/:jobId", async (req, res) => {
  try {
    const job = await ackJob(req.params.jobId, { success: true });
    if (!job) return res.status(404).json({ message: "Job not found" });
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
