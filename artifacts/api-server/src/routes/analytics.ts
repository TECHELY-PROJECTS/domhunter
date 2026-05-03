import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { metricsTable, domainsTable } from "@workspace/db";
import { sql, eq, isNotNull, desc } from "drizzle-orm";
import { GetDaVsScoreQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/analytics/score-distribution", async (req, res) => {
  try {
    const tiers = await db
      .select({
        tier: metricsTable.rarityTier,
        count: sql<number>`count(*)::int`,
        avgScore: sql<number>`round(avg(rarity_score)::numeric, 1)`,
      })
      .from(metricsTable)
      .where(isNotNull(metricsTable.rarityTier))
      .groupBy(metricsTable.rarityTier)
      .orderBy(sql`avg(rarity_score) desc`);

    res.json(tiers.map((t) => ({ tier: t.tier ?? "unknown", count: t.count, avgScore: t.avgScore })));
  } catch (err) {
    req.log.error({ err }, "Failed to get score distribution");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/niche-breakdown", async (req, res) => {
  try {
    const niches = await db
      .select({
        niche: metricsTable.niche,
        count: sql<number>`count(*)::int`,
      })
      .from(metricsTable)
      .where(isNotNull(metricsTable.niche))
      .groupBy(metricsTable.niche)
      .orderBy(sql`count(*) desc`);

    res.json(niches.map((n) => ({ niche: n.niche ?? "unknown", count: n.count })));
  } catch (err) {
    req.log.error({ err }, "Failed to get niche breakdown");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/source-breakdown", async (req, res) => {
  try {
    const sources = await db
      .select({
        source: domainsTable.source,
        count: sql<number>`count(*)::int`,
      })
      .from(domainsTable)
      .where(isNotNull(domainsTable.source))
      .groupBy(domainsTable.source)
      .orderBy(sql`count(*) desc`);

    res.json(sources.map((s) => ({ source: s.source ?? "unknown", count: s.count })));
  } catch (err) {
    req.log.error({ err }, "Failed to get source breakdown");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/analytics/da-vs-score", async (req, res) => {
  try {
    const params = GetDaVsScoreQueryParams.parse(req.query);
    const limit = params.limit ?? 200;

    const points = await db
      .select({
        name: domainsTable.name,
        da: metricsTable.domainAuthority,
        rarityScore: metricsTable.rarityScore,
        tier: metricsTable.rarityTier,
      })
      .from(metricsTable)
      .innerJoin(domainsTable, eq(domainsTable.id, metricsTable.domainId))
      .where(isNotNull(metricsTable.domainAuthority))
      .orderBy(desc(metricsTable.rarityScore))
      .limit(limit);

    res.json(
      points.map((p) => ({
        name: p.name,
        da: p.da ?? 0,
        rarityScore: p.rarityScore ?? 0,
        tier: p.tier ?? "common",
      })),
    );
  } catch (err) {
    req.log.error({ err }, "Failed to get DA vs score data");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
