// ─── Ingestion Tests ──────────────────────────────────────────────
// Tests for store/memory.ts — idempotency, deduplication, state recomputation.

import { describe, it, expect, beforeEach } from "vitest";
import { duplicateEvent } from "./fixtures";
import { makeEvent } from "./helpers";

import { MemoryStore } from "../src/store/memory";

describe("Event Ingestion", () => {
  const store = new MemoryStore();

  beforeEach(() => {
    store.clear();
  });

  it("stores a new event and returns true", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_new",
      status: "initiated",
    });

    // Act
    const result = store.addEvent(event);

    // Assert
    expect(result.isDuplicate).toBe(false);
    const transfer = store.getTransfer("tr_new");
    expect(transfer).toBeDefined();
    expect(transfer?.event_count).toBe(1);
  });

  it("skips duplicate event_id for same transfer and returns true for duplicate", () => {
    // Arrange
    const events = duplicateEvent.events; // Same event_id sent twice
    const firstEvent = events[0];
    const secondEvent = events[1];
    const duplicateEventInstance = events[2]; // Same event_id as first

    // Act
    const firstResult = store.addEvent(firstEvent);
    const secondResult = store.addEvent(secondEvent);
    const duplicateResult = store.addEvent(duplicateEventInstance);

    // Assert
    expect(firstResult.isDuplicate).toBe(false);
    expect(secondResult.isDuplicate).toBe(false);
    expect(duplicateResult.isDuplicate).toBe(true);
    const transfer = store.getTransfer("tr_idemp");
    expect(transfer?.event_count).toBe(2); // Only 2 unique events after dedup
  });

  it("allows same event_id across different transfers", () => {
    // Arrange
    const event1 = makeEvent({
      transfer_id: "tr_1",
      event_id: "evt_shared",
      status: "initiated",
    });
    const event2 = makeEvent({
      transfer_id: "tr_2",
      event_id: "evt_shared", // Same event_id, different transfer
      status: "initiated",
    });

    // Act
    const result1 = store.addEvent(event1);
    const result2 = store.addEvent(event2);

    // Assert
    // Both should succeed — event_id uniqueness is scoped per transfer_id
    expect(result1.isDuplicate).toBe(false);
    expect(result2.isDuplicate).toBe(false);
    expect(store.getTransfer("tr_1")?.event_count).toBe(1);
    expect(store.getTransfer("tr_2")?.event_count).toBe(1);
  });

  it("recomputes transfer state after adding event", () => {
    // Arrange
    const event1 = makeEvent({
      transfer_id: "tr_recompute",
      status: "initiated",
    });
    const event2 = makeEvent({
      transfer_id: "tr_recompute",
      status: "settled",
      timestamp: new Date(Date.UTC(2024, 0, 5, 12, 1, 30)).toISOString(),
    });

    // Act
    store.addEvent(event1);
    store.addEvent(event2);

    // Assert
    const transfer = store.getTransfer("tr_recompute");
    expect(transfer?.current_status).toBe("settled");
    expect(transfer?.is_terminal).toBe(true);
  });

  it("handles out-of-order events correctly", () => {
    // Arrange
    const laterEvent = makeEvent({
      transfer_id: "tr_ooo_store",
      status: "settled",
      timestamp: "2024-01-05T12:03:00Z",
    });
    const earlierEvent = makeEvent({
      transfer_id: "tr_ooo_store",
      status: "initiated",
      timestamp: "2024-01-05T12:00:00Z",
    });

    // Act — add later event first
    store.addEvent(laterEvent);
    store.addEvent(earlierEvent);

    // Assert
    const transfer = store.getTransfer("tr_ooo_store");
    // Status should be from latest timestamp (settled), not last arrival
    expect(transfer?.current_status).toBe("settled");
  });
});
