import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

import { API_BASE } from "../lib/api";

function fmt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function ymToDateString(ym) {
  // "YYYY-MM" -> "YYYY-MM-01"
  if (!ym) return "";
  return `${ym}-01`;
}
function toYM(dateStr) {
  // "YYYY-MM-DD" -> "YYYY-MM"
  if (!dateStr) return "";
  return String(dateStr).slice(0, 7);
}

/**
 * Props:
 * - staffNo (required) - internal staff number e.g. 'TNL005'
 * - selectedPeriod (optional) - 'YYYY-MM' to prefill month picker
 * - data/onChange (optional) - if you keep other benefits in parent state
 */
export default function Benefits({ staffNo, selectedPeriod, data = {}, onChange, setFormData }) {
  // --- Existing recurring benefit placeholders (kept minimal) ---
  const benefitTypes = [
    { type: "House Allowance", key: "house_allowance" },
    { type: "Transport Allowance", key: "transport_allowance" },
    { type: "Other Allowances", key: "other_allowances" },
  ];
  const tableData = useMemo(
    () =>
      benefitTypes.map((b) => ({
        type: b.type,
        key: b.key,
        amount: Number(data?.[b.key] ?? 0),
      })),
    [data]
  );

  const updateParent = (patch) => {
    const next = { ...(data || {}), ...patch };
    onChange && onChange(next);
    if (setFormData) {
      setFormData((prev) => ({
        ...prev,
        salary: { ...(prev?.salary || {}), ...patch },
      }));
    }
  };

  // --- NEW: One-off Non-Cash Benefit form (saved to DB as pending) ---
  const [ncForm, setNcForm] = useState({
    description: "",
    amount: 0,
    periodYM: selectedPeriod || "", // 'YYYY-MM'
  });
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState([]); // all not-applied rows from API
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const loadPending = async () => {
    setLoading(true);
    setErr("");
    try {
      // Backend route returns all not-applied; we filter by staff in UI
      const r = await axios.get(`${API_BASE}/non-cash-benefits/`);
      setPending(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      setErr("Failed to load pending non-cash benefits.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, []);

  const staffPending = useMemo(() => {
    return pending.filter((p) => p.staff_no === staffNo);
  }, [pending, staffNo]);

  const createNcBenefit = async () => {
    if (!staffNo) {
      alert("Missing staff number.");
      return;
    }
    if (!ncForm.periodYM) {
      alert("Please select the month (Payroll Period).");
      return;
    }
    try {
      setSaving(true);
      await axios.post(`${API_BASE}/non-cash-benefits/`, {
        staff_no: staffNo,
        period: ymToDateString(ncForm.periodYM), // store "YYYY-MM-01"
        description: ncForm.description || null,
        amount: Number(ncForm.amount || 0),
      });
      // Refresh list + clear form amount/desc (keep month)
      await loadPending();
      setNcForm((f) => ({ ...f, description: "", amount: 0 }));
    } catch (e) {
      alert("Failed to save non-cash benefit.");
    } finally {
      setSaving(false);
    }
  };

  const deletePending = async (id) => {
    if (!window.confirm("Delete this pending non-cash benefit?")) return;
    try {
      await axios.delete(`${API_BASE}/non-cash-benefits/${id}`);
      setPending((list) => list.filter((x) => x.id !== id));
    } catch {
      alert("Failed to delete.");
    }
  };

  return (
    <div className="space-y-6">
      {/* ===== Recurring Benefits (kept from your original) ===== */}
      <div className="border rounded">
        <div className="px-3 py-2 font-medium bg-gray-50">Recurring Benefits</div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap">Benefit</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tableData.map((row) => (
              <tr key={row.key}>
                <td className="px-3 py-2">{row.type}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    className="w-40 border rounded px-2 py-1 text-right"
                    value={row.amount}
                    onChange={(e) => updateParent({ [row.key]: Number(e.target.value || 0) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== One-off Non-Cash Benefit (DB-backed) ===== */}
      <div className="border rounded p-3 bg-amber-50">
        <div className="font-medium mb-2">One-off Non-Cash Benefit (affects PAYE only)</div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            Payroll Period (month)
            <input
              type="month"
              className="block border rounded px-2 py-1 mt-1"
              value={ncForm.periodYM}
              onChange={(e) => setNcForm((f) => ({ ...f, periodYM: e.target.value }))}
            />
          </label>

          <label className="text-sm flex-1 min-w-[220px]">
            Description
            <input
              className="block w-full border rounded px-2 py-1 mt-1"
              placeholder="e.g., Company vehicle benefit (July)"
              value={ncForm.description}
              onChange={(e) => setNcForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>

          <label className="text-sm">
            Amount
            <input
              type="number"
              className="block w-40 border rounded px-2 py-1 text-right mt-1"
              value={ncForm.amount}
              onChange={(e) => setNcForm((f) => ({ ...f, amount: Number(e.target.value || 0) }))}
            />
          </label>

          <button
            type="button"
            onClick={createNcBenefit}
            disabled={saving}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            {saving ? "Saving…" : "Save to DB"}
          </button>
        </div>

        <p className="text-xs text-gray-700 mt-2">
          Saved items remain <b>Pending</b> until you process payroll for that staff and month. When processed, the
          amount increases <b>Taxable Pay</b> (PAYE), but does not affect NHIF/SHIF, NSSF, or AHL. It’s also stored on the payslip.
        </p>
      </div>

      {/* ===== Pending (Not Yet Applied) for this Staff ===== */}
      <div className="border rounded">
        <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
          <div className="font-medium">Pending Non-Cash Benefits for {staffNo}</div>
          {loading && <div className="text-xs text-gray-500">Loading…</div>}
        </div>
        {err && <div className="px-3 py-2 text-sm text-red-600">{err}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left whitespace-nowrap">Payroll Period</th>
                <th className="px-3 py-2 text-left whitespace-nowrap">Description</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Amount</th>
                <th className="px-3 py-2 text-center whitespace-nowrap">Status</th>
                <th className="px-3 py-2 text-center whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staffPending.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-center text-gray-500" colSpan={5}>
                    No pending items.
                  </td>
                </tr>
              )}
              {staffPending.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2 whitespace-nowrap">{toYM(row.period)}</td>
                  <td className="px-3 py-2">{row.description || "-"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(row.amount)}</td>
                  <td className="px-3 py-2 text-center">
                    {row.is_applied ? (
                      <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-700">Applied</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-700">Pending</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {!row.is_applied && (
                      <button
                        onClick={() => deletePending(row.id)}
                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                      >
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
