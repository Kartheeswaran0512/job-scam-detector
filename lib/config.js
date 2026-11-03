// Tunable knobs for scam detection. Change values here, not in the logic files.

// Tried in order: when a model is out of quota (429) or overloaded (503), the next one is used.
// Free-tier limits are per model, so the fallback keeps scans working after the first model's daily limit.
// GEMINI_MODEL in .env, if set, is tried first.
export const GEMINI_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest"];

// Limits on POST /api/analyze-job. Every scan calls Gemini and Tavily, so these stop one user, or a burst
// of traffic, from using up the API quotas. Counts are kept in memory and reset when the server restarts.
export const RATE_LIMIT_CONFIG = {
  perIpPerMinute: 5, // scans per minute from one IP address
  dailyScans: 100, // scans per 24 hours across all users (the window starts at the first scan)
};

export const RISK_CONFIG = {
  // Weights for the weighted average of Gemini's dimension scores (0-100, higher = safer).
  // Normalised by their sum, so they don't have to add up to exactly 1.
  weights: {
    scamPatterns: 0.3, // strongest direct signal: fees, chat-app interviews, "pay for training"
    companyLegitimacy: 0.25, // fake or impersonated employers are the core of most job scams
    emailDomain: 0.2, // partly backed by hard facts (free provider, WHOIS age)
    salaryRealism: 0.15, // classic lure, but legitimate outliers exist
    offerQuality: 0.1, // weakest: with only five input fields there is little offer text to judge
  },

  // riskScore = 100 - weighted safety. riskScore >= high -> HIGH, >= medium -> MEDIUM, else LOW.
  thresholds: { high: 60, medium: 30 },

  // With this many red flags (AI + automated checks) the verdict is never LOW.
  minRedFlagsForMedium: 2,

  // A company found online but contacted through a free email provider is a likely impersonation.
  impersonationMinLevel: "HIGH",

  // An email domain the email-domain search could not confirm as the company's: verdict at least MEDIUM,
  // and the email-domain score at most maxEmailScore.
  unconfirmedEmailDomain: { minLevel: "MEDIUM", maxEmailScore: 40 },

  // A failed automated check caps the related dimension so the score can't contradict the facts.
  checkCaps: { emailDomain: 30, companyLegitimacy: 30 },
};

// Red flags on the same topic count once toward the verdict rule (see dedupeFlags). These are the topics
// the automated checks report and Gemini tends to restate in its own words. The first matching topic wins.
export const FLAG_TOPICS = {
  domainAge: /(registered|created) (only )?\d+ days ago|(newly|recently) (registered|created)|domain age|(new|young) domain/i,
  emailDomain:
    /\b(gmail|googlemail|yahoo|ymail|hotmail|outlook|rediffmail|aol|icloud|protonmail)\b|free (e-?mail|webmail|mail)|webmail|(personal|public|generic) e-?mail|\b(official|unofficial|company|corporate)\b.{0,25}\bdomains?\b|\be-?mail( address| domain)?\b.{0,20}\b(does ?n[o']t|doesn't|not) match\b|\bdomain mismatch\b/i,
  companyUnverified:
    /\b(company|employer|business)\b.{0,40}\b((could not|couldn't|cannot|can't|unable to|not) (be )?(verified|found)|(does not|doesn't|did not|didn't) (appear|exist|show up))|\b(could not|couldn't|cannot|can't|unable to) (verify|find) (the |this )?(company|employer|business)|no (verifiable )?(online|web|internet) presence|no official website|not found online/i,
};

// A flag matching this claims something about the company's online presence. Without search results such
// claims have no basis, so Gemini's flags matching it are dropped (see removeWebPresenceClaims).
export const WEB_PRESENCE_PATTERN =
  /\b(web ?sites?|official site|home ?page|web ?pages?|web presence|online presence|internet presence|digital (presence|footprint)|linked ?in|glassdoor|social media|web search|search results?|(found|exists?|listed|verified|verifiable|appears?|visible|present|presence) online|online (footprint|reviews?|profiles?|listings?|records?))\b/i;

// "Headquarters is elsewhere than the job" is not a red flag (branch offices, remote roles). A flag is that
// claim when it mentions the headquarters AND a different job location or a missing local office, unless it
// also raises another real problem (see removeHqLocationFlags).
export const HQ_LOCATION_FLAG = {
  // "based in" counts only when the company is the subject ("the company is based in"), not e.g. the recruiter.
  headquarters:
    /\b(headquarter(s|ed)?|hq|head ?office|main office|registered office|(company|employer|firm|organi[sz]ation)( is| are|'s|’s)? based (in|out of))\b/i,
  differentLocation: [
    /\b(differ(s|ent|ence)?|mismatch(ed)?|(does ?n[o']t|doesn't|not) match|inconsistent|elsewhere|outside|far from|another (city|state|country))\b/i,
    // "..., whereas the job location is in Madurai" / "while the role is based in Chennai"
    /\b(but|whereas|while|although|though|however)\b.{0,40}\b(job|role|position|posting|vacancy|opening|work|hiring)\b.{0,30}\b(in|at)\b/i,
    // "no branch office" / "without explicit details about a local branch office"
    /\b(no|without|lacks?|lacking|absence of|missing|not have|n't have|not mention|n't mention)\b.{0,40}\b(branch|local office|regional office|local presence|office in)\b/i,
  ],
  // Flags that also raise one of these are kept: the location part is harmless, the rest is not.
  otherProblem:
    /\b(fees?|deposit|payments?|pay|paid|paying|money|bank|otp|aadhaar|pan card|gmail|yahoo|hotmail|outlook|free e-?mail|personal e-?mail|webmail|telegram|whatsapp|unrealistic|too good|above market|urgent|pressure|no interview|crypto|gift cards?|cheque|wire transfer)\b/i,
};

export const SEARCH_CONFIG = {
  maxResults: 5,
  snippetChars: 300, // per result, to keep the Gemini prompt small
  timeoutMs: 8000,
};

export const DOMAIN_CONFIG = {
  minAgeDays: 365,
  timeoutMs: 6000,
  freeProviders: [
    "gmail.com", "googlemail.com",
    "yahoo.com", "yahoo.co.in", "yahoo.in", "yahoo.co.uk", "ymail.com", "rocketmail.com",
    "outlook.com", "outlook.in", "hotmail.com", "live.com", "msn.com",
    "aol.com", "icloud.com", "me.com", "mail.com", "gmx.com", "yandex.com",
    "proton.me", "protonmail.com", "zohomail.com", "zohomail.in", "rediffmail.com",
  ],
};
