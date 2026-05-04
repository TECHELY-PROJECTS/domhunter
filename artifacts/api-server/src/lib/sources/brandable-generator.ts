import { rdapLookup } from "../enrichment/rdap";
import type { DomainFeedItem } from "./types";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1/chat/completions";
const COMETAPI_BASE   = "https://api.cometapi.com/v1/chat/completions";

const PROMPT = `You are a domain name investor with 15 years of experience.
Generate 60 short, invented, brandable domain names that are:
- SLD 4-12 characters, no hyphens, no numbers
- Invented words (portmanteaus, letter-swaps, creative compounds) — NOT real dictionary words
- Sound good when said aloud, easy to spell
- Fit SaaS, fintech, AI, or direct-to-consumer brands
- Use a mix of TLDs: .com, .io, .co, .app, .ai

Return ONLY a JSON array of strings like:
["nexify.com","vaultr.io","spryco.co","lumiq.app","orbix.ai"]

No explanations, no markdown — pure JSON array only.`;

async function callForBrandableNames(): Promise<string[] | null> {
  const orKey    = process.env.OPENROUTER_API_KEY;
  const cometKey = process.env.COMETAPI_API_KEY;

  const attempts = [
    orKey    && { url: OPENROUTER_BASE, key: orKey,    model: "meta-llama/llama-3.3-70b-instruct:free" },
    orKey    && { url: OPENROUTER_BASE, key: orKey,    model: "google/gemma-4-31b-it:free" },
    cometKey && { url: COMETAPI_BASE,  key: cometKey, model: "deepseek-chat" },
    orKey    && { url: OPENROUTER_BASE, key: orKey,    model: "deepseek/deepseek-chat-v3-0324" },
  ].filter(Boolean) as { url: string; key: string; model: string }[];

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${attempt.key}`,
          "Content-Type": "application/json",
          ...(attempt.url.includes("openrouter") && {
            "HTTP-Referer": "https://domhunter.io",
            "X-Title": "DomHunter",
          }),
        },
        body: JSON.stringify({
          model: attempt.model,
          temperature: 0.95,
          messages: [{ role: "user", content: PROMPT }],
        }),
        signal: AbortSignal.timeout(40_000),
      });

      if (!res.ok) continue;

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message: string };
      };
      if (data.error) continue;

      const text = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) continue;

      // Strip markdown fences then parse
      const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
      const arr = JSON.parse(cleaned) as string[];
      if (Array.isArray(arr) && arr.length > 0) return arr;
    } catch {
      continue;
    }
  }

  return null;
}

function parseParts(fqdn: string): { sld: string; tld: string } | null {
  const parts = fqdn.toLowerCase().trim().split(".");
  if (parts.length < 2) return null;
  const tld = parts[parts.length - 1];
  const sld = parts.slice(0, -1).join(".");
  if (!sld || !tld || sld.length > 12 || sld.length < 3) return null;
  if (/[^a-z0-9]/.test(sld)) return null;
  return { sld, tld };
}

/**
 * Generate AI-invented brandable domain names, then filter to only
 * those that are genuinely unregistered via RDAP.
 */
export async function generateBrandableDomains(): Promise<{
  items: DomainFeedItem[];
  generated: number;
  available: number;
}> {
  const names = await callForBrandableNames();
  if (!names || names.length === 0) {
    return { items: [], generated: 0, available: 0 };
  }

  const generated = names.length;

  // Deduplicate + validate format
  const valid = [...new Set(names.map((n) => n.toLowerCase().trim()))].filter(
    (n) => parseParts(n) !== null,
  );

  // Check RDAP availability concurrently (batches of 8 to avoid hammering)
  const available: DomainFeedItem[] = [];
  const batchSize = 8;

  for (let i = 0; i < valid.length; i += batchSize) {
    const batch = valid.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map(async (domain) => {
        const rdap = await rdapLookup(domain);
        return { domain, available: rdap.available };
      }),
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value.available) {
        available.push({ name: r.value.domain, source: "ai_generated" });
      }
    }

    if (i + batchSize < valid.length) {
      await new Promise((res) => setTimeout(res, 500));
    }
  }

  return { items: available, generated, available: available.length };
}
