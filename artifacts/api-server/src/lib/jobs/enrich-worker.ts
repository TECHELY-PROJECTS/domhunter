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

      if (existing) {
        await db
          .update(metricsTable)
          .set({
            domainAuthority: da ?? existing.domainAuthority,
            backlinks: bl?.totalLinks ?? existing.backlinks,
            referringDomains: bl?.referringDomains ?? existing.referringDomains,
            domainAge: rdap?.ageYears ?? existing.domainAge,
            registrar: rdap?.registrar ?? existing.registrar,
            rarityScore: breakdown.total,
            rarityTier: tier,
            lengthScore: breakdown.length,
            tldScore: tldScore(dbDomain.tld),
            pronounceScore: breakdown.pronounceability,
            keywordScore: breakdown.keywordValue,
            enrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(metricsTable.domainId, dbDomain.id));
      } else {
        await db.insert(metricsTable).values({
          id: randomUUID(),
          domainId: dbDomain.id,
          domainAuthority: da ?? null,
          backlinks: bl?.totalLinks ?? null,
          referringDomains: bl?.referringDomains ?? null,
          domainAge: rdap?.ageYears ?? null,
          registrar: rdap?.registrar ?? null,
          lengthScore: breakdown.length,
          tldScore: tldScore(dbDomain.tld),
          pronounceScore: breakdown.pronounceability,
          keywordScore: breakdown.keywordValue,
          rarityScore: breakdown.total,
          rarityTier: tier,
          brandScore: null,
          estimatedValue: Math.round(breakdown.total * 120),
          niche: null,
          recommendation: breakdown.total >= 70 ? "BUY" : breakdown.total >= 50 ? "WATCH" : "SKIP",
          aiReason: null,
          enrichedAt: new Date(),
          updatedAt: new Date(),
        });
      }

      if (breakdown.total >= 40 && aiScoreQueue) {
        await aiScoreQueue.add(
          "score-batch-item",
          { batch: [{ name: domain, age: rdap?.ageYears, backlinks: bl?.totalLinks, da }] },
          { attempts: 2, backoff: { type: "fixed" as const, delay: 10000 } },
        );
      }

      logger.info({ domain, rarityScore: breakdown.total, tier }, "Enrichment complete");
    },
    { connection: conn, concurrency: 10 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, domain: job?.data?.domain, err }, "Enrich job failed");
  });

  logger.info("Enrich worker started (concurrency=10)");
  return worker;
}
