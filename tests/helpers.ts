// ─── Test Helpers ───────────────────────────────────────────────
// Factory functions for building test events. Used by both unit
// tests (inline) and the shared fixtures/seed script.

import type { TransferEvent, Status } from "../src/types";

let counter = 0;

/**
 * Create a single TransferEvent with sensible defaults.
 * Override any field via the partial argument.
 */
export function makeEvent(
  overrides: Partial<TransferEvent> & { transfer_id: string; status: Status }
): TransferEvent {
  counter++;
  return {
    event_id: `evt_${counter}`,
    timestamp: new Date(Date.UTC(2024, 0, 5, 12, 0, counter)).toISOString(),
    ...overrides,
  };
}

/**
 * Create a sequence of events for a single transfer.
 * Each entry is a [status, timestampOffset?] tuple or just a status string.
 * Timestamps are spaced 90 seconds apart by default.
 *
 * Example:
 *   makeEvents("tr_1", ["initiated", "processing", "settled"])
 *   makeEvents("tr_1", [
 *     { status: "initiated" },
 *     { status: "failed", reason: "insufficient_funds" }
 *   ])
 */
export function makeEvents(
  transferId: string,
  steps: Array<Status | (Partial<TransferEvent> & { status: Status })>
): TransferEvent[] {
  const baseTime = Date.UTC(2024, 0, 5, 12, 0, 0);
  return steps.map((step, i) => {
    const partial = typeof step === "string" ? { status: step as Status } : step;
    return {
      transfer_id: transferId,
      event_id: partial.event_id ?? `evt_${transferId}_${i + 1}`,
      status: partial.status,
      timestamp:
        partial.timestamp ??
        new Date(baseTime + i * 90_000).toISOString(),
      ...(partial.reason !== undefined ? { reason: partial.reason } : {}),
    };
  });
}

/**
 * Reset the auto-increment counter (call in beforeEach if needed).
 */
export function resetCounter(): void {
  counter = 0;
}
