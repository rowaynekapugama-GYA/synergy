// CDBS eligibility check form -> email to the practice via SMTP2GO HTTPS API.
// Deploy on Vercel: in the book.synergydentalgroup.com.au project (same origin),
// or in the freeconsult.synergydentalgroup.com.au project (the page falls back to it, CORS allowed below).
//
// Optional environment variables (Vercel > Project > Settings > Environment Variables):
//   SMTP2GO_API_KEY  overrides the embedded Synergy SMTP2GO key
//   SMTP_FROM        sender (must be on a verified SMTP2GO sender domain)
//   CDBS_TO          recipient, default info@synergydentalgroup.com.au
//   CDBS_CC          copy, default rowayne@gyaclients.com (comma separated for more)

const SMTP2GO_API_KEY =
  process.env.SMTP2GO_API_KEY || "api-29A4BC28FC644F038614218EEF7C1152";
const FROM_ADDRESS = process.env.SMTP_FROM || "no-reply@synergydentalgroup.com.au";
const TO = (process.env.CDBS_TO || "info@synergydentalgroup.com.au").split(",").map((s) => s.trim()).filter(Boolean);
const CC = (process.env.CDBS_CC || "rowayne@gyaclients.com").split(",").map((s) => s.trim()).filter(Boolean);

const ALLOWED_ORIGINS = [
  "https://book.synergydentalgroup.com.au",
  "https://synergydentalgroup.com.au",
  "https://www.synergydentalgroup.com.au",
  "https://freeconsult.synergydentalgroup.com.au",
];

const clean = (v, max = 120) => String(v == null ? "" : v).replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function medicareOk(n) {
  const d = String(n || "").replace(/\D/g, "");
  if (d.length !== 10 || !"23456".includes(d[0])) return false;
  const w = [1, 3, 7, 9, 1, 3, 7, 9];
  let s = 0;
  for (let i = 0; i < 8; i++) s += Number(d[i]) * w[i];
  return s % 10 === Number(d[8]);
}

function fmtDob(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!m) return iso || "";
  const born = new Date(`${iso}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const md = now.getMonth() - born.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < born.getDate())) age--;
  return `${m[3]}/${m[2]}/${m[1]} (age ${age})`;
}

export default async function handler(req, res) {
  const origin = req.headers.origin || "";
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  let b = req.body || {};
  if (typeof b === "string") {
    try { b = JSON.parse(b); } catch { b = {}; }
  }

  // Honeypot: real people never fill the hidden "website" field.
  if (b.website) return res.status(200).json({ ok: true });

  const d = {
    ageOk: clean(b.ageOk, 10),
    familyPayment: clean(b.familyPayment, 20),
    childFirstName: clean(b.childFirstName, 60),
    childLastName: clean(b.childLastName, 60),
    childDob: clean(b.childDob, 10),
    medicareNumber: clean(b.medicareNumber, 12).replace(/\D/g, ""),
    medicareIrn: clean(b.medicareIrn, 1),
    parentFirstName: clean(b.parentFirstName, 60),
    parentLastName: clean(b.parentLastName, 60),
    phone: clean(b.phone, 20),
    email: clean(b.email, 120),
    suburb: clean(b.suburb, 60),
    consent: clean(b.consent, 5),
    page: clean(b.page, 200),
    utmSource: clean(b.utmSource, 60),
    utmMedium: clean(b.utmMedium, 60),
    utmCampaign: clean(b.utmCampaign, 100),
    clickId: clean(b.clickId, 10),
  };

  const missing = ["childFirstName", "childLastName", "childDob", "medicareNumber", "medicareIrn",
    "parentFirstName", "parentLastName", "phone", "email", "suburb"].filter((k) => !d[k]);
  if (missing.length || d.consent !== "Yes" || !/^[1-9]$/.test(d.medicareIrn) ||
      !medicareOk(d.medicareNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) {
    return res.status(400).json({ ok: false, error: "Please check the form and try again" });
  }

  const medi = `${d.medicareNumber.slice(0, 4)} ${d.medicareNumber.slice(4, 9)} ${d.medicareNumber.slice(9)}`;
  const source = [d.utmSource, d.utmMedium, d.utmCampaign].filter(Boolean).join(" / ") ||
    (d.clickId === "fbclid" ? "Meta ad" : d.clickId === "gclid" ? "Google ad" : "Direct / unknown");

  const rows = [
    ["Child", `${d.childFirstName} ${d.childLastName}`],
    ["Date of birth", fmtDob(d.childDob)],
    ["Medicare card number", medi],
    ["Ref number (IRN)", d.medicareIrn],
    ["Parent / guardian", `${d.parentFirstName} ${d.parentLastName}`],
    ["Phone", d.phone],
    ["Email", d.email],
    ["Suburb or postcode", d.suburb],
    ["Child aged 0 to 17", d.ageOk || "Not answered"],
    ["Family receives FTB Part A or eligible payment", d.familyPayment || "Not answered"],
    ["Consent to check with Medicare", "Yes"],
    ["Source", source],
    ["Submitted", new Date().toLocaleString("en-AU", { timeZone: "Australia/Melbourne" })],
  ];

  const text =
    "New CDBS eligibility check from book.synergydentalgroup.com.au/cdbs/\n\n" +
    rows.map(([k, v]) => `${k}: ${v}`).join("\n") +
    "\n\nNext step: check eligibility and available balance with Medicare, then call the parent to book.";

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#182338">
<p style="margin:0 0 12px"><strong>New CDBS eligibility check</strong> from book.synergydentalgroup.com.au/cdbs/</p>
<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;border:1px solid #dce8e6">
${rows.map(([k, v]) => `<tr><td style="border:1px solid #dce8e6;background:#f4faf9;font-weight:bold;white-space:nowrap">${esc(k)}</td><td style="border:1px solid #dce8e6">${esc(v)}</td></tr>`).join("\n")}
</table>
<p style="margin:14px 0 0">Next step: check eligibility and available balance with Medicare, then call the parent to book.</p>
</div>`;

  try {
    const r = await fetch("https://api.smtp2go.com/v3/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Smtp2go-Api-Key": SMTP2GO_API_KEY },
      body: JSON.stringify({
        sender: `Synergy Dental Group <${FROM_ADDRESS}>`,
        to: TO,
        cc: CC,
        subject: `New CDBS eligibility check: ${d.childFirstName} ${d.childLastName}`,
        text_body: text,
        html_body: html,
        custom_headers: [{ header: "Reply-To", value: d.email }],
      }),
    });
    const result = await r.json().catch(() => ({}));
    if (!(r.ok && result && result.data && result.data.succeeded >= 1)) {
      console.error("CDBS SMTP2GO send failed:", r.status); // no form data logged
      return res.status(502).json({ ok: false, error: "Send failed" });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("CDBS SMTP2GO request error:", err && err.message);
    return res.status(500).json({ ok: false, error: "Send failed" });
  }
}
