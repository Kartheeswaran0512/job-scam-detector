import { test } from "node:test";
import assert from "node:assert/strict";
import { baseDomain, checkEmailWebsite } from "../lib/emailWebsite.js";
import { companyCheck, checkSignals } from "../lib/detectScam.js";

const MISMATCH_FLAG = "Email domain does not match the company's website";
const result = (title, url) => ({ title, url, snippet: "" });
const domainInfo = (domain, extra = {}) => ({ domain, isFreeProvider: false, ageDays: 5000, ...extra });

// Search results for "Infosys": Wikipedia, LinkedIn and the official site.
const INFOSYS_SEARCH = {
  company: "Infosys",
  query: "Infosys Bengaluru company",
  results: [
    result("Infosys - Wikipedia", "https://en.wikipedia.org/wiki/Infosys"),
    result("Infosys | LinkedIn", "https://www.linkedin.com/company/infosys"),
    result("Infosys - Digital Studio | Bengaluru", "https://www.infosys.com/navigate-your-next/bengaluru.html"),
  ],
  error: null,
};
const INFOSYS_FOUND = companyCheck(INFOSYS_SEARCH, { found: true, matchedResults: [1, 2, 3], evidence: "Results 1-3." });

// --- baseDomain ---

test("baseDomain keeps the registrable part of a host", () => {
  assert.equal(baseDomain("www.infosys.com"), "infosys.com");
  assert.equal(baseDomain("careers.infosys.com"), "infosys.com");
  assert.equal(baseDomain("infosys.com"), "infosys.com");
  assert.equal(baseDomain("mail.acme.co.in"), "acme.co.in");
  assert.equal(baseDomain("acme.co.in"), "acme.co.in");
  assert.equal(baseDomain("www.example.co.uk"), "example.co.uk");
});

// --- identifying the company's own website ---

test("only the matched result on the company's own domain counts as its website", () => {
  assert.deepEqual(INFOSYS_FOUND.websites, ["www.infosys.com"]);
});

test("no website when the company is not found, or only LinkedIn/Wikipedia pages matched", () => {
  assert.deepEqual(companyCheck(INFOSYS_SEARCH, { found: false, matchedResults: [], evidence: "e" }).websites, []);
  assert.deepEqual(companyCheck(INFOSYS_SEARCH, { found: true, matchedResults: [1, 2], evidence: "e" }).websites, []);
});

// --- checkEmailWebsite ---

test("same domain, or a subdomain of the company's website: match", () => {
  assert.equal(checkEmailWebsite(domainInfo("infosys.com"), INFOSYS_FOUND).matches, true);
  assert.equal(checkEmailWebsite(domainInfo("in.infosys.com"), INFOSYS_FOUND).matches, true);
});

test("real company name, different email domain: mismatch, flagged and email score capped", () => {
  const domain = domainInfo("infosys-careers.com");
  const check = checkEmailWebsite(domain, INFOSYS_FOUND);
  assert.deepEqual(check, { matches: false, website: "www.infosys.com", skipped: null });

  const signals = checkSignals(domain, INFOSYS_FOUND, check);
  assert.deepEqual(signals.redFlags, [MISMATCH_FLAG]);
  assert.equal(signals.caps.emailDomain, 30);
});

test("a look-alike country domain also counts as different", () => {
  assert.equal(checkEmailWebsite(domainInfo("infosys.co.in"), INFOSYS_FOUND).matches, false);
});

test("skipped (no flag) when no official website was identified", () => {
  const linkedInOnly = companyCheck(INFOSYS_SEARCH, { found: true, matchedResults: [2], evidence: "e" });
  const domain = domainInfo("infosys-careers.com");
  const check = checkEmailWebsite(domain, linkedInOnly);
  assert.equal(check.matches, null);
  assert.match(check.skipped, /no official website/);
  assert.deepEqual(checkSignals(domain, linkedInOnly, check).redFlags, []);
});

test("skipped when the company search was unavailable", () => {
  const unavailable = companyCheck({ ...INFOSYS_SEARCH, results: null, error: "x" });
  assert.equal(checkEmailWebsite(domainInfo("infosys-careers.com"), unavailable).matches, null);
});

test("skipped for free email providers (covered by the free-email flag and the impersonation rule)", () => {
  const check = checkEmailWebsite({ domain: "gmail.com", isFreeProvider: true, ageDays: null }, INFOSYS_FOUND);
  assert.deepEqual(check, { matches: null, website: null, skipped: "free email provider" });
});
