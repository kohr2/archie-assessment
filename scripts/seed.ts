// ─── Seed Script ───────────────────────────────────────────────────
// Populates the server with demo data from fixtures.

import { ALL_SCENARIOS } from "../tests/fixtures";

const API_BASE = "http://localhost:3000";

async function seed() {
  console.log(`Seeding ${ALL_SCENARIOS.length} transfer scenarios...\n`);

  for (const scenario of ALL_SCENARIOS) {
    console.log(`📦 ${scenario.name}: ${scenario.description}`);

    for (const event of scenario.events) {
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
}

seed().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
