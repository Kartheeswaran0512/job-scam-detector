import Anthropic from "@anthropic-sdk/sdk";
import dotenv from "dotenv";
import readlineSync from "readline-sync";

dotenv.config();

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function checkJobScam(company, jobTitle, email, salary, location) {
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

  console.log("\n🤖 Agent analyzing job posting...\n");

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

  return message.content[0].text;
}

async function getUserInput() {
  console.log("\n╔════════════════════════════════════════════════╗");
  console.log("║   🔍 JOB SCAM DETECTOR - Interactive Mode     ║");
  console.log("║        Powered by Claude AI                    ║");
  console.log("╚════════════════════════════════════════════════╝\n");

  console.log("📋 Please enter the job posting details:\n");

  const company = readlineSync.question("? Enter company name: ");
  const jobTitle = readlineSync.question("? Enter job title: ");
  const email = readlineSync.question("? Enter contact email: ");
  const salary = readlineSync.questionInt("? Enter salary ($): ");
  const location = readlineSync.question("? Enter location: ");

  return { company, jobTitle, email, salary, location };
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
    console.log(`Salary: $${jobInput.salary}`);
    console.log(`Location: ${jobInput.location}`);
    console.log();

    // Run agent
    const verdict = await checkJobScam(
      jobInput.company,
      jobInput.jobTitle,
      jobInput.email,
      jobInput.salary,
      jobInput.location
    );

    // Display verdict
    console.log("═".repeat(50));
    console.log("📊 AGENT VERDICT");
    console.log("═".repeat(50));
    console.log("\n" + verdict);
    console.log("\n" + "═".repeat(50));
    console.log("✅ Analysis Complete!");
    console.log("═".repeat(50) + "\n");

  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

main();
