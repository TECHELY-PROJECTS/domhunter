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
import { fetchDropCatchCSV, parseUploadedCSV } from "../lib/sources/dropcatch";
import { fetchUnstoppableDomains } from "../lib/sources/unstoppable";
import { preScoreAndFilter, aiValuateTop30, localPreScore } from "../lib/scoring/ai-valuation";
import { generateBrandableDomains } from "../lib/sources/brandable-generator";
import { getPageRank } from "../lib/enrichment/openpagerank";
import { rdapLookup } from "../lib/enrichment/rdap";
import { getBacklinks } from "../lib/enrichment/openlinks";
import { logger } from "../lib/logger";
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

/**
 * Inline enrichment for top domains — runs DA, backlinks, RDAP lookups
 * directly without needing Redis/BullMQ queue. Updates metrics in-place.
 */
async function inlineEnrichDomains(domainNames: string[]): Promise<void> {
  for (const name of domainNames) {
    try {
      const dbDomain = await db.query.domainsTable.findFirst({
        where: eq(domainsTable.name, name),
      });
      if (!dbDomain) continue;

      // Run all enrichment in parallel
      const [prResult, rdapResult, blResult] = await Promise.allSettled([
        getPageRank([name]),
        rdapLookup(name),
        getBacklinks(name),
      ]);

      const da = prResult.status === "fulfilled" ? prResult.value.get(name)?.da : undefined;
      const rdap = rdapResult.status === "fulfilled" ? rdapResult.value : null;
      const bl = blResult.status === "fulfilled" ? blResult.value : null;

      // Update domain status from RDAP (filter out registered/taken domains)
      if (rdap && !rdap.available) {
        // Domain is still registered — mark as TAKEN so it doesn't show as droppable
        if (rdap.expiresDate) {
          const daysLeft = (rdap.expiresDate.getTime() - Date.now()) / 86_400_000;
          if (daysLeft > 30) {
            // Still actively registered, remove from our listings
            await db.update(domainsTable)
              .set({ status: "TAKEN", updatedAt: new Date() })
              .where(eq(domainsTable.id, dbDomain.id));
          }
        }
      }

      // Update metrics with real data
      const existing = await db.query.metricsTable.findFirst({
        where: eq(metricsTable.domainId, dbDomain.id),
      });

      if (existing) {
        await db.update(metricsTable)
          .set({
            domainAuthority: da ?? existing.domainAuthority,
            backlinks: bl?.totalLinks ?? existing.backlinks,
            referringDomains: bl?.referringDomains ?? existing.referringDomains,
            domainAge: rdap?.ageYears ?? existing.domainAge,
            enrichedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(metricsTable.domainId, dbDomain.id));
      }
    } catch (err) {
      logger.warn({ domain: name, err }, "Inline enrichment failed for domain");
    }

    // Small delay to be polite to APIs
    await new Promise((r) => setTimeout(r, 300));
  }
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

    if (source === "dropcatch") {
      req.log.info("Force Sync: fetching domains from all sources...");

      let items: DomainFeedItem[] = [];
      let udCount = 0;
      let expiredCount = 0;

      // Check if CSV content was uploaded in the request body
      const csvContent = (req.body as any).csv as string | undefined;

      if (csvContent) {
        // Manual upload: parse the provided CSV content
        req.log.info("Parsing uploaded CSV...");
        items = parseUploadedCSV(csvContent);
      } else {
        // ── SOURCE 1: Unstoppable Domains API (primary — pending-delete domains) ──
        req.log.info("Fetching from Unstoppable Domains pending-delete API...");
        const udItems = await fetchUnstoppableDomains();
        if (udItems && udItems.length > 0) {
          req.log.info({ count: udItems.length }, "Unstoppable Domains: fetched pending-delete domains");
          items.push(...udItems);
          udCount = udItems.length;
        } else {
          req.log.warn("Unstoppable Domains API returned no results or UNSTOPPABLE_API_KEY not set");
        }

        // ── SOURCE 2: ExpiredDomains.net (secondary — recently deleted domains) ──
        const sessionCookie = process.env.EXPIREDDOMAINS_SESSION ?? "";
        if (sessionCookie) {
          req.log.info("Fetching from expireddomains.net (multi-TLD)...");
          // Rotate page offset to always get fresh domains
          const stored = await db.query.domainsTable.findMany({ columns: { name: true } });
          const pageOffset = Math.floor(stored.length / 25) % 40;
          try {
            const expiredItems = await fetchExpiredDomainsScrape(sessionCookie, 4, pageOffset, ["com", "io", "net", "co", "ai"]);
            if (expiredItems.length > 0) {
              req.log.info({ count: expiredItems.length }, "ExpiredDomains.net: fetched deleted domains");
              items.push(...expiredItems);
              expiredCount = expiredItems.length;
            }
          } catch (err) {
            req.log.warn({ err }, "ExpiredDomains.net scrape failed — continuing with other sources");
          }
        } else {
          req.log.info("EXPIREDDOMAINS_SESSION not set — skipping expireddomains.net");
        }

        // ── SOURCE 3: Fallback to DropCatch CSV if no domains from above ──
        if (items.length === 0) {
          req.log.info("No domains from primary sources, trying DropCatch CSV fallback...");
          const fetched = await fetchDropCatchCSV();
          if (!fetched) {
            return res.status(200).json({
              message: "Auto-fetch unavailable — please use the Upload CSV button.",
              error: "Could not fetch domains automatically. Set UNSTOPPABLE_API_KEY or EXPIREDDOMAINS_SESSION, or upload CSV manually.",
              needsUpload: true,
              ingested: 0,
              top30: [],
            });
          }
          items = fetched;
        }
      }

      // Deduplicate by domain name (sources may overlap)
      const seen = new Set<string>();
      items = items.filter((item) => {
        const key = item.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      req.log.info({ rawCount: items.length }, "Combined domains from all sources (deduplicated)");

      // ── FILTERING: Pre-score and keep the best candidates ──────
      const candidates = preScoreAndFilter(items, items.length); // score ALL items
      req.log.info({ candidates: candidates.length, raw: items.length }, "Local pre-scoring complete");

      // If strict scoring yields fewer than 100 results, use relaxed filtering
      // to guarantee we always show meaningful data to the user
      let qualifyingCandidates = candidates.slice(0, 2000);

      if (qualifyingCandidates.length < 100 && items.length > 0) {
        req.log.info({ strict: qualifyingCandidates.length, raw: items.length }, "Strict filter too aggressive — using relaxed filter to reach 100+ domains");

        // Relaxed filter: keep any traditional domain with a valuable TLD
        const VALUABLE_TLDS = new Set(["com", "io", "ai", "co", "net", "org", "app", "dev", "xyz", "me", "info", "cc"]);
        const alreadyQualified = new Set(qualifyingCandidates.map((c) => c.name));

        const relaxedItems: typeof qualifyingCandidates = [];
        for (const item of items) {
          if (alreadyQualified.has(item.name)) continue;
          const parts = item.name.toLowerCase().split(".");
          if (parts.length < 2) continue;
          const tld = parts[parts.length - 1];
          const sld = parts.slice(0, parts.length - 1).join("");

          // Basic quality filters — accept traditional domains
          if (sld.length < 3 || sld.length > 20) continue;
          // Allow letters, numbers, hyphens (real domains have these)
          if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(sld)) continue;
          if (!VALUABLE_TLDS.has(tld)) continue;

          // Score: prefer short alpha-only .com domains, penalize hyphens/numbers
          const tldBonus = tld === "com" ? 15 : tld === "ai" ? 12 : tld === "io" ? 10 : tld === "co" ? 8 : tld === "net" ? 7 : 4;
          const lengthBonus = sld.length <= 4 ? 20 : sld.length <= 6 ? 12 : sld.length <= 8 ? 6 : sld.length <= 10 ? 3 : 0;
          const alphaOnlyBonus = /^[a-z]+$/.test(sld) ? 10 : 0;
          const noHyphenBonus = !sld.includes("-") ? 5 : 0;
          const baseScore = 30 + tldBonus + lengthBonus + alphaOnlyBonus + noHyphenBonus;

          relaxedItems.push({
            name: item.name,
            sld,
            tld,
            tier: "unclassified" as const,
            localScore: Math.min(100, baseScore),
            pronounceable: /^[a-z]+$/.test(sld),
            charCount: sld.length,
          });
        }

        // Sort relaxed items by score descending, then by length ascending
        relaxedItems.sort((a, b) => b.localScore - a.localScore || a.charCount - b.charCount);

        // Always add at least 200 relaxed results (or all if fewer) to ensure we hit 100+
        const toAdd = Math.max(200, 100 - qualifyingCandidates.length);
        qualifyingCandidates = [
          ...qualifyingCandidates,
          ...relaxedItems.slice(0, toAdd),
        ];
        req.log.info({ final: qualifyingCandidates.length, relaxedAdded: Math.min(toAdd, relaxedItems.length), relaxedAvailable: relaxedItems.length }, "Relaxed filter applied — traditional domains included");
      }

      // Only persist the qualifying domains (not every raw domain)
      const qualifyingItems = qualifyingCandidates.map((c) => ({
        name: c.name,
        source: "force_sync",
      } as DomainFeedItem));

      req.log.info({ qualifying: qualifyingItems.length, total: items.length }, "Persisting only qualifying domains");
      const { count: inserted, newNames } = await persistFeedItems(qualifyingItems, "EXPIRING");

      // AI valuation: select top 30 most valuable domains
      let top30 = null;
      const aiCandidates = qualifyingCandidates.slice(0, 200);
      if (aiCandidates.length > 0) {
        try {
          top30 = await aiValuateTop30(aiCandidates);
          req.log.info({ top30Count: top30.length }, "AI valuation complete — top 30 selected");
        } catch (err) {
          req.log.error({ err }, "AI valuation failed — domains still ingested");
        }
      }

      // Run inline enrichment for top picks (DA, backlinks, age)
      const enrichTargets = top30
        ? top30.map((d) => d.domain).filter((n) => newNames.includes(n)).slice(0, 30)
        : newNames.slice(0, 20);
      if (enrichTargets.length > 0) {
        await inlineEnrichDomains(enrichTargets);
      }

      const sourcesSummary = [];
      if (udCount > 0) sourcesSummary.push(`Unstoppable(${udCount})`);
      if (expiredCount > 0) sourcesSummary.push(`ExpiredDomains(${expiredCount})`);
      if (csvContent) sourcesSummary.push("CSV Upload");
      if (sourcesSummary.length === 0) sourcesSummary.push("DropCatch");

      return res.status(202).json({
        message: `Force Sync [${sourcesSummary.join(" + ")}]: ${items.length} raw → ${qualifyingItems.length} qualifying → ${inserted} new → ${top30?.length ?? 0} top picks`,
        ingested: inserted,
        preFiltered: items.length,
        candidates: qualifyingCandidates.length,
        top30: top30 ?? [],
        enriched: enrichTargets.length,
        sources: sourcesSummary,
      });
    }

    return res.status(400).json({ error: `Unknown source: ${source}` });
  } catch (err) {
    req.log.error({ err }, "Failed to ingest domains");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
