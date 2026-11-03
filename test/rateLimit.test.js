import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import express from "express";
import { createApp } from "../app.js";
import { analyzeRateLimits } from "../lib/rateLimit.js";
import { fakeApis, safeScores } from "./helpers/fakeApis.js";

// Each test starts its own server on a free port. Requests to it use the real fetch; the app's own outgoing
// calls (RDAP, Tavily, Gemini) go through globalThis.fetch, which fails or is faked, so nothing leaves the machine.
const realFetch = globalThis.fetch;
const realEnv = { ...process.env };
afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

async function start(t, app) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => (server.closeAllConnections(), server.close(resolve))));
  const base = `http://127.0.0.1:${server.address().port}`;
  return async (path, { body = {}, ip } = {}) => {
    const res = await realFetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(ip && { "X-Forwarded-For": ip }) },
      body: JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
}

// A stand-in endpoint behind the same limiters, with small limits. Trusting the loopback proxy lets a test
// pick the client IP with X-Forwarded-For.
function limitedApp(limits) {
  const app = express();
  app.set("trust proxy", "loopback");
  app.post("/scan", analyzeRateLimits(limits), (req, res) => res.json({ ok: true }));
  return app;
}

const noNetwork = async (input) => {
  throw new Error(`Unexpected fetch in test: ${input}`);
};

// --- rate limits ---

test("/api/analyze-job: the 6th request from one IP within a minute gets a 429 JSON error", async (t) => {
  globalThis.fetch = noNetwork;
  const post = await start(t, createApp());

  // Empty bodies fail validation (400) without calling any API, but still count toward the limit.
  for (let i = 1; i <= 5; i++) assert.equal((await post("/api/analyze-job")).status, 400, `request ${i}`);

  const limited = await post("/api/analyze-job");
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /^Too many scans from your network: the limit is 5 per minute\. Try again in (\d+ seconds?|1 minute)\.$/);
  assert.ok(limited.body.retryAfterSeconds >= 1 && limited.body.retryAfterSeconds <= 60);
  assert.equal(limited.headers.get("retry-after"), String(limited.body.retryAfterSeconds));
});

test("the per-minute limit is counted per IP: another IP is still served", async (t) => {
  const post = await start(t, limitedApp({ perMinute: 2, perDay: 100 }));
  assert.equal((await post("/scan", { ip: "10.0.0.1" })).status, 200);
  assert.equal((await post("/scan", { ip: "10.0.0.1" })).status, 200);
  assert.equal((await post("/scan", { ip: "10.0.0.1" })).status, 429);
  assert.equal((await post("/scan", { ip: "10.0.0.2" })).status, 200);
});

test("the daily cap counts scans from all IPs together and returns a JSON error once reached", async (t) => {
  const post = await start(t, limitedApp({ perMinute: 100, perDay: 3 }));
  for (const ip of ["10.0.0.1", "10.0.0.2", "10.0.0.3"]) assert.equal((await post("/scan", { ip })).status, 200);

  const capped = await post("/scan", { ip: "10.0.0.4" });
  assert.equal(capped.status, 429);
  assert.equal(capped.body.error, "Daily scan limit reached: this service runs at most 3 scans a day. Try again in about 24 hours.");
  assert.ok(capped.body.retryAfterSeconds > 23 * 3600);
});

test("requests rejected by the per-IP limit don't use up the daily cap", async (t) => {
  const post = await start(t, limitedApp({ perMinute: 1, perDay: 2 }));
  assert.equal((await post("/scan", { ip: "10.0.0.1" })).status, 200);
  assert.match((await post("/scan", { ip: "10.0.0.1" })).body.error, /per minute/); // not counted as a scan
  assert.equal((await post("/scan", { ip: "10.0.0.2" })).status, 200);
  assert.match((await post("/scan", { ip: "10.0.0.3" })).body.error, /^Daily scan limit reached/);
});

// --- TRUST_PROXY ---

test("TRUST_PROXY=true: two different X-Forwarded-For IPs get separate per-minute counts", async (t) => {
  process.env.TRUST_PROXY = "true";
  globalThis.fetch = noNetwork;
  const post = await start(t, createApp());

  for (let i = 1; i <= 5; i++) assert.equal((await post("/api/analyze-job", { ip: "203.0.113.1" })).status, 400, `request ${i}`);
  assert.equal((await post("/api/analyze-job", { ip: "203.0.113.1" })).status, 429);
  assert.equal((await post("/api/analyze-job", { ip: "203.0.113.2" })).status, 400); // its own count: not limited
});

test("TRUST_PROXY unset: X-Forwarded-For is ignored, so a faked IP still shares the caller's count", async (t) => {
  delete process.env.TRUST_PROXY;
  globalThis.fetch = noNetwork;
  t.mock.method(console, "warn", () => {}); // express-rate-limit warns about the unexpected X-Forwarded-For header
  t.mock.method(console, "error", () => {});
  const post = await start(t, createApp());

  for (let i = 1; i <= 5; i++) await post("/api/analyze-job", { ip: "203.0.113.1" });
  assert.equal((await post("/api/analyze-job", { ip: "203.0.113.2" })).status, 429);
});

// --- API keys stay out of logs and responses ---

const GEMINI_KEY = "AIza-test-gemini-key-1234";
const TAVILY_KEY = "tvly-test-tavily-key-5678";
const validJob = { company: "Acme Corp", jobTitle: "Engineer", email: "hr@acme-hiring.com", salary: "500000", location: "Chennai" };
const geminiReply = { scores: safeScores, redFlags: [], greenFlags: [], reasoning: "r", recommendation: "c" };

// RDAP and the other APIs are faked; calls to the `failing` hosts throw an error that echoes both API keys,
// the worst case of a client library putting its credentials into an error message.
function leakyApis(failing) {
  const fake = fakeApis({ registered: null, results: [], gemini: geminiReply });
  return async (input, init) => {
    const url = String(input?.url ?? input);
    if (url.includes(failing)) throw new Error(`request to ${failing} failed, key=${GEMINI_KEY} auth=${TAVILY_KEY}`);
    return fake(input, init);
  };
}

function captureConsole(t) {
  const lines = [];
  for (const level of ["log", "info", "warn", "error"]) t.mock.method(console, level, (...args) => lines.push(args.join(" ")));
  return lines;
}

function assertNoKeys(text) {
  assert.ok(!text.includes(GEMINI_KEY) && !text.includes(TAVILY_KEY), `API key leaked in: ${text}`);
}

for (const [api, host] of [["Tavily", "api.tavily.com"], ["Gemini", "generativelanguage.googleapis.com"]]) {
  test(`a ${api} error that contains API keys is redacted in the logs and the response`, async (t) => {
    process.env.GEMINI_API_KEY = GEMINI_KEY;
    process.env.TAVILY_API_KEY = TAVILY_KEY;
    globalThis.fetch = leakyApis(host);
    const logs = captureConsole(t);
    const post = await start(t, createApp());

    const res = await post("/api/analyze-job", { body: validJob });

    assertNoKeys(JSON.stringify(res.body));
    assertNoKeys(logs.join("\n"));
    if (api === "Tavily") {
      // Web search failures are not fatal: the scan still completes, and the failure is logged redacted.
      assert.equal(res.status, 200);
      assert.ok(logs.some((line) => line.includes("search failed") && line.includes("[redacted]")), logs.join("\n"));
    } else {
      // The Gemini SDK passes the fetch error's message through unchanged, so the key would reach the client.
      assert.equal(res.status, 500);
      assert.match(res.body.error, /\[redacted\]/);
    }
  });
}
