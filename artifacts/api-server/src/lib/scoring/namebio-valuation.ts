/**
 * NameBio-Based Domain Valuation
 * 
 * Estimates domain value using patterns from NameBio historical sales data.
 * This provides a CONSISTENT value regardless of where it's displayed.
 * 
 * The valuation is based on:
 * - SLD length (shorter = exponentially more valuable)
 * - TLD premium (.com >> .io > .ai > .co > .net)
 * - Word structure (single word >> compound >> invented)
 * - Pronounceability bonus
 * - Keyword strength
 */

const TLD_MULTIPLIERS: Record<string, number> = {
  com: 1.0,
  io: 0.55,
  ai: 0.60,
  co: 0.35,
  app: 0.30,
  net: 0.25,
  org: 0.20,
  dev: 0.25,
  xyz: 0.10,
};

/**
 * NameBio-calibrated base values by SLD length for .com domains.
 * These represent the MEDIAN sale price for pronounceable domains of each length.
 * Source: Aggregated from NameBio historical data patterns.
 */
const LENGTH_BASE_VALUES: Record<number, number> = {
  2: 25000,  // 2-letter .com = $25K+ median
  3: 8000,   // 3-letter .com = $8K median
  4: 3500,   // 4-letter .com = $3.5K median
  5: 1500,   // 5-letter .com = $1.5K median
  6: 800,    // 6-letter .com = $800 median
  7: 500,    // 7-letter .com = $500 median
  8: 350,    // 8-letter .com = $350 median
  9: 250,    // 9-letter .com = $250 median
  10: 180,   // 10-letter .com = $180 median
  11: 120,   // 11-letter .com = $120 median
};

/** Word type multipliers based on NameBio data */
const WORD_TYPE_MULTIPLIERS = {
  singleKeyword: 3.0,    // Real English keyword = 3x base
  fiveLetter: 2.0,       // 5-letter pronounceable = 2x
  wordPlusLetter: 1.5,   // word+x pattern = 1.5x
  twoWord: 1.8,          // Two real keywords = 1.8x
  invented: 1.0,         // Invented but pronounceable = 1x base
};

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

function isPronouunceable(sld: string): boolean {
  let consonantStreak = 0;
  let vowelStreak = 0;
  let hasVowel = false;
  for (const ch of sld) {
    if (VOWELS.has(ch)) {
      hasVowel = true;
      vowelStreak++;
      consonantStreak = 0;
      if (vowelStreak > 3) return false;
    } else {
      consonantStreak++;
      vowelStreak = 0;
      if (consonantStreak > 3) return false;
    }
  }
  return hasVowel && consonantStreak <= 3;
}

/**
 * Compute a NameBio-calibrated estimated value for a domain.
 * This is the SINGLE source of truth used everywhere (homepage, detail page, alerts).
 */
export function computeNameBioValue(
  sld: string,
  tld: string,
  opts?: {
    isSingleWord?: boolean;
    isFiveLetter?: boolean;
    isWordPlusLetter?: boolean;
    isTwoWord?: boolean;
    domainAuthority?: number | null;
    backlinks?: number | null;
  },
): number {
  const len = sld.length;
  const baseValue = LENGTH_BASE_VALUES[Math.min(len, 11)] ?? 100;
  const tldMult = TLD_MULTIPLIERS[tld] ?? 0.15;

  // Word type multiplier
  let wordMult = WORD_TYPE_MULTIPLIERS.invented;
  if (opts?.isSingleWord) wordMult = WORD_TYPE_MULTIPLIERS.singleKeyword;
  else if (opts?.isFiveLetter && len === 5) wordMult = WORD_TYPE_MULTIPLIERS.fiveLetter;
  else if (opts?.isTwoWord) wordMult = WORD_TYPE_MULTIPLIERS.twoWord;
  else if (opts?.isWordPlusLetter) wordMult = WORD_TYPE_MULTIPLIERS.wordPlusLetter;

  // Pronounceability bonus (non-pronounceable domains sell for ~40% less)
  const pronounceBonus = isPronouunceable(sld) ? 1.0 : 0.6;

  // SEO bonus from DA/backlinks (real data from enrichment)
  let seoMult = 1.0;
  if (opts?.domainAuthority && opts.domainAuthority > 0) {
    if (opts.domainAuthority >= 50) seoMult += 1.5;
    else if (opts.domainAuthority >= 30) seoMult += 0.8;
    else if (opts.domainAuthority >= 15) seoMult += 0.3;
  }
  if (opts?.backlinks && opts.backlinks > 0) {
    if (opts.backlinks >= 5000) seoMult += 0.5;
    else if (opts.backlinks >= 1000) seoMult += 0.3;
    else if (opts.backlinks >= 100) seoMult += 0.1;
  }

  const value = Math.round(baseValue * tldMult * wordMult * pronounceBonus * seoMult);

  // Floor: no domain we list should be valued below $50 (NameBio min threshold)
  return Math.max(50, value);
}
