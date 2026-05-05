const NICHE_KEYWORDS: Record<string, string[]> = {
  tech: [
    "tech", "dev", "code", "app", "soft", "cloud", "data", "ai", "bot",
    "sys", "api", "web", "byte", "bit", "stack", "hub", "base", "forge",
    "lab", "logic", "smart", "auto", "cyber", "flux", "grid", "node",
    "link", "sync", "proto", "kernel", "algo", "cpu", "gpu", "stream",
    "script", "server", "host", "saas", "paas", "infra", "deploy",
  ],
  finance: [
    "fin", "fund", "cap", "invest", "pay", "bank", "coin", "trade",
    "wealth", "money", "cash", "credit", "loan", "asset", "equity",
    "venture", "peak", "alpha", "quant", "profit", "yield", "rate",
    "ledger", "hedge", "forex", "index", "bond", "tax", "audit", "budget",
  ],
  health: [
    "health", "med", "fit", "well", "vita", "care", "life", "body",
    "mind", "bio", "cure", "clinic", "pharma", "yoga", "diet", "lean",
    "pure", "heal", "nutrient", "strong", "gym", "sport", "rehab",
  ],
  ecommerce: [
    "shop", "buy", "sell", "store", "mart", "market", "deal", "price",
    "cart", "prime", "drop", "ship", "supply", "retail", "goods", "direct",
    "order", "delivery", "haul", "bundle", "brand", "product",
  ],
  media: [
    "media", "news", "video", "stream", "cast", "photo", "pic", "art",
    "film", "play", "sound", "beat", "studio", "creative", "press",
    "blog", "pod", "lens", "snap", "reel", "post", "content", "creator",
  ],
  legal: [
    "law", "legal", "court", "rights", "just", "firm", "atty", "counsel",
    "notary", "justice", "advocate", "policy", "contract", "compliance",
  ],
  realestate: [
    "home", "house", "prop", "real", "estate", "land", "realty", "lodge",
    "space", "place", "build", "arch", "loft", "haven", "abode", "nest",
    "roof", "villa", "manor", "lease", "rent", "tenant",
  ],
};

export function detectNiche(sld: string): string {
  const lower = sld.toLowerCase();
  for (const [niche, keywords] of Object.entries(NICHE_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) return niche;
  }
  return "general";
}

export function computeBrandScore(
  pronounceScore: number,
  lengthScore: number,
  keywordScore: number,
): number {
  return Math.min(
    100,
    Math.round(pronounceScore * 0.5 + lengthScore * 0.35 + keywordScore * 0.15),
  );
}
