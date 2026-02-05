// ─── Entry Point ───────────────────────────────────────────────────
// Starts the Express server.

import { createApp } from "./app";
import { DEFAULT_PORT } from "./constants";
import { logger } from "./logger";

const app = createApp();

app.listen(DEFAULT_PORT, () => {
  logger.info("Server started", { port: DEFAULT_PORT });
  console.log(`Transfer Tracker running on http://localhost:${DEFAULT_PORT}`);
});
