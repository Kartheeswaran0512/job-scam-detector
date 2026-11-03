import { SEARCH_CONFIG } from "./config.js";
import { redactSecrets } from "./redact.js";

// Both searches never throw:
//   results: [{ title, url, snippet }]  search ran ([] = nothing found)
//   results: null                       search unavailable (no key, Tavily error); `error` says why

// Searches the web (Tavily) for the company.
export async function searchCompany(company, location) {
  const query = `${company} ${location} company`;
  return { company, query, ...(await tavilySearch(query, "Company search")) };
}

// Searches the web for the contact email's domain itself (e.g. "nexoratech.in"), to see whose site it is.
// include_domains limits results to pages on that domain (and its subdomains): a bare-domain query
// otherwise returns pages *about* the domain (Wikipedia, LinkedIn...), even for infosys.com.
export async function searchEmailDomain(domain) {
  return { domain, query: domain, ...(await tavilySearch(domain, "Email domain search", { include_domains: [domain] })) };
}

async function tavilySearch(query, label, options = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return { results: null, error: "TAVILY_API_KEY is not set" };

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, max_results: SEARCH_CONFIG.maxResults, search_depth: "basic", ...options }),
      signal: AbortSignal.timeout(SEARCH_CONFIG.timeoutMs),
    });
    if (!res.ok) throw new Error(`Tavily returned ${res.status}`);
    const { results = [] } = await res.json();
    return {
      results: results.map(({ title, url, content }) => ({
        title,
        url,
        snippet: String(content ?? "").replace(/\s+/g, " ").trim().slice(0, SEARCH_CONFIG.snippetChars),
      })),
      error: null,
    };
  } catch (err) {
    const message = redactSecrets(err.message);
    console.warn(`${label} failed:`, message);
    return { results: null, error: `Web search failed: ${message}` };
  }
}
