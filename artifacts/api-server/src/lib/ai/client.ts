// ═══════════════════════════════════════════════════════════════════════════
// AI Model Strategy — cascading fallback per task
//
// Priority order (per user preference, $3/mo budget):
//   1. OpenRouter FREE models      ← always tried first
//   2. CometAPI paid (cheap)       ← if free fails
//   3. OpenRouter paid (cheap)     ← last resort
//
// ┌─────────────┬────────────────────────────────────────────────────────────┐
// │ Task        │ Chain                                                       │
// ├─────────────┼────────────────────────────────────────────────────────────┤
// │ bulk        │ llama-3.3-70b:free → gemma-4-31b:free                     │
// │             │   → comet:deepseek-chat → OR:deepseek-chat-v3-0324         │
// ├─────────────┼────────────────────────────────────────────────────────────┤
// │ brand       │ gpt-oss-120b:free → hermes-3-405b:free                    │
// │             │   → comet:claude-haiku-4-5 → OR:gpt-4o-mini               │
// ├─────────────┼────────────────────────────────────────────────────────────┤
// │ deep        │ nemotron-super-120b:free → gpt-oss-120b:free              │
// │             │   → comet:deepseek-v3.2 → OR:deepseek-chat-v3-0324        │
// └─────────────┴────────────────────────────────────────────────────────────┘
// ═══════════════════════════════════════════════════════════════════════════

const COMETAPI_BASE = "https://api.cometapi.com/v1/chat/completions";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

type Provider = "openrouter" | "comet";

interface ModelEntry {
  provider: Provider;
  model: string;
  free: boolean;
  label: string;
}

const STRATEGIES: Record<"bulk" | "brand" | "deep" | "reasoning", ModelEntry[]> = {

  // ── Bulk scoring: ingests up to 20 domains at once ─────────────────────
  // Needs reliable structured JSON, fast throughput
  bulk: [
    {
      provider: "openrouter",
      model: "meta-llama/llama-3.3-70b-instruct:free",
      free: true,
      label: "Llama-3.3-70B (free)",
    },
    {
      provider: "openrouter",
      model: "google/gemma-4-31b-it:free",
      free: true,
      label: "Gemma-4-31B (free)",
    },
    {
      provider: "comet",
      model: "deepseek-chat",
      free: false,
      label: "DeepSeek-Chat via CometAPI (paid)",
    },
    {
      provider: "openrouter",
      model: "deepseek/deepseek-chat-v3-0324",
      free: false,
      label: "DeepSeek-Chat-V3 via OpenRouter (paid)",
    },
  ],

  // ── Brand analysis: single domain deep check ───────────────────────────
  // Needs nuanced understanding of brandability, memorability, market fit
  brand: [
    {
      provider: "openrouter",
      model: "openai/gpt-oss-120b:free",
      free: true,
      label: "GPT-OSS-120B (free)",
    },
    {
      provider: "openrouter",
      model: "nousresearch/hermes-3-llama-3.1-405b:free",
      free: true,
      label: "Hermes-3-405B (free)",
    },
    {
      provider: "comet",
      model: "claude-haiku-4-5-20251001",
      free: false,
      label: "Claude Haiku 4.5 via CometAPI (paid)",
    },
    {
      provider: "openrouter",
      model: "openai/gpt-4o-mini",
      free: false,
      label: "GPT-4o-mini via OpenRouter (paid)",
    },
  ],

  // ── Deep investment analysis: full thesis, risk, comparables ──────────
  // Needs strongest reasoning and domain investment expertise
  deep: [
    {
      provider: "openrouter",
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      free: true,
      label: "Nemotron-Super-120B (free)",
    },
    {
      provider: "openrouter",
      model: "openai/gpt-oss-120b:free",
      free: true,
      label: "GPT-OSS-120B (free)",
    },
    {
      provider: "comet",
      model: "deepseek-v3.2",
      free: false,
      label: "DeepSeek-V3.2 via CometAPI (paid)",
    },
    {
      provider: "openrouter",
      model: "deepseek/deepseek-chat-v3-0324",
      free: false,
      label: "DeepSeek-Chat-V3 via OpenRouter (paid)",
    },
  ],

  // ── Reasoning: domain strategy & flipping analysis ─────────────────────
  // Uses the strongest reasoning models (DeepSeek R1 / V3 Pro) for deep
  // strategic thinking about domain possibilities and flipping strategies
  reasoning: [
    {
      provider: "comet",
      model: "deepseek-r1",
      free: false,
      label: "DeepSeek-R1 via CometAPI (reasoning)",
    },
    {
      provider: "openrouter",
      model: "deepseek/deepseek-r1",
      free: false,
      label: "DeepSeek-R1 via OpenRouter (reasoning)",
    },
    {
      provider: "comet",
      model: "deepseek-v3.2",
      free: false,
      label: "DeepSeek-V3.2 via CometAPI (paid)",
    },
    {
      provider: "openrouter",
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      free: true,
      label: "Nemotron-Super-120B (free fallback)",
    },
  ],
};

export interface AIValuation {
  brandScore: number;
  estimatedValue: number;
  niche:
    | "tech"
    | "finance"
    | "health"
    | "ecommerce"
    | "media"
    | "legal"
    | "realestate"
    | "general";
  recommendation: "BUY" | "WATCH" | "SKIP";
  reason: string;
  targetBuyer: string;
}

// ── Core: cascading model caller ────────────────────────────────────────────
async function callAI(
  messages: Array<{ role: string; content: string }>,
  strategy: keyof typeof STRATEGIES,
): Promise<{ content: string; model: string; free: boolean } | null> {
  const cometKey = process.env.COMETAPI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;

  if (!cometKey && !orKey) {
    console.error("[AI] No API keys configured (COMETAPI_API_KEY or OPENROUTER_API_KEY)");
    return null;
  }

  const chain = STRATEGIES[strategy];

  for (const entry of chain) {
    if (entry.provider === "comet" && !cometKey) continue;
    if (entry.provider === "openrouter" && !orKey) continue;

    const baseUrl = entry.provider === "comet" ? COMETAPI_BASE : OPENROUTER_BASE;
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
          temperature: 0.1,
          messages,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text().then((t) => t.slice(0, 300));
        console.error(`[AI] ${strategy} | ${entry.label} → HTTP ${res.status}: ${errText} — trying next`);
        continue;
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message: string };
      };

      if (data.error) {
        console.error(`[AI] ${strategy} | ${entry.label} → API error: ${data.error.message} — trying next`);
        continue;
      }

      const content = data.choices?.[0]?.message?.content?.trim() ?? null;
      if (!content) {
        console.error(`[AI] ${strategy} | ${entry.label} → empty response — trying next`);
        continue;
      }

      console.log(`[AI] ${strategy} ✓ ${entry.label}`);
      return { content, model: entry.model, free: entry.free };

    } catch (e) {
      console.error(`[AI] ${strategy} | ${entry.label} → ${(e as Error).message} — trying next`);
    }
  }

  console.error(`[AI] ${strategy} → all models in chain exhausted`);
  return null;
}

// ── JSON parser: strips markdown fences, handles edge cases ───────────────
function parseJSON<T>(text: string): T | null {
  try {
    // Strip ```json ... ``` fences
    const cleaned = text
      .replace(/^```(?:json)?\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // Try extracting the first { ... } block if outer parse fails
    const match = text.match(/\{[\s\S]+\}/);
    if (match) {
      try { return JSON.parse(match[0]) as T; } catch { /* fall through */ }
    }
    return null;
  }
}

// ── Single domain brand analysis (Brand Checker + Domain Detail enrich) ───
export async function aiScoreDomain(
  domain: string,
  context?: { age?: number; backlinks?: number; da?: number },
): Promise<AIValuation | null> {
  const contextStr = context
    ? `Age: ${context.age ?? "unknown"} years. Backlinks: ${context.backlinks ?? 0}. DA: ${context.da ?? 0}/100.`
    : "";

  const result = await callAI(
    [
      {
        role: "user",
        content: `Analyze this domain name for investment potential.
Domain: ${domain}
${contextStr}

Return ONLY valid JSON, no markdown, no explanation:
{
  "brandScore": <0-100>,
  "estimatedValue": <USD number>,
  "niche": <tech|finance|health|ecommerce|media|legal|realestate|general>,
  "recommendation": <BUY|WATCH|SKIP>,
  "reason": <one sentence>,
  "targetBuyer": <5 words max>
}`,
      },
    ],
    "brand",
  );

  return result ? parseJSON<AIValuation>(result.content) : null;
}

// ── Batch scoring: up to 20 domains per call (ingest pipeline) ────────────
export async function aiScoreBatch(
  domains: Array<{ name: string; age?: number; backlinks?: number; da?: number }>,
): Promise<Map<string, AIValuation>> {
  const results = new Map<string, AIValuation>();
  if (!process.env.COMETAPI_API_KEY && !process.env.OPENROUTER_API_KEY) return results;

  const batchSize = 20;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const list = batch
      .map(
        (d) =>
          `"${d.name}" (age:${d.age ?? "?"}yr, bl:${d.backlinks ?? 0}, DA:${d.da ?? 0})`,
      )
      .join("\n");

    const result = await callAI(
      [
        {
          role: "user",
          content: `Score these ${batch.length} domains for domain investment. Be honest — most should be SKIP.

${list}

Return ONLY a valid JSON object keyed by exact domain name:
{
  "example.com": {
    "brandScore": 72,
    "estimatedValue": 450,
    "niche": "tech",
    "recommendation": "WATCH",
    "reason": "Clean tech name with broad appeal.",
    "targetBuyer": "SaaS startup"
  }
}`,
        },
      ],
      "bulk",
    );

    if (result) {
      const parsed = parseJSON<Record<string, AIValuation>>(result.content);
      if (parsed) {
        for (const [domain, val] of Object.entries(parsed)) {
          results.set(domain, val);
        }
      } else {
        console.error(`[AI] bulk — JSON parse failed for batch ${Math.floor(i / batchSize) + 1}`);
      }
    }

    if (i + batchSize < domains.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}

// ── Deep investment analysis (Domain Detail page) ──────────────────────────
export async function aiDeepAnalysis(
  domain: string,
  context: {
    age?: number;
    backlinks?: number;
    da?: number;
    rarityScore?: number;
    keywords?: string[];
  },
): Promise<{
  investmentThesis: string;
  riskFactors: string[];
  exitStrategies: string[];
  comparableSales: string[];
  suggestedListPrice: number;
  negotiationFloor: number;
} | null> {
  const result = await callAI(
    [
      {
        role: "user",
        content: `You are an expert domain investor. Give a deep investment analysis.

Domain: ${domain}
Age: ${context.age ?? "unknown"} years
Backlinks: ${context.backlinks ?? 0}
Domain Authority: ${context.da ?? 0}/100
Rarity Score: ${context.rarityScore ?? 0}/100
Keywords detected: ${context.keywords?.join(", ") || "none"}

Return ONLY valid JSON:
{
  "investmentThesis": "2-3 sentence case for buying this domain",
  "riskFactors": ["risk 1", "risk 2"],
  "exitStrategies": ["strategy 1", "strategy 2", "strategy 3"],
  "comparableSales": ["similar domain that sold: domain.com $X (year)"],
  "suggestedListPrice": 1500,
  "negotiationFloor": 800
}`,
      },
    ],
    "deep",
  );

  return result
    ? parseJSON<{
        investmentThesis: string;
        riskFactors: string[];
        exitStrategies: string[];
        comparableSales: string[];
        suggestedListPrice: number;
        negotiationFloor: number;
      }>(result.content)
    : null;
}


// ── Domain Strategy & Flipping Analysis (DeepSeek R1 reasoning) ────────────
export interface DomainStrategy {
  possibilities: string[];        // What this domain can be used for (5-8 ideas)
  bestUseCase: string;            // The single strongest use case explained
  flippingStrategy: string;       // Detailed strategy for flipping this domain
  targetBuyers: string[];         // Specific buyer profiles (3-5)
  pricingStrategy: {
    quickFlip: number;            // Price for fast sale (30 days)
    midTerm: number;              // Hold 3-6 months
    longTerm: number;             // Hold 1-2 years with development
  };
  developmentIdeas: string[];     // How to increase value before selling
  marketTiming: string;           // When is the best time to sell
  competitorDomains: string[];    // Similar domains that define market value
  overallVerdict: string;         // Final strategic summary (2-3 sentences)
}

export async function aiDomainStrategy(
  domain: string,
  context?: {
    age?: number;
    backlinks?: number;
    da?: number;
    rarityScore?: number;
    niche?: string;
    registrar?: string;
  },
): Promise<DomainStrategy | null> {
  const contextStr = [
    context?.age ? `Domain Age: ${context.age} years` : null,
    context?.backlinks ? `Backlinks: ${context.backlinks}` : null,
    context?.da ? `Domain Authority: ${context.da}/100` : null,
    context?.rarityScore ? `Rarity Score: ${context.rarityScore}/100` : null,
    context?.niche ? `Detected Niche: ${context.niche}` : null,
    context?.registrar ? `Current Registrar: ${context.registrar}` : null,
  ].filter(Boolean).join("\n");

  const result = await callAI(
    [
      {
        role: "user",
        content: `You are an elite domain broker and digital strategist with 15+ years of experience flipping domains for profit. Analyze this domain and provide a comprehensive strategy.

DOMAIN: ${domain}
${contextStr ? `\nMETRICS:\n${contextStr}` : ""}

Think deeply about:
1. What businesses, products, or projects could use this domain?
2. Who would pay the most for it and why?
3. What's the optimal flipping strategy — hold, develop, or quick-sell?
4. What comparable domains have sold and at what prices?
5. How can the domain value be increased before selling?

Return ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "possibilities": ["use case 1", "use case 2", "use case 3", "use case 4", "use case 5"],
  "bestUseCase": "The single strongest use case with detailed explanation of why this is the most valuable application",
  "flippingStrategy": "Detailed 2-3 sentence strategy for how to flip this domain for maximum profit. Include timing, pricing approach, and where to list it.",
  "targetBuyers": ["specific buyer profile 1", "buyer profile 2", "buyer profile 3"],
  "pricingStrategy": {
    "quickFlip": 500,
    "midTerm": 1200,
    "longTerm": 3500
  },
  "developmentIdeas": ["idea to increase value 1", "idea 2", "idea 3"],
  "marketTiming": "When is the best time to sell this domain and why",
  "competitorDomains": ["similar-domain.com ($X sold)", "another.io ($Y listed)"],
  "overallVerdict": "2-3 sentence final strategic recommendation summarizing the opportunity quality and recommended action."
}`,
      },
    ],
    "reasoning",
  );

  if (!result) return null;

  const parsed = parseJSON<DomainStrategy>(result.content);
  if (!parsed) {
    console.error("[AI] reasoning — JSON parse failed for domain strategy");
    return null;
  }

  return parsed;
}
