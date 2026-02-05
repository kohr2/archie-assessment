// ─── In-Memory Store ──────────────────────────────────────────────
// Event store and derived transfer state cache.

import type { TransferEvent, Transfer } from "../types";
import { computeTransferState } from "../domain/status";

export interface AddEventResult {
  isDuplicate: boolean;
  transfer?: Transfer;
}

/**
 * In-memory store for events and derived transfer state.
 */
export class MemoryStore {
  private events: Map<string, TransferEvent[]> = new Map();
  private transfers: Map<string, Transfer> = new Map();
  private seenEventIds: Map<string, Set<string>> = new Map(); // transfer_id -> Set<event_id>
  private version: number = 0;
  private affectedTransferIds: Set<string> = new Set();

  /**
   * Add an event to the store.
   * Returns result indicating if event was duplicate.
   */
  addEvent(event: TransferEvent): AddEventResult {
    const { transfer_id, event_id } = event;

    // Check idempotency: has this event_id been seen for this transfer?
    if (!this.seenEventIds.has(transfer_id)) {
      this.seenEventIds.set(transfer_id, new Set());
    }

    const seenIds = this.seenEventIds.get(transfer_id)!;
    if (seenIds.has(event_id)) {
      // Duplicate — return existing transfer state
      return {
        isDuplicate: true,
        transfer: this.transfers.get(transfer_id),
      };
    }

    // New event — add to store
    seenIds.add(event_id);

    if (!this.events.has(transfer_id)) {
      this.events.set(transfer_id, []);
    }
    this.events.get(transfer_id)!.push(event);

    // Recompute transfer state
    const allEvents = this.events.get(transfer_id)!;
    const transfer = computeTransferState(transfer_id, allEvents);
    this.transfers.set(transfer_id, transfer);
    this.version++;
    this.affectedTransferIds.add(transfer_id);

    return {
      isDuplicate: false,
      transfer,
    };
  }

  /**
   * Get transfer by ID.
   */
  getTransfer(transferId: string): Transfer | undefined {
    return this.transfers.get(transferId);
  }

  /**
   * List all transfers, optionally filtered.
   */
  listTransfers(filters?: {
    status?: string;
    has_warnings?: boolean;
  }): { transfers: Transfer[]; total: number } {
    let transfers = Array.from(this.transfers.values());

    // Apply filters
    if (filters?.status) {
      transfers = transfers.filter((t) => t.current_status === filters.status);
    }

    if (filters?.has_warnings !== undefined) {
      transfers = transfers.filter((t) => t.has_warnings === filters.has_warnings);
    }

    return {
      transfers,
      total: transfers.length,
    };
  }

  /**
   * Get the current version (incremented on each new event or recompute).
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Get affected transfer IDs since last poll and clear the set.
   */
  getAffectedTransferIds(): string[] {
    const ids = Array.from(this.affectedTransferIds);
    this.affectedTransferIds.clear();
    return ids;
  }

  /**
   * Recompute a transfer's state from its event history.
   */
  recomputeTransfer(transferId: string): Transfer | undefined {
    const events = this.events.get(transferId);
    if (!events || events.length === 0) return undefined;

    const transfer = computeTransferState(transferId, events);
    this.transfers.set(transferId, transfer);
    this.version++;
    this.affectedTransferIds.add(transferId);
    return transfer;
  }

  /**
   * Clear all data (for test isolation).
   */
  clear(): void {
    this.events.clear();
    this.transfers.clear();
    this.seenEventIds.clear();
    this.version = 0;
    this.affectedTransferIds.clear();
  }
}

// Singleton instance
export const store = new MemoryStore();
