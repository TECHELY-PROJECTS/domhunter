export interface PageRankResult {
  domain: string;
  rank: number;
  da: number;
}

export async function getPageRank(
  domains: string[],
): Promise<Map<string, PageRankResult>> {
  const apiKey = process.env.OPENPAGERANK_API_KEY;
  if (!apiKey) return new Map();

  const chunks: string[][] = [];
  for (let i = 0; i < domains.length; i += 100) {
    chunks.push(domains.slice(i, i + 100));
  }

  const results = new Map<string, PageRankResult>();

  for (const chunk of chunks) {
    const params = chunk
      .map((d) => `domains[]=${encodeURIComponent(d)}`)
      .join("&");
    let res: Response;
    try {
      res = await fetch(
        `https://openpagerank.com/api/v1.0/getPageRank?${params}`,
        {
          headers: { "API-OPR": apiKey },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch {
      continue;
    }
    if (!res.ok) continue;

    const data = (await res.json()) as {
      response?: Array<{
        domain?: string;
        page_rank_integer?: number;
        page_rank_decimal?: number;
      }>;
    };

    for (const item of data.response ?? []) {
      if (item.domain) {
        results.set(item.domain, {
          domain: item.domain,
          rank: item.page_rank_integer ?? 0,
          da: Math.round((item.page_rank_decimal ?? 0) * 10),
        });
      }
    }
  }

  return results;
}
