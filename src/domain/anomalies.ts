// ─── Anomaly Detection ─────────────────────────────────────────────
// Pure functions to detect suspicious patterns in event history.

import type { TransferEvent, Warning, WarningType } from "../types";
import { TERMINAL_STATUSES } from "../constants";

/**
 * Detect all anomalies in event history.
 * Returns array of warnings (empty if none).
 */
export function detectAnomalies(events: TransferEvent[]): Warning[] {
  const warnings: Warning[] = [];

  // Run all detection rules
  warnings.push(...checkEventAfterTerminal(events));
  warnings.push(...checkConflictingTerminals(events));
  warnings.push(...checkMissingInitiated(events));
  warnings.push(...checkDuplicateStatus(events));

  return warnings;
}

/**
 * Check for events that occur after a terminal state.
 */
function checkEventAfterTerminal(events: TransferEvent[]): Warning[] {
  const warnings: Warning[] = [];

  // Find the first terminal event (by timestamp order)
  let firstTerminalIndex = -1;
  for (let i = 0; i < events.length; i++) {
    if (TERMINAL_STATUSES.includes(events[i].status)) {
      firstTerminalIndex = i;
      break;
    }
  }

  if (firstTerminalIndex === -1) return warnings; // No terminal event

  // Check if any events come after the terminal event
  const terminalTimestamp = new Date(events[firstTerminalIndex].timestamp).getTime();
  const afterTerminalEvents: TransferEvent[] = [];

  for (let i = firstTerminalIndex + 1; i < events.length; i++) {
    const eventTimestamp = new Date(events[i].timestamp).getTime();
    if (eventTimestamp > terminalTimestamp) {
      afterTerminalEvents.push(events[i]);
    }
  }

  if (afterTerminalEvents.length > 0) {
    warnings.push({
      type: "event_after_terminal",
      message: `Activity detected after transfer reached terminal state (${events[firstTerminalIndex].status})`,
      event_ids: afterTerminalEvents.map((e) => e.event_id),
    });
  }

  return warnings;
}

/**
 * Check for conflicting terminal states (both settled and failed).
 */
function checkConflictingTerminals(events: TransferEvent[]): Warning[] {
  const warnings: Warning[] = [];

  const hasSettled = events.some((e) => e.status === "settled");
  const hasFailed = events.some((e) => e.status === "failed");

  if (hasSettled && hasFailed) {
    const settledEvents = events.filter((e) => e.status === "settled");
    const failedEvents = events.filter((e) => e.status === "failed");

    warnings.push({
      type: "conflicting_terminals",
      message: "Both settled and failed states received",
      event_ids: [
        ...settledEvents.map((e) => e.event_id),
        ...failedEvents.map((e) => e.event_id),
      ],
    });
  }

  return warnings;
}

/**
 * Check for missing initiated event.
 */
function checkMissingInitiated(events: TransferEvent[]): Warning[] {
  const warnings: Warning[] = [];

  const hasInitiated = events.some((e) => e.status === "initiated");

  if (!hasInitiated && events.length > 0) {
    warnings.push({
      type: "missing_initiated",
      message: "No initiated event found in transfer history",
      event_ids: events.map((e) => e.event_id),
    });
  }

  return warnings;
}

/**
 * Check for duplicate status (same status reported multiple times with different event_ids).
 */
function checkDuplicateStatus(events: TransferEvent[]): Warning[] {
  const warnings: Warning[] = [];

  // Group events by status
  const statusGroups = new Map<string, TransferEvent[]>();
  for (const event of events) {
    if (!statusGroups.has(event.status)) {
      statusGroups.set(event.status, []);
    }
    statusGroups.get(event.status)!.push(event);
  }

  // Check each status group for duplicates
  for (const [status, statusEvents] of statusGroups.entries()) {
    if (statusEvents.length > 1) {
      warnings.push({
        type: "duplicate_status",
        message: `Multiple events report status "${status}"`,
        event_ids: statusEvents.map((e) => e.event_id),
      });
    }
  }

  return warnings;
}
