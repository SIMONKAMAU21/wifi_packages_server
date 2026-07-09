import { RouterOSAPI } from "node-routeros";
import dotenv from "dotenv";
dotenv.config();

const getConnection = async () => {
  const conn = new RouterOSAPI({
    host: process.env.ROUTEROS_HOST, // e.g. "192.168.88.1"
    user: process.env.ROUTEROS_USER, // API-enabled admin user
    password: process.env.ROUTEROS_PASSWORD,
    port: process.env.ROUTEROS_API_PORT || 8728, // 8729 if using API-SSL
    tls: {
      rejectUnauthorized: false,
    },
  });
  await conn.connect();
  return conn;
};

// Converts minutes -> "HH:MM:SS" format RouterOS expects for limit-uptime
const formatUptime = (minutes) => {
  const totalSeconds = minutes * 60;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
};

export const createHotspotUser = async ({
  username,
  password,
  durationMinutes,
  bandwidthLimitMbps,
  dataLimitMB,
  profileName = "default",
}) => {
  const conn = await getConnection();

  try {
    const params = [
      `=name=${username}`,
      `=password=${password}`,
      `=profile=${profileName}`,
      `=limit-uptime=${formatUptime(durationMinutes)}`,
    ];

    if (dataLimitMB && dataLimitMB > 0) {
      // limit-bytes-total expects bytes
      params.push(`=limit-bytes-total=${dataLimitMB * 1024 * 1024}`);
    }

    await conn.write("/ip/hotspot/user/add", params);

    // Optional: per-user rate limit (upload/download), e.g. "2M/5M"
    if (bandwidthLimitMbps && bandwidthLimitMbps > 0) {
      await conn.write("/ip/hotspot/user/set", [
        `=numbers=${username}`,
        `=rate-limit=${bandwidthLimitMbps}M/${bandwidthLimitMbps}M`,
      ]);
    }
  } finally {
    conn.close();
  }
};

export const disableHotspotUser = async (username) => {
  const conn = await getConnection();
  try {
    await conn.write("/ip/hotspot/user/set", [
      `=numbers=${username}`,
      `=disabled=yes`,
    ]);

    // Also kick them off if currently connected
    const activeUsers = await conn.write("/ip/hotspot/active/print", [
      `?user=${username}`,
    ]);
    for (const active of activeUsers) {
      await conn.write("/ip/hotspot/active/remove", [`=.id=${active[".id"]}`]);
    }
  } finally {
    conn.close();
  }
};

export const removeHotspotUser = async (username) => {
  const conn = await getConnection();
  try {
    const users = await conn.write("/ip/hotspot/user/print", [
      `?name=${username}`,
    ]);
    for (const user of users) {
      await conn.write("/ip/hotspot/user/remove", [`=.id=${user[".id"]}`]);
    }
  } finally {
    conn.close();
  }
};
