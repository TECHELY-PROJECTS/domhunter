import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { watchlistTable, domainsTable, metricsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { AddToWatchlistBody, RemoveFromWatchlistParams } from "@workspace/api-zod";
import { randomUUID } from "crypto";

const router: IRouter = Router();

const DEMO_USER_ID = "demo-user-1";

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

router.get("/watchlist", async (req, res) => {
  try {
    await ensureDemoUser();
    const items = await db.query.watchlistTable.findMany({
      where: eq(watchlistTable.userId, DEMO_USER_ID),
      with: {
        domain: {
          with: { metrics: true },
        },
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    const result = items.map((item) => ({
      id: item.id,
      userId: item.userId,
      domainId: item.domainId,
      notes: item.notes,
      createdAt: item.createdAt,
      domain: item.domain,
    }));

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Failed to get watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/watchlist", async (req, res) => {
  try {
    await ensureDemoUser();
    const body = AddToWatchlistBody.parse(req.body);

    const existing = await db.query.watchlistTable.findFirst({
      where: and(
        eq(watchlistTable.userId, DEMO_USER_ID),
        eq(watchlistTable.domainId, body.domainId),
      ),
    });

    if (existing) {
      return res.status(409).json({ error: "Domain already in watchlist" });
    }

    const domain = await db.query.domainsTable.findFirst({
      where: eq(domainsTable.id, body.domainId),
      with: { metrics: true },
    });

    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const [item] = await db
      .insert(watchlistTable)
      .values({
        id: randomUUID(),
        userId: DEMO_USER_ID,
        domainId: body.domainId,
        notes: body.notes ?? null,
      })
      .returning();

    res.status(201).json({
      ...item,
      domain,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to add to watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/watchlist/:domainId", async (req, res) => {
  try {
    const { domainId } = RemoveFromWatchlistParams.parse(req.params);

    const existing = await db.query.watchlistTable.findFirst({
      where: and(
        eq(watchlistTable.userId, DEMO_USER_ID),
        eq(watchlistTable.domainId, domainId),
      ),
    });

    if (!existing) {
      return res.status(404).json({ error: "Domain not found in watchlist" });
    }

    await db
      .delete(watchlistTable)
      .where(
        and(
          eq(watchlistTable.userId, DEMO_USER_ID),
          eq(watchlistTable.domainId, domainId),
        ),
      );

    res.json({ message: "Removed from watchlist" });
  } catch (err) {
    req.log.error({ err }, "Failed to remove from watchlist");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
