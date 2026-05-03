import { Router, type IRouter } from "express";
import healthRouter from "./health";
import domainsRouter from "./domains";
import watchlistRouter from "./watchlist";
import analyticsRouter from "./analytics";
import brandCheckerRouter from "./brandchecker";
import ingestRouter from "./ingest";
import enrichmentRouter from "./enrichment";

const router: IRouter = Router();

router.use(healthRouter);
router.use(domainsRouter);
router.use(watchlistRouter);
router.use(analyticsRouter);
router.use(brandCheckerRouter);
router.use(ingestRouter);
router.use(enrichmentRouter);

export default router;
