// ─── Constants ────────────────────────────────────────────────────
// No magic values — all domain constants defined here.

import type { Status } from "./types";

export const TERMINAL_STATUSES: readonly Status[] = ["settled", "failed"] as const;

export const VALID_STATUSES: readonly Status[] = [
  "initiated",
  "processing",
  "settled",
  "failed",
] as const;

export const DEFAULT_PORT = 3000;
