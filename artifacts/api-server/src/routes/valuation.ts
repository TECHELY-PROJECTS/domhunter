import { Router, type IRouter } from "express";
import { parseUploadedCSV } from "../lib/sources/dropcatch";
import { preScoreAndFilter, aiValuateTop30, localPreScore } from "../lib/scoring/ai-valuation";
import type { ValuatedDomain } from "../lib/scoring/ai-valuation";

const router: IRouter = Router();

/**
 * POST /api/valuation/top30
 * 
 * Accepts a CSV of dropping domains and returns the AI-curated top 30 picks.
 * 
 * Body: { csv: string } — raw CSV content from DropCatch download
 * 
 * Response: {
 *   preFiltered: number,
 *   candidates: number,
 *   top30: ValuatedDomain[]
 * }
 * 
 * This is a standalone endpoint for on-demand valuation without persisting
 * to the database (useful for quick analysis before committing to ingest).
 */
router.post("/valuation/top30", async (req, res) => {
  try {
    const csv = req.body?.csv as string | undefined;

    if (!csv || typeof csv !== "string" || csv.trim().length === 0) {
      return res.status(400).json({
        error: "Missing 'csv' field. Provide the raw CSV content from DropCatch download (https://www.dropcatch.com/downloads).",
      });
    }

    req.log.info("Running AI domain valuation on uploaded CSV...");

    // Step 1: Parse and pre-filter (free)
    const items = parseUploadedCSV(csv);
    req.log.info({ preFiltered: items.length }, "CSV pre-filtered (≤11 chars, alpha-only, valuable TLDs)");

    if (items.length === 0) {
      return res.status(200).json({
        preFiltered: 0,
        candidates: 0,
        top30: [],
        message: "No domains passed pre-filtering. Ensure CSV contains domains with ≤11 char SLD, no numbers/hyphens, and common TLDs (.com/.io/.ai/.co/.net).",
      });
    }

    // Step 2: Local pre-scoring (free) — narrows to top 200
    const candidates = preScoreAndFilter(items, 200);
    req.log.info({ candidates: candidates.length }, "Local pre-scoring complete");

    // Step 3: AI valuation (cascading free → paid) — picks top 30
    const top30 = await aiValuateTop30(candidates);
    req.log.info({ top30: top30.length }, "AI valuation complete");

    return res.status(200).json({
      preFiltered: items.length,
      candidates: candidates.length,
      top30,
    });
  } catch (err) {
    req.log.error({ err }, "Valuation failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/valuation/prescore
 * 
 * Quick local-only scoring (no AI, zero cost).
 * Returns all domains that pass pre-filtering with their local scores and tiers.
 * 
 * Body: { csv: string, limit?: number }
 */
router.post("/valuation/prescore", async (req, res) => {
  try {
    const csv = req.body?.csv as string | undefined;
    const limit = (req.body?.limit as number) ?? 100;

    if (!csv || typeof csv !== "string" || csv.trim().length === 0) {
      return res.status(400).json({
        error: "Missing 'csv' field. Provide the raw CSV content from DropCatch download.",
      });
    }

    const items = parseUploadedCSV(csv);
    const scored = preScoreAndFilter(items, limit);

    return res.status(200).json({
      preFiltered: items.length,
      results: scored,
    });
  } catch (err) {
    req.log.error({ err }, "Prescore failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/valuation/single
 * 
 * Score a single domain locally (instant, free).
 * Body: { domain: string }
 */
router.post("/valuation/single", async (req, res) => {
  try {
    const domain = req.body?.domain as string | undefined;

    if (!domain || typeof domain !== "string") {
      return res.status(400).json({ error: "Missing 'domain' field." });
    }

    const result = localPreScore(domain.toLowerCase().trim());

    if (!result) {
      return res.status(200).json({
        domain,
        passes: false,
        reason: "Domain does not meet criteria (length > 11, contains numbers/hyphens, unpronounceable, or unsupported TLD).",
      });
    }

    return res.status(200).json({
      domain,
      passes: true,
      ...result,
    });
  } catch (err) {
    req.log.error({ err }, "Single valuation failed");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
