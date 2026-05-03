import { Router, type IRouter } from "express";
import { CheckBrandBody } from "@workspace/api-zod";
import {
  calculateRarityScore,
  getRarityTier,
  pronounceabilityScore,
  lengthScore,
  keywordValueScore,
} from "../lib/scoring/index";
import { aiScoreDomain } from "../lib/ai/client";

const router: IRouter = Router();

function scoreMemorability(sld: string): number {
  const hasRepeat = /(.)\1/.test(sld);
  const hasPattern = /^[a-z]+$/.test(sld);
  let score = 60;
  if (sld.length <= 4) score += 25;
  else if (sld.length <= 6) score += 15;
  if (hasPattern) score += 10;
  if (hasRepeat) score -= 10;
  if (/[0-9]/.test(sld)) score -= 20;
  if (/-/.test(sld)) score -= 25;
  return Math.min(100, Math.max(0, score));
}

function detectNiche(domain: string, context?: string | null): string {
  const text = `${domain} ${context ?? ""}`.toLowerCase();
  if (/tech|ai|cloud|saas|dev|code|api|app|bot|vpn|cyber/.test(text))
    return "tech";
  if (/finance|invest|crypto|money|bank|pay|fund|loan|credit|trading/.test(text))
    return "finance";
  if (/health|med|care|fit|wellness|pharma|dental|rehab|therapy/.test(text))
    return "health";
  if (/shop|store|buy|market|sell|commerce/.test(text)) return "ecommerce";
  if (/news|media|press|blog|content/.test(text)) return "media";
  if (/law|legal|attorney|court|lawyer/.test(text)) return "legal";
  if (/real|estate|home|property|rent|realty/.test(text)) return "realestate";
  return "tech";
}

function estimateValue(
  rarityScore: number,
  brandScore: number,
  sld: string,
  tld: string,
): number {
  const base = (rarityScore * 0.6 + brandScore * 0.4) * 120;
  const lengthBonus =
    sld.length <= 4 ? 8000 : sld.length <= 5 ? 4000 : sld.length <= 6 ? 1500 : 0;
  const tldBonus = tld === "com" ? 2000 : tld === "ai" ? 1500 : tld === "io" ? 500 : 0;
  return Math.round(base + lengthBonus + tldBonus);
}

function getStrengths(
  sld: string,
  breakdown: ReturnType<typeof calculateRarityScore>,
  niche: string,
): string[] {
  const strengths: string[] = [];
  if (sld.length <= 5) strengths.push("Extremely short — premium recall and type-in value");
  else if (sld.length <= 7) strengths.push("Short, memorable length");
  if (breakdown.pronounceability >= 80)
    strengths.push("Highly pronounceable — easy to say and share verbally");
  if (breakdown.keywordValue >= 60)
    strengths.push("Contains a high-CPC keyword — strong SEO signal value");
  if (breakdown.total >= 75) strengths.push("Above-average rarity score");
  if (/^[a-z]+$/.test(sld)) strengths.push("Clean alphabetic characters only");
  if (!/[qxz]/i.test(sld)) strengths.push("No confusing letters (Q, X, Z)");
  strengths.push(`Relevant keyword fit for ${niche}`);
  return strengths.slice(0, 4);
}

function getWeaknesses(
  sld: string,
  breakdown: ReturnType<typeof calculateRarityScore>,
): string[] {
  const weaknesses: string[] = [];
  if (sld.length > 10) weaknesses.push("Long name — harder to recall and type");
  if (breakdown.pronounceability < 50)
    weaknesses.push("Low pronounceability — difficult to say or remember verbally");
  if (/[0-9]/.test(sld))
    weaknesses.push("Contains numbers — weaker brand signal");
  if (/-/.test(sld))
    weaknesses.push("Contains hyphens — less clean for branding");
  if (!/[aeiou]/i.test(sld))
    weaknesses.push("No vowels — very difficult to pronounce");
  if (/[^aeiou]{4,}/i.test(sld))
    weaknesses.push("Consonant cluster — hard to say aloud");
  if (breakdown.total < 50)
    weaknesses.push("Below-average composite score — consider alternatives");
  return weaknesses.slice(0, 3);
}

router.post("/brand-checker", async (req, res) => {
  try {
    const body = CheckBrandBody.parse(req.body);
    const raw = body.domain.toLowerCase().trim();
    const parts = raw.split(".");
    const sld = parts[0] || raw;
    const tld = parts.length > 1 ? parts[parts.length - 1] : "com";
    const context = body.context;

    const breakdown = calculateRarityScore({
      name: sld,
      tld,
      domainAuthority: null,
      backlinks: null,
      trendScore: null,
    });

    const memorability = scoreMemorability(sld);
    const kwScore = keywordValueScore(sld);

    const heuristicBrandScore = Math.round(
      breakdown.pronounceability * 0.40 +
      breakdown.length * 0.25 +
      memorability * 0.20 +
      (kwScore > 0 ? Math.min(kwScore, 100) : 0) * 0.15,
    );

    const heuristicNiche = detectNiche(raw, context);
    const tier = getRarityTier(breakdown.total);
    const strengths = getStrengths(sld, breakdown, heuristicNiche);
    const weaknesses = getWeaknesses(sld, breakdown);

    req.log.info({ domain: raw }, "Running AI brand analysis");
    const ai = await aiScoreDomain(raw, { age: undefined, backlinks: undefined, da: undefined });

    const brandScore = ai?.brandScore ?? heuristicBrandScore;
    const niche = ai?.niche ?? heuristicNiche;
    const estimatedValue = ai?.estimatedValue ?? estimateValue(breakdown.total, brandScore, sld, tld);
    const recommendation: "BUY" | "WATCH" | "SKIP" =
      ai?.recommendation ?? (brandScore >= 72 ? "BUY" : brandScore >= 50 ? "WATCH" : "SKIP");

    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
    const heuristicReason =
      brandScore >= 72
        ? `"${sld}" is a ${tierLabel}-tier brand candidate (rarity ${breakdown.total}/100). ${breakdown.pronounceability >= 75 ? "Highly pronounceable" : "Reasonably pronounceable"} with ${sld.length <= 6 ? "an ideal" : "a moderate"} length for the ${niche} space.`
        : brandScore >= 50
          ? `"${sld}" has moderate brand potential (rarity ${breakdown.total}/100). Worth watching — but address the weaknesses before committing significant capital.`
          : `"${sld}" scores below average (rarity ${breakdown.total}/100). The phonetic and structural issues would hinder brand recall. Consider shorter or more vowel-rich alternatives.`;

    const reasoning = ai?.reason ?? heuristicReason;
    const targetBuyer = ai?.targetBuyer ?? null;

    req.log.info({ domain: raw, brandScore, recommendation, aiUsed: !!ai }, "Brand check complete");

    res.json({
      domain: raw,
      brandScore,
      pronounceScore: breakdown.pronounceability,
      lengthScore: breakdown.length,
      memorability,
      estimatedValue,
      recommendation,
      niche,
      reasoning,
      targetBuyer,
      strengths,
      weaknesses,
      aiPowered: !!ai,
      rarityTier: tier,
      rarityScore: breakdown.total,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to check brand");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
