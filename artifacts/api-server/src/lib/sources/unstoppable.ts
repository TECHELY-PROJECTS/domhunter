import type { DomainFeedItem } from "./types";
import { logger } from "../logger";

/**
 * Unstoppable Domains — Expiring Traditional Domains API
 * 
 * Uses the ud_expireds_list endpoint to fetch traditional domains (com/net/io/etc)
 * that are expiring/pending-delete. These are real ICANN domains that can be
 * backordered or hand-registered once they drop.
 * 
 * Requires UNSTOPPABLE_API_KEY env var.
 * 
 * Workflow per API provider:
 *   1. Search expiring domains via ud_expireds_list
 *   2. Optionally create backorders via ud_backorder_create
 * 
 * API: POST https://api.unstoppabledomains.com/mcp/v1/actions/ud_expireds_list
 */

const UD_API_URL = "https://api.unstoppabledomains.com/mcp/v1/actions/ud_expireds_list";

// Unstoppable Domains web3 TLDs that have resale value
// NOTE: UD's pending-delete API returns web3 domains (not traditional ICANN domains)
// We accept all of them and filter later based on what makes sense for flipping
const ACCEPTED_TLDS = ["com", "net", "org", "io", "co", "ai", "app", "dev", "xyz", "me", "info", "cc", "biz",
  // Web3 TLDs from Unstoppable Domains marketplace
  "x", "crypto", "wallet", "nft", "dao", "blockchain", "bitcoin", "888", "zil"];
const MAX_PAGES = 20;
const PAGE_SIZE = 500;

/**
 * Fetch expiring traditional domains from Unstoppable Domains API.
 * Paginates through results to get a large pool of domains for scoring.
 * Only returns traditional TLD domains (com, net, io, etc).
 */
export async function fetchUnstoppableDomains(): Promise<DomainFeedItem[] | null> {
  const apiKey = process.env.UNSTOPPABLE_API_KEY;
  if (!apiKey) {
    logger.warn("UNSTOPPABLE_API_KEY not set — cannot fetch expiring domains");
    return null;
  }

  const allDomains: DomainFeedItem[] = [];
  let offset = 0;
  let hasMore = true;
  let pageCount = 0;

  logger.info({ tlds: TRADITIONAL_TLDS }, "Fetching expiring traditional domains from Unstoppable Domains API...");

  while (hasMore && pageCount < MAX_PAGES) {
    try {
      const requestBody = {
        sortBy: "deletionAt",
        sortDirection: "ASC",
        limit: PAGE_SIZE,
        offset,
      };

      logger.debug({ offset, page: pageCount }, "Fetching UD expireds page");

      const res = await fetch(UD_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        const errText = await res.text().then((t) => t.slice(0, 500));
        logger.error({ status: res.status, body: errText, offset }, "Unstoppable Domains API error");
        // If we already have some domains, return them; otherwise fail
        if (allDomains.length > 0) break;
        return null;
      }

      let raw: any;
      try {
        raw = await res.json();
      } catch (parseErr) {
        logger.error({ parseErr, offset }, "Failed to parse UD API JSON response");
        break;
      }

      // The API might wrap the response — handle various formats
      const responseData = raw?.data ?? raw?.result ?? raw;
      const domains: any[] = responseData?.domains ?? responseData?.items ?? responseData?.results ?? [];
      const pagination = responseData?.pagination ?? responseData?.meta ?? {};

      if (!Array.isArray(domains)) {
        logger.warn({ responseKeys: Object.keys(responseData || {}), raw: JSON.stringify(raw).slice(0, 500) }, "Unexpected UD API response structure — trying to extract domains");
        // If the response itself is an array, use it directly
        if (Array.isArray(raw)) {
          for (const d of raw) {
            const name = (d.name || d.domain || d.domainName || "").toLowerCase().trim();
            if (name && name.includes(".")) {
              allDomains.push({ name, source: "unstoppable" });
            }
          }
          hasMore = false;
          break;
        }
        break;
      }

      let addedThisPage = 0;
      for (const d of domains) {
        // Handle various possible field names from the API
        const name = (d.name || d.domain || d.domainName || "").toLowerCase().trim();
        if (!name) continue;

        // Accept all domains (web3 and traditional) — the ingest route filters
        // If no dot, it's likely a web3 domain label — skip (we need full names)
        if (!name.includes(".")) continue;

        allDomains.push({
          name,
          source: "unstoppable",
        });
        addedThisPage++;
      }

      logger.debug({ page: pageCount, domainsOnPage: domains.length, accepted: addedThisPage, totalSoFar: allDomains.length }, "UD page processed");

      // Determine if there are more pages
      hasMore = pagination?.hasMore ?? pagination?.has_more ?? (domains.length >= PAGE_SIZE);
      offset = pagination?.nextOffset ?? pagination?.next_offset ?? (offset + PAGE_SIZE);
      pageCount++;

      // If we got 0 domains on this page, stop
      if (domains.length === 0) {
        hasMore = false;
      }

      // Small delay between pages to be respectful
      if (hasMore) {
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      logger.error({ err, offset, pageCount }, "Unstoppable Domains API fetch failed");
      break;
    }
  }

  logger.info({ total: allDomains.length, pages: pageCount }, "Unstoppable Domains fetch complete — traditional domains only");
  return allDomains.length > 0 ? allDomains : null;
}
