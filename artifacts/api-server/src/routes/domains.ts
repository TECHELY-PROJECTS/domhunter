import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { domainsTable, metricsTable, watchlistTable } from "@workspace/db";
import { eq, sql, desc, asc, and, gte, lte, ilike, inArray } from "drizzle-orm";
import { rdapLookup } from "../lib/enrichment/rdap";
import { rdapToStatus } from "../lib/jobs/enrich-worker";
import {
  ListDomainsQueryParams,
  GetDomainParams,
  GetRecentDomainsQueryParams,
  GetTopScoringDomainsQueryParams,
  GetExpiringSoonDomainsQueryParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/domains/stats", async (req, res) => {
  try {
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(domainsTable);

    const [auctionResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(domainsTable)
      .where(eq(domainsTable.status, "AUCTION"));

    const [availableResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(domainsTable)
      .where(eq(domainsTable.status, "AVAILABLE"));

    const [avgResult] = await db
      .select({ avg: sql<number>`coalesce(avg(rarity_score), 0)` })
      .from(metricsTable);

    const [legendaryResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metricsTable)
      .where(eq(metricsTable.rarityTier, "legendary"));

    const [epicResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metricsTable)
      .where(eq(metricsTable.rarityTier, "epic"));

    const [rareResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(metricsTable)
      .where(eq(metricsTable.rarityTier, "rare"));

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [newTodayResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(domainsTable)
      .where(gte(domainsTable.createdAt, yesterday));

    res.json({
      totalDomains: totalResult.count,
      totalAuctions: auctionResult.count,
      totalAvailable: availableResult.count,
      avgRarityScore: Math.round(avgResult.avg * 10) / 10,
      legendaryCount: legendaryResult.count,
      epicCount: epicResult.count,
      rareCount: rareResult.count,
      newToday: newTodayResult.count,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to get domain stats");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/domains/recent", async (req, res) => {
  try {
    const query = GetRecentDomainsQueryParams.parse(req.query);
    const limit = query.limit ?? 10;

    const domains = await db.query.domainsTable.findMany({
      with: { metrics: true },
      orderBy: [desc(domainsTable.createdAt)],
      limit,
    });

    res.json(domains);
  } catch (err) {
    req.log.error({ err }, "Failed to get recent domains");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/domains/top-scoring", async (req, res) => {
  try {
    const query = GetTopScoringDomainsQueryParams.parse(req.query);
    const limit = query.limit ?? 10;

    const rows = await db
      .select({
        id: domainsTable.id,
        name: domainsTable.name,
        sld: domainsTable.sld,
        tld: domainsTable.tld,
        status: domainsTable.status,
        source: domainsTable.source,
        auctionUrl: domainsTable.auctionUrl,
        auctionEndAt: domainsTable.auctionEndAt,
        currentBid: domainsTable.currentBid,
        bidCount: domainsTable.bidCount,
        createdAt: domainsTable.createdAt,
        updatedAt: domainsTable.updatedAt,
        metrics: metricsTable,
      })
      .from(domainsTable)
      .leftJoin(metricsTable, eq(domainsTable.id, metricsTable.domainId))
      .orderBy(desc(metricsTable.rarityScore))
      .limit(limit);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Failed to get top scoring domains");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/domains/expiring-soon", async (req, res) => {
  try {
    const query = GetExpiringSoonDomainsQueryParams.parse(req.query);
    const limit = query.limit ?? 10;
    const now = new Date();
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const domains = await db.query.domainsTable.findMany({
      with: { metrics: true },
      where: and(
        gte(domainsTable.auctionEndAt, now),
        lte(domainsTable.auctionEndAt, soon),
      ),
      orderBy: [asc(domainsTable.auctionEndAt)],
      limit,
    });

    res.json(domains);
  } catch (err) {
    req.log.error({ err }, "Failed to get expiring soon domains");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/domains/:fqdn", async (req, res) => {
  try {
    const { fqdn } = GetDomainParams.parse(req.params);

    const domain = await db.query.domainsTable.findFirst({
      with: { metrics: true },
      where: eq(domainsTable.name, fqdn),
    });

    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    const [watchCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(watchlistTable)
      .where(eq(watchlistTable.domainId, domain.id));

    res.json({ ...domain, watchedByCount: watchCount.count });
  } catch (err) {
    req.log.error({ err }, "Failed to get domain");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/domains", async (req, res) => {
  try {
    const params = ListDomainsQueryParams.parse(req.query);
    const page = params.page ?? 1;
    const limit = params.limit ?? 25;
    const offset = (page - 1) * limit;

    const conditions: ReturnType<typeof eq>[] = [];

    if (params.search) {
      conditions.push(ilike(domainsTable.name, `%${params.search}%`) as ReturnType<typeof eq>);
    }
    if (params.tld) {
      conditions.push(eq(domainsTable.tld, params.tld) as ReturnType<typeof eq>);
    }
    if (params.status) {
      conditions.push(eq(domainsTable.status, params.status as "EXPIRING" | "EXPIRED" | "AVAILABLE" | "TAKEN" | "AUCTION" | "UNKNOWN") as ReturnType<typeof eq>);
    }
    if (params.source) {
      conditions.push(eq(domainsTable.source, params.source) as ReturnType<typeof eq>);
    }
    if (params.recommendation) {
      conditions.push(eq(metricsTable.recommendation, params.recommendation) as ReturnType<typeof eq>);
    }
    if (params.niche) {
      conditions.push(eq(metricsTable.niche, params.niche) as ReturnType<typeof eq>);
    }
    if (params.minScore != null) {
      conditions.push(gte(metricsTable.rarityScore, params.minScore) as ReturnType<typeof eq>);
    }
    if (params.maxScore != null) {
      conditions.push(lte(metricsTable.rarityScore, params.maxScore) as ReturnType<typeof eq>);
    }
    if (params.minDA != null) {
      conditions.push(gte(metricsTable.domainAuthority, params.minDA) as ReturnType<typeof eq>);
    }
    if (params.minBrandScore != null) {
      conditions.push(gte(metricsTable.brandScore, params.minBrandScore) as ReturnType<typeof eq>);
    }
    if (params.minAge != null) {
      conditions.push(gte(metricsTable.domainAge, params.minAge) as ReturnType<typeof eq>);
    }
    if (params.minBacklinks != null) {
      conditions.push(gte(metricsTable.backlinks, params.minBacklinks) as ReturnType<typeof eq>);
    }
    if (params.tier) {
      conditions.push(eq(metricsTable.rarityTier, params.tier) as ReturnType<typeof eq>);
    }
    if (params.tlds) {
      const tldList = params.tlds.split(",").map((t: string) => t.trim()).filter(Boolean);
      if (tldList.length > 0) {
        conditions.push(inArray(domainsTable.tld, tldList) as ReturnType<typeof eq>);
      }
    }

    // Always exclude domains whose SLD contains digits or hyphens
    conditions.push(sql`${domainsTable.sld} !~ '[0-9\\-]'` as ReturnType<typeof eq>);

    const sortMap: Record<string, unknown> = {
      rarityScore: metricsTable.rarityScore,
      brandScore: metricsTable.brandScore,
      estimatedValue: metricsTable.estimatedValue,
      domainAuthority: metricsTable.domainAuthority,
      backlinks: metricsTable.backlinks,
      domainAge: metricsTable.domainAge,
      createdAt: domainsTable.createdAt,
      auctionEndAt: domainsTable.auctionEndAt,
      currentBid: domainsTable.currentBid,
    };

    const orderFn = params.sortDir === "asc" ? asc : desc;

    // sldLength is a computed expression, handle separately
    const sortByLength = params.sortBy === "sldLength";
    const lengthExpr = sql<number>`length(${domainsTable.sld})`;
    const sortCol = sortByLength
      ? lengthExpr
      : (sortMap[params.sortBy ?? "rarityScore"] ?? metricsTable.rarityScore);

    const whereClause = and(...conditions);

    const baseQuery = db
      .select({
        id: domainsTable.id,
        name: domainsTable.name,
        sld: domainsTable.sld,
        tld: domainsTable.tld,
        status: domainsTable.status,
        source: domainsTable.source,
        auctionUrl: domainsTable.auctionUrl,
        auctionEndAt: domainsTable.auctionEndAt,
        currentBid: domainsTable.currentBid,
        bidCount: domainsTable.bidCount,
        createdAt: domainsTable.createdAt,
        updatedAt: domainsTable.updatedAt,
        metrics: metricsTable,
      })
      .from(domainsTable)
      .leftJoin(metricsTable, eq(domainsTable.id, metricsTable.domainId))
      .$dynamic();

    const countQuery = db
      .select({ total: sql<number>`count(*)::int` })
      .from(domainsTable)
      .leftJoin(metricsTable, eq(domainsTable.id, metricsTable.domainId))
      .$dynamic();

    const [domains, [{ total }]] = await Promise.all([
      baseQuery.where(whereClause).orderBy(orderFn(sortCol as Parameters<typeof desc>[0])).limit(limit).offset(offset),
      countQuery.where(whereClause),
    ]);

    res.json({
      domains,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to list domains");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/domains/verify-status
 * Runs RDAP on every domain and corrects status + stores real expiry dates.
 * Runs in background — responds immediately with job count.
 */
router.post("/domains/verify-status", async (req, res) => {
  try {
    const domains = await db.query.domainsTable.findMany({
      with: { metrics: true },
    });

    res.json({ ok: true, queued: domains.length, message: "RDAP verification running in background" });

    // Run async — don't await
    (async () => {
      let corrected = 0;
      let expiryStored = 0;

      for (const d of domains) {
        try {
          const rdap = await rdapLookup(d.name);

          // Update domain status
          const newStatus = rdapToStatus(rdap, d.status);
          if (newStatus && newStatus !== d.status) {
            await db
              .update(domainsTable)
              .set({ status: newStatus, updatedAt: new Date() })
              .where(eq(domainsTable.id, d.id));
            corrected++;
          }

          // Store real expiry + creation dates into metrics
          if (rdap.expiresDate || rdap.createdDate) {
            const ageYears = rdap.createdDate
              ? Math.round((Date.now() - rdap.createdDate.getTime()) / (365.25 * 24 * 3600 * 1000))
              : undefined;

            if (d.metrics) {
              await db
                .update(metricsTable)
                .set({
                  expiresDate: rdap.expiresDate ?? d.metrics.expiresDate,
                  createdDate: rdap.createdDate ?? d.metrics.createdDate,
                  domainAge:   ageYears ?? d.metrics.domainAge,
                  registrar:   rdap.registrar ?? d.metrics.registrar,
                  updatedAt:   new Date(),
                })
                .where(eq(metricsTable.domainId, d.id));
            }
            expiryStored++;
          }

          // Rate-limit: 3 RDAP lookups per second
          await new Promise((r) => setTimeout(r, 350));
        } catch {
          // continue on per-domain errors
        }
      }

      logger.info({ total: domains.length, corrected, expiryStored }, "RDAP bulk verification complete");
    })().catch((err) => logger.error({ err }, "RDAP bulk verification failed"));
  } catch (err) {
    req.log.error({ err }, "Failed to start RDAP verification");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
