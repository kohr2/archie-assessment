// ─── Seed Script ───────────────────────────────────────────────────
// Populates the server with demo data from fixtures.

import { ALL_SCENARIOS } from "../tests/fixtures";
import type { TransferEvent } from "../src/types";

const API_BASE = "http://localhost:3000";

/**
 * Adjust event timestamps to be recent relative to now.
 * Preserves relative spacing between events within a transfer.
 */
function adjustTimestamps(
  events: TransferEvent[],
  targetLastUpdatedMs: number
): TransferEvent[] {
  if (events.length === 0) return events;

  // Find the latest timestamp in the original events
  const latestOriginalTime = Math.max(
    ...events.map((e) => new Date(e.timestamp).getTime())
  );

  // Calculate the offset needed to shift all events
  const offsetMs = targetLastUpdatedMs - latestOriginalTime;

  return events.map((event) => ({
    ...event,
    timestamp: new Date(
      new Date(event.timestamp).getTime() + offsetMs
    ).toISOString(),
  }));
}

async function seed() {
  console.log(`Seeding ${ALL_SCENARIOS.length} transfer scenarios...\n`);

  const now = Date.now();
  // Define target "last updated" times for each transfer (in ms ago)
  const targetTimes: Record<string, number> = {
    tr_happy: now - 60_000, // 1 minute ago
    tr_ooo: now - 3 * 60_000, // 3 minutes ago
    tr_conflict: now - 5 * 60_000, // 5 minutes ago
    tr_after_term: now - 10 * 60_000, // 10 minutes ago
    tr_no_init: now - 15 * 60_000, // 15 minutes ago
    tr_dup_status: now - 20 * 60_000, // 20 minutes ago
    tr_idemp: now - 30 * 60_000, // 30 minutes ago
    tr_failed: now - 60 * 60_000, // 1 hour ago
    tr_single: now - 90 * 60_000, // 1.5 hours ago
    tr_multi_warn: now - 2 * 60 * 60_000, // 2 hours ago
  };

  for (const scenario of ALL_SCENARIOS) {
    console.log(`📦 ${scenario.name}: ${scenario.description}`);

    // Get the transfer_id from the first event
    const transferId = scenario.events[0]?.transfer_id;
    const targetTime = transferId
      ? targetTimes[transferId] ?? now - 3 * 60 * 60_000 // Default: 3 hours ago
      : now - 3 * 60 * 60_000;

    // Adjust timestamps to be recent
    const adjustedEvents = adjustTimestamps(scenario.events, targetTime);

    for (const event of adjustedEvents) {
      try {
        const response = await fetch(`${API_BASE}/events`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event),
        });

        if (!response.ok && response.status !== 200) {
          // 200 is OK for duplicates
          throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (response.status === 201) {
          process.stdout.write(".");
        } else {
          process.stdout.write("d"); // duplicate
        }
      } catch (error) {
        console.error(`\n❌ Error ingesting event ${event.event_id}:`, error);
        throw error;
      }
    }

    console.log(` ✅\n`);
  }

  console.log("🎉 Seeding complete!");
  console.log(`\nVisit http://localhost:3000 to view transfers in the UI.`);

  console.log("\nWaiting 30 seconds before adding more events...");
  console.log(
    "Open http://localhost:3000 now -- you will see the reload banner appear.\n"
  );
  await new Promise((resolve) => setTimeout(resolve, 30_000));

  // Second wave: new events on existing transfers + a brand new transfer
  const nowAfterWait = Date.now();
  const lateEvents: TransferEvent[] = [
    {
      transfer_id: "tr_happy",
      event_id: "evt_tr_happy_late",
      status: "processing",
      timestamp: new Date(nowAfterWait - 60_000).toISOString(), // 1 minute ago
    },
    {
      transfer_id: "tr_late",
      event_id: "evt_tr_late_1",
      status: "initiated",
      timestamp: new Date(nowAfterWait - 5 * 60_000).toISOString(), // 5 minutes ago
    },
    {
      transfer_id: "tr_late",
      event_id: "evt_tr_late_2",
      status: "processing",
      timestamp: new Date(nowAfterWait - 4 * 60_000).toISOString(), // 4 minutes ago
    },
  ];

  console.log("Sending late events...");
  for (const event of lateEvents) {
    const response = await fetch(`${API_BASE}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
    });
    process.stdout.write(response.status === 201 ? "." : "d");
  }
  console.log(" Done!\n");

  // Demo recompute endpoint on tr_happy (now has an event-after-terminal warning)
  console.log(
    "Recomputing tr_happy via POST /transfers/tr_happy/recompute..."
  );
  const recomputeRes = await fetch(`${API_BASE}/transfers/tr_happy/recompute`, {
    method: "POST",
  });
  const recomputed = await recomputeRes.json();
  console.log(
    `  Status: ${recomputed.current_status}, Warnings: ${recomputed.warnings.length}`
  );

  console.log("\nCheck the browser -- the reload banner should appear.");
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
