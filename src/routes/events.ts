// ─── Events Route ─────────────────────────────────────────────────
// POST /events — ingest transfer events with idempotency.

import { Router, Request, Response } from "express";
import { eventSchema } from "../validation";
import { store } from "../store/memory";
import { logger } from "../logger";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  try {
    // Validate payload
    const parseResult = eventSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(422).json({
        error: "Validation error",
        details: parseResult.error.errors,
      });
    }

    const event = parseResult.data;

    // Add event to store
    const result = store.addEvent(event);

    // Log ingestion
    logger.info("Event ingested", {
      transfer_id: event.transfer_id,
      event_id: event.event_id,
      status: event.status,
      duplicate: result.isDuplicate,
    });

    if (result.isDuplicate) {
      return res.status(200).json({
        message: "Duplicate event, skipped",
        transfer_id: event.transfer_id,
      });
    }

    return res.status(201).json({
      message: "Event processed",
      transfer_id: event.transfer_id,
    });
  } catch (error) {
    logger.error("Error processing event", { error: String(error) });
    throw error; // Let error middleware handle it
  }
});

export default router;
