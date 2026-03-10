// src/features/sales/Customers.jsx
// Manage customers: Create, View, Edit, Delete, Export
// Endpoints:
//   GET    /customers/
//   POST   /customers/
//   PUT    /customers/{id}
//   DELETE /customers/{id}

import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

import { API_BASE } from "../../lib/api";

const CUSTOMERS_ENDPOINT = `${API_BASE}/customers/`;
const CUSTOMER_BY_ID = (id) => `${API_BASE}/customers/${id}`;

const INIT_FORM = {
  client_number: "",
  name: "",
  phone: "",
  email: "",
  kra_pin: "",
  address: "",
};

const Customers = () => {
  const [form, setForm] = useState(INIT_FORM);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [viewing, setViewing] = useState(null);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const res = await axios.get(CUSTOMERS_ENDPOINT);
      setCustomers(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const resetAlerts = () => { setSuccess(""); setError(""); };
  const resetForm = () => { setForm(INIT_FORM); setEditingId(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    resetAlerts();
    if (!form.name.trim()) { setError("Customer name is required"); return; }
    if (!form.client_number) { setError("Client number is required"); return; }

    const payload = {
      client_number: Number(form.client_number),
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      kra_pin: form.kra_pin || null,
      address: form.address || null,
    };

    try {
      if (editingId) {
        await axios.put(CUSTOMER_BY_ID(editingId), payload);
        setSuccess("Customer updated");
      } else {
        await axios.post(CUSTOMERS_ENDPOINT, payload);
        setSuccess("Customer added");
      }
      resetForm();
      fetchCustomers();
    } catch (err) {
      console.error(err);
      const msg = err?.response?.data?.detail || err?.message || "Failed to save customer";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    }
  };

  const handleEditLoad = (c) => {
    resetAlerts();
    setEditingId(c.id);
    setForm({
      client_number: c.client_number != null ? String(c.client_number) : "",
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      kra_pin: c.kra_pin || "",
      address: c.address || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this customer?")) return;
    resetAlerts();
    try {
      await axios.delete(CUSTOMER_BY_ID(id));
      setSuccess("Customer deleted");
      if (editingId === id) resetForm();
      fetchCustomers();
    } catch (err) {
      console.error(err);
      setError("Failed to delete customer");
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (customers || []).filter((c) =>
      [c.name, c.phone, c.email, c.kra_pin, c.address, String(c.client_number || "")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [customers, search]);

  const exportCustomers = () => {
    const rows = filtered.map((c) => ({
      client_number: c.client_number || "",
      name: c.name || "",
      phone: c.phone || "",
      email: c.email || "",
      kra_pin: c.kra_pin || "",
      address: c.address || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    const d = new Date();
    XLSX.writeFile(wb, `customers_export_${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}.xlsx`);
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([["client_number", "name", "phone", "email", "kra_pin", "address"]]);
    XLSX.utils.book_append_sheet(wb, ws, "CustomerTemplate");
    XLSX.writeFile(wb, "customer_template.xlsx");
  };

  return (
    <div className="px-4 py-3 w-full">
      <h1 className="text-2xl font-semibold mb-4">Customers</h1>

      {/* HEADER CONTROLS */}
      <div className="mb-3 flex items-center gap-2 justify-between flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="px-2.5 py-1.5 text-xs rounded border hover:bg-gray-50" onClick={downloadTemplate}>
            Download Template
          </button>
          <button className="px-2.5 py-1.5 text-xs rounded border hover:bg-gray-50" onClick={exportCustomers}>
            Export to Excel
          </button>
        </div>
        <input
          type="text"
          placeholder="Search customers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[320px] max-w-full border rounded px-3 py-2 text-sm"
        />
      </div>

      {success && <div className="mb-3 p-3 rounded bg-green-100 text-green-800 text-sm">{success}</div>}
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>}

      {/* ADD/EDIT FORM */}
      <div className="mb-4 border rounded-lg p-3 bg-white">
        <h2 className="text-sm font-semibold mb-2">{editingId ? "Edit Customer" : "Add Customer"}</h2>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-3">
              <label className="block text-xs mb-0.5">Client Number *</label>
              <input
                type="number"
                className="w-full border rounded px-2.5 py-1.5 text-sm"
                value={form.client_number}
                onChange={(e) => setForm({ ...form, client_number: e.target.value })}
                disabled={!!editingId}
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Name *</label>
              <input
                className="w-full border rounded px-2.5 py-1.5 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Phone</label>
              <input
                className="w-full border rounded px-2.5 py-1.5 text-sm"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Email</label>
              <input
                className="w-full border rounded px-2.5 py-1.5 text-sm"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">KRA PIN</label>
              <input
                className="w-full border rounded px-2.5 py-1.5 text-sm"
                value={form.kra_pin}
                onChange={(e) => setForm({ ...form, kra_pin: e.target.value })}
              />
            </div>
            <div className="col-span-12 md:col-span-8">
              <label className="block text-xs mb-0.5">Address</label>
              <input
                className="w-full border rounded px-2.5 py-1.5 text-sm"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button type="submit" className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
              {editingId ? "Update Customer" : "Add Customer"}
            </button>
            <button type="button" onClick={resetForm} className="px-3 py-1.5 rounded border hover:bg-gray-50 text-sm">
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* CUSTOMER LIST */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
          Customer List {loading && <span className="text-gray-400 ml-2">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Actions</th>
                <th className="text-left font-semibold px-4 py-2">Client No.</th>
                <th className="text-left font-semibold px-4 py-2">Name</th>
                <th className="text-left font-semibold px-4 py-2">Phone</th>
                <th className="text-left font-semibold px-4 py-2">Email</th>
                <th className="text-left font-semibold px-4 py-2">KRA PIN</th>
                <th className="text-left font-semibold px-4 py-2">Address</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                    No customers found.
                  </td>
                </tr>
              )}
              {filtered.map((c) => (
                <tr key={c.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 align-top">
                    <div className="flex gap-2">
                      <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                              onClick={() => setViewing(c)}>View</button>
                      <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                              onClick={() => handleEditLoad(c)}>Edit</button>
                      <button className="px-2 py-1 border rounded text-xs text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(c.id)}>Delete</button>
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">{c.client_number ?? "-"}</td>
                  <td className="px-4 py-2 align-top font-medium">{c.name}</td>
                  <td className="px-4 py-2 align-top">{c.phone || "-"}</td>
                  <td className="px-4 py-2 align-top">{c.email || "-"}</td>
                  <td className="px-4 py-2 align-top">{c.kra_pin || "-"}</td>
                  <td className="px-4 py-2 align-top">{c.address || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Customer Details</h3>
              <button className="px-2 py-1 border rounded text-sm" onClick={() => setViewing(null)}>Close</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="font-semibold">Client Number:</span> {viewing.client_number ?? "-"}</div>
              <div><span className="font-semibold">Name:</span> {viewing.name}</div>
              <div><span className="font-semibold">Phone:</span> {viewing.phone || "-"}</div>
              <div><span className="font-semibold">Email:</span> {viewing.email || "-"}</div>
              <div><span className="font-semibold">KRA PIN:</span> {viewing.kra_pin || "-"}</div>
              <div><span className="font-semibold">Address:</span> {viewing.address || "-"}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
