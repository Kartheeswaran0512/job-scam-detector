import { RISK_CONFIG } from "./config.js";
import { dedupeFlags } from "./dedupeFlags.js";

const LEVELS = ["LOW", "MEDIUM", "HIGH"];

// Turns Gemini's dimension scores into the final verdict. Pure function: all rules live here in code.
//   analysis: { scores: {dimension: 0-100}, redFlags: [] } from Gemini (higher score = safer)
//   signals:  { redFlags: [], caps: {dimension: max}, minLevel?: { level, reason } } from the automated checks
export function computeRisk(analysis, signals = { redFlags: [], caps: {} }, config = RISK_CONFIG) {
  const scores = clampScores(analysis.scores, signals.caps, Object.keys(config.weights));
  const riskScore = Math.round(100 - weightedAverage(scores, config.weights));
  // Automated-check flags go first so their wording is kept when Gemini restates the same issue.
  const redFlags = dedupeFlags([...signals.redFlags, ...(analysis.redFlags ?? [])]);
  const scoreLevel = levelForScore(riskScore, config.thresholds);

  // Floors: the verdict is raised (never lowered) to the highest one that applies. On a tie the
  // check-specific floor wins (it comes first), so its more specific reason is the note shown.
  const floors = [];
  if (signals.minLevel) floors.push(signals.minLevel); // e.g. likely impersonation -> HIGH
  if (redFlags.length >= config.minRedFlagsForMedium) {
    floors.push({ level: "MEDIUM", reason: `${redFlags.length} red flags found` }); // enough distinct red flags
  }
  const floor = floors.reduce((top, f) => (LEVELS.indexOf(f.level) > LEVELS.indexOf(top?.level) ? f : top), null);
  const raised = floor && LEVELS.indexOf(floor.level) > LEVELS.indexOf(scoreLevel);

  return {
    level: raised ? floor.level : scoreLevel,
    riskScore,
    verdictNote: raised ? `Raised from ${scoreLevel} to ${floor.level}: ${floor.reason}` : null,
    scores,
    redFlags,
  };
}

export function levelForScore(riskScore, { high, medium }) {
  if (riskScore >= high) return "HIGH";
  if (riskScore >= medium) return "MEDIUM";
  return "LOW";
}

function clampScores(raw = {}, caps = {}, dimensions) {
  return Object.fromEntries(
    dimensions.map((dim) => {
      const value = Number(raw[dim]);
      if (!Number.isFinite(value)) throw new Error(`Gemini returned no ${dim} score`);
      return [dim, Math.round(Math.min(Math.max(value, 0), 100, caps[dim] ?? 100))];
    })
  );
}

function weightedAverage(scores, weights) {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const weighted = Object.entries(weights).reduce((sum, [dim, w]) => sum + scores[dim] * w, 0);
  return weighted / totalWeight;
}
