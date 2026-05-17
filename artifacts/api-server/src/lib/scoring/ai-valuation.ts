/**
 * AI-Powered Domain Valuation Module
 * 
 * Implements expert domain broker scoring based on:
 * - Core filtering (length ≤11, no numbers/hyphens, clean English)
 * - Tier hierarchy (1-word > 1-word+letter > 2-word > 5-letter special)
 * - NameBio benchmarking patterns
 * - Brandability & trend analysis
 * 
 * Flow:
 * 1. Local pre-scoring (free) → filters thousands down to ~200 candidates
 * 2. AI valuation (cascading free→paid models) → picks top 30
 */

import { logger } from "../logger";

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL PRE-SCORING (Zero Cost)
// ═══════════════════════════════════════════════════════════════════════════

/** Common English words that make strong single-keyword domains */
const POWER_WORDS = new Set([
  // Tech
  "cloud", "stack", "forge", "nexus", "pulse", "spark", "swift", "logic",
  "pixel", "cyber", "agent", "delta", "flux", "surge", "orbit", "prism",
  "blade", "vault", "apex", "nova", "edge", "sync", "grid", "core",
  // Finance
  "yield", "prime", "alpha", "vault", "fund", "mint", "peak", "equity",
  "trade", "block", "stake", "trust", "ledger",
  // Brand/Lifestyle
  "luxe", "haven", "bloom", "vivid", "urban", "bold", "crisp", "sleek",
  "zen", "glow", "lush", "pure", "fresh", "bright", "noble", "royal",
  // Health/Wellness
  "vital", "thrive", "vigor", "calm", "renew", "heal", "bloom",
  // E-commerce
  "cargo", "haul", "scout", "fetch", "craft", "guild",
  // Media/Creative
  "muse", "opus", "reel", "cast", "verse", "tune", "vibe",
]);

/** Common vowel patterns that make words pronounceable */
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

/** Check if a string is pronounceable (has vowel-consonant flow) */
function isPronouunceable(sld: string): boolean {
  let consonantStreak = 0;
  let vowelStreak = 0;
  let hasVowel = false;

  for (const ch of sld) {
    if (VOWELS.has(ch)) {
      hasVowel = true;
      vowelStreak++;
      consonantStreak = 0;
      if (vowelStreak > 3) return false; // "oooo" not pronounceable
    } else {
      consonantStreak++;
      vowelStreak = 0;
      if (consonantStreak > 3) return false; // "ngrth" not pronounceable
    }
  }

  return hasVowel && consonantStreak <= 3;
}

/** Detect if SLD is a single real English word (heuristic) */
function isSingleWord(sld: string): boolean {
  // Known power words
  if (POWER_WORDS.has(sld)) return true;
  // 3-6 letter pronounceable words are likely single words
  if (sld.length >= 3 && sld.length <= 7 && isPronouunceable(sld)) return true;
  return false;
}

/** Detect word+letter pattern (e.g., "foodx", "techy") */
function isWordPlusLetter(sld: string): boolean {
  if (sld.length < 4 || sld.length > 9) return false;
  // Check if removing last 1-2 chars gives a known word
  const minus1 = sld.slice(0, -1);
  const minus2 = sld.slice(0, -2);
  if (POWER_WORDS.has(minus1) || (minus1.length >= 4 && isPronouunceable(minus1))) return true;
  if (minus2.length >= 4 && (POWER_WORDS.has(minus2) || isPronouunceable(minus2))) return true;
  return false;
}

/** Detect two-word compound (e.g., "mintleaf", "cloudmesh") */
function isTwoWordCompound(sld: string): boolean {
  if (sld.length < 6) return false;
  // Try splitting at every position
  for (let i = 3; i <= sld.length - 3; i++) {
    const left = sld.slice(0, i);
    const right = sld.slice(i);
    if (
      (POWER_WORDS.has(left) || (left.length >= 3 && isPronouunceable(left))) &&
      (POWER_WORDS.has(right) || (right.length >= 3 && isPronouunceable(right)))
    ) {
      return true;
    }
  }
  return false;
}

export type PriorityTier = "priority1" | "priority2" | "priority3" | "five_letter" | "unclassified";

export interface LocalPreScore {
  name: string;
  sld: string;
  tld: string;
  tier: PriorityTier;
  localScore: number; // 0-100 preliminary score
  pronounceable: boolean;
  charCount: number;
}

/** Assign priority tier and local score to a domain */
export function localPreScore(domain: string): LocalPreScore | null {
  const parts = domain.toLowerCase().split(".");
  if (parts.length < 2) return null;

  const tld = parts[parts.length - 1];
  const sld = parts.slice(0, parts.length - 1).join("");

  // Core filters already applied in dropcatch.ts, but double-check
  if (sld.length > 11) return null;
  if (!/^[a-z]+$/.test(sld)) return null;

  const pronounceable = isPronouunceable(sld);
  if (!pronounceable) return null; // Must be readable English structure

  let tier: PriorityTier = "unclassified";
  let baseScore = 30;

  // Priority 1: Pure single keyword (HIGHEST — real English words with market demand)
  if (isSingleWord(sld)) {
    tier = "priority1";
    baseScore = 85;
  }
  // Priority 3: two-word compound (e.g., "initjob", "cloudmesh") — valued higher than random letters
  else if (isTwoWordCompound(sld)) {
    tier = "priority3";
    baseScore = 65;
  }
  // Priority 2: word + letter(s) (e.g., "foodx", "stacky")
  else if (isWordPlusLetter(sld)) {
    tier = "priority2";
    baseScore = 55;
  }
  // Special: exactly 5 letters and pronounceable
  else if (sld.length === 5 && pronounceable) {
    tier = "five_letter";
    baseScore = 60;
  }
  // Unclassified but still pronounceable — might be a brandable invented word
  else if (pronounceable && sld.length <= 7) {
    tier = "unclassified";
    baseScore = 40;
  } else {
    return null; // Doesn't fit any valuable tier
  }

  // TLD bonus (com is king)
  const tldBonus = tld === "com" ? 12 : tld === "io" ? 7 : tld === "ai" ? 8 : tld === "co" ? 5 : 3;

  // Length bonus (4-letter .com = highest possible score)
  const lengthBonus = sld.length === 4 && tld === "com" ? 15 : sld.length <= 4 ? 10 : sld.length <= 5 ? 7 : sld.length <= 7 ? 4 : 0;

  const localScore = Math.min(100, baseScore + tldBonus + lengthBonus);

  return {
    name: domain,
    sld,
    tld,
    tier,
    localScore,
    pronounceable,
    charCount: sld.length,
  };
}

/**
 * Pre-score and filter a large list of domains locally (zero cost).
 * 
 * PRIORITY ORDER (as per user requirement):
 * 1. 4-letter .com domains (highest value — always first)
 * 2. Keyword/trend-based single-word domains (real English words)
 * 3. Word + 1-2 random letters (top 200 max)
 * 4. Compound words (two keywords joined, e.g., "initjob")
 * 
 * Returns the top N candidates sorted by this strict priority.
 */
export function preScoreAndFilter(
  domains: Array<{ name: string }>,
  maxCandidates = 1000,
): LocalPreScore[] {
  // Bucket domains by priority tier
  const fourLetterCom: LocalPreScore[] = [];
  const keywordSingle: LocalPreScore[] = [];
  const wordPlusLetter: LocalPreScore[] = [];
  const compoundWords: LocalPreScore[] = [];
  const fiveLetterSpecial: LocalPreScore[] = [];

  for (const d of domains) {
    const result = localPreScore(d.name);
    if (!result || result.localScore < 40) continue;

    // Tier 1: 4-letter .com (absolute highest priority)
    if (result.sld.length === 4 && result.tld === "com") {
      fourLetterCom.push(result);
    }
    // Tier 2: Single keyword domains (real English words)
    else if (result.tier === "priority1") {
      keywordSingle.push(result);
    }
    // Tier 3: Word + 1-2 letters
    else if (result.tier === "priority2") {
      wordPlusLetter.push(result);
    }
    // Tier 4: Compound words (two keywords joined)
    else if (result.tier === "priority3") {
      compoundWords.push(result);
    }
    // 5-letter special
    else if (result.tier === "five_letter") {
      fiveLetterSpecial.push(result);
    }
  }

  // Sort each bucket by score descending
  const sortByScore = (a: LocalPreScore, b: LocalPreScore) => b.localScore - a.localScore;
  fourLetterCom.sort(sortByScore);
  keywordSingle.sort(sortByScore);
  fiveLetterSpecial.sort(sortByScore);
  wordPlusLetter.sort(sortByScore);
  compoundWords.sort(sortByScore);

  // Assemble final list in strict priority order
  const result: LocalPreScore[] = [
    ...fourLetterCom,                         // ALL 4-letter .com (highest priority)
    ...keywordSingle,                         // ALL keyword/trend single-word domains
    ...fiveLetterSpecial,                     // ALL 5-letter pronounceable
    ...wordPlusLetter.slice(0, 200),          // Top 200 word+letter domains only
    ...compoundWords.slice(0, 300),           // Top 300 compound words
  ];

  return result.slice(0, maxCandidates);
}

// ═══════════════════════════════════════════════════════════════════════════
// AI VALUATION (Cascading Free → Paid)
// ═══════════════════════════════════════════════════════════════════════════

export interface ValuatedDomain {
  rank: number;
  domain: string;
  camelCase: string;
  priorityTier: string;
  charCount: number;
  nameBioComp: string;
  brandability: string;
  estimatedFloor: number;
}

const VALUATION_SYSTEM_PROMPT = `Role: You are an expert domain valuation specialist and high-end domain broker. Your task is to analyze a pre-filtered list of daily expired/dropped domains and select the absolute top 30 most valuable, brandable assets.

### Domain Tier & Priority Hierarchy
Evaluate and sort using this strict priority framework:
- Priority 1: Pure 1-Word/Single Keyword domains (Highest value).
- Priority 2: 1-Word + 1-Letter (e.g., "Foodx.com"). 
  CRITICAL PENALTY: If this creates a typo of an existing major brand, drastically reduce score. Also consider 1-Word + 2-3 random letters at maximum, only if highly brandable.
- Priority 3: 2-Word Combinations (Both words must be legitimate English keywords).
- Special Category (5-Letter Domains): Pick only if visually appealing, pronounceable, and meaningful.

### NameBio Benchmarking
- Target domains whose exact or closely related comps routinely rank at $100+ on NameBio.
- Disqualify any domain archetype that doesn't historically clear a $200+ floor.
- For keyword combinations, assess "prefix" and "suffix" historical market demand.
- Domains with highest historical NameBio comp scores go to top of list.

### Selection Criteria
- Must fit current modern trends, tech, culture, or corporate brandability.
- Clean, readable English structure.
- Strong end-user buyer appeal (startups, tech companies, brands).

### Output Format
Return ONLY valid JSON array with exactly 30 objects:
[
  {
    "rank": 1,
    "domain": "exact.com",
    "camelCase": "Exact.com",
    "priorityTier": "Priority 1",
    "charCount": 5,
    "nameBioComp": "$500+ floor based on single-keyword .com comps",
    "brandability": "Perfect startup brand name for X industry",
    "estimatedFloor": 500
  }
]

Sort by value (highest first). Be extremely selective — most domains should NOT make the cut.`;

/**
 * Send pre-scored candidates to AI for final top-30 selection.
 * Uses the cascading model strategy from ai/client.ts pattern.
 */
export async function aiValuateTop30(
  candidates: LocalPreScore[],
): Promise<ValuatedDomain[]> {
  const cometKey = process.env.COMETAPI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;

  if (!cometKey && !orKey) {
    logger.warn("No AI API keys — returning top 30 by local score only");
    return candidates.slice(0, 30).map((c, i) => ({
      rank: i + 1,
      domain: c.name,
      camelCase: c.sld.charAt(0).toUpperCase() + c.sld.slice(1) + "." + c.tld,
      priorityTier: c.tier.replace("priority", "Priority ").replace("five_letter", "5-Letter"),
      charCount: c.charCount,
      nameBioComp: "Local scoring only (no AI key)",
      brandability: `Pronounceable ${c.charCount}-char ${c.tld} domain`,
      estimatedFloor: c.localScore * 5,
    }));
  }

  // Format candidates for the AI prompt
  const domainList = candidates
    .map((c) => `${c.name} (${c.charCount} chars, tier: ${c.tier}, local: ${c.localScore})`)
    .join("\n");

  const userPrompt = `Analyze these ${candidates.length} pre-filtered dropping domains and select the TOP 30 most valuable.

${domainList}

Remember: Return ONLY a valid JSON array of exactly 30 objects. No markdown, no explanation outside the JSON.`;

  // Cascading model chain (same pattern as ai/client.ts)
  const models = [
    { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama-3.3-70B (free)" },
    { provider: "openrouter", model: "google/gemma-4-31b-it:free", label: "Gemma-4-31B (free)" },
    { provider: "comet", model: "deepseek-chat", label: "DeepSeek-Chat (CometAPI)" },
    { provider: "openrouter", model: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek-V3 (OpenRouter)" },
  ];

  for (const entry of models) {
    if (entry.provider === "comet" && !cometKey) continue;
    if (entry.provider === "openrouter" && !orKey) continue;

    const baseUrl = entry.provider === "comet"
      ? "https://api.cometapi.com/v1/chat/completions"
      : "https://openrouter.ai/api/v1/chat/completions";
    const apiKey = entry.provider === "comet" ? cometKey! : orKey!;

    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(entry.provider === "openrouter" && {
            "HTTP-Referer": "https://domhunter.io",
            "X-Title": "DomHunter",
          }),
        },
        body: JSON.stringify({
          model: entry.model,
          temperature: 0.15,
          messages: [
            { role: "system", content: VALUATION_SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
        }),
        signal: AbortSignal.timeout(60_000),
      });

      if (!res.ok) {
        const errText = await res.text().then((t) => t.slice(0, 200));
        logger.warn({ model: entry.label, status: res.status, err: errText }, "AI valuation model failed");
        continue;
      }

      const data = await res.json() as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message: string };
      };

      if (data.error) {
        logger.warn({ model: entry.label, err: data.error.message }, "AI valuation API error");
        continue;
      }

      const content = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) continue;

      // Parse JSON response
      const parsed = parseAIResponse(content);
      if (parsed && parsed.length > 0) {
        logger.info({ model: entry.label, count: parsed.length }, "AI valuation complete");
        return parsed;
      }

      logger.warn({ model: entry.label }, "AI valuation returned unparseable response");
    } catch (err) {
      logger.warn({ model: entry.label, err }, "AI valuation call failed");
    }
  }

  // Fallback: return top 30 by local score
  logger.warn("All AI models failed — falling back to local scoring");
  return candidates.slice(0, 30).map((c, i) => ({
    rank: i + 1,
    domain: c.name,
    camelCase: c.sld.charAt(0).toUpperCase() + c.sld.slice(1) + "." + c.tld,
    priorityTier: c.tier.replace("priority", "Priority ").replace("five_letter", "5-Letter"),
    charCount: c.charCount,
    nameBioComp: "Fallback (AI unavailable)",
    brandability: `Pronounceable ${c.charCount}-char .${c.tld} domain`,
    estimatedFloor: c.localScore * 5,
  }));
}

function parseAIResponse(text: string): ValuatedDomain[] | null {
  try {
    // Strip markdown fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();
    const arr = JSON.parse(cleaned);
    if (Array.isArray(arr) && arr.length > 0) {
      return arr.slice(0, 30).map((item: any, idx: number) => ({
        rank: item.rank ?? idx + 1,
        domain: item.domain ?? "",
        camelCase: item.camelCase ?? item.domain ?? "",
        priorityTier: item.priorityTier ?? "Unknown",
        charCount: item.charCount ?? 0,
        nameBioComp: item.nameBioComp ?? "",
        brandability: item.brandability ?? "",
        estimatedFloor: item.estimatedFloor ?? 0,
      }));
    }
  } catch {
    // Try extracting array from text
    const match = text.match(/\[[\s\S]+\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr)) {
          return arr.slice(0, 30).map((item: any, idx: number) => ({
            rank: item.rank ?? idx + 1,
            domain: item.domain ?? "",
            camelCase: item.camelCase ?? item.domain ?? "",
            priorityTier: item.priorityTier ?? "Unknown",
            charCount: item.charCount ?? 0,
            nameBioComp: item.nameBioComp ?? "",
            brandability: item.brandability ?? "",
            estimatedFloor: item.estimatedFloor ?? 0,
          }));
        }
      } catch { /* fall through */ }
    }
  }
  return null;
}
