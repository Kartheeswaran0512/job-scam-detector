import { rateLimit } from "express-rate-limit";
import { RATE_LIMIT_CONFIG } from "./config.js";

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// Middleware for the analyze endpoint: a per-IP limit first, then a cap on total scans shared by everyone.
// A request the per-IP limit rejects never reaches the daily cap, so it doesn't use up a scan.
export function analyzeRateLimits({
  perMinute = RATE_LIMIT_CONFIG.perIpPerMinute,
  perDay = RATE_LIMIT_CONFIG.dailyScans,
} = {}) {
  return [
    rateLimit({
      windowMs: MINUTE,
      limit: perMinute,
      identifier: "per-ip",
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: limitReached((wait) => `Too many scans from your network: the limit is ${perMinute} per minute. Try again in ${wait}.`),
    }),
    rateLimit({
      windowMs: DAY,
      limit: perDay,
      identifier: "daily",
      keyGenerator: () => "all-clients", // one shared counter, not one per IP
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: limitReached((wait) => `Daily scan limit reached: this service runs at most ${perDay} scans a day. Try again in ${wait}.`),
    }),
  ];
}

// 429 with the same { error } JSON shape as the endpoint's other errors, plus when to retry.
function limitReached(message) {
  return (req, res) => {
    const retryAfterSeconds = Math.max(1, Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000));
    res.status(429).json({ error: message(formatWait(retryAfterSeconds)), retryAfterSeconds });
  };
}

function formatWait(seconds) {
  const plural = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (seconds < 60) return plural(seconds, "second");
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return plural(minutes, "minute");
  return `about ${plural(Math.ceil(minutes / 60), "hour")}`;
}
