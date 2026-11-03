// Legal words dropped from the end of a company name before matching ("Zoho Corporation" -> "zoho").
const LEGAL_WORDS = new Set([
  "pvt", "private", "ltd", "limited", "llp", "llc", "inc", "incorporated",
  "corp", "corporation", "co", "company", "plc", "gmbh", "pte",
]);
// A company's own domain may add one of these to its name (zoho.com, zohocorp.com).
const DOMAIN_ENDINGS = ["", "corp", "inc", "ltd", "llc", "co", "group", "hq"];

const words = (text) => String(text ?? "").toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter(Boolean);

// True only if the result's title or domain matches the FULL company name, not just part of it:
// "Zentrix Global Hiring Pvt Ltd" matches "Zentrix Global Hiring | LinkedIn" or zentrixglobalhiring.com,
// but not "ZentrixGlobal" or zentrix.com.
export function matchesCompanyName(company, result) {
  const name = coreName(company).join("");
  if (!name) return false;
  return titleMatches(result.title, name) || domainMatches(result.url, name);
}

// True if the result is the company's own website: its domain is the full company name
// (infosys.com for "Infosys"), not a page about the company on LinkedIn, Wikipedia, etc.
export function isCompanyWebsite(company, result) {
  const name = coreName(company).join("");
  return Boolean(name) && domainMatches(result.url, name);
}

// True if the text (e.g. a search result's content) contains the FULL company name, with the same
// strict matching as titles: "Nexora Tech Solutions" is named in "Nexora Tech Solutions builds apps", not in "Nexora".
export function namesCompany(company, text) {
  const name = coreName(company).join("");
  return Boolean(name) && titleMatches(text, name);
}

function coreName(company) {
  const name = words(company);
  while (name.length > 0 && LEGAL_WORDS.has(name.at(-1))) name.pop();
  if (name[0] === "the") name.shift();
  return name;
}

// Some run of consecutive title words, joined, equals the name ("TalentBridge" or "Talent Bridge").
function titleMatches(title, name) {
  const titleWords = words(title);
  for (let i = 0; i < titleWords.length; i++) {
    let joined = "";
    for (let j = i; j < titleWords.length && joined.length < name.length; j++) {
      joined += titleWords[j];
      if (joined === name) return true;
    }
  }
  return false;
}

// One of the host's labels (TLD excluded) is the name, optionally plus a common ending.
function domainMatches(url, name) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  const labels = host.split(".").slice(0, -1).map((label) => label.replace(/-/g, ""));
  return labels.some((label) => DOMAIN_ENDINGS.some((ending) => label === name + ending));
}
