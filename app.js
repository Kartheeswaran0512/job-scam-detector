import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { detectScam, formatVerdict } from "./lib/detectScam.js";
import { analyzeRateLimits } from "./lib/rateLimit.js";
import { redactSecrets } from "./lib/redact.js";

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Builds the Express app without starting it: server.js listens, tests create a fresh app
// (with fresh rate-limit counters) each time.
export function createApp() {
  const app = express();

  // Behind one reverse proxy (e.g. Render), take the client IP from X-Forwarded-For so the per-IP rate limit
  // counts each user, not the proxy. Off by default: without a proxy, clients could fake their IP with it.
  if (process.env.TRUST_PROXY === "true") app.set("trust proxy", 1);

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Serve static files from public folder
  app.use(express.static(path.join(__dirname, 'public')));

  app.use(express.static(path.join(__dirname, 'client/dist')));
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist', 'index.html'));
  });

  // Serve index.html for root path
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // API endpoint for job scam detection
  app.post("/api/analyze-job", analyzeRateLimits(), async (req, res) => {
    try {
      const { company, jobTitle, email, salary, location } = req.body;
      const currency = req.body.currency || "INR";

      // Validate input
      if (!company || !jobTitle || !email || !salary || !location) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const job = { company, jobTitle, email, salary, currency, location };
      const analysis = await detectScam(job);

      res.json({
        success: true,
        verdict: formatVerdict(analysis), // legacy plain-text format for older clients
        analysis,
        input: job,
      });

    } catch (error) {
      const message = redactSecrets(error.message);
      console.log("error");
      console.error("Error:", message);
      res.status(500).json({ error: message });
    }
  });

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "Server is running",
      timestamp: new Date().toISOString()
    });
  });

  return app;
}
