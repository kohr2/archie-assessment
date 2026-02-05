// ─── API Integration Tests ────────────────────────────────────────
// Tests for HTTP layer via supertest — full request/response cycle.

import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { happyPath, failedWithReason } from "./fixtures";
import { makeEvent } from "./helpers";

import { createApp } from "../src/app";
import { store } from "../src/store/memory";
import type { Express } from "express";

describe("API Integration", () => {
  let app: Express;

  beforeEach(() => {
    app = createApp();
    store.clear(); // Isolate tests
  });

  it("POST /events with valid payload returns 201", async () => {
    // Arrange
    const event = happyPath.events[0];

    // Act
    const response = await request(app).post("/events").send(event);

    // Assert
    expect(response.status).toBe(201);
    expect(response.body.message).toContain("processed");
    expect(response.body.transfer_id).toBe(event.transfer_id);
  });

  it("POST /events with duplicate event_id returns 200", async () => {
    // Arrange
    const event = makeEvent({
      transfer_id: "tr_dup_api",
      status: "initiated",
    });

    // Act
    const firstResponse = await request(app).post("/events").send(event);
    const duplicateResponse = await request(app).post("/events").send(event);

    // Assert
    expect(firstResponse.status).toBe(201);
    expect(duplicateResponse.status).toBe(200);
    expect(duplicateResponse.body.message).toContain("Duplicate");
  });

  it("POST /events with invalid payload returns 422", async () => {
    // Arrange
    const invalidEvent = {
      transfer_id: "tr_invalid",
      // Missing required fields
    };

    // Act
    const response = await request(app).post("/events").send(invalidEvent);

    // Assert
    expect(response.status).toBe(422);
    expect(response.body.error).toBeTruthy();
  });

  it("GET /transfers/:id returns transfer with correct shape", async () => {
    // Arrange
    const events = happyPath.events;
    // First ingest events
    for (const event of events) {
      await request(app).post("/events").send(event);
    }

    // Act
    const response = await request(app).get(`/transfers/${events[0].transfer_id}`);

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.transfer_id).toBe(events[0].transfer_id);
    expect(response.body.current_status).toBe("settled");
    expect(response.body.is_terminal).toBe(true);
    expect(response.body.has_warnings).toBe(false);
    expect(response.body.events).toHaveLength(3);
    expect(response.body.warnings).toHaveLength(0);
  });

  it("GET /transfers/:id for unknown transfer returns 404", async () => {
    // Act
    const response = await request(app).get("/transfers/tr_unknown");

    // Assert
    expect(response.status).toBe(404);
    expect(response.body.error).toBeTruthy();
  });

  it("GET /transfers returns list with total", async () => {
    // Arrange
    const events = happyPath.events;
    // Ingest some events
    for (const event of events) {
      await request(app).post("/events").send(event);
    }

    // Act
    const response = await request(app).get("/transfers");

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.transfers).toBeInstanceOf(Array);
    expect(typeof response.body.total).toBe("number");
    expect(response.body.total).toBeGreaterThanOrEqual(1);
  });

  it("GET /transfers?status=failed filters correctly", async () => {
    // Arrange
    const failedEvents = failedWithReason.events;
    // Ingest failed transfer
    for (const event of failedEvents) {
      await request(app).post("/events").send(event);
    }
    // Ingest happy path too
    for (const event of happyPath.events) {
      await request(app).post("/events").send(event);
    }

    // Act
    const response = await request(app).get("/transfers?status=failed");

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.transfers.every((t: any) => t.current_status === "failed")).toBe(true);
  });

  it("GET /transfers?has_warnings=true filters correctly", async () => {
    // Arrange
    // Ingest transfers with and without warnings
    const { conflictingTerminals } = await import("./fixtures");
    for (const event of conflictingTerminals.events) {
      await request(app).post("/events").send(event);
    }
    for (const event of happyPath.events) {
      await request(app).post("/events").send(event);
    }

    // Act
    const response = await request(app).get("/transfers?has_warnings=true");

    // Assert
    expect(response.status).toBe(200);
    expect(response.body.transfers.every((t: any) => t.has_warnings === true)).toBe(true);
  });

  it("includes reason field in failed events", async () => {
    // Arrange
    const events = failedWithReason.events;
    for (const event of events) {
      await request(app).post("/events").send(event);
    }

    // Act
    const response = await request(app).get(`/transfers/${events[0].transfer_id}`);

    // Assert
    const failedEvent = response.body.events.find((e: any) => e.status === "failed");
    expect(failedEvent.reason).toBe("insufficient_funds");
  });
});
