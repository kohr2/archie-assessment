// ─── Version & Recompute Tests ────────────────────────────────────────
// Tests for version counter, affected transfer IDs, and recompute functionality.

import { describe, it, expect, beforeEach } from "vitest";
import { makeEvent } from "./helpers";

import { MemoryStore } from "../src/store/memory";

describe("Version & Recompute", () => {
  const store = new MemoryStore();

  beforeEach(() => {
    store.clear();
  });

  it("version starts at 0", () => {
    // Assert
    expect(store.getVersion()).toBe(0);
  });

  it("version increments on new event", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_version",
      status: "initiated",
    });

    // Act
    store.addEvent(event);

    // Assert
    expect(store.getVersion()).toBe(1);
  });

  it("version does not increment on duplicate event", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_dup_version",
      status: "initiated",
    });

    // Act
    store.addEvent(event);
    const versionAfterFirst = store.getVersion();
    store.addEvent(event); // Duplicate

    // Assert
    expect(versionAfterFirst).toBe(1);
    expect(store.getVersion()).toBe(1); // Unchanged
  });

  it("affected transfer IDs include the ingested transfer", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_affected",
      status: "initiated",
    });

    // Act
    store.addEvent(event);
    const affectedIds = store.getAffectedTransferIds();

    // Assert
    expect(affectedIds).toContain("tr_affected");
    expect(affectedIds).toHaveLength(1);
  });

  it("getAffectedTransferIds clears the set after reading", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_clear",
      status: "initiated",
    });

    // Act
    store.addEvent(event);
    const firstRead = store.getAffectedTransferIds();
    const secondRead = store.getAffectedTransferIds();

    // Assert
    expect(firstRead).toHaveLength(1);
    expect(secondRead).toHaveLength(0); // Cleared
  });

  it("affected IDs accumulate across multiple events", () => {
    // Arrange
    const event1 = makeEvent({
      transfer_id: "tr_multi_1",
      status: "initiated",
    });
    const event2 = makeEvent({
      transfer_id: "tr_multi_2",
      status: "initiated",
    });

    // Act
    store.addEvent(event1);
    store.addEvent(event2);
    const affectedIds = store.getAffectedTransferIds();

    // Assert
    expect(affectedIds).toContain("tr_multi_1");
    expect(affectedIds).toContain("tr_multi_2");
    expect(affectedIds).toHaveLength(2);
  });

  it("recomputeTransfer increments version", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_recompute_version",
      status: "initiated",
    });
    store.addEvent(event);
    const versionBefore = store.getVersion();

    // Act
    store.recomputeTransfer("tr_recompute_version");

    // Assert
    expect(store.getVersion()).toBe(versionBefore + 1);
  });

  it("recomputeTransfer adds to affected IDs", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_recompute_affected",
      status: "initiated",
    });
    store.addEvent(event);
    store.getAffectedTransferIds(); // Clear initial affected IDs

    // Act
    store.recomputeTransfer("tr_recompute_affected");
    const affectedIds = store.getAffectedTransferIds();

    // Assert
    expect(affectedIds).toContain("tr_recompute_affected");
    expect(affectedIds).toHaveLength(1);
  });

  it("recomputeTransfer returns undefined for unknown transfer", () => {
    // Act
    const result = store.recomputeTransfer("tr_unknown");

    // Assert
    expect(result).toBeUndefined();
  });

  it("recomputeTransfer produces same state as original computation", () => {
    // Arrange
    const events = [
      makeEvent({
        transfer_id: "tr_same_state",
        status: "initiated",
      }),
      makeEvent({
        transfer_id: "tr_same_state",
        status: "settled",
      }),
    ];
    for (const event of events) {
      store.addEvent(event);
    }
    const originalTransfer = store.getTransfer("tr_same_state");

    // Act
    const recomputedTransfer = store.recomputeTransfer("tr_same_state");

    // Assert
    expect(recomputedTransfer).toBeDefined();
    expect(recomputedTransfer?.current_status).toBe(originalTransfer?.current_status);
    expect(recomputedTransfer?.is_terminal).toBe(originalTransfer?.is_terminal);
    expect(recomputedTransfer?.event_count).toBe(originalTransfer?.event_count);
  });

  it("clear resets version and affected IDs", () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_clear_test",
      status: "initiated",
    });
    store.addEvent(event);
    store.getAffectedTransferIds(); // Clear affected IDs

    // Act
    store.clear();

    // Assert
    expect(store.getVersion()).toBe(0);
    expect(store.getAffectedTransferIds()).toHaveLength(0);
  });
});
