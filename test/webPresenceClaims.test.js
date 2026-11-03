import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { removeWebPresenceClaims } from "../lib/webPresenceClaims.js";
import { groundWebPresence, detectScam } from "../lib/detectScam.js";

// Claims like these came from real Gemini output when no search results were available.
const WEB_CLAIMS = [
  "There is no verifiable web presence or official website for the stated company.",
  "Company name does not appear in official business or web search records",
  "Company could not be verified online",
  "The company has an active LinkedIn page with thousands of followers",
  "No reviews on Glassdoor",
  "Search results confirm the company exists",
  "The company appears online as a registered business",
];
const OTHER_FLAGS = [
  "Extremely high salary offered for a basic remote data entry role (₹18,00,000 INR per year)",
  "Interview conducted online over Telegram only",
  "Asks you to pay online for training materials",
  "Recruiter address does not use Zoho's official zoho.com domain",
  "The employer is a well-established global multinational technology company.",
];

// --- removeWebPresenceClaims ---

test("removes every flag that claims something about the company's online presence", () => {
  assert.deepEqual(removeWebPresenceClaims(WEB_CLAIMS), []);
});

test("keeps flags about other things, including ones that just mention 'online' or a domain", () => {
  assert.deepEqual(removeWebPresenceClaims(OTHER_FLAGS), OTHER_FLAGS);
});

// --- groundWebPresence: when it applies ---

const analysis = { redFlags: [WEB_CLAIMS[0], OTHER_FLAGS[0]], greenFlags: [WEB_CLAIMS[3], OTHER_FLAGS[4]] };

test("search unavailable: web-presence claims removed from red and green flags", () => {
  const r = groundWebPresence(analysis, { results: null, error: "TAVILY_API_KEY is not set" });
  assert.deepEqual(r.redFlags, [OTHER_FLAGS[0]]);
  assert.deepEqual(r.greenFlags, [OTHER_FLAGS[4]]);
});

test("search returned no results: web-presence claims removed", () => {
  const r = groundWebPresence(analysis, { results: [], error: null });
  assert.deepEqual(r.redFlags, [OTHER_FLAGS[0]]);
  assert.deepEqual(r.greenFlags, [OTHER_FLAGS[4]]);
});

test("search returned results: Gemini's web-presence claims are kept (they can be grounded)", () => {
  const r = groundWebPresence(analysis, { results: [{ title: "Acme", url: "https://acme.com", snippet: "" }] });
  assert.deepEqual(r, analysis);
});

// --- Full pipeline (Tavily and Gemini faked, gmail address so no WHOIS lookup) ---

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
let tavilyResults; // what the fake Tavily returns; null = Tavily fails

beforeEach((t) => {
  t.mock.method(console, "warn", () => {});
  process.env.GEMINI_API_KEY = "fake";
  process.env.TAVILY_API_KEY = "tvly-test";
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    if (url.startsWith("https://api.tavily.com/")) {
      return tavilyResults ? Response.json({ results: tavilyResults }) : new Response("{}", { status: 500 });
    }
    // Gemini: safe scores, but one ungrounded web-presence claim in each flag list.
    const data = {
      scores: { companyLegitimacy: 90, emailDomain: 90, salaryRealism: 90, offerQuality: 90, scamPatterns: 90 },
      redFlags: ["No official website or LinkedIn page was found for this company"],
      greenFlags: ["Company has a professional website", "Salary is realistic for the role"],
      reasoning: "r",
      recommendation: "c",
    };
    return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(data) }] } }] });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

const job = { company: "Acme Hiring", jobTitle: "Clerk", email: "acme.hr@gmail.com", salary: "300000", currency: "INR", location: "Chennai" };
const FREE_EMAIL = "Contact email uses a free email provider (gmail.com) instead of a company domain";

test("pipeline, Tavily failing: Gemini's claims removed before the 2-red-flag rule, verdict stays LOW", async () => {
  tavilyResults = null;
  const r = await detectScam(job);
  assert.deepEqual(r.redFlags, [FREE_EMAIL]); // without the removal there would be 2 flags -> MEDIUM
  assert.equal(r.level, "LOW");
  assert.deepEqual(r.greenFlags, ["Salary is realistic for the role"]);
  assert.ok(r.checks.summary.includes("Company web search unavailable"));
});

test("pipeline, missing Tavily key: same result", async () => {
  delete process.env.TAVILY_API_KEY;
  const r = await detectScam(job);
  assert.deepEqual(r.redFlags, [FREE_EMAIL]);
  assert.deepEqual(r.greenFlags, ["Salary is realistic for the role"]);
});

test("pipeline, no search results: Gemini's claims removed, the automated 'not verified' flag stays", async () => {
  tavilyResults = [];
  const r = await detectScam(job);
  assert.deepEqual(r.redFlags, ["Company could not be verified online", FREE_EMAIL]);
  assert.deepEqual(r.greenFlags, ["Salary is realistic for the role"]);
});
