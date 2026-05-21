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
const VALUABLE_TLDS = ["com", "net", "io", "co", "ai", "org", "app", "dev", "xyz", "me", "cc", "info"];
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
        const errText = await res.text().then((t) => t.slice(0, 500));
        logger.error({ status: res.status, err: errText }, "Unstoppable Domains API error");
        if (allDomains.length > 0) break; // Return what we have
        return null;
      }

      let data: UDResponse;
      try {
        const raw = await res.json();
        // Handle potential wrapper formats
        data = raw.data ?? raw.result ?? raw;
        if (!data.domains) data = { domains: [], pagination: { count: 0, offset: 0, limit: 500, hasMore: false } };
        if (!Array.isArray(data.domains)) {
          logger.warn({ raw: JSON.stringify(raw).slice(0, 300) }, "Unexpected UD API response format");
          break;
        }
      } catch (parseErr) {
        logger.error({ parseErr }, "Failed to parse UD API response");
        break;
      }

      for (const d of data.domains) {
        if (!d.name) continue;
        const name = d.name.toLowerCase().trim();
        // Accept domains with dots (traditional format)
        if (name.includes(".")) {
          allDomains.push({
            name,
            source: "unstoppable",
          });
        }
      }

      hasMore = data.pagination?.hasMore ?? false;
      offset = data.pagination?.nextOffset ?? offset + 500;
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
