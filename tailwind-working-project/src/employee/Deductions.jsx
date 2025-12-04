
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const defaultTypes = ["NSSF", "NHIF", "PAYE", "Other"];
const emptyDeduction = { type: "", amount: "", recurring: false };

const Deductions = ({ formData, setFormData }) => {
  const deductions = formData.deductions || [];
  const [editingIdx, setEditingIdx] = useState(null);
  const [form, setForm] = useState(emptyDeduction);
  const [showForm, setShowForm] = useState(false);
  const [types, setTypes] = useState(defaultTypes);
  const [newType, setNewType] = useState("");
  const [dirty, setDirty] = useState(false);

  // payroll settings
  const [shif, setShif] = useState(null);
  const [nssfPeriods, setNssfPeriods] = useState([]);
  const [payeTables, setPayeTables] = useState([]);
  const [nhifBands, setNhifBands] = useState([]);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const [{ data: shifData }, { data: nssfData }, { data: payeData }, { data: nhifData }] = await Promise.all([
        api.get("/payroll-settings/shif/"),
        api.get("/payroll-settings/nssf/"),
        api.get("/payroll-settings/paye"),
        api.get("/payroll-settings/nhif/"),
      ]);
      setShif(shifData?.[0] ?? null);
      setNssfPeriods(nssfData || []);
      setPayeTables(payeData || []);
      setNhifBands(nhifData || []);
    } catch (e) {
      // swallow — it's non-fatal; component will fallback to defaults
      console.warn("Failed to load payroll settings", e);
    }
  };

  // Compute gross pay from formData (basic + allowances + commission/bonus)
  const gross = useMemo(() => {
    const s = Number(formData.basic_salary || 0);
    const ha = Number(formData.house_allowance || 0);
    const ta = Number(formData.transport_allowance || 0);
    const oa = Number(formData.other_allowances || 0);
    const c = Number(formData.commission || 0);
    const b = Number(formData.bonus || 0);
    return s + ha + ta + oa + c + b;
  }, [formData]);

  // compute statutory amounts
  const statutoryRows = useMemo(() => {
    const rows = [];

    // AHL (Housing Levy) - default 1.5% (server uses 0.015)
    const ahlRate = 0.015;
    const ahl = Math.round(gross * ahlRate * 100) / 100;
    rows.push({ type: "AHL", amount: ahl, recurring: true });

    // SHIF - use setting rate/cap if available, otherwise fallback to 0.0275 with min cap 300 or fixed 1700 pre-2024
    if (shif) {
      const rate = Number(shif.rate || 0.0275);
      const cap = Number(shif.cap || 0);
      let shifAmount = Math.round(gross * rate * 100) / 100;
      if (cap && shifAmount > cap) shifAmount = cap;
      rows.push({ type: "SHIF", amount: shifAmount, recurring: true });
    } else {
      const shifAmount = Math.round(gross * 0.0275 * 100) / 100;
      rows.push({ type: "SHIF", amount: shifAmount, recurring: true });
    }

    // NSSF - use latest NSSF period or fallback to fixed 200
    if (nssfPeriods && nssfPeriods.length > 0) {
      // pick most recent period
      const p = nssfPeriods[0];
      // simple calculation: use max_employee_total if present else fallback to tier caps
      const employeeTotal = Number(p.max_employee_total || 200);
      rows.push({ type: "NSSF", amount: employeeTotal, recurring: true });
    } else {
      rows.push({ type: "NSSF", amount: 200, recurring: true });
    }

    // PAYE - best effort: apply first PAYE table's bands & personal relief if available
    if (payeTables && payeTables.length > 0) {
      const table = payeTables[payeTables.length - 1] || payeTables[0];
      const bands = table.bands || [];
      let taxable = gross - ahl - (rows.find(r => r.type === "SHIF")?.amount || 0) - (rows.find(r => r.type === "NSSF")?.amount || 0);
      // compute paye using bands
      let paye = 0;
      for (const b of bands) {
        const lower = Number(b.lower || 0);
        const upper = b.upper == null ? Infinity : Number(b.upper);
        if (taxable <= lower) continue;
        const slice = Math.min(taxable, upper) - lower;
        if (slice > 0) paye += slice * Number(b.rate || 0);
        if (taxable <= upper) break;
      }
      const relief = Number(table.personal_relief || 0);
      paye = Math.max(paye - relief, 0);
      paye = Math.round(paye * 100) / 100;
      rows.push({ type: "PAYE", amount: paye, recurring: true });
    } else {
      // fallback: simple rule 10% of taxable up to first tier (best-effort)
      const shifAmt = rows.find(r => r.type === "SHIF")?.amount || 0;
      const nssfAmt = rows.find(r => r.type === "NSSF")?.amount || 0;
      const taxable = Math.max(gross - ahl - shifAmt - nssfAmt, 0);
      const paye = Math.round(taxable * 0.1 * 100) / 100;
      rows.push({ type: "PAYE", amount: paye, recurring: true });
    }

    // NHIF - best effort: find band matching gross
    if (nhifBands && nhifBands.length > 0) {
      // find latest band set (first row) and match
      const band = nhifBands.find(b => {
        const lower = Number(b.lower_limit || 0);
        const upper = b.upper_limit == null ? Infinity : Number(b.upper_limit);
        return gross >= lower && gross <= upper;
      });
      if (band) rows.push({ type: "NHIF", amount: Number(band.deduction || 0), recurring: true });
    }

    return rows;
  }, [gross, shif, nssfPeriods, payeTables, nhifBands]);

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
    setDirty(true);
  };

  const handleEdit = (idx) => {
    setEditingIdx(idx);
    setForm(deductions[idx]);
    setShowForm(true);
    setDirty(false);
  };

  const handleDelete = (idx) => {
    const updated = deductions.filter((_, i) => i !== idx);
    setFormData((prev) => ({ ...prev, deductions: updated }));
    setEditingIdx(null);
    setShowForm(false);
    setDirty(true);
  };

  const handleAdd = () => {
    setForm(emptyDeduction);
    setEditingIdx(null);
    setShowForm(true);
    setDirty(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    let updated;
    if (editingIdx !== null) {
      updated = deductions.map((b, i) => (i === editingIdx ? form : b));
    } else {
      updated = [...deductions, form];
    }
    setFormData((prev) => ({ ...prev, deductions: updated }));
    setShowForm(false);
    setEditingIdx(null);
    setDirty(false);
  };

  const handleAddType = (e) => {
    e.preventDefault();
    if (newType && !types.includes(newType)) {
      setTypes([...types, newType]);
      setNewType("");
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h3 className="font-bold mb-2">Employee Deductions</h3>
      <table className="min-w-full border text-sm mb-2">
        <thead>
          <tr>
            <th className="border px-2 py-1">Type</th>
            <th className="border px-2 py-1">Amount</th>
            <th className="border px-2 py-1">Recurring</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {/* Statutory deductions (read-only computed) */}
          {statutoryRows.map((d) => (
            <tr key={d.type} className="bg-gray-50">
              <td className="border px-2 py-1 font-semibold">{d.type}</td>
              <td className="border px-2 py-1">{d.amount?.toLocaleString?.() ?? d.amount}</td>
              <td className="border px-2 py-1">{d.recurring ? "Yes" : "No"}</td>
              <td className="border px-2 py-1 text-gray-400">—</td>
            </tr>
          ))}
          {/* Custom deductions */}
          {deductions.length === 0 ? (
            <tr>
              <td colSpan={4} className="border px-2 py-2 text-center text-gray-500">No custom deductions</td>
            </tr>
          ) : (
            deductions.map((b, idx) => (
              <tr key={idx} className={editingIdx === idx ? "bg-blue-50" : ""}>
                <td className="border px-2 py-1">{b.type}</td>
                <td className="border px-2 py-1">{b.amount}</td>
                <td className="border px-2 py-1">{b.recurring ? "Yes" : "No"}</td>
                <td className="border px-2 py-1">
                  <button className="text-blue-600 underline mr-2" onClick={() => handleEdit(idx)}>Edit</button>
                  <button className="text-red-600 underline" onClick={() => handleDelete(idx)}>Delete</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showForm && (
        <form className="bg-gray-50 p-4 rounded mb-2 w-full" onSubmit={handleSave}>
          <div className="flex gap-2 mb-2">
            <select
              className="border px-2 py-1 rounded w-1/3"
              name="type"
              value={form.type}
              onChange={handleInput}
              required
            >
              <option value="">Select Deduction Type</option>
              {types.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              className="border px-2 py-1 rounded w-1/3"
              name="amount"
              type="number"
              placeholder="Amount"
              value={form.amount}
              onChange={handleInput}
              required
            />
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                name="recurring"
                checked={form.recurring}
                onChange={handleInput}
              />
              Recurring
            </label>
          </div>
          <div className="flex gap-2 mb-2">
            <input
              className="border px-2 py-1 rounded w-1/3"
              placeholder="Add new deduction type"
              value={newType}
              onChange={e => setNewType(e.target.value)}
            />
            <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={handleAddType} type="button">
              Add Type
            </button>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">
              {editingIdx !== null ? "Save Changes" : "Add Deduction"}
            </button>
            <button type="button" className="bg-gray-400 text-white px-3 py-1 rounded" onClick={() => { setShowForm(false); setEditingIdx(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <button className="mt-2 bg-green-600 text-white px-3 py-1 rounded" onClick={handleAdd}>
        Add Deduction
      </button>

      {dirty && (
        <button className="mt-4 bg-blue-700 text-white px-6 py-2 rounded float-right" onClick={() => { setFormData((prev) => ({ ...prev, deductions })); setDirty(false); }}>
          Save
        </button>
      )}
    </div>
  );
};

export default Deductions;
