import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { detectScam } from "../lib/detectScam.js";
import { fakeApis, safeScores } from "./helpers/fakeApis.js";

// Full pipeline with RDAP, Tavily and Gemini faked (see helpers/fakeApis.js).
const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
beforeEach((t) => {
  t.mock.method(console, "warn", () => {});
  process.env.GEMINI_API_KEY = "fake";
  process.env.TAVILY_API_KEY = "tvly-test";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

const INFOSYS_RESULTS = [
  { title: "Infosys - Wikipedia", url: "https://en.wikipedia.org/wiki/Infosys", content: "" },
  { title: "Infosys careers", url: "https://www.infosys.com/careers", content: "" },
];
const job = (company, email) => ({ company, jobTitle: "Systems Engineer", email, salary: "360000", currency: "INR", location: "Chennai" });
const gemini = (extra = {}) => ({
  scores: safeScores,
  redFlags: [],
  greenFlags: [],
  reasoning: "r",
  recommendation: "c",
  companySearch: { found: true, matchedResults: [1, 2], evidence: "Results 1 and 2 are Infosys." },
  ...extra,
});

test("WHOIS creation date is shown in Automated checks", async () => {
  globalThis.fetch = fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: gemini() });
  const r = await detectScam(job("Infosys", "careers@infosys.com"));
  assert.equal(r.checks.summary[0], "Email domain: infosys.com");
  assert.match(r.checks.summary[1], /^WHOIS creation date: 2010-01-01 \(\d+ years old\)$/);
});

test("WHOIS creation date shows 'unavailable' when the lookup fails, and for free providers", async () => {
  globalThis.fetch = fakeApis({ registered: null, results: INFOSYS_RESULTS, gemini: gemini() });
  let r = await detectScam(job("Infosys", "careers@infosys.com"));
  assert.equal(r.checks.summary[1], "WHOIS creation date: unavailable");

  r = await detectScam(job("Infosys", "infosys.hr@gmail.com"));
  assert.equal(r.checks.summary[0], "Email domain: gmail.com (free email provider)");
  assert.equal(r.checks.summary[1], "WHOIS creation date: unavailable (not looked up for free email providers)");
});

test("real company, matching email domain: no flag, match shown", async () => {
  globalThis.fetch = fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: gemini() });
  const r = await detectScam(job("Infosys", "careers@infosys.com"));
  assert.deepEqual(r.redFlags, []);
  assert.equal(r.level, "LOW");
  assert.ok(r.checks.summary.includes("Email domain matches the company's website (www.infosys.com)"));
});

// For infosys-careers.com the email-domain search also finds nothing on that domain, so it adds its own flag.
const LOOKALIKE_FLAGS = ["Email domain does not match the company's website", "Could not confirm the email domain belongs to the company"];

test("real company name, different email domain: flagged", async () => {
  globalThis.fetch = fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: gemini() });
  const r = await detectScam(job("Infosys", "hr@infosys-careers.com"));
  assert.deepEqual(r.redFlags, LOOKALIKE_FLAGS);
  assert.equal(r.level, "MEDIUM"); // two red flags
  assert.ok(r.checks.summary.includes("Email domain infosys-careers.com does not match the company's website (www.infosys.com)"));
});

test("Gemini restating the mismatch counts as the same issue", async () => {
  const restated = gemini({
    redFlags: [
      "The email domain infosys-careers.com does not match the official infosys.com domain",
      "Using unofficial domains for recruitment is a common tactic used by impersonators.", // real Gemini output
    ],
  });
  globalThis.fetch = fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: restated });
  const r = await detectScam(job("Infosys", "hr@infosys-careers.com"));
  assert.deepEqual(r.redFlags, LOOKALIKE_FLAGS);
});

test("company found + gmail: verdict HIGH even with safe scores", async () => {
  const zoho = [{ title: "Zoho Corporation - Wikipedia", url: "https://en.wikipedia.org/wiki/Zoho_Corporation", content: "" }];
  const found = gemini({ companySearch: { found: true, matchedResults: [1], evidence: "Result 1 is Zoho." } });
  globalThis.fetch = fakeApis({ results: zoho, gemini: found });
  const r = await detectScam(job("Zoho Corporation", "zoho.recruitment.team@gmail.com"));
  assert.equal(r.level, "HIGH");
  assert.match(r.verdictNote, /likely impersonation/);
  assert.ok(r.checks.summary.includes("Email vs company website: not checked (free email provider)"));
});

test("headquarters-elsewhere flags from Gemini are dropped and don't count toward the 2-flag rule", async () => {
  const hq = gemini({
    redFlags: [
      "Company is headquartered in Bengaluru but the job is located in Chennai",
      "The official LinkedIn and registered company information indicate the headquarters is in Mumbai, whereas the job location is in Madurai without explicit details about a local branch office.",
      "Asks for a registration fee",
    ],
  });
  globalThis.fetch = fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: hq });
  const r = await detectScam(job("Infosys", "careers@infosys.com"));
  assert.deepEqual(r.redFlags, ["Asks for a registration fee"]);
  assert.equal(r.level, "LOW"); // with the HQ flag counted it would be 2 flags -> MEDIUM
});
