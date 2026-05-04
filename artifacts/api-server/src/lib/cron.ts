import { logger } from "./logger";
import { db } from "@workspace/db";
import { alertsTable, domainsTable, metricsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { sendTelegramAlert } from "./telegram";
import type { DomainAlert } from "./telegram";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

// Statuses that mean a domain can be hand-registered at normal cost
const CHEAP_STATUSES = new Set(["EXPIRED", "AVAILABLE", "EXPIRING", "PENDING_DELETE", "REDEMPTION"]);

let lastIngestAt: Date | null = null;
let alertsSentToday: string | null = null;

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

function alertHourUTC(): number {
  return parseInt(process.env.ALERT_HOUR_UTC ?? "8", 10);
}

async function runIngest(): Promise<void> {
  try {
    const port = process.env.PORT ?? "8080";
    const res = await fetch(`http://localhost:${port}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "expired_domains" }),
    });
    const data = (await res.json()) as { ingested?: number };
    logger.info({ ingested: data?.ingested }, "Scheduled ingest complete");
    lastIngestAt = new Date();
  } catch (err) {
    logger.error({ err }, "Scheduled ingest failed");
  }
}

export interface AlertFilter {
  minScore?: number;
  minBrandScore?: number;
  minDA?: number;
  maxBid?: number;
  maxDaysToExpiry?: number;
  minDaysToExpiry?: number;
  maxSldLength?: number;        // max characters in SLD, e.g. 12
  watchDomain?: string;         // watch a specific domain until it drops
  recommendation?: string;
  niche?: string;
  tier?: string;
  tlds?: string[];
  statusMode?: "cheap" | "any" | "auction" | "dropping";
}

export function matchesFilter(
  d: { name?: string; sld?: string; tld: string; status: string; currentBid?: number | null },
  m: {
    rarityScore?: number | null;
    brandScore?: number | null;
    domainAuthority?: number | null;
    recommendation?: string | null;
    niche?: string | null;
    rarityTier?: string | null;
    expiresDate?: Date | string | null;
  } | null,
  filter: AlertFilter,
): boolean {
  if (!m) return false;

  // ── watchDomain: specific domain drop watch ────────────────────────────────
  if (filter.watchDomain) {
    // Only alert when this specific domain becomes cheap (dropped)
    const statusUpper = (d.status ?? "").toUpperCase();
    return d.name === filter.watchDomain && CHEAP_STATUSES.has(statusUpper);
  }

  // ── SLD length guard ───────────────────────────────────────────────────────
  if (filter.maxSldLength != null) {
    const sldLen = (d.sld ?? d.name?.split(".")[0] ?? "").length;
    if (sldLen > filter.maxSldLength) return false;
  }

  const mode = filter.statusMode ?? "cheap";
  const statusUpper = (d.status ?? "").toUpperCase();

  if (mode === "cheap") {
    if (!CHEAP_STATUSES.has(statusUpper)) return false;
  } else if (mode === "auction") {
    if (statusUpper !== "AUCTION") return false;
  } else if (mode === "dropping") {
    if (statusUpper !== "EXPIRING") return false;
    const expiresDate = m.expiresDate ? new Date(m.expiresDate) : null;
    if (!expiresDate) return false;
    const daysLeft = (expiresDate.getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 0) return false;
    const maxDays = filter.maxDaysToExpiry ?? 3;
    const minDays = filter.minDaysToExpiry ?? 0;
    if (daysLeft > maxDays || daysLeft < minDays) return false;
  }

  const maxBid = filter.maxBid ?? (mode === "cheap" || mode === "dropping" ? 20 : undefined);
  if (maxBid != null && d.currentBid != null && d.currentBid > maxBid) return false;

  if (filter.minScore      != null && (m.rarityScore     ?? 0) < filter.minScore)      return false;
  if (filter.minBrandScore != null && (m.brandScore      ?? 0) < filter.minBrandScore) return false;
  if (filter.minDA         != null && (m.domainAuthority ?? 0) < filter.minDA)         return false;
  if (filter.recommendation && filter.recommendation !== "any" && m.recommendation !== filter.recommendation) return false;
  if (filter.niche          && filter.niche !== "any"          && m.niche          !== filter.niche)          return false;
  if (filter.tier           && filter.tier  !== "any"          && m.rarityTier     !== filter.tier)           return false;
  if (filter.tlds && filter.tlds.length > 0 && !filter.tlds.includes(d.tld)) return false;

  return true;
}

async function runAlerts(): Promise<void> {
  const today = todayUTC();
  if (alertsSentToday === today) return;
  alertsSentToday = today;

  try {
    const alerts = await db.query.alertsTable.findMany({
      where: eq(alertsTable.active, true),
    });

    if (alerts.length === 0) return;

    // Pull last 24h of domains with full metrics (including expiry dates)
    const since = new Date(Date.now() - SIX_HOURS_MS * 4);

    let totalSent = 0;

    for (const alert of alerts) {
      let filter: AlertFilter = {};
      try {
        filter = JSON.parse(alert.filterJson) as AlertFilter;
      } catch { /* ignore */ }

      const domainRows = await db.query.domainsTable.findMany({
        where: (t, { gte }) => gte(t.createdAt, since),
        with: { metrics: true },
      });

      const matched = domainRows.filter((d) =>
        matchesFilter(
          { name: d.name, sld: d.sld, tld: d.tld, status: d.status ?? "", currentBid: d.currentBid },
          d.metrics ?? null,
          filter,
        )
      );

      if (matched.length === 0) continue;

      const sorted = [...matched].sort((a, b) => {
        // "dropping" alerts → sort by soonest expiry first
        if (filter.statusMode === "dropping") {
          const aExp = a.metrics?.expiresDate ? new Date(a.metrics.expiresDate).getTime() : Infinity;
          const bExp = b.metrics?.expiresDate ? new Date(b.metrics.expiresDate).getTime() : Infinity;
          return aExp - bExp;
        }
        if (filter.recommendation === "BUY") {
          return (b.metrics?.brandScore ?? 0) - (a.metrics?.brandScore ?? 0);
        }
        return (b.metrics?.rarityScore ?? 0) - (a.metrics?.rarityScore ?? 0);
      });

      const top12: DomainAlert[] = sorted.slice(0, 12).map((d) => ({
        name: d.name,
        tld: d.tld,
        status: d.status,
        auctionEndAt: d.auctionEndAt,
        currentBid: d.currentBid,
        metrics: d.metrics
          ? {
              rarityScore:     d.metrics.rarityScore,
              brandScore:      d.metrics.brandScore,
              estimatedValue:  d.metrics.estimatedValue,
              recommendation:  d.metrics.recommendation,
              niche:           d.metrics.niche,
              rarityTier:      d.metrics.rarityTier,
              domainAuthority: d.metrics.domainAuthority,
              backlinks:       d.metrics.backlinks,
              domainAge:       d.metrics.domainAge,
              expiresDate:     d.metrics.expiresDate,
              aiReason:        d.metrics.aiReason,
            }
          : null,
      }));

      const sent = await sendTelegramAlert({
        botToken: alert.telegramBotToken,
        chatId: alert.telegramChatId,
        alertName: alert.name,
        domains: top12,
      });

      if (sent) {
        await db
          .update(alertsTable)
          .set({ lastSentAt: new Date(), updatedAt: new Date() })
          .where(eq(alertsTable.id, alert.id));
        totalSent++;
      }
    }

    logger.info({ processed: alerts.length, sent: totalSent }, "Daily Telegram alert digest complete");
  } catch (err) {
    logger.error({ err }, "Alert digest failed");
  }
}

export function startCron(): void {
  runIngest().catch(() => {});

  setInterval(() => {
    if (!lastIngestAt || Date.now() - lastIngestAt.getTime() >= SIX_HOURS_MS) {
      runIngest().catch(() => {});
    }

    const now = new Date();
    if (now.getUTCHours() === alertHourUTC() && now.getUTCMinutes() === 0) {
      runAlerts().catch(() => {});
    }
  }, ONE_MIN_MS);

  logger.info(
    { alertHour: alertHourUTC() },
    "Cron scheduler started (ingest every 6h, Telegram alerts daily at configured UTC hour)",
  );
}

export { runAlerts };
