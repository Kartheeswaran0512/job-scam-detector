import { HQ_LOCATION_FLAG } from "./config.js";

// Drops red flags whose only point is that the company's headquarters is somewhere other than the job
// (normal for branch offices and remote roles). Flags that merely mention the headquarters, or that also
// raise another real problem (fees, gmail, Telegram...), are kept.
export function removeHqLocationFlags(flags = [], patterns = HQ_LOCATION_FLAG) {
  return flags.filter((flag) => !isOnlyHqLocation(flag, patterns));
}

function isOnlyHqLocation(flag, { headquarters, differentLocation, otherProblem }) {
  return headquarters.test(flag) && differentLocation.some((pattern) => pattern.test(flag)) && !otherProblem.test(flag);
}
