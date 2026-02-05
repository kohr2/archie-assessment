// ─── Status Computation Tests ─────────────────────────────────────
// Tests for domain/status.ts — how current status is derived from events.

import { describe, it, expect } from "vitest";
import type { TransferEvent } from "../src/types";
import { happyPath, outOfOrder, singleEvent } from "./fixtures";
import { makeEvents } from "./helpers";

import { computeTransferState } from "../src/domain/status";

describe("Status Computation", () => {
  it("derives correct status from sorted events (happy path)", () => {
    // Arrange
    const events = happyPath.events;

    // Act
    const transfer = computeTransferState("tr_happy", events);

    // Assert
    expect(transfer.current_status).toBe("settled");
    expect(transfer.is_terminal).toBe(true);
    expect(transfer.event_count).toBe(3);
  });

  it("sorts events by timestamp, not arrival order", () => {
    // Arrange
    const events = outOfOrder.events; // Arrival: settled, initiated, processing

    // Act
    const transfer = computeTransferState("tr_ooo", events);

    // Assert
    // Should derive status from latest timestamp (settled), not last arrival
    expect(transfer.current_status).toBe("settled");
    expect(transfer.is_terminal).toBe(true);
  });

  it("uses event_id as tiebreaker when timestamps are equal", () => {
    // Arrange
    const sameTimestamp = "2024-01-05T12:00:00Z";
    const events: TransferEvent[] = [
      {
        transfer_id: "tr_tie",
        event_id: "evt_a",
        status: "settled",
        timestamp: sameTimestamp,
      },
      {
        transfer_id: "tr_tie",
        event_id: "evt_z",
        status: "initiated",
        timestamp: sameTimestamp,
      },
    ];

    // Act
    const transfer = computeTransferState("tr_tie", events);

    // Assert
    // evt_a comes before evt_z lexicographically, so evt_z is last in sorted order
    // Last event wins, so initiated should win
    expect(transfer.current_status).toBe("initiated");
  });

  it("detects terminal states correctly", () => {
    // Arrange
    const settledEvents = makeEvents("tr_settled", ["initiated", "settled"]);
    const failedEvents = makeEvents("tr_failed", ["initiated", "failed"]);

    // Act
    const settledTransfer = computeTransferState("tr_settled", settledEvents);
    const failedTransfer = computeTransferState("tr_failed", failedEvents);

    // Assert
    expect(settledTransfer.is_terminal).toBe(true);
    expect(failedTransfer.is_terminal).toBe(true);
  });

  it("handles single event correctly", () => {
    // Arrange
    const events = singleEvent.events;

    // Act
    const transfer = computeTransferState("tr_single", events);

    // Assert
    expect(transfer.current_status).toBe("initiated");
    expect(transfer.is_terminal).toBe(false);
    expect(transfer.event_count).toBe(1);
    expect(transfer.last_updated).toBe(events[0].timestamp);
  });

  it("sets last_updated to latest event timestamp", () => {
    // Arrange
    const events = makeEvents("tr_last", [
      "initiated",
      "processing",
      "settled",
    ]);

    // Act
    const transfer = computeTransferState("tr_last", events);

    // Assert
    expect(transfer.last_updated).toBe(events[2].timestamp); // settled is latest
  });
});
