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
  private arrivalOrderCounters: Map<string, number> = new Map(); // transfer_id -> next arrival order number
  private rejectedDuplicates: Map<string, string[]> = new Map(); // transfer_id -> rejected event_ids
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
      // Duplicate — record it and return existing transfer state with updated rejected_duplicates
      if (!this.rejectedDuplicates.has(transfer_id)) {
        this.rejectedDuplicates.set(transfer_id, []);
      }
      const rejected = this.rejectedDuplicates.get(transfer_id)!;
      if (!rejected.includes(event_id)) {
        rejected.push(event_id);
        // Update the transfer state to include the new rejected duplicate
        const existingTransfer = this.transfers.get(transfer_id);
        if (existingTransfer) {
          const updatedTransfer: Transfer = {
            ...existingTransfer,
            rejected_duplicates: [...rejected],
          };
          this.transfers.set(transfer_id, updatedTransfer);
          // Note: version and affectedTransferIds are NOT updated for duplicates
          // Duplicates are idempotent and don't count as meaningful state changes
        }
      }
      return {
        isDuplicate: true,
        transfer: this.transfers.get(transfer_id),
      };
    }

    // New event — add to store
    seenIds.add(event_id);

    if (!this.events.has(transfer_id)) {
      this.events.set(transfer_id, []);
      this.arrivalOrderCounters.set(transfer_id, 0);
    }
    
    // Track arrival order (increment counter for this transfer)
    const arrivalOrder = (this.arrivalOrderCounters.get(transfer_id) || 0) + 1;
    this.arrivalOrderCounters.set(transfer_id, arrivalOrder);
    
    // Add arrival_order to track when event was ingested
    const eventWithMetadata: TransferEvent = {
      ...event,
      arrival_order: arrivalOrder,
    };
    
    this.events.get(transfer_id)!.push(eventWithMetadata);

    // Recompute transfer state
    const allEvents = this.events.get(transfer_id)!;
    const transfer = computeTransferState(transfer_id, allEvents, this.getRejectedDuplicates(transfer_id));
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
   * Get rejected duplicate event IDs for a transfer.
   */
  getRejectedDuplicates(transferId: string): string[] {
    return this.rejectedDuplicates.get(transferId) || [];
  }

  /**
   * Recompute a transfer's state from its event history.
   */
  recomputeTransfer(transferId: string): Transfer | undefined {
    const events = this.events.get(transferId);
    if (!events || events.length === 0) return undefined;

    const transfer = computeTransferState(transferId, events, this.getRejectedDuplicates(transferId));
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
    this.arrivalOrderCounters.clear();
    this.rejectedDuplicates.clear();
    this.version = 0;
    this.affectedTransferIds.clear();
  }
}

// Singleton instance
export const store = new MemoryStore();
