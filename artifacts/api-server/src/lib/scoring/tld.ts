const TLD_SCORES: Record<string, number> = {
  com: 100,
  ai: 88,
  io: 78,
  co: 72,
  app: 68,
  dev: 65,
  net: 62,
  org: 58,
  gg: 55,
  me: 50,
  xyz: 32,
  info: 28,
  biz: 25,
};

export function tldScore(tld: string): number {
  return TLD_SCORES[tld.toLowerCase().replace(".", "")] ?? 20;
}
