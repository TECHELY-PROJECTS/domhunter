// Multi-model AI strategy:
//
//  Bulk scoring  → CometAPI: deepseek-chat            (high volume, cheap)
//  Brand Checker → CometAPI: claude-haiku-4-5-20251001 (fast, accurate)
//  Deep analysis → CometAPI: deepseek-v3.2             (smartest)
//  Fallback      → OpenRouter: inclusionai/ling-2.6-1t:free (when no CometAPI key)

const COMETAPI_BASE = "https://api.cometapi.com/v1/chat/completions";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = {
  bulk:     { provider: "comet",      model: "deepseek-chat"                 },
  brand:    { provider: "comet",      model: "claude-haiku-4-5-20251001"     },
  deep:     { provider: "comet",      model: "deepseek-v3.2"                 },
  fallback: { provider: "openrouter", model: "inclusionai/ling-2.6-1t:free"  },
} as const;

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

async function callAI(
  messages: Array<{ role: string; content: string }>,
  strategy: keyof typeof MODELS,
): Promise<string | null> {
  const cometKey = process.env.COMETAPI_API_KEY;
  const orKey = process.env.OPENROUTER_API_KEY;

  const { provider, model } = MODELS[strategy];

  // Pick base URL and key based on provider preference
  let baseUrl: string;
  let apiKey: string;

  if (provider === "comet" && cometKey) {
    baseUrl = COMETAPI_BASE;
    apiKey = cometKey;
  } else if (provider === "openrouter" && orKey) {
    baseUrl = OPENROUTER_BASE;
    apiKey = orKey;
  } else if (cometKey) {
    // Fallback to comet with fallback model
    baseUrl = COMETAPI_BASE;
    apiKey = cometKey;
  } else if (orKey) {
    baseUrl = OPENROUTER_BASE;
    apiKey = orKey;
  } else {
    return null;
  }

  // For openrouter fallback model, swap model name
  const effectiveModel =
    !cometKey && provider === "comet" ? MODELS.fallback.model : model;

  try {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(baseUrl.includes("openrouter") && {
          "HTTP-Referer": "https://domhunter.io",
          "X-Title": "DomHunter",
        }),
      },
      body: JSON.stringify({
        model: effectiveModel,
        temperature: 0.1,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().then((t) => t.slice(0, 200));
      console.error(`[AI] ${strategy}/${effectiveModel} error ${res.status}: ${errText}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.error(`[AI] ${strategy}/${effectiveModel} call failed:`, (e as Error).message);
    return null;
  }
}

function parseJSON<T>(text: string): T | null {
  try {
    const cleaned = text
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

// ── Single domain quick score (brand checker single mode) ──────────────────
export async function aiScoreDomain(
  domain: string,
  context?: { age?: number; backlinks?: number; da?: number },
): Promise<AIValuation | null> {
  const hasKey = process.env.COMETAPI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!hasKey) return null;

  const contextStr = context
    ? `Age: ${context.age ?? "unknown"} years. Backlinks: ${context.backlinks ?? 0}. DA: ${context.da ?? 0}/100.`
    : "";

  const text = await callAI(
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

  return text ? parseJSON<AIValuation>(text) : null;
}

// ── Batch scoring — uses free Ling-2.6 model, ≤20 domains per call ─────────
export async function aiScoreBatch(
  domains: Array<{ name: string; age?: number; backlinks?: number; da?: number }>,
): Promise<Map<string, AIValuation>> {
  const results = new Map<string, AIValuation>();
  const hasKey = process.env.COMETAPI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!hasKey) return results;

  const batchSize = 20;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const list = batch
      .map(
        (d) =>
          `"${d.name}" (age:${d.age ?? "?"}yr, bl:${d.backlinks ?? 0}, DA:${d.da ?? 0})`,
      )
      .join("\n");

    const text = await callAI(
      [
        {
          role: "user",
          content: `Score these ${batch.length} domains for domain investment. Be honest — most should be SKIP.

${list}

Return ONLY a valid JSON object keyed by domain name:
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

    if (text) {
      const parsed = parseJSON<Record<string, AIValuation>>(text);
      if (parsed) {
        for (const [domain, val] of Object.entries(parsed)) {
          results.set(domain, val);
        }
      }
    }

    if (i + batchSize < domains.length) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  return results;
}

// ── Deep investment analysis — uses DeepSeek Chat ──────────────────────────
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
  const hasKey = process.env.COMETAPI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!hasKey) return null;

  const text = await callAI(
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

  return text
    ? parseJSON<{
        investmentThesis: string;
        riskFactors: string[];
        exitStrategies: string[];
        comparableSales: string[];
        suggestedListPrice: number;
        negotiationFloor: number;
      }>(text)
    : null;
}
