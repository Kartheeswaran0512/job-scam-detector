import { useState } from "react";

const FIELDS = [
  { id: "company", label: "Company", placeholder: "e.g. Infolexus Solutions" },
  { id: "jobTitle", label: "Job title", placeholder: "e.g. Software Developer" },
  { id: "email", label: "Contact email", placeholder: "e.g. hr@company.com" },
  { id: "salary", label: "Offered salary", placeholder: "e.g. 500000" },
  { id: "location", label: "Location", placeholder: "e.g. Madurai, Tamil Nadu" },
];

const RISK_META = {
  high: { color: "#e24b4a", label: "High risk", pct: 88 },
  medium: { color: "#ef9f27", label: "Medium risk", pct: 55 },
  low: { color: "#5dcaa5", label: "Low risk", pct: 15 },
};

function parseVerdict(text) {
  const level = text.toLowerCase().includes("risk level: high")
    ? "high"
    : text.toLowerCase().includes("risk level: medium")
    ? "medium"
    : "low";

  const grab = (label) => {
    const re = new RegExp(`${label}:\\s*([\\s\\S]*?)(?=\\n[A-Z ]+:|$)`, "i");
    const m = text.match(re);
    return m ? m[1].trim() : "";
  };

  const bullets = (block) =>
    block.split("\n").map((l) => l.replace(/^-\s*/, "").trim()).filter(Boolean);

  return {
    level,
    confidence: (text.match(/confidence:\s*([\d]+%)/i) || [])[1] || "",
    red: bullets(grab("RED FLAGS")),
    green: bullets(grab("GREEN FLAGS")),
    reasoning: grab("REASONING"),
    recommendation: grab("RECOMMENDATION"),
  };
}

export default function App() {
  const [form, setForm] = useState({ company: "", jobTitle: "", email: "", salary: "", location: "" });
  const [status, setStatus] = useState("idle");
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState("");

  const update = (id, value) => setForm((f) => ({ ...f, [id]: value }));
  const allFilled = Object.values(form).every((v) => v.trim().length > 0);

  const analyze = async () => {
    if (!allFilled) {
      setError("Fill in every field to run a scan.");
      return;
    }
    setError("");
    setStatus("loading");
    setVerdict(null);

    try {
      const res = await fetch("/api/analyze-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setVerdict(parseVerdict(data.verdict));
      setStatus("done");
    } catch (err) {
      setError(err.message);
      setStatus("idle");
    }
  };

  const meta = verdict ? RISK_META[verdict.level] : null;

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <header style={styles.header}>
          <div style={styles.badge}>SCANNER</div>
          <h1 style={styles.title}>Job scam detector</h1>
          <p style={styles.subtitle}>
            Enter a job posting's details and run a five-point legitimacy scan.
          </p>
        </header>

        <div style={styles.card}>
          {FIELDS.map((f) => (
            <div key={f.id} style={styles.field}>
              <label style={styles.label}>{f.label}</label>
              <input
                style={styles.input}
                placeholder={f.placeholder}
                value={form[f.id]}
                onChange={(e) => update(f.id, e.target.value)}
              />
            </div>
          ))}

          {error && <p style={styles.error}>{error}</p>}

          <button style={styles.button} onClick={analyze} disabled={status === "loading"}>
            {status === "loading" ? "Scanning…" : "Run scan"}
          </button>
        </div>

        {status === "loading" && (
          <div style={styles.scanCard}>
            <div style={styles.scanBar}>
              <div style={styles.scanBarFill} />
            </div>
            <p style={styles.scanText}>Checking company, email, salary, and offer patterns…</p>
          </div>
        )}

        {verdict && (
          <div style={{ ...styles.resultCard, borderColor: meta.color }}>
            <div style={styles.gaugeRow}>
              <Gauge pct={meta.pct} color={meta.color} />
              <div>
                <div style={{ ...styles.riskLabel, color: meta.color }}>{meta.label}</div>
                {verdict.confidence && (
                  <div style={styles.confidence}>{verdict.confidence} confidence</div>
                )}
              </div>
            </div>

            {verdict.red.length > 0 && (
              <Section title="Red flags" items={verdict.red} color="#e24b4a" />
            )}
            {verdict.green.length > 0 && (
              <Section title="Green flags" items={verdict.green} color="#5dcaa5" />
            )}

            {verdict.reasoning && (
              <div style={styles.textBlock}>
                <div style={styles.blockTitle}>Reasoning</div>
                <p style={styles.blockText}>{verdict.reasoning}</p>
              </div>
            )}
            {verdict.recommendation && (
              <div style={styles.textBlock}>
                <div style={styles.blockTitle}>Recommendation</div>
                <p style={styles.blockText}>{verdict.recommendation}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Gauge({ pct, color }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="#2a2f37" strokeWidth="8" />
      <circle
        cx="44"
        cy="44"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="8"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 44 44)"
      />
      <text x="44" y="49" textAnchor="middle" fontSize="16" fontFamily="monospace" fill="#f2f2f0">
        {pct}
      </text>
    </svg>
  );
}

function Section({ title, items, color }) {
  return (
    <div style={styles.textBlock}>
      <div style={{ ...styles.blockTitle, color }}>{title}</div>
      <ul style={styles.list}>
        {items.map((it, i) => (
          <li key={i} style={styles.listItem}>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#14171c",
    color: "#f2f2f0",
    fontFamily: "'Segoe UI', Arial, sans-serif",
    padding: "48px 20px",
  },
  shell: { maxWidth: 560, margin: "0 auto" },
  header: { marginBottom: 28 },
  badge: {
    display: "inline-block",
    fontFamily: "monospace",
    fontSize: 11,
    letterSpacing: "2px",
    color: "#5dcaa5",
    border: "1px solid #2a2f37",
    borderRadius: 4,
    padding: "3px 8px",
    marginBottom: 14,
  },
  title: { fontSize: 28, fontWeight: 600, margin: "0 0 8px" },
  subtitle: { fontSize: 14, color: "#9a9a96", margin: 0, lineHeight: 1.5 },
  card: {
    background: "#1b1f26",
    border: "1px solid #2a2f37",
    borderRadius: 10,
    padding: "24px",
  },
  field: { marginBottom: 16 },
  label: {
    display: "block",
    fontSize: 12,
    fontFamily: "monospace",
    color: "#9a9a96",
    marginBottom: 6,
    letterSpacing: "0.5px",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "#14171c",
    border: "1px solid #2a2f37",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 14,
    color: "#f2f2f0",
    outline: "none",
  },
  error: { color: "#e24b4a", fontSize: 13, margin: "4px 0 12px" },
  button: {
    width: "100%",
    background: "#5dcaa5",
    color: "#04342c",
    border: "none",
    borderRadius: 6,
    padding: "12px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 8,
  },
  scanCard: { marginTop: 20, padding: "16px 0" },
  scanBar: { height: 3, background: "#2a2f37", borderRadius: 2, overflow: "hidden" },
  scanBarFill: {
    width: "40%",
    height: "100%",
    background: "#5dcaa5",
    animation: "none",
  },
  scanText: { fontSize: 13, color: "#9a9a96", marginTop: 10, fontFamily: "monospace" },
  resultCard: {
    marginTop: 20,
    background: "#1b1f26",
    border: "1px solid",
    borderRadius: 10,
    padding: "24px",
  },
  gaugeRow: { display: "flex", alignItems: "center", gap: 16, marginBottom: 20 },
  riskLabel: { fontSize: 18, fontWeight: 600 },
  confidence: { fontSize: 13, color: "#9a9a96", marginTop: 2 },
  textBlock: { marginTop: 18, borderTop: "1px solid #2a2f37", paddingTop: 14 },
  blockTitle: {
    fontSize: 12,
    fontFamily: "monospace",
    letterSpacing: "0.5px",
    marginBottom: 8,
    color: "#f2f2f0",
  },
  blockText: { fontSize: 14, lineHeight: 1.6, color: "#d0d0cc", margin: 0 },
  list: { margin: 0, paddingLeft: 18 },
  listItem: { fontSize: 14, lineHeight: 1.6, color: "#d0d0cc", marginBottom: 4 },
};