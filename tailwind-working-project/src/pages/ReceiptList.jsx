// src/pages/ReceiptList.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";

const API_BASE = "http://127.0.0.1:8000";
const RECEIPTS_ENDPOINT = `${API_BASE}/receipts/`;
const RECEIPTS_EXPORT = `${API_BASE}/receipts/export/`;
const RECEIPTS_IMPORT = `${API_BASE}/receipts/import/`;
const RECEIPTS_BATCH_DELETE = `${API_BASE}/receipts/batch_delete`;
const ACCOUNTS_ENDPOINT = `${API_BASE}/accounts/`;
const INVOICES_ENDPOINT = `${API_BASE}/invoices/?status=Posted`;

// --- Robust bank-like classifier ---
const isBankLike = (a) => {
  const t = (a?.type || "").toLowerCase();
  const c = (a?.category || "").toLowerCase();
  const s = (a?.sub_category || "").toLowerCase();
  const n = (a?.name || "").toLowerCase();
  return (
    t === "bank" || c === "bank" ||
    s.includes("bank") || s.includes("cash") || s.includes("mpesa") || s.includes("paybill") || s.includes("wallet") ||
    n.includes("bank") || n.includes("mpesa") || n.includes("cash") || n.includes("paybill")
  );
};

export default function ReceiptList() {
  // Data
  const [receipts, setReceipts] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);

  // UI state
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterBank, setFilterBank] = useState("");
  const [sortDir, setSortDir] = useState("asc"); // asc = Oldest first
  const [selectedCustomer, setSelectedCustomer] = useState("");

  // Messages
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  // Form
  const [form, setForm] = useState({
    amount: "",
    date: "",
    reference: "",
    narration: "",
    bank_account_id: "",
    account_id: "",
    invoice_id: "",
  });

  // ---------- Loaders ----------
  useEffect(() => {
    fetchReceipts();
    fetchAccounts();
    fetchCustomers();
    fetchInvoices();
  }, []);

  async function fetchReceipts() {
    try {
      const res = await axios.get(RECEIPTS_ENDPOINT);
      setReceipts(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setReceipts([]);
      console.error("fetchReceipts failed:", e);
    }
  }

  async function fetchAccounts() {
    try {
      const res = await axios.get(ACCOUNTS_ENDPOINT);
      const list = Array.isArray(res.data) ? res.data : [];
      setAllAccounts(list);
      setBankAccounts(list.filter(isBankLike));
    } catch (e) {
      setAllAccounts([]);
      setBankAccounts([]);
      console.error("fetchAccounts failed:", e);
    }
  }

  async function fetchCustomers() {
    try {
      const r = await axios.get(`${API_BASE}/customers/`);
      setCustomers(Array.isArray(r.data) ? r.data : []);
    } catch {
      setCustomers([]);
    }
  }

  async function fetchInvoices() {
    try {
      // If your backend supports it, this will come filtered; otherwise we’ll filter in UI
      const r = await axios.get(`${API_BASE}/invoices/?status=Unpaid`);
      setInvoices(Array.isArray(r.data) ? r.data : []);
    } catch {
      setInvoices([]);
    }
  }

  // ---------- Create/Update ----------
  async function handleSubmit(e) {
    e.preventDefault();
    setSuccess("");
    setError("");

    try {
      const payload = {
        ...form,
        amount: Number(form.amount || 0),
        bank_account_id: Number(form.bank_account_id) || undefined,
        account_id: form.account_id ? Number(form.account_id) : undefined,
      };

      if (editing) {
        await axios.put(`${RECEIPTS_ENDPOINT}${editing.id}`, payload);
        setSuccess("Receipt updated.");
      } else {
        await axios.post(RECEIPTS_ENDPOINT, payload);
        setSuccess("Receipt created.");
      }

      setForm({
        amount: "",
        date: "",
        reference: "",
        narration: "",
        bank_account_id: "",
        account_id: "",
        invoice_id: "",
      });
      setEditing(null);
      setShowForm(false);
      fetchReceipts();
    } catch (err) {
      console.error("save receipt error:", err);
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to save receipt.";
      setError(String(msg));
    }
  }

  // ---------- Edit ----------
  function handleEdit(r) {
    setEditing(r);
    setForm({
      amount: r.amount ?? "",
      date: r.date ?? "",
      reference: r.reference ?? "",
      narration: r.narration ?? "",
      bank_account_id: r.bank_account_id ?? "",
      account_id: r.account_id ?? "",
      invoice_id: r.invoice_id ?? "",
    });
    setShowForm(true);
  }

  // ---------- Batch Delete ----------
  async function handleBatchDelete() {
    if (!selected.length) return;
    if (!window.confirm("Delete selected receipts?")) return;
    try {
      await axios.post(RECEIPTS_BATCH_DELETE, { ids: selected });
      setSelected([]);
      fetchReceipts();
    } catch (e) {
      console.error("batch delete failed:", e);
      alert("Batch delete failed.");
    }
  }

  // ---------- Import/Export ----------
  async function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post(RECEIPTS_IMPORT, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      fetchReceipts();
      alert("Import complete.");
    } catch (e) {
      console.error("import failed:", e);
      alert("Import failed.");
    }
  }

  async function handleExport() {
    try {
      const res = await axios.get(RECEIPTS_EXPORT, { responseType: "blob" });
      saveAs(res.data, "receipts.csv");
    } catch (e) {
      console.error("export failed:", e);
      alert("Export failed.");
    }
  }

  // --- Place these after your state declarations, before your render ---

  const arAccount = useMemo(() => {
    return allAccounts.find(a => {
      const fields = [
        (a?.name || ""), (a?.category || ""), (a?.sub_category || ""), (a?.type || "")
      ].join(" ").toLowerCase();
      return (
        fields.includes("receivable") || fields.includes("debtors") ||
        fields.includes("trade receivable") || fields.includes("customer")
      );
    });
  }, [allAccounts]);

  const isInvoiceUnpaid = (inv) => {
    const s = (inv?.status || "").toLowerCase();
    const bal = Number(
      inv?.balance_due ?? inv?.amount_due ?? inv?.balance ?? (inv?.total ?? inv?.amount ?? 0) - (inv?.amount_paid ?? 0)
    );
    return s !== "paid" && s !== "cancelled" && bal > 0;
  };

  const customerInvoices = useMemo(() => {
    const custId = Number(selectedCustomer || 0);
    return invoices
      .filter(inv => isInvoiceUnpaid(inv) && (!custId || Number(inv.customer_id) === custId));
  }, [invoices, selectedCustomer]);

  // ---------- Derived / Filtering / Sorting ----------
  const bankMap = useMemo(() => {
    const m = new Map();
    bankAccounts.forEach((b) => m.set(b.id, b));
    return m;
  }, [bankAccounts]);

  const accountsMap = useMemo(() => {
    const m = new Map();
    allAccounts.forEach(a => m.set(Number(a.id), a));
    return m;
  }, [allAccounts]);

  const normalizedFilterBank = filterBank ? Number(filterBank) : "";

  const filteredInvoices = useMemo(() => {
    if (!selectedCustomer) return invoices;
    return invoices.filter((inv) => String(inv.customer_id) === String(selectedCustomer));
  }, [invoices, selectedCustomer]);

  const filtered = useMemo(() => {
    const q = (search || "").toLowerCase().trim();
    let list = receipts.filter((r) => {
      const matchQ =
        !q ||
        r?.reference?.toLowerCase()?.includes(q) ||
        r?.narration?.toLowerCase()?.includes(q);
      const matchBank =
        !normalizedFilterBank || r?.bank_account_id === normalizedFilterBank;
      return matchQ && matchBank;
    });

    list.sort((a, b) => {
      const da = new Date(a.date || "").getTime() || 0;
      const db = new Date(b.date || "").getTime() || 0;
      return sortDir === "asc" ? da - db : db - da;
    });

    return list;
  }, [receipts, search, normalizedFilterBank, sortDir]);

  const allChecked =
    filtered.length > 0 && selected.length === filtered.length;

  // ---------- Render ----------
  return (
    <div className="p-6 w-full">
      <h2 className="text-2xl font-semibold mb-5">Receipt List</h2>

      {/* Controls row */}
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <input
          className="border rounded px-3 py-2 text-sm min-w-[260px]"
          placeholder="Search by Reference or Narration"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          className="px-3 py-2 rounded bg-gray-900 text-white hover:bg-gray-800"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
        >
          {sortDir === "asc" ? "Sort by Date (Oldest)" : "Sort by Date (Newest)"}
        </button>

        <button
          className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700"
          onClick={handleExport}
        >
          Export CSV
        </button>

        <select
          className="border rounded px-3 py-2 text-sm"
          value={filterBank}
          onChange={(e) => setFilterBank(e.target.value)}
        >
          <option value="">All Banks</option>
          {bankAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>

        <label className="px-3 py-2 rounded border cursor-pointer hover:bg-gray-50">
          Import CSV
          <input type="file" className="hidden" accept=".csv" onChange={handleImport} />
        </label>

        <button
          className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => {
            setShowForm(true);
            setEditing(null);
            setForm({
              amount: "",
              date: "",
              reference: "",
              narration: "",
              bank_account_id: "",
              account_id: "",
              invoice_id: "",
            });
          }}
        >
          + New Receipt
        </button>

        <button
          className="px-3 py-2 rounded border hover:bg-gray-50"
          onClick={handleBatchDelete}
          disabled={!selected.length}
        >
          Delete Selected ({selected.length})
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 bg-white p-4 rounded shadow space-y-4"
        >
          {/* Row 1: Customer + Invoice + Amount + Date */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs mb-1">Customer</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={selectedCustomer}
                onChange={(e) => { 
                  setSelectedCustomer(e.target.value);
                  setForm(f => ({ ...f, invoice_id: "" }));
                }}
              >
                <option value="">All / Select Customer</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Invoice</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.invoice_id || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const inv = customerInvoices.find(i => String(i.id) === id || String(i.invoice_number) === id);
                  setForm(f => ({
                    ...f,
                    invoice_id: id,
                    amount: inv ? (inv.balance_due ?? inv.amount_due ?? inv.amount) : f.amount,
                    account_id: arAccount?.id ?? f.account_id
                  }));
                }}
                disabled={!selectedCustomer}
              >
                <option value="">{selectedCustomer ? "Select Unpaid Invoice" : "Select Customer first"}</option>
                {customerInvoices.map(inv => {
                  const due = inv.balance_due ?? inv.amount_due ?? inv.amount;
                  return (
                    <option key={inv.id} value={inv.id}>
                      {inv.invoice_number ?? inv.id} — Due KSh {Number(due).toLocaleString()}
                    </option>
                  );
                })}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Amount</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                type="number" step="0.01"
                value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block text-xs mb-1">Date</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                type="date"
                value={form.date}
                onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                required
              />
            </div>
          </div>

          {/* Row 2: Reference + Narration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs mb-1">Reference</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.reference}
                onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs mb-1">Narration</label>
              <input
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.narration}
                onChange={(e) => setForm(f => ({ ...f, narration: e.target.value }))}
              />
            </div>
          </div>

          {/* Row 3: Bank/Cash (Received in) + Account (COA) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs mb-1">Bank/Cash (Received in)</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.bank_account_id}
                onChange={(e) => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                required
              >
                <option value="">Select Bank/Cash</option>
                {allAccounts.filter(isBankLike).map(b => (
                  <option key={b.id} value={b.id}>{b.account_code} — {b.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs mb-1">Account (COA)</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.account_id || ""}
                onChange={(e) => setForm(f => ({ ...f, account_id: e.target.value }))}
              >
                <option value="">Suspense / Uncategorized</option>
                <optgroup label="Bank & Cash (choose to record transfer)">
                  {allAccounts.filter(isBankLike).map(a => (
                    <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Chart of Accounts">
                  {allAccounts.filter(a => !isBankLike(a)).map(a => (
                    <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
                  ))}
                </optgroup>
              </select>
              {/* Small hint when they choose another bank */}
              {(() => {
                const acct = accountsMap.get(Number(form.account_id));
                const toBank = isBankLike(acct || {});
                const isTransfer = toBank && String(form.account_id) !== String(form.bank_account_id);
                return isTransfer ? (
                  <p className="text-xs text-blue-600 mt-1">This will record an inter-account transfer.</p>
                ) : null;
              })()}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="px-3 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
            >
              {editing ? "Update" : "Create"}
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded border hover:bg-gray-50"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
            >
              Cancel
            </button>
          </div>

          {success && <div className="text-green-600">{success}</div>}
          {error && <div className="text-red-600">{error}</div>}
        </form>
      )}

      {/* Table */}
      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2 text-center">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={(e) =>
                  setSelected(e.target.checked ? filtered.map((r) => r.id) : [])
                }
              />
            </th>
            <th className="border p-2">Date</th>
            <th className="border p-2">Reference</th>
            <th className="border p-2">Narration</th>
            <th className="border p-2">Customer</th>
            <th className="border p-2 text-right">Amount</th>
            <th className="border p-2">Bank</th>
            <th className="border p-2">Counter / From</th> {/* <-- Add this */}
            <th className="border p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="border p-4 text-center text-gray-500">
                No receipts found.
              </td>
            </tr>
          )}
          {filtered.map((r) => (
            <tr key={r.id}>
              <td className="border p-2 text-center">
                <input
                  type="checkbox"
                  checked={selected.includes(r.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, r.id]
                        : selected.filter((id) => id !== r.id)
                    )
                  }
                />
              </td>
              <td className="border p-2">{r.date}</td>
              <td className="border p-2">{r.reference}</td>
              <td className="border p-2">{r.narration}</td>
              <td className="border p-2">{r.customer_name ?? ""}</td>
              <td className="border p-2 text-right">
                {Number(r.amount || 0).toLocaleString()}
              </td>
              <td className="border p-2">
                {bankMap.get(r.bank_account_id)?.name ?? ""}
              </td>
              <td className="border p-2">
                {r.counter_account_name ?? ""}
              </td>
              <td className="border p-2">
                <button
                  className="px-2 py-1 text-xs border rounded mr-1"
                  onClick={() => handleEdit(r)}
                >
                  Edit
                </button>
                <button
                  className="px-2 py-1 text-xs border rounded text-red-600"
                  onClick={() => {
                    setSelected([r.id]);
                    handleBatchDelete();
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}