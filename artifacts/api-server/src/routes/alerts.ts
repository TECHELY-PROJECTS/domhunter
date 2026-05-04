import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, usersTable, domainsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z, ZodError } from "zod";
import { testTelegramConnection, sendTelegramAlert } from "../lib/telegram";
import { runAlerts, matchesFilter } from "../lib/cron";
import type { AlertFilter } from "../lib/cron";

const router: IRouter = Router();

const DEMO_USER_ID = "demo-user-1";

const AlertBody = z.object({
  name: z.string().min(1).max(100),
  telegramChatId: z.string().min(1),
  telegramBotToken: z.string().min(1),
  filter: z.object({
    minScore:        z.number().min(0).max(100).optional(),
    minBrandScore:   z.number().min(0).max(100).optional(),
    minDA:           z.number().min(0).max(100).optional(),
    maxBid:          z.number().min(0).optional(),
    maxDaysToExpiry: z.number().min(0).optional(),
    minDaysToExpiry: z.number().min(0).optional(),
    maxSldLength:    z.number().min(1).optional(),
    watchDomain:     z.string().optional(),
    recommendation:  z.enum(["BUY", "WATCH", "SKIP", "any"]).optional(),
    niche:           z.string().optional(),
    tier:            z.string().optional(),
    tlds:            z.array(z.string()).optional(),
    statusMode:      z.enum(["cheap", "any", "auction", "dropping"]).optional(),
  }).optional().default({}),
});

async function ensureDemoUser() {
  const existing = await db.query.usersTable.findFirst({
    where: eq(usersTable.id, DEMO_USER_ID),
  });
  if (!existing) {
    await db.insert(usersTable).values({
      id: DEMO_USER_ID,
      email: "demo@domhunter.io",
      name: "Demo User",
    });
  }
}

router.get("/alerts", async (req, res) => {
  try {
    await ensureDemoUser();
    const alerts = await db.query.alertsTable.findMany({
      where: eq(alertsTable.userId, DEMO_USER_ID),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });
    res.json(alerts);
  } catch (err) {
    req.log.error({ err }, "Failed to get alerts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/alerts", async (req, res) => {
  try {
    await ensureDemoUser();
    const body = AlertBody.parse(req.body);
    const [alert] = await db
      .insert(alertsTable)
      .values({
        id: randomUUID(),
        userId: DEMO_USER_ID,
        name: body.name,
        telegramChatId: body.telegramChatId,
        telegramBotToken: body.telegramBotToken,
        filterJson: JSON.stringify(body.filter ?? {}),
        active: true,
      })
      .returning();
    res.status(201).json(alert);
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({ error: "Validation failed", issues: err.issues });
    }
    req.log.error({ err }, "Failed to create alert");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/alerts/test-telegram", async (req, res) => {
  try {
    const { botToken, chatId } = z.object({
      botToken: z.string().min(1),
      chatId: z.string().min(1),
    }).parse(req.body);

    const result = await testTelegramConnection(botToken, chatId);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to test Telegram");
    res.status(400).json({ ok: false, error: "Invalid request" });
  }
});

// Send digest now for a specific alert using its saved filter
router.post("/alerts/send-now", async (req, res) => {
  try {
    const { alertId } = req.body as { alertId?: string };

    if (alertId) {
      const alert = await db.query.alertsTable.findFirst({
        where: and(eq(alertsTable.id, alertId), eq(alertsTable.userId, DEMO_USER_ID)),
      });
      if (!alert) return res.status(404).json({ error: "Alert not found" });

      let filter: AlertFilter = {};
      try { filter = JSON.parse(alert.filterJson) as AlertFilter; } catch { /* ignore */ }

      // Fetch all domains with metrics, apply the alert's own filter
      const allDomains = await db.query.domainsTable.findMany({
        with: { metrics: true },
      });

      const matched = allDomains.filter((d) =>
        matchesFilter(
          { name: d.name, sld: d.sld, tld: d.tld, status: d.status ?? "", currentBid: d.currentBid },
          d.metrics,
          filter,
        )
      );

      if (matched.length === 0) {
        return res.json({ ok: true, sent: 0, message: "No domains matched this alert's filters" });
      }

      const sorted = [...matched].sort((a, b) => {
        if (filter.recommendation === "BUY") {
          return (b.metrics?.brandScore ?? 0) - (a.metrics?.brandScore ?? 0);
        }
        return (b.metrics?.rarityScore ?? 0) - (a.metrics?.rarityScore ?? 0);
      });

      const top12 = sorted.slice(0, 12).map((d) => ({
        name: d.name,
        tld: d.tld,
        status: d.status,
        auctionEndAt: d.auctionEndAt,
        currentBid: d.currentBid,
        metrics: d.metrics ? {
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
        } : null,
      }));

      const sent = await sendTelegramAlert({
        botToken: alert.telegramBotToken,
        chatId: alert.telegramChatId,
        alertName: alert.name,
        domains: top12,
      });

      if (sent) {
        await db.update(alertsTable)
          .set({ lastSentAt: new Date(), updatedAt: new Date() })
          .where(eq(alertsTable.id, alert.id));
      }

      return res.json({ ok: sent, sent: top12.length });
    }

    // No alertId → run full scheduled digest
    await runAlerts();
    res.json({ ok: true, message: "Digest triggered for all active alerts" });
  } catch (err) {
    req.log.error({ err }, "Failed to send alert now");
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a domain-specific drop watch — reuses bot config from an existing active alert
router.post("/alerts/watch-domain", async (req, res) => {
  try {
    const { domainName } = z.object({ domainName: z.string().min(1) }).parse(req.body);

    // Check if a watch already exists for this domain
    const existing = await db.query.alertsTable.findFirst({
      where: and(
        eq(alertsTable.userId, DEMO_USER_ID),
        eq(alertsTable.name, `🔔 ${domainName} drops`),
      ),
    });
    if (existing) {
      return res.status(200).json({ ok: true, message: "Already watching", alert: existing });
    }

    // Reuse bot token / chat ID from first active alert
    const source = await db.query.alertsTable.findFirst({
      where: and(eq(alertsTable.userId, DEMO_USER_ID), eq(alertsTable.active, true)),
    });
    if (!source) {
      return res.status(400).json({ error: "No active Telegram alert found. Set one up in Alerts first." });
    }

    const [alert] = await db
      .insert(alertsTable)
      .values({
        id: randomUUID(),
        userId: DEMO_USER_ID,
        name: `🔔 ${domainName} drops`,
        telegramChatId: source.telegramChatId,
        telegramBotToken: source.telegramBotToken,
        filterJson: JSON.stringify({ watchDomain: domainName, statusMode: "cheap", maxBid: 20 }),
        active: true,
      })
      .returning();

    res.status(201).json({ ok: true, alert });
  } catch (err) {
    req.log.error({ err }, "Failed to create domain watch alert");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/alerts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const [updated] = await db
      .update(alertsTable)
      .set({ active, updatedAt: new Date() })
      .where(and(eq(alertsTable.id, id), eq(alertsTable.userId, DEMO_USER_ID)))
      .returning();
    if (!updated) return res.status(404).json({ error: "Alert not found" });
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "Failed to update alert");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/alerts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const [deleted] = await db
      .delete(alertsTable)
      .where(and(eq(alertsTable.id, id), eq(alertsTable.userId, DEMO_USER_ID)))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Alert not found" });
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete alert");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
