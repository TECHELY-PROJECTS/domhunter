import { logger } from "./logger";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM = process.env.EMAIL_FROM ?? "DomHunter <noreply@domhunter.io>";
const APP_URL = process.env.APP_URL ?? "https://domhunter.io";

function formatValue(v?: number | null) {
  if (!v) return "—";
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v}`;
}

export async function sendAlertEmail(opts: {
  to: string;
  alertName: string;
  domains: Array<{
    name: string;
    metrics?: {
      rarityScore?: number | null;
      estimatedValue?: number | null;
      recommendation?: string | null;
      brandScore?: number | null;
      niche?: string | null;
    } | null;
  }>;
}): Promise<boolean> {
  if (!RESEND_API_KEY) {
    logger.warn("RESEND_API_KEY not set — skipping alert email");
    return false;
  }

  const { to, alertName, domains } = opts;

  const rows = domains
    .map(
      (d) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-family:monospace;font-weight:600;">
          <a href="${APP_URL}/domain/${d.name}" style="color:#f59e0b;text-decoration:none;">${d.name}</a>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;font-weight:bold;">
          ${d.metrics?.rarityScore != null ? Math.round(d.metrics.rarityScore) : "—"}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
          ${formatValue(d.metrics?.estimatedValue)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;">
          <span style="padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;
            background:${d.metrics?.recommendation === "BUY" ? "#14532d" : d.metrics?.recommendation === "WATCH" ? "#713f12" : "#1f2937"};
            color:${d.metrics?.recommendation === "BUY" ? "#86efac" : d.metrics?.recommendation === "WATCH" ? "#fde047" : "#9ca3af"};">
            ${d.metrics?.recommendation ?? "—"}
          </span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;text-align:center;color:#9ca3af;font-size:12px;">
          ${d.metrics?.niche ?? "—"}
        </td>
      </tr>
    `,
    )
    .join("");

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111827;color:#f9fafb;padding:24px;border-radius:12px;">
      <div style="margin-bottom:20px;">
        <span style="color:#f59e0b;font-weight:800;font-size:18px;letter-spacing:0.05em;">DOMHUNTER</span>
      </div>
      <h2 style="color:#f9fafb;margin:0 0 6px;">🎯 New Domain Matches</h2>
      <p style="color:#9ca3af;font-size:14px;margin:0 0 20px;">
        Filter: <strong style="color:#f9fafb;">${alertName}</strong> · ${domains.length} domain${domains.length !== 1 ? "s" : ""} found
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;background:#1f2937;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#374151;color:#9ca3af;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">
            <td style="padding:10px 12px;">Domain</td>
            <td style="padding:10px 12px;text-align:center;">Score</td>
            <td style="padding:10px 12px;text-align:center;">Value</td>
            <td style="padding:10px 12px;text-align:center;">Signal</td>
            <td style="padding:10px 12px;text-align:center;">Niche</td>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:24px;">
        <a href="${APP_URL}/explore"
          style="background:#f59e0b;color:#111827;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:14px;font-weight:700;">
          Browse All Domains →
        </a>
        <a href="${APP_URL}/alerts"
          style="color:#6b7280;font-size:12px;margin-left:16px;text-decoration:none;">
          Manage alerts
        </a>
      </div>
      <p style="color:#4b5563;font-size:11px;margin-top:24px;">DomHunter · AI-powered domain research</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to,
        subject: `🎯 ${domains.length} new domain${domains.length !== 1 ? "s" : ""} match "${alertName}"`,
        html,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, "Resend API error");
      return false;
    }

    logger.info({ to, alertName, count: domains.length }, "Alert email sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send alert email");
    return false;
  }
}
