import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { domainsTable, metricsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { rdapLookup } from "../lib/enrichment/rdap";
import { getPageRank } from "../lib/enrichment/openpagerank";
import { getBacklinks } from "../lib/enrichment/openlinks";
import { checkTrademarkRisk } from "../lib/enrichment/trademark";
import {
  calculateRarityScore,
  getRarityTier,
  tldScore,
} from "../lib/scoring/index";
import { aiScoreDomain } from "../lib/ai/client";

const router: IRouter = Router();

router.post("/domains/:fqdn/enrich", async (req, res) => {
  try {
    const fqdn = req.params.fqdn?.toLowerCase().trim();
    if (!fqdn) return res.status(400).json({ error: "Missing domain name" });

    const domain = await db.query.domainsTable.findFirst({
      where: eq(domainsTable.name, fqdn),
      with: { metrics: true },
    });

    if (!domain) {
      return res.status(404).json({ error: "Domain not found" });
    }

    req.log.info({ fqdn }, "Starting enrichment");

    const [rdap, oprMap, backlinks, aiVal] = await Promise.all([
      rdapLookup(fqdn),
      getPageRank([fqdn]),
      getBacklinks(fqdn),
      aiScoreDomain(fqdn, {
        age: domain.metrics?.domainAge ?? undefined,
        backlinks: domain.metrics?.backlinks ?? undefined,
        da: domain.metrics?.domainAuthority ?? undefined,
      }),
    ]);

    const opr = oprMap.get(fqdn);
    const da = opr?.da ?? domain.metrics?.domainAuthority ?? null;
    const bl = backlinks?.totalLinks ?? domain.metrics?.backlinks ?? null;
    const refDomains =
      backlinks?.referringDomains ?? domain.metrics?.referringDomains ?? null;
    const trendScore = domain.metrics?.trendScore ?? null;

    // Run trademark/UDRP check (uses RDAP registrar info)
    const trademarkResult = await checkTrademarkRisk(fqdn, rdap.registrar);

    const breakdown = calculateRarityScore({
      name: domain.sld,
      tld: domain.tld,
      domainAuthority: da,
      backlinks: bl,
      trendScore,
    });
    const tier = getRarityTier(breakdown.total);
    const now = new Date();

    const metricsPayload = {
      domainAuthority: da,
      backlinks: bl,
      referringDomains: refDomains,
      domainAge: rdap.ageYears ?? domain.metrics?.domainAge ?? null,
      registrar: rdap.registrar ?? domain.metrics?.registrar ?? null,
      createdDate: rdap.createdDate ?? domain.metrics?.createdDate ?? null,
      expiresDate: rdap.expiresDate ?? domain.metrics?.expiresDate ?? null,
      lengthScore: breakdown.length,
      tldScore: tldScore(domain.tld),
      pronounceScore: breakdown.pronounceability,
      keywordScore: breakdown.keywordValue,
      rarityScore: breakdown.total,
      rarityTier: tier,
      trendScore,
      brandScore: aiVal?.brandScore ?? domain.metrics?.brandScore ?? null,
      estimatedValue: aiVal?.estimatedValue ?? domain.metrics?.estimatedValue ?? null,
      niche: aiVal?.niche ?? domain.metrics?.niche ?? null,
      recommendation: trademarkResult.shouldAvoid
        ? "SKIP"
        : (aiVal?.recommendation ?? domain.metrics?.recommendation ?? null),
      aiReason: trademarkResult.shouldAvoid
        ? `⚠️ UDRP RISK: ${trademarkResult.reason}`
        : (aiVal?.reason ?? domain.metrics?.aiReason ?? null),
      trademarkRisk: trademarkResult.riskLevel,
      trademarkReason: trademarkResult.reason,
      trademarkMatches: trademarkResult.matches.length > 0
        ? JSON.stringify(trademarkResult.matches)
        : null,
      enrichedAt: now,
      updatedAt: now,
    };

    if (domain.metrics) {
      await db
        .update(metricsTable)
        .set(metricsPayload)
        .where(eq(metricsTable.domainId, domain.id));
    } else {
      await db.insert(metricsTable).values({
        id: randomUUID(),
        domainId: domain.id,
        ...metricsPayload,
      });
    }

    const updated = await db.query.domainsTable.findFirst({
      where: eq(domainsTable.name, fqdn),
      with: { metrics: true },
    });

    req.log.info(
      { fqdn, rarityScore: breakdown.total, tier, da, bl, aiUsed: !!aiVal },
      "Enrichment complete",
    );

    res.json({
      domain: updated,
      enriched: {
        rdap: {
          available: rdap.available,
          registrar: rdap.registrar,
          ageYears: rdap.ageYears,
          createdDate: rdap.createdDate,
          expiresDate: rdap.expiresDate,
        },
        opr: opr ?? null,
        backlinks: backlinks ?? null,
        ai: aiVal
          ? {
              brandScore: aiVal.brandScore,
              estimatedValue: aiVal.estimatedValue,
              niche: aiVal.niche,
              recommendation: aiVal.recommendation,
              reason: aiVal.reason,
              targetBuyer: aiVal.targetBuyer,
            }
          : null,
        trademark: {
          riskLevel: trademarkResult.riskLevel,
          reason: trademarkResult.reason,
          shouldAvoid: trademarkResult.shouldAvoid,
          matches: trademarkResult.matches,
        },
        scoring: breakdown,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Enrichment failed");
    res.status(500).json({ error: "Enrichment failed" });
  }
});

router.post("/domains/enrich-batch", async (req, res) => {
  try {
    const { fqdns } = req.body as { fqdns?: string[] };
    if (!Array.isArray(fqdns) || fqdns.length === 0) {
      return res.status(400).json({ error: "Provide an array of fqdns" });
    }
    if (fqdns.length > 50) {
      return res.status(400).json({ error: "Batch limit is 50 domains" });
    }

    res.status(202).json({
      message: `Enrichment queued for ${fqdns.length} domains`,
      fqdns,
    });

    const oprMap = await getPageRank(fqdns);
    const now = new Date();

    for (const fqdn of fqdns) {
      try {
        const domain = await db.query.domainsTable.findFirst({
          where: eq(domainsTable.name, fqdn.toLowerCase()),
          with: { metrics: true },
        });
        if (!domain) continue;

        const [rdap, backlinks, aiVal] = await Promise.all([
          rdapLookup(fqdn),
          getBacklinks(fqdn),
          aiScoreDomain(fqdn, {
            age: domain.metrics?.domainAge ?? undefined,
            backlinks: domain.metrics?.backlinks ?? undefined,
            da: domain.metrics?.domainAuthority ?? undefined,
          }),
        ]);

        const opr = oprMap.get(fqdn);
        const da = opr?.da ?? domain.metrics?.domainAuthority ?? null;
        const bl = backlinks?.totalLinks ?? domain.metrics?.backlinks ?? null;
        const refDomains =
          backlinks?.referringDomains ??
          domain.metrics?.referringDomains ??
          null;
        const trendScore = domain.metrics?.trendScore ?? null;

        const breakdown = calculateRarityScore({
          name: domain.sld,
          tld: domain.tld,
          domainAuthority: da,
          backlinks: bl,
          trendScore,
        });
        const tier = getRarityTier(breakdown.total);

        const metricsPayload = {
          domainAuthority: da,
          backlinks: bl,
          referringDomains: refDomains,
          domainAge: rdap.ageYears ?? domain.metrics?.domainAge ?? null,
          registrar: rdap.registrar ?? domain.metrics?.registrar ?? null,
          createdDate: rdap.createdDate ?? domain.metrics?.createdDate ?? null,
          expiresDate: rdap.expiresDate ?? domain.metrics?.expiresDate ?? null,
          lengthScore: breakdown.length,
          tldScore: tldScore(domain.tld),
          pronounceScore: breakdown.pronounceability,
          keywordScore: breakdown.keywordValue,
          rarityScore: breakdown.total,
          rarityTier: tier,
          trendScore,
          brandScore: aiVal?.brandScore ?? domain.metrics?.brandScore ?? null,
          estimatedValue: aiVal?.estimatedValue ?? domain.metrics?.estimatedValue ?? null,
          niche: aiVal?.niche ?? domain.metrics?.niche ?? null,
          recommendation: aiVal?.recommendation ?? domain.metrics?.recommendation ?? null,
          aiReason: aiVal?.reason ?? domain.metrics?.aiReason ?? null,
          enrichedAt: now,
          updatedAt: now,
        };

        if (domain.metrics) {
          await db
            .update(metricsTable)
            .set(metricsPayload)
            .where(eq(metricsTable.domainId, domain.id));
        } else {
          await db.insert(metricsTable).values({
            id: randomUUID(),
            domainId: domain.id,
            ...metricsPayload,
          });
        }

        req.log.info(
          { fqdn, rarityScore: breakdown.total, tier, aiUsed: !!aiVal },
          "Batch enrichment done",
        );

        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        req.log.error({ err, fqdn }, "Batch enrichment item failed");
      }
    }
  } catch (err) {
    req.log.error({ err }, "Batch enrichment failed");
  }
});

export default router;
