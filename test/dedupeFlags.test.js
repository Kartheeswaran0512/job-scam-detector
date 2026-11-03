import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeFlags } from "../lib/dedupeFlags.js";

// Flag texts below are taken from real Gemini output for the sample inputs.
const CODE_FREE_EMAIL = "Contact email uses a free email provider (gmail.com) instead of a company domain";
const CODE_NEW_DOMAIN = "Email domain acme-hr.xyz was registered only 40 days ago (under 1 year)";
const CODE_UNVERIFIED = "Company could not be verified online";

test("keeps distinct, unrelated flags in their original order", () => {
  const flags = [
    "₹18,00,000 a year is far above market for a work-from-home data entry role",
    "High-paying work-from-home data entry is a common job-scam pattern",
    "Asks for a registration fee before the interview",
  ];
  assert.deepEqual(dedupeFlags(flags), flags);
});

test("drops exact repeats (ignoring case and spacing) and empty flags", () => {
  assert.deepEqual(dedupeFlags(["Asks for a fee", "  asks  for a FEE ", "", "   "]), ["Asks for a fee"]);
});

test("several gmail / free-email flags count as one, keeping the first (automated check) wording", () => {
  const flags = [
    CODE_FREE_EMAIL,
    "Recruitment is being conducted through a generic free Gmail account instead of the company's official domain.",
    "Major corporations like Zoho Corporation do not use free webmail services for official hiring and onboarding.",
    "The company uses a generic Gmail address instead of an official corporate domain.",
    "Recruiter address does not use Zoho's official zoho.com domain",
    "Major corporations like Zoho typically use official corporate email domains for hiring",
    "Uses a personal email address",
  ];
  assert.deepEqual(dedupeFlags(flags), [CODE_FREE_EMAIL]);
});

test("several 'company not found online' flags count as one", () => {
  const flags = [
    CODE_UNVERIFIED,
    "There is no verifiable web presence or official website for the stated company.",
    "Could not find the company in any search result",
    "Company name does not appear in official business or web search records as an established entity matching the listing",
  ];
  assert.deepEqual(dedupeFlags(flags), [CODE_UNVERIFIED]);
});

test("free email, new domain and unverified company are separate issues", () => {
  const flags = [CODE_UNVERIFIED, CODE_FREE_EMAIL, CODE_NEW_DOMAIN, "The domain was recently registered"];
  assert.deepEqual(dedupeFlags(flags), [CODE_UNVERIFIED, CODE_FREE_EMAIL, CODE_NEW_DOMAIN]);
});

test("an unrelated 'could not be verified' flag is not merged into the company topic", () => {
  const flags = [CODE_UNVERIFIED, "Salary could not be verified against market data"];
  assert.deepEqual(dedupeFlags(flags), flags);
});

test("accepts custom topics", () => {
  const topics = { salary: /salary/i };
  assert.deepEqual(dedupeFlags(["Salary too high", "Unrealistic salary"], topics), ["Salary too high"]);
});
