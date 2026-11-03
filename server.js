import dotenv from "dotenv";
import { createApp } from "./app.js";

dotenv.config();

const PORT = process.env.PORT || 5000;

createApp().listen(PORT, () => {
  console.log(`🚀 Job Scam Detector running on http://localhost:${PORT}`);
  console.log(`📍 Open http://localhost:${PORT} in your browser`);
  console.log(`✅ API available at http://localhost:${PORT}/api/analyze-job`);
});
