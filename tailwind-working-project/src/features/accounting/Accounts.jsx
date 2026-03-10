// src/features/accounting/Accounts.jsx
// Chart of Accounts management page
import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../../lib/api";

const ACCOUNTS_ENDPOINT = `${API_BASE}/accounts/`;

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense"];

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    account_code: "",
    name: "",
    type: "Asset",
    description: "",
    parent_account_code: "",
  });

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const res = await axios.get(ACCOUNTS_ENDPOINT);
      setAccounts(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load accounts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAccounts(); }, []);

  const filtered = (accounts || []).filter((a) => {
    const q = search.toLowerCase();
    return [a.account_code, a.name, a.type, a.description]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    try {
      await axios.post(ACCOUNTS_ENDPOINT, {
        account_code: form.account_code,
        name: form.name,
        type: form.type,
        description: form.description || null,
        parent_account_code: form.parent_account_code || null,
      });
      setSuccess("Account created");
      setForm({ account_code: "", name: "", type: "Asset", description: "", parent_account_code: "" });
      setShowForm(false);
      fetchAccounts();
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to create account";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }
  };

  return (
    <div className="px-4 py-3 w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Chart of Accounts</h1>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search accounts…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[220px] border rounded px-3 py-2 text-sm"
          />
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm"
          >
            {showForm ? "Cancel" : "+ New Account"}
          </button>
        </div>
      </div>

      {success && <div className="mb-3 p-3 rounded bg-green-100 text-green-800 text-sm">{success}</div>}
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>}

      {showForm && (
        <div className="mb-4 border rounded-lg p-3 bg-white">
          <h2 className="text-sm font-semibold mb-2">New Account</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12 md:col-span-3">
                <label className="block text-xs mb-0.5">Account Code *</label>
                <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.account_code}
                       onChange={(e) => setForm({ ...form, account_code: e.target.value })} />
              </div>
              <div className="col-span-12 md:col-span-5">
                <label className="block text-xs mb-0.5">Name *</label>
                <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.name}
                       onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="col-span-12 md:col-span-4">
                <label className="block text-xs mb-0.5">Type *</label>
                <select className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.type}
                        onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-12 md:col-span-6">
                <label className="block text-xs mb-0.5">Description</label>
                <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.description}
                       onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="col-span-12 md:col-span-3">
                <label className="block text-xs mb-0.5">Parent Account Code</label>
                <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.parent_account_code}
                       onChange={(e) => setForm({ ...form, parent_account_code: e.target.value })} />
              </div>
            </div>
            <div className="mt-3">
              <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
                Create Account
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
          Accounts {loading && <span className="text-gray-400 ml-2">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Code</th>
                <th className="text-left font-semibold px-4 py-2">Name</th>
                <th className="text-left font-semibold px-4 py-2">Type</th>
                <th className="text-left font-semibold px-4 py-2">Description</th>
                <th className="text-left font-semibold px-4 py-2">Parent</th>
                <th className="text-left font-semibold px-4 py-2">Active</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">No accounts found.</td>
                </tr>
              )}
              {filtered.map((a) => (
                <tr key={a.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono">{a.account_code}</td>
                  <td className="px-4 py-2 font-medium">{a.name}</td>
                  <td className="px-4 py-2">{a.type}</td>
                  <td className="px-4 py-2 text-gray-500">{a.description || "-"}</td>
                  <td className="px-4 py-2">{a.parent_account_code || "-"}</td>
                  <td className="px-4 py-2">{a.is_active ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Accounts;
