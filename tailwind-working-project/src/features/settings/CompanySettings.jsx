// src/features/settings/CompanySettings.jsx
// Company profile settings page
import React, { useEffect, useState } from "react";
import axios from "axios";
import { API_BASE } from "../../lib/api";

const PROFILE_ENDPOINT = `${API_BASE}/company/profile`;

const INIT_FORM = {
  company_name: "",
  legal_name: "",
  phone: "",
  email: "",
  kra_pin: "",
  address: "",
  website: "",
  currency: "KES",
  invoice_prefix: "INV",
};

const CompanySettings = () => {
  const [form, setForm] = useState(INIT_FORM);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await axios.get(PROFILE_ENDPOINT);
        const d = res.data;
        setForm({
          company_name: d.company_name || "",
          legal_name: d.legal_name || "",
          phone: d.phone || "",
          email: d.email || "",
          kra_pin: d.kra_pin || "",
          address: d.address || "",
          website: d.website || "",
          currency: d.currency || "KES",
          invoice_prefix: d.invoice_prefix || "INV",
        });
      } catch (err) {
        console.error(err);
        setError("Failed to load company settings");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess("");
    setSaving(true);
    try {
      await axios.post(PROFILE_ENDPOINT, form);
      setSuccess("Company settings saved");
    } catch (err) {
      const msg = err?.response?.data?.detail || "Failed to save settings";
      setError(Array.isArray(msg) ? msg.join(", ") : String(msg));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="px-4 py-3">Loading…</div>;

  return (
    <div className="px-4 py-3 w-full max-w-2xl">
      <h1 className="text-2xl font-semibold mb-4">Company Settings</h1>

      {success && <div className="mb-3 p-3 rounded bg-green-100 text-green-800 text-sm">{success}</div>}
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>}

      <div className="border rounded-lg p-4 bg-white">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-6">
              <label className="block text-xs mb-0.5">Company Name</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.company_name}
                     onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <label className="block text-xs mb-0.5">Legal Name</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.legal_name}
                     onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <label className="block text-xs mb-0.5">Phone</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.phone}
                     onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <label className="block text-xs mb-0.5">Email</label>
              <input type="email" className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.email}
                     onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <label className="block text-xs mb-0.5">KRA PIN</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.kra_pin}
                     onChange={(e) => setForm({ ...form, kra_pin: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-6">
              <label className="block text-xs mb-0.5">Website</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.website}
                     onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="col-span-12">
              <label className="block text-xs mb-0.5">Address</label>
              <textarea className="w-full border rounded px-2.5 py-1.5 text-sm" rows={2} value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Currency</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.currency}
                     onChange={(e) => setForm({ ...form, currency: e.target.value })} maxLength={10} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Invoice Prefix</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.invoice_prefix}
                     onChange={(e) => setForm({ ...form, invoice_prefix: e.target.value })} maxLength={10} />
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CompanySettings;
