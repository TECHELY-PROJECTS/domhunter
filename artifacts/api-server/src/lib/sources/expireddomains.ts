import * as cheerio from "cheerio";
import type { DomainFeedItem } from "./types";

// Different expired-domain lists by TLD on expireddomains.net
const TLD_LISTS: Record<string, string> = {
  com: "deleted-com-domains",
  net: "deleted-net-domains",
  org: "deleted-org-domains",
  io:  "deleted-io-domains",
  co:  "deleted-co-domains",
  ai:  "deleted-ai-domains",
  app: "deleted-app-domains",
};

async function scrapeSingleList(
  sessionCookie: string,
  listPath: string,
  pagesPerList: number,
  pageOffset: number,
): Promise<DomainFeedItem[]> {
  const BASE = "https://www.expireddomains.net";
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0",
    Accept: "text/html,application/xhtml+xml",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: `ef_session=${sessionCookie}`,
    Referer: BASE,
  };

  const results: DomainFeedItem[] = [];

  for (let p = 0; p < pagesPerList; p++) {
    const startRow = (pageOffset + p) * 25;
    const url = `${BASE}/${listPath}/?start=${startRow}`;
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    } catch {
      break;
    }
    if (!res.ok) break;

    const $ = cheerio.load(await res.text());
    let found = 0;

    $("table.base1 tr")
      .slice(1)
      .each((_, row) => {
        const domain = $(row)
          .find("td.field_domain a")
          .first()
          .text()
          .trim()
          .toLowerCase();
        if (domain && domain.includes(".") && domain.length < 100 && !domain.startsWith("xn--")) {
          const blText = $(row).find("td").eq(1).text().trim();
          const blMatch = blText.match(/^(\d+(?:\.\d+)?)\s*([Kk])?/);
          const backlinks = blMatch
            ? Math.round(parseFloat(blMatch[1]) * (blMatch[2] ? 1000 : 1))
            : undefined;
          results.push({ name: domain, source: "expired_domains", backlinks });
          found++;
        }
      });

    // No rows means we've hit the end of the list — stop early
    if (found === 0) break;

    if (p < pagesPerList - 1) {
      await new Promise((r) => setTimeout(r, 1500));
    }
  }

  return results;
}

/**
 * Scrape multiple TLD lists from expireddomains.net.
 * @param sessionCookie  ef_session cookie value
 * @param pagesPerList   pages to fetch from each TLD list (default 4 → 100 domains/list)
 * @param pageOffset     start from this page index to avoid re-fetching already-stored domains
 * @param tlds           which TLD lists to scrape (defaults to com + io + net + co)
 */
export async function fetchExpiredDomainsScrape(
  sessionCookie: string,
  pagesPerList = 4,
  pageOffset = 0,
  tlds: string[] = ["com", "io", "net", "co"],
): Promise<DomainFeedItem[]> {
  const all: DomainFeedItem[] = [];

  for (const tld of tlds) {
    const listPath = TLD_LISTS[tld];
    if (!listPath) continue;
    const items = await scrapeSingleList(sessionCookie, listPath, pagesPerList, pageOffset);
    all.push(...items);
    // Polite delay between different TLD lists
    if (tld !== tlds[tlds.length - 1]) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return all;
}
