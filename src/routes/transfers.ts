// ─── Transfers Route ──────────────────────────────────────────────
// GET /transfers/version — lightweight version check for polling
// GET /transfers/:id — single transfer
// GET /transfers — list transfers with optional filters
// POST /transfers/:id/recompute — recompute transfer state from events

import { Router, Request, Response } from "express";
import { store } from "../store/memory";

const router = Router();

router.get("/version", (_req: Request, res: Response) => {
  return res.json({
    version: store.getVersion(),
    affected_transfer_ids: store.getAffectedTransferIds(),
  });
});

router.get("/:id", (req: Request, res: Response) => {
  const transferId = req.params.id as string;
  const transfer = store.getTransfer(transferId);

  if (!transfer) {
    return res.status(404).json({
      error: "Transfer not found",
    });
  }

  return res.json(transfer);
});

router.get("/", (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  const has_warnings = req.query.has_warnings as string | undefined;

  const filters: {
    status?: string;
    has_warnings?: boolean;
  } = {};

  if (status) {
    filters.status = status;
  }

  if (has_warnings !== undefined) {
    filters.has_warnings = has_warnings === "true";
  }

  const result = store.listTransfers(filters);
  return res.json(result);
});

router.post("/:id/recompute", (req: Request, res: Response) => {
  const transferId = req.params.id as string;
  const transfer = store.recomputeTransfer(transferId);

  if (!transfer) {
    return res.status(404).json({ error: "Transfer not found" });
  }

  return res.json(transfer);
});

export default router;
