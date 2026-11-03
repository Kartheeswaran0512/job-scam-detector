import net from "node:net";
import { DOMAIN_CONFIG } from "./config.js";

const FREE_PROVIDERS = new Set(DOMAIN_CONFIG.freeProviders);
const DOMAIN_RE = /^(?:[a-z0-9-]+\.)+[a-z0-9-]{2,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

let rdapServers; // Promise<Map<tld, rdapBaseUrl>> from IANA, cached for the life of the process
const whoisServers = new Map(); // tld -> port-43 WHOIS host

// Checks the contact email's domain: free provider? how long ago was it registered?
// Never throws — lookup problems are returned in `error` so the analysis carries on without them.
export async function checkDomain(email) {
  const value = String(email).trim().toLowerCase();
  const domain = value.slice(value.lastIndexOf("@") + 1);
  const result = { domain, isFreeProvider: false, createdAt: null, ageDays: null, error: null };

  if (!value.includes("@") || !DOMAIN_RE.test(domain)) {
    return { ...result, domain: null, error: "Invalid email address" };
  }
  if (FREE_PROVIDERS.has(domain)) return { ...result, isFreeProvider: true };

  try {
    const createdAt = await findCreationDate(domain);
    const ageDays = Math.floor((Date.now() - createdAt.getTime()) / DAY_MS);
    return { ...result, createdAt: createdAt.toISOString(), ageDays };
  } catch (err) {
    return { ...result, error: `WHOIS lookup failed: ${err.message}` };
  }
}

// RDAP (WHOIS over HTTPS/JSON) where the TLD supports it, classic port-43 WHOIS otherwise.
// Walks up from subdomains (hr.acme.co.in -> acme.co.in) since only registered domains have records.
async function findCreationDate(domain) {
  const tld = domain.split(".").pop();
  const rdapBase = await rdapServerFor(tld).catch(() => null);
  const lookup = rdapBase ? (name) => rdapCreationDate(rdapBase, name) : whoisCreationDate;

  const labels = domain.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const createdAt = await lookup(labels.slice(i).join("."));
    if (createdAt) return createdAt;
  }
  throw new Error(`no registration date published for ${domain}`);
}

async function rdapServerFor(tld) {
  rdapServers ??= fetch("https://data.iana.org/rdap/dns.json", {
    signal: AbortSignal.timeout(DOMAIN_CONFIG.timeoutMs),
  })
    .then((res) => res.json())
    .then(({ services }) => new Map(services.flatMap(([tlds, [url]]) => tlds.map((t) => [t, url]))))
    .catch((err) => {
      rdapServers = undefined; // retry on the next request
      throw err;
    });
  return (await rdapServers).get(tld) ?? null;
}

async function rdapCreationDate(baseUrl, domain) {
  const res = await fetch(new URL(`domain/${domain}`, baseUrl), {
    headers: { Accept: "application/rdap+json" },
    signal: AbortSignal.timeout(DOMAIN_CONFIG.timeoutMs),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`RDAP server returned ${res.status}`);
  const { events = [] } = await res.json();
  return parseDate(events.find((e) => e.eventAction === "registration")?.eventDate);
}

async function whoisCreationDate(domain) {
  const tld = domain.split(".").pop();
  if (!whoisServers.has(tld)) {
    const referral = await whoisQuery("whois.iana.org", tld);
    const host = referral.match(/^(?:refer|whois):\s*(\S+)/im)?.[1];
    if (!host) throw new Error(`no WHOIS server for .${tld}`);
    whoisServers.set(tld, host);
  }
  const record = await whoisQuery(whoisServers.get(tld), domain);
  const created = record.match(/^\s*(?:creation date|created(?: on)?|registered on|registration time):\s*(.+)$/im)?.[1];
  return parseDate(created?.trim());
}

function whoisQuery(host, query) {
  return new Promise((resolve, reject) => {
    let response = "";
    const socket = net.createConnection({ host, port: 43 }, () => socket.write(`${query}\r\n`));
    socket.setEncoding("utf8");
    socket.setTimeout(DOMAIN_CONFIG.timeoutMs, () => socket.destroy(new Error(`${host} timed out`)));
    socket.on("data", (chunk) => (response += chunk));
    socket.on("end", () => resolve(response));
    socket.on("error", reject);
  });
}

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}
