import React, { useState } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

export default function CustomerQuickForm({ mode="create", initialData=null, onSuccess }) {
  const [form, setForm] = useState({
    id: initialData?.id ?? null,
    client_number: initialData?.client_number?.toString() ?? "",
    name: initialData?.name ?? "",
    phone: initialData?.phone ?? "",
    email: initialData?.email ?? "",
    kra_pin: initialData?.kra_pin ?? "",
    address: initialData?.address ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const auth = {
    username: localStorage.getItem("username"),
    password: localStorage.getItem("password"),
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.client_number || !form.name) {
      setError("Client number and name are required.");
      return;
    }
    setSaving(true);
    try {
      if (mode === "edit" && form.id) {
        await axios.put(`${API_BASE}/customers/${form.id}`, {
          client_number: Number(form.client_number),
          name: form.name,
          phone: form.phone,
          email: form.email,
          kra_pin: form.kra_pin,
          address: form.address,
        }, { auth });
      } else {
        await axios.post(`${API_BASE}/customers/`, {
          client_number: Number(form.client_number),
          name: form.name,
          phone: form.phone,
          email: form.email,
          kra_pin: form.kra_pin,
          address: form.address,
        }, { auth });
      }
      onSuccess?.();
    } catch (err) {
      setError(err?.response?.data?.detail || "Failed to save customer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {error ? <div className="text-red-600 text-sm">{error}</div> : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm">Client Number *</label>
          <input
            name="client_number"
            value={form.client_number}
            onChange={handleChange}
            className="w-full border rounded p-2"
            disabled={mode === "edit"} /* keep immutable like your table edit */
          />
        </div>
        <div>
          <label className="block text-sm">Name *</label>
          <input
            name="name"
            value={form.name}
            onChange={handleChange}
            className="w-full border rounded p-2"
          />
        </div>
        <div>
          <label className="block text-sm">Phone</label>
          <input name="phone" value={form.phone} onChange={handleChange} className="w-full border rounded p-2" />
        </div>
        <div>
          <label className="block text-sm">Email</label>
          <input name="email" value={form.email} onChange={handleChange} className="w-full border rounded p-2" />
        </div>
        <div>
          <label className="block text-sm">KRA PIN</label>
          <input name="kra_pin" value={form.kra_pin} onChange={handleChange} className="w-full border rounded p-2" />
        </div>
        <div>
          <label className="block text-sm">Address</label>
          <input name="address" value={form.address} onChange={handleChange} className="w-full border rounded p-2" />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-black text-white">
          {saving ? "Saving..." : mode === "edit" ? "Update Customer" : "Create Customer"}
        </button>
      </div>
    </form>
  );
}
