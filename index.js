import dotenv from "dotenv";
import readlineSync from "readline-sync";
import { detectScam } from "./lib/detectScam.js";
import { redactSecrets } from "./lib/redact.js";

dotenv.config();

const DIMENSION_LABELS = {
  companyLegitimacy: "Company legitimacy",
  emailDomain: "Email domain",
  salaryRealism: "Salary realism",
  offerQuality: "Offer quality",
  scamPatterns: "Scam patterns",
};
const LEVEL_ICONS = { HIGH: "🔴", MEDIUM: "🟠", LOW: "🟢" };

async function checkJobScam(company, jobTitle, email, salary, location, currency = "INR") {
  console.log("\n🤖 Agent analyzing job posting (WHOIS lookup, web search, AI scoring)...\n");
  return detectScam({ company, jobTitle, email, salary, location, currency });
}

function printVerdict(result) {
  const bar = (score) => "█".repeat(Math.round(score / 10)).padEnd(10, "░");
  const list = (items) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "- None");

  console.log(`\nVERDICT:     ${LEVEL_ICONS[result.level]} ${result.level} RISK`);
  console.log(`RISK SCORE:  ${result.riskScore}/100`);
  if (result.verdictNote) console.log(`             (${result.verdictNote})`);

  console.log("\nSCORES (higher = safer):");
  for (const [dim, label] of Object.entries(DIMENSION_LABELS)) {
    console.log(`  ${label.padEnd(20)} ${bar(result.scores[dim])} ${result.scores[dim]}`);
  }

  console.log("\nAUTOMATED CHECKS:\n" + list(result.checks.summary));
  console.log("\nRED FLAGS:\n" + list(result.redFlags));
  console.log("\nGREEN FLAGS:\n" + list(result.greenFlags));
  console.log("\nREASONING:\n" + result.reasoning);
  console.log("\nRECOMMENDATION:\n" + result.recommendation);
  console.log(`\nAnalyzed by ${result.model}`);
}

async function getUserInput() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   🔍 JOB SCAM DETECTOR - Interactive Mode     ║");
  console.log("║        Powered by Google Gemini                ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  console.log("📋 Please enter the job posting details:\n");

  const company = readlineSync.question("? Enter company name: ");
  const jobTitle = readlineSync.question("? Enter job title: ");
  const email = readlineSync.question("? Enter contact email: ");
  const currencyInput = readlineSync.question("? Currency (INR/USD) [INR]: ") || "INR";
  const currency = currencyInput.trim().toUpperCase() === "USD" ? "USD" : "INR";
  const salary = readlineSync.questionInt(`? Enter salary (${currency === "USD" ? "$" : "₹"}): `);
  const location = readlineSync.question("? Enter location: ");

  return { company, jobTitle, email, salary, currency, location };
}

async function main() {
  try {
    // Get user input
    const jobInput = await getUserInput();

    // Display the input
    console.log("\n" + "═".repeat(50));
    console.log("📋 ANALYZING JOB POSTING");
    console.log("═".repeat(50));
    console.log(`\nCompany: ${jobInput.company}`);
    console.log(`Job Title: ${jobInput.jobTitle}`);
    console.log(`Email: ${jobInput.email}`);
    console.log(`Salary: ${jobInput.currency === "USD" ? "$" : "₹"}${jobInput.salary} ${jobInput.currency}`);
    console.log(`Location: ${jobInput.location}`);
    console.log();

    // Run agent
    const result = await checkJobScam(
      jobInput.company,
      jobInput.jobTitle,
      jobInput.email,
      jobInput.salary,
      jobInput.location,
      jobInput.currency
    );

    // Display verdict
    console.log("═".repeat(50));
    console.log("📊 AGENT VERDICT");
    console.log("═".repeat(50));
    printVerdict(result);
    console.log("\n" + "═".repeat(50));
    console.log("✅ Analysis Complete!");
    console.log("═".repeat(50) + "\n");

  } catch (error) {
    console.error("❌ Error:", redactSecrets(error.message));
    process.exit(1);
  }
}

main();
