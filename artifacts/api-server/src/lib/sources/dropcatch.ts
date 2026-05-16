import type { DomainFeedItem } from "./types";
import { logger } from "../logger";

/**
 * DropCatch.com provides a daily CSV of domains dropping that day.
 * The download is publicly accessible (no account required).
 *
 * CSV format (typical): Domain,DropDate,TLD or just a list of domain names.
 * We handle both cases — column-based CSV and plain domain-per-line.
 */

// Direct CSV download URLs for DropCatch "Dropping Today/Tomorrow" lists
const DROPCATCH_DROPPING_TODAY_URL = "https://www.dropcatch.com/Downloads/DroppingToday.csv";
const DROPCATCH_DROPPING_TOMORROW_URL = "https://www.dropcatch.com/Downloads/DroppingTomorrow.csv";

/**
 * Pre-filter rules (cheap, local, zero cost):
 * 1. Max 11 characters SLD (excluding extension)
 * 2. No numbers, no hyphens
 * 3. Must be clean ASCII (no IDN/punycode)
 * 4. Common valuable TLDs only
 */
const VALUABLE_TLDS = new Set(["com", "io", "co", "ai", "app", "net", "org", "dev", "xyz"]);
const MAX_SLD_LENGTH = 11;

function isCleanSLD(sld: string): boolean {
  // No numbers, no hyphens, only lowercase ascii letters
  return /^[a-z]+$/.test(sld);
}

function parseDomainLine(line: string): { name: string; sld: string; tld: string } | null {
  // Handle CSV rows — take first column or the whole line
  const raw = line.split(",")[0].trim().toLowerCase();
  if (!raw || !raw.includes(".")) return null;

  // Strip quotes if present
  const cleaned = raw.replace(/^["']|["']$/g, "");

  const parts = cleaned.split(".");
  if (parts.length < 2) return null;

  const tld = parts[parts.length - 1];
  const sld = parts.slice(0, parts.length - 1).join(".");

  if (!sld || !tld) return null;

  return { name: cleaned, sld, tld };
}

/**
 * Parse raw CSV/text content into pre-filtered domain items.
 * Applies the core filtering rules locally (zero cost):
 * - Max 11 char SLD
 * - No numbers/hyphens (clean alpha only)
 * - Valuable TLDs only
 */
export function parseDropCatchCSV(csvContent: string): DomainFeedItem[] {
  const lines = csvContent.split(/\r?\n/);
  const results: DomainFeedItem[] = [];
  const seen = new Set<string>();

  // Skip header if it looks like one
  const startIdx = lines[0]?.toLowerCase().includes("domain") ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const parsed = parseDomainLine(line);
    if (!parsed) continue;

    const { name, sld, tld } = parsed;

    // ── Pre-filter (free, local) ──────────────────────────────────────────
    // 1. SLD length <= 11
    if (sld.length > MAX_SLD_LENGTH) continue;

    // 2. Clean alpha only (no numbers, no hyphens)
    if (!isCleanSLD(sld)) continue;

    // 3. Valuable TLD
    if (!VALUABLE_TLDS.has(tld)) continue;

    // 4. No punycode/IDN
    if (name.startsWith("xn--")) continue;

    // 5. Deduplicate
    if (seen.has(name)) continue;
    seen.add(name);

    results.push({ name, source: "dropcatch" });
  }

  return results;
}

/**
 * Fetch the daily "Dropping Today" CSV directly from DropCatch.
 * This is a publicly accessible direct CSV download (no account needed).
 * Falls back to "Dropping Tomorrow" if today's file isn't available yet.
 */
export async function fetchDropCatchCSV(): Promise<DomainFeedItem[] | null> {
  const urls = [DROPCATCH_DROPPING_TODAY_URL, DROPCATCH_DROPPING_TOMORROW_URL];

  for (const url of urls) {
    try {
      logger.info({ url }, "Fetching DropCatch dropping domains CSV...");

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0",
          Accept: "text/csv,text/plain,application/octet-stream,*/*",
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        logger.warn({ url, status: res.status }, "DropCatch CSV download returned non-200 — trying next");
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      const body = await res.text();

      // If we got HTML instead of CSV, try the next URL
      if (contentType.includes("text/html") && body.includes("<html")) {
        logger.warn({ url }, "DropCatch returned HTML instead of CSV — trying next");
        continue;
      }

      // Sanity check: CSV should have at least some domain-like content
      if (body.length < 50 || (!body.includes(".com") && !body.includes(".net") && !body.includes(".org"))) {
        logger.warn({ url, bodyLen: body.length }, "DropCatch response doesn't look like domain CSV — trying next");
        continue;
      }

      const items = parseDropCatchCSV(body);
      logger.info({ url, rawLines: body.split("\n").length, filtered: items.length }, "DropCatch CSV parsed and pre-filtered");
      return items;
    } catch (err) {
      logger.error({ url, err }, "Failed to fetch DropCatch CSV — trying next");
    }
  }

  logger.warn("All DropCatch CSV URLs failed — manual upload required");
  return null;
}

/**
 * Parse an uploaded CSV file content (for manual upload fallback).
 * This is the primary method — user downloads from DropCatch and uploads.
 */
export function parseUploadedCSV(content: string): DomainFeedItem[] {
  return parseDropCatchCSV(content);
}
