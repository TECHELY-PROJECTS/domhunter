import type { DomainFeedItem } from "./types";

export async function fetchNameJetRSS(): Promise<DomainFeedItem[]> {
  const url = "https://www.namejet.com/Pages/RSS.aspx";
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; DomHunter/1.0)" },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return [];
  }
  if (!res.ok) return [];
  const xml = await res.text();

  const items: DomainFeedItem[] = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);

  for (const match of itemMatches) {
    const block = match[1];
    const title =
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
      block.match(/<title>(.*?)<\/title>/)?.[1];
    const link = block.match(/<link>(.*?)<\/link>/)?.[1];
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim();

    if (title?.includes(".")) {
      items.push({
        name: title.toLowerCase().trim(),
        source: "namejet",
        auctionUrl: link,
        auctionEndAt: pubDate ? new Date(pubDate) : undefined,
      });
    }
  }
  return items.slice(0, 200);
}
