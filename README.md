# Transfer Tracker

Internal tool for tracking money transfer lifecycle. Ingests asynchronous, unordered, potentially duplicated status events from downstream systems and provides a consistent view of transfer state for engineers, support staff, and the Transfer Orchestrator service.

---

## Quick Start

```bash
# Automated setup + run
bash setup.sh
bash run.sh          # http://localhost:3000 (seeds demo data)
bash stop.sh         # Stop the server

# Run tests
bash run_tests.sh
```

### Manual Setup

```bash
npm install
npm run build
npm start            # http://localhost:3000
```

### Prerequisites

- Node.js 18+

---

## Why This Stack

### TypeScript + Express

The complexity is in the **domain logic** (status computation, anomaly detection, idempotency), not the web framework. Express is the thinnest possible layer. TypeScript gives type safety where it matters: the event model, state transitions, and API contract.

### Vanilla HTML + JS

Two views — a table and a timeline — don't justify a build pipeline. `fetch()` and `innerHTML` are enough. Serving static files from Express means **one command to run everything**: `npm start` serves both the API and the UI on the same port. The UI polls for version changes every 10 seconds, auto-refreshes both views when new data arrives, and shows relative timestamps ("3 mn ago").

### zod

Runtime validation that infers TypeScript types from schemas. One definition, two guarantees: the compiler checks your code, zod checks the incoming payload.

### vitest

Native TypeScript support without extra configuration. Jest-compatible API, faster execution.

---

## API

### Ingest Event

```
POST /events
```

```json
{
  "transfer_id": "tr_123",
  "event_id": "evt_1",
  "status": "initiated",
  "timestamp": "2024-01-05T12:00:00Z"
}
```

`reason` is an optional string, present when status is `failed` (e.g. `"reason": "insufficient_funds"`). Omitted otherwise.

| Response | Meaning |
|----------|---------|
| `201` | Event processed |
| `200` | Duplicate event, skipped |
| `422` | Validation error |

### Get Transfer

```
GET /transfers/:id
```

```json
{
  "transfer_id": "tr_123",
  "current_status": "settled",
  "is_terminal": true,
  "has_warnings": true,
  "last_updated": "2024-01-05T12:03:00Z",
  "event_count": 4,
  "warnings": [
    {
      "type": "conflicting_terminals",
      "message": "Both settled and failed states received",
      "event_ids": ["evt_2", "evt_4"]
    }
  ],
  "events": [
    { "event_id": "evt_1", "status": "initiated", "timestamp": "2024-01-05T12:00:00Z" },
    { "event_id": "evt_3", "status": "processing", "timestamp": "2024-01-05T12:01:30Z" },
    { "event_id": "evt_4", "status": "failed", "timestamp": "2024-01-05T12:02:00Z", "reason": "insufficient_funds" },
    { "event_id": "evt_2", "status": "settled", "timestamp": "2024-01-05T12:03:00Z" }
  ]
}
```

### List Transfers

```
GET /transfers
GET /transfers?status=failed
GET /transfers?has_warnings=true
```

```json
{
  "transfers": [
    {
      "transfer_id": "tr_123",
      "current_status": "settled",
      "is_terminal": true,
      "has_warnings": true,
      "last_updated": "2024-01-05T12:03:00Z",
      "event_count": 4
    }
  ],
  "total": 1
}
```

---

## Development Approach

**TDD.** Tests were written before implementation. Each requirement from the spec maps to a test case — status computation, anomaly detection, idempotency, out-of-order handling — all written as failing tests first, then implementation to make them pass. Shared factory fixtures (`tests/helpers.ts`) keep test setup DRY.

**Production practices:**
- **Structured logging**: every event ingestion and state recomputation is logged with `transfer_id` context; request-level logging captures method, path, status code, and duration
- **Layered error handling**: validation errors return `422` with zod's structured error messages; unknown transfer returns `404`; route handlers catch domain errors and return `500` with a safe message; a global Express error middleware is the final catch-all — it logs the full error server-side but returns only `{ "error": "Internal server error" }` to the client (no stack trace leaks)
- **Input validation at the boundary**: zod validates every incoming payload before it touches domain logic; invalid data never reaches the store or domain layer
- **Constants, no magic values**: terminal statuses, valid statuses defined once in `constants.ts`
- **Type safety end-to-end**: TypeScript strict mode, zod schemas infer types at the boundary, domain functions accept and return typed interfaces

---

## Design Notes

### How Duplicates Are Handled

Events are deduplicated by `event_id` scoped per `transfer_id`. When an event arrives with an `event_id` already seen for that transfer, we return `200 OK` and skip processing. This makes the endpoint idempotent - downstream systems can safely retry.

### How Out-of-Order Events Are Handled

Events are stored in arrival order but **sorted by `timestamp`** when computing state. The current status is always derived from the event with the latest timestamp, not the most recently received. If two events share the same timestamp, `event_id` is used as a lexicographic tiebreaker.

### How Current Status Is Determined

Status is recomputed on every write (compute-on-write). After appending a new event:

1. All events for the transfer are sorted by `(timestamp, event_id)`
2. Current status = the status of the last event in sorted order
3. `is_terminal` = `true` if status is `settled` or `failed`
4. Anomaly detection runs against the full sorted history

This means reads are always fast and consistent.

### How Anomalies Are Detected

| Anomaly | Trigger | Severity |
|---------|---------|----------|
| `event_after_terminal` | Any event with a timestamp after a terminal event | High |
| `conflicting_terminals` | Both `settled` and `failed` exist in history | Critical |
| `missing_initiated` | No `initiated` event in history | Info |
| `duplicate_status` | Multiple events with different `event_id`s but the same status | Medium |

Anomalies **never block ingestion**. Events are always stored. Warnings are surfaced in the API response and UI for human investigation.

### API Design for the Transfer Orchestrator

The Orchestrator needs a simple, stable contract. It should never parse raw events.

- **REST over GraphQL**: Simpler for a polling consumer, cacheable via HTTP, lower overhead
- **`has_warnings` boolean at top level**: Orchestrator can filter without parsing the warnings array
- **`is_terminal` field**: Orchestrator can quickly decide if a transfer is "done" without knowing the state machine
- **Events included by default**: Single request gives full context; for a high-traffic orchestrator at scale, we'd add `?include=events` to make it opt-in
- **Filtering via query params** (`?status=failed&has_warnings=true`): Orchestrator can poll only for transfers it cares about

---

## Assumptions

### Data Model
- `event_id` uniqueness is scoped per `transfer_id`, not globally. Downstream systems may reuse event ID sequences across independent transfers, so global uniqueness cannot be assumed.
- Timestamps are ISO 8601 UTC from a trusted source (no clock skew handling)
- Events can arrive for a transfer before `initiated` (partial history is valid per "some events may never arrive")

### State Machine
- No enforced transition order; any status can follow any other
- Skipped transitions (e.g., `initiated` -> `settled` with no `processing`) are valid, not flagged as anomalies
- Duplicate events with same `event_id` are idempotent regardless of payload

### Storage
In-memory store; data is lost on restart. Acceptable tradeoff for the exercise. Production would use PostgreSQL with an immutable events table + materialized transfer view

### Scope
- No authentication (internal tool)
- No pagination (assumed manageable dataset for demo)
- No rate limiting (trusted internal callers)

---

## Project Structure

```
archie/
├── src/
│   ├── index.ts               # Express app entry point
│   ├── types.ts               # TransferEvent, Transfer, Warning
│   ├── constants.ts           # TERMINAL_STATUSES, VALID_STATUSES
│   ├── routes/
│   │   ├── events.ts          # POST /events
│   │   └── transfers.ts       # GET /transfers, GET /transfers/:id
│   ├── domain/
│   │   ├── status.ts          # Status computation logic
│   │   └── anomalies.ts       # Anomaly detection rules
│   ├── store/
│   │   └── memory.ts          # In-memory event + transfer store
│   ├── validation.ts          # zod schemas
│   └── logger.ts              # Structured logging (request + domain events)
├── public/
│   ├── index.html             # Single HTML page (list + detail views)
│   ├── app.js                 # Vanilla JS: fetch API, render DOM
│   └── style.css              # Minimal styling
├── tests/
│   ├── helpers.ts                 # Factory functions (makeEvent, makeEvents)
│   ├── fixtures.ts                # Named scenarios with events + expected outcomes
│   ├── ingestion.test.ts
│   ├── status.test.ts
│   ├── anomalies.test.ts
│   └── api.test.ts
├── scripts/
│   └── seed.ts                # Populate sample data
├── docs/
│   └── Planning.md
├── package.json
├── tsconfig.json
├── setup.sh
├── run.sh
├── stop.sh
├── run_tests.sh
├── .gitignore
└── README.md
```

---

## Testing

Built with TDD: tests written first, then implementation to make them pass.

```bash
bash run_tests.sh
# or
npx vitest run
```

| Test File | Covers |
|-----------|--------|
| `helpers.ts` | Factory functions: `makeEvent()`, `makeEvents()` |
| `fixtures.ts` | 10 named scenarios with events + expected outcomes (shared with seed script) |
| `status.test.ts` | Out-of-order resolution, timestamp sorting, tiebreaker, terminal detection |
| `anomalies.test.ts` | Event-after-terminal, conflicting terminals, missing initiated, duplicate status, no false positives |
| `ingestion.test.ts` | Idempotency, duplicate rejection, cross-transfer event_id reuse, invalid payloads |
| `api.test.ts` | Full HTTP integration via supertest: round-trip, filters, 404, response contract |

---

## System Design Questions

### 1. Scaling & Evolution

**What would you change first at millions of transfers/day?**

1. **PostgreSQL** over in-memory: `events` table (append-only) + `transfers` table (materialized view). Index on `(transfer_id, event_id)` for idempotency.
2. **Message queue** (Kafka/SQS) in front of ingestion: decouple acceptance from processing, handle spikes with backpressure.
3. **Partition by `transfer_id`**: same-transfer events hit the same worker — no write contention, serial per-transfer processing.
4. **Redis cache** for Orchestrator polls, invalidated on new events.

**What I'd keep:** the event sourcing model (immutable events, derived state), compute-on-write (reads dominate), and the API contract (consumers are decoupled from internals).

### 2. Data Correction & Recovery

**Detect:** monitoring on anomaly rate spikes, canary re-derivation from raw events, structured logging with diffs on every status computation.

**Correct:** recompute job that re-derives all transfer states from event history (event sourcing's core advantage — derived state is disposable). Run against a shadow table first, diff, then swap. Log every correction for audit.

**Prevent:** comprehensive tests on the status computation path, on-demand recompute endpoint, periodic reconciliation job sampling transfers against re-derived state.

### 3. Correctness vs Freshness

Two modes: **freshness** (default) returns compute-on-write state — fast, eventually consistent. **Correctness** (`?verified=true`) re-derives from raw events at read time — slower, guaranteed correct. The Orchestrator uses freshness; audit/compliance uses correctness.

For polling efficiency, the Orchestrator can use `ETag` / `If-None-Match` headers to skip re-processing unchanged transfers — this reduces bandwidth and serves as a staleness signal.

**If real money safety were critical:** never auto-resolve conflicting terminal states (flag for human review), make idempotency checks transactional with event storage, add write-ahead logging, and audit-log all queries and state transitions.

---

## Key Tradeoffs

| Decision | Tradeoff | Rationale |
|----------|----------|-----------|
| Compute on write | Slower writes, faster reads | Reads dominate (Orchestrator polls) |
| Latest timestamp = current status | Trusts downstream clocks | No alternative without sequence numbers |
| Anomalies don't block ingestion | May store "bad" data | Better to have data and flag it than lose it |
| In-memory store | Data lost on restart | 3-hour exercise; architecture supports swap to DB |
| Vanilla HTML over React | No component model | Two views don't justify a build pipeline |
| Single Express server | Coupled API + UI | Eliminates CORS, simplifies deployment for an internal tool |
| Events included in response | Larger payloads | Reduces round trips; would add `?include=events` at scale |

---

## Beyond MVP

Recompute from events is included (was optional)
POST /transfers/:id/recompute 
UI polls every 10s, auto-refreshes both views on changes with passive notification. Transfers updated via live polling are highlighted for 5 seconds. "Updated" column and timeline show "X mn ago" instead of absolute dates
