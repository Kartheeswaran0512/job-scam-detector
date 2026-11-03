import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { searchCompany } from "../lib/searchCompany.js";
import { companyCheck, checkSignals } from "../lib/detectScam.js";

// Tavily is faked: these tests make no network calls.
const realFetch = globalThis.fetch;
const realKey = process.env.TAVILY_API_KEY;
const okDomain = { domain: "acme.com", isFreeProvider: false, ageDays: 5000 };

beforeEach((t) => {
  process.env.TAVILY_API_KEY = "tvly-test";
  t.mock.method(console, "warn", () => {});
});
afterEach(() => {
  globalThis.fetch = realFetch;
  if (realKey === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = realKey;
});

// --- searchCompany ---

test("searches '<company> <location> company' and returns title, url and a trimmed snippet", async () => {
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return Response.json({ results: [{ title: "Acme", url: "https://acme.com", content: `About   Acme\n${"x".repeat(500)}` }] });
  };
  const search = await searchCompany("Acme Corp", "Chennai");
  assert.equal(request.url, "https://api.tavily.com/search");
  assert.equal(request.init.headers.Authorization, "Bearer tvly-test");
  assert.equal(JSON.parse(request.init.body).query, "Acme Corp Chennai company");
  assert.equal(search.company, "Acme Corp");
  assert.equal(search.error, null);
  assert.equal(search.results[0].url, "https://acme.com");
  assert.equal(search.results[0].snippet.length, 300);
  assert.ok(search.results[0].snippet.startsWith("About Acme x"));
});

test("missing TAVILY_API_KEY: skipped without calling Tavily", async () => {
  delete process.env.TAVILY_API_KEY;
  globalThis.fetch = async () => assert.fail("must not call Tavily without a key");
  const search = await searchCompany("Acme", "Chennai");
  assert.equal(search.results, null);
  assert.match(search.error, /TAVILY_API_KEY is not set/);
});

test("Tavily error status or network failure: unavailable, never throws", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 500 });
  assert.equal((await searchCompany("Acme", "Chennai")).results, null);

  globalThis.fetch = async () => {
    throw new Error("ECONNRESET");
  };
  const search = await searchCompany("Acme", "Chennai");
  assert.equal(search.results, null);
  assert.match(search.error, /ECONNRESET/);
});

// --- companyCheck -> red flag ---

const flagsFor = (search, judgement) => checkSignals(okDomain, companyCheck(search, judgement)).redFlags;

test("search unavailable: 'Company web search unavailable', no web-presence flag", () => {
  const company = companyCheck({ query: "q", results: null, error: "TAVILY_API_KEY is not set" });
  assert.equal(company.verified, null);
  assert.deepEqual(flagsFor({ query: "q", results: null, error: "x" }), []);
});

test("search found nothing at all: flagged without asking Gemini", () => {
  assert.deepEqual(flagsFor({ query: "q", results: [], error: null }), ["Company could not be verified online"]);
});

test("results, but Gemini found none relevant: flagged", () => {
  const search = { query: "q", results: [{ title: "Other Co", url: "https://other.example", snippet: "" }], error: null };
  assert.deepEqual(flagsFor(search, { found: false, evidence: "None of the results are about this company." }), [
    "Company could not be verified online",
  ]);
});

test("results with a relevant full-name match: no flag", () => {
  const search = { company: "Acme Corp", query: "q", results: [{ title: "Acme", url: "https://acme.com", snippet: "" }], error: null };
  const judgement = { found: true, matchedResults: [1], evidence: "Result 1 is the official website." };
  const company = companyCheck(search, judgement);
  assert.equal(company.verified, true);
  assert.deepEqual(company.sources, ["https://acme.com"]);
  assert.deepEqual(flagsFor(search, judgement), []);
});

test("results that Gemini did not assess: unknown, no flag", () => {
  const search = { company: "Acme", query: "q", results: [{ title: "Acme", url: "https://acme.com", snippet: "" }], error: null };
  assert.equal(companyCheck(search, undefined).verified, null);
  assert.deepEqual(flagsFor(search, undefined), []);
});
