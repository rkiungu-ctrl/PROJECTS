// src/pages/PayrollSettingsPage.jsx
import React, { useEffect, useState, useRef } from "react";
import axios from "axios";

import { API_BASE as API_ROOT } from "../lib/api";
const SETTINGS_BASE = `${API_ROOT}/payroll-settings`;     // generic settings root
const NSSF_ENDPOINT = `${SETTINGS_BASE}/nssf/`;            // NSSF periods  (change to /nssf/ if your backend uses trailing slash)
const NHIF_ENDPOINT = `${SETTINGS_BASE}/nhif/`;
const SHIF_ENDPOINT = `${SETTINGS_BASE}/shif/`;
const PAYE_ENDPOINT = `${SETTINGS_BASE}/paye/`;
const AHL_ENDPOINT = `${SETTINGS_BASE}/ahl/`;

const emptySetting = {
  name: "",
  value: "",
  start_date: "",
  end_date: "",
};

const fmtDate = (d) => (d ? String(d).slice(0, 10) : "");
const fmtInt = (n) =>
  Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

// ---------- NSSF (periodized) ----------
const INIT_NSSF = {
  id: null,
  start_date: "",
  end_date: "",
  lel: "",
  uel: "",
  rate_employee: 0.06,
  rate_employer: 0.06,

  // optional overrides (leave blank to auto-compute)
  tier1_cap: "",
  tier2_cap: "",
  max_employee_total: "",
};

const INIT_NHIF = {
  id: null,
  start_date: "",
  end_date: "",
  lower_limit: "",
  upper_limit: "",
  deduction: "",
};

const INIT_PAYE = {
  id: null,
  start_date: "",
  end_date: "",
  personal_relief: "",
  insurance_relief_rate: "",
  insurance_relief_cap: "",
  bands: [],
};

const INIT_BAND = { lower: "", upper: "", rate: "" };

export default function PayrollSettingsPage() {
  // ---- Generic settings state ----
  const [settings, setSettings] = useState([]);
  const [form, setForm] = useState(emptySetting);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [genericErr, setGenericErr] = useState("");

  // ---- NSSF settings state ----
  const [nssfRows, setNssfRows] = useState([]);
  const [nssfForm, setNssfForm] = useState(INIT_NSSF);
  const [nssfLoading, setNssfLoading] = useState(false);
  const [nssfErr, setNssfErr] = useState("");
  const [showOverrides, setShowOverrides] = useState(false);

  // ---- NHIF settings state ----
  const [nhifRows, setNhifRows] = useState([]);
  const [nhifForm, setNhifForm] = useState(INIT_NHIF);
  const [nhifLoading, setNhifLoading] = useState(false);
  const [nhifErr, setNhifErr] = useState("");
  const [nhifEditing, setNhifEditing] = useState(false);

  // ---- SHIF settings state ----
  const [shifRows, setShifRows] = useState([]);
  const [shifForm, setShifForm] = useState({
    rate: 0.0275,
    cap: 5000,
    start_date: "",
    end_date: ""
  });
  const [shifErr, setShifErr] = useState("");

  // ---- PAYE settings state ----
  const [payeRows, setPayeRows] = useState([]);
  const [payeForm, setPayeForm] = useState(INIT_PAYE);
  const [bandForm, setBandForm] = useState(INIT_BAND);
  const [payeErr, setPayeErr] = useState("");
  const [editingPayeId, setEditingPayeId] = useState(null);
  const formTopRef = useRef(null);

  // Example: Paste JSON array of bands
  const [bulkBands, setBulkBands] = useState("");

  // File upload state
  const [nhifFile, setNhifFile] = useState(null);
  const [payeFile, setPayeFile] = useState(null);

  // Error states
  const [payeImportErr, setPayeImportErr] = useState("");

  useEffect(() => {
    fetchSettings();
    fetchNssf();
    fetchNhif();
    fetchShif();
    fetchAhl();
    fetchPaye();
  }, []);

  // ---- AHL settings state ----
  const [ahlRows, setAhlRows] = useState([]);
  const [ahlForm, setAhlForm] = useState({ id: null, start_date: "", end_date: "", employee_rate: 0.015, employer_rate: 0.015, relief_rate: "", relief_cap_month: "" });
  const [ahlErr, setAhlErr] = useState("");

  const fetchAhl = async () => {
    setAhlErr("");
    try {
      const { data } = await axios.get(AHL_ENDPOINT);
      setAhlRows(data || []);
    } catch (e) {
      setAhlErr("Failed to load AHL tables.");
    }
  };

  const submitAhl = async (e) => {
    e && e.preventDefault && e.preventDefault();
    setAhlErr("");
    try {
      const payload = {
        start_date: ahlForm.start_date,
        end_date: ahlForm.end_date || null,
        employee_rate: Number(ahlForm.employee_rate),
        employer_rate: Number(ahlForm.employer_rate),
        relief_rate: ahlForm.relief_rate === "" ? null : Number(ahlForm.relief_rate),
        relief_cap_month: ahlForm.relief_cap_month === "" ? null : Number(ahlForm.relief_cap_month),
      };
      if (ahlForm.id) {
        await axios.put(`${AHL_ENDPOINT}${ahlForm.id}`, payload);
      } else {
        await axios.post(AHL_ENDPOINT, payload);
      }
      setAhlForm({ id: null, start_date: "", end_date: "", employee_rate: 0.015, employer_rate: 0.015, relief_rate: "", relief_cap_month: "" });
      fetchAhl();
    } catch (e2) {
      setAhlErr(e2?.response?.data?.detail || "Save failed");
    }
  };

  const editAhl = (r) => {
    setAhlForm({
      id: r.id,
      start_date: fmtDate(r.start_date),
      end_date: fmtDate(r.end_date || ""),
      employee_rate: r.employee_rate,
      employer_rate: r.employer_rate,
      relief_rate: r.relief_rate ?? "",
      relief_cap_month: r.relief_cap_month ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteAhl = async (id) => {
    if (!window.confirm("Delete this AHL table?")) return;
    try {
      await axios.delete(`${AHL_ENDPOINT}${id}`);
      fetchAhl();
    } catch {
      setAhlErr("Delete failed");
    }
  };

  // =========================
  // Generic settings handlers
  // =========================
  const fetchSettings = async () => {
    setLoading(true);
    setGenericErr("");
    try {
      const res = await axios.get(SETTINGS_BASE + "/");
      setSettings(res.data || []);
    } catch (e) {
      setGenericErr("Failed to load payroll settings.");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGenericErr("");
    try {
      if (editingId) {
        await axios.put(`${SETTINGS_BASE}/${editingId}`, form);
      } else {
        await axios.post(SETTINGS_BASE + "/", form);
      }
      setForm(emptySetting);
      setEditingId(null);
      fetchSettings();
    } catch (e) {
      const msg = e?.response?.data?.detail || "Save failed";
      setGenericErr(msg);
    }
  };

  const handleEdit = (setting) => {
    setForm({
      name: setting.name,
      value: setting.value,
      start_date: setting.start_date ? setting.start_date.slice(0, 10) : "",
      end_date: setting.end_date ? setting.end_date.slice(0, 10) : "",
    });
    setEditingId(setting.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this setting?")) return;
    try {
      await axios.delete(`${SETTINGS_BASE}/${id}`);
      fetchSettings();
    } catch {
      setGenericErr("Delete failed");
    }
  };

  const handleCancel = () => {
    setForm(emptySetting);
    setEditingId(null);
  };

  // ======================
  // NSSF handlers (period)
  // ======================
  const fetchNssf = async () => {
    setNssfLoading(true);
    setNssfErr("");
    try {
      const { data } = await axios.get(NSSF_ENDPOINT);
      setNssfRows(data || []);
    } catch (e) {
      setNssfErr("Failed to load NSSF periods.");
    } finally {
      setNssfLoading(false);
    }
  };

  const submitNssf = async (e) => {
    e.preventDefault();
    setNssfErr("");

    const payload = {
      start_date: nssfForm.start_date,
      end_date: nssfForm.end_date || null,
      lel: Number(nssfForm.lel),
      uel: Number(nssfForm.uel),
      rate_employee: Number(nssfForm.rate_employee || 0.06),
      rate_employer: Number(nssfForm.rate_employer || 0.06),
    };

    // Add overrides only if provided
    const t1 = nssfForm.tier1_cap !== "" ? Number(nssfForm.tier1_cap) : null;
    const t2 = nssfForm.tier2_cap !== "" ? Number(nssfForm.tier2_cap) : null;
    const mt = nssfForm.max_employee_total !== "" ? Number(nssfForm.max_employee_total) : null;

    if (t1 !== null) payload.tier1_cap = t1;
    if (t2 !== null) payload.tier2_cap = t2;
    if (mt !== null) payload.max_employee_total = mt;

    try {
      if (nssfForm.id) {
        await axios.put(`${NSSF_ENDPOINT}/${nssfForm.id}`, payload);
      } else {
        await axios.post(NSSF_ENDPOINT, payload);
      }
      setNssfForm(INIT_NSSF);
      setShowOverrides(false);
      fetchNssf();
    } catch (e2) {
      const msg = e2?.response?.data?.detail || "Save failed";
      setNssfErr(msg);
    }
  };

  const editNssf = (r) => {
    setNssfForm({
      id: r.id,
      start_date: fmtDate(r.start_date),
      end_date: fmtDate(r.end_date || ""),
      lel: r.lel,
      uel: r.uel,
      rate_employee: r.rate_employee,
      rate_employer: r.rate_employer,
      // existing rows already have computed caps; leave overrides blank by default
      tier1_cap: "",
      tier2_cap: "",
      max_employee_total: "",
    });
    setShowOverrides(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteNssf = async (id) => {
    if (!window.confirm("Delete this NSSF period?")) return;
    try {
      await axios.delete(`${NSSF_ENDPOINT}/${id}`);
      fetchNssf();
    } catch {
      setNssfErr("Delete failed");
    }
  };

  const periodLabel = (r) => {
    const s = fmtDate(r.start_date);
    const e = r.end_date ? fmtDate(r.end_date) : "Present";
    return `${s} – ${e}`;
  };

  const nssfEditing = Boolean(nssfForm.id);

  // ======================
  // NHIF handlers
  // ======================
  const fetchNhif = async () => {
    setNhifLoading(true);
    setNhifErr("");
    try {
      const { data } = await axios.get(NHIF_ENDPOINT);
      setNhifRows(data || []);
    } catch (e) {
      setNhifErr("Failed to load NHIF bands.");
    } finally {
      setNhifLoading(false);
    }
  };

  const submitNhif = async (e) => {
    e.preventDefault();
    setNhifErr("");
    const payload = {
      start_date: nhifForm.start_date,
      end_date: nhifForm.end_date || null,
      lower_limit: Number(nhifForm.lower_limit),
      upper_limit: Number(nhifForm.upper_limit),
      deduction: Number(nhifForm.deduction),
    };
    try {
      if (nhifForm.id) {
        await axios.put(`${NHIF_ENDPOINT}${nhifForm.id}`, payload);
      } else {
        await axios.post(NHIF_ENDPOINT, payload);
      }
      setNhifForm(INIT_NHIF);
      fetchNhif();
    } catch (e2) {
      setNhifErr(e2?.response?.data?.detail || "Save failed");
    }
  };

  const editNhif = (r) => {
    setNhifForm({
      id: r.id,
      start_date: fmtDate(r.start_date),
      end_date: fmtDate(r.end_date || ""),
      lower_limit: r.lower_limit,
      upper_limit: r.upper_limit,
      deduction: r.deduction,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteNhif = async (id) => {
    if (!window.confirm("Delete this NHIF band?")) return;
    try {
      await axios.delete(`${NHIF_ENDPOINT}${id}`);
      fetchNhif();
    } catch {
      setNhifErr("Delete failed");
    }
  };

  const nhifLabel = (r) => {
    const s = fmtDate(r.start_date);
    const e = r.end_date ? fmtDate(r.end_date) : "Present";
    return `${s} – ${e}`;
  };

  // Batch update NHIF bands
  const batchUpdateNhif = async (updates) => {
    setNhifErr("");
    try {
      await axios.put(NHIF_ENDPOINT + "batch", updates);
      fetchNhif();
    } catch (e) {
      setNhifErr("Batch update failed");
    }
  };

  // Example usage: batch update all deductions to 500
  const handleBatchUpdate = () => {
    const updates = nhifRows.map(band => ({
      id: band.id,
      deduction: 500 // or any logic you want
    }));
    batchUpdateNhif(updates);
  };

  // Example: Bulk upload NHIF bands
  const handleBulkUpload = async () => {
    try {
      const bands = JSON.parse(bulkBands);
      await axios.post(NHIF_ENDPOINT + "bulk", bands);
      fetchNhif();
      setBulkBands("");
    } catch (e) {
      setNhifErr("Bulk upload failed");
    }
  };

  const handleNhifFileUpload = async () => {
    if (!nhifFile) return;
    const formData = new FormData();
    formData.append("file", nhifFile);
    try {
      await axios.post(NHIF_ENDPOINT + "import", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      fetchNhif();
      setNhifFile(null);
    } catch (e) {
      setNhifErr("Import failed");
    }
  };

  // Fetch SHIF settings
  const fetchShif = async () => {
    try {
      const res = await axios.get(SHIF_ENDPOINT);
      setShifRows(res.data);
    } catch {
      setShifErr("Failed to load SHIF settings");
    }
  };

  // Add SHIF setting
  const handleAddShif = async () => {
    setShifErr("");
    try {
      await axios.post(SHIF_ENDPOINT, {
        rate: shifForm.rate,
        cap: shifForm.cap,
        start_date: shifForm.start_date,
        end_date: shifForm.end_date || null
      });
      fetchShif();
      setShifForm({ rate: 0.0275, cap: 5000, start_date: "", end_date: "" });
    } catch {
      setShifErr("Failed to add SHIF setting");
    }
  };

  // Edit SHIF setting (simple example)
  const handleEditShif = async (id) => {
    setShifErr("");
    try {
      await axios.put(SHIF_ENDPOINT + id, shifForm);
      fetchShif();
    } catch {
      setShifErr("Failed to update SHIF setting");
    }
  };

  // Delete SHIF setting
  const handleDeleteShif = async (id) => {
    setShifErr("");
    try {
      await axios.delete(SHIF_ENDPOINT + id);
      fetchShif();
    } catch {
      setShifErr("Failed to delete SHIF setting");
    }
  };

  // Add band to PAYE form
  const addBand = () => {
    setPayeForm({
      ...payeForm,
      bands: [...payeForm.bands, { ...bandForm }],
    });
    setBandForm(INIT_BAND);
  };

  // Remove band from PAYE form
  const removeBand = (idx) => {
    setPayeForm({
      ...payeForm,
      bands: payeForm.bands.filter((_, i) => i !== idx),
    });
  };

  // Fetch PAYE tables
  const fetchPaye = async () => {
    try {
      const { data } = await axios.get(PAYE_ENDPOINT);
      const rows = Array.isArray(data) ? data : (data?.items || []);
      setPayeRows(rows || []);
    } catch {
      setPayeErr("Failed to load PAYE tables.");
    }
  };

  // Submit PAYE table (create or update with bands)
  const submitPaye = async () => {
    setPayeErr("");
    const payload = {
      start_date: payeForm.start_date,
      end_date: payeForm.end_date || null,
      personal_relief: Number(payeForm.personal_relief || 0),
      insurance_relief_rate: payeForm.insurance_relief_rate === "" ? null : Number(payeForm.insurance_relief_rate),
      insurance_relief_cap: payeForm.insurance_relief_cap === "" ? null : Number(payeForm.insurance_relief_cap),
      bands: (payeForm.bands || []).map((b) => ({
        lower: Number(b.lower),
        upper: b.upper === "" ? null : Number(b.upper),
        rate: Number(b.rate) > 1 ? Number(b.rate) / 100 : Number(b.rate),
      })),
    };

    try {
      if (editingPayeId) {
        await axios.put(`${PAYE_ENDPOINT}${editingPayeId}`, payload);
      } else {
        await axios.post(PAYE_ENDPOINT, payload);
      }
      await fetchPaye();
      // reset editor
      setEditingPayeId(null);
      setPayeForm(INIT_PAYE);
      setBandForm(INIT_BAND);
    } catch (e2) {
      setPayeErr(e2?.response?.data?.detail || "Save failed");
    }
  };

  // Load selected PAYE table into the editor and scroll to it
  const handleEditPaye = (row) => {
    setEditingPayeId(row.id);

    setPayeForm({
      start_date: row.start_date, // already YYYY-MM-DD
      end_date: row.end_date || "",
      personal_relief: String(row.personal_relief ?? ""),
      insurance_relief_rate: row.insurance_relief_rate ?? "",
      insurance_relief_cap: row.insurance_relief_cap ?? "",
      bands: (row.bands || []).map((b) => ({
        id: b.id,
        lower: String(b.lower ?? ""),
        upper: b.upper === null || b.upper === undefined ? "" : String(b.upper),
        rate: String(b.rate ?? ""),
      })),
    });

    // focus editor
    formTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const deletePaye = async (id) => {
    if (!window.confirm("Delete this PAYE table?")) return;
    try {
      await axios.delete(`${PAYE_ENDPOINT}/${id}`);
      fetchPaye();
    } catch {
      setPayeErr("Delete failed");
    }
  };

  const payeLabel = (r) => {
    const s = fmtDate(r.start_date);
    const e = r.end_date ? fmtDate(r.end_date) : "Present";
    return `${s} – ${e}`;
  };

  // Import PAYE bands from file
  const handlePayeFileUpload = async () => {
    if (!payeFile) return;
    setPayeImportErr("");
    const formData = new FormData();
    formData.append("file", payeFile);
    try {
      await axios.post(`${PAYE_ENDPOINT}/import`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      fetchPaye();
      setPayeFile(null);
    } catch (e) {
      setPayeImportErr("Import failed");
    }
  };

  // =========================
  // Render
  // =========================
  return (
    <div className="w-full space-y-8">
      {/* ---------- NSSF Periods ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-1">NSSF Settings (Periods)</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure LEL/UEL and effective dates. Leave <em>End Date</em> blank for the current open-ended period.
        </p>

        {nssfErr && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {nssfErr}
          </div>
        )}

        <form onSubmit={submitNssf} className="mb-6 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-gray-500">Start Date</label>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={nssfForm.start_date}
              onChange={(e) => setNssfForm({ ...nssfForm, start_date: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">End Date</label>
            <input
              type="date"
              className="w-full border rounded px-2 py-1"
              value={nssfForm.end_date}
              onChange={(e) => setNssfForm({ ...nssfForm, end_date: e.target.value })}
            />
            <div className="text-[10px] text-gray-400 mt-0.5">Blank = open-ended</div>
          </div>
          <div>
            <label className="text-xs text-gray-500">LEL</label>
            <input
              type="number"
              step="0.01"
              className="w-full border rounded px-2 py-1"
              value={nssfForm.lel}
              onChange={(e) => setNssfForm({ ...nssfForm, lel: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">UEL</label>
            <input
              type="number"
              step="0.01"
              className="w-full border rounded px-2 py-1"
              value={nssfForm.uel}
              onChange={(e) => setNssfForm({ ...nssfForm, uel: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Employee Rate</label>
            <input
              type="number"
              step="0.01"
              className="w-full border rounded px-2 py-1"
              value={nssfForm.rate_employee}
              onChange={(e) => setNssfForm({ ...nssfForm, rate_employee: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500">Employer Rate</label>
            <input
              type="number"
              step="0.01"
              className="w-full border rounded px-2 py-1"
              value={nssfForm.rate_employer}
              onChange={(e) => setNssfForm({ ...nssfForm, rate_employer: e.target.value })}
            />
          </div>

          {/* Advanced override caps */}
          <div className="md:col-span-6 flex items-center gap-2 mt-2">
            <input
              id="overrideCaps"
              type="checkbox"
              className="h-4 w-4"
              checked={showOverrides}
              onChange={() => setShowOverrides((v) => !v)}
            />
            <label htmlFor="overrideCaps" className="text-sm text-gray-700">
              Advanced: override caps (use only for legacy KSh 200 period)
            </label>
          </div>

          {showOverrides && (
            <>
              <div>
                <label className="text-xs text-gray-500">Tier I Cap</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1"
                  value={nssfForm.tier1_cap}
                  onChange={(e) => setNssfForm({ ...nssfForm, tier1_cap: e.target.value })}
                  placeholder="e.g. 200"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Tier II Cap</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1"
                  value={nssfForm.tier2_cap}
                  onChange={(e) => setNssfForm({ ...nssfForm, tier2_cap: e.target.value })}
                  placeholder="e.g. 0"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Max Employee Total</label>
                <input
                  type="number"
                  step="0.01"
                  className="w-full border rounded px-2 py-1"
                  value={nssfForm.max_employee_total}
                  onChange={(e) => setNssfForm({ ...nssfForm, max_employee_total: e.target.value })}
                  placeholder="e.g. 200"
                />
              </div>
            </>
          )}

          <div className="md:col-span-6 flex gap-2 justify-end mt-1">
            {nssfEditing && (
              <button
                type="button"
                className="px-3 py-1 rounded border"
                onClick={() => { setNssfForm(INIT_NSSF); setShowOverrides(false); }}
              >
                Cancel
              </button>
            )}
            <button className="px-4 py-1.5 rounded bg-gray-800 text-white">
              {nssfEditing ? "Update Period" : "Add Period"}
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">LEL</th>
                  <th className="px-3 py-2">UEL</th>
                  <th className="px-3 py-2">Tier I Cap</th>
                  <th className="px-3 py-2">Tier II Cap</th>
                  <th className="px-3 py-2">Max Employee Total</th>
                  <th className="px-3 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {nssfLoading ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={7}>Loading…</td>
                  </tr>
                ) : nssfRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={7}>No periods yet.</td>
                  </tr>
                ) : (
                  nssfRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{periodLabel(r)}</td>
                      <td className="px-3 py-2">{fmtInt(r.lel)}</td>
                      <td className="px-3 py-2">{fmtInt(r.uel)}</td>
                      <td className="px-3 py-2">{fmtInt(r.tier1_cap)}</td>
                      <td className="px-3 py-2">{fmtInt(r.tier2_cap)}</td>
                      <td className="px-3 py-2">{fmtInt(r.max_employee_total)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            className="px-2 py-0.5 rounded border"
                            onClick={() => editNssf(r)}
                          >
                            Edit
                          </button>
                          <button
                            className="px-2 py-0.5 rounded border border-red-300 text-red-700"
                            onClick={() => deleteNssf(r.id)}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ---------- NHIF Bands ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-1">NHIF Bands</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure NHIF bands and effective dates.
        </p>
        {nhifErr && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {nhifErr}
          </div>
        )}
        <form onSubmit={submitNhif} className="mb-6 grid grid-cols-1 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-gray-500">Start Date</label>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={nhifForm.start_date}
              onChange={e => setNhifForm({ ...nhifForm, start_date: e.target.value })}
              required />
          </div>
          <div>
            <label className="text-xs text-gray-500">End Date</label>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={nhifForm.end_date}
              onChange={e => setNhifForm({ ...nhifForm, end_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Lower Limit</label>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
              value={nhifForm.lower_limit}
              onChange={e => setNhifForm({ ...nhifForm, lower_limit: e.target.value })}
              required />
          </div>
          <div>
            <label className="text-xs text-gray-500">Upper Limit</label>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
              value={nhifForm.upper_limit}
              onChange={e => setNhifForm({ ...nhifForm, upper_limit: e.target.value })}
              required />
          </div>
          <div>
            <label className="text-xs text-gray-500">Deduction</label>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
              value={nhifForm.deduction}
              onChange={e => setNhifForm({ ...nhifForm, deduction: e.target.value })}
              required />
          </div>
          <div className="md:col-span-5 flex gap-2 justify-end mt-1">
            {nhifForm.id && (
              <button type="button" className="px-3 py-1 rounded border"
                onClick={() => setNhifForm(INIT_NHIF)}>
                Cancel
              </button>
            )}
            <button className="px-4 py-1.5 rounded bg-gray-800 text-white">
              {nhifForm.id ? "Update Band" : "Add Band"}
            </button>
          </div>
        </form>
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Lower Limit</th>
                  <th className="px-3 py-2">Upper Limit</th>
                  <th className="px-3 py-2">Deduction</th>
                  <th className="px-3 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {nhifLoading ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={5}>Loading…</td>
                  </tr>
                ) : nhifRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={5}>No bands yet.</td>
                  </tr>
                ) : (
                  nhifRows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2">{periodLabel(r)}</td>
                      <td className="px-3 py-2">{fmtInt(r.lower_limit)}</td>
                      <td className="px-3 py-2">{fmtInt(r.upper_limit)}</td>
                      <td className="px-3 py-2">{fmtInt(r.deduction)}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button className="px-2 py-0.5 rounded border"
                            onClick={() => editNhif(r)}>
                            Edit
                          </button>
                          <button className="px-2 py-0.5 rounded border border-red-300 text-red-700"
                            onClick={() => deleteNhif(r.id)}>
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

       
        {/* ---------- Import NHIF Bands from File ---------- */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">Import NHIF Bands from File</h3>
          <p className="text-sm text-gray-500 mb-4">
            Upload a CSV or Excel file to import NHIF bands.
          </p>
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={e => setNhifFile(e.target.files[0])}
            className="border rounded px-3 py-2 text-sm mb-2"
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleNhifFileUpload}
              className="px-4 py-1.5 rounded bg-green-600 text-white"
            >
              Import NHIF Bands
            </button>
          </div>
        </div>
      </div>

      {/* ---------- SHIF Settings ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-1">SHIF Settings</h2>
        {shifErr && <div className="bg-red-100 text-red-700 p-2 mb-2">{shifErr}</div>}
        <div className="flex gap-2 mb-2">
          <input
            type="number"
            step="0.0001"
            placeholder="Rate (e.g. 0.0275)"
            value={shifForm.rate}
            onChange={e => setShifForm({ ...shifForm, rate: parseFloat(e.target.value) })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="number"
            placeholder="Cap (e.g. 5000)"
            value={shifForm.cap}
            onChange={e => setShifForm({ ...shifForm, cap: parseFloat(e.target.value) })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="date"
            placeholder="Start Date"
            value={shifForm.start_date}
            onChange={e => setShifForm({ ...shifForm, start_date: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            type="date"
            placeholder="End Date"
            value={shifForm.end_date}
            onChange={e => setShifForm({ ...shifForm, end_date: e.target.value })}
            className="border rounded px-3 py-2 text-sm"
          />
          <button className="bg-blue-700 text-white px-4 py-1 rounded" onClick={handleAddShif}>
            Add SHIF Setting
          </button>
        </div>
        <table className="w-full border mb-4 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 border">Rate</th>
              <th className="px-3 py-2 border">Cap</th>
              <th className="px-3 py-2 border">Start Date</th>
              <th className="px-3 py-2 border">End Date</th>
              <th className="px-3 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {shifRows.map(row => (
              <tr key={row.id}>
                <td className="px-3 py-2 border">{row.rate}</td>
                <td className="px-3 py-2 border">{row.cap}</td>
                <td className="px-3 py-2 border">{row.start_date}</td>
                <td className="px-3 py-2 border">{row.end_date || ""}</td>
                <td className="px-3 py-2 border">
                  <button className="text-blue-700 mr-2" onClick={() => setShifForm(row)}>Edit</button>
                  <button className="text-red-700" onClick={() => handleDeleteShif(row.id)}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* ---------- AHL Tables (Housing Levy) ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-1">AHL Tables (Housing Levy)</h2>
        <p className="text-sm text-gray-500 mb-4">Configure Housing Levy (AHL) effective dates, employee/employer rates and optional relief parameters.</p>
        {ahlErr && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{ahlErr}</div>
        )}

        <form className="mb-6 grid grid-cols-1 md:grid-cols-6 gap-3" onSubmit={submitAhl}>
          <div>
            <label className="text-xs text-gray-500">Start Date</label>
            <input type="date" className="w-full border rounded px-2 py-1" value={ahlForm.start_date} onChange={e => setAhlForm({ ...ahlForm, start_date: e.target.value })} required />
          </div>
          <div>
            <label className="text-xs text-gray-500">End Date</label>
            <input type="date" className="w-full border rounded px-2 py-1" value={ahlForm.end_date} onChange={e => setAhlForm({ ...ahlForm, end_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Employee Rate (%)</label>
            <input type="number" step="0.0001" className="w-full border rounded px-2 py-1" value={ahlForm.employee_rate} onChange={e => setAhlForm({ ...ahlForm, employee_rate: e.target.value })} required />
          </div>
          <div>
            <label className="text-xs text-gray-500">Employer Rate (%)</label>
            <input type="number" step="0.0001" className="w-full border rounded px-2 py-1" value={ahlForm.employer_rate} onChange={e => setAhlForm({ ...ahlForm, employer_rate: e.target.value })} required />
          </div>
          <div>
            <label className="text-xs text-gray-500">Relief Rate (%)</label>
            <input type="number" step="0.0001" className="w-full border rounded px-2 py-1" value={ahlForm.relief_rate} onChange={e => setAhlForm({ ...ahlForm, relief_rate: e.target.value })} />
          </div>
          <div className="md:col-span-6 flex gap-2 justify-end mt-1">
            {ahlForm.id && (
              <button type="button" className="px-3 py-1 rounded border" onClick={() => setAhlForm({ id: null, start_date: "", end_date: "", employee_rate: 0.015, employer_rate: 0.015, relief_rate: "", relief_cap_month: "" })}>Cancel</button>
            )}
            <button className="px-4 py-1.5 rounded bg-gray-800 text-white">{ahlForm.id ? "Update Table" : "Add Table"}</button>
          </div>
        </form>

        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Employee Rate</th>
                  <th className="px-3 py-2">Employer Rate</th>
                  <th className="px-3 py-2">Relief</th>
                  <th className="px-3 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {ahlRows.length === 0 ? (
                  <tr><td className="px-3 py-3 text-gray-500" colSpan={5}>No AHL tables yet.</td></tr>
                ) : (
                  ahlRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">{payeLabel(row)}</td>
                      <td className="px-3 py-2">{Number(row.employee_rate) * 100}%</td>
                      <td className="px-3 py-2">{Number(row.employer_rate) * 100}%</td>
                      <td className="px-3 py-2">{row.relief_rate ? `${Number(row.relief_rate) * 100}% (cap ${row.relief_cap_month})` : "–"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button type="button" className="px-2 py-0.5 rounded border" onClick={() => editAhl(row)}>Edit</button>
                          <button type="button" className="px-2 py-0.5 rounded border border-red-300 text-red-700" onClick={() => deleteAhl(row.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ---------- PAYE Tables ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-1">PAYE Tables</h2>
        <p className="text-sm text-gray-500 mb-4">
          Configure PAYE tables and bands. Effective dates allow historical changes.
        </p>
        {payeErr && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {payeErr}
          </div>
        )}
        <div ref={formTopRef} className="p-4 border rounded mb-4">
          <form className="mb-6 grid grid-cols-1 md:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-gray-500">Start Date</label>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={payeForm.start_date}
              onChange={e => setPayeForm({ ...payeForm, start_date: e.target.value })}
              required />
          </div>
          <div>
            <label className="text-xs text-gray-500">End Date</label>
            <input type="date" className="w-full border rounded px-2 py-1"
              value={payeForm.end_date}
              onChange={e => setPayeForm({ ...payeForm, end_date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Personal Relief</label>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
              value={payeForm.personal_relief}
              onChange={e => setPayeForm({ ...payeForm, personal_relief: e.target.value })}
              required />
          </div>
          <div>
            <label className="text-xs text-gray-500">Insurance Relief Rate</label>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
              value={payeForm.insurance_relief_rate}
              onChange={e => setPayeForm({ ...payeForm, insurance_relief_rate: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-gray-500">Insurance Relief Cap</label>
            <input type="number" step="0.01" className="w-full border rounded px-2 py-1"
              value={payeForm.insurance_relief_cap}
              onChange={e => setPayeForm({ ...payeForm, insurance_relief_cap: e.target.value })} />
          </div>
          <div className="md:col-span-6 flex gap-2 justify-end mt-1">
            {editingPayeId && (
              <button type="button" className="px-3 py-1 rounded border"
                onClick={() => { setPayeForm(INIT_PAYE); setEditingPayeId(null); }}>
                Cancel
              </button>
            )}
            <button type="button" className="px-4 py-1.5 rounded bg-gray-800 text-white" onClick={submitPaye}>
              {editingPayeId ? "Update Table" : "Add Table"}
            </button>
          </div>
          </form>
        </div>
        {/* Bands input */}
        <div className="mb-4">
          <h4 className="font-semibold mb-2">Bands</h4>
          <div className="flex gap-2 mb-2">
            <input type="number" step="0.01" placeholder="Lower Limit" className="border rounded px-2 py-1"
              value={bandForm.lower}
              onChange={e => setBandForm({ ...bandForm, lower: e.target.value })} />
            <input type="number" step="0.01" placeholder="Upper Limit (blank = infinity)" className="border rounded px-2 py-1"
              value={bandForm.upper}
              onChange={e => setBandForm({ ...bandForm, upper: e.target.value })} />
            <input type="number" step="0.01" placeholder="Rate (%)" className="border rounded px-2 py-1"
              value={bandForm.rate}
              onChange={e => setBandForm({ ...bandForm, rate: e.target.value })} />
            <button type="button" className="bg-blue-600 text-white px-3 py-1 rounded" onClick={addBand}>
              Add Band
            </button>
          </div>
          <table className="min-w-full border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 border">Lower</th>
                <th className="px-3 py-2 border">Upper</th>
                <th className="px-3 py-2 border">Rate (%)</th>
                <th className="px-3 py-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {payeForm.bands.map((b, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 border">{fmtInt(b.lower)}</td>
                  <td className="px-3 py-2 border">{b.upper !== "" ? fmtInt(b.upper) : "∞"}</td>
                  <td className="px-3 py-2 border">{b.rate}</td>
                  <td className="px-3 py-2 border">
                    <button className="bg-red-600 text-white px-2 py-1 rounded"
                      onClick={() => removeBand(idx)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* PAYE tables list */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr className="text-left">
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Relief</th>
                  <th className="px-3 py-2">Bands</th>
                  <th className="px-3 py-2 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payeRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-gray-500" colSpan={4}>No PAYE tables yet.</td>
                  </tr>
                ) : (
                  payeRows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">{payeLabel(row)}</td>
                      <td className="px-3 py-2">{fmtInt(row.personal_relief)}</td>
                      <td className="px-3 py-2">
                        <ul>
                          {row.bands.map((b, i) => (
                            <li key={b.id}>
                              {fmtInt(b.lower)} - {b.upper !== null ? fmtInt(b.upper) : "∞"} @ {b.rate * 100}%
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="px-2 py-0.5 rounded border"
                            onClick={() => handleEditPaye(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="px-2 py-0.5 rounded border border-red-300 text-red-700"
                            onClick={() => deletePaye(row.id)}
                          >
                            Del
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------- Import PAYE Bands ---------- */}
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-2">Import PAYE Bands</h3>
          <p className="text-sm text-gray-500 mb-2">
            Upload a CSV or Excel file to bulk update PAYE bands/rates.
            <br />Required columns: <b>lower, upper, rate</b>
          </p>
          {payeImportErr && (
            <div className="mb-2 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">
              {payeImportErr}
            </div>
          )}
          <input
            type="file"
            accept=".xlsx,.csv"
            onChange={e => setPayeFile(e.target.files[0])}
          />
          <button
            className="bg-green-700 text-white px-4 py-1 rounded ml-2"
            onClick={handlePayeFileUpload}
          >
            Import PAYE Bands
          </button>
        </div>
      </div>

      {/* ---------- Generic key/value settings (existing) ---------- */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-1">Payroll Settings (General)</h2>
        {genericErr && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {genericErr}
          </div>
        )}

        <form className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4" onSubmit={handleSubmit}>
          <input
            type="text"
            name="name"
            placeholder="Setting Name (e.g. 'PAYE Relief')"
            value={form.name}
            onChange={handleChange}
            className="border px-2 py-1 rounded"
            required
          />
          <input
            type="number"
            name="value"
            placeholder="Value"
            value={form.value}
            onChange={handleChange}
            className="border px-2 py-1 rounded"
            required
          />
          <input
            type="date"
            name="start_date"
            placeholder="Start Date"
            value={form.start_date}
            onChange={handleChange}
            className="border px-2 py-1 rounded"
            required
          />
          <input
            type="date"
            name="end_date"
            placeholder="End Date"
            value={form.end_date}
            onChange={handleChange}
            className="border px-2 py-1 rounded"
            required
          />
          <div className="col-span-1 md:col-span-4 flex gap-2 mt-2">
            <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
              {editingId ? "Update" : "Add"}
            </button>
            {editingId && (
              <button
                type="button"
                className="bg-gray-300 px-4 py-1 rounded"
                onClick={handleCancel}
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-3 py-2 border">Name</th>
              <th className="px-3 py-2 border">Value</th>
              <th className="px-3 py-2 border">Start Date</th>
              <th className="px-3 py-2 border">End Date</th>
              <th className="px-3 py-2 border">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-4">Loading...</td>
              </tr>
            ) : settings.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-4 text-gray-400">No settings found.</td>
              </tr>
            ) : (
              settings.map((setting) => (
                <tr key={setting.id}>
                  <td className="px-3 py-2 border">{setting.name}</td>
                  <td className="px-3 py-2 border">{setting.value}</td>
                  <td className="px-3 py-2 border">{fmtDate(setting.start_date)}</td>
                  <td className="px-3 py-2 border">{fmtDate(setting.end_date)}</td>
                  <td className="px-3 py-2 border">
                    <button
                      className="bg-yellow-500 text-white px-2 py-1 rounded mr-2"
                      onClick={() => handleEdit(setting)}
                    >
                      Edit
                    </button>
                    <button
                      className="bg-red-600 text-white px-2 py-1 rounded"
                      onClick={() => handleDelete(setting.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}