# Video Walkthrough Script (~3 minutes)

Narration guide for recording the Loom video. Run `bash scripts/demo.sh` in a terminal alongside the browser at `http://localhost:3000`.

---

## Setup Before Recording

```bash
bash setup.sh       # one-time
bash run.sh         # starts server + seeds demo data
```

Open two things side by side:
- **Browser** at `http://localhost:3000`
- **Terminal** ready to run `bash scripts/demo.sh`

---

## Part 1: Transfer List + Detail View (~1 min)

### What to show (browser)

1. **List view** — point out the columns: Transfer ID, Status (color-coded), Terminal/Active badge, warning indicator, relative timestamps ("3 mn ago"), event count.
2. **Click `tr_conflict`** — switch to detail view. Show:
   - Status header: "failed" with Terminal badge
   - Warnings panel: `conflicting_terminals` ("Both settled and failed states received") and `event_after_terminal`
   - Event timeline: 4 events in timestamp order with event IDs
3. **Click Back** → return to list. Click `tr_happy` — clean lifecycle, no warnings.

### What to say

> "This is the transfer list. Each row shows the computed status, whether the transfer is terminal, and a warning flag if something looks suspicious. Timestamps are relative — '5 mn ago' instead of raw ISO dates."

> "Clicking a transfer opens the detail view. Here's `tr_conflict` — it has both settled and failed events, which is a critical anomaly. The system flags it with a clear warning message and references the specific event IDs, so an engineer can investigate immediately."

> "Back to the list — `tr_happy` is a clean lifecycle. Initiated, processing, settled. No warnings."

---

## Part 2: Out-of-Order / Duplicate Events (~1 min)

### What to show (terminal)

Run `bash scripts/demo.sh` and advance through Part 2. The script:

1. **Creates `tr_demo_ooo`** — sends settled first, then initiated, then processing (wrong order, correct timestamps)
2. **Queries the result** — shows the system sorted by timestamp and derived `status: settled`
3. **Resends the same event** — returns `200` "Duplicate event, skipped" instead of `201`
4. **Confirms event_count** is still 3

### What to say

> "Events from downstream systems arrive out of order. I'm sending 'settled' first, then 'initiated', then 'processing'. The timestamps tell the real story. After all three, the system sorts by timestamp and correctly determines the status is 'settled'."

> "For idempotency — I resend the exact same event. The system recognizes the event_id, returns HTTP 200 instead of 201, and the event count stays at 3. Safe for retries."

---

## Part 3: Transfer Orchestrator API (~1 min)

### What to show (terminal)

Continue the demo script through Part 3:

1. **GET /transfers/tr_happy** — pre-computed status, is_terminal, has_warnings
2. **GET /transfers?status=failed** — filtered list
3. **GET /transfers?has_warnings=true** — filtered list
4. **GET /transfers/version** — lightweight change detection
5. **POST /transfers/tr_conflict/recompute** — re-derive from events

### What to say

> "The Transfer Orchestrator is an internal service that polls for transfer status. It doesn't parse raw events — it calls our API."

> "GET /transfers/tr_happy gives it current_status, is_terminal, and has_warnings. If settled and terminal, it triggers a success notification. If failed, it schedules a retry."

> "It can filter by status or warning flag — GET /transfers?status=failed returns only failed transfers. GET /transfers?has_warnings=true surfaces anomalies."

> "For efficient polling, there's a version endpoint. The Orchestrator checks the version number; if unchanged, nothing to do. It also returns which transfer_ids changed, so the Orchestrator only fetches what it needs."

> "Finally, if we ever need to rebuild state after a bug fix, POST /transfers/:id/recompute re-derives everything from the immutable event history. That's the core advantage of event sourcing — derived state is disposable."

---

## Closing (~15 sec)

> "To summarize: events are stored as-is and state is always derived. Ingestion is idempotent and never blocked by anomalies. The API gives the Orchestrator a clean, pre-computed contract. And the UI auto-refreshes when new data arrives."
