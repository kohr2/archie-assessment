// ─── Status Computation ───────────────────────────────────────────
// Pure function to derive transfer state from event history.

import type { TransferEvent, Transfer } from "../types";
import { TERMINAL_STATUSES } from "../constants";
import { detectAnomalies } from "./anomalies";

/**
 * Compute transfer state from event history.
 * Events are sorted by (timestamp, event_id) before deriving status.
 */
export function computeTransferState(
  transferId: string,
  events: TransferEvent[]
): Transfer {
  if (events.length === 0) {
    throw new Error(`No events found for transfer ${transferId}`);
  }

  // Sort by timestamp, then event_id as tiebreaker
  const sortedEvents = [...events].sort((a, b) => {
    const timeDiff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return a.event_id.localeCompare(b.event_id);
  });

  // Current status = last event in sorted order
  const lastEvent = sortedEvents[sortedEvents.length - 1];
  const current_status = lastEvent.status;

  // Terminal detection
  const is_terminal = TERMINAL_STATUSES.includes(current_status);

  // Last updated = timestamp of latest event
  const last_updated = lastEvent.timestamp;

  // Detect anomalies
  const warnings = detectAnomalies(sortedEvents);
  const has_warnings = warnings.length > 0;

  return {
    transfer_id: transferId,
    current_status,
    is_terminal,
    has_warnings,
    last_updated,
    event_count: events.length,
    warnings,
    events: sortedEvents,
  };
}
