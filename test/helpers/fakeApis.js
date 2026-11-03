// A fetch replacement for pipeline tests: fake RDAP (WHOIS), Tavily and Gemini, so no network calls are made.
//   registered: RDAP registration date for every .com/.in/.xyz domain, or null (lookup fails -> "unavailable")
//   results:    Tavily results, or null (Tavily fails); or a function (query) => results/null per search
//   gemini:     the JSON object Gemini "returns"
export function fakeApis({ registered = null, results = null, gemini }) {
  return async (input, init) => {
    const url = String(input?.url ?? input);
    if (url === "https://data.iana.org/rdap/dns.json") {
      return Response.json({ services: [[["com", "in", "xyz"], ["https://rdap.test/"]]] });
    }
    if (url.startsWith("https://rdap.test/")) {
      if (!registered) return new Response("{}", { status: 404 });
      return Response.json({ events: [{ eventAction: "registration", eventDate: registered }] });
    }
    if (url.startsWith("https://api.tavily.com/")) {
      const found = typeof results === "function" ? results(JSON.parse(init.body).query) : results;
      return found ? Response.json({ results: found }) : new Response("{}", { status: 500 });
    }
    if (url.includes("generativelanguage.googleapis.com")) {
      return Response.json({ candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(gemini) }] } }] });
    }
    throw new Error(`Unexpected fetch in test: ${url}`);
  };
}

export const safeScores = { companyLegitimacy: 90, emailDomain: 90, salaryRealism: 90, offerQuality: 90, scamPatterns: 90 };
