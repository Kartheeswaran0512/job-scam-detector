import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRisk } from "../lib/computeRisk.js";

const scores = (value) => ({
  companyLegitimacy: value,
  emailDomain: value,
  salaryRealism: value,
  offerQuality: value,
  scamPatterns: value,
});
const noSignals = { redFlags: [], caps: {} };
const FREE_EMAIL = "Contact email uses a free email provider (gmail.com) instead of a company domain";

// --- Verdict rule: 2+ distinct red flags means at least MEDIUM ---

test("LOW score with 2 distinct red flags is raised to MEDIUM; the score itself is unchanged", () => {
  const r = computeRisk({ scores: scores(90), redFlags: ["Asks for a fee", "Interview only over Telegram"] }, noSignals);
  assert.equal(r.riskScore, 10);
  assert.equal(r.level, "MEDIUM");
  assert.equal(r.verdictNote, "Raised from LOW to MEDIUM: 2 red flags found");
});

test("several free-email flags count as one, so the verdict stays LOW", () => {
  const r = computeRisk(
    { scores: scores(90), redFlags: ["Uses a generic Gmail address", "Major companies do not use free webmail for hiring"] },
    { redFlags: [FREE_EMAIL], caps: {} }
  );
  assert.deepEqual(r.redFlags, [FREE_EMAIL]);
  assert.equal(r.level, "LOW");
  assert.equal(r.verdictNote, null);
});

test("free-email flags (counted once) plus one other issue reach the threshold", () => {
  const r = computeRisk(
    { scores: scores(90), redFlags: ["Uses a generic Gmail address", "Asks for a registration fee"] },
    { redFlags: [FREE_EMAIL], caps: {} }
  );
  assert.deepEqual(r.redFlags, [FREE_EMAIL, "Asks for a registration fee"]);
  assert.equal(r.level, "MEDIUM");
});

test("automated-check flags count toward the rule", () => {
  const r = computeRisk(
    { scores: scores(90), redFlags: ["Asks for a fee"] },
    { redFlags: ["Company could not be verified online"], caps: {} }
  );
  assert.equal(r.level, "MEDIUM");
});

test("a single red flag leaves a LOW verdict alone", () => {
  assert.equal(computeRisk({ scores: scores(90), redFlags: ["Asks for a fee"] }, noSignals).level, "LOW");
});

test("the rule never lowers a verdict or raises MEDIUM to HIGH", () => {
  const flags = ["a", "b", "c"];
  assert.equal(computeRisk({ scores: scores(10), redFlags: flags }, noSignals).level, "HIGH");
  assert.equal(computeRisk({ scores: scores(50), redFlags: flags }, noSignals).level, "MEDIUM");
});

// --- Risk score ---

test("risk score is 100 minus the weighted average of the dimension scores", () => {
  // safety = .25*80 + .2*20 + .15*70 + .1*60 + .3*50 = 55.5 -> risk 44.5 -> 45
  const r = computeRisk(
    { scores: { companyLegitimacy: 80, emailDomain: 20, salaryRealism: 70, offerQuality: 60, scamPatterns: 50 }, redFlags: [] },
    noSignals
  );
  assert.equal(r.riskScore, 45);
  assert.equal(r.level, "MEDIUM");
});

test("thresholds: risk 60 -> HIGH, 30 -> MEDIUM, 29 -> LOW", () => {
  assert.equal(computeRisk({ scores: scores(40), redFlags: [] }, noSignals).level, "HIGH");
  assert.equal(computeRisk({ scores: scores(70), redFlags: [] }, noSignals).level, "MEDIUM");
  assert.equal(computeRisk({ scores: scores(71), redFlags: [] }, noSignals).level, "LOW");
});

test("scores are clamped to 0-100 and capped by failed checks", () => {
  const r = computeRisk(
    { scores: { ...scores(95), emailDomain: 150, offerQuality: -5 }, redFlags: [] },
    { redFlags: [], caps: { emailDomain: 30 } }
  );
  assert.equal(r.scores.emailDomain, 30);
  assert.equal(r.scores.offerQuality, 0);
});

test("a missing dimension score throws instead of guessing", () => {
  assert.throws(() => computeRisk({ scores: { companyLegitimacy: 50 }, redFlags: [] }, noSignals), /no scamPatterns score/);
});
