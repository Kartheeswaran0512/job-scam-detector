import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import Anthropic from "@anthropic-sdk/sdk";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Get __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Anthropic client
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root path
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint for job scam detection
app.post("/api/analyze-job", async (req, res) => {
  try {
    const { company, jobTitle, email, salary, location } = req.body;

    // Validate input
    if (!company || !jobTitle || !email || !salary || !location) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const prompt = `
You are a professional job scam detector AI agent. Analyze this job posting and determine if it's legitimate or a scam.

=== JOB POSTING DETAILS ===
Company: ${company}
Job Title: ${jobTitle}
Contact Email: ${email}
Offered Salary: $${salary}
Location: ${location}

=== YOUR ANALYSIS TASK ===
Check for these red flags:
1. Company Legitimacy: Is this a real company? Does it have a credible online presence?
2. Email Domain: Is the email from the official company domain or a free email service (Gmail, Yahoo)?
3. Salary Reality: Is the salary realistic for this role in ${location}? Compare to market standards.
4. Job Offer Quality: Are there any too-good-to-be-true elements?
5. Scam Patterns: Does this match known job scam patterns?

=== RESPONSE FORMAT ===
Provide your verdict in EXACTLY this format:

RISK LEVEL: [HIGH / MEDIUM / LOW]
CONFIDENCE: [XX%]

RED FLAGS:
- [Flag 1]
- [Flag 2]
- [Flag 3]

GREEN FLAGS:
- [Flag 1]
- [Flag 2]

REASONING:
[2-3 sentences explaining your verdict]

RECOMMENDATION:
[What the job seeker should do]
`;

    const message = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const verdict = message.content[0].text;

    res.json({
      success: true,
      verdict: verdict,
      input: { company, jobTitle, email, salary, location },
    });

  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "Server is running",
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Job Scam Detector running on http://localhost:${PORT}`);
  console.log(`📍 Open http://localhost:${PORT} in your browser`);
  console.log(`✅ API available at http://localhost:${PORT}/api/analyze-job`);
});
