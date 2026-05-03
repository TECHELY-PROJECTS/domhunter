import { logger } from "./logger";

const APP_URL = process.env.APP_URL ?? "https://domhunter.techely.com";

function formatValue(v?: number | null) {
  if (!v) return "—";
  return v >= 1000 ? `$${(v / 1000).toFixed(1)}K` : `$${v}`;
}

function recEmoji(rec?: string | null) {
  if (rec === "BUY") return "🟢";
  if (rec === "WATCH") return "🟡";
  return "⚪";
}

export async function sendTelegramAlert(opts: {
  botToken: string;
  chatId: string;
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
  const { botToken, chatId, alertName, domains } = opts;

  const lines = domains.slice(0, 15).map((d) => {
    const score = d.metrics?.rarityScore != null ? Math.round(d.metrics.rarityScore) : "—";
    const val = formatValue(d.metrics?.estimatedValue);
    const rec = recEmoji(d.metrics?.recommendation);
    const niche = d.metrics?.niche ? ` · ${d.metrics.niche}` : "";
    const url = `${APP_URL}/domain/${d.name}`;
    return `${rec} <a href="${url}"><b>${d.name}</b></a>  score ${score} · ${val}${niche}`;
  });

  const header = [
    `🎯 <b>DomHunter Alert</b>: ${alertName}`,
    `${domains.length} new domain${domains.length !== 1 ? "s" : ""} matched your filter\n`,
  ].join("\n");

  const footer = `\n<a href="${APP_URL}/explore">Browse all →</a>  ·  <a href="${APP_URL}/alerts">Manage alerts</a>`;

  const text = header + lines.join("\n") + footer;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body, chatId }, "Telegram API error");
      return false;
    }

    logger.info({ chatId, alertName, count: domains.length }, "Telegram alert sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram alert");
    return false;
  }
}

export async function testTelegramConnection(botToken: string, chatId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ <b>DomHunter</b> — Telegram alerts connected successfully!",
          parse_mode: "HTML",
        }),
      },
    );

    if (!res.ok) {
      const body = await res.json() as { description?: string };
      return { ok: false, error: body?.description ?? "Telegram API error" };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
