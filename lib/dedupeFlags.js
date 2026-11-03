import { FLAG_TOPICS } from "./config.js";

// Collapses red flags that report the same issue, so each issue counts once toward the verdict rule:
// exact repeats (ignoring case and spacing), and flags on the same topic (e.g. several "uses gmail" flags).
// The first flag of each topic is kept, so put the automated-check flags (canonical wording) first.
export function dedupeFlags(flags, topics = FLAG_TOPICS) {
  const seen = new Set();
  return flags
    .map((flag) => String(flag).trim())
    .filter((flag) => {
      if (!flag) return false;
      const topic = Object.keys(topics).find((name) => topics[name].test(flag));
      const key = topic ? `topic:${topic}` : flag.toLowerCase().replace(/\s+/g, " ");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
