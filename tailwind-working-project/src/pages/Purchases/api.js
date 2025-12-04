// src/services/api.js (purchases-focused helpers)

// ------------------------------
// Base URLs (centralized)
// ------------------------------
import { API_BASE } from "../../lib/api";
export const PURCHASES_BASE = `${API_BASE}/purchases`;

// ------------------------------
// Small fetch helpers
// ------------------------------
async function fetchJSON(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status} on ${url}`);
  }
  // Some endpoints return '', e.g. 204/empty JSON
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return null;
  return await res.json();
}

/**
 * Try several URLs (useful to handle accidental double-prefix in the backend).
 * Resolves with the first successful response.
 */
async function tryUrls(urls, options = {}) {
  let lastErr;
  for (const url of urls) {
    try {
      return await fetchJSON(url, options);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("All URL attempts failed");
}

// ------------------------------
// Purchases: List / Get / Create / Update / Delete
// ------------------------------


export async function getPurchaseInvoices() {
  return await tryUrls([
    `${PURCHASES_BASE}/purchase-invoices`,
  ]);
}

/** Get a single purchase invoice by id */
export async function getPurchaseInvoice(id) {
  if (id == null) throw new Error("getPurchaseInvoice: id is required");
  return await fetchJSON(`${PURCHASES_BASE}/${id}`);
}

/** Create a new purchase invoice */
export async function createPurchaseInvoice(data) {
  return await fetchJSON(`${PURCHASES_BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data ?? {}),
  });
}

/** Update an existing purchase invoice (PUT /purchases/{id}/edit) */
export async function updatePurchaseInvoice(id, data) {
  if (id == null) throw new Error("updatePurchaseInvoice: id is required");
  return await fetchJSON(`${PURCHASES_BASE}/${id}/edit`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data ?? {}),
  });
}

/** Delete an existing purchase invoice */
export async function deletePurchaseInvoice(id) {
  if (id == null) throw new Error("deletePurchaseInvoice: id is required");
  return await fetchJSON(`${PURCHASES_BASE}/${id}`, { method: "DELETE" });
}

// ------------------------------
// Purchases: Taxes and totals helpers
// ------------------------------

/** Load purchase tax options */
export async function getPurchaseTaxes() {
  // Backend has this at /purchases/taxes/
  return await fetchJSON(`${PURCHASES_BASE}/taxes/`);
}

// If you later add an endpoint that returns running totals for a page/list,
// you can wire it here. For now, totals are usually computed client-side
// based on the returned rows and their tax breakdowns.

// ------------------------------
// Recurring helpers
// ------------------------------

/** Get pending recurring purchase templates/items to be actioned */
export async function fetchPendingRecurring() {
  return await fetchJSON(`${PURCHASES_BASE}/pending_recurring`);
}

/**
 * Create invoices from a batch of templates.
 * The backend currently defines:
 *   POST /purchases/batch_create_recurring
 * but due to an accidental double prefix in code, it may actually be
 *   /purchases/purchases/batch_create_recurring
 * We try the correct one first, then the double-prefixed fallback.
 *
 * @param {Array|Object} payload - e.g. [{template_id, next_issue_date}, ...] or your full payload
 */
export async function batchCreateFromRecurring(payload) {
  const body = JSON.stringify(payload ?? []);
  return await tryUrls(
    [
      `${PURCHASES_BASE}/batch_create_recurring`,
      `${PURCHASES_BASE}/purchases/batch_create_recurring`,
    ],
    { method: "POST", headers: { "Content-Type": "application/json" }, body }
  );
}

/**
 * Delete a batch of pending recurring template entries by ids
 * Tries:
 *   POST /purchases/batch_delete
 *   POST /purchases/purchases/batch_delete  (fallback)
 */
export async function batchDeletePending(ids) {
  const body = JSON.stringify(ids ?? []);
  return await tryUrls(
    [
      `${PURCHASES_BASE}/batch_delete`,
      `${PURCHASES_BASE}/purchases/batch_delete`,
    ],
    { method: "POST", headers: { "Content-Type": "application/json" }, body }
  );
}

// ------------------------------
// Batch posting
// ------------------------------

/**
 * Batch post purchase invoices by ids.
 * Tries:
 *   POST /purchases/batch_post
 *   POST /purchases/purchases/batch_post  (fallback)
 */
export async function batchPostPurchaseInvoices(ids) {
  const body = JSON.stringify(ids ?? []);
  return await tryUrls(
    [
      `${PURCHASES_BASE}/batch_post`,
      `${PURCHASES_BASE}/purchases/batch_post`,
    ],
    { method: "POST", headers: { "Content-Type": "application/json" }, body }
  );
}

// ------------------------------
// Misc helpers
// ------------------------------

/** Copy an existing purchase invoice into a new one (server clones lines etc.) */
export async function copyPurchaseInvoice(invoiceId) {
  if (invoiceId == null) throw new Error("copyPurchaseInvoice: invoiceId is required");
  return await fetchJSON(`${PURCHASES_BASE}/${invoiceId}/copy`, { method: "POST" });
}

/**
 * (Optional) Server-side fix-up of lines that are missing gross-up values, etc.
 * Tries:
 *   POST /purchases/grossup_missing_lines
 *   POST /purchases/purchases/grossup_missing_lines (fallback)
 */
export async function grossupMissingLines(payload) {
  const body = JSON.stringify(payload ?? {});
  return await tryUrls(
    [
      `${PURCHASES_BASE}/grossup_missing_lines`,
      `${PURCHASES_BASE}/purchases/grossup_missing_lines`,
    ],
    { method: "POST", headers: { "Content-Type": "application/json" }, body }
  );
}

// ------------------------------
// LEGACY names kept for compatibility
// ------------------------------

/** Old name kept: underscore version (calls the typed list under the hood) */
export async function getPurchaseInvoicesV2() {
  return await getPurchaseInvoices();
}

/** Old name kept: update V2 */
export async function updatePurchaseInvoiceV2(id, data) {
  return await updatePurchaseInvoice(id, data);
}
