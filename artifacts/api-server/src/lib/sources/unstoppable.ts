import type { DomainFeedItem } from "./types";
import { logger } from "../logger";

/**
 * Unstoppable Domains Pending-Delete API
 * 
 * Fetches domains approaching expiration from the UD marketplace.
 * Requires UNSTOPPABLE_API_KEY env var (free from unstoppabledomains.com).
 * 
 * API: POST https://api.unstoppabledomains.com/mcp/v1/actions/ud_expireds_list
 */

const UD_API_URL = "https://api.unstoppabledomains.com/mcp/v1/actions/ud_expireds_list";
const VALUABLE_TLDS = ["com", "net", "io", "co", "ai", "org", "app", "dev"];
const MAX_PAGES = 20; // Max 20 pages × 500 = 10,000 domains max

interface UDDomain {
  name: string;
  deletionDate?: string;
  status?: string;
  labelLength?: number;
}

interface UDResponse {
  domains: UDDomain[];
  pagination: {
    count: number;
    offset: number;
    limit: number;
    hasMore: boolean;
    nextOffset?: number;
  };
}

/**
 * Fetch all pending-delete domains from Unstoppable Domains API.
 * Paginates through all results automatically.
 * Returns raw domain items for filtering by the scoring pipeline.
 */
export async function fetchUnstoppableDomains(): Promise<DomainFeedItem[] | null> {
  const apiKey = process.env.UNSTOPPABLE_API_KEY;
  if (!apiKey) {
    logger.warn("UNSTOPPABLE_API_KEY not set — cannot fetch pending-delete domains");
    return null;
  }

  const allDomains: DomainFeedItem[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;

  logger.info("Fetching pending-delete domains from Unstoppable Domains...");

  while (hasMore && pageCount < MAX_PAGES) {
    try {
      const res = await fetch(UD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          tlds: VALUABLE_TLDS,
          sortBy: "deletionAt",
          sortDirection: "ASC",
          limit: 500,
          offset,
        }),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text().then((t) => t.slice(0, 200));
        logger.error({ status: res.status, err: errText }, "Unstoppable Domains API error");
        if (allDomains.length > 0) break; // Return what we have
        return null;
      }

      const data = (await res.json()) as UDResponse;

      for (const d of data.domains) {
        if (!d.name || !d.name.includes(".")) continue;
        allDomains.push({
          name: d.name.toLowerCase(),
          source: "unstoppable",
        });
      }

      hasMore = data.pagination.hasMore;
      offset = data.pagination.nextOffset ?? offset + 500;
      pageCount++;

      // Small delay between pages
      if (hasMore) {
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      logger.error({ err, offset, pageCount }, "Unstoppable Domains API fetch failed");
      break;
    }
  }

  logger.info({ total: allDomains.length, pages: pageCount }, "Unstoppable Domains fetch complete");
  return allDomains.length > 0 ? allDomains : null;
}
