import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { alertsTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { z } from "zod";

const router: IRouter = Router();

const DEMO_USER_ID = "demo-user-1";

const AlertBody = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  filter: z.object({
    minScore: z.number().min(0).max(100).optional(),
    recommendation: z.enum(["BUY", "WATCH", "SKIP"]).optional(),
    niche: z.string().optional(),
    tier: z.string().optional(),
    tlds: z.array(z.string()).optional(),
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
        email: body.email,
        filterJson: JSON.stringify(body.filter ?? {}),
        active: true,
      })
      .returning();
    res.status(201).json(alert);
  } catch (err) {
    req.log.error({ err }, "Failed to create alert");
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
