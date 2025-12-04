import React, { useEffect, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PurchaseTotals from "./PurchaseTotals";
/*
  NOTE: Only use /purchases/purchase-invoices endpoint for fetching purchases.
  Removed fallback to /purchases/purchase_invoices/.
*/
const API_BASE = "http://127.0.0.1:8000";
const PAGE_SIZE = 25;

// --- Helpers ---
function formatAmount(num, decimals = 1) {
  return Number(num || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const unwrap = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (payload?.items) return payload.items;
  if (payload?.results) return payload.results;
  if (payload?.data) return payload.data;
  return [];
};

const normalizeTax = (t) => {
  const rawType = (t.type || t.tax_type || "").toString().toUpperCase();
  const type = rawType === "EXCISE" ? "EXCISE" : rawType === "VAT" ? "VAT" : rawType;
  // Prefer explicit code; fall back on id/label/name
  const code = t.code ?? t.account_code ?? t.name ?? t.label ?? (t.id != null ? String(t.id) : "");
  let rate = t.rate;
  if (typeof rate === "string") {
    const m = rate.trim().match(/^(\d+(\.\d+)?)%$/);
    rate = m ? parseFloat(m[1]) / 100 : parseFloat(rate);
  }
  if (typeof rate !== "number" || Number.isNaN(rate)) rate = 0;
  const label = t.label || t.name || code;

  return {
    id: t.id,
    type,
    code: String(code),
    rate,
    account_code: String(t.account_code || ""),
    label,
  };
};

const hasLines = (inv) => Array.isArray(inv.lines) && inv.lines.length > 0;

const Purchases = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { id } = useParams();

  const params = new URLSearchParams(location.search);
  const initialSearch = params.get("search") || "";
  const [search, setSearch] = useState(initialSearch);

  const [purchases, setPurchases] = useState([]);
  const [loadingPurchases, setLoadingPurchases] = useState(false);

  const [page, setPage] = useState(1);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewPurchase, setViewPurchase] = useState(null);
  const [company, setCompany] = useState({});
  const [taxOptions, setTaxOptions] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState("USD");
  const [products, setProducts] = useState([]);

  // --- Fetch company, products, taxes ---
  useEffect(() => {
    Promise.all([
      axios.get(`${API_BASE}/company/profile`).catch(() => ({ data: {} })),
      axios.get(`${API_BASE}/products/`).catch(() => ({ data: [] })),
      axios.get(`${API_BASE}/taxes/`).catch(() => ({ data: [] })), // <— important: NOT /purchases/taxes/
    ]).then(([companyRes, prodRes, taxesRes]) => {
      const data = companyRes.data || {};
      setCompany(data);
      if (data && data.currency) setBaseCurrency(data.currency);
      setProducts(prodRes.data || []);

      const items = Array.isArray(taxesRes.data) ? taxesRes.data : [];
      const normalized = items.map(normalizeTax).filter((x) => x.type && x.code);
      setTaxOptions(normalized);
    });
  }, []);

  // --- Fetch purchases ---
  useEffect(() => {
    const fetchPurchases = async () => {
      setLoadingPurchases(true);
      try {
        let res = await axios.get(`${API_BASE}/purchases/purchase-invoices`);
        let list = unwrap(res.data);
        if (!Array.isArray(list) || !list.length) {
          try {
            const fallback = await axios.get(`${API_BASE}/purchases/purchase_invoices/`);
            list = unwrap(fallback.data);
          } catch { /* ignore fallback error */ }
        }
        setPurchases(Array.isArray(list) ? list : []);
        // Optionally: console.log("Purchases loaded:", list.length, list[0]);
      } catch (err) {
        // Optionally: console.error("Failed to fetch purchases:", err?.response?.status, err?.response?.data || err?.message);
        setPurchases([]);
      } finally {
        setLoadingPurchases(false);
      }
    };
    fetchPurchases();
  }, [location.pathname]);

  // --- Tax and invoice helpers ---
  function findTaxRate(code, type) {
    if (!code || !taxOptions.length) return 0;
    const T = (type || "").toUpperCase();
    return (
      taxOptions.find(
        (t) =>
          (t.type || "").toUpperCase() === T &&
          (String(t.id) === String(code) || t.code === code || t.label === code || t.account_code === code)
      )?.rate || 0
    );
  }

  const calcSubTotal = (inv) =>
    hasLines(inv)
      ? inv.lines.reduce((s, ln) => s + (Number(ln.quantity) || 0) * (Number(ln.unit_price) || 0), 0)
      : 0;

  const calcExcise = (inv) =>
    hasLines(inv)
      ? inv.lines.reduce((s, ln) => {
          const base = (Number(ln.quantity) || 0) * (Number(ln.unit_price) || 0);
          const exciseRate = findTaxRate(ln.excise_code, "Excise");
          return s + base * exciseRate;
        }, 0)
      : 0;

  const calcVAT = (inv) =>
    hasLines(inv)
      ? inv.lines.reduce((s, ln) => {
          const base = (Number(ln.quantity) || 0) * (Number(ln.unit_price) || 0);
          const exciseRate = findTaxRate(ln.excise_code, "Excise");
          const exciseAmount = base * exciseRate;
          const vatRate = findTaxRate(ln.vat_code, "VAT");
          return s + (base + exciseAmount) * vatRate;
        }, 0)
      : 0;

  const calcInvoiceTotal = (inv) => {
    if (hasLines(inv)) return calcSubTotal(inv) + calcExcise(inv) + calcVAT(inv);
    return Number(inv.total) || 0;
  };

  // --- Filtering, sorting, and pagination ---
  const filteredPurchases = !search
    ? purchases
    : purchases.filter((inv) => {
        const supplier = (inv.supplier_name ?? inv.supplier?.name ?? "").toLowerCase();
        const ref = String(inv.reference ?? "").toLowerCase();
        const q = search.toLowerCase();
        return supplier.includes(q) || ref.includes(q);
      });

  // Sort by invoice_date desc
  const sortedPurchases = filteredPurchases.sort(
    (a, b) => new Date(b.invoice_date) - new Date(a.invoice_date)
  );

  const paginatedPurchases = sortedPurchases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleSearchChange(e) {
    setSearch(e.target.value);
    navigate(`/purchases?search=${encodeURIComponent(e.target.value)}`);
  }

  function afterAction() {
    navigate(`/purchases?search=${encodeURIComponent(search)}`);
  }

  // --- Batch actions ---
  async function handleBatchDelete() {
    if (selectedIds.length === 0) return;
    try {
      const res = await axios.post(`${API_BASE}/purchases/batch_delete`, selectedIds);
      alert(`Deleted ${res.data.deleted} invoices`);
      afterAction();
    } catch (err) {
      alert("Batch delete failed");
    }
  }

  async function handleBatchPost() {
    if (selectedIds.length === 0) return;
    try {
      const res = await axios.post(`${API_BASE}/purchases/batch_post`, selectedIds);
      alert(`Posted ${res.data.posted} invoices`);
      afterAction();
    } catch (err) {
      alert("Batch post failed");
    }
  }

  async function handleCopy(invoiceId) {
    try {
      const res = await axios.post(`${API_BASE}/purchases/${invoiceId}/copy`);
      if (res.data && res.data.new_invoice_id) {
        navigate(`/purchases/${res.data.new_invoice_id}/edit`);
      } else {
        alert("Could not copy invoice");
      }
    } catch {
      alert("Could not copy invoice");
    }
  }

  const currencyPrefix = (code) => (code === "KES" ? "Ksh " : code === "USD" ? "$ " : (code || "") + " ");

  return (
    <div className="p-4 w-full">
      <h2 className="text-xl font-semibold mb-2">Purchase Invoices</h2>

      <div className="flex justify-end mb-4">
        <button
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          onClick={() => navigate("/purchase/new")}
        >
          + New Purchase Invoice
        </button>
      </div>

      <div className="overflow-x-auto border rounded">
        {/* Top bar */}
        <div className="flex flex-wrap items-center gap-2 p-3 border-b bg-gray-50">
          <input
            type="text"
            id="search-bar"
            placeholder="Search invoices."
            className="border rounded px-2 py-1 text-sm w-48"
            value={search}
            onChange={handleSearchChange}
          />
          <button
            onClick={() => setSearch("")}
            className="ml-2 px-2 py-1 rounded border bg-gray-200 text-gray-800 text-sm"
          >
            Clear
          </button>

          <button
            onClick={handleBatchDelete}
            className="px-3 py-1 rounded border bg-red-100 text-red-800 hover:bg-red-200 text-sm"
            disabled={selectedIds.length === 0}
          >
            Batch Delete
          </button>

          <button
            onClick={handleBatchPost}
            className="px-3 py-1 rounded border bg-purple-100 text-purple-800 hover:bg-purple-200 text-sm"
            disabled={selectedIds.length === 0}
          >
            Batch Post
          </button>

          <button
            id="import-btn"
            className="px-3 py-1 rounded border bg-green-100 text-green-800 hover:bg-green-200 text-sm"
            onClick={() => alert("Import not wired yet")}
          >
            Import
          </button>

          <button
            id="export-btn"
            className="px-3 py-1 rounded border bg-blue-100 text-blue-800 hover:bg-blue-200 text-sm"
            onClick={() => alert("Export not wired yet")}
          >
            Export
          </button>

          <button
            id="download-template-btn"
            className="px-3 py-1 rounded border bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm"
            onClick={() => alert("Template download not wired yet")}
          >
            Download Template
          </button>

          <button
            className="px-3 py-1 rounded border bg-purple-100 text-purple-800 text-sm"
            onClick={() => navigate("/purchases/recurring")}
          >
            Pending Recurring Invoices
          </button>
        </div>

        {/* Table */}
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 w-8"></th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Supplier</th>
              <th className="p-2 text-left">Reference</th>
              <th className="p-2 text-left">CU INV Number</th>
              <th className="p-2 text-right">Sub-total</th>
              <th className="p-2 text-right">Excise</th>
              <th className="p-2 text-right">VAT</th>
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Balance Due</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-1 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loadingPurchases ? (
              <tr>
                <td colSpan={12} className="p-4 text-center">Loading...</td>
              </tr>
            ) : filteredPurchases.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-4 text-center">No purchases found.</td>
              </tr>
            ) : (
              paginatedPurchases.map((p) => {
                const sub = calcSubTotal(p);
                const exc = calcExcise(p);
                const vat = calcVAT(p);
                const total = sub + exc + vat;
                const balanceDue = total - (Number(p.amount_paid) || 0);
                const prefix = currencyPrefix(p.currency_code);

                return (
                  <tr key={p.id} className="border-t">
                    <td className="p-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedIds([...selectedIds, p.id]);
                          else setSelectedIds(selectedIds.filter((x) => x !== p.id));
                        }}
                      />
                    </td>
                    <td className="p-2">{p.invoice_date}</td>
                    <td className="p-2">{p.supplier_name || p.supplier?.name}</td>
                    <td className="p-2">{p.reference}</td>
                    <td className="p-2">{p.cu_inv_number || ""}</td>
                    <td className="p-2 text-right">{prefix}{formatAmount(sub, 1)}</td>
                    <td className="p-2 text-right">{prefix}{formatAmount(exc, 1)}</td>
                    <td className="p-2 text-right">{prefix}{formatAmount(vat, 1)}</td>
                    <td className="p-2 text-right">{prefix}{formatAmount(total, 1)}</td>
                    <td className="p-2 text-right">{prefix}{formatAmount(balanceDue, 1)}</td>
                    <td className="p-2">{p.status || "Draft"}</td>
                    <td className="p-2 whitespace-nowrap w-40 flex gap-1 items-center">
                      <button
                        className="bg-gray-700 px-2 py-1 text-white text-xs rounded hover:relative group"
                        title="PDF"
                        onClick={() => window.open(`${API_BASE}/purchases/${p.id}/pdf`, "_blank")}
                      >
                        📄
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 z-10">PDF</span>
                      </button>
                      <button
                        className="bg-green-600 px-2 py-1 text-white text-xs rounded hover:relative group"
                        title="View"
                        onClick={async () => {
                          try {
                            const res = await axios.get(`${API_BASE}/purchases/${p.id}`);
                            setViewPurchase(res.data);
                            setViewModalOpen(true);
                          } catch {
                            alert("Failed to load purchase details.");
                          }
                        }}
                      >
                        👁️
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 z-10">View</span>
                      </button>
                      <button
                        className="bg-blue-600 px-2 py-1 text-white text-xs rounded hover:relative group"
                        title="Edit"
                        onClick={() => navigate(`/purchases/${p.id}/edit`)}
                      >
                        ✏️
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 z-10">Edit</span>
                      </button>
                      <button
                        className="bg-red-600 px-2 py-1 text-xs text-white rounded hover:relative group"
                        title="Delete"
                        onClick={async () => {
                          if (window.confirm("Delete this purchase invoice?")) {
                            await axios.post(`${API_BASE}/purchases/batch_delete`, [p.id]);
                            afterAction();
                          }
                        }}
                      >
                        🗑️
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 z-10">Delete</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Totals footer */}
          <tfoot>
            <tr className="bg-gray-50">
              <td colSpan={12} className="p-2">
                <PurchaseTotals purchases={filteredPurchases} currency={baseCurrency} />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 mt-3">
        <button
          className="px-2 py-1 border rounded disabled:opacity-50"
          disabled={page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
        >
          Prev
        </button>
        <span>Page {page} of {Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE))}</span>
        <button
          className="px-2 py-1 border rounded disabled:opacity-50"
          disabled={page >= Math.ceil(filteredPurchases.length / PAGE_SIZE)}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Purchases;