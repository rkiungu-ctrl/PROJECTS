// Leave.jsx  — uses termination cutoff for accrual & usage math
import React, { useEffect, useMemo, useState } from "react";

/**
 * Props:
 * - formData: master employee form state (object)
 * - setFormData: setter from parent modal
 *
 * We read/write:
 *   formData.leaves (array)
 *   formData.leaveMonthlyRate (number)
 *   formData.hr.date_of_employment (Date string)
 *   formData.leaveWorkingPattern ("Mon-Fri" | "Mon-Sat" | "Custom")
 *   formData.leaveCustomWorkingDays (array of weekday numbers 0-6)
 *   formData.leaveCutoffDate (string YYYY-MM-DD)  <-- termination date if set
 */

const WDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Utility: count working days (inclusive) between two yyyy-mm-dd strings
function workingDaysBetween(startStr, endStr, workingDaysSet) {
  if (!startStr || !endStr) return 0;
  const start = new Date(startStr);
  const end = new Date(endStr);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  if (end < start) return 0;

  let count = 0;
  const d = new Date(start);
  while (d <= end) {
    const day = d.getDay(); // 0=Sun..6=Sat
    if (workingDaysSet.has(day)) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

export default function Leave({ formData, setFormData }) {
  const leaves = formData?.leaves ?? [];
  const dateOfEmployment = formData?.hr?.date_of_employment || null;
  const cutoffDate = formData?.leaveCutoffDate || null; // ✅ use termination date if set

  // 1) Accrual rate & “accrued to date”
  const [monthlyRate, setMonthlyRate] = useState(
    Number(formData?.leaveMonthlyRate ?? 1.75)
  );

  // --- FIXED months-of-service calculation ---
  const monthsOfService = useMemo(() => {
    if (!dateOfEmployment) return 0;
    const start = new Date(dateOfEmployment);
    const endRef = cutoffDate ? new Date(cutoffDate) : new Date();
    if (Number.isNaN(start.getTime()) || Number.isNaN(endRef.getTime())) return 0;

    // Inclusive months rule: count an extra month when the end day is on/after
    // the start day. This matches the termination modal behavior and yields
    // 19 months for 2022-01-01 → 2023-07-31.
    let months =
      (endRef.getFullYear() - start.getFullYear()) * 12 +
      (endRef.getMonth() - start.getMonth());
    if (endRef.getDate() >= start.getDate()) months += 1;
    months = Math.max(0, months);
    return months;
  }, [dateOfEmployment, cutoffDate]);

  const accruedToDateDays = useMemo(
    () => Math.max(0, monthsOfService * monthlyRate),
    [monthsOfService, monthlyRate]
  );

  // 2) Working pattern (Mon–Sat default) + optional custom
  const [pattern, setPattern] = useState(formData?.leaveWorkingPattern || "Mon-Sat");
  const [customDays, setCustomDays] = useState(
    Array.isArray(formData?.leaveCustomWorkingDays)
      ? formData.leaveCustomWorkingDays
      : []
  );

  const workingDaysSet = useMemo(() => {
    if (pattern === "Mon-Fri") return new Set([1, 2, 3, 4, 5]);
    if (pattern === "Mon-Sat") return new Set([1, 2, 3, 4, 5, 6]);
    // Custom
    return new Set(
      (customDays || []).filter(
        (n) => typeof n === "number" && n >= 0 && n <= 6
      )
    );
  }, [pattern, customDays]);

  // Persist config fields into formData so they are saved with the employee
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      leaveMonthlyRate: monthlyRate,
      leaveWorkingPattern: pattern,
      leaveCustomWorkingDays: [...workingDaysSet],
    }));
  }, [monthlyRate, pattern, workingDaysSet, setFormData]);

  // Helper: cap an end date at cutoff if provided
  const capAtCutoff = (endStr) => {
    if (!cutoffDate) return endStr;
    if (!endStr) return cutoffDate;
    const end = new Date(endStr);
    const cut = new Date(cutoffDate);
    return end > cut ? cutoffDate : endStr;
  };

  // Helper: sum annual-leave days up to cutoff (inclusive)
  const totalAnnualLeaveUsedToCutoff = (rows) => {
    return (rows || []).reduce((sum, r) => {
      if (!r || r.type !== "Annual Leave") return sum;
      const cappedEnd = capAtCutoff(r.end_date);
      return (
        sum +
        workingDaysBetween(r.start_date, cappedEnd, workingDaysSet)
      );
    }, 0);
  };

  // 3) Form for creating/editing a leave record
  const initialForm = {
    type: "", // "Annual Leave", "Sick Leave", etc.
    paid: "Paid", // "Paid" | "Non Paid"
    accrued: "Accrued", // "Accrued" | "Not Accrued"
    start_date: "",
    end_date: "",
    days: 0, // computed working days for the block
    accrued_annually: "", // read-only (for annual leave)
    allowed: "", // read-only (for annual leave; “accrued to date”)
    used: "", // read-only (sum of annual-leave days to cutoff)
    remaining: "", // read-only (allowed - used)
    notes: "",
  };

  const [showForm, setShowForm] = useState(false);
  const [editingIdx, setEditingIdx] = useState(null);
  const [form, setForm] = useState(initialForm);

  // Recompute “days” when dates change (capped at cutoff)
  useEffect(() => {
    const days = workingDaysBetween(
      form.start_date,
      capAtCutoff(form.end_date),
      workingDaysSet
    );
    setForm((prev) => ({ ...prev, days }));
  }, [form.start_date, form.end_date, workingDaysSet, cutoffDate]);

  // When editing, load the row into form (recompute with current pattern & cutoff)
  const onEditRow = (idx) => {
    const row = leaves[idx];
    setEditingIdx(idx);
    const cappedEnd = capAtCutoff(row?.end_date);
    setForm({
      ...initialForm,
      ...(row || {}),
      days: workingDaysBetween(row?.start_date, cappedEnd, workingDaysSet),
    });
    setShowForm(true);
  };

  // Recompute allowances/used/remaining for all loaded rows whenever accrual
  // rate, working pattern or cutoff changes — normalize historical rows so
  // stored stale allowed/used/remaining values are cleared and recomputed.
  useEffect(() => {
    const original = formData?.leaves || [];
    if (!original.length) return;

    const recomputed = original.map((r) => {
      const cappedEnd = capAtCutoff(r?.end_date);
      const days = workingDaysBetween(r?.start_date, cappedEnd, workingDaysSet);
      if (r?.type === "Annual Leave") {
        const allowed = accruedToDateDays;
        const used = totalAnnualLeaveUsedToCutoff(original);
        const remaining = Number((allowed - used).toFixed(2));
        return {
          ...r,
          days,
          accrued_annually: (monthlyRate * 12).toFixed(2),
          allowed: allowed.toFixed(2),
          used: used.toFixed(2),
          remaining,
        };
      }
      // Non-annual: clear any leftover annual fields so UI recalcs when needed
      return {
        ...r,
        days,
        accrued_annually: "",
        allowed: "",
        used: "",
        remaining: "",
      };
    });

    try {
      const a = JSON.stringify(recomputed || []);
      const b = JSON.stringify(original || []);
      if (a !== b) {
        setFormData((prev) => ({ ...prev, leaves: recomputed }));
      }
    } catch (e) {
      // ignore stringify failures
    }
  }, [formData?.leaves, monthlyRate, workingDaysSet, cutoffDate, dateOfEmployment]);

  const onDeleteRow = (idx) => {
    const updated = leaves.filter((_, i) => i !== idx);
    setFormData((prev) => ({ ...prev, leaves: updated }));
  };

  const onAddNew = () => {
    setEditingIdx(null);
    setForm(initialForm);
    setShowForm(true);
  };

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = (e) => {
    e.preventDefault();

    // Prepare updated leaves first (so we can compute totals including the change)
    let nextRow = { ...form };
    // If Annual Leave → auto-fill accrued/allowed/used/remaining with cutoff logic
    let updated;
    if (editingIdx !== null) {
      updated = leaves.map((r, i) => (i === editingIdx ? nextRow : r));
    } else {
      updated = [...leaves, nextRow];
    }

    // Recompute 'days' for the current row with cutoff cap
    const cappedEndForRow = capAtCutoff(nextRow.end_date);
    const currentRowDays = workingDaysBetween(
      nextRow.start_date,
      cappedEndForRow,
      workingDaysSet
    );

    if (nextRow.type === "Annual Leave") {
      const allowed = accruedToDateDays; // up to cutoff/today
      const used = totalAnnualLeaveUsedToCutoff(
        // use the updated array (includes new/edited row)
        updated
      );
      const remaining = Number((allowed - used).toFixed(2));
      nextRow = {
        ...nextRow,
        accrued: "Accrued",
        days: currentRowDays,
        accrued_annually: (monthlyRate * 12).toFixed(2),
        allowed: allowed.toFixed(2),
        used: used.toFixed(2),
        // store remaining as a number (recomputed precisely)
        remaining,
      };
      // also reflect the computed version in the updated list
      if (editingIdx !== null) {
        updated = updated.map((r, i) => (i === editingIdx ? nextRow : r));
      } else {
        updated[updated.length - 1] = nextRow;
      }
    } else {
      // non-annual leave: still store the recomputed 'days'
      nextRow.days = currentRowDays;
      if (editingIdx !== null) {
        updated = updated.map((r, i) => (i === editingIdx ? nextRow : r));
      } else {
        updated[updated.length - 1] = nextRow;
      }
    }

    setFormData((prev) => ({ ...prev, leaves: updated }));
    setShowForm(false);
    setEditingIdx(null);
    setForm(initialForm);
  };

  // Table columns
  const columns = [
    { key: "type", label: "Leave Type" },
    { key: "paid", label: "Paid/Non Paid" },
    { key: "start_date", label: "Start" },
    { key: "end_date", label: "End" },
    { key: "days", label: "Working Days" },
    { key: "accrued_annually", label: "Accrued Annually" },
    { key: "allowed", label: "Annual Hrs Allowed" },
    { key: "used", label: "Annual Hrs Used" },
    { key: "remaining", label: "Hours Remaining" },
  ];

  return (
    <div className="space-y-3">
      {/* Header: accrual + pattern */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <label className="mr-2">Monthly Accrual (days):</label>
            <input
              type="number"
              step="0.01"
              className="border px-2 py-1 rounded w-24"
              value={monthlyRate}
              onChange={(e) => setMonthlyRate(Number(e.target.value || 0))}
            />
          </div>

          <div className="text-sm">
            <label className="mr-2">Working Pattern:</label>
            <select
              className="border px-2 py-1 rounded"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
            >
              <option value="Mon-Fri">Mon–Fri</option>
              <option value="Mon-Sat">Mon–Sat</option>
              <option value="Custom">Custom</option>
            </select>
          </div>

          {pattern === "Custom" && (
            <div className="text-sm flex items-center gap-2">
              {WDAY_LABELS.map((lbl, idx) => {
                const checked = workingDaysSet.has(idx);
                return (
                  <label key={lbl} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const set = new Set(workingDaysSet);
                        if (e.target.checked) set.add(idx);
                        else set.delete(idx);
                        setCustomDays([...set]);
                      }}
                    />
                    {lbl}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-purple-700 font-semibold">
          Accrued to date: {accruedToDateDays.toFixed(2)} days
          {cutoffDate ? (
            <span className="text-xs text-gray-500 ml-2">
              (to {cutoffDate})
            </span>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-purple-100 text-purple-900">
              {columns.map((c) => (
                <th key={c.key} className="border px-2 py-1 text-left">
                  {c.label}
                </th>
              ))}
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(!leaves || leaves.length === 0) && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="text-center text-gray-500 py-3"
                >
                  No leave records
                </td>
              </tr>
            )}
            {leaves.map((row, idx) => (
              <tr key={idx} className="odd:bg-white even:bg-gray-50">
                {columns.map((c) => (
                  <td key={c.key} className="border px-2 py-1">
                    {row[c.key] ?? ""}
                  </td>
                ))}
                <td className="border px-2 py-1">
                  <button
                    className="text-blue-600 mr-2"
                    onClick={() => onEditRow(idx)}
                  >
                    Edit
                  </button>
                  <button
                    className="text-red-600"
                    onClick={() => onDeleteRow(idx)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!showForm && (
        <button
          className="bg-green-600 text-white px-3 py-2 rounded"
          onClick={onAddNew}
        >
          Add Leave
        </button>
      )}

      {/* Form */}
      {showForm && (
        <form
          className="bg-purple-50 border rounded p-3 space-y-2"
          onSubmit={handleSave}
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs mb-1">Leave Type</label>
              <select
                className="w-full border px-2 py-1 rounded"
                value={form.type}
                onChange={(e) => handleChange("type", e.target.value)}
                required
              >
                <option value="">Select Leave Type</option>
                <option value="Annual Leave">Annual Leave</option>
                <option value="Sick Leave">Sick Leave</option>
                <option value="Maternity Leave">Maternity Leave</option>
                <option value="Paternity Leave">Paternity Leave</option>
                <option value="Compassionate Leave">Compassionate Leave</option>
                <option value="Unpaid Leave">Unpaid Leave</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Paid/Non Paid</label>
              <select
                className="w-full border px-2 py-1 rounded"
                value={form.paid}
                onChange={(e) => handleChange("paid", e.target.value)}
              >
                <option>Paid</option>
                <option>Non Paid</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Accrued?</label>
              <select
                className="w-full border px-2 py-1 rounded"
                value={form.accrued}
                onChange={(e) => handleChange("accrued", e.target.value)}
              >
                <option>Accrued</option>
                <option>Not Accrued</option>
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Start Date</label>
              <input
                type="date"
                className="w-full border px-2 py-1 rounded"
                value={form.start_date}
                onChange={(e) => handleChange("start_date", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs mb-1">End Date</label>
              <input
                type="date"
                className="w-full border px-2 py-1 rounded"
                value={form.end_date}
                onChange={(e) => handleChange("end_date", e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Working Days</label>
              <input
                className="w-full border px-2 py-1 rounded bg-gray-100"
                value={form.days || 0}
                readOnly
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Accrued Annually</label>
              <input
                className="w-full border px-2 py-1 rounded bg-gray-100"
                placeholder="Auto for Annual Leave"
                value={form.accrued_annually}
                readOnly
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Annual Hrs Allowed</label>
              <input
                className="w-full border px-2 py-1 rounded bg-gray-100"
                placeholder="Auto for Annual Leave"
                value={form.allowed}
                readOnly
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Annual Hrs Used</label>
              <input
                className="w-full border px-2 py-1 rounded bg-gray-100"
                placeholder="Auto for Annual Leave"
                value={form.used}
                readOnly
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Hours Remaining</label>
              <input
                className="w-full border px-2 py-1 rounded bg-gray-100"
                placeholder="Auto for Annual Leave"
                value={form.remaining}
                readOnly
              />
            </div>

            <div className="md:col-span-4">
              <label className="block text-xs mb-1">Notes</label>
              <textarea
                className="w-full border px-2 py-1 rounded"
                rows={2}
                value={form.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                placeholder="Reason, handover notes, etc."
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              className="bg-blue-600 text-white px-3 py-2 rounded"
            >
              {editingIdx !== null ? "Update Leave" : "Add Leave"}
            </button>
            <button
              type="button"
              className="bg-gray-400 text-white px-3 py-2 rounded"
              onClick={() => {
                setShowForm(false);
                setEditingIdx(null);
                setForm(initialForm);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
