import React, { useEffect, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PurchaseTotals from "./PurchaseTotals";
import { formatDateDDMMYYYY } from "../../utils/dateUtils";
/*
  NOTE: Only use /purchases/purchase-invoices endpoint for fetching purchases.
  Removed fallback to /purchases/purchase_invoices/.
*/
import { API_BASE } from "../../lib/api";
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
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySourcePurchase, setCopySourcePurchase] = useState(null);
  const [copyFormData, setCopyFormData] = useState({});
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
      // Fetch the invoice data to populate the copy form
      const res = await axios.get(`${API_BASE}/purchases/${invoiceId}`);
      const invoice = res.data;
      
      // Set up copy form with current date and cleared reference
      const today = new Date().toISOString().split('T')[0];
      setCopyFormData({
        supplier_id: invoice.supplier_id,
        invoice_date: today,
        reference: '', // Clear reference for new invoice
        cu_inv_number: '',
        currency_code: invoice.currency_code || 'KES',
        exchange_rate: invoice.exchange_rate || 1.0,
        lines: invoice.lines || [],
        is_recurring: false, // New copy is not recurring by default
        recurrence_interval: null,
        recurrence_end_date: null
      });
      
      setCopySourcePurchase(invoice);
      setCopyModalOpen(true);
    } catch (error) {
      console.error('Failed to load invoice for copying:', error);
      alert("Could not load invoice for copying");
    }
  }
  
  async function handleCreateCopy() {
    try {
      const res = await axios.post(`${API_BASE}/purchases/`, copyFormData);
      if (res.data && res.data.id) {
        setCopyModalOpen(false);
        alert('Invoice copy created successfully!');
        afterAction(); // Refresh the list
        navigate(`/purchases/${res.data.id}/edit`);
      } else {
        alert("Could not create invoice copy");
      }
    } catch (error) {
      console.error('Failed to create copy:', error);
      alert("Could not create invoice copy");
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
            onClick={() => navigate("/pending-recurring")}
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
                    <td className="p-2">{formatDateDDMMYYYY(p.invoice_date)}</td>
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
                        className="bg-purple-600 px-2 py-1 text-white text-xs rounded hover:relative group"
                        title="Copy"
                        onClick={() => handleCopy(p.id)}
                      >
                        📋
                        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 hidden group-hover:block bg-black text-white text-xs rounded px-2 py-1 z-10">Copy</span>
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

      {/* View Modal */}
      {viewModalOpen && viewPurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-y-auto w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Purchase Invoice #{viewPurchase.reference}</h3>
              <button
                className="text-gray-500 hover:text-gray-700 text-2xl"
                onClick={() => setViewModalOpen(false)}
              >
                ×
              </button>
            </div>
            
            {/* Company Info - matching PDF layout */}
            <div className="mb-4">
              <div className="text-sm">
                <div className="font-semibold">Tandaa Networks Ltd</div>
                <div>P.O. Box 1166-80108, Kilifi</div>
                <div>Kenya 80108</div>
                <div>Email: admin@tandaa.africa</div>
                <div>Phone: 0730729729| 0768886466</div>
              </div>
            </div>

            {/* Supplier Details and Invoice Details - 4 column layout matching PDF */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {/* Supplier Details - spans 2 columns */}
              <div className="col-span-2">
                <div className="text-sm">
                  <div className="font-semibold mb-1">To:</div>
                  <div>{viewPurchase.supplier_name}</div>
                  <div>Kilifi Kenya</div>
                  <div>{viewPurchase.supplier_email || 'N/A'}</div>
                  <div><span className="font-semibold">KRA PIN:</span> {viewPurchase.supplier_kra_pin || 'N/A'}</div>
                </div>
              </div>
              
              {/* Invoice Details Table - spans 2 columns, aligned right */}
              <div className="col-span-2">
                <table className="w-full text-sm border border-gray-300">
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-50">Invoice #</td>
                      <td className="border border-gray-300 px-2 py-1">{viewPurchase.reference}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-50">Date Created</td>
                      <td className="border border-gray-300 px-2 py-1">{formatDateDDMMYYYY(viewPurchase.invoice_date)}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-50">Due Date</td>
                      <td className="border border-gray-300 px-2 py-1">{formatDateDDMMYYYY(viewPurchase.invoice_date)}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-2 py-1 font-semibold bg-gray-50">Status</td>
                      <td className="border border-gray-300 px-2 py-1">{viewPurchase.status}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Line Items */}
            <div>
              <h4 className="font-semibold mb-2">Line Items</h4>
              {hasLines(viewPurchase) ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-gray-300">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="p-2 text-left border border-gray-300">Description</th>
                        <th className="p-2 text-center border border-gray-300">Rate</th>
                        <th className="p-2 text-center border border-gray-300">Quantity</th>
                        <th className="p-2 text-right border border-gray-300">Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewPurchase.lines.map((line, idx) => {
                        const lineTotal = (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
                        const exciseRate = findTaxRate(line.excise_code, "Excise");
                        const exciseAmount = lineTotal * exciseRate;
                        const vatRate = findTaxRate(line.vat_code, "VAT");
                        const vatAmount = (lineTotal + exciseAmount) * vatRate;
                        const finalTotal = lineTotal + exciseAmount + vatAmount;
                        
                        // Combine item and description like in PDF
                        const description = line.item && line.description && line.item !== line.description 
                          ? `${line.item} | ${line.description}` 
                          : (line.item || line.description || '-');
                        
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2 border border-gray-300">{description}</td>
                            <td className="p-2 text-center border border-gray-300">{currencyPrefix(viewPurchase.currency_code)}{formatAmount(line.unit_price || 0)}</td>
                            <td className="p-2 text-center border border-gray-300">{formatAmount(line.quantity || 0, 0)}</td>
                            <td className="p-2 text-right border border-gray-300">{currencyPrefix(viewPurchase.currency_code)}{formatAmount(finalTotal)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500">No line items found</p>
              )}
            </div>

            {/* Summary - Aligned like PDF with bordered table */}
            <div className="mt-6 flex justify-end">
              <div className="w-64">
                <table className="w-full text-sm border border-gray-300">
                  <tbody>
                    <tr>
                      <td className="border border-gray-300 px-3 py-2 bg-gray-50">Sub total</td>
                      <td className="border border-gray-300 px-3 py-2 text-right">{currencyPrefix(viewPurchase.currency_code)}{formatAmount(calcSubTotal(viewPurchase))}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-3 py-2 bg-gray-50">VAT</td>
                      <td className="border border-gray-300 px-3 py-2 text-right">{currencyPrefix(viewPurchase.currency_code)}{formatAmount(calcVAT(viewPurchase))}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-3 py-2 bg-gray-50">Excise</td>
                      <td className="border border-gray-300 px-3 py-2 text-right">{currencyPrefix(viewPurchase.currency_code)}{formatAmount(calcExcise(viewPurchase))}</td>
                    </tr>
                    <tr>
                      <td className="border border-gray-300 px-3 py-2 font-semibold bg-gray-100">Total</td>
                      <td className="border border-gray-300 px-3 py-2 text-right font-semibold">{currencyPrefix(viewPurchase.currency_code)}{formatAmount(calcInvoiceTotal(viewPurchase))}</td>
                    </tr>
                  </tbody>
                </table>
                
                {/* Show payment info if exists */}
                {(viewPurchase.amount_paid || 0) > 0 && (
                  <>
                    <div className="flex justify-between mb-2 text-sm text-gray-600">
                      <span>Paid on {formatDateDDMMYYYY(viewPurchase.payment_date || viewPurchase.invoice_date)}:</span>
                      <span>{currencyPrefix(viewPurchase.currency_code)}{formatAmount(viewPurchase.amount_paid || 0)}</span>
                    </div>
                    <div className="flex justify-between mb-4 font-medium">
                      <span>Amount Due:</span>
                      <span>{currencyPrefix(viewPurchase.currency_code)}{formatAmount(calcInvoiceTotal(viewPurchase) - (viewPurchase.amount_paid || 0))}</span>
                    </div>
                  </>
                )}

                {/* Dual Currency - KES conversion for foreign invoices */}
                {viewPurchase.currency_code && viewPurchase.currency_code !== baseCurrency && (
                  <div className="border border-gray-300 p-3 mt-4 bg-gray-50">
                    <h5 className="font-medium mb-2">Taxes {baseCurrency}</h5>
                    <div className="flex justify-between mb-1 text-sm">
                      <span>Untaxed Amount:</span>
                      <span>{formatAmount(calcSubTotal(viewPurchase) * (viewPurchase.exchange_rate || 1))}{baseCurrency === 'KES' ? ' KSh' : ` ${baseCurrency}`}</span>
                    </div>
                    <div className="flex justify-between mb-1 text-sm">
                      <span>VAT {Math.round(calcVAT(viewPurchase) / calcSubTotal(viewPurchase) * 100) || 16}%:</span>
                      <span>{formatAmount(calcVAT(viewPurchase) * (viewPurchase.exchange_rate || 1))}{baseCurrency === 'KES' ? ' KSh' : ` ${baseCurrency}`}</span>
                    </div>
                    <div className="flex justify-between font-medium border-t pt-1">
                      <span>Total:</span>
                      <span>{formatAmount(calcInvoiceTotal(viewPurchase) * (viewPurchase.exchange_rate || 1))}{baseCurrency === 'KES' ? ' KSh' : ` ${baseCurrency}`}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={() => navigate(`/purchases/${viewPurchase.id}/edit`)}
              >
                Edit
              </button>
              <button
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                onClick={() => window.open(`${API_BASE}/purchases/${viewPurchase.id}/pdf`, "_blank")}
              >
                Download PDF
              </button>
              <button
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                onClick={() => setViewModalOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Copy Modal */}
      {copyModalOpen && copySourcePurchase && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">Copy Invoice: {copySourcePurchase.reference}</h3>
              <button
                className="text-gray-500 hover:text-gray-700 text-2xl"
                onClick={() => setCopyModalOpen(false)}
              >
                ×
              </button>
            </div>
            
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-sm font-medium mb-1">Invoice Date</label>
                <input
                  type="date"
                  className="w-full border rounded px-3 py-2"
                  value={copyFormData.invoice_date}
                  onChange={(e) => setCopyFormData(prev => ({...prev, invoice_date: e.target.value}))}
                />
              </div>

              {/* Reference */}
              <div>
                <label className="block text-sm font-medium mb-1">Reference</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={copyFormData.reference}
                  onChange={(e) => setCopyFormData(prev => ({...prev, reference: e.target.value}))}
                  placeholder="Enter new reference number"
                />
              </div>

              {/* CU Invoice Number */}
              <div>
                <label className="block text-sm font-medium mb-1">CU Invoice Number (Optional)</label>
                <input
                  type="text"
                  className="w-full border rounded px-3 py-2"
                  value={copyFormData.cu_inv_number}
                  onChange={(e) => setCopyFormData(prev => ({...prev, cu_inv_number: e.target.value}))}
                  placeholder="Enter CU invoice number"
                />
              </div>

              {/* Currency */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Currency</label>
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={copyFormData.currency_code}
                    onChange={(e) => setCopyFormData(prev => ({...prev, currency_code: e.target.value}))}
                  >
                    <option value="KES">KES</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Exchange Rate</label>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded px-3 py-2"
                    value={copyFormData.exchange_rate}
                    onChange={(e) => setCopyFormData(prev => ({...prev, exchange_rate: parseFloat(e.target.value) || 1.0}))}
                  />
                </div>
              </div>

              {/* Recurring Options */}
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    className="mr-2"
                    checked={copyFormData.is_recurring}
                    onChange={(e) => setCopyFormData(prev => ({...prev, is_recurring: e.target.checked}))}
                  />
                  Make this invoice recurring
                </label>
                
                {copyFormData.is_recurring && (
                  <div className="mt-2 grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Recurrence Interval</label>
                      <select
                        className="w-full border rounded px-3 py-2"
                        value={copyFormData.recurrence_interval || ''}
                        onChange={(e) => setCopyFormData(prev => ({...prev, recurrence_interval: e.target.value}))}
                      >
                        <option value="">Select interval</option>
                        <option value="1 months">Monthly</option>
                        <option value="3 months">Quarterly</option>
                        <option value="12 months">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">End Date (Optional)</label>
                      <input
                        type="date"
                        className="w-full border rounded px-3 py-2"
                        value={copyFormData.recurrence_end_date || ''}
                        onChange={(e) => setCopyFormData(prev => ({...prev, recurrence_end_date: e.target.value}))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Line Items Preview */}
              <div>
                <label className="block text-sm font-medium mb-2">Line Items (from original invoice)</label>
                <div className="max-h-40 overflow-y-auto border rounded p-2 bg-gray-50">
                  {copyFormData.lines.map((line, idx) => (
                    <div key={idx} className="text-sm py-1 border-b last:border-b-0">
                      <strong>{line.item}</strong> - {currencyPrefix(copyFormData.currency_code)}{line.unit_price} x {line.quantity}
                      {line.description && <div className="text-gray-600">{line.description}</div>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Line items will be copied exactly. You can edit them after creating the copy.
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-6 flex gap-2 justify-end">
              <button
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                onClick={() => setCopyModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                onClick={handleCreateCopy}
              >
                Create Copy & Edit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;