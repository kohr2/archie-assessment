// ─── Anomaly Detection Tests ──────────────────────────────────────
// Tests for domain/anomalies.ts — all four warning types.

import { describe, it, expect } from "vitest";
import {
  happyPath,
  conflictingTerminals,
  eventAfterTerminal,
  missingInitiated,
  duplicateStatus,
  multipleAnomalies,
} from "./fixtures";

import { detectAnomalies } from "../src/domain/anomalies";

describe("Anomaly Detection", () => {
  it("detects event_after_terminal", () => {
    // Arrange
    const events = eventAfterTerminal.events; // initiated → settled → processing

    // Act
    const warnings = detectAnomalies(events);

    // Assert
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.some((w) => w.type === "event_after_terminal")).toBe(true);
    const warning = warnings.find((w) => w.type === "event_after_terminal");
    expect(warning?.event_ids).toContain(events[2].event_id); // processing event
  });

  it("detects conflicting_terminals", () => {
    // Arrange
    const events = conflictingTerminals.events; // has both settled and failed

    // Act
    const warnings = detectAnomalies(events);

    // Assert
    expect(warnings.some((w) => w.type === "conflicting_terminals")).toBe(true);
    const conflictWarning = warnings.find((w) => w.type === "conflicting_terminals");
    expect(conflictWarning?.event_ids.length).toBeGreaterThanOrEqual(2);
  });

  it("detects missing_initiated", () => {
    // Arrange
    const events = missingInitiated.events; // processing → settled, no initiated

    // Act
    const warnings = detectAnomalies(events);

    // Assert
    expect(warnings.some((w) => w.type === "missing_initiated")).toBe(true);
  });

  it("detects duplicate_status", () => {
    // Arrange
    const events = duplicateStatus.events; // two processing events

    // Act
    const warnings = detectAnomalies(events);

    // Assert
    expect(warnings.some((w) => w.type === "duplicate_status")).toBe(true);
    const dupWarning = warnings.find((w) => w.type === "duplicate_status");
    expect(dupWarning?.event_ids.length).toBeGreaterThanOrEqual(2); // both processing events
  });

  it("produces no warnings for clean history", () => {
    // Arrange
    const events = happyPath.events;

    // Act
    const warnings = detectAnomalies(events);

    // Assert
    expect(warnings).toHaveLength(0);
  });

  it("detects multiple anomalies on one transfer", () => {
    // Arrange
    const events = multipleAnomalies.events; // missing_initiated + conflicting_terminals + event_after_terminal

    // Act
    const warnings = detectAnomalies(events);

    // Assert
    expect(warnings.length).toBeGreaterThanOrEqual(3);
    expect(warnings.some((w) => w.type === "missing_initiated")).toBe(true);
    expect(warnings.some((w) => w.type === "conflicting_terminals")).toBe(true);
    expect(warnings.some((w) => w.type === "event_after_terminal")).toBe(true);
  });

  it("includes human-readable messages in warnings", () => {
    // Arrange
    const events = eventAfterTerminal.events;

    // Act
    const warnings = detectAnomalies(events);

    // Assert
    expect(warnings[0].message).toBeTruthy();
    expect(typeof warnings[0].message).toBe("string");
  });
});
