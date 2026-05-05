import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { domainsTable, metricsTable } from "@workspace/db";
import { TriggerIngestBody } from "@workspace/api-zod";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { queueDomainEnrichment } from "../lib/jobs/queue";
import {
  calculateRarityScore,
  getRarityTier,
  tldScore,
} from "../lib/scoring/index";
import { detectNiche, computeBrandScore } from "../lib/scoring/niche";
import type { DomainFeedItem } from "../lib/sources/types";
import { fetchGoDaddyRSS } from "../lib/sources/godaddy-rss";
import { fetchNameJetRSS } from "../lib/sources/namejet-rss";
import { fetchExpiredDomainsScrape } from "../lib/sources/expireddomains";
import { generateBrandableDomains } from "../lib/sources/brandable-generator";
import {
  getICANNAuthToken,
  downloadComZoneFile,
  parseZoneFile,
} from "../lib/sources/icann-czds";

const router: IRouter = Router();

const SAMPLE_DOMAINS: Array<{
  name: string;
  sld: string;
  tld: string;
  status: "AUCTION" | "EXPIRING" | "EXPIRED" | "AVAILABLE" | "TAKEN" | "UNKNOWN";
  source: string;
  currentBid?: number;
  bidCount?: number;
  auctionEndDays?: number;
  da: number;
  backlinks: number;
  brandScore: number;
  niche: string;
  recommendation: string;
  aiReason: string;
}> = [
  { name: "velox.io", sld: "velox", tld: "io", status: "AUCTION", source: "godaddy", currentBid: 1200, bidCount: 8, auctionEndDays: 3, da: 42, backlinks: 1840, brandScore: 91, niche: "tech", recommendation: "BUY", aiReason: "Short, punchy, and highly brandable for SaaS or developer tools." },
  { name: "mintleaf.com", sld: "mintleaf", tld: "com", status: "EXPIRING", source: "expired_domains", da: 28, backlinks: 640, brandScore: 80, niche: "health", recommendation: "BUY", aiReason: "Clean, pronounceable compound — strong fit for wellness or organic brands." },
  { name: "cryptonexus.net", sld: "cryptonexus", tld: "net", status: "AUCTION", source: "namejet", currentBid: 450, bidCount: 3, auctionEndDays: 5, da: 15, backlinks: 320, brandScore: 62, niche: "finance", recommendation: "WATCH", aiReason: "Crypto trend name — decent but saturated market." },
  { name: "swyft.co", sld: "swyft", tld: "co", status: "AVAILABLE", source: "icann", da: 0, backlinks: 0, brandScore: 97, niche: "tech", recommendation: "BUY", aiReason: "Four letters, invented word, no baggage — near-perfect brand domain." },
  { name: "granitelaw.com", sld: "granitelaw", tld: "com", status: "EXPIRED", source: "expired_domains", da: 38, backlinks: 2100, brandScore: 70, niche: "legal", recommendation: "BUY", aiReason: "Premium keyword combo for legal services with solid backlink profile." },
  { name: "florex.io", sld: "florex", tld: "io", status: "AUCTION", source: "godaddy", currentBid: 800, bidCount: 12, auctionEndDays: 1, da: 22, backlinks: 510, brandScore: 88, niche: "ecommerce", recommendation: "BUY", aiReason: "Invented, short, easy to spell — ideal for e-commerce or fintech." },
  { name: "zenroute.com", sld: "zenroute", tld: "com", status: "EXPIRING", source: "expired_domains", da: 19, backlinks: 280, brandScore: 72, niche: "tech", recommendation: "WATCH", aiReason: "Good compound but competitive space; check trademark conflicts." },
  { name: "primeplot.com", sld: "primeplot", tld: "com", status: "EXPIRED", source: "expired_domains", da: 31, backlinks: 770, brandScore: 65, niche: "realestate", recommendation: "WATCH", aiReason: "Solid real estate keyword domain with moderate authority." },
  { name: "cloudmesh.io", sld: "cloudmesh", tld: "io", status: "AUCTION", source: "namejet", currentBid: 2200, bidCount: 19, auctionEndDays: 2, da: 55, backlinks: 4200, brandScore: 90, niche: "tech", recommendation: "BUY", aiReason: "High DA, cloud-native keyword — enterprise-grade infrastructure brand." },
  { name: "lushbody.com", sld: "lushbody", tld: "com", status: "AVAILABLE", source: "icann", da: 0, backlinks: 0, brandScore: 85, niche: "health", recommendation: "BUY", aiReason: "Evocative, sensory — premium positioning for beauty or wellness." },
  { name: "traceflow.com", sld: "traceflow", tld: "com", status: "EXPIRING", source: "expired_domains", da: 12, backlinks: 140, brandScore: 68, niche: "tech", recommendation: "WATCH", aiReason: "Descriptive SaaS name, moderate scores." },
  { name: "pixvault.io", sld: "pixvault", tld: "io", status: "AUCTION", source: "godaddy", currentBid: 600, bidCount: 6, auctionEndDays: 6, da: 18, backlinks: 390, brandScore: 82, niche: "media", recommendation: "BUY", aiReason: "Memorable compound for photo storage or media platform." },
  { name: "merkatx.com", sld: "merkatx", tld: "com", status: "EXPIRED", source: "expired_domains", da: 8, backlinks: 90, brandScore: 45, niche: "ecommerce", recommendation: "SKIP", aiReason: "Weak phonetics and low authority; not worth acquiring." },
  { name: "orbis.ai", sld: "orbis", tld: "ai", status: "AUCTION", source: "namejet", currentBid: 5500, bidCount: 28, auctionEndDays: 4, da: 48, backlinks: 3100, brandScore: 96, niche: "tech", recommendation: "BUY", aiReason: "Premium .ai extension with strong global brand recognition potential." },
  { name: "draftpad.io", sld: "draftpad", tld: "io", status: "AVAILABLE", source: "icann", da: 0, backlinks: 0, brandScore: 74, niche: "tech", recommendation: "WATCH", aiReason: "Good product name for writing or notes tools." },
  { name: "solarbid.com", sld: "solarbid", tld: "com", status: "EXPIRING", source: "expired_domains", da: 24, backlinks: 560, brandScore: 69, niche: "tech", recommendation: "WATCH", aiReason: "Niche keyword domain for solar energy marketplace." },
  { name: "luxeframe.com", sld: "luxeframe", tld: "com", status: "AUCTION", source: "godaddy", currentBid: 350, bidCount: 4, auctionEndDays: 7, da: 16, backlinks: 230, brandScore: 76, niche: "media", recommendation: "WATCH", aiReason: "Luxury photography or art brand potential." },
  { name: "nervenet.io", sld: "nervenet", tld: "io", status: "EXPIRED", source: "expired_domains", da: 33, backlinks: 890, brandScore: 71, niche: "tech", recommendation: "BUY", aiReason: "Strong neural/network connotation for AI or infra products." },
  { name: "kova.app", sld: "kova", tld: "app", status: "AVAILABLE", source: "icann", da: 0, backlinks: 0, brandScore: 89, niche: "tech", recommendation: "BUY", aiReason: "Four letters, invented, clean — excellent mobile app brand." },
  { name: "fundpeak.com", sld: "fundpeak", tld: "com", status: "AUCTION", source: "namejet", currentBid: 1800, bidCount: 15, auctionEndDays: 3, da: 41, backlinks: 1600, brandScore: 84, niche: "finance", recommendation: "BUY", aiReason: "Premium fintech compound with high DA and strong keyword signal." },
];

function parseDomainParts(fqdn: string): { sld: string; tld: string } | null {
  const parts = fqdn.toLowerCase().trim().split(".");
  if (parts.length < 2) return null;
  const tld = parts[parts.length - 1];
  const sld = parts.slice(0, parts.length - 1).join(".");
  if (!sld || !tld) return null;
  return { sld, tld };
}

// Returns true if the SLD contains digits or hyphens — these are excluded globally
function sldHasNumberOrDash(sld: string): boolean {
  return /[0-9-]/.test(sld);
}

async function persistFeedItems(
  items: DomainFeedItem[],
  defaultStatus: "AUCTION" | "EXPIRING" | "EXPIRED" | "AVAILABLE" | "UNKNOWN" = "UNKNOWN",
): Promise<{ count: number; newNames: string[] }> {
  const now = new Date();
  let inserted = 0;
  const newNames: string[] = [];

  for (const item of items) {
    const parts = parseDomainParts(item.name);
    if (!parts) continue;

    // Skip domains with numbers or hyphens in the SLD
    if (sldHasNumberOrDash(parts.sld)) continue;

    const existing = await db.query.domainsTable.findFirst({
      where: eq(domainsTable.name, item.name),
    });
    if (existing) continue;

    const domainId = randomUUID();

    await db.insert(domainsTable).values({
      id: domainId,
      name: item.name,
      sld: parts.sld,
      tld: parts.tld,
      status: item.auctionEndAt ? "AUCTION" : defaultStatus,
      source: item.source,
      auctionUrl: item.auctionUrl ?? null,
      auctionEndAt: item.auctionEndAt ?? null,
      currentBid: item.currentBid ?? null,
      bidCount: item.bidCount ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const trendScore = Math.round(50 + Math.random() * 40);
    const breakdown = calculateRarityScore({
      name: parts.sld,
      tld: parts.tld,
      domainAuthority: null,
      backlinks: item.backlinks ?? null,
      trendScore,
    });
    const tier = getRarityTier(breakdown.total);
    const niche = detectNiche(parts.sld);
    const brandScore = computeBrandScore(breakdown.pronounceability, breakdown.length, breakdown.keywordValue);

    await db.insert(metricsTable).values({
      id: randomUUID(),
      domainId,
      domainAuthority: null,
      backlinks: item.backlinks ?? null,
      referringDomains: item.backlinks ? Math.floor(item.backlinks * 0.3) : null,
      domainAge: null,
      lengthScore: breakdown.length,
      tldScore: tldScore(parts.tld),
      pronounceScore: breakdown.pronounceability,
      keywordScore: breakdown.keywordValue,
      rarityScore: breakdown.total,
      rarityTier: tier,
      brandScore,
      estimatedValue: Math.round(breakdown.total * 120),
      niche,
      recommendation: breakdown.total >= 70 ? "BUY" : breakdown.total >= 50 ? "WATCH" : "SKIP",
      aiReason: null,
      trendScore,
      enrichedAt: now,
      updatedAt: now,
    });

    newNames.push(item.name);
    inserted++;
  }

  return { count: inserted, newNames };
}

router.post("/ingest", async (req, res) => {
  try {
    const body = TriggerIngestBody.parse(req.body);
    const source = body.source;
    const now = new Date();

    if (source === "sample") {
      let inserted = 0;
      for (const sample of SAMPLE_DOMAINS) {
        const existing = await db.query.domainsTable.findFirst({
          where: eq(domainsTable.name, sample.name),
        });
        if (existing) continue;

        const domainId = randomUUID();
        const auctionEnd = sample.auctionEndDays
          ? new Date(now.getTime() + sample.auctionEndDays * 24 * 60 * 60 * 1000)
          : null;

        await db.insert(domainsTable).values({
          id: domainId,
          name: sample.name,
          sld: sample.sld,
          tld: sample.tld,
          status: sample.status,
          source: sample.source,
          currentBid: sample.currentBid ?? null,
          bidCount: sample.bidCount ?? null,
          auctionEndAt: auctionEnd,
          createdAt: new Date(now.getTime() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          updatedAt: now,
        });

        const trendScore = Math.round(50 + Math.random() * 40);
        const breakdown = calculateRarityScore({
          name: sample.sld,
          tld: sample.tld,
          domainAuthority: sample.da,
          backlinks: sample.backlinks,
          trendScore,
        });
        const tier = getRarityTier(breakdown.total);

        await db.insert(metricsTable).values({
          id: randomUUID(),
          domainId,
          domainAuthority: sample.da,
          backlinks: sample.backlinks,
          referringDomains: Math.floor(sample.backlinks * 0.3),
          domainAge: Math.floor(Math.random() * 20) + 1,
          lengthScore: breakdown.length,
          tldScore: tldScore(sample.tld),
          pronounceScore: breakdown.pronounceability,
          keywordScore: breakdown.keywordValue,
          rarityScore: breakdown.total,
          rarityTier: tier,
          brandScore: sample.brandScore,
          estimatedValue: Math.round(breakdown.total * 150 + sample.da * 50),
          niche: sample.niche,
          recommendation: sample.recommendation,
          aiReason: sample.aiReason,
          trendScore,
          enrichedAt: now,
          updatedAt: now,
        });

        inserted++;
      }
      return res.status(202).json({ message: `Ingested ${inserted} domains from source: sample` });
    }

    if (source === "godaddy") {
      req.log.info("Fetching GoDaddy RSS feed...");
      const items = await fetchGoDaddyRSS();
      req.log.info({ count: items.length }, "GoDaddy RSS fetched");
      const { count: inserted, newNames } = await persistFeedItems(items, "AUCTION");
      await queueDomainEnrichment(newNames.slice(0, 500));
      return res.status(202).json({ message: `Ingested ${inserted} new domains from GoDaddy RSS (${items.length} fetched)`, queued: newNames.length });
    }

    if (source === "namejet") {
      req.log.info("Fetching NameJet RSS feed...");
      const items = await fetchNameJetRSS();
      req.log.info({ count: items.length }, "NameJet RSS fetched");
      const { count: inserted, newNames } = await persistFeedItems(items, "AUCTION");
      await queueDomainEnrichment(newNames.slice(0, 500));
      return res.status(202).json({ message: `Ingested ${inserted} new domains from NameJet RSS (${items.length} fetched)`, queued: newNames.length });
    }

    if (source === "expired_domains") {
      const sessionCookie = process.env.EXPIREDDOMAINS_SESSION ?? "";
      if (!sessionCookie) {
        return res.status(400).json({
          error: "EXPIREDDOMAINS_SESSION environment variable is not set. Obtain a session cookie from expireddomains.net and set it.",
        });
      }
      // Rotate the page offset each sync so we always get a fresh slice
      const stored = await db.query.domainsTable.findMany({ columns: { name: true } });
      const existingCount = stored.length;
      // Roughly: we already have ~N domains, start from page N/25 on .com list
      const pageOffset = Math.floor(existingCount / 25) % 40; // cap at page 40 then cycle
      req.log.info({ pageOffset }, "Scraping expireddomains.net (multi-TLD)...");
      const items = await fetchExpiredDomainsScrape(sessionCookie, 4, pageOffset, ["com", "io", "net", "co"]);
      req.log.info({ count: items.length }, "ExpiredDomains scraped");
      const { count: inserted, newNames } = await persistFeedItems(items, "EXPIRED");
      await queueDomainEnrichment(newNames.slice(0, 500));
      return res.status(202).json({ message: `Ingested ${inserted} new domains from expireddomains.net (${items.length} scraped across .com/.io/.net/.co)`, queued: newNames.length });
    }

    if (source === "brandable") {
      req.log.info("Generating AI brandable domain names...");
      if (!process.env.OPENROUTER_API_KEY && !process.env.COMETAPI_API_KEY) {
        return res.status(400).json({ error: "No AI API key configured (OPENROUTER_API_KEY or COMETAPI_API_KEY)." });
      }
      const result = await generateBrandableDomains();
      req.log.info({ generated: result.generated, available: result.available }, "Brandable generation complete");
      const { count: inserted, newNames } = await persistFeedItems(result.items, "AVAILABLE");
      await queueDomainEnrichment(newNames.slice(0, 100));
      return res.status(202).json({
        message: `Generated ${result.generated} names → ${result.available} available → ${inserted} new added`,
        generated: result.generated,
        available: result.available,
        inserted,
      });
    }

    if (source === "icann") {
      const username = process.env.ICANN_USERNAME ?? "";
      const password = process.env.ICANN_PASSWORD ?? "";
      if (!username || !password) {
        return res.status(400).json({
          error: "ICANN_USERNAME and ICANN_PASSWORD environment variables must be set. Register free at czds.icann.org.",
        });
      }

      req.log.info("Authenticating with ICANN CZDS...");
      let token: string;
      try {
        token = await getICANNAuthToken(username, password);
      } catch (err) {
        req.log.error({ err }, "ICANN auth failed");
        return res.status(502).json({ error: "ICANN authentication failed. Check your credentials." });
      }

      req.log.info("Streaming .com zone file (sampling first 500 domains)...");
      let stream: ReadableStream<Uint8Array>;
      try {
        stream = await downloadComZoneFile(token);
      } catch (err) {
        req.log.error({ err }, "Zone file download failed");
        return res.status(502).json({ error: "Failed to download ICANN zone file." });
      }

      const items: DomainFeedItem[] = [];
      const SAMPLE_LIMIT = 500;
      for await (const fqdn of parseZoneFile(stream)) {
        items.push({ name: fqdn, source: "icann" });
        if (items.length >= SAMPLE_LIMIT) break;
      }
      req.log.info({ count: items.length }, "ICANN zone entries sampled");
      const { count: inserted, newNames } = await persistFeedItems(items, "AVAILABLE");
      await queueDomainEnrichment(newNames.slice(0, 500));
      return res.status(202).json({ message: `Ingested ${inserted} new domains from ICANN zone file (${items.length} sampled)`, queued: newNames.length });
    }

    return res.status(400).json({ error: `Unknown source: ${source}` });
  } catch (err) {
    req.log.error({ err }, "Failed to ingest domains");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
