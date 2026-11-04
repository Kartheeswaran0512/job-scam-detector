# Job Scam Detector

Checks whether a job offer is likely to be fake. You enter five details from the offer; the server looks up
the email domain, searches the web for the company, asks Google Gemini to score the offer, and then applies
fixed rules in code to reach a verdict.

**GitHub:** <https://github.com/Kartheeswaran0512/job-scam-detector>

---

## What it does

**Input** (the same five fields in the web page, the CLI, the mobile app, the API and the MCP server):

| Field | Example |
|---|---|
| Company | Infolexus Solutions |
| Job title | Software Developer |
| Contact email | `hr@company.com` |
| Offered salary | 500000 (numbers only; currency INR or USD, default INR) |
| Location | Madurai, Tamil Nadu |

**Output:**

- **Verdict**: `HIGH`, `MEDIUM` or `LOW` risk, plus a note when a rule raised it (for example
  `Raised from LOW to HIGH: gmail.com address for a company that exists online (likely impersonation)`).
- **Risk score**: 0–100, higher = riskier.
- **Five dimension scores**: 0–100 each, higher = safer.

  | Dimension | What it measures | Weight in the risk score |
  |---|---|---|
  | Scam patterns | Free of known scam patterns (fees, chat-app interviews, "pay for training") | 0.30 |
  | Company legitimacy | A real, credible company | 0.25 |
  | Email domain | Official company domain, not free, new or look-alike | 0.20 |
  | Salary realism | Realistic for the role and location, in the given currency | 0.15 |
  | Offer quality | Free of too-good-to-be-true or vague elements | 0.10 |

- **Red flags**: from the automated checks and from Gemini, one per issue.
- **Green flags**, **reasoning** (2–3 sentences) and a **recommendation**, written by Gemini.
- **Automated checks**: plain-text lines showing what the code looked up, in this form:
  `Email domain: <domain>`, `WHOIS creation date: <YYYY-MM-DD> (<age>)`, `Company found online: <evidence>`,
  `Email domain matches the company's website (<website>)`.
- The Gemini model that produced the scores.

---

## How it works

Each scan runs these steps (orchestrated in [`lib/detectScam.js`](lib/detectScam.js)). Gemini runs third,
because steps 4–6 depend on its judgement of which search results are about the company.

1. **Company web search (Tavily)** — searches for `"<company> <location> company"` and keeps up to 5 results.
   Runs at the same time as step 2. Skipped if `TAVILY_API_KEY` is not set.
2. **Email domain and WHOIS age** — takes the domain from the contact email. Free providers (Gmail, Yahoo,
   Outlook, Rediffmail and others listed in [`lib/config.js`](lib/config.js)) are flagged and not looked up.
   For any other domain, the registration date comes from RDAP (WHOIS over HTTPS) or classic WHOIS.
   A domain registered less than 365 days ago is a red flag.
3. **Gemini scoring** — Gemini gets the five fields, the results of step 2 and the search results. It
   returns the five scores, red and green flags, reasoning, a recommendation, and which search results (if
   any) are about this company. Models are tried in order: `GEMINI_MODEL` from `.env` if set, then
   `gemini-3.5-flash`, then `gemini-flash-lite-latest`. The next model is used when one answers 429 (out of
   quota) or 503 (overloaded). Two filters then clean Gemini's flags:
   - Red flags whose only point is that the headquarters is somewhere other than the job location are
     dropped.
   - When the search was unavailable or empty, any claims about the company's web presence are dropped,
     because Gemini had nothing to base them on.
4. **Company verification** — the company counts as found online only if Gemini says so **and** one of the
   results it picked has a title or domain matching the **full** company name (legal suffixes such as
   Pvt Ltd are ignored). Not found → red flag, and Company legitimacy is capped at 30. If the search could
   not run, there is no flag.
5. **Email vs website** — when the company was found, one of its results is its own website, and the email
   is not from a free provider, the email's domain is compared with that website's domain
   (`careers.infosys.com` counts as `infosys.com`).
   Mismatch → red flag, and Email domain is capped at 30.
6. **Email-domain search** — only for a custom email domain of a company that was found. A second Tavily
   search, limited to pages on that domain, checks that a page there names the full company. Not confirmed →
   red flag, Email domain capped at 40, and the verdict is at least MEDIUM.
7. **Rules in code** ([`lib/computeRisk.js`](lib/computeRisk.js), numbers in [`lib/config.js`](lib/config.js)):
   - **Risk score** = 100 − the weighted average of the five scores (after the caps above), rounded.
     Risk score ≥ 60 → HIGH, ≥ 30 → MEDIUM, otherwise LOW.
   - **Red-flag dedupe** — automated-check flags come first, then Gemini's. Exact repeats are removed, and
     flags on the same topic (domain age, email domain, company not verified) count once.
   - **Minimum verdict floors** raise the verdict, never lower it:

     | Condition | Floor |
     |---|---|
     | Company found online **and** a free email provider (likely impersonation) | HIGH |
     | Email domain could not be confirmed as the company's (step 6) | MEDIUM |
     | 2 or more red flags after dedupe | MEDIUM |

---

## Setup

Requires **Node.js 21 or newer**. The Gemini SDK needs Node 20+, and `npm test` passes a glob to
`node --test`, which needs Node 21+.

```bash
git clone https://github.com/Kartheeswaran0512/job-scam-detector.git
cd job-scam-detector
npm install
cp .env.example .env
```

Edit `.env`:

```bash
GEMINI_API_KEY=your-gemini-api-key     # https://aistudio.google.com/apikey
TAVILY_API_KEY=your-tavily-api-key     # https://app.tavily.com
```

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Scoring. Without it every scan fails with `GEMINI_API_KEY is not set`. |
| `TAVILY_API_KEY` | No | Company and email-domain searches. Without it they are skipped (`Company web search unavailable`). |
| `GEMINI_MODEL` | No | A Gemini model to try before the defaults. |
| `PORT` | No | Server port, default `5000`. |
| `TRUST_PROXY` | No | Set to `true` behind a reverse proxy such as Render (see [Rate limiting](#rate-limiting)). |

`.env` is in `.gitignore`. Never commit it.

### Web app

```bash
npm start
```

Open <http://localhost:5000>. This serves the form in [`public/index.html`](public/index.html).

### Tests

```bash
npm test
```

Runs the `node:test` suite in [`test/`](test/). RDAP, Tavily and Gemini are faked, so the tests need no API
keys and make no network calls.

### CLI

```bash
npm run cli
```

Asks for the five fields (and INR or USD) in the terminal, then prints the verdict, risk score, dimension
scores, automated checks, flags, reasoning and recommendation. It reads the same `.env`.

### React client (`client/`)

A React (Vite) version of the form, with its own dependencies:

```bash
cd client
npm install
npm run dev
```

Start the Express server first (`npm start` in the project root). In dev mode,
[`client/vite.config.js`](client/vite.config.js) forwards `/api` requests to it at `http://localhost:5000`;
if you change `PORT`, change that address too. Two gaps remain:

- `npm run build` writes `client/dist`, which the server serves as static files, but `/` still returns
  `public/index.html`, because `public/` is served first.
- It has no currency field, so the server uses INR.

### Mobile app (`mobile-app/`)

An Expo (SDK 54) app with the same form, showing the full result:

```bash
cd mobile-app
npm install
npx expo start
```

It sends scans to a deployed server whose URL is hardcoded in
[`mobile-app/app/(tabs)/index.tsx`](mobile-app/app/(tabs)/index.tsx). Change it to your own deployment's
`/api/analyze-job` URL. It has no currency field, so the server uses INR.

---

## API

**`POST /api/analyze-job`**

```json
{
  "company": "Infosys",
  "jobTitle": "Systems Engineer",
  "email": "careers@infosys.com",
  "salary": "360000",
  "currency": "INR",
  "location": "Chennai"
}
```

`currency` is optional (default `INR`). The other five fields are required. A successful response:

```json
{
  "success": true,
  "verdict": "RISK LEVEL: LOW\nRISK SCORE: …",
  "analysis": {
    "level": "LOW",
    "riskScore": 0,
    "verdictNote": null,
    "scores": { "companyLegitimacy": 0, "emailDomain": 0, "salaryRealism": 0, "offerQuality": 0, "scamPatterns": 0 },
    "redFlags": ["…"],
    "greenFlags": ["…"],
    "reasoning": "…",
    "recommendation": "…",
    "model": "…",
    "checks": { "domain": {}, "company": {}, "emailWebsite": {}, "emailDomainSearch": null, "summary": ["…"] }
  },
  "input": { "…": "the fields as received" }
}
```

`verdict` is the same result as plain text, kept for older clients. Errors use one shape, `{ "error": "…" }`:

| Status | When |
|---|---|
| 400 | A required field is missing (`All fields are required`) |
| 429 | A rate limit was hit. The body also has `retryAfterSeconds`, and a `Retry-After` header is set. |
| 500 | The scan failed, for example when Gemini is out of quota. API keys are removed from the message. |

**`GET /api/health`** → `{ "status": "Server is running", "timestamp": "…" }`

---

## MCP server

[`mcp-server.js`](mcp-server.js) is a [Model Context Protocol](https://modelcontextprotocol.io) server. It
lets an AI assistant such as Claude Code run the detector as tools. The assistant starts it and talks to it
over stdin/stdout, so there is no port and nothing to keep running. It reads `.env` from the project folder,
wherever the assistant starts it from.

| Tool | Inputs | What it runs | Returns (JSON text) |
|---|---|---|---|
| `analyze_job_posting` | `company`, `jobTitle`, `email`, `salary` (number), `currency` (`INR` or `USD`, default `INR`), `location` | The full pipeline, the same function as `POST /api/analyze-job` | The same object as `analysis` in the [API](#api) response: `level`, `riskScore`, `verdictNote`, `scores`, `redFlags`, `greenFlags`, `reasoning`, `recommendation`, `model`, `checks` |
| `check_email_domain` | `email` | Step 2 only: free-provider check and WHOIS/RDAP registration date | `domain`, `isFreeProvider`, `createdAt`, `ageDays`, `error` (why WHOIS failed, or `null`), `redFlags` |
| `verify_company` | `company`, `location` | Step 1 only: the Tavily company search | `verdict` (`found` or `not found`), `evidence`, `matchedResults` (`title`, `url`, `snippet`), `websites`, `query`, `totalResults` |

`verify_company` does not call Gemini. A result counts as a match when its title or domain matches the full
company name (step 4's strict match), without checking what the page says, so a page warning about the
company also matches. `analyze_job_posting` is stricter: Gemini must also judge the result to be about the
company.

Failures come back as MCP tool errors with a readable message, for example the Gemini quota message described
in [Known limits](#known-limits), `GEMINI_API_KEY is not set`, or
`Company web search unavailable: TAVILY_API_KEY is not set`. API keys are removed from these messages and from
the logs. The server keeps running after an error. Logs go to stderr, because stdout carries the protocol.

The [rate limits](#rate-limiting) apply only to the web API. Every `analyze_job_posting` call uses your own
Gemini and Tavily quota, and `verify_company` uses Tavily quota.

### Try it with the MCP Inspector

From the project folder:

```bash
npx @modelcontextprotocol/inspector node mcp-server.js
```

This starts the MCP Inspector, a browser tool for testing MCP servers, connected to this server. From there
you can list the three tools and call each one with your own inputs. (`npm run mcp` also starts the server,
but on its own it just waits for a client on stdin.)

### Add it to Claude Code

```bash
claude mcp add job-scam-detector -- node D:/job-scam-detector-main/job-scam-detector-main/mcp-server.js
```

Use the absolute path to `mcp-server.js` in your own copy of the project. By default the server is added for
the current project only; add `--scope user` before the name to use it in every project. In a Claude Code
session, `/mcp` shows whether it is connected.

Then ask in plain language, for example:

> Is this job real? Company: Golden Earn Data Services, job title: Data Entry Operator (work from home),
> email: goldenearn.hr@gmail.com, salary: 1500000 INR, location: Remote.

Claude calls `analyze_job_posting` with those fields and gets the JSON result described above. Its answer is
based on that result: the risk level (`HIGH`, `MEDIUM` or `LOW`) and risk score, the note when a rule raised
the level, the red and green flags, the automated checks, Gemini's reasoning and the recommendation. Since the
scores come from live web search and Gemini, the result for the same posting can change over time. For a
quick look at only the email or only the company, ask about that and Claude can use `check_email_domain` or
`verify_company`, which don't call Gemini.

---

## Rate limiting

Every scan costs Gemini and Tavily calls, so `POST /api/analyze-job` is limited
([`lib/rateLimit.js`](lib/rateLimit.js), numbers in `RATE_LIMIT_CONFIG` in [`lib/config.js`](lib/config.js)):

- **5 requests per minute per IP address.**
- **100 scans per 24 hours in total**, across all users. The window starts at the first scan.

Every request to the endpoint counts, including ones rejected for missing fields. A request blocked by the
per-IP limit does not use up one of the 100 daily scans. When a limit is hit, the response is 429 with a
message such as:

```json
{ "error": "Too many scans from your network: the limit is 5 per minute. Try again in 1 minute.", "retryAfterSeconds": 60 }
```

**Behind a proxy, set `TRUST_PROXY=true`.** On Render, every request reaches the server from Render's proxy,
so without this setting all visitors share one per-IP limit. With `TRUST_PROXY=true` the server takes each
visitor's IP from the `X-Forwarded-For` header. Leave it unset when visitors connect directly (for example
when running locally): anyone could then fake that header to get around the limit.

---

## Deploying on Render

1. Push the code to GitHub.
2. In Render, create a **Web Service** from the repository.
3. Build command: `npm install`. Start command: `npm start`.
4. Under **Environment**, add:

   | Key | Value |
   |---|---|
   | `GEMINI_API_KEY` | your Gemini API key |
   | `TAVILY_API_KEY` | your Tavily API key |
   | `TRUST_PROXY` | `true` |

   Don't set `PORT`. Render provides it and the server reads it.
5. Deploy, then point the mobile app at the new URL (see [Mobile app](#mobile-app-mobile-app)).

On the free tier, the service is stopped after a period without traffic. The first request after that
waits about one minute while it starts again. The restart also resets the rate-limit counters.

---

## Known limits

- **Gemini free-tier quota.** The free tier has per-minute and daily limits for each model. That's why a
  second model is tried when the first is out of quota. When both are exhausted, the scan fails with a
  message saying which limit was hit. The daily limit resets at midnight Pacific time, and all API keys in
  the same Google Cloud project share it.
- **Company sites missing from search results.** If Tavily doesn't return the company's pages (common for
  new or small companies), the company is reported as "could not be verified online", even if it is real.
  That adds a red flag and caps Company legitimacy at 30, and the email-vs-website and email-domain checks
  are skipped.
- **Short brand names fail the strict match.** A result must match the full company name you typed. This
  stops look-alikes ("ZentrixGlobal" does not match "Zentrix Global Hiring Pvt Ltd"). But a real company
  whose website only uses a shorter brand ("Nexora" for "Nexora Tech Solutions") is not verified, or its
  email domain is not confirmed, and the verdict can rise to MEDIUM.
- **Rate limits are kept in memory.** They reset whenever the server restarts (including Render free-tier
  restarts) and are not shared between multiple server instances.
- **Salary period is not specified.** The salary is sent to Gemini as a number and currency, without saying
  whether it is yearly or monthly. The web form labels it "per year".
- **Not proof.** Gemini's scores are judgement calls, and the search results change over time. Use the
  result as a first check, and verify the offer through the company's official website.

---

## Testing

Run the automated tests with `npm test` (see [Tests](#tests)). To try the full pipeline, start the server
with both API keys set and enter these in the web form. Results depend on live search results and Gemini's
scores, so the reason column says what the code guarantees.

| Case | Company | Job title | Email | Salary (INR) | Location | Expected |
|---|---|---|---|---|---|---|
| Fake | Golden Earn Data Services | Data Entry Operator (work from home) | `goldenearn.hr@gmail.com` | 1500000 | Remote | **HIGH** |
| Real | Infosys | Systems Engineer | `careers@infosys.com` | 360000 | Chennai | **LOW** |
| Invented company | Zentrix Global Hiring Pvt Ltd | HR Executive | `hr@zentrixglobalhiring.com` | 420000 | Coimbatore | **MEDIUM** (usually) |
| Impersonation | Infosys | Systems Engineer | `infosys.careers.hr@gmail.com` | 360000 | Chennai | **HIGH** |

Why:

- **Fake** — a free email provider plus a company that can't be verified gives two automated red flags, so
  the verdict is at least MEDIUM. With Gemini's low salary and scam-pattern scores it normally reaches HIGH.
- **Real** — the company is found, the email domain matches its website and is confirmed by the email-domain
  search, and the domain is more than a year old. No automated red flags, so the verdict comes from
  Gemini's scores.
- **Invented company** — no result matches the full name, so the company is not verified: one red flag and
  Company legitimacy capped at 30. The email checks are skipped. The level then depends on Gemini's other
  scores, so expect MEDIUM, but LOW is possible if Gemini rates everything else highly.
- **Impersonation** — a company that exists online contacting you from a Gmail address triggers the
  impersonation floor, so the verdict is HIGH whatever the scores. This requires the search to find Infosys.

---

## Project structure

```text
├── server.js              # Loads .env and starts the server
├── app.js                 # Express app: static files, /api/analyze-job, /api/health
├── index.js               # Interactive CLI
├── mcp-server.js          # MCP server: loads .env, connects the tools to stdio
├── lib/
│   ├── mcpTools.js        # MCP tools: analyze_job_posting, check_email_domain, verify_company
│   ├── detectScam.js      # Runs the steps above in order
│   ├── checkDomain.js     # Free-provider check, WHOIS/RDAP registration date
│   ├── searchCompany.js   # Tavily searches (company, email domain)
│   ├── gemini.js          # Gemini prompt, scores, model fallback
│   ├── companyMatch.js    # Strict full-name matching
│   ├── emailWebsite.js    # Email domain vs company website
│   ├── emailDomainSearch.js  # Does the email domain belong to the company?
│   ├── hqLocationFlags.js     # Drops "headquarters elsewhere" flags
│   ├── webPresenceClaims.js   # Drops ungrounded web-presence flags
│   ├── dedupeFlags.js     # One red flag per issue
│   ├── computeRisk.js     # Caps, risk score, verdict floors
│   ├── rateLimit.js       # Per-IP and daily limits
│   ├── redact.js          # Removes API keys from logged and returned errors
│   └── config.js          # Weights, thresholds, limits, free-provider list
├── public/index.html      # Web form served at /
├── client/                # React (Vite) form
├── mobile-app/            # Expo app
└── test/                  # node:test suite, no network calls
```

---

## License

MIT

## Author

**Kartheeswaran K** — <https://github.com/Kartheeswaran0512>
