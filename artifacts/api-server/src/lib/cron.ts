import { logger } from "./logger";
import { db } from "@workspace/db";
import { alertsTable, domainsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendTelegramAlert } from "./telegram";
import type { DomainAlert } from "./telegram";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

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

interface AlertFilter {
  minScore?: number;
  minBrandScore?: number;
  minDA?: number;
  recommendation?: string;
  niche?: string;
  tier?: string;
  tlds?: string[];
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

    // Pull last 24h of domains with full metrics
    const since = new Date(Date.now() - SIX_HOURS_MS * 4);

    let totalSent = 0;

    for (const alert of alerts) {
      let filter: AlertFilter = {};
      try {
        filter = JSON.parse(alert.filterJson) as AlertFilter;
      } catch {
        // ignore malformed
      }

      const domainRows = await db.query.domainsTable.findMany({
        where: (t, { gte }) => gte(t.createdAt, since),
        with: { metrics: true },
      });

      const matched = domainRows.filter((d) => {
        const m = d.metrics;
        if (!m) return false;
        if (filter.minScore      != null && (m.rarityScore      ?? 0) < filter.minScore)      return false;
        if (filter.minBrandScore != null && (m.brandScore       ?? 0) < filter.minBrandScore) return false;
        if (filter.minDA         != null && (m.domainAuthority  ?? 0) < filter.minDA)         return false;
        if (filter.recommendation && filter.recommendation !== "any" && m.recommendation !== filter.recommendation) return false;
        if (filter.niche         && filter.niche !== "any"  && m.niche      !== filter.niche)        return false;
        if (filter.tier          && filter.tier  !== "any"  && m.rarityTier !== filter.tier)         return false;
        if (filter.tlds && filter.tlds.length > 0 && !filter.tlds.includes(d.tld)) return false;
        return true;
      });

      if (matched.length === 0) continue;

      // Sort: BUY-only alerts → brand score desc; otherwise rarity desc
      const sorted = matched.sort((a, b) => {
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

// Exported for on-demand use (e.g. POST /api/alerts/send-now)
export { runAlerts };
