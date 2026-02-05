// ─── Transfer Tracker UI ───────────────────────────────────────────
// Vanilla JS — no framework, just fetch() and DOM manipulation.

const API_BASE = ""; // Same origin

// ─── State ────────────────────────────────────────────────────────

let currentView = "list";
let currentTransferId = null;

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

      return `
        <tr class="transfer-row" data-transfer-id="${transfer.transfer_id}">
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
    const eventsEl = document.getElementById("detail-events");
    eventsEl.innerHTML = transfer.events
      .map((event) => {
        const reasonText = event.reason ? ` <span class="reason">(${event.reason})</span>` : "";
        return `
          <div class="timeline-item">
            <div class="timeline-time">${formatTimestamp(event.timestamp)}</div>
            <div class="timeline-content">
              <span class="status status-${event.status}">${event.status}</span>
              ${reasonText}
              <small class="event-id">${event.event_id}</small>
            </div>
          </div>
        `;
      })
      .join("");

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
  return date.toLocaleString();
}

// ─── Event Handlers ───────────────────────────────────────────────

document.getElementById("back-btn").addEventListener("click", showListView);

// ─── Initialize ───────────────────────────────────────────────────

showListView();
