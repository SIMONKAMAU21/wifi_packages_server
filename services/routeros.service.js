import RouterJob from "../models/RouterJob.js";

// Converts minutes -> "HH:MM:SS" format RouterOS expects for limit-uptime
const formatUptime = (minutes) => {
  const totalSeconds = minutes * 60;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
};

// --- Same public API as before. Callers don't need to change. ---
// Each function now just enqueues a RouterJob and returns it (includes _id
// so callers can track provisioning status), instead of talking to the
// router directly.

export const createHotspotUser = async ({
  username,
  password,
  durationMinutes,
  bandwidthLimitMbps,
  dataLimitMB,
  profileName = "default",
}) => {
  const job = await RouterJob.create({
    type: "create",
    payload: {
      username,
      password,
      durationMinutes,
      bandwidthLimitMbps,
      dataLimitMB,
      profileName,
    },
  });
  return job;
};

export const disableHotspotUser = async (username) => {
  const job = await RouterJob.create({
    type: "disable",
    payload: { username },
  });
  return job;
};

export const removeHotspotUser = async (username) => {
  const job = await RouterJob.create({
    type: "remove",
    payload: { username },
  });
  return job;
};

// --- Script generation, used only by the /api/router/pending route ---

const buildScriptForJob = (job) => {
  const lines = [];
  const { type, payload } = job;

  if (type === "create") {
    const { username, password, durationMinutes, dataLimitMB, profileName } =
      payload;

    const params = [
      `name="${username}"`,
      `password="${password}"`,
      `profile="${profileName || "default"}"`,
      `limit-uptime="${formatUptime(durationMinutes)}"`,
    ];

    if (dataLimitMB && dataLimitMB > 0) {
      params.push(`limit-bytes-total=${dataLimitMB * 1024 * 1024}`);
    }

    lines.push(`/ip hotspot user add ${params.join(" ")}`);
  }

  if (type === "disable") {
    const { username } = payload;
    lines.push(`/ip hotspot user set numbers="${username}" disabled=yes`);
    lines.push(`/ip hotspot active remove [find user="${username}"]`);
  }

  if (type === "remove") {
    const { username } = payload;
    lines.push(`/ip hotspot user remove numbers="${username}"`);
  }

  lines.push(
    `/tool fetch url="${process.env.BASE_URL}/api/router/ack/${job._id}" http-method=post keep-result=no`,
  );

  return lines.join("\n");
};

// Pulls all pending jobs, marks them delivered, returns one combined script
export const getPendingScript = async () => {
  const jobs = await RouterJob.find({ status: "pending" }).sort({
    createdAt: 1,
  });

  if (jobs.length === 0) {
    return "# no pending jobs";
  }

  const scripts = jobs.map(buildScriptForJob);

  await RouterJob.updateMany(
    { _id: { $in: jobs.map((j) => j._id) } },
    { status: "delivered", deliveredAt: new Date() },
  );

  return scripts.join("\n\n");
};

export const ackJob = async (jobId, { success = true, error = null } = {}) => {
  const job = await RouterJob.findById(jobId);
  if (!job) return null;

  job.status = success ? "completed" : "failed";
  job.completedAt = new Date();
  if (error) job.error = error;
  await job.save();
  return job;
};
