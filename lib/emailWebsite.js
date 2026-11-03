// Compares the contact email's domain with the company's own website found in the search results.
//   matches: true / false     compared against `website`
//   matches: null             skipped, `skipped` says why
export function checkEmailWebsite(domain, company) {
  const websites = company.websites ?? [];
  if (!domain.domain) return { matches: null, website: null, skipped: "email address could not be parsed" };
  if (domain.isFreeProvider) return { matches: null, website: null, skipped: "free email provider" };
  if (websites.length === 0) {
    return { matches: null, website: null, skipped: "no official website identified in the search results" };
  }
  const same = websites.find((site) => baseDomain(site) === baseDomain(domain.domain));
  return { matches: Boolean(same), website: same ?? websites[0], skipped: null };
}

// The registrable part of a host: careers.infosys.com -> infosys.com, mail.acme.co.in -> acme.co.in.
export function baseDomain(host) {
  const labels = String(host).toLowerCase().replace(/^www\./, "").split(".");
  const secondLevel = labels.length > 2 && labels.at(-1).length === 2 && /^(co|com|net|org|gov|ac|edu)$/.test(labels.at(-2));
  return labels.slice(secondLevel ? -3 : -2).join(".");
}
