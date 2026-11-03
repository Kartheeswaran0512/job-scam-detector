import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { detectScam } from "../lib/detectScam.js";
import { checkEmailDomainSearch } from "../lib/emailDomainSearch.js";
import { searchEmailDomain } from "../lib/searchCompany.js";
import { fakeApis, safeScores } from "./helpers/fakeApis.js";

const FLAG = "Could not confirm the email domain belongs to the company";
const r = (title, url, content = "") => ({ title, url, content });

// Full pipeline with RDAP, Tavily and Gemini faked; `tavily` maps each search query to its results.
const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
let queries;
beforeEach((t) => {
  t.mock.method(console, "warn", () => {});
  process.env.GEMINI_API_KEY = "fake";
  process.env.TAVILY_API_KEY = "tvly-test";
  queries = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

function run(company, email, tavily, geminiExtra = {}) {
  globalThis.fetch = fakeApis({
    registered: "2010-01-01T00:00:00Z",
    results: (query) => {
      queries.push(query);
      return query in tavily ? tavily[query] : tavily.company;
    },
    gemini: {
      scores: safeScores,
      redFlags: [],
      greenFlags: [],
      reasoning: "r",
      recommendation: "c",
      companySearch: { found: true, matchedResults: [1, 2], evidence: "Results 1 and 2." },
      ...geminiExtra,
    },
  });
  return detectScam({ company, jobTitle: "Engineer", email, salary: "400000", currency: "INR", location: "Chennai" });
}

const INFOSYS = {
  company: [r("Infosys - Wikipedia", "https://en.wikipedia.org/wiki/Infosys"), r("Infosys | LinkedIn", "https://www.linkedin.com/company/infosys")],
  "infosys.com": [r("Infosys - Navigate your next", "https://www.infosys.com/", "Infosys is a global leader in digital services")],
};
const TCS = {
  company: [
    r("Tata Consultancy Services - Wikipedia", "https://en.wikipedia.org/wiki/Tata_Consultancy_Services"),
    r("Tata Consultancy Services | LinkedIn", "https://www.linkedin.com/company/tata-consultancy-services"),
  ],
  "tcs.com": [r("TCS India | Tata Consultancy Services", "https://www.tcs.com/", "IT services, consulting and business solutions")],
};
// Shaped like the live results: the company search finds the LinkedIn page; the only page on
// nexoratech.in calls itself just "Nexora", which is not the full company name.
const NEXORA_RESULTS = [
  r("Nexora Tech Solutions | LinkedIn", "https://in.linkedin.com/company/nexora-tech-solutions"),
  r("NexoraaTech", "https://nexoraatech.com"),
];
const NEXORA_SITE = [
  r("Nexora", "https://www.nexoratech.in", "At Nexora, We Blend Strategy, Design, And Technology To Build Powerful Digital Experiences."),
];
const NEXORA = { company: NEXORA_RESULTS, "nexoratech.in": NEXORA_SITE };

// --- The four required cases ---

test("Infosys with an infosys.com email: domain confirmed, no flag", async () => {
  const result = await run("Infosys", "careers@infosys.com", INFOSYS);
  assert.deepEqual(queries, ["Infosys Chennai company", "infosys.com"]);
  assert.deepEqual(result.redFlags, []);
  assert.ok(result.checks.summary.includes('Email domain search: infosys.com confirmed ("Infosys - Navigate your next")'));
});

test("TCS with a tcs.com email: domain confirmed by the page title naming the full company, no flag", async () => {
  const result = await run("Tata Consultancy Services", "careers@tcs.com", TCS);
  assert.deepEqual(result.redFlags, []);
  assert.equal(result.level, "LOW");
  assert.ok(result.checks.summary.includes('Email domain search: tcs.com confirmed ("TCS India | Tata Consultancy Services")'));
});

test("Nexora with nexoratech.in: the page there only says 'Nexora', flagged", async () => {
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", NEXORA, {
    companySearch: { found: true, matchedResults: [1], evidence: "Result 1 is the company's LinkedIn page." },
  });
  assert.deepEqual(queries, ["Nexora Tech Solutions Chennai company", "nexoratech.in"]);
  assert.deepEqual(result.redFlags, [FLAG]);
  assert.ok(
    result.checks.summary.includes('Email domain search: nexoratech.in found, but no result there names Nexora Tech Solutions ("Nexora")')
  );
});

test("Nexora with no pages on nexoratech.in at all: 'not found in results', flagged", async () => {
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", { company: NEXORA_RESULTS, "nexoratech.in": [] }, {
    companySearch: { found: true, matchedResults: [1], evidence: "e" },
  });
  assert.deepEqual(result.redFlags, [FLAG]);
  assert.ok(result.checks.summary.includes("Email domain search: nexoratech.in not found in results"));
});

test("the email-domain search queries the bare domain and limits results to that domain", async () => {
  let body;
  globalThis.fetch = async (url, init) => {
    body = JSON.parse(init.body);
    return Response.json({ results: [] });
  };
  await searchEmailDomain("nexoratech.in");
  assert.equal(body.query, "nexoratech.in");
  assert.deepEqual(body.include_domains, ["nexoratech.in"]);
});

test("Tavily fails on the email-domain search: no flag, 'Email domain search unavailable'", async () => {
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", { company: NEXORA_RESULTS, "nexoratech.in": null }, {
    companySearch: { found: true, matchedResults: [1], evidence: "e" },
  });
  assert.deepEqual(result.redFlags, []);
  assert.ok(result.checks.summary.includes("Email domain search unavailable"));
});

// --- Matching rules ---

const SEARCH = (results) => ({ results, error: null });

test("a result on the domain that names a different company: flagged", () => {
  const check = checkEmailDomainSearch("nexoratech.in", "Nexora Tech Solutions", SEARCH([
    { title: "Acme Widgets - Home", url: "https://www.nexoratech.in/", snippet: "Acme Widgets sells industrial parts." },
  ]));
  assert.equal(check.confirmed, false);
  assert.equal(check.detail, 'found, but no result there names Nexora Tech Solutions ("Acme Widgets - Home")');
});

test("a partial name on the domain is not a match", () => {
  const check = checkEmailDomainSearch("nexoratech.in", "Nexora Tech Solutions", SEARCH([
    { title: "Nexora", url: "https://nexoratech.in/", snippet: "Welcome to Nexora." },
  ]));
  assert.equal(check.confirmed, false);
});

test("subdomains count, and the company name may appear in the content instead of the title", () => {
  const check = checkEmailDomainSearch("nexoratech.in", "Nexora Tech Solutions", SEARCH([
    { title: "Careers", url: "https://careers.nexoratech.in/jobs", snippet: "Nexora Tech Solutions is hiring React Native developers." },
  ]));
  assert.equal(check.confirmed, true);
});

test("look-alike hosts are not on the domain", () => {
  const check = checkEmailDomainSearch("nexoratech.in", "Nexora Tech Solutions", SEARCH([
    { title: "Nexora Tech Solutions", url: "https://nexoratech.in.example.com/", snippet: "" },
    { title: "Nexora Tech Solutions", url: "https://notnexoratech.in/", snippet: "" },
  ]));
  assert.equal(check.confirmed, false);
  assert.equal(check.detail, "not found in results");
});

test("missing Tavily key: search unavailable, check skipped", async () => {
  delete process.env.TAVILY_API_KEY;
  const search = await searchEmailDomain("nexoratech.in");
  assert.equal(search.results, null);
  assert.equal(checkEmailDomainSearch("nexoratech.in", "Nexora Tech Solutions", search).confirmed, null);
});

// --- Verdict rules ---

const NOTE = "Raised from LOW to MEDIUM: email domain could not be confirmed as the company's";
const NEXORA_FOUND = { companySearch: { found: true, matchedResults: [1], evidence: "Result 1 is the company's LinkedIn page." } };

test("the flag counts as a red flag; with a second one the email-domain reason is still the note shown", async () => {
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", NEXORA, {
    ...NEXORA_FOUND,
    redFlags: ["Asks for a registration fee"],
  });
  assert.deepEqual(result.redFlags, [FLAG, "Asks for a registration fee"]);
  assert.equal(result.level, "MEDIUM");
  assert.equal(result.verdictNote, NOTE);
});

test("the flag goes through dedupeFlags (a repeat from Gemini counts once)", async () => {
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", NEXORA, {
    ...NEXORA_FOUND,
    redFlags: [FLAG.toUpperCase()],
  });
  assert.deepEqual(result.redFlags, [FLAG]);
});

// --- Unconfirmed email domain: verdict at least MEDIUM, email-domain score at most 40 ---

test("Nexora: the flag alone raises a LOW score to MEDIUM, with the note, and caps the email score at 40", async () => {
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", NEXORA, NEXORA_FOUND);
  assert.deepEqual(result.redFlags, [FLAG]); // the only red flag
  assert.equal(result.scores.emailDomain, 40); // Gemini said 90
  assert.equal(result.riskScore, 20); // LOW by score
  assert.equal(result.level, "MEDIUM");
  assert.equal(result.verdictNote, NOTE);
});

test("Infosys with its own domain: confirmed, stays LOW, email score untouched", async () => {
  const result = await run("Infosys", "careers@infosys.com", INFOSYS);
  assert.equal(result.level, "LOW");
  assert.equal(result.verdictNote, null);
  assert.equal(result.scores.emailDomain, 90);
});

test("TCS with its own domain: confirmed, stays LOW, email score untouched", async () => {
  const result = await run("Tata Consultancy Services", "careers@tcs.com", TCS);
  assert.equal(result.level, "LOW");
  assert.equal(result.verdictNote, null);
  assert.equal(result.scores.emailDomain, 90);
});

test("already HIGH by score: stays HIGH, no note", async () => {
  const low = { companyLegitimacy: 20, emailDomain: 20, salaryRealism: 20, offerQuality: 20, scamPatterns: 20 };
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", NEXORA, { ...NEXORA_FOUND, scores: low });
  assert.ok(result.redFlags.includes(FLAG));
  assert.equal(result.level, "HIGH");
  assert.equal(result.verdictNote, null);
  assert.equal(result.scores.emailDomain, 20); // the cap only lowers, never raises
});

test("a stricter email cap from another failed check is kept (30, not 40)", async () => {
  const infosysWithSite = {
    company: [r("Infosys - Wikipedia", "https://en.wikipedia.org/wiki/Infosys"), r("Infosys", "https://www.infosys.com/")],
    "infosys-careers.com": [],
  };
  const result = await run("Infosys", "hr@infosys-careers.com", infosysWithSite);
  assert.ok(result.redFlags.includes("Email domain does not match the company's website"));
  assert.ok(result.redFlags.includes(FLAG));
  assert.equal(result.scores.emailDomain, 30);
});

test("email-domain search unavailable: no floor and no cap", async () => {
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", { company: NEXORA_RESULTS, "nexoratech.in": null }, NEXORA_FOUND);
  assert.equal(result.level, "LOW");
  assert.equal(result.scores.emailDomain, 90);
});

// --- When the second search does not run ---

test("not run for free email providers or when the company was not found", async () => {
  await run("Infosys", "infosys.hr@gmail.com", INFOSYS);
  assert.deepEqual(queries, ["Infosys Chennai company"]);

  queries = [];
  const result = await run("Nexora Tech Solutions", "hr@nexoratech.in", NEXORA, {
    companySearch: { found: false, matchedResults: [], evidence: "None matched." },
  });
  assert.deepEqual(queries, ["Nexora Tech Solutions Chennai company"]);
  assert.ok(!result.redFlags.includes(FLAG));
  assert.ok(!result.checks.summary.some((line) => line.startsWith("Email domain search")));
});
