export interface BacklinkResult {
  domain: string;
  totalLinks: number;
  referringDomains: number;
}

export async function getBacklinks(
  domain: string,
): Promise<BacklinkResult | null> {
  try {
    const res = await fetch(
      `https://openlinkprofiler.org/api/links/${domain}?limit=1&type=json`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; DomHunter/1.0)" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      total_links?: number;
      linking_domains?: number;
    };

    return {
      domain,
      totalLinks: data.total_links ?? 0,
      referringDomains: data.linking_domains ?? 0,
    };
  } catch {
    return null;
  }
}
