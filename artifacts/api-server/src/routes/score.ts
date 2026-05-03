import { Router, type IRouter } from "express";
import { aiScoreBatch } from "../lib/ai/client";
import { calculateRarityScore, getRarityTier } from "../lib/scoring";
import { getPageRank } from "../lib/enrichment/openpagerank";

const router: IRouter = Router();

router.post("/score", async (req, res) => {
  try {
    const { domains } = req.body as { domains?: unknown };

    if (!Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: "domains array required" });
    }

    const limited: string[] = (domains as string[])
      .filter((d) => typeof d === "string" && d.includes("."))
      .slice(0, 20);

    if (limited.length === 0) {
      return res.status(400).json({ error: "No valid domain names provided" });
    }

    // Get DA data in parallel (optional — returns empty map without API key)
    const daMap = await getPageRank(limited).catch(() => new Map());

    // Calculate rarity scores for each domain
    const scoredDomains = limited.map((name) => {
      const parts = name.split(".");
      const sld = parts[0];
      const tld = parts.slice(1).join(".");
      const pr = daMap.get(name);
      const da = pr?.da;
      const breakdown = calculateRarityScore({ name: sld, tld, domainAuthority: da });
      return { name, sld, tld, da, breakdown, tier: getRarityTier(breakdown.total) };
    });

    // AI batch score all domains (single API call for up to 20 domains)
    const aiResults = await aiScoreBatch(
      scoredDomains.map((d) => ({ name: d.name, da: d.da })),
    );

    const results = scoredDomains.map((d) => {
      const ai = aiResults.get(d.name);
      return {
        domain: { name: d.name, sld: d.sld, tld: d.tld },
        metrics: {
          rarityScore: d.breakdown.total,
          rarityTier: d.tier,
          lengthScore: d.breakdown.length,
          tldScore: d.breakdown.tld,
          pronounceScore: d.breakdown.pronounceability,
          keywordScore: d.breakdown.keywordValue,
          seoBonus: d.breakdown.seoBonus,
          trendBonus: d.breakdown.trendBonus,
          domainAuthority: d.da ?? null,
          brandScore: ai?.brandScore ?? null,
          estimatedValue: ai?.estimatedValue ?? null,
          niche: ai?.niche ?? null,
          recommendation: ai?.recommendation ?? null,
          aiReason: ai?.reason ?? null,
          targetBuyer: ai?.targetBuyer ?? null,
        },
      };
    });

    res.json({ results });
  } catch (err) {
    req.log.error({ err }, "Failed to batch score domains");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
