import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { detectScam, checkSignals } from "./detectScam.js";
import { checkDomain } from "./checkDomain.js";
import { searchCompany } from "./searchCompany.js";
import { matchesCompanyName, isCompanyWebsite } from "./companyMatch.js";
import { redactSecrets } from "./redact.js";

// The MCP tools. mcp-server.js loads .env and connects the server to stdio; tests call the handlers directly
// or through an in-memory client. Every handler returns an MCP tool result and never throws.

// The full pipeline, the same call /api/analyze-job makes. Returns detectScam's result unchanged.
export const analyzeJobPosting = ({ company, jobTitle, email, salary, currency = "INR", location }) =>
  respond("analyze_job_posting", () => detectScam({ company, jobTitle, email, salary, currency, location }));

// Only the email checks: free provider, WHOIS registration date. `redFlags` uses the pipeline's wording.
export const checkEmailDomain = ({ email }) =>
  respond("check_email_domain", async () => {
    const domain = await checkDomain(email);
    if (!domain.domain) throw new Error(`Invalid email address: "${email}"`);
    return { ...domain, redFlags: checkSignals(domain, { verified: null }).redFlags };
  });

// Only the Tavily company search. Without Gemini, a result counts as a match when its title or domain
// matches the full company name (the same strict check the pipeline applies after Gemini's judgement).
export const verifyCompany = ({ company, location }) =>
  respond("verify_company", async () => {
    const search = await searchCompany(company, location);
    if (!search.results) throw new Error(`Company web search unavailable: ${search.error}`);
    const matched = search.results.filter((result) => matchesCompanyName(company, result));
    const websites = matched.filter((result) => isCompanyWebsite(company, result)).map((r) => new URL(r.url).hostname);
    return {
      company,
      location,
      query: search.query,
      verdict: matched.length > 0 ? "found" : "not found",
      evidence: searchEvidence(search, matched),
      matchedResults: matched,
      websites: [...new Set(websites)],
      totalResults: search.results.length,
    };
  });

function searchEvidence({ company, query, results }, matched) {
  if (results.length === 0) return `no web results for "${query}"`;
  if (matched.length === 0) return `${results.length} results, but none has a title or domain matching the full name "${company}"`;
  return `${matched.length} of ${results.length} results have a title or domain matching the full name "${company}"`;
}

// Success: the result as JSON text. Failure (e.g. Gemini out of quota): a tool error with the readable,
// redacted message, so the client sees what went wrong and the server keeps running.
async function respond(tool, run) {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await run(), null, 2) }] };
  } catch (err) {
    const message = redactSecrets(err?.message ?? err);
    console.error(`${tool} failed:`, message);
    return { content: [{ type: "text", text: message }], isError: true };
  }
}

const text = (description) => z.string().min(1).describe(description);
const readOnly = { readOnlyHint: true, openWorldHint: true };

export function createMcpServer() {
  const server = new McpServer({ name: "job-scam-detector", version: "1.0.0" });

  server.registerTool(
    "analyze_job_posting",
    {
      title: "Analyze job posting",
      description:
        "Full scam check of a job offer: WHOIS age and free-provider check of the contact email's domain, a web " +
        "search for the company, Gemini scoring, and fixed rules in code. Returns JSON: level (HIGH, MEDIUM or LOW " +
        "risk), riskScore (0-100, higher = riskier), verdictNote (why a rule raised the level, or null), scores " +
        "(five dimensions, 0-100, higher = safer), redFlags, greenFlags, reasoning, recommendation, model (the " +
        "Gemini model used) and checks (the automated checks; checks.summary lists them as plain text). " +
        "Each call uses Gemini and Tavily API quota.",
      inputSchema: {
        company: text("Company name as given in the offer"),
        jobTitle: text("Job title"),
        email: text("Contact email address from the offer"),
        salary: z.number().positive().describe("Offered salary as a number (the web form asks for the yearly amount)"),
        currency: z.enum(["INR", "USD"]).default("INR").describe("Salary currency"),
        location: text("Job location, e.g. a city"),
      },
      annotations: readOnly,
    },
    analyzeJobPosting
  );

  server.registerTool(
    "check_email_domain",
    {
      title: "Check email domain",
      description:
        "Checks only the contact email's domain: whether it is a free email provider (Gmail, Yahoo, Outlook...) " +
        "and, for other domains, its WHOIS/RDAP registration date and age in days. Returns JSON: domain, " +
        "isFreeProvider, createdAt, ageDays, error (why the WHOIS lookup failed, or null) and redFlags " +
        "(free provider, or registered less than a year ago). No AI and no web search.",
      inputSchema: { email: text("Contact email address") },
      annotations: readOnly,
    },
    checkEmailDomain
  );

  server.registerTool(
    "verify_company",
    {
      title: "Verify company",
      description:
        "Searches the web (Tavily) for '<company> <location> company' and checks whether any result's title or " +
        "domain matches the FULL company name (legal suffixes such as Pvt Ltd are ignored; partial matches don't " +
        "count). Returns JSON: verdict ('found' or 'not found'), evidence, matchedResults (title, url, snippet), " +
        "websites (matched results whose domain is the company name), query and totalResults. Unlike " +
        "analyze_job_posting, no AI checks what the matched pages say, so a page warning about the company " +
        "also counts as a match.",
      inputSchema: {
        company: text("Company name"),
        location: text("Location to search with, e.g. the job's city"),
      },
      annotations: readOnly,
    },
    verifyCompany
  );

  return server;
}
