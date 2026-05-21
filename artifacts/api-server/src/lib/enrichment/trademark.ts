/**
 * UDRP Trademark Risk Checker
 * 
 * Checks whether a domain name may infringe on registered trademarks,
 * which could lead to UDRP (Uniform Domain-Name Dispute-Resolution Policy) disputes.
 * 
 * Sources:
 * 1. USPTO TESS (Trademark Electronic Search System) — US trademarks
 * 2. WIPO Global Brand Database — international trademarks
 * 3. Known brand dictionary — instant local check for famous marks
 * 
 * A domain flagged as HIGH risk should NOT be purchased.
 */

import { logger } from "../logger";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export type TrademarkRiskLevel = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export interface TrademarkMatch {
  mark: string;
  source: string;
  status?: string;
  registrationNumber?: string;
  owner?: string;
  matchType: "exact" | "contains" | "similar";
}

export interface TrademarkCheckResult {
  domain: string;
  sld: string;
  riskLevel: TrademarkRiskLevel;
  matches: TrademarkMatch[];
  reason: string;
  shouldAvoid: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// FAMOUS BRAND DICTIONARY (instant local check)
// These are well-known marks that will ALWAYS trigger UDRP if used
// ═══════════════════════════════════════════════════════════════════════════

const FAMOUS_BRANDS = new Set([
  // Big Tech
  "google", "apple", "microsoft", "amazon", "meta", "facebook", "instagram",
  "whatsapp", "youtube", "tiktok", "twitter", "snapchat", "linkedin",
  "netflix", "spotify", "uber", "airbnb", "tesla", "nvidia", "intel",
  "adobe", "oracle", "salesforce", "cisco", "ibm", "samsung", "sony",
  "paypal", "stripe", "shopify", "squarespace", "slack", "zoom", "discord",
  "github", "gitlab", "docker", "kubernetes", "openai", "chatgpt",
  // Finance
  "visa", "mastercard", "amex", "chase", "citibank", "goldman",
  "morgan", "fidelity", "schwab", "robinhood", "coinbase", "binance",
  // Retail & Consumer
  "nike", "adidas", "puma", "gucci", "prada", "louis vuitton", "hermes",
  "chanel", "rolex", "coca cola", "pepsi", "mcdonalds", "starbucks",
  "walmart", "target", "costco", "ikea", "zara", "supreme",
  // Automotive
  "toyota", "honda", "ford", "bmw", "mercedes", "audi", "porsche",
  "ferrari", "lamborghini", "lexus", "volvo", "hyundai",
  // Pharma & Health
  "pfizer", "moderna", "johnson", "merck", "novartis", "roche",
  // Media & Entertainment
  "disney", "marvel", "pixar", "warner", "paramount", "hbo",
  "espn", "nfl", "nba", "fifa", "olympics",
]);

// Common brand suffixes/prefixes that indicate trademark infringement
const BRAND_PATTERNS = [
  /^get(.+)$/, /^my(.+)$/, /^the(.+)$/, /^go(.+)$/, /^try(.+)$/,
  /(.+)app$/, /(.+)hub$/, /(.+)store$/, /(.+)shop$/, /(.+)online$/,
  /(.+)official$/, /(.+)deals$/, /(.+)pro$/,
];

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL TRADEMARK CHECK (instant, zero cost)
// ═══════════════════════════════════════════════════════════════════════════

function checkLocalBrands(sld: string): TrademarkMatch[] {
  const matches: TrademarkMatch[] = [];
  const lower = sld.toLowerCase();

  // Exact match
  if (FAMOUS_BRANDS.has(lower)) {
    matches.push({
      mark: lower,
      source: "Famous Brand Database",
      status: "REGISTERED",
      matchType: "exact",
    });
    return matches;
  }

  // Check if domain contains a famous brand
  for (const brand of FAMOUS_BRANDS) {
    if (brand.length >= 4 && lower.includes(brand)) {
      matches.push({
        mark: brand,
        source: "Famous Brand Database",
        status: "REGISTERED",
        matchType: "contains",
      });
    }
  }

  // Check brand patterns (e.g., "getnetflix", "myamazon", "teslastore")
  if (matches.length === 0) {
    for (const pattern of BRAND_PATTERNS) {
      const m = lower.match(pattern);
      if (m) {
        const extracted = m[1];
        if (extracted && FAMOUS_BRANDS.has(extracted)) {
          matches.push({
            mark: extracted,
            source: "Famous Brand Database (pattern)",
            status: "REGISTERED",
            matchType: "similar",
          });
        }
      }
    }
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════════════════════
// USPTO TRADEMARK CHECK (via TESS API / trademark lookup)
// ═══════════════════════════════════════════════════════════════════════════

async function checkUSPTO(sld: string): Promise<TrademarkMatch[]> {
  const matches: TrademarkMatch[] = [];

  try {
    // Use the USPTO's public TSDR (Trademark Status & Document Retrieval) API
    // This checks for exact word marks
    const url = `https://tsdr.uspto.gov/documentretrieve?sn=&docId=&queryText=${encodeURIComponent(sld)}&format=json`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DomHunter/1.0 (trademark-check)",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.ok) {
      const data = await res.json() as any;
      // Parse USPTO response for active trademarks
      if (data?.trademarks && Array.isArray(data.trademarks)) {
        for (const tm of data.trademarks.slice(0, 5)) {
          if (tm.status === "LIVE" || tm.status === "REGISTERED") {
            matches.push({
              mark: tm.wordMark || sld,
              source: "USPTO",
              status: tm.status,
              registrationNumber: tm.registrationNumber,
              owner: tm.owner,
              matchType: tm.wordMark?.toLowerCase() === sld ? "exact" : "similar",
            });
          }
        }
      }
    }
  } catch (err) {
    logger.debug({ err, sld }, "USPTO lookup failed (non-critical)");
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════════════════════
// WIPO GLOBAL BRAND DATABASE CHECK
// ═══════════════════════════════════════════════════════════════════════════

async function checkWIPO(sld: string): Promise<TrademarkMatch[]> {
  const matches: TrademarkMatch[] = [];

  try {
    // WIPO Global Brand Database search
    const url = `https://branddb.wipo.int/brand-search/api/search?q=${encodeURIComponent(sld)}&type=wordMark&status=active&rows=5`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "DomHunter/1.0 (trademark-check)",
      },
      signal: AbortSignal.timeout(8_000),
    });

    if (res.ok) {
      const data = await res.json() as any;
      if (data?.results && Array.isArray(data.results)) {
        for (const result of data.results.slice(0, 5)) {
          const mark = result.brandName || result.wordMark || "";
          if (mark.toLowerCase() === sld || sld.includes(mark.toLowerCase())) {
            matches.push({
              mark,
              source: "WIPO Global Brand Database",
              status: "ACTIVE",
              registrationNumber: result.registrationNumber,
              owner: result.applicantName,
              matchType: mark.toLowerCase() === sld ? "exact" : "contains",
            });
          }
        }
      }
    }
  } catch (err) {
    logger.debug({ err, sld }, "WIPO lookup failed (non-critical)");
  }

  return matches;
}

// ═══════════════════════════════════════════════════════════════════════════
// RDAP REGISTRAR-BASED RISK (domains held by brand-protection registrars)
// ═══════════════════════════════════════════════════════════════════════════

const BRAND_PROTECTION_REGISTRARS = [
  "markmonitor",
  "corporatedomains",
  "csc corporate domains",
  "safenames",
  "brand protection",
  "comlaude",
  "ip mirror",
  "nom-iq",
];

function checkRegistrar(registrar?: string): TrademarkMatch | null {
  if (!registrar) return null;
  const lower = registrar.toLowerCase();

  for (const bp of BRAND_PROTECTION_REGISTRARS) {
    if (lower.includes(bp)) {
      return {
        mark: "Protected Domain",
        source: `Brand Protection Registrar: ${registrar}`,
        status: "PROTECTED",
        matchType: "exact",
      };
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN TRADEMARK CHECK FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Perform a comprehensive UDRP trademark risk check for a domain.
 * Combines local brand dictionary, USPTO, WIPO, and registrar analysis.
 */
export async function checkTrademarkRisk(
  domain: string,
  registrar?: string,
): Promise<TrademarkCheckResult> {
  const parts = domain.toLowerCase().split(".");
  const sld = parts.slice(0, parts.length - 1).join("");

  const allMatches: TrademarkMatch[] = [];

  // 1. Local brand check (instant)
  const localMatches = checkLocalBrands(sld);
  allMatches.push(...localMatches);

  // 2. Registrar check (instant)
  const regMatch = checkRegistrar(registrar);
  if (regMatch) allMatches.push(regMatch);

  // 3. Remote checks (only if local didn't find HIGH risk)
  if (localMatches.length === 0) {
    const [usptoMatches, wipoMatches] = await Promise.allSettled([
      checkUSPTO(sld),
      checkWIPO(sld),
    ]);

    if (usptoMatches.status === "fulfilled") {
      allMatches.push(...usptoMatches.value);
    }
    if (wipoMatches.status === "fulfilled") {
      allMatches.push(...wipoMatches.value);
    }
  }

  // Determine risk level
  let riskLevel: TrademarkRiskLevel = "NONE";
  let reason = "No trademark conflicts detected. Safe to purchase.";

  const hasExactMatch = allMatches.some((m) => m.matchType === "exact");
  const hasContainsMatch = allMatches.some((m) => m.matchType === "contains");
  const hasSimilarMatch = allMatches.some((m) => m.matchType === "similar");

  if (hasExactMatch) {
    riskLevel = "HIGH";
    const brand = allMatches.find((m) => m.matchType === "exact")!;
    reason = `UDRP RISK: "${brand.mark}" is a registered trademark (${brand.source}). This domain will almost certainly be subject to a UDRP dispute. DO NOT BUY.`;
  } else if (hasContainsMatch) {
    riskLevel = "HIGH";
    const brand = allMatches.find((m) => m.matchType === "contains")!;
    reason = `UDRP RISK: Domain contains the trademark "${brand.mark}" (${brand.source}). High risk of UDRP dispute and forced transfer. DO NOT BUY.`;
  } else if (hasSimilarMatch) {
    riskLevel = "MEDIUM";
    const brand = allMatches.find((m) => m.matchType === "similar")!;
    reason = `CAUTION: Domain is similar to trademark "${brand.mark}" (${brand.source}). Moderate UDRP risk — purchase with caution.`;
  } else if (allMatches.length > 0) {
    riskLevel = "LOW";
    reason = `Minor trademark similarity detected but unlikely to trigger UDRP. Generally safe.`;
  }

  logger.info(
    { domain, sld, riskLevel, matchCount: allMatches.length },
    "Trademark risk check complete",
  );

  return {
    domain,
    sld,
    riskLevel,
    matches: allMatches,
    reason,
    shouldAvoid: riskLevel === "HIGH",
  };
}
