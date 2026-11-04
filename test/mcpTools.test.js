import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { analyzeJobPosting, checkEmailDomain, verifyCompany, createMcpServer } from "../lib/mcpTools.js";
import { detectScam } from "../lib/detectScam.js";
import { fakeApis, safeScores } from "./helpers/fakeApis.js";

// The MCP tool handlers, with RDAP, Tavily and Gemini faked (see helpers/fakeApis.js).
const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
let errors; // what the handlers logged with console.error
beforeEach((t) => {
  t.mock.method(console, "warn", () => {});
  errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args.join(" ")));
  process.env.GEMINI_API_KEY = "fake";
  process.env.TAVILY_API_KEY = "tvly-test";
  delete process.env.GEMINI_MODEL;
});
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

const DAY_MS = 24 * 60 * 60 * 1000;
const INFOSYS_RESULTS = [
  { title: "Infosys - Wikipedia", url: "https://en.wikipedia.org/wiki/Infosys", content: "" },
  { title: "Infosys careers", url: "https://www.infosys.com/careers", content: "" },
];
const job = { company: "Infosys", jobTitle: "Systems Engineer", email: "careers@infosys.com", salary: 360000, location: "Chennai" };
const geminiReply = {
  scores: safeScores,
  redFlags: [],
  greenFlags: ["Official company email domain"],
  reasoning: "r",
  recommendation: "c",
  companySearch: { found: true, matchedResults: [1, 2], evidence: "Results 1 and 2 are Infosys." },
};

// Wraps a fake fetch and records each request's URL and body.
function recorded(fake) {
  const calls = [];
  const fetch = async (input, init) => {
    calls.push({ url: String(input?.url ?? input), body: String(init?.body ?? "") });
    return fake(input, init);
  };
  return { fetch, calls, hosts: () => calls.map((c) => new URL(c.url).hostname) };
}

// Gemini answers every model with this error; RDAP and Tavily are faked as usual.
function geminiFails(status, body) {
  const fake = fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: geminiReply });
  return async (input, init) => {
    if (String(input?.url ?? input).includes("generativelanguage.googleapis.com")) return Response.json(body, { status });
    return fake(input, init);
  };
}

const noNetwork = async (input) => {
  throw new Error(`Unexpected fetch in test: ${input}`);
};

const parse = (result) => {
  assert.equal(result.isError, undefined, result.content[0].text);
  return JSON.parse(result.content[0].text);
};

async function connectClient(t) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([createMcpServer().connect(serverTransport), client.connect(clientTransport)]);
  t.after(() => client.close());
  return client;
}

// --- server ---

test("the server lists the three tools", async (t) => {
  const client = await connectClient(t);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["analyze_job_posting", "check_email_domain", "verify_company"]);
  const analyze = tools.find((tool) => tool.name === "analyze_job_posting");
  assert.deepEqual(analyze.inputSchema.required.sort(), ["company", "email", "jobTitle", "location", "salary"]);
});

// --- analyze_job_posting ---

test("analyze_job_posting: returns the same result as the /api/analyze-job pipeline, as JSON", async () => {
  globalThis.fetch = fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: geminiReply });
  const result = parse(await analyzeJobPosting({ ...job, currency: "INR" }));

  const expected = await detectScam({ ...job, currency: "INR" });
  assert.deepEqual(result, JSON.parse(JSON.stringify(expected)));
  assert.equal(result.level, "LOW");
  assert.deepEqual(Object.keys(result.scores).sort(), Object.keys(safeScores).sort());
  assert.deepEqual(result.greenFlags, ["Official company email domain"]);
  assert.match(result.checks.summary[1], /^WHOIS creation date: 2010-01-01/);
});

test("analyze_job_posting via an MCP client: currency defaults to INR", async (t) => {
  const apis = recorded(fakeApis({ registered: "2010-01-01T00:00:00Z", results: INFOSYS_RESULTS, gemini: geminiReply }));
  globalThis.fetch = apis.fetch;
  const client = await connectClient(t);

  const result = parse(await client.callTool({ name: "analyze_job_posting", arguments: job }));
  assert.equal(result.level, "LOW");
  const prompt = apis.calls.find((c) => c.url.includes("generativelanguage.googleapis.com")).body;
  assert.match(prompt, /Offered Salary: ₹360000 INR/);
});

test("analyze_job_posting via an MCP client: a salary that is not a number is rejected before any API call", async (t) => {
  globalThis.fetch = noNetwork;
  const client = await connectClient(t);
  const result = await client.callTool({ name: "analyze_job_posting", arguments: { ...job, salary: "lots" } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /Input validation error/);
});

test("analyze_job_posting: Gemini out of quota on every model gives a tool error with a readable message", async () => {
  const quota = {
    error: {
      code: 429,
      message: "You exceeded your current quota.",
      status: "RESOURCE_EXHAUSTED",
      details: [{ "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] }],
    },
  };
  globalThis.fetch = geminiFails(429, quota);
  const result = await analyzeJobPosting(job);

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /^Gemini free-tier daily limit reached \(tried .+\)\. It resets at midnight Pacific time\./);
  assert.ok(!result.content[0].text.includes("RESOURCE_EXHAUSTED"));
  assert.match(errors.join("\n"), /analyze_job_posting failed: Gemini free-tier daily limit reached/);
});

test("analyze_job_posting: an API key in an error is redacted in the tool error and the log", async () => {
  const key = "AIza-test-gemini-key-1234";
  process.env.GEMINI_API_KEY = key;
  globalThis.fetch = geminiFails(400, { error: { code: 400, message: `API key not valid: ${key}` } });
  const result = await analyzeJobPosting(job);

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /API key not valid: \[redacted\]/);
  assert.ok(!result.content[0].text.includes(key) && !errors.join("\n").includes(key));
});

// --- check_email_domain ---

test("check_email_domain: an old company domain has its WHOIS date and no red flags, without search or Gemini", async () => {
  const apis = recorded(fakeApis({ registered: "2010-01-01T00:00:00Z", gemini: geminiReply }));
  globalThis.fetch = apis.fetch;
  const result = parse(await checkEmailDomain({ email: "careers@infosys.com" }));

  assert.equal(result.domain, "infosys.com");
  assert.equal(result.isFreeProvider, false);
  assert.equal(result.createdAt, "2010-01-01T00:00:00.000Z");
  assert.ok(result.ageDays > 365 * 15);
  assert.equal(result.error, null);
  assert.deepEqual(result.redFlags, []);
  assert.ok(apis.hosts().every((host) => host === "data.iana.org" || host === "rdap.test"), apis.hosts().join(", "));
});

test("check_email_domain: a domain registered under a year ago is a red flag", async () => {
  globalThis.fetch = fakeApis({ registered: new Date(Date.now() - 30 * DAY_MS).toISOString(), gemini: geminiReply });
  const result = parse(await checkEmailDomain({ email: "hr@newco.in" }));
  assert.equal(result.ageDays, 30);
  assert.deepEqual(result.redFlags, ["Email domain newco.in was registered only 30 days ago (under 1 year)"]);
});

test("check_email_domain: a free provider is flagged and not looked up", async () => {
  globalThis.fetch = noNetwork;
  const result = parse(await checkEmailDomain({ email: "infosys.hr@gmail.com" }));
  assert.equal(result.domain, "gmail.com");
  assert.equal(result.isFreeProvider, true);
  assert.equal(result.ageDays, null);
  assert.deepEqual(result.redFlags, ["Contact email uses a free email provider (gmail.com) instead of a company domain"]);
});

test("check_email_domain: a failed WHOIS lookup is reported in the result, not as a tool error", async () => {
  globalThis.fetch = fakeApis({ registered: null, gemini: geminiReply });
  const result = parse(await checkEmailDomain({ email: "hr@acme-hiring.com" }));
  assert.equal(result.ageDays, null);
  assert.match(result.error, /^WHOIS lookup failed: /);
  assert.deepEqual(result.redFlags, []);
});

test("check_email_domain: an invalid email address is a tool error", async () => {
  globalThis.fetch = noNetwork;
  const result = await checkEmailDomain({ email: "not-an-email" });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, 'Invalid email address: "not-an-email"');
});

// --- verify_company ---

test("verify_company: results matching the full name give 'found', without calling Gemini", async () => {
  const apis = recorded(fakeApis({ results: INFOSYS_RESULTS, gemini: geminiReply }));
  globalThis.fetch = apis.fetch;
  const result = parse(await verifyCompany({ company: "Infosys", location: "Chennai" }));

  assert.equal(result.verdict, "found");
  assert.equal(result.query, "Infosys Chennai company");
  assert.deepEqual(result.matchedResults.map((r) => r.url), INFOSYS_RESULTS.map((r) => r.url));
  assert.deepEqual(result.websites, ["www.infosys.com"]);
  assert.equal(result.totalResults, 2);
  assert.equal(result.evidence, '2 of 2 results have a title or domain matching the full name "Infosys"');
  assert.deepEqual(apis.hosts(), ["api.tavily.com"]);
});

test("verify_company: only partial name matches give 'not found'", async () => {
  const results = [{ title: "Zentrix | LinkedIn", url: "https://www.linkedin.com/company/zentrix", content: "" }];
  globalThis.fetch = fakeApis({ results, gemini: geminiReply });
  const result = parse(await verifyCompany({ company: "Zentrix Global Hiring Pvt Ltd", location: "Coimbatore" }));
  assert.equal(result.verdict, "not found");
  assert.deepEqual(result.matchedResults, []);
  assert.deepEqual(result.websites, []);
  assert.match(result.evidence, /^1 results, but none has a title or domain matching the full name/);
});

test("verify_company: no search results give 'not found'", async () => {
  globalThis.fetch = fakeApis({ results: [], gemini: geminiReply });
  const result = parse(await verifyCompany({ company: "Golden Earn Data Services", location: "Remote" }));
  assert.equal(result.verdict, "not found");
  assert.equal(result.evidence, 'no web results for "Golden Earn Data Services Remote company"');
});

test("verify_company: a search that can't run is a tool error saying why", async () => {
  globalThis.fetch = fakeApis({ results: null, gemini: geminiReply }); // Tavily answers 500
  let result = await verifyCompany({ company: "Infosys", location: "Chennai" });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Company web search unavailable: Web search failed: Tavily returned 500");

  delete process.env.TAVILY_API_KEY;
  result = await verifyCompany({ company: "Infosys", location: "Chennai" });
  assert.equal(result.isError, true);
  assert.equal(result.content[0].text, "Company web search unavailable: TAVILY_API_KEY is not set");
});
