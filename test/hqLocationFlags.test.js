import { test } from "node:test";
import assert from "node:assert/strict";
import { removeHqLocationFlags } from "../lib/hqLocationFlags.js";

// Real Gemini output that the first version of the filter missed.
const MUMBAI_MADURAI =
  "The official LinkedIn and registered company information indicate the headquarters is in Mumbai, whereas the job location is in Madurai without explicit details about a local branch office.";

test("removes the Mumbai/Madurai flag ('whereas', 'without details about a local branch office')", () => {
  assert.deepEqual(removeHqLocationFlags([MUMBAI_MADURAI]), []);
});

test("removes headquarters-vs-job-location flags worded with 'whereas', 'while', or a missing local office", () => {
  const flags = [
    "Headquartered in Mumbai, whereas the job is in Madurai",
    "The company's registered office is in Delhi while the job is in Coimbatore",
    "Company is headquartered in Pune while hiring in Madurai",
    "HQ is in Pune and there is no branch office in Madurai",
    "Head office is in Bengaluru, without details about a local office in Madurai",
    "Company headquarters are in Hyderabad; no local office is mentioned for Madurai",
  ];
  assert.deepEqual(removeHqLocationFlags(flags), []);
});

test("keeps a flag about where the recruiter is based (not the company's headquarters)", () => {
  const flags = ["Recruiter is based in Dubai while the job is in Madurai"];
  assert.deepEqual(removeHqLocationFlags(flags), flags);
});

test("keeps flags that combine the headquarters location with another real problem", () => {
  const flags = [
    "Headquarters is in Mumbai whereas the job is in Madurai, and the recruiter asks for a security deposit",
    "Company is headquartered in Mumbai while the job is in Madurai, and the offer came from a Gmail address",
    "HQ is in Mumbai, whereas the job in Madurai offers an unrealistic salary",
    "Registered office is in Delhi but the job in Madurai requires paying for training",
  ];
  assert.deepEqual(removeHqLocationFlags(flags), flags);
});

test("removes flags whose point is that the headquarters is elsewhere than the job", () => {
  const flags = [
    "Company is headquartered in Bengaluru but the job is located in Chennai",
    "Job location (Chennai) differs from the company's headquarters in Bengaluru",
    "Location mismatch: the company is based in Bengaluru",
    "The company's head office is in another city",
    "HQ location does not match the job location",
    "Registered office is outside India while the role is in Chennai",
  ];
  assert.deepEqual(removeHqLocationFlags(flags), []);
});

test("keeps flags that only mention the headquarters, or are about something else", () => {
  const flags = [
    "Company is headquartered in Chennai but uses a free Gmail address",
    "Headquarters address could not be found",
    "Salary is unrealistic for the job location",
    "Job location is vague ('Remote / Anywhere')",
    "Asks for a registration fee before the interview",
  ];
  assert.deepEqual(removeHqLocationFlags(flags), flags);
});

test("handles missing flags", () => {
  assert.deepEqual(removeHqLocationFlags(undefined), []);
});
