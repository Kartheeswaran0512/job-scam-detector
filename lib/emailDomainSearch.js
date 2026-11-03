import { matchesCompanyName, namesCompany } from "./companyMatch.js";

// Judges the web search for the contact email's domain: does that domain belong to the company?
//   confirmed: true    a result on the domain names the company (title, domain or content)
//   confirmed: false   no result on the domain, or none of them names the company -> red flag
//   confirmed: null    search unavailable -> no flag
export function checkEmailDomainSearch(domain, company, search) {
  if (!search.results) return { domain, confirmed: null, detail: null, error: search.error };

  const onDomain = search.results.filter((result) => isOnDomain(result.url, domain));
  if (onDomain.length === 0) return { domain, confirmed: false, detail: "not found in results", error: null };

  const match = onDomain.find((result) => matchesCompanyName(company, result) || namesCompany(company, result.snippet));
  if (match) return { domain, confirmed: true, detail: `confirmed ("${match.title}")`, error: null };
  const detail = `found, but no result there names ${company} ("${onDomain[0].title}")`;
  return { domain, confirmed: false, detail, error: null };
}

// The URL's host is the domain or one of its subdomains (careers.infosys.com is on infosys.com).
function isOnDomain(url, domain) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === domain || host.endsWith(`.${domain}`);
}
