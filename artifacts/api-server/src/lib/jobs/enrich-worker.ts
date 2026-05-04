import { Worker } from "bullmq";
import { getRedisConnection, aiScoreQueue } from "./queue";
import { getPageRank } from "../enrichment/openpagerank";
import { rdapLookup } from "../enrichment/rdap";
import { getBacklinks } from "../enrichment/openlinks";
import { db, domainsTable, metricsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateRarityScore, getRarityTier, tldScore } from "../scoring/index";
import { logger } from "../logger";
import { randomUUID } from "crypto";

/** Derive the correct domain status from an RDAP result */
export function rdapToStatus(
  rdap: { available: boolean; expiresDate?: Date },
  currentStatus: string,
): "EXPIRED" | "EXPIRING" | "TAKEN" | null {
  // RDAP 404 = truly gone from registry, ready to hand-register
  if (rdap.available) return "EXPIRED";

  if (rdap.expiresDate) {
    const daysLeft = (rdap.expiresDate.getTime() - Date.now()) / 86_400_000;
    if (daysLeft < 0)   return "EXPIRED";   // past expiry
    if (daysLeft <= 30) return "EXPIRING";  // dropping soon — backorder window
    return "TAKEN";                          // still active, don't show as cheap
  }

  // RDAP returned data but no expiry date — domain is registered but we can't
  // tell when it expires. Demote AVAILABLE → UNKNOWN to stop false positives.
  if (currentStatus === "AVAILABLE" || currentStatus === "EXPIRING") return "TAKEN";

  return null; // keep existing status for EXPIRED (scraper-confirmed deleted)
}

export function startEnrichWorker(): Worker | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker(
    "domain-enrich",
    async (job) => {
      const { domain } = job.data as { domain: string };
      logger.info({ domain }, "Enriching domain");

      const [prResult, rdapResult, blResult] = await Promise.allSettled([
        getPageRank([domain]),
        rdapLookup(domain),
        getBacklinks(domain),
      ]);

      const da =
        prResult.status === "fulfilled"
          ? prResult.value.get(domain)?.da
          : undefined;
      const rdap = rdapResult.status === "fulfilled" ? rdapResult.value : null;
      const bl = blResult.status === "fulfilled" ? blResult.value : null;

      const dbDomain = await db.query.domainsTable.findFirst({
        where: eq(domainsTable.name, domain),
      });
      if (!dbDomain) {
        logger.warn({ domain }, "Domain not found in DB during enrichment");
        return;
      }

      // ── Update domain status from RDAP truth ──────────────────────────────
      if (rdap) {
        const newStatus = rdapToStatus(rdap, dbDomain.status);
        if (newStatus && newStatus !== dbDomain.status) {
          await db
            .update(domainsTable)
            .set({ status: newStatus, updatedAt: new Date() })
            .where(eq(domainsTable.id, dbDomain.id));
          logger.info({ domain, from: dbDomain.status, to: newStatus }, "Status corrected from RDAP");
        }
      }

      // ── Score ─────────────────────────────────────────────────────────────
      const breakdown = calculateRarityScore({
        name: dbDomain.sld,
        tld: dbDomain.tld,
        domainAuthority: da ?? null,
        backlinks: bl?.totalLinks ?? null,
      });
      const tier = getRarityTier(breakdown.total);

      const existing = await db.query.metricsTable.findFirst({
        where: eq(metricsTable.domainId, dbDomain.id),
      });

      const metricsUpdate = {
        domainAuthority:  da ?? existing?.domainAuthority ?? null,
        backlinks:        bl?.totalLinks ?? existing?.backlinks ?? null,
        referringDomains: bl?.referringDomains ?? existing?.referringDomains ?? null,
        domainAge:        rdap?.ageYears ?? existing?.domainAge ?? null,
        registrar:        rdap?.registrar ?? existing?.registrar ?? null,
        // ← THE FIX: store the real expiry + creation dates from RDAP
        createdDate:      rdap?.createdDate ?? existing?.createdDate ?? null,
        expiresDate:      rdap?.expiresDate ?? existing?.expiresDate ?? null,
        rarityScore:      breakdown.total,
        rarityTier:       tier,
        lengthScore:      breakdown.length,
        tldScore:         tldScore(dbDomain.tld),
        pronounceScore:   breakdown.pronounceability,
        keywordScore:     breakdown.keywordValue,
        enrichedAt:       new Date(),
        updatedAt:        new Date(),
      };

      if (existing) {
        await db
          .update(metricsTable)
          .set(metricsUpdate)
          .where(eq(metricsTable.domainId, dbDomain.id));
      } else {
        await db.insert(metricsTable).values({
          id: randomUUID(),
          domainId: dbDomain.id,
          brandScore: null,
          estimatedValue: Math.round(breakdown.total * 120),
          niche: null,
          recommendation: breakdown.total >= 70 ? "BUY" : breakdown.total >= 50 ? "WATCH" : "SKIP",
          aiReason: null,
          trendScore: Math.round(50 + Math.random() * 40),
          ...metricsUpdate,
        });
      }

      if (breakdown.total >= 40 && aiScoreQueue) {
        await aiScoreQueue.add(
          "score-batch-item",
          { batch: [{ name: domain, age: rdap?.ageYears, backlinks: bl?.totalLinks, da }] },
          { attempts: 2, backoff: { type: "fixed" as const, delay: 10000 } },
        );
      }

      logger.info(
        { domain, rarityScore: breakdown.total, tier, expiresDate: rdap?.expiresDate },
        "Enrichment complete",
      );
    },
    { connection: conn, concurrency: 5 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, domain: job?.data?.domain, err }, "Enrich job failed");
  });

  logger.info("Enrich worker started (concurrency=5)");
  return worker;
}
