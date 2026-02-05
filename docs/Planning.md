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

## Implementation Checklist

### MVP (Must Have)

- [ ] Project setup: Express + TypeScript, static HTML, setup script
- [ ] Event model: zod schema with validation
- [ ] In-memory store: Events + derived transfer state
- [ ] POST /events: Ingest with idempotency (deduplicate by event_id)
- [ ] Status computation: Sort by timestamp, derive current status
- [ ] Anomaly detection: Event-after-terminal, conflicting terminals, missing initiated
- [ ] GET /transfers/:id: Single transfer with status + warnings + events
- [ ] GET /transfers: List all transfers with filtering
- [ ] UI - Transfer list: Table with status, terminal badge, warning indicator, last update
- [ ] UI - Transfer detail: Event timeline, current status, warnings
- [ ] Tests: Status computation, idempotency, anomaly detection, out-of-order handling
- [ ] README: Setup instructions, assumptions, design notes, system design answers

### Beyond MVP (Nice to Have)

- [ ] Stuck transfer detection: Flag non-terminal transfers with no event for configurable threshold
- [ ] Manual resolution: PATCH endpoint to mark transfer as resolved with a note
- [ ] Recompute endpoint: POST /transfers/:id/recompute to rebuild state from events
- [ ] Seed script: Populate with sample data for demo
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
│   └── validation.ts              # zod schemas
├── public/
│   ├── index.html                 # Single HTML page (list + detail views)
│   ├── app.js                     # Vanilla JS: fetch API, render DOM
│   └── style.css                  # Minimal styling
├── tests/
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
