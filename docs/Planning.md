# Planning: Money Transfer Lifecycle Tracker

## Overview

Internal debugging and monitoring tool for money transfers. Transfers are initiated by our system but status updates arrive asynchronously from downstream systems with no ordering or delivery guarantees. Engineers and support staff need to understand the current state of any transfer and investigate anomalies.

**Core problem:** Reconstruct a consistent transfer timeline from unreliable, unordered, potentially duplicated events.

---

## Architecture

```
┌──────────────────┐      POST /events       ┌────────────────────────────────┐
│   Downstream     │ ──────────────────────▶  │        Express Server          │
│   Systems        │                          │                                │
└──────────────────┘                          │  ┌────────────────────────┐    │
                                              │  │   Event Ingestion      │    │
                                              │  │  - Validate (zod)      │    │
                                              │  │  - Deduplicate         │    │
                                              │  │  - Store event         │    │
                                              │  │  - Recompute state     │    │
                                              │  │  - Detect anomalies    │    │
                                              │  └──────────┬─────────────┘    │
                                              │             │                  │
                                              │             ▼                  │
                                              │  ┌────────────────────────┐    │
                                              │  │   In-Memory Store      │    │
                                              │  │  events: Map<id, []>   │    │
                                              │  │  transfers: Map<id>    │    │
                                              │  └──────────┬─────────────┘    │
                                              │             │                  │
                                              │             ▼                  │
                                              │  ┌────────────────────────┐    │
┌──────────────────┐  GET /transfers/:id      │  │   Query Layer          │    │
│   Transfer       │ ◀───────────────────     │  │  - Single transfer     │    │
│   Orchestrator   │  GET /transfers          │  │  - List + filter       │    │
│   (not ours)     │                          │  └────────────────────────┘    │
└──────────────────┘                          │                                │
                                              │  ┌────────────────────────┐    │
┌──────────────────┐  GET /                   │  │   Static Files         │    │
│   Browser        │ ◀───────────────────     │  │  public/index.html     │    │
│   (internal)     │  (vanilla HTML+JS)       │  │  public/app.js         │    │
└──────────────────┘                          │  └────────────────────────┘    │
                                              └────────────────────────────────┘
```

**Single server.** Express serves the JSON API and the static HTML/JS/CSS files. No separate frontend build step, no CORS, no second dev server.

---

## Data Flow

### Event Ingestion (Write Path)

```
1. Downstream POST /events with event payload
2. Validate payload with zod (required fields, valid status)
3. Check idempotency: does event_id already exist for this transfer?
   ├── YES → Return 200 OK (already processed), skip
   └── NO  → Continue
4. Append event to event store (immutable, append-only)
5. Recompute transfer derived state:
   a. Sort all events for this transfer by (timestamp, event_id)
   b. Current status = last event in sorted order
   c. is_terminal = status in {settled, failed}
   d. Run anomaly detection rules
6. Store updated transfer state
7. Return 201 Created
```

### Transfer Query (Read Path)

```
1. GET /transfers/:id
2. Lookup transfer in store
   ├── NOT FOUND → Return 404
   └── FOUND → Return derived state + events
3. Response includes: status, is_terminal, warnings, last_updated
```

---

## State Schema

### Types

```typescript
// src/types.ts

type Status = "initiated" | "processing" | "settled" | "failed";

interface TransferEvent {
  transfer_id: string;                    // Stable identifier
  event_id: string;                       // Idempotency key (unique per transfer)
  status: Status;
  timestamp: string;                      // ISO 8601 UTC
  reason?: string;                        // Optional, present on failed
}

interface Transfer {
  transfer_id: string;
  current_status: Status;
  is_terminal: boolean;                   // True if settled or failed
  has_warnings: boolean;
  last_updated: string;                   // Timestamp of latest event
  event_count: number;
  warnings: Warning[];
  events: TransferEvent[];                // Full history, sorted by timestamp
}

type WarningType =
  | "event_after_terminal"                // Activity after settled/failed
  | "conflicting_terminals"               // Both settled and failed exist
  | "missing_initiated"                   // No initiated event in history
  | "duplicate_status";                   // Multiple events with different IDs but same status

interface Warning {
  type: WarningType;
  message: string;                        // Human-readable explanation
  event_ids: string[];                    // Related events for debugging
}
```

### State Machine

```
initiated ──▶ processing ──▶ settled (terminal)
    │              │
    │              └──────────▶ failed  (terminal)
    │
    └─────────────────────────▶ settled (terminal)
    └─────────────────────────▶ failed  (terminal)
```

Transitions are **not enforced**. Any status can follow any other. Invalid transitions produce warnings but are still accepted and stored.

---

## API Contract

### Ingest Event

```
POST /events

Request:  { "transfer_id", "event_id", "status", "timestamp", "reason?" }
201:      { "message": "Event processed", "transfer_id": "tr_123" }
200:      { "message": "Duplicate event, skipped" }
422:      { "error": "Validation error..." }
```

### Get Transfer

```
GET /transfers/:id

200:      { "transfer_id", "current_status", "is_terminal", "has_warnings",
            "last_updated", "event_count", "warnings": [], "events": [] }
404:      { "error": "Transfer not found" }
```

### List Transfers

```
GET /transfers
GET /transfers?status=failed
GET /transfers?has_warnings=true

200:      { "transfers": [...], "total": 42 }
```

---

## Development Approach: TDD

Tests are written **before** implementation. Each requirement from the spec maps to a test case. The build order is:

```
1. Scaffolding        → package.json, tsconfig, .gitignore, types, constants
2. Test fixtures      → tests/helpers.ts (factory functions for events)
3. All tests (RED)    → status, anomalies, ingestion, API integration
4. Domain logic       → domain/status.ts, domain/anomalies.ts (make tests GREEN)
5. Store              → store/memory.ts (make ingestion tests GREEN)
6. HTTP layer         → routes, index.ts, error middleware, logging (make API tests GREEN)
7. UI                 → public/ (list + detail views)
8. Scripts            → setup.sh, run.sh, run_tests.sh, seed.ts
```

Tests use shared factory fixtures (`tests/helpers.ts`) to avoid duplication. Each test file covers one domain concern. Integration tests use supertest against the Express app (imported without `listen()`).

### Production Practices

- **Type safety**: TypeScript strict mode; zod schemas infer types at the boundary; domain functions accept and return typed interfaces
- **Constants**: `TERMINAL_STATUSES`, `VALID_STATUSES` defined once in `constants.ts` — no magic strings
- **Input validation**: zod validates every incoming payload before it reaches domain logic; invalid data never touches the store
- **Structured logging** (`logger.ts`): request-level (method, path, status, duration) + domain-level (event ingested, state recomputed) with `transfer_id` context
- **Layered error handling**:
  - **Validation layer**: zod parse errors → `422` with structured field-level messages
  - **Domain layer**: not-found → `404`; domain functions return result types, never throw
  - **Route layer**: try/catch around handler logic → `500` with safe message on unexpected errors
  - **Global middleware**: Express error handler as the final catch-all — logs full error server-side, returns `{ "error": "Internal server error" }` to client (no stack traces leaked)
- **Graceful degradation**: anomalies never block event ingestion; data is always stored and flagged for investigation

---

## Implementation Checklist

### MVP (Must Have)

**Scaffolding**
- [ ] Project setup: package.json, tsconfig.json, .gitignore, vitest config
- [ ] Types and constants: types.ts, constants.ts
- [ ] Validation: zod schemas (validation.ts)

**Tests (written first, all failing)**
- [ ] Test fixtures: tests/helpers.ts with makeEvent() and makeEvents() factories
- [ ] Status tests: out-of-order sorting, timestamp tiebreaker, terminal detection, latest-wins
- [ ] Anomaly tests: event-after-terminal, conflicting terminals, missing initiated, duplicate status, no false positives
- [ ] Ingestion tests: new event stored (201), duplicate skipped (200), cross-transfer event_id reuse, invalid payload (422)
- [ ] API integration tests: POST+GET round-trip, list filters, 404 for unknown, response shape contract

**Implementation (make tests pass)**
- [ ] Domain: status computation (domain/status.ts)
- [ ] Domain: anomaly detection (domain/anomalies.ts)
- [ ] Store: in-memory event + transfer store (store/memory.ts)
- [ ] Routes: POST /events (routes/events.ts)
- [ ] Routes: GET /transfers, GET /transfers/:id (routes/transfers.ts)
- [ ] App: Express entry point with JSON parsing, route mounting (index.ts)
- [ ] Error handling: zod errors → 422, not-found → 404, route-level try/catch → 500, global Express error middleware as catch-all (log server-side, safe response to client)
- [ ] Logging: structured request logging (method, path, status, duration) + domain logging (event ingested, state recomputed)

**UI**
- [ ] Transfer list: table with status, terminal badge, warning indicator, relative timestamp ("X mn ago")
- [ ] Transfer detail: event timeline with relative timestamps, current status, warnings, failure reason
- [ ] Auto-refresh: 10s version polling, auto-reloads both views on change, passive banner notification (no CTAs — status is recomputed dynamically on every event ingestion)

**DevOps**
- [ ] setup.sh, run.sh, run_tests.sh
- [ ] Seed script: scripts/seed.ts

### Beyond MVP (Nice to Have)

- [ ] Stuck transfer detection: flag non-terminal transfers idle for >24h
- [ ] Manual resolution: PATCH /transfers/:id/resolve with note
- [ ] Recompute endpoint: POST /transfers/:id/recompute to rebuild state from events
- [ ] Docker support: Dockerfile + docker-compose

---

## Tech Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | TypeScript + Express | Type safety on domain logic where it matters most |
| Validation | zod | Runtime validation, infers TS types from schemas |
| Storage | In-memory (Map) | Acceptable per requirements, fast to build |
| Frontend | Vanilla HTML + JS | No build step, served from Express, zero complexity |
| Testing | vitest | Fast, native TypeScript, Jest-compatible API |

---

## File Structure

```
archie/
├── src/
│   ├── index.ts                   # Express app entry point
│   ├── types.ts                   # TransferEvent, Transfer, Warning
│   ├── constants.ts               # TERMINAL_STATUSES, VALID_STATUSES
│   ├── routes/
│   │   ├── events.ts              # POST /events
│   │   └── transfers.ts           # GET /transfers, GET /transfers/:id
│   ├── domain/
│   │   ├── status.ts              # Status computation logic
│   │   └── anomalies.ts           # Anomaly detection rules
│   ├── store/
│   │   └── memory.ts              # In-memory event + transfer store
│   ├── validation.ts              # zod schemas
│   └── logger.ts                  # Structured logging (request + domain events)
├── public/
│   ├── index.html                 # Single HTML page (list + detail views)
│   ├── app.js                     # Vanilla JS: fetch API, render DOM
│   └── style.css                  # Minimal styling
├── tests/
│   ├── helpers.ts                 # Factory functions (makeEvent, makeEvents)
│   ├── fixtures.ts                # Named scenarios with events + expected outcomes
│   ├── ingestion.test.ts
│   ├── status.test.ts
│   ├── anomalies.test.ts
│   └── api.test.ts
├── scripts/
│   └── seed.ts                    # Populate sample data
├── docs/
│   ├── Planning.md
│   └── assessment/
│       └── homework_transfer_tracking.pdf
├── package.json
├── tsconfig.json
├── setup.sh
├── run.sh
├── run_tests.sh
├── .gitignore
└── README.md
```
