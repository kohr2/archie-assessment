// ─── Structured Logging ───────────────────────────────────────────
// Thin wrapper around console.log with JSON output for observability.

interface LogContext {
  [key: string]: string | number | boolean | undefined;
}

class Logger {
  private formatMessage(level: string, message: string, context?: LogContext): string {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...context,
    };
    return JSON.stringify(logEntry);
  }

  info(message: string, context?: LogContext): void {
    console.log(this.formatMessage("INFO", message, context));
  }

  warn(message: string, context?: LogContext): void {
    console.warn(this.formatMessage("WARN", message, context));
  }

  error(message: string, context?: LogContext): void {
    console.error(this.formatMessage("ERROR", message, context));
  }
}

export const logger = new Logger();
