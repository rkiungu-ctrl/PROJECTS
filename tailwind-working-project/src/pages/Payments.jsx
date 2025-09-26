import React, { useEffect, useState, useMemo } from "react";
import axios from "axios";
import { saveAs } from "file-saver";

const API_BASE = "http://127.0.0.1:8000";
const PAYMENTS_ENDPOINT = `${API_BASE}/payments/`;
const PAYMENTS_EXPORT = `${API_BASE}/payments/export/`; // implement in backend
const PAYMENTS_IMPORT = `${API_BASE}/payments/import/`; // implement in backend
const PAYMENTS_BATCH_DELETE = `${API_BASE}/payments/batch_delete`; // implement in backend
const ACCOUNTS_ENDPOINT = `${API_BASE}/accounts/`;

export default function PaymentList() {
  const [payments, setPayments] = useState([]);
  const [allAccounts, setAllAccounts] = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterBank, setFilterBank] = useState("");
  const [sortDir, setSortDir] = useState("asc");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    amount: "",
    date: "",
    reference: "",
    narration: "",
    bank_account_id: "",
    supplier_id: "",
  });
  const [payeeType, setPayeeType] = useState("Supplier");
  const [suppliers, setSuppliers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staff, setStaff] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [otherPayee, setOtherPayee] = useState("");
  const [staffId, setStaffId] = useState("");
  const [bankCharge, setBankCharge] = useState({ account_id: "", amount: "" });
  const [lines, setLines] = useState([{ purchase_id: "", amount_applied: "" }]);
  const [invoices, setInvoices] = useState([]);

  useEffect(() => {
    fetchPayments();
    fetchAccounts();
    axios.get(`${API_BASE}/suppliers/`).then((r) => setSuppliers(r.data || []));
    axios.get(`${API_BASE}/payments/staff`).then((r) => setStaff(r.data || []));
  }, []);

  useEffect(() => {
    if (payeeType === "Customer") {
      axios.get(`${API_BASE}/customers/`).then((r) => setCustomers(r.data || []));
    }
  }, [payeeType]);

  // Fetch invoices when supplier changes
  useEffect(() => {
    if (supplierId) {
      axios.get(`${API_BASE}/suppliers/by_supplier/${supplierId}`)
        .then(r => setInvoices(r.data || []))
        .catch(() => setInvoices([]));
    } else {
      setInvoices([]);
    }
  }, [supplierId]);

  async function fetchPayments() {
    try {
      const res = await axios.get(PAYMENTS_ENDPOINT);
      setPayments(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setPayments([]);
      console.error("fetchPayments failed:", e);
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

  // ---------- Create/Update ----------
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");
    try {
      const payload = {
        ...form,
        payee_type: payeeType,
        supplier_id: payeeType === "Supplier" ? supplierId : undefined,
        customer_id: payeeType === "Customer" ? customerId : undefined,
        other_payee: payeeType === "Other" ? otherPayee : undefined,
        staff_id: staffId || undefined,
        lines: lines.map(l => ({
          purchase_id: l.purchase_id ? Number(l.purchase_id) : null,
          amount_applied: Number(l.amount_applied || 0)
        })),
        bank_charge: {
          account_id: bankCharge.account_id ? Number(bankCharge.account_id) : null,
          amount: Number(bankCharge.amount || 0)
        },
        amount: lines.reduce((sum, l) => sum + Number(l.amount_applied || 0), 0),
        bank_account_id: form.bank_account_id === "employee_claim" ? "employee_claim" : Number(form.bank_account_id) || undefined,
      };
      if (editing) {
        await axios.put(`${PAYMENTS_ENDPOINT}${editing.id}`, payload);
        setSuccess("Payment updated.");
      } else {
        await axios.post(PAYMENTS_ENDPOINT, payload);
        setSuccess("Payment created.");
      }
      setForm({
        amount: "",
        date: "",
        reference: "",
        narration: "",
        bank_account_id: "",
        supplier_id: "",
      });
      setEditing(null);
      setShowForm(false);
      fetchPayments();
    } catch (err) {
      console.error("save payment error:", err);
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        "Failed to save payment.";
      setError(String(msg));
    }
  }

  function handleEdit(p) {
    setEditing(p);
    setForm({
      amount: p.amount ?? "",
      date: p.date ?? "",
      reference: p.reference ?? "",
      narration: p.narration ?? "",
      bank_account_id: p.bank_account_id ?? "",
      supplier_id: p.supplier_id ?? "",
    });
    setShowForm(true);
  }

  async function handleBatchDelete() {
    if (!selected.length) return;
    if (!window.confirm("Delete selected payments?")) return;
    try {
      await axios.post(PAYMENTS_BATCH_DELETE, { ids: selected });
      setSelected([]);
      fetchPayments();
    } catch (e) {
      console.error("batch delete failed:", e);
      alert("Batch delete failed.");
    }
  }

  // --- Filtering, sorting, etc. ---
  const bankMap = useMemo(() => {
    const m = new Map();
    bankAccounts.forEach((b) => m.set(b.id, b));
    return m;
  }, [bankAccounts]);

  const filtered = useMemo(() => {
    const q = (search || "").toLowerCase().trim();
    let list = payments.filter((p) => {
      const matchQ =
        !q ||
        p?.reference?.toLowerCase()?.includes(q) ||
        p?.narration?.toLowerCase()?.includes(q);
      const matchBank =
        !filterBank || p?.bank_account_id === Number(filterBank);
      return matchQ && matchBank;
    });
    list.sort((a, b) => {
      const da = new Date(a.date || "").getTime() || 0;
      const db = new Date(b.date || "").getTime() || 0;
      return sortDir === "asc" ? da - db : db - da;
    });
    return list;
  }, [payments, search, filterBank, sortDir]);

  const allChecked =
    filtered.length > 0 && selected.length === filtered.length;

  // Add inside PaymentList component, before return:
  const addLine = () => setLines(prev => [...prev, { purchase_id: "", amount_applied: "" }]);
  const updateLine = (i, k, v) => setLines(prev => prev.map((row, idx) => idx === i ? { ...row, [k]: v } : row));
  const removeLine = (i) => setLines(prev => prev.filter((_, idx) => idx !== i));

  // ---------- Render ----------
  return (
    <div className="p-6 w-full">
      <h2 className="text-2xl font-semibold mb-5">Payment List</h2>

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

        {/* Export/Import/Batch Delete buttons (implement endpoints in backend) */}
        <button
          className="px-3 py-2 rounded bg-green-600 text-white hover:bg-green-700"
          onClick={() => alert("Export not implemented yet")}
        >
          Export CSV
        </button>
        <label className="px-3 py-2 rounded border cursor-pointer hover:bg-gray-50">
          Import CSV
          <input type="file" className="hidden" accept=".csv" onChange={() => alert("Import not implemented yet")} />
        </label>
        <button
          className="px-3 py-2 rounded border hover:bg-gray-50"
          onClick={handleBatchDelete}
          disabled={!selected.length}
        >
          Delete Selected ({selected.length})
        </button>
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
              supplier_id: "",
            });
          }}
        >
          + New Payment
        </button>
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mb-6 bg-white p-4 rounded shadow space-y-4"
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs mb-1">Payee Type</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={payeeType}
                onChange={e => setPayeeType(e.target.value)}
                required
              >
                <option value="Supplier">Supplier</option>
                <option value="Customer">Customer</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {payeeType === "Supplier" && (
              <div>
                <label className="block text-xs mb-1">Supplier</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={supplierId}
                  onChange={e => setSupplierId(e.target.value)}
                  required
                >
                  <option value="">Select supplier</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
            {payeeType === "Customer" && (
              <div>
                <label className="block text-xs mb-1">Customer</label>
                <select
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={customerId}
                  onChange={e => setCustomerId(e.target.value)}
                  required
                >
                  <option value="">Select customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            {payeeType === "Other" && (
              <div>
                <label className="block text-xs mb-1">Other Payee</label>
                <input
                  className="w-full border rounded px-3 py-2 text-sm"
                  value={otherPayee}
                  onChange={e => setOtherPayee(e.target.value)}
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-xs mb-1">Paid by (Staff)</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={staffId}
                onChange={e => setStaffId(e.target.value)}
              >
                <option value="">Select staff</option>
                {staff.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.staff_no})</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs mb-1">Bank/Cash (Paid from)</label>
              <select
                className="w-full border rounded px-3 py-2 text-sm"
                value={form.bank_account_id}
                onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                required
              >
                <option value="">Select Bank/Cash or Employee Claim</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>{b.account_code} — {b.name}</option>
                ))}
                <option value="employee_claim">Employee Claim</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-xs mb-1">Transaction Cost (Bank Charges)</label>
              <div className="flex gap-2">
                <select
                  className="border rounded px-3 py-2 text-sm"
                  value={bankCharge.account_id}
                  onChange={e => setBankCharge(b => ({ ...b, account_id: e.target.value }))}
                >
                  <option value="">Select account</option>
                  {allAccounts.filter(a => a.name.toLowerCase().includes("bank charge")).map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  className="border rounded px-3 py-2 text-sm"
                  placeholder="Amount"
                  value={bankCharge.amount}
                  onChange={e => setBankCharge(b => ({ ...b, amount: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="mt-4">
            <label className="block text-xs mb-1">Payment Lines</label>
            <button type="button" onClick={addLine} className="px-2 py-1 text-xs rounded bg-blue-600 text-white ml-2">
              + Add line
            </button>
            <table className="w-full text-xs border rounded mt-2">
              <thead>
                <tr>
                  <th className="text-left p-2 border">Invoice</th>
                  <th className="text-right p-2 border">Amount applied</th>
                  <th className="p-2 border w-12"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((ln, idx) => (
                  <tr key={idx}>
                    <td className="p-2 border">
                      <select
                        className="w-full border rounded px-2 py-1"
                        value={ln.purchase_id}
                        onChange={e => updateLine(idx, "purchase_id", e.target.value)}
                      >
                        <option value="">Select invoice</option>
                        {Array.isArray(invoices) && invoices.map(inv => (
                          <option key={inv.id} value={inv.id}>
                            {inv.reference || inv.invoice_number || inv.id}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        step="0.01"
                        className="w-full border rounded px-2 py-1 text-right"
                        value={ln.amount_applied}
                        onChange={e => updateLine(idx, "amount_applied", e.target.value)}
                      />
                    </td>
                    <td className="p-2 border text-center">
                      <button type="button" onClick={() => removeLine(idx)} className="px-2 py-1 rounded bg-red-600 text-white">
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  setSelected(e.target.checked ? filtered.map((p) => p.id) : [])
                }
              />
            </th>
            <th className="border p-2">Date</th>
            <th className="border p-2">Reference</th>
            <th className="border p-2">Narration</th>
            <th className="border p-2">Supplier</th>
            <th className="border p-2 text-right">Amount</th>
            <th className="border p-2">Bank</th>
            <th className="border p-2">Source</th>
            <th className="border p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={9} className="border p-4 text-center text-gray-500">
                No payments found.
              </td>
            </tr>
          )}
          {filtered.map((p) => (
            <tr key={p.id}>
              <td className="border p-2 text-center">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, p.id]
                        : selected.filter((id) => id !== p.id)
                    )
                  }
                />
              </td>
              <td className="border p-2">{p.date}</td>
              <td className="border p-2">{p.reference}</td>
              <td className="border p-2">{p.narration}</td>
              <td className="border p-2">{p.supplier_name ?? ""}</td>
              <td className="border p-2 text-right">
                {Number(p.amount || 0).toLocaleString()}
              </td>
              <td className="border p-2">
                {bankMap.get(p.bank_account_id)?.name ?? ""}
              </td>
              <td className="border p-2">
                {p.source === "bank_tx" ? "Bank Withdrawal" : "Supplier Payment"}
              </td>
              <td className="border p-2">
                <button
                  className="px-2 py-1 text-xs border rounded mr-1"
                  onClick={() => handleEdit(p)}
                >
                  Edit
                </button>
                <button
                  className="px-2 py-1 text-xs border rounded text-red-600"
                  onClick={() => {
                    setSelected([p.id]);
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