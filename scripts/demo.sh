#!/bin/bash
# ─── Demo Script ────────────────────────────────────────────────────
# Walkthrough script for the Loom/video recording.
# Covers the three required demo points:
#   1. Transfer list + detail view (UI)
#   2. Out-of-order / duplicate events (live curl commands)
#   3. How the second consumer (Transfer Orchestrator) calls the status API
#
# Prerequisites:
#   bash setup.sh
#   bash run.sh   (seeds demo data, server on http://localhost:3000)
#
# Usage:
#   bash scripts/demo.sh
#
# The script pauses between sections so you can narrate during recording.
# ─────────────────────────────────────────────────────────────────────

set -e

API="http://localhost:3000"
BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

pause() {
  echo ""
  echo -e "${DIM}── Press Enter to continue ──${RESET}"
  read -r
}

section() {
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo -e "${BOLD}${CYAN}  $1${RESET}"
  echo "════════════════════════════════════════════════════════════"
  echo ""
}

subsection() {
  echo ""
  echo -e "${BOLD}▸ $1${RESET}"
  echo ""
}

narrate() {
  echo -e "${DIM}$1${RESET}"
}

run_curl() {
  echo -e "${YELLOW}\$ $1${RESET}"
  echo ""
  eval "$1" 2>/dev/null | python3 -m json.tool 2>/dev/null || eval "$1" 2>/dev/null
  echo ""
}

# ─── Check server is running ─────────────────────────────────────

echo ""
echo "Checking server at $API..."
if ! curl -s "$API/transfers" > /dev/null 2>&1; then
  echo -e "${RED}Server not running. Start it first:${RESET}"
  echo "  bash run.sh"
  exit 1
fi
echo -e "${GREEN}Server is up.${RESET}"

# ═══════════════════════════════════════════════════════════════════
# PART 1: Transfer List + Detail View
# ═══════════════════════════════════════════════════════════════════

section "PART 1: Transfer List + Detail View"

narrate "The UI is a single-page app at http://localhost:3000."
narrate "It shows two views: a transfer list and a per-transfer detail view."
narrate ""
narrate "→ Open http://localhost:3000 in the browser now."
narrate ""
narrate "The LIST VIEW shows a table with:"
narrate "  • Transfer ID"
narrate "  • Current status (initiated / processing / settled / failed)"
narrate "  • Terminal badge (terminal vs active)"
narrate "  • Warning indicator (⚠️ for anomalies)"
narrate "  • Last updated (relative: '3 mn ago')"
narrate "  • Event count"
narrate ""
narrate "Click any row to open the DETAIL VIEW, which shows:"
narrate "  • Current status + terminal badge"
narrate "  • Warnings with type, message, and related event IDs"
narrate "  • Full event timeline sorted by timestamp"
narrate ""
narrate "Let's fetch the list via the API to see the data:"

pause

subsection "1a. List all transfers"
run_curl "curl -s $API/transfers"

pause

subsection "1b. Detail view — happy path transfer (tr_happy)"
narrate "A clean lifecycle: initiated → processing → settled. No warnings."
run_curl "curl -s $API/transfers/tr_happy"

pause

subsection "1c. Detail view — transfer with warnings (tr_conflict)"
narrate "This transfer has both 'settled' and 'failed' — conflicting terminal states."
narrate "The system flags this as a critical anomaly."
run_curl "curl -s $API/transfers/tr_conflict"

pause

# ═══════════════════════════════════════════════════════════════════
# PART 2: Out-of-Order and Duplicate Events
# ═══════════════════════════════════════════════════════════════════

section "PART 2: Out-of-Order and Duplicate Events"

narrate "Real-world events arrive out of order and may be duplicated."
narrate "Let's demonstrate both scenarios live."

pause

subsection "2a. Create a fresh transfer with out-of-order events"

narrate "We send 3 events for transfer 'tr_demo_ooo' — but in the WRONG order."
narrate "The 'settled' event arrives first, then 'initiated', then 'processing'."
narrate "However, the timestamps tell the true story."
echo ""

NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
T1=$(date -u -v-3M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '3 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "2024-01-05T12:00:00Z")
T2=$(date -u -v-2M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '2 minutes ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "2024-01-05T12:01:00Z")
T3=$(date -u -v-1M +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 minute ago' +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo "2024-01-05T12:02:00Z")

narrate "Event 1 (arrives first): settled — timestamp $T3 (most recent)"
run_curl "curl -s -X POST $API/events -H 'Content-Type: application/json' -d '{\"transfer_id\":\"tr_demo_ooo\",\"event_id\":\"evt_ooo_3\",\"status\":\"settled\",\"timestamp\":\"$T3\"}'"

narrate "Event 2 (arrives second): initiated — timestamp $T1 (earliest)"
run_curl "curl -s -X POST $API/events -H 'Content-Type: application/json' -d '{\"transfer_id\":\"tr_demo_ooo\",\"event_id\":\"evt_ooo_1\",\"status\":\"initiated\",\"timestamp\":\"$T1\"}'"

narrate "Event 3 (arrives third): processing — timestamp $T2 (middle)"
run_curl "curl -s -X POST $API/events -H 'Content-Type: application/json' -d '{\"transfer_id\":\"tr_demo_ooo\",\"event_id\":\"evt_ooo_2\",\"status\":\"processing\",\"timestamp\":\"$T2\"}'"

narrate "Now let's check the derived state. Despite the chaotic arrival order,"
narrate "the system sorts by timestamp and correctly determines:"
narrate "  status = settled (latest timestamp wins)"
narrate "  timeline = initiated → processing → settled (timestamp order)"
echo ""
run_curl "curl -s $API/transfers/tr_demo_ooo"

pause

subsection "2b. Duplicate events (idempotency)"

narrate "Now we resend the EXACT same 'initiated' event (same event_id: evt_ooo_1)."
narrate "The system detects the duplicate and returns 200 instead of 201."
echo ""

narrate "Sending duplicate event (evt_ooo_1 again):"
run_curl "curl -s -w '\nHTTP Status: %{http_code}\n' -X POST $API/events -H 'Content-Type: application/json' -d '{\"transfer_id\":\"tr_demo_ooo\",\"event_id\":\"evt_ooo_1\",\"status\":\"initiated\",\"timestamp\":\"$T1\"}'"

narrate "Check event_count — still 3, not 4. The duplicate was silently skipped."
run_curl "curl -s $API/transfers/tr_demo_ooo | python3 -c \"import sys,json; d=json.load(sys.stdin); print(f'event_count: {d[\\\"event_count\\\"]}')\""

pause

subsection "2c. Pre-seeded out-of-order example (tr_ooo)"

narrate "The seed data includes tr_ooo — events arrived as: settled, initiated, processing."
narrate "The system reconstructed the correct timeline from timestamps."
run_curl "curl -s $API/transfers/tr_ooo"

pause

# ═══════════════════════════════════════════════════════════════════
# PART 3: How the Transfer Orchestrator Calls the Status API
# ═══════════════════════════════════════════════════════════════════

section "PART 3: Second Consumer — Transfer Orchestrator API"

narrate "The Transfer Orchestrator is an internal service (not ours) that:"
narrate "  • Sends 'success' notifications when a transfer is settled"
narrate "  • Schedules retries when a transfer fails"
narrate "  • Polls frequently and needs a clean, pre-computed status"
narrate ""
narrate "It does NOT parse raw events. It uses the same REST API we built."
narrate "Here's how it would call our system:"

pause

subsection "3a. Poll for a specific transfer's status"

narrate "The Orchestrator knows a transfer_id and polls for its state."
narrate "The response includes current_status, is_terminal, and has_warnings"
narrate "— everything the Orchestrator needs without parsing events."
echo ""

run_curl "curl -s $API/transfers/tr_happy"

narrate "The Orchestrator sees:"
narrate "  current_status: 'settled' → trigger success notification"
narrate "  is_terminal: true → stop polling this transfer"
narrate "  has_warnings: false → no need for human escalation"

pause

subsection "3b. Poll for failed transfers (to schedule retries)"

narrate "The Orchestrator can filter by status to find only failed transfers:"
run_curl "curl -s '$API/transfers?status=failed'"

narrate "Each result has is_terminal: true — the Orchestrator knows these are"
narrate "final and can schedule retry logic or alert a human."

pause

subsection "3c. Poll for transfers with warnings (to escalate)"

narrate "The Orchestrator can also filter for warning transfers:"
run_curl "curl -s '$API/transfers?has_warnings=true'"

narrate "has_warnings: true at the top level means the Orchestrator can filter"
narrate "without parsing the warnings array. Detailed warnings are available"
narrate "if it needs to log or route to the right team."

pause

subsection "3d. Lightweight version polling (change detection)"

narrate "Instead of fetching the full list on every poll cycle, the Orchestrator"
narrate "can hit the /transfers/version endpoint — returns a version counter."
narrate "If the version hasn't changed, nothing new to process."
run_curl "curl -s $API/transfers/version"

narrate "The Orchestrator compares 'version' with its last known value."
narrate "If different, it fetches the transfers it cares about."
narrate "affected_transfer_ids tells it which specific transfers changed."

pause

subsection "3e. Recompute a transfer from raw events"

narrate "If the Orchestrator suspects stale data (e.g., after a bug fix),"
narrate "it can trigger a re-derivation from the immutable event history:"
run_curl "curl -s -X POST $API/transfers/tr_conflict/recompute"

narrate "This re-derives the transfer state from raw events — the core advantage"
narrate "of event sourcing. Derived state is disposable; events are the truth."

pause

# ═══════════════════════════════════════════════════════════════════
# WRAP-UP
# ═══════════════════════════════════════════════════════════════════

section "Summary"

echo -e "${GREEN}Key design points demonstrated:${RESET}"
echo ""
echo "  1. Events are stored as-is, state is derived"
echo "     → timestamps determine order, not arrival sequence"
echo ""
echo "  2. Idempotent ingestion"
echo "     → same event_id returns 200, event_count unchanged"
echo ""
echo "  3. Anomaly detection never blocks ingestion"
echo "     → bad data is stored AND flagged for investigation"
echo ""
echo "  4. Clean API contract for the Orchestrator"
echo "     → pre-computed status, is_terminal, has_warnings"
echo "     → filter by status or warning flag"
echo "     → version endpoint for efficient polling"
echo ""
echo "  5. UI auto-refreshes on changes"
echo "     → 10s version polling, passive notification banner"
echo "     → recently updated transfers highlighted"
echo ""
echo -e "${DIM}Demo complete.${RESET}"
echo ""
