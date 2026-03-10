// src/features/settings/Taxes.jsx
// Tax management page
import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../../lib/api";

const TAXES_ENDPOINT = `${API_BASE}/taxes/`;
const TAX_BY_ID = (id) => `${API_BASE}/taxes/${id}`;

const INIT_FORM = { name: "", type: "VAT", rate: "", start_date: "", end_date: "", account_code: "" };

const Taxes = () => {
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(INIT_FORM);
  const [editingId, setEditingId] = useState(null);

  const fetchTaxes = async () => {
    try {
      setLoading(true);
      const res = await axios.get(TAXES_ENDPOINT);
      setTaxes(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load taxes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTaxes(); }, []);

  const resetForm = () => { setForm(INIT_FORM); setEditingId(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.name || !form.rate || !form.start_date || !form.account_code) {
      setError("Name, rate, start date, and account code are required");
      return;
    }
    const payload = {
      name: form.name,
      type: form.type,
      rate: parseFloat(form.rate),
      start_date: form.start_date,
      end_date: form.end_date || null,
      account_code: form.account_code,
    };
    try {
      if (editingId) {
        await axios.put(TAX_BY_ID(editingId), payload);
        setSuccess("Tax updated");
      } else {
        await axios.post(TAXES_ENDPOINT, payload);
        setSuccess("Tax created");
      }
      resetForm();
      fetchTaxes();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save tax";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }
  };

  const handleEdit = (t) => {
    setEditingId(t.id);
    setForm({
      name: t.name || "",
      type: t.type || "VAT",
      rate: t.rate != null ? String(t.rate) : "",
      start_date: t.start_date || "",
      end_date: t.end_date || "",
      account_code: t.account_code || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this tax?")) return;
    setError(""); setSuccess("");
    try {
      await axios.delete(TAX_BY_ID(id));
      setSuccess("Tax deleted");
      if (editingId === id) resetForm();
      fetchTaxes();
    } catch (err) {
      setError("Failed to delete tax");
    }
  };

  return (
    <div className="px-4 py-3 w-full">
      <h1 className="text-2xl font-semibold mb-4">Taxes</h1>

      {success && <div className="mb-3 p-3 rounded bg-green-100 text-green-800 text-sm">{success}</div>}
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>}

      <div className="mb-4 border rounded-lg p-3 bg-white">
        <h2 className="text-sm font-semibold mb-2">{editingId ? "Edit Tax" : "Add Tax"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-3">
              <label className="block text-xs mb-0.5">Name *</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">Type</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.type}
                     onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">Rate (%) *</label>
              <input type="number" step="0.01" className="w-full border rounded px-2.5 py-1.5 text-sm"
                     value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">Start Date *</label>
              <input type="date" className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.start_date}
                     onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">End Date</label>
              <input type="date" className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.end_date}
                     onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-3">
              <label className="block text-xs mb-0.5">Account Code *</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.account_code}
                     onChange={(e) => setForm({ ...form, account_code: e.target.value })} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
              {editingId ? "Update Tax" : "Add Tax"}
            </button>
            <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm">Reset</button>
          </div>
        </form>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
          Tax List {loading && <span className="text-gray-400 ml-2">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Actions</th>
                <th className="text-left font-semibold px-4 py-2">Name</th>
                <th className="text-left font-semibold px-4 py-2">Type</th>
                <th className="text-left font-semibold px-4 py-2">Rate (%)</th>
                <th className="text-left font-semibold px-4 py-2">Start Date</th>
                <th className="text-left font-semibold px-4 py-2">End Date</th>
                <th className="text-left font-semibold px-4 py-2">Account Code</th>
              </tr>
            </thead>
            <tbody>
              {taxes.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No taxes found.</td></tr>
              )}
              {taxes.map((t) => (
                <tr key={t.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex gap-2">
                      <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50" onClick={() => handleEdit(t)}>Edit</button>
                      <button className="px-2 py-1 border rounded text-xs text-red-600 hover:bg-red-50" onClick={() => handleDelete(t.id)}>Delete</button>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-medium">{t.name}</td>
                  <td className="px-4 py-2">{t.type}</td>
                  <td className="px-4 py-2">{t.rate}</td>
                  <td className="px-4 py-2">{t.start_date}</td>
                  <td className="px-4 py-2">{t.end_date || "-"}</td>
                  <td className="px-4 py-2 font-mono">{t.account_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Taxes;
