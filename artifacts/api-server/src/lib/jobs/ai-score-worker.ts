import { Worker } from "bullmq";
import { getRedisConnection } from "./queue";
import { aiScoreBatch } from "../ai/client";
import { db, domainsTable, metricsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../logger";

export function startAIScoreWorker(): Worker | null {
  const conn = getRedisConnection();
  if (!conn) return null;

  const worker = new Worker(
    "domain-ai-score",
    async (job) => {
      const { batch } = job.data as {
        batch: Array<{ name: string; age?: number; backlinks?: number; da?: number }>;
      };

      logger.info({ count: batch.length }, "AI scoring batch");
      const results = await aiScoreBatch(batch);

      for (const [domainName, valuation] of results) {
        const domain = await db.query.domainsTable.findFirst({
          where: eq(domainsTable.name, domainName),
        });
        if (!domain) continue;

        await db
          .update(metricsTable)
          .set({
            brandScore: valuation.brandScore,
            estimatedValue: valuation.estimatedValue,
            niche: valuation.niche,
            recommendation: valuation.recommendation,
            aiReason: valuation.reason,
            aiScoredAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(metricsTable.domainId, domain.id));
      }

      const scores = Array.from(results.values());
      const buyCount = scores.filter((v) => v.recommendation === "BUY").length;
      const watchCount = scores.filter((v) => v.recommendation === "WATCH").length;
      const skipCount = scores.filter((v) => v.recommendation === "SKIP").length;
      const avgBrand = scores.length
        ? Math.round(scores.reduce((s, v) => s + v.brandScore, 0) / scores.length)
        : 0;

      logger.info({ scored: scores.length, buyCount, watchCount, skipCount, avgBrand }, "AI scoring batch complete");
    },
    { connection: conn, concurrency: 3 },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "AI score job failed");
  });

  logger.info("AI score worker started (concurrency=3)");
  return worker;
}
