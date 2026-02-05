// ─── Transfer Tracker UI ───────────────────────────────────────────
// Vanilla JS — no framework, just fetch() and DOM manipulation.

const API_BASE = ""; // Same origin

// ─── State ────────────────────────────────────────────────────────

let currentView = "list";
let currentTransferId = null;
let knownVersion = 0;
let recentlyUpdatedIds = new Set(); // Track transfers updated via live polling

// ─── View Management ───────────────────────────────────────────────

function showListView() {
  document.getElementById("list-view").style.display = "block";
  document.getElementById("detail-view").style.display = "none";
  currentView = "list";
  loadTransfers();
}

function showDetailView(transferId) {
  document.getElementById("list-view").style.display = "none";
  document.getElementById("detail-view").style.display = "block";
  currentView = "detail";
  currentTransferId = transferId;
  loadTransferDetail(transferId);
}

// ─── API Calls ────────────────────────────────────────────────────

async function fetchTransfers(filters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.append("status", filters.status);
  if (filters.has_warnings !== undefined) params.append("has_warnings", filters.has_warnings);

  const url = `${API_BASE}/transfers${params.toString() ? `?${params}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchTransfer(id) {
  const response = await fetch(`${API_BASE}/transfers/${id}`);
  if (!response.ok) {
    if (response.status === 404) throw new Error("Transfer not found");
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

// ─── List View ────────────────────────────────────────────────────

async function loadTransfers() {
  const loadingEl = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const tableEl = document.getElementById("transfers-table");
  const tbodyEl = document.getElementById("transfers-tbody");

  loadingEl.style.display = "block";
  errorEl.style.display = "none";
  tableEl.style.display = "none";

  try {
    const data = await fetchTransfers();
    loadingEl.style.display = "none";

    if (data.transfers.length === 0) {
      tbodyEl.innerHTML = "<tr><td colspan='6'>No transfers found</td></tr>";
      tableEl.style.display = "table";
      return;
    }

    tbodyEl.innerHTML = data.transfers.map((transfer) => {
      const statusClass = `status-${transfer.current_status}`;
      const terminalBadge = transfer.is_terminal
        ? '<span class="badge badge-terminal">Terminal</span>'
        : '<span class="badge badge-active">Active</span>';
      const warningBadge = transfer.has_warnings
        ? '<span class="badge badge-warning">⚠️</span>'
        : "";
      const isLiveUpdate = recentlyUpdatedIds.has(transfer.transfer_id);
      const rowClass = isLiveUpdate ? "transfer-row recently-updated" : "transfer-row";

      return `
        <tr class="${rowClass}" data-transfer-id="${transfer.transfer_id}">
          <td>${transfer.transfer_id}</td>
          <td><span class="status ${statusClass}">${transfer.current_status}</span></td>
          <td>${terminalBadge}</td>
          <td>${warningBadge}</td>
          <td>${formatTimestamp(transfer.last_updated)}</td>
          <td>${transfer.event_count}</td>
        </tr>
      `;
    }).join("");

    // Attach click handlers
    document.querySelectorAll(".transfer-row").forEach((row) => {
      row.addEventListener("click", () => {
        const transferId = row.dataset.transferId;
        showDetailView(transferId);
      });
      row.style.cursor = "pointer";
    });

    tableEl.style.display = "table";
  } catch (error) {
    loadingEl.style.display = "none";
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.style.display = "block";
  }
}

// ─── Detail View ───────────────────────────────────────────────────

async function loadTransferDetail(transferId) {
  const loadingEl = document.getElementById("detail-loading");
  const errorEl = document.getElementById("detail-error");
  const contentEl = document.getElementById("detail-content");

  loadingEl.style.display = "block";
  errorEl.style.display = "none";
  contentEl.style.display = "none";

  try {
    const transfer = await fetchTransfer(transferId);
    loadingEl.style.display = "none";

    // Set page title with transfer ID
    document.getElementById("detail-title").textContent = `Transfer ID: ${transferId}`;

    // Status header
    const statusClass = `status-${transfer.current_status}`;
    document.getElementById("detail-status").textContent = transfer.current_status;
    document.getElementById("detail-status").className = `status ${statusClass}`;
    document.getElementById("detail-terminal-badge").textContent = transfer.is_terminal
      ? "Terminal"
      : "Active";
    document.getElementById("detail-terminal-badge").className = `badge ${
      transfer.is_terminal ? "badge-terminal" : "badge-active"
    }`;

    // Warnings
    const warningsEl = document.getElementById("detail-warnings");
    if (transfer.warnings.length > 0) {
      warningsEl.innerHTML = `
        <h3>⚠️ Warnings</h3>
        ${transfer.warnings
          .map(
            (w) => `
          <div class="warning-item">
            <strong>${w.type}</strong>: ${w.message}
            <br><small>Event IDs: ${w.event_ids.join(", ")}</small>
          </div>
        `
          )
          .join("")}
      `;
      warningsEl.style.display = "block";
    } else {
      warningsEl.style.display = "none";
    }

    // Event timeline
    // Events are always sorted by timestamp (not arrival order) to handle out-of-order events
    // For tr_ooo specifically, this demonstrates out-of-order handling
    const eventsEl = document.getElementById("detail-events");
    // Find the Event Timeline h3 (it's a direct child of detail-content, after warnings)
    const allH3s = contentEl.querySelectorAll("h3");
    const timelineHeadingEl = Array.from(allH3s).find((h3) => h3.textContent.trim() === "Event Timeline");
    if (timelineHeadingEl) {
      // Add note about timestamp-based sorting (especially relevant for out-of-order scenarios)
      timelineHeadingEl.innerHTML = 'Event Timeline <small style="color: #666; font-weight: normal;">(sorted by timestamp)</small>';
    }

    eventsEl.innerHTML = transfer.events
      .map((event) => {
        const reasonText = event.reason ? ` <span class="reason">(${event.reason})</span>` : "";
        const arrivalOrderText = event.arrival_order
          ? `<small class="arrival-order" style="color: #666; display: block; margin-top: 2px;">arrived ${getOrdinalSuffix(event.arrival_order)}</small>`
          : "";
        return `
          <div class="timeline-item">
            <div class="timeline-time">${formatAbsoluteTimestamp(event.timestamp)}${arrivalOrderText}</div>
            <div class="timeline-content">
              <span class="status status-${event.status}">${event.status}</span>
              ${reasonText}
              <small class="event-id">${event.event_id}</small>
            </div>
          </div>
        `;
      })
      .join("");

    // Display rejected duplicates if any
    if (transfer.rejected_duplicates && transfer.rejected_duplicates.length > 0) {
      const rejectedEl = document.createElement("div");
      rejectedEl.className = "rejected-duplicates";
      rejectedEl.style.marginTop = "20px";
      rejectedEl.style.padding = "10px";
      rejectedEl.style.backgroundColor = "#f5f5f5";
      rejectedEl.style.borderRadius = "4px";
      rejectedEl.innerHTML = `
        <h4 style="margin: 0 0 8px 0; color: #666; font-size: 14px;">Duplicate attempts (rejected):</h4>
        <div style="color: #888; font-size: 13px;">
          ${transfer.rejected_duplicates.map((eventId) => `<code>${eventId}</code>`).join(", ")}
        </div>
      `;
      eventsEl.parentNode?.insertBefore(rejectedEl, eventsEl.nextSibling);
    }

    contentEl.style.display = "block";
  } catch (error) {
    loadingEl.style.display = "none";
    errorEl.textContent = `Error: ${error.message}`;
    errorEl.style.display = "block";
  }
}

// ─── Utilities ───────────────────────────────────────────────────

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return "just now";
  } else if (diffMins < 60) {
    return `${diffMins} mn ago`;
  } else if (diffHours < 24) {
    return `${diffHours} h ago`;
  } else {
    return `${diffDays} d ago`;
  }
}

function formatAbsoluteTimestamp(isoString) {
  const date = new Date(isoString);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds} UTC`;
}

function getOrdinalSuffix(n) {
  const j = n % 10;
  const k = n % 100;
  if (j === 1 && k !== 11) {
    return n + "st";
  }
  if (j === 2 && k !== 12) {
    return n + "nd";
  }
  if (j === 3 && k !== 13) {
    return n + "rd";
  }
  return n + "th";
}

// ─── Version Polling ──────────────────────────────────────────────

async function pollVersion() {
  try {
    const res = await fetch(`${API_BASE}/transfers/version`);
    const data = await res.json();
    if (knownVersion > 0 && data.version !== knownVersion) {
      const affectedIds = data.affected_transfer_ids || [];
      // Track which transfers were updated via live polling
      affectedIds.forEach((id) => recentlyUpdatedIds.add(id));
      showReloadBanner(affectedIds);
      // Clear highlights after 5 seconds
      setTimeout(() => {
        affectedIds.forEach((id) => recentlyUpdatedIds.delete(id));
        if (currentView === "list") {
          loadTransfers(); // Re-render to remove highlights
        }
      }, 5000);
    }
    knownVersion = data.version;
  } catch (_) {
    /* silent */
  }
}

setInterval(pollVersion, 10000);

// ─── Reload Banner ────────────────────────────────────────────────

function showReloadBanner(affectedTransferIds) {
  if (currentView === "detail" && affectedTransferIds.includes(currentTransferId)) {
    // Detail view: this specific transfer was affected - auto-refresh
    loadTransferDetail(currentTransferId);
    const banner = document.getElementById("reload-banner-detail");
    const msg = document.getElementById("reload-message-detail");
    msg.textContent = "Updated — new events processed";
    banner.style.display = "flex";
    banner.classList.add("show");
    // Auto-hide after 3 seconds
    setTimeout(() => {
      banner.classList.remove("show");
      banner.style.display = "none";
    }, 3000);
  } else if (currentView === "list" && affectedTransferIds.length > 0) {
    // List view: any transfer changed - auto-refresh
    loadTransfers();
    const banner = document.getElementById("reload-banner");
    const msg = document.getElementById("reload-message");
    msg.textContent = "Data refreshed — status recomputed";
    banner.style.display = "flex";
    banner.classList.add("show");
    // Auto-hide after 3 seconds
    setTimeout(() => {
      banner.classList.remove("show");
      banner.style.display = "none";
    }, 3000);
  }
  // If in detail view but viewing a different transfer, don't show banner
}

// ─── Event Handlers ───────────────────────────────────────────────

document.getElementById("back-btn").addEventListener("click", showListView);

// ─── Initialize ───────────────────────────────────────────────────

showListView();
