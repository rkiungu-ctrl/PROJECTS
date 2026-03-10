// src/features/settings/Currencies.jsx
// Currency management page
import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../../lib/api";

const CURRENCIES_ENDPOINT = `${API_BASE}/currencies/`;
const CURRENCY_BY_ID = (id) => `${API_BASE}/currencies/${id}`;
const SET_BASE = (id) => `${API_BASE}/currencies/${id}/set_base`;

const INIT_FORM = { code: "", name: "", symbol: "", decimal_places: "2", rate_to_base: "1", active: true, is_base: false };

const Currencies = () => {
  const [currencies, setCurrencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState(INIT_FORM);
  const [editingId, setEditingId] = useState(null);

  const fetchCurrencies = async () => {
    try {
      setLoading(true);
      const res = await axios.get(CURRENCIES_ENDPOINT);
      setCurrencies(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load currencies");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCurrencies(); }, []);

  const resetForm = () => { setForm(INIT_FORM); setEditingId(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    if (!form.code || !form.name) { setError("Code and name are required"); return; }
    const payload = {
      code: form.code,
      name: form.name,
      symbol: form.symbol || null,
      decimal_places: parseInt(form.decimal_places) || 2,
      rate_to_base: parseFloat(form.rate_to_base) || 1,
      active: form.active,
      is_base: form.is_base,
    };
    try {
      if (editingId) {
        await axios.put(CURRENCY_BY_ID(editingId), payload);
        setSuccess("Currency updated");
      } else {
        await axios.post(CURRENCIES_ENDPOINT, payload);
        setSuccess("Currency created");
      }
      resetForm();
      fetchCurrencies();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save currency";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }
  };

  const handleEdit = (c) => {
    setEditingId(c.id);
    setForm({
      code: c.code || "",
      name: c.name || "",
      symbol: c.symbol || "",
      decimal_places: String(c.decimal_places ?? 2),
      rate_to_base: String(c.rate_to_base ?? 1),
      active: c.active !== false,
      is_base: c.is_base || false,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSetBase = async (id) => {
    setError(""); setSuccess("");
    try {
      await axios.post(SET_BASE(id));
      setSuccess("Base currency updated");
      fetchCurrencies();
    } catch (err) {
      setError("Failed to set base currency");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this currency?")) return;
    setError(""); setSuccess("");
    try {
      await axios.delete(CURRENCY_BY_ID(id));
      setSuccess("Currency deleted");
      if (editingId === id) resetForm();
      fetchCurrencies();
    } catch (err) {
      setError("Failed to delete currency");
    }
  };

  return (
    <div className="px-4 py-3 w-full">
      <h1 className="text-2xl font-semibold mb-4">Currencies</h1>

      {success && <div className="mb-3 p-3 rounded bg-green-100 text-green-800 text-sm">{success}</div>}
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>}

      <div className="mb-4 border rounded-lg p-3 bg-white">
        <h2 className="text-sm font-semibold mb-2">{editingId ? "Edit Currency" : "Add Currency"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">Code *</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm uppercase" value={form.code}
                     onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} maxLength={10} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Name *</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">Symbol</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.symbol}
                     onChange={(e) => setForm({ ...form, symbol: e.target.value })} maxLength={5} />
            </div>
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">Rate to Base</label>
              <input type="number" step="0.00000001" className="w-full border rounded px-2.5 py-1.5 text-sm"
                     value={form.rate_to_base} onChange={(e) => setForm({ ...form, rate_to_base: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-2">
              <label className="block text-xs mb-0.5">Decimals</label>
              <input type="number" min="0" max="6" className="w-full border rounded px-2.5 py-1.5 text-sm"
                     value={form.decimal_places} onChange={(e) => setForm({ ...form, decimal_places: e.target.value })} />
            </div>
            <div className="col-span-12 flex gap-4 mt-1">
              <label className="flex items-center gap-1 text-sm">
                <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
                Active
              </label>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
              {editingId ? "Update Currency" : "Add Currency"}
            </button>
            <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm">Reset</button>
          </div>
        </form>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
          Currency List {loading && <span className="text-gray-400 ml-2">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Actions</th>
                <th className="text-left font-semibold px-4 py-2">Code</th>
                <th className="text-left font-semibold px-4 py-2">Name</th>
                <th className="text-left font-semibold px-4 py-2">Symbol</th>
                <th className="text-left font-semibold px-4 py-2">Rate to Base</th>
                <th className="text-left font-semibold px-4 py-2">Base</th>
                <th className="text-left font-semibold px-4 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {currencies.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-500">No currencies found.</td></tr>
              )}
              {currencies.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <div className="flex gap-1 flex-wrap">
                      <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50" onClick={() => handleEdit(c)}>Edit</button>
                      {!c.is_base && (
                        <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50" onClick={() => handleSetBase(c.id)}>Set Base</button>
                      )}
                      <button className="px-2 py-1 border rounded text-xs text-red-600 hover:bg-red-50" onClick={() => handleDelete(c.id)}>Delete</button>
                    </div>
                  </td>
                  <td className="px-4 py-2 font-mono font-medium">{c.code}</td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.symbol || "-"}</td>
                  <td className="px-4 py-2">{c.rate_to_base}</td>
                  <td className="px-4 py-2">{c.is_base ? <span className="text-green-600 font-medium">✓ Base</span> : "-"}</td>
                  <td className="px-4 py-2">{c.active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Currencies;
