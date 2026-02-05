// ─── Input Validation ──────────────────────────────────────────────
// zod schemas for runtime validation at the API boundary.
// Types are inferred from schemas — single source of truth.

import { z } from "zod";
import { VALID_STATUSES } from "./constants";

export const eventSchema = z.object({
  transfer_id: z.string().min(1),
  event_id: z.string().min(1),
  status: z.enum(["initiated", "processing", "settled", "failed"]),
  timestamp: z.string().datetime(),
  reason: z.string().optional(),
});

export type ValidatedEvent = z.infer<typeof eventSchema>;
