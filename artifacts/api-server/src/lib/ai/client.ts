// Unified AI client — CometAPI first, OpenRouter fallback
// Both are OpenAI-compatible gateways (same API format, different URLs + keys)

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

interface AIProvider {
  baseUrl: string;
  apiKey: string;
  model: string;
  name: string;
}

function getProvider(): AIProvider {
  if (process.env.COMETAPI_API_KEY) {
    return {
      baseUrl: "https://api.cometapi.com/v1/chat/completions",
      apiKey: process.env.COMETAPI_API_KEY,
      model: "claude-haiku-3-5",
      name: "CometAPI",
    };
  }
  return {
    baseUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: process.env.OPENROUTER_API_KEY || "",
    model: "google/gemini-flash-1.5",
    name: "OpenRouter",
  };
}

async function callAI(
  messages: Array<{ role: string; content: string }>,
  model?: string,
): Promise<string | null> {
  const provider = getProvider();

  try {
    const res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: model || provider.model,
        temperature: 0.1,
        messages,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().then((t) => t.slice(0, 200));
      console.error(`[AI] ${provider.name} error ${res.status}: ${errText}`);
      return null;
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content || null;
  } catch (e) {
    console.error(
      `[AI] ${provider.name} call failed:`,
      (e as Error).message,
    );
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

export async function aiScoreDomain(
  domain: string,
  context?: { age?: number; backlinks?: number; da?: number },
): Promise<AIValuation | null> {
  const provider = getProvider();
  if (!provider.apiKey) return null;

  const contextStr = context
    ? `Age: ${context.age ?? "unknown"} years. Backlinks: ${context.backlinks ?? 0}. DA: ${context.da ?? 0}/100.`
    : "";

  const text = await callAI([
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
  ]);

  return text ? parseJSON<AIValuation>(text) : null;
}

export async function aiScoreBatch(
  domains: Array<{
    name: string;
    age?: number;
    backlinks?: number;
    da?: number;
  }>,
): Promise<Map<string, AIValuation>> {
  const provider = getProvider();
  const results = new Map<string, AIValuation>();
  if (!provider.apiKey) return results;

  const batchSize = 20;

  for (let i = 0; i < domains.length; i += batchSize) {
    const batch = domains.slice(i, i + batchSize);
    const list = batch
      .map(
        (d) =>
          `"${d.name}" (age:${d.age ?? "?"}yr, bl:${d.backlinks ?? 0}, DA:${d.da ?? 0})`,
      )
      .join("\n");

    const text = await callAI([
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
    ]);

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
  const provider = getProvider();
  if (!provider.apiKey) return null;

  const smartModel =
    provider.name === "CometAPI"
      ? "claude-sonnet-4-6"
      : "anthropic/claude-3-5-haiku";

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
    smartModel,
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
