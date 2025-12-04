import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom"; // ← add this import
import { API_BASE } from "../../lib/api";

/**
 * Toggle depending on what your backend expects:
 *  - false: send only {template_id, next_issue_date}
 *  - true : send complete invoice payload with lines (header + lines)
 */
const SEND_FULL_PAYLOAD = true;

/** Safe date => YYYY-MM-DD */
function toYMD(value) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Calculate next issue date on client side as fallback */
function calculateNextIssueDate(currentDate, recurrenceInterval) {
  if (!currentDate || !recurrenceInterval) return currentDate;
  
  const date = new Date(currentDate);
  const interval = recurrenceInterval.toLowerCase();
  
  if (interval.includes('month')) {
    const months = interval.includes('1 month') || interval === 'monthly' ? 1 : 
                  interval.match(/(\d+)\s*month/) ? parseInt(interval.match(/(\d+)\s*month/)[1]) : 1;
    date.setMonth(date.getMonth() + months);
  } else if (interval.includes('year')) {
    const years = interval.match(/(\d+)\s*year/) ? parseInt(interval.match(/(\d+)\s*year/)[1]) : 1;
    date.setFullYear(date.getFullYear() + years);
  }
  
  return toYMD(date);
}

function fmt(n) {
  const num = Number(n ?? 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Fetch suppliers to get names */
async function fetchSuppliers(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/suppliers/`);
    if (res.ok) {
      const suppliers = await res.json();
      return suppliers.reduce((acc, s) => ({ ...acc, [s.id]: s.name }), {});
    }
  } catch (e) {
    console.error("Failed to fetch suppliers:", e);
  }
  return {};
}

/** Try several likely query param names that FastAPI endpoints often use */
async function fetchPendingRecurring(baseUrl) {
  const res = await fetch(`${baseUrl}/purchases/pending_recurring`);
  const text = await res.text();
  if (!res.ok) throw new Error(text);
  try { 
    const data = JSON.parse(text);
    
    // Fetch suppliers to enhance data
    const suppliers = await fetchSuppliers(baseUrl);
    
    // Enhance data with supplier names and descriptions
    const enhancedData = data.map(inv => ({
      ...inv,
      supplier_name: inv.supplier_name || suppliers[inv.supplier_id] || `Supplier ID: ${inv.supplier_id}`,
      description: inv.description || buildDescriptionFromLines(inv) || inv.reference || "No description"
    }));
    
    return { data: enhancedData, error: "" }; 
  }
  catch { return { data: [], error: "" }; }
}

/** Build description from line items */
function buildDescriptionFromLines(inv) {
  const lines = inv?.lines || [];
  const descriptions = lines.map(line => {
    const parts = [];
    if (line.item) parts.push(line.item);
    if (line.description && line.description !== line.item) parts.push(line.description);
    return parts.join(" / ");
  }).filter(d => d);
  
  return descriptions.join(", ");
}

export default function PendingRecurringInvoices() {
  const navigate = useNavigate(); // ← add this

  const [pending, setPending] = useState([]);
  const [selected, setSelected] = useState([]); // store the raw invs we selected
  const [expanded, setExpanded] = useState({}); // {rowKey: bool}
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setErr("");
      // This is where the fetch happens:
      const { data, error } = await fetchPendingRecurring(API_BASE);
      if (!mounted) return;
      if (error) {
        console.error(error);
        setErr(
          "Failed to load pending recurring purchases. " +
          "Server said: " + error
        );
        setPending([]);
      } else {
        setPending(Array.isArray(data) ? data : []);
      }
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, []);

  function rowKey(inv) {
    const nextDate = inv.next_issue_date || calculateNextIssueDate(inv.invoice_date, inv.recurrence_interval);
    return `${inv.template_id || inv.id}-${toYMD(nextDate)}`;
  }

  function getLines(inv) {
    const lines = inv?.lines ?? inv?.items ?? inv?.template_lines ?? [];
    return Array.isArray(lines) ? lines : [];
  }

  function lineTaxesAsText(line) {
    if (Array.isArray(line.taxes) && line.taxes.length) {
      return line.taxes.map(t => (t?.name ?? t)).join(", ");
    }
    const bits = [];
    if (line.vat) bits.push("VAT");
    if (line.excise) bits.push("Excise");
    // Fallback: show raw codes if present
    if (line.vat_code) bits.push(String(line.vat_code));
    if (line.excise_code) bits.push(String(line.excise_code));
    if (Array.isArray(line.tax_names)) bits.push(...line.tax_names);
    if (Array.isArray(line.tax_labels)) bits.push(...line.tax_labels);
    return bits.join(", ");
  }

  function lineTotal(line) {
    const qty = Number(line.quantity ?? line.qty ?? 1);
    const unit = Number(line.unit_price ?? line.price ?? line.unit ?? 0);
    return qty * unit;
  }

  function invSubtotal(inv) {
    // Use total_amount (which includes taxes) if available, otherwise calculate from lines
    const totalAmount = parseFloat(inv.total_amount) || parseFloat(inv.total_with_taxes) || 0;
    
    // Debug logging
    console.log("Invoice total debug:", {
      id: inv.id,
      total_amount: inv.total_amount,
      total_with_taxes: inv.total_with_taxes,
      parsed: totalAmount,
      lines_count: getLines(inv).length
    });
    
    if (totalAmount > 0) {
      return totalAmount;
    }
    
    // Fallback: calculate from lines
    const lineSum = getLines(inv).reduce((sum, ln) => sum + lineTotal(ln), 0);
    console.log("Calculated from lines:", lineSum);
    return lineSum;
  }

  function toggleExpand(inv) {
    const k = rowKey(inv);
    setExpanded(prev => ({ ...prev, [k]: !prev[k] }));
  }

  function isSelected(inv) {
    const k = rowKey(inv);
    return selected.some(s => rowKey(s) === k);
  }

  function handleSelect(inv, checked) {
    setSelected(prev =>
      checked ? [...prev.filter(s => rowKey(s) !== rowKey(inv)), inv]
              : prev.filter(s => rowKey(s) !== rowKey(inv))
    );
  }

  function handleSelectAll(e) {
    if (e.target.checked) {
      setSelected([...pending]);
    } else {
      setSelected([]);
    }
  }

  function buildMinimalPayload(list) {
    return list.map(inv => ({
      template_id: inv.template_id || inv.id,
      next_issue_date: toYMD(inv.next_issue_date || calculateNextIssueDate(inv.invoice_date, inv.recurrence_interval)),
    }));
  }

  function buildFullPayload(list) {
    return list.map(inv => {
      const lines = getLines(inv).map(ln => ({
        type: ln.type || ln.line_type || "Service",
        product_id: ln.product_id ?? null,
        item: ln.item || ln.item_name || "",
        description: ln.description || "",
        quantity: Number(ln.quantity ?? ln.qty ?? 1),
        unit_price: Number(ln.unit_price ?? ln.price ?? ln.unit ?? 0),
        tax_ids: Array.isArray(ln.tax_ids) ? ln.tax_ids : undefined,
        vat: ln.vat ?? undefined,
        excise: ln.excise ?? undefined,
        taxes: Array.isArray(ln.taxes) ? ln.taxes : undefined,
      }));

      const subtotal = lines.reduce((s, l) => s + (l.quantity * l.unit_price), 0);

      return {
        supplier_id: inv.supplier_id ?? undefined,
        supplier_name: inv.supplier_name ?? undefined,
        invoice_date: toYMD(inv.next_issue_date || calculateNextIssueDate(inv.invoice_date, inv.recurrence_interval)),
        reference: inv.reference ?? undefined,
        description: inv.description ?? "",
        amount: subtotal,
        vat: inv.vat ?? undefined,
        excise: inv.excise ?? undefined,
        lines
      };
    });
  }

  async function handleCreateSelected() {
    setErr("");
    try {
      const payload = SEND_FULL_PAYLOAD
        ? buildFullPayload(selected)
        : buildMinimalPayload(selected);

      const res = await fetch(`${API_BASE}/purchases/batch_create_recurring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(`POST /purchases/batch_create_recurring ${res.status}: ${text}`);

      let data = {};
      try { data = JSON.parse(text); } catch {}
      alert(`Created ${data?.created ?? selected.length} purchase invoices`);
      window.location.reload();
    } catch (e) {
      console.error(e);
      setErr(`Failed to create. ${e.message}`);
    }
  }

  function handleDeleteSelected() {
    if (!selected.length) return;
    if (!window.confirm("Turn off recurring for selected invoice templates? This will not delete the original invoices.")) return;
    
    fetch(`${API_BASE}/purchases/batch_delete_recurring_templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selected.map(x => x.id)),
    })
      .then(res => res.json())
      .then(data => {
        alert(`Turned off recurring for ${data.deleted} templates`);
        window.location.reload();
      })
      .catch(err => {
        console.error(err);
        alert("Failed to update templates");
      });
  }

  return (
    <div className="p-4">
      <div className="mb-3">
        <button
          className="px-3 py-1.5 rounded border bg-gray-100 hover:bg-gray-200 text-sm"
          onClick={() => navigate("/purchases")}
        >
          ← Back to Purchase List
        </button>
      </div>
      <h2 className="text-lg font-semibold mb-2">Pending Recurring Purchase Invoices</h2>

      {err && <div className="mb-3 rounded bg-red-100 text-red-800 p-3 text-sm">{err}</div>}
      {loading && <div className="mb-3 text-sm text-gray-600">Loading…</div>}

      <table className="min-w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-1 border text-center">
              <input
                type="checkbox"
                checked={selected.length === pending.length && pending.length > 0}
                onChange={handleSelectAll}
              />
              Select
            </th>
            <th className="p-1 border">Details</th>
            <th className="p-1 border">Next issue date</th>
            <th className="p-1 border">Supplier</th>
            <th className="p-1 border">Header Description</th>
            <th className="p-1 border text-right">Total (inc. taxes)</th>
          </tr>
        </thead>
        <tbody>
          {pending.map(inv => {
            const k = rowKey(inv);
            const lines = getLines(inv);
            const show = !!expanded[k];
            return (
              <React.Fragment key={k}>
                <tr>
                  <td className="p-1 border text-center">
                    <input
                      type="checkbox"
                      checked={isSelected(inv)}
                      onChange={e => handleSelect(inv, e.target.checked)}
                    />
                  </td>
                  <td className="p-1 border">
                    <button
                      className="px-2 py-1 text-xs border rounded"
                      onClick={() => toggleExpand(inv)}
                    >
                      {show ? "Hide lines" : "View lines"}
                    </button>
                  </td>
                  <td className="p-1 border">{toYMD(inv.next_issue_date || calculateNextIssueDate(inv.invoice_date, inv.recurrence_interval))}</td>
                  <td className="p-1 border">{inv.supplier_name}</td>
                  <td className="p-1 border">{inv.description}</td>
                  <td className="p-1 border text-right">
                    {fmt(invSubtotal(inv))}
                  </td>
                </tr>

                {show && (
                  <tr>
                    <td colSpan={6} className="p-0 border-t-0">
                      <div className="p-2 bg-gray-50">
                        <table className="w-full border text-xs">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="p-1 border">Type</th>
                              <th className="p-1 border">Product/Service</th>
                              <th className="p-1 border">Description</th>
                              <th className="p-1 border text-right">Qty</th>
                              <th className="p-1 border text-right">Unit Price</th>
                              <th className="p-1 border">Taxes</th>
                              <th className="p-1 border text-right">Line Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lines.length === 0 && (
                              <tr>
                                <td className="p-1 border text-xs text-gray-500" colSpan={7}>
                                  No line items on this template (or API didn’t include them).
                                </td>
                              </tr>
                            )}
                            {lines.map((ln, i) => (
                              <tr key={i}>
                                <td className="p-1 border">{ln.type || ln.line_type || ""}</td>
                                <td className="p-1 border">
                                  {ln.product_name || ln.item_name || ln.item || ln.product_code || ""}
                                </td>
                                <td className="p-1 border">{ln.description || ""}</td>
                                <td className="p-1 border text-right">{fmt(ln.quantity ?? ln.qty ?? 1)}</td>
                                <td className="p-1 border text-right">{fmt(ln.unit_price ?? ln.price ?? ln.unit ?? 0)}</td>
                                <td className="p-1 border">{lineTaxesAsText(ln)}</td>
                                <td className="p-1 border text-right">{fmt(lineTotal(ln))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}

          {pending.length === 0 && !loading && (
            <tr>
              <td className="p-1 border text-center text-xs text-gray-600" colSpan={6}>
                No pending items.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex gap-2 mb-2">
        <button
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-50"
          disabled={selected.length === 0}
          onClick={handleCreateSelected}
        >
          Create Selected ({selected.length})
        </button>

        <button
          className="px-3 py-1 rounded border bg-red-100 text-red-800 hover:bg-red-200 text-sm"
          onClick={handleDeleteSelected}
          disabled={!selected.length}
        >
          Turn Off Recurring ({selected.length})
        </button>
      </div>

      <div className="mt-2 text-xs text-gray-600">
        Mode: {SEND_FULL_PAYLOAD ? "Full payload (header + lines)" : "Template payload (template_id + date)"}
      </div>
    </div>
  );
}
