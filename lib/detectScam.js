import { checkDomain } from "./checkDomain.js";
import { searchCompany, searchEmailDomain } from "./searchCompany.js";
import { analyzeJob } from "./gemini.js";
import { computeRisk } from "./computeRisk.js";
import { matchesCompanyName, isCompanyWebsite } from "./companyMatch.js";
import { removeWebPresenceClaims } from "./webPresenceClaims.js";
import { removeHqLocationFlags } from "./hqLocationFlags.js";
import { checkEmailWebsite, baseDomain } from "./emailWebsite.js";
import { checkEmailDomainSearch } from "./emailDomainSearch.js";
import { DOMAIN_CONFIG, RISK_CONFIG } from "./config.js";

// Full pipeline: domain check + web search -> Gemini scores (given both as context) -> verdict computed in code.
export async function detectScam(job) {
  const [domain, search] = await Promise.all([
    checkDomain(job.email),
    searchCompany(job.company, job.location),
  ]);
  const raw = await analyzeJob(job, describeDomain(domain), search);
  const analysis = groundWebPresence({ ...raw, redFlags: removeHqLocationFlags(raw.redFlags) }, search);
  const company = companyCheck(search, analysis.companySearch);
  const emailWebsite = checkEmailWebsite(domain, company);
  const emailDomainSearch = await emailDomainCheck(domain, company, job.company);
  const summary = [
    ...describeDomain(domain),
    describeCompany(company),
    ...describeEmailWebsite(domain, company, emailWebsite),
    ...describeEmailDomainSearch(emailDomainSearch),
  ];

  return {
    ...computeRisk(analysis, checkSignals(domain, company, emailWebsite, emailDomainSearch)),
    greenFlags: analysis.greenFlags,
    reasoning: analysis.reasoning,
    recommendation: analysis.recommendation,
    model: analysis.model,
    checks: { domain, company, emailWebsite, emailDomainSearch, summary },
  };
}

// Second web search, only for a custom email domain of a company that was found online:
// is that domain really the company's? Returns null when the check does not apply.
async function emailDomainCheck(domain, company, companyName) {
  if (!domain.domain || domain.isFreeProvider || company.verified !== true) return null;
  const site = baseDomain(domain.domain);
  return checkEmailDomainSearch(site, companyName, await searchEmailDomain(site));
}

// Plain-text verdict in the original format (CONFIDENCE replaced by RISK SCORE),
// kept so older clients that display or parse `verdict` keep working.
export function formatVerdict(result) {
  const list = (items) => (items.length ? items.map((item) => `- ${item}`).join("\n") : "- None");
  return [
    `RISK LEVEL: ${result.level}`,
    `RISK SCORE: ${result.riskScore}/100`,
    ...(result.verdictNote ? [`VERDICT NOTE: ${result.verdictNote}`] : []),
    "",
    "RED FLAGS:",
    list(result.redFlags),
    "",
    "GREEN FLAGS:",
    list(result.greenFlags),
    "",
    "REASONING:",
    result.reasoning,
    "",
    "RECOMMENDATION:",
    result.recommendation,
  ].join("\n");
}

// With no search results, Gemini had nothing to base web-presence claims on: drop any its flags make anyway.
export function groundWebPresence(analysis, search) {
  if (search.results?.length > 0) return analysis;
  return {
    ...analysis,
    redFlags: removeWebPresenceClaims(analysis.redFlags),
    greenFlags: removeWebPresenceClaims(analysis.greenFlags),
  };
}

// Company web presence from the search: unknown if the search couldn't run (no flag), not verified if it
// found nothing at all. Otherwise found only if Gemini says so AND one of the results it matched has a
// title or domain matching the full company name; a partial match counts as not verified.
// When found, `websites` lists the company's own sites among the matched results (for the email check).
export function companyCheck(search, judgement) {
  const sources = (search.results ?? []).map((r) => r.url);
  const unverified = (verified, evidence, error = null) => ({ verified, evidence, sources, websites: [], error });
  if (!search.results) return unverified(null, null, search.error);
  if (search.results.length === 0) return unverified(false, `no web results for "${search.query}"`);
  if (typeof judgement?.found !== "boolean") return unverified(null, null, "Search results were not assessed");
  if (!judgement.found) return unverified(false, judgement.evidence);

  const matched = (judgement.matchedResults ?? []).map((n) => search.results[n - 1]).filter(Boolean);
  if (matched.some((result) => matchesCompanyName(search.company, result))) {
    const websites = matched.filter((result) => isCompanyWebsite(search.company, result)).map((r) => new URL(r.url).hostname);
    return { verified: true, evidence: judgement.evidence, sources, websites: [...new Set(websites)], error: null };
  }
  const closest = matched[0]?.title ?? search.results[0].title;
  return unverified(false, `only partial name matches (closest: "${closest}"), no result's title or domain matches "${search.company}"`);
}

// Failed checks become red flags (most also cap the related dimension so the score can't contradict them).
// These flags then go through dedupeFlags and count toward the 2-red-flag rule in computeRisk.
// `minLevel` is a verdict floor for patterns that are risky whatever the scores say.
export function checkSignals(domain, company, emailWebsite = { matches: null }, emailDomainSearch = null) {
  const redFlags = [];
  const caps = {};
  let minLevel = null;
  if (company.verified === false) {
    redFlags.push("Company could not be verified online");
    caps.companyLegitimacy = RISK_CONFIG.checkCaps.companyLegitimacy;
  }
  if (domain.isFreeProvider) {
    redFlags.push(`Contact email uses a free email provider (${domain.domain}) instead of a company domain`);
    caps.emailDomain = RISK_CONFIG.checkCaps.emailDomain;
  }
  if (emailWebsite.matches === false) {
    redFlags.push("Email domain does not match the company's website");
    caps.emailDomain = RISK_CONFIG.checkCaps.emailDomain;
  }
  if (emailDomainSearch?.confirmed === false) {
    const { minLevel: level, maxEmailScore } = RISK_CONFIG.unconfirmedEmailDomain;
    redFlags.push("Could not confirm the email domain belongs to the company");
    caps.emailDomain = Math.min(caps.emailDomain ?? 100, maxEmailScore); // keeps a stricter cap already set
    // Never clashes with the impersonation floor below: that one needs a free provider, this a custom domain.
    minLevel = { level, reason: "email domain could not be confirmed as the company's" };
  }
  if (domain.ageDays !== null && domain.ageDays < DOMAIN_CONFIG.minAgeDays) {
    redFlags.push(`Email domain ${domain.domain} was registered only ${domain.ageDays} days ago (under 1 year)`);
    caps.emailDomain = RISK_CONFIG.checkCaps.emailDomain;
  }
  if (company.verified === true && domain.isFreeProvider) {
    const reason = `${domain.domain} address for a company that exists online (likely impersonation)`;
    minLevel = { level: RISK_CONFIG.impersonationMinLevel, reason };
  }
  return { redFlags, caps, minLevel };
}

// Lines shown under "Automated checks" (the domain lines are also given to Gemini as facts).
function describeDomain(domain) {
  if (!domain.domain) return ["Email address could not be parsed", "WHOIS creation date: unavailable"];
  return [
    `Email domain: ${domain.domain}${domain.isFreeProvider ? " (free email provider)" : ""}`,
    `WHOIS creation date: ${whoisDate(domain)}`,
  ];
}

function whoisDate(domain) {
  if (domain.createdAt) return `${domain.createdAt.slice(0, 10)} (${formatAge(domain.ageDays)})`;
  if (domain.isFreeProvider) return "unavailable (not looked up for free email providers)";
  return "unavailable";
}

function formatAge(days) {
  if (days < 365) return `${days} days old`;
  const years = Math.floor(days / 365.25);
  return `${years} year${years === 1 ? "" : "s"} old`;
}

function describeCompany(company) {
  if (company.verified === true) return `Company found online: ${company.evidence}`;
  if (company.verified === false) return `Company could not be verified online: ${company.evidence}`;
  return "Company web search unavailable";
}

// Only relevant once the company was found online.
function describeEmailWebsite(domain, company, check) {
  if (company.verified !== true) return [];
  if (check.matches === true) return [`Email domain matches the company's website (${check.website})`];
  if (check.matches === false) {
    return [`Email domain ${domain.domain} does not match the company's website (${check.website})`];
  }
  return [`Email vs company website: not checked (${check.skipped})`];
}

// Only shown when the email-domain search applied (custom domain, company found online).
function describeEmailDomainSearch(check) {
  if (!check) return [];
  if (check.confirmed === null) return ["Email domain search unavailable"];
  return [`Email domain search: ${check.domain} ${check.detail}`];
}
