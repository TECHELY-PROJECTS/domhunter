const KEYWORD_MAP: Record<string, number> = {
  insurance: 95,
  mortgage: 90,
  loan: 85,
  attorney: 82,
  lawyer: 80,
  credit: 70,
  invest: 65,
  trading: 62,
  finance: 60,
  bank: 58,
  tax: 52,
  fund: 48,
  wealth: 45,
  pay: 42,
  cash: 38,
  coin: 35,
  crypto: 32,
  ai: 80,
  cloud: 55,
  saas: 52,
  cyber: 50,
  data: 45,
  api: 42,
  tech: 38,
  code: 32,
  dev: 30,
  app: 28,
  bot: 25,
  vpn: 45,
  host: 35,
  health: 68,
  dental: 72,
  rehab: 78,
  medical: 62,
  pharma: 65,
  therapy: 58,
  care: 45,
  fit: 35,
  med: 52,
  doc: 38,
  vita: 32,
  realty: 55,
  homes: 48,
  property: 45,
  rental: 42,
  estate: 40,
  hub: 25,
  lab: 22,
  forge: 20,
  base: 20,
  flow: 22,
  sync: 20,
  dash: 18,
};

export function keywordValueScore(name: string): number {
  const n = name.toLowerCase();
  let best = 0;
  for (const [kw, score] of Object.entries(KEYWORD_MAP)) {
    if (n.startsWith(kw) || n.endsWith(kw)) {
      best = Math.max(best, score);
    }
  }
  return best;
}
