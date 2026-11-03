import { WEB_PRESENCE_PATTERN } from "./config.js";

// Drops flags that claim anything about the company's online presence (website, LinkedIn, "found online"...).
// Used on Gemini's flags when the web search was unavailable or empty, so such claims can't be grounded.
export function removeWebPresenceClaims(flags = [], pattern = WEB_PRESENCE_PATTERN) {
  return flags.filter((flag) => !pattern.test(flag));
}
