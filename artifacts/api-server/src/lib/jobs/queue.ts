import { Queue } from "bullmq";
import IORedis from "ioredis";
import { logger } from "../logger";

let _connection: IORedis | null = null;

function getConnection(): IORedis | null {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) return null;
  if (!_connection) {
    _connection = new IORedis(url, {
      tls: { rejectUnauthorized: false },
      maxRetriesPerRequest: null,
    });
  }
  return _connection;
}

export let enrichQueue: Queue | null = null;
export let aiScoreQueue: Queue | null = null;

export function initQueues(): void {
  const conn = getConnection();
  if (!conn) {
    logger.warn("UPSTASH_REDIS_URL not set — BullMQ job queues disabled. Enrichment will run inline only.");
    return;
  }
  enrichQueue = new Queue("domain-enrich", { connection: conn });
  aiScoreQueue = new Queue("domain-ai-score", { connection: conn });
  logger.info("BullMQ queues initialized (domain-enrich, domain-ai-score)");
}

export function getRedisConnection(): IORedis | null {
  return getConnection();
}

export async function queueDomainEnrichment(domains: string[]): Promise<void> {
  if (!enrichQueue || domains.length === 0) return;
  const jobs = domains.map((domain) => ({
    name: "enrich",
    data: { domain },
    opts: {
      attempts: 3,
      backoff: { type: "exponential" as const, delay: 5000 },
    },
  }));
  await enrichQueue.addBulk(jobs);
  logger.info({ count: domains.length }, "Queued domains for enrichment");
}

export async function queueAIScoring(
  domains: Array<{ name: string; age?: number; backlinks?: number; da?: number }>,
): Promise<void> {
  if (!aiScoreQueue || domains.length === 0) return;
  for (let i = 0; i < domains.length; i += 20) {
    const batch = domains.slice(i, i + 20);
    await aiScoreQueue.add(
      "score-batch",
      { batch },
      { attempts: 2, backoff: { type: "fixed" as const, delay: 10000 } },
    );
  }
  logger.info({ count: domains.length }, "Queued domains for AI scoring");
}
