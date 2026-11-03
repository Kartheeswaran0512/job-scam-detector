import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSignals } from "../lib/detectScam.js";
import { computeRisk } from "../lib/computeRisk.js";

const gmail = { domain: "gmail.com", isFreeProvider: true, ageDays: null };
const yahoo = { domain: "yahoo.com", isFreeProvider: true, ageDays: null };
const corporate = { domain: "zoho.com", isFreeProvider: false, ageDays: 9000 };
const found = { verified: true, websites: [] };
const scores = (value) => ({ companyLegitimacy: value, emailDomain: value, salaryRealism: value, offerQuality: value, scamPatterns: value });

// --- checkSignals: when the HIGH floor applies ---

test("company found + free email provider: minimum verdict HIGH (likely impersonation)", () => {
  for (const domain of [gmail, yahoo]) {
    const { minLevel } = checkSignals(domain, found);
    assert.equal(minLevel.level, "HIGH");
    assert.match(minLevel.reason, new RegExp(`${domain.domain} address for a company that exists online \\(likely impersonation\\)`));
  }
});

test("no floor when the company was not found, the search was unavailable, or the email is corporate", () => {
  assert.equal(checkSignals(gmail, { verified: false }).minLevel, null);
  assert.equal(checkSignals(gmail, { verified: null }).minLevel, null);
  assert.equal(checkSignals(corporate, found).minLevel, null);
});

// --- computeRisk: applying the floor ---

const run = (scoreValue, aiFlags = []) => computeRisk({ scores: scores(scoreValue), redFlags: aiFlags }, checkSignals(gmail, found));

test("a LOW score is raised to HIGH, with the reason in the note; the score itself is unchanged", () => {
  const r = run(95); // emailDomain capped at 30 by the free-email check -> risk 18, LOW by score
  assert.equal(r.riskScore, 18);
  assert.equal(r.level, "HIGH");
  assert.equal(r.verdictNote, "Raised from LOW to HIGH: gmail.com address for a company that exists online (likely impersonation)");
});

test("a MEDIUM score is raised to HIGH too", () => {
  const r = run(55);
  assert.equal(r.level, "HIGH");
  assert.match(r.verdictNote, /^Raised from MEDIUM to HIGH/);
});

test("HIGH by score stays HIGH with no note", () => {
  const r = run(10);
  assert.equal(r.level, "HIGH");
  assert.equal(r.verdictNote, null);
});

test("when the 2-red-flag rule also applies, the higher floor (HIGH) wins", () => {
  const r = run(95, ["Asks for a registration fee"]);
  assert.equal(r.redFlags.length, 2);
  assert.equal(r.level, "HIGH");
  assert.match(r.verdictNote, /likely impersonation/);
});
