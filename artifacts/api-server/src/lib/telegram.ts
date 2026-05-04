import { logger } from "./logger";

const APP_URL = process.env.APP_URL ?? "https://domhunter.techely.com";

function fmt(v?: number | null): string {
  if (v == null || v === 0) return "—";
  if (v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
  return `$${v}`;
}

function signal(rec?: string | null): string {
  if (rec === "BUY")   return "🟢";
  if (rec === "WATCH") return "🟡";
  return "⚪";
}

function tierBadge(tier?: string | null): string {
  if (tier === "legendary") return "🔥 Legendary";
  if (tier === "epic")      return "💎 Epic";
  if (tier === "rare")      return "⭐ Rare";
  if (tier === "uncommon")  return "✓ Uncommon";
  return "";
}

/**
 * Describe exactly how + how much it costs to acquire this domain.
 * This is the most important line — must be accurate.
 */
function acquisitionLine(
  status?: string | null,
  bid?: number | null,
  auctionEndAt?: Date | string | null,
  expiresDate?: Date | string | null,
): string {
  const s = (status ?? "").toUpperCase();

  if (s === "EXPIRED") {
    return "✅ Dropped — register at standard price (~$12/yr)";
  }

  if (s === "EXPIRING") {
    if (expiresDate) {
      const daysLeft = Math.round((new Date(expiresDate).getTime() - Date.now()) / 86_400_000);
      if (daysLeft <= 0)  return "✅ Just dropped — register at standard price (~$12/yr)";
      if (daysLeft <= 7)  return `⚠️ Drops in ${daysLeft}d — backorder NOW before it's gone`;
      if (daysLeft <= 30) return `⏳ Drops in ${daysLeft}d — backorder to catch the drop`;
      return `📅 Expires in ${daysLeft}d — monitor, don't buy yet`;
    }
    return "⏳ Expiring soon — backorder recommended";
  }

  if (s === "AVAILABLE") {
    return "✅ Available — register at standard price (~$12/yr)";
  }

  if (s === "AUCTION") {
    const bidStr = bid != null ? ` · Current bid: ${fmt(bid)}` : "";
    if (auctionEndAt) {
      const daysLeft = Math.round((new Date(auctionEndAt).getTime() - Date.now()) / 86_400_000);
      const label = daysLeft <= 0 ? "ended" : daysLeft === 1 ? "1d left" : `${daysLeft}d left`;
      return `🔨 Auction ${label}${bidStr}`;
    }
    return `🔨 At auction${bidStr}`;
  }

  return "";
}

export interface DomainAlert {
  name: string;
  tld?: string | null;
  status?: string | null;
  auctionEndAt?: Date | string | null;
  currentBid?: number | null;
  metrics?: {
    rarityScore?: number | null;
    brandScore?: number | null;
    estimatedValue?: number | null;
    recommendation?: string | null;
    niche?: string | null;
    rarityTier?: string | null;
    domainAuthority?: number | null;
    backlinks?: number | null;
    domainAge?: number | null;
    expiresDate?: Date | string | null;
    aiReason?: string | null;
  } | null;
}

export async function sendTelegramAlert(opts: {
  botToken: string;
  chatId: string;
  alertName: string;
  domains: DomainAlert[];
}): Promise<boolean> {
  const { botToken, chatId, alertName, domains } = opts;

  const lines: string[] = [];

  for (const d of domains.slice(0, 12)) {
    const m = d.metrics;
    const url = `${APP_URL}/domain/${d.name}`;

    const sig     = signal(m?.recommendation);
    const tier    = tierBadge(m?.rarityTier);
    const brand   = m?.brandScore  != null ? `Brand <b>${Math.round(m.brandScore)}</b>` : null;
    const rarity  = m?.rarityScore != null ? `Rarity ${Math.round(m.rarityScore)}` : null;
    const value   = m?.estimatedValue ? `💰 ${fmt(m.estimatedValue)}` : null;
    const niche   = m?.niche ? m.niche.charAt(0).toUpperCase() + m.niche.slice(1) : null;
    const da      = m?.domainAuthority ? `DA ${Math.round(m.domainAuthority)}` : null;
    const age     = m?.domainAge ? `${m.domainAge}yr old` : null;
    const bl      = m?.backlinks
      ? `${m.backlinks >= 1000 ? (m.backlinks / 1000).toFixed(1) + "K" : m.backlinks} links`
      : null;
    const acq     = acquisitionLine(d.status, d.currentBid, d.auctionEndAt, m?.expiresDate);
    const reason  = m?.aiReason ? `<i>${m.aiReason}</i>` : null;

    const scoreParts = [brand, rarity, value, niche].filter(Boolean).join(" · ");
    const metaParts  = [da, age, bl].filter(Boolean).join(" · ");

    lines.push(`${sig} <a href="${url}"><b>${d.name}</b></a>  ${tier}`);
    if (scoreParts) lines.push(`   ${scoreParts}`);
    if (acq)        lines.push(`   ${acq}`);
    if (metaParts)  lines.push(`   ${metaParts}`);
    if (reason)     lines.push(`   ${reason}`);
    lines.push("");
  }

  const count = domains.length;
  const header = `🎯 <b>DomHunter</b> — ${alertName}\n<b>${count}</b> domain${count !== 1 ? "s" : ""} matched your filter\n\n`;
  const footer = `<a href="${APP_URL}/explore">Browse all →</a>  ·  <a href="${APP_URL}/alerts">Manage alerts</a>`;
  const text = header + lines.join("\n") + footer;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error({ status: res.status, body, chatId }, "Telegram API error");
      return false;
    }

    logger.info({ chatId, alertName, count }, "Telegram alert sent");
    return true;
  } catch (err) {
    logger.error({ err }, "Failed to send Telegram alert");
    return false;
  }
}

export async function testTelegramConnection(
  botToken: string,
  chatId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: [
          "✅ <b>DomHunter</b> — Connection confirmed!",
          "",
          "You'll receive daily digests of <b>expired &amp; hand-registerable</b> domains here.",
          `📊 Dashboard: <a href="${APP_URL}/explore">${APP_URL}/explore</a>`,
        ].join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { description?: string };
      return { ok: false, error: body?.description ?? "Telegram API error" };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
