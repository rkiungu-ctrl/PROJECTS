// ✅ Suppliers.jsx — Create + View + Edit + Delete + Import/Export/Template
// Endpoints assumed:
//   GET    /suppliers/
//   POST   /suppliers/
//   PUT    /suppliers/{id}
//   DELETE /suppliers/{id}

import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

import { API_BASE } from "../lib/api";
const SUPPLIERS_ENDPOINT = `${API_BASE}/suppliers/`;                // GET (list), POST (create)
const SUPPLIER_BY_ID = (id) => `${API_BASE}/suppliers/${id}`;       // PUT, DELETE
const SUPPLIERS_BALANCES_ENDPOINT = `${API_BASE}/suppliers/`;

const compact = true; // toggle here
const inPad = compact ? "px-2.5 py-1.5" : "px-3 py-2";
const lbl = compact ? "text-xs mb-0.5" : "text-sm mb-1";
const gap = compact ? "gap-2" : "gap-4";

const Suppliers = () => {
  // form fields
  const INIT_FORM = {
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    pin: "",
    address: "",
    bank_name: "",
    bank_branch: "",
    bank_account_number: "",
    bank_branch_code: ""
  };
  const [form, setForm] = useState(INIT_FORM);

  // list & ui
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // edit/view
  const [editingId, setEditingId] = useState(null);
  const [viewing, setViewing] = useState(null); // supplier object or null

  // import
  const [file, setFile] = useState(null);

  // details modal
  const [detailsModal, setDetailsModal] = useState({ open: false, supplier: null, invoices: [], payments: [] });

  // Fetch suppliers with balances in one call
  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const res = await axios.get(SUPPLIERS_BALANCES_ENDPOINT);
      setSuppliers(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const resetAlerts = () => {
    setSuccess("");
    setError("");
  };

  const resetForm = () => {
    setForm(INIT_FORM);
    setEditingId(null);
  };

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    resetAlerts();

    if (!form.name.trim()) {
      setError("Supplier name is required");
      return;
    }

    try {
      await axios.post(SUPPLIERS_ENDPOINT, {
        name: form.name,
        contact_person: form.contact_person || null,
        phone: form.phone || null,
        email: form.email || null,
        pin: form.pin || null,
        address: form.address || null,
        bank_name: form.bank_name || null,
        bank_branch: form.bank_branch || null,
        bank_account_number: form.bank_account_number || null,
        bank_branch_code: form.bank_branch_code || null,
      });
      setSuccess("Supplier added");
      setForm(INIT_FORM);
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      setError("Failed to add supplier");
    }
  };

  const handleEditLoad = (s) => {
    resetAlerts();
    setEditingId(s.id);
    setForm({
      name: s.name || "",
      contact_person: s.contact_person || "",
      phone: s.phone || "",
      email: s.email || "",
      pin: s.pin || "",
      address: s.address || "",
      bank_name: s.bank_name || "",
      bank_branch: s.bank_branch || "",
      bank_account_number: s.bank_account_number || "",
      bank_branch_code: s.bank_branch_code || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleUpdate = async (e) => {
  e.preventDefault();
  resetAlerts();

  if (!editingId) {
    setError("No supplier selected for update.");
    return;
  }
  if (!form.name.trim()) {
    setError("Supplier name is required");
    return;
  }

  try {
    await axios.put(SUPPLIER_BY_ID(editingId), {
      name: form.name,
      contact_person: form.contact_person || null,
      phone: form.phone || null,
      email: form.email || null,
      pin: form.pin || null,
      address: form.address || null,
      bank_name: form.bank_name || null,
      bank_branch: form.bank_branch || null,
      bank_account_number: form.bank_account_number || null,
      bank_branch_code: form.bank_branch_code || null,
    });
    setSuccess("Supplier updated");
    resetForm();
    fetchSuppliers();
  } catch (err) {
    console.error(err);
    const msg = err?.response?.data?.detail || err?.message || "Failed to update supplier";
    setError(Array.isArray(msg) ? msg.join(", ") : msg);
  }
};


  const handleDelete = async (id) => {
    if (!window.confirm("Delete this supplier?")) return;
    resetAlerts();
    try {
      await axios.delete(SUPPLIER_BY_ID(id));
      setSuccess("Supplier deleted");
      if (editingId === id) resetForm();
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      setError("Failed to delete supplier");
    }
  };

  // Only fetch details when user clicks a balance
  const handleShowDetails = async (supplier) => {
    try {
      const invoicesRes = await axios.get(`${API_BASE}/suppliers/by_supplier/${supplier.id}`);
      const paymentsRes = await axios.get(`${API_BASE}/payments/?supplier_id=${supplier.id}`);
      setDetailsModal({
        open: true,
        supplier,
        invoices: invoicesRes.data || [],
        payments: paymentsRes.data || [],
      });
    } catch (err) {
      setDetailsModal({ open: true, supplier, invoices: [], payments: [] });
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (suppliers || []).filter((s) =>
      [s.name, s.phone, s.email, s.pin, s.address]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [suppliers, search]);

  // ----- Import / Export / Template -----
  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const wsData = [
      ["name", "phone", "email", "pin", "address"], // headers
      // sample rows (optional):
      // ["ABC Ltd", "0712...", "info@abc.com", "P0XXXXXXX", "P.O. Box 123, Nairobi"],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "SupplierTemplate");
    XLSX.writeFile(wb, "supplier_template.xlsx");
  };

  const exportSuppliers = () => {
    const rows = filtered.map((s) => ({
      name: s.name || "",
      phone: s.phone || "",
      email: s.email || "",
      kra_pin: s.pin || "",
      address: s.address || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    XLSX.writeFile(wb, `suppliers_export_${y}${m}${dd}.xlsx`);
  };

  const handleImport = async () => {
    resetAlerts();
    if (!file) {
      setError("Choose a .xlsx or .csv file to import");
      return;
    }
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }); // [{name, phone, email, kra_pin, address}, ...]

      if (!rows.length) {
        setError("No rows found in file");
        return;
      }

      let ok = 0, fail = 0;
      for (const r of rows) {
        const payload = {
          name: r.name || r.Name || r.NAME || "",
          phone: r.phone || r.Phone || r.PHONE || null,
          email: r.email || r.Email || r.EMAIL || null,
          pin:
            r.pin ||
            r.PIN ||
            r.kra_pin ||
            r.KRA_PIN ||
            r.KRA ||
            r.kra ||
            null,
          address: r.address || r.Address || r.ADDRESS || null,
        };
        if (!payload.name) { fail++; continue; }

        try {
          await axios.post(SUPPLIERS_ENDPOINT, payload);
          ok++;
        } catch (e) {
          console.error("Import row failed:", payload, e?.response?.data || e);
          fail++;
        }
      }
      setSuccess(`Import complete: ${ok} added, ${fail} failed`);
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      setError("Failed to import file");
    }
  };

  const show = (v) =>
    v === null || v === undefined
      ? "–"
      : Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const formatAmount = (num, decimals = 1) => {
    return Number(num).toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="px-4 py-3 w-full">
      <h1 className="text-2xl font-semibold mb-4">Suppliers</h1>

      {/* HEADER CONTROLS */}
      <div className="mb-3 flex items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <button className="px-2.5 py-1.5 text-xs rounded border hover:bg-gray-50" onClick={downloadTemplate}>
            Download Template
          </button>
          <button className="px-2.5 py-1.5 text-xs rounded border hover:bg-gray-50" onClick={exportSuppliers}>
            Export to Excel
          </button>
          <label className="px-2.5 py-1.5 text-xs rounded border cursor-pointer hover:bg-gray-50">
            Choose File
            <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          <button
            className="px-3 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700"
            onClick={handleImport}
          >
            Import
          </button>
        </div>
        {/* search on far right */}
        <input
          type="text"
          placeholder="Search suppliers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[320px] max-w-full border rounded px-3 py-2"
        />
      </div>

      {success && <div className="mb-3 p-3 rounded bg-green-100 text-green-800">{success}</div>}
      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800">{error}</div>}

      {/* ADD/EDIT SUPPLIER FORM */}
      <div className="mb-4 border rounded-lg p-3 bg-white">
        <form id="supplier-create" onSubmit={editingId ? handleUpdate : handleAddSupplier}>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Name *</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.name}
                     onChange={e=>setForm({...form, name:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Contact Person</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.contact_person}
                     onChange={e=>setForm({...form, contact_person:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Phone</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.phone}
                     onChange={e=>setForm({...form, phone:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Email</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.email}
                     onChange={e=>setForm({...form, email:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">KRA PIN</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.pin}
                     onChange={e=>setForm({...form, pin:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-8">
              <label className="block text-xs mb-0.5">Address</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.address}
                     onChange={e=>setForm({...form, address:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Bank Name</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.bank_name}
                     onChange={e=>setForm({...form, bank_name:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Bank Branch</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.bank_branch}
                     onChange={e=>setForm({...form, bank_branch:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Bank Account Number</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.bank_account_number}
                     onChange={e=>setForm({...form, bank_account_number:e.target.value})} />
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs mb-0.5">Bank Branch Code</label>
              <input className="w-full border rounded px-2.5 py-1.5 text-sm" value={form.bank_branch_code}
                     onChange={e=>setForm({...form, bank_branch_code:e.target.value})} />
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700">
              {editingId ? "Update Supplier" : "Add Supplier"}
            </button>
            <button type="button" onClick={resetForm}
                    className="px-3 py-1.5 rounded border hover:bg-gray-50">
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* SUPPLIER LIST */}
      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium">Supplier List</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <colgroup>
              <col className="w-[9rem]" />   {/* Actions */}
              <col className="w-[14rem]" />  {/* Supplier Code/Number */}
              <col className="w-[16rem]" />  {/* KRA PIN */}
              <col className="w-[24rem]" />  {/* Name */}
              <col className="w-[14rem]" />  {/* Payable Balance */}
            </colgroup>
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Actions</th>
                <th className="text-left font-semibold px-4 py-2">Supplier Code</th>
                <th className="text-left font-semibold px-4 py-2">KRA PIN</th>
                <th className="text-left font-semibold px-4 py-2">Name</th>
                <th className="text-left font-semibold px-4 py-2">Payable Balance</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-500">
                    No suppliers found.
                  </td>
                </tr>
              )}
              {filtered.map((s) => (
                <tr key={s.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 align-top">
                    <div className="flex gap-2">
                      <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                              onClick={() => setViewing(s)}>View</button>
                      <button className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                              onClick={() => handleEditLoad(s)}>Edit</button>
                      <button className="px-2 py-1 border rounded text-xs text-red-600 hover:bg-red-50"
                              onClick={() => handleDelete(s.id)}>Delete</button>
                    </div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    {s.supplier_code || s.supplier_number || "-"}
                  </td>
                  <td className="px-4 py-2 align-top">
                    {s.pin || "-"}
                  </td>
                  <td className="px-4 py-2 align-top">
                    <div className="font-medium">{s.name}</div>
                  </td>
                  <td className="px-4 py-2 align-top">
                    <button
                      className="text-blue-600 underline"
                      onClick={() => handleShowDetails(s)}
                    >
                      {typeof s.payable_balance === "number" ? s.payable_balance.toLocaleString() : "-"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* optional footer / pagination area */}
        {/* <div className="px-4 py-2 bg-gray-50">…</div> */}
      </div>

      {/* View Modal */}
      {viewing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Supplier Details</h3>
              <button className="px-2 py-1 border rounded" onClick={() => setViewing(null)}>Close</button>
            </div>
            <div className="space-y-2 text-sm">
              <div><span className="font-semibold">Name:</span> {viewing.name}</div>
              <div><span className="font-semibold">Phone:</span> {viewing.phone || "-"}</div>
              <div><span className="font-semibold">Email:</span> {viewing.email || "-"}</div>
              <div><span className="font-semibold">KRA PIN:</span> {viewing.pin || "-"}</div>
              <div><span className="font-semibold">Address:</span> {viewing.address || "-"}</div>
              <div><span className="font-semibold">ID:</span> {viewing.id}</div>
              <div><span className="font-semibold">Contact Person:</span> {viewing.contact_person || "-"}</div>
              <div><span className="font-semibold">Bank Name:</span> {viewing.bank_name || "-"}</div>
              <div><span className="font-semibold">Bank Branch:</span> {viewing.bank_branch || "-"}</div>
              <div><span className="font-semibold">Bank Account Number:</span> {viewing.bank_account_number || "-"}</div>
              <div><span className="font-semibold">Bank Branch Code:</span> {viewing.bank_branch_code || "-"}</div>
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailsModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">
                {detailsModal.supplier.name} — Invoices & Payments
              </h3>
              <button className="px-2 py-1 border rounded" onClick={() => setDetailsModal({ open: false })}>Close</button>
            </div>
            <div style={{ maxHeight: "70vh", overflowY: "auto" }}>
              <h4 className="font-bold mb-2">Invoices</h4>
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reference</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detailsModal.invoices.map(inv => (
                    <tr key={inv.id}>
                      <td>{inv.date ? inv.date : "-"}</td>
                      <td>{inv.reference}</td>
                      <td>{Number(inv.total).toLocaleString()}</td>
                      <td>{inv.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4 className="font-bold mb-2">Payments</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {detailsModal.payments.map(pay => (
                    <tr key={pay.id}>
                      <td>{pay.payment_date}</td>
                      <td>{Number(pay.amount).toLocaleString()}</td>
                      <td>{pay.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 border-t pt-3 font-semibold text-sm">
              Totals — Invoiced: {Number(detailsModal.supplier?.total_invoiced || 0).toLocaleString()} &nbsp;|&nbsp;
              Paid: {Number(detailsModal.supplier?.total_paid || 0).toLocaleString()} &nbsp;|&nbsp;
              <span>Balance Due: {Number(detailsModal.supplier?.payable_balance || 0).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Totals Footer */}
      <div id="supplierModalTotals" className="mt-4 border-t pt-3 font-semibold text-sm">
        {/* Totals will be rendered here */}
      </div>
    </div>
  );
};

export default Suppliers;

async function handleEditSupplier(supplierId, updatedFields) {
  try {
    const res = await axios.put(
      `${API_BASE}/suppliers/${supplierId}`,
      updatedFields
    );
    alert("Supplier updated!");
    // Optionally refresh supplier list or close modal
  } catch (err) {
    alert("Failed to update supplier");
    console.error(err);
  }
}

// Example usage in a form submit handler:
const onSubmit = (e) => {
  e.preventDefault();
  handleEditSupplier(selectedSupplier.id, {
    name: form.name,
    contact_person: form.contact_person,
    phone: form.phone,
    email: form.email,
    address: form.address,
    bank_name: form.bank_name,
    bank_branch: form.bank_branch,
    bank_account_number: form.bank_account_number,
    bank_branch_code: form.bank_branch_code,
    // Only include fields that changed or are present
  });
};



