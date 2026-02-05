// ─── Domain Types ───────────────────────────────────────────────

export type Status = "initiated" | "processing" | "settled" | "failed";

export interface TransferEvent {
  transfer_id: string;
  event_id: string;
  status: Status;
  timestamp: string; // ISO 8601 UTC - event's own timestamp from downstream system
  reason?: string; // Optional, typically present on "failed"
  arrival_order?: number; // Order in which this event arrived (1st, 2nd, 3rd, etc.)
}

export interface Warning {
  type: WarningType;
  message: string;
  event_ids: string[];
}

export type WarningType =
  | "event_after_terminal"
  | "conflicting_terminals"
  | "missing_initiated"
  | "duplicate_status";

export interface Transfer {
  transfer_id: string;
  current_status: Status;
  is_terminal: boolean;
  has_warnings: boolean;
  last_updated: string;
  event_count: number;
  warnings: Warning[];
  events: TransferEvent[];
  rejected_duplicates?: string[]; // Event IDs that were rejected as duplicates
}
