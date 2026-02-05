// ─── Express App Factory ──────────────────────────────────────────
// Creates Express app without starting server (for supertest).

import express, { Express, Request, Response, NextFunction } from "express";
import eventsRouter from "./routes/events";
import transfersRouter from "./routes/transfers";
import { logger } from "./logger";

export function createApp(): Express {
  const app = express();

  // JSON body parser
  app.use(express.json());

  // Request logging middleware
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();

    res.on("finish", () => {
      const duration = Date.now() - startTime;
      logger.info("Request", {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration_ms: duration,
      });
    });

    next();
  });

  // Routes
  app.use("/events", eventsRouter);
  app.use("/transfers", transfersRouter);

  // Global error middleware (catch-all)
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error("Unhandled error", {
      error: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: "Internal server error",
    });
  });

  return app;
}
