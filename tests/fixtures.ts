// ─── Shared Test & Demo Fixtures ────────────────────────────────
// Single source of truth for all transfer scenarios. Used by:
//   - Unit/integration tests (import and assert against expected outcomes)
//   - Seed script (POST events to running server for demo UI)
//
// Each scenario has:
//   - events: the raw events in ARRIVAL order (may differ from timestamp order)
//   - expected: what the system should derive after processing all events

import type { TransferEvent, Status, WarningType } from "../src/types";
import { makeEvents } from "./helpers";

export interface ScenarioExpectation {
  current_status: Status;
  is_terminal: boolean;
  warning_types: WarningType[];
  event_count: number;
}

export interface Scenario {
  name: string;
  description: string;
  events: TransferEvent[];
  expected: ScenarioExpectation;
}

// ─── Scenarios ──────────────────────────────────────────────────

/**
 * Clean transfer: initiated → processing → settled.
 * No warnings, terminal.
 */
export const happyPath: Scenario = {
  name: "Happy path",
  description: "Clean transfer lifecycle with no anomalies",
  events: makeEvents("tr_happy", ["initiated", "processing", "settled"]),
  expected: {
    current_status: "settled",
    is_terminal: true,
    warning_types: [],
    event_count: 3,
  },
};

/**
 * Events arrive in wrong order but timestamps are correct.
 * settled arrives first, then initiated, then processing.
 * System should sort by timestamp and derive status = settled.
 */
export const outOfOrder: Scenario = {
  name: "Out-of-order arrival",
  description: "Events arrive out of order but timestamps reconstruct the correct timeline",
  events: (() => {
    const evts = makeEvents("tr_ooo", ["initiated", "processing", "settled"]);
    // Arrival order: settled, initiated, processing
    return [evts[2], evts[0], evts[1]];
  })(),
  expected: {
    current_status: "settled",
    is_terminal: true,
    warning_types: [],
    event_count: 3,
  },
};

/**
 * Both settled and failed present → conflicting_terminals.
 * Also triggers event_after_terminal (failed comes after settled by timestamp).
 */
export const conflictingTerminals: Scenario = {
  name: "Conflicting terminals",
  description: "Transfer has both settled and failed events — critical anomaly",
  events: makeEvents("tr_conflict", [
    "initiated",
    "processing",
    "settled",
    { status: "failed", reason: "chargeback" },
  ]),
  expected: {
    current_status: "failed",
    is_terminal: true,
    warning_types: ["conflicting_terminals", "event_after_terminal"],
    event_count: 4,
  },
};

/**
 * Processing event arrives with timestamp after settled.
 * Triggers event_after_terminal.
 */
export const eventAfterTerminal: Scenario = {
  name: "Event after terminal",
  description: "Activity detected after transfer reached a terminal state",
  events: makeEvents("tr_after_term", [
    "initiated",
    "settled",
    "processing",
  ]),
  expected: {
    current_status: "processing",
    is_terminal: false,
    warning_types: ["event_after_terminal"],
    event_count: 3,
  },
};

/**
 * No initiated event — transfer starts with processing.
 * Triggers missing_initiated.
 */
export const missingInitiated: Scenario = {
  name: "Missing initiated",
  description: "Transfer has no initiated event — partial history",
  events: makeEvents("tr_no_init", ["processing", "settled"]),
  expected: {
    current_status: "settled",
    is_terminal: true,
    warning_types: ["missing_initiated"],
    event_count: 2,
  },
};

/**
 * Two processing events with different event_ids.
 * Triggers duplicate_status.
 */
export const duplicateStatus: Scenario = {
  name: "Duplicate status",
  description: "Multiple events report the same status — suspicious in a payment context",
  events: makeEvents("tr_dup_status", [
    "initiated",
    "processing",
    { status: "processing", event_id: "evt_tr_dup_status_extra" },
    "settled",
  ]),
  expected: {
    current_status: "settled",
    is_terminal: true,
    warning_types: ["duplicate_status"],
    event_count: 4,
  },
};

/**
 * Same event_id sent twice. Second should be silently skipped.
 * After dedup, only 2 unique events remain.
 */
export const duplicateEvent: Scenario = {
  name: "Duplicate event (idempotency)",
  description: "Same event_id sent twice — second ingestion returns 200 and is skipped",
  events: (() => {
    const evts = makeEvents("tr_idemp", ["initiated", "processing"]);
    // Send the first event again as a duplicate
    return [...evts, { ...evts[0] }];
  })(),
  expected: {
    current_status: "processing",
    is_terminal: false,
    warning_types: [],
    event_count: 2, // deduped: only 2 unique events
  },
};

/**
 * Transfer that failed with a reason.
 * Tests that reason field propagates correctly.
 */
export const failedWithReason: Scenario = {
  name: "Failed with reason",
  description: "Transfer failed with a specific reason — surfaces in API and UI",
  events: makeEvents("tr_failed", [
    "initiated",
    "processing",
    { status: "failed", reason: "insufficient_funds" },
  ]),
  expected: {
    current_status: "failed",
    is_terminal: true,
    warning_types: [],
    event_count: 3,
  },
};

/**
 * Only a single initiated event. Not terminal, no warnings.
 * Represents a transfer that just started.
 */
export const singleEvent: Scenario = {
  name: "Single event",
  description: "Transfer with only an initiated event — in progress, no anomalies",
  events: makeEvents("tr_single", ["initiated"]),
  expected: {
    current_status: "initiated",
    is_terminal: false,
    warning_types: [],
    event_count: 1,
  },
};

/**
 * Multiple anomalies on a single transfer: missing initiated + conflicting terminals.
 * Worst-case scenario for the UI to display.
 */
export const multipleAnomalies: Scenario = {
  name: "Multiple anomalies",
  description: "Transfer with several concurrent anomalies — stress test for warning display",
  events: makeEvents("tr_multi_warn", [
    "processing",
    "settled",
    { status: "failed", reason: "timeout" },
  ]),
  expected: {
    current_status: "failed",
    is_terminal: true,
    warning_types: ["missing_initiated", "conflicting_terminals", "event_after_terminal"],
    event_count: 3,
  },
};

// ─── All Scenarios ──────────────────────────────────────────────

export const ALL_SCENARIOS: Scenario[] = [
  happyPath,
  outOfOrder,
  conflictingTerminals,
  eventAfterTerminal,
  missingInitiated,
  duplicateStatus,
  duplicateEvent,
  failedWithReason,
  singleEvent,
  multipleAnomalies,
];
