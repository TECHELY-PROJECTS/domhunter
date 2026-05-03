import { lengthScore } from "./length";
import { tldScore } from "./tld";
import { pronounceabilityScore } from "./pronounceability";
import { keywordValueScore } from "./keyword-value";

export { lengthScore, tldScore, pronounceabilityScore, keywordValueScore };

export interface DomainInput {
  name: string;
  tld: string;
  domainAuthority?: number | null;
  backlinks?: number | null;
  trendScore?: number | null;
}

export interface ScoreBreakdown {
  length: number;
  tld: number;
  pronounceability: number;
  keywordValue: number;
  seoBonus: number;
  trendBonus: number;
  total: number;
}

export type RarityTier =
  | "legendary"
  | "epic"
  | "rare"
  | "uncommon"
  | "common";

const WEIGHTS = {
  length: 0.25,
  tld: 0.2,
  pronounceability: 0.35,
  keywordValue: 0.2,
};
const MARKET_BONUS_MAX = 10;

export function calculateRarityScore(domain: DomainInput): ScoreBreakdown {
  const scores = {
    length: lengthScore(domain.name.length),
    tld: tldScore(domain.tld),
    pronounceability: pronounceabilityScore(domain.name),
    keywordValue: keywordValueScore(domain.name),
  };

  const core =
    scores.length * WEIGHTS.length +
    scores.tld * WEIGHTS.tld +
    scores.pronounceability * WEIGHTS.pronounceability +
    scores.keywordValue * WEIGHTS.keywordValue;

  let seoBonus = 0;
  if (domain.domainAuthority) {
    seoBonus +=
      domain.domainAuthority >= 50
        ? 5
        : domain.domainAuthority >= 30
          ? 3
          : 1;
  }
  if (domain.backlinks) {
    seoBonus +=
      domain.backlinks >= 1000 ? 5 : domain.backlinks >= 100 ? 3 : 1;
  }
  seoBonus = Math.min(MARKET_BONUS_MAX / 2, seoBonus);

  const trendBonus = domain.trendScore
    ? Math.min(MARKET_BONUS_MAX / 2, domain.trendScore / 20)
    : 0;

  const total = Math.round(
    Math.max(0, Math.min(100, core + seoBonus + trendBonus)),
  );

  return { ...scores, seoBonus, trendBonus, total };
}

export function getRarityTier(score: number): RarityTier {
  if (score >= 85) return "legendary";
  if (score >= 70) return "epic";
  if (score >= 55) return "rare";
  if (score >= 40) return "uncommon";
  return "common";
}

export const RARITY_COLORS: Record<RarityTier, string> = {
  legendary: "#FFD700",
  epic: "#A855F7",
  rare: "#3B82F6",
  uncommon: "#22C55E",
  common: "#6B7280",
};

export const RARITY_LABELS: Record<RarityTier, string> = {
  legendary: "Legendary",
  epic: "Epic",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
};
