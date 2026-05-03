import * as cheerio from "cheerio";
import type { DomainFeedItem } from "./types";

export async function fetchExpiredDomainsScrape(
  sessionCookie: string,
  maxPages = 5,
): Promise<DomainFeedItem[]> {
  const BASE = "https://www.expireddomains.net";
  const LIST = `${BASE}/deleted-com-domains/`;
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: `ef_session=${sessionCookie}`,
    Referer: BASE,
  };

  const results: DomainFeedItem[] = [];

  for (let page = 0; page < maxPages; page++) {
    const url = `${LIST}?start=${page * 25}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      break;
    }
    if (!res.ok) break;

    const $ = cheerio.load(await res.text());

    $("table.base1 tr")
      .slice(1)
      .each((_, row) => {
        const domain = $(row)
          .find("td.field_domain a")
          .text()
          .trim()
          .toLowerCase();
        if (domain && domain.includes(".") && !domain.startsWith("xn--")) {
          const blText = $(row).find("td").eq(1).text().trim();
          const blMatch = blText.match(/^(\d+(?:\.\d+)?)\s*([Kk])?/);
          const backlinks = blMatch
            ? Math.round(
                parseFloat(blMatch[1]) * (blMatch[2] ? 1000 : 1),
              )
            : undefined;

          results.push({
            name: domain,
            source: "expireddomains",
            backlinks,
          });
        }
      });

    if (page < maxPages - 1) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  return results;
}
