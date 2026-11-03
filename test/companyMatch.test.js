import { test } from "node:test";
import assert from "node:assert/strict";
import { matchesCompanyName } from "../lib/companyMatch.js";
import { companyCheck, checkSignals } from "../lib/detectScam.js";

const result = (title, url) => ({ title, url, snippet: "" });

// --- matchesCompanyName: full-name matches ---

test("title contains the full name (legal suffixes ignored)", () => {
  assert.ok(matchesCompanyName("Infosys", result("Infosys - Wikipedia", "https://en.wikipedia.org/wiki/Infosys")));
  assert.ok(matchesCompanyName("Infosys Ltd", result("Infosys Limited | LinkedIn", "https://www.linkedin.com/company/infosys")));
  assert.ok(
    matchesCompanyName(
      "Tata Consultancy Services Limited",
      result("Tata Consultancy Services (TCS) | LinkedIn", "https://in.linkedin.com/company/tcs")
    )
  );
  assert.ok(
    matchesCompanyName("Zentrix Global Hiring Pvt Ltd", result("Zentrix Global Hiring | Careers", "https://jobs.example.com"))
  );
});

test("title spells the name without spaces", () => {
  assert.ok(matchesCompanyName("Talent Bridge", result("TalentBridge | LinkedIn", "https://www.linkedin.com/company/talentbridge")));
});

test("the result's own domain is the name, optionally with a common ending", () => {
  assert.ok(matchesCompanyName("Zoho Corporation", result("Careers", "https://www.zoho.com/careers")));
  assert.ok(matchesCompanyName("Zoho Corporation", result("Home", "https://www.zohocorp.com")));
  assert.ok(matchesCompanyName("Infosys", result("Jobs", "https://careers.infosys.com/jobs")));
  assert.ok(matchesCompanyName("Zentrix Global Hiring Pvt Ltd", result("Home", "https://zentrix-global-hiring.com")));
});

// --- matchesCompanyName: lookalike names (partial matches) ---

test("lookalike: 'ZentrixGlobal' does not match 'Zentrix Global Hiring Pvt Ltd'", () => {
  const company = "Zentrix Global Hiring Pvt Ltd";
  assert.equal(matchesCompanyName(company, result("ZentrixGlobal", "https://www.linkedin.com/company/zentrixglobal")), false);
  assert.equal(matchesCompanyName(company, result("Zentrix", "https://zentrix.com")), false);
  assert.equal(matchesCompanyName(company, result("Zentrix Global", "https://zentrixglobal.com")), false);
});

test("lookalike: a shared word is not enough", () => {
  assert.equal(
    matchesCompanyName("Qorvexa Talent Bridge Pvt Ltd", result("TalentBridge", "https://talentbridge.com")),
    false
  );
  assert.equal(
    matchesCompanyName("Zentrix Global", result("Careers at Netrix Global", "https://www.netrixglobal.com/careers")),
    false
  );
});

test("lookalike: a longer word that starts with the name is not a match", () => {
  assert.equal(matchesCompanyName("Infosys", result("Infosystems Solutions", "https://infosystems.example")), false);
  assert.equal(matchesCompanyName("Infosys", result("Home", "https://infosysjobs.example")), false);
});

test("a LinkedIn or Wikipedia URL alone does not count; only the page's own title does", () => {
  assert.equal(matchesCompanyName("Acme Hiring", result("Profile", "https://www.linkedin.com/company/acmehiring")), false);
});

test("a name made only of legal words never matches", () => {
  assert.equal(matchesCompanyName("Pvt Ltd", result("Pvt Ltd", "https://pvtltd.com")), false);
});

// --- companyCheck: Gemini's "found" must pass the full-name check ---

const ZENTRIX_SEARCH = {
  company: "Zentrix Global Hiring Pvt Ltd",
  query: "Zentrix Global Hiring Pvt Ltd Chennai, Tamil Nadu company",
  results: [
    result("ZentrixGlobal", "https://www.linkedin.com/company/zentrixglobal"),
    result("Staffing & Professional Solutions in India", "https://insightglobal.com/locations/india"),
  ],
  error: null,
};
const okDomain = { domain: "x.com", isFreeProvider: false, ageDays: 5000 };

test("lookalike case: Gemini says found on 'ZentrixGlobal', code treats it as not verified and flags it", () => {
  const company = companyCheck(ZENTRIX_SEARCH, {
    found: true,
    matchedResults: [1],
    evidence: "Result 1 shows a LinkedIn company page for ZentrixGlobal.",
  });
  assert.equal(company.verified, false);
  assert.match(company.evidence, /only partial name matches \(closest: "ZentrixGlobal"\)/);
  assert.deepEqual(checkSignals(okDomain, company).redFlags, ["Company could not be verified online"]);
});

test("found only when a result Gemini matched has the full name", () => {
  const search = { ...ZENTRIX_SEARCH, results: [...ZENTRIX_SEARCH.results, result("Zentrix Global Hiring | LinkedIn", "https://www.linkedin.com/company/zgh")] };
  assert.equal(companyCheck(search, { found: true, matchedResults: [1, 3], evidence: "e" }).verified, true);
  // The full-name result exists, but Gemini did not match it: still not verified.
  assert.equal(companyCheck(search, { found: true, matchedResults: [1], evidence: "e" }).verified, false);
});

test("Gemini says found but lists no (valid) result numbers: not verified", () => {
  assert.equal(companyCheck(ZENTRIX_SEARCH, { found: true, matchedResults: [], evidence: "e" }).verified, false);
  assert.equal(companyCheck(ZENTRIX_SEARCH, { found: true, matchedResults: [9], evidence: "e" }).verified, false);
});
