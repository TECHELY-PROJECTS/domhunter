import { logger } from "./logger";
import { db } from "@workspace/db";
import { alertsTable, domainsTable, metricsTable } from "@workspace/db";
import { eq, gte, and, inArray } from "drizzle-orm";
import { sendAlertEmail } from "./email";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

let lastIngestAt: Date | null = null;
let alertsSentToday: string | null = null; // "YYYY-MM-DD"

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
      body: JSON.stringify({ source: "godaddy" }),
    });
    const data = (await res.json()) as { ingested?: number };
    logger.info({ ingested: data?.ingested }, "Scheduled ingest complete");
    lastIngestAt = new Date();
  } catch (err) {
    logger.error({ err }, "Scheduled ingest failed");
  }
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

    const since = new Date(Date.now() - SIX_HOURS_MS * 4); // last 24h

    let totalSent = 0;
    for (const alert of alerts) {
      let filter: {
        minScore?: number;
        recommendation?: string;
        niche?: string;
        tier?: string;
        tlds?: string[];
      } = {};
      try {
        filter = JSON.parse(alert.filterJson);
      } catch {
        // ignore malformed
      }

      // Build domain query conditions
      const domainRows = await db.query.domainsTable.findMany({
        where: (t, { gte: drizzleGte }) => drizzleGte(t.createdAt, since),
        with: { metrics: true },
      });

      const matched = domainRows.filter((d) => {
        const m = d.metrics;
        if (!m) return false;
        if (filter.minScore != null && (m.rarityScore ?? 0) < filter.minScore) return false;
        if (filter.recommendation && m.recommendation !== filter.recommendation) return false;
        if (filter.niche && m.niche !== filter.niche) return false;
        if (filter.tier && m.rarityTier !== filter.tier) return false;
        if (filter.tlds && filter.tlds.length > 0 && !filter.tlds.includes(d.tld)) return false;
        return true;
      });

      if (matched.length === 0) continue;

      // Sort by rarity score desc, cap at 15
      const top15 = matched
        .sort((a, b) => (b.metrics?.rarityScore ?? 0) - (a.metrics?.rarityScore ?? 0))
        .slice(0, 15);

      const sent = await sendAlertEmail({
        to: alert.email,
        alertName: alert.name,
        domains: top15.map((d) => ({
          name: d.name,
          metrics: d.metrics
            ? {
                rarityScore: d.metrics.rarityScore,
                estimatedValue: d.metrics.estimatedValue,
                recommendation: d.metrics.recommendation,
                brandScore: d.metrics.brandScore,
                niche: d.metrics.niche,
              }
            : null,
        })),
      });

      if (sent) {
        await db
          .update(alertsTable)
          .set({ lastSentAt: new Date(), updatedAt: new Date() })
          .where(eq(alertsTable.id, alert.id));
        totalSent++;
      }
    }

    logger.info({ processed: alerts.length, sent: totalSent }, "Daily alert digest complete");
  } catch (err) {
    logger.error({ err }, "Alert digest failed");
  }
}

export function startCron(): void {
  // Run ingest immediately if never run
  runIngest().catch(() => {});

  setInterval(() => {
    // Ingest every 6h
    if (!lastIngestAt || Date.now() - lastIngestAt.getTime() >= SIX_HOURS_MS) {
      runIngest().catch(() => {});
    }

    // Daily alerts at ALERT_HOUR_UTC (default 8:00 UTC)
    const now = new Date();
    if (now.getUTCHours() === alertHourUTC() && now.getUTCMinutes() === 0) {
      runAlerts().catch(() => {});
    }
  }, ONE_MIN_MS);

  logger.info(
    { alertHour: alertHourUTC() },
    "Cron scheduler started (ingest every 6h, alerts daily at configured UTC hour)",
  );
}
