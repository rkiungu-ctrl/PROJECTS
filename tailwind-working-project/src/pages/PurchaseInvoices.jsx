import React, { useEffect, useState } from "react";
import axios from "axios";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import PurchaseTotals from "./PurchaseTotals";

const API_BASE = "http://127.0.0.1:8000";
const PAGE_SIZE = 25;

function formatAmount(num, decimals = 1) {
  return Number(num || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

async function handleBatchDelete(selectedIds) {
  try {
    const res = await axios.post(`${API_BASE}/purchases/batch_delete`, selectedIds);
    alert(`Deleted ${res.data.deleted} invoices`);
    afterAction();
  } catch (err) {
    alert("Batch delete failed");
  }
}

async function handleBatchPost(selectedIds) {
  try {
    const res = await axios.post(`${API_BASE}/purchases/batch_post`, selectedIds);
    alert(`Posted ${res.data.updated} invoices`);
    afterAction();
  } catch (err) {
    alert("Batch post failed");
  }
}

async function handleCopy(invoiceId) {
  try {
    const res = await axios.post(`${API_BASE}/purchases/${invoiceId}/copy`);
    navigate(`/purchases?search=${encodeURIComponent(search)}/${res.data.new_invoice_id}/edit`);
  } catch {
    alert("Could not copy invoice");
  }
}

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

  useEffect(() => {
    axios
      .get(`${API_BASE}/company/profile`)
      .then((res) => setCompany(res.data || {}))
      .catch(() => setCompany({}));

    axios
      .get(`${API_BASE}/taxes/`)
      .then((res) => setTaxOptions(res.data || []))
      .catch(() => setTaxOptions([]));

    axios
      .get(`${API_BASE}/company/profile`)
      .then((res) => {
        if (res.data && res.data.currency) setBaseCurrency(res.data.currency);
      })
      .catch(() => setBaseCurrency("USD"));
  }, []);

  useEffect(() => {
    const fetchPurchases = async () => {
      setLoadingPurchases(true);
      try {
        const res = await axios.get(`${API_BASE}/purchases/`);
        setPurchases(res.data || []);
      } catch (err) {
        console.error("Failed to fetch purchases:", err);
      } finally {
        setLoadingPurchases(false);
      }
    };
    fetchPurchases();
  }, [location.pathname]);

  const hasLines = (inv) => Array.isArray(inv.lines) && inv.lines.length > 0;

  function findTaxRate(code, type) {
    if (!code || !taxOptions.length) return 0;
    const T = (type || "").toUpperCase();
    const val = String(code);
    const hit = taxOptions.find(
      (t) =>
        (t.type || "").toUpperCase() === T &&
        (t.account_code === val || t.code === val || t.label === val || String(t.id) === val)
    );
    return hit ? Number(hit.rate) || 0 : 0;
  }

  const calcInvoiceTotal = (inv) => {
    if (hasLines(inv)) {
      return inv.lines.reduce((sum, ln) => {
        const quantity = Number(ln.quantity) || 0;
        const unit_price = Number(ln.unit_price) || 0;
        const base = quantity * unit_price;
        const exciseRate = findTaxRate(ln.excise_code, "Excise");
        const exciseAmount = base * exciseRate;
        const vatRate = findTaxRate(ln.vat_code, "VAT");
        const vatAmount = (base + exciseAmount) * vatRate;
        return sum + base + exciseAmount + vatAmount;
      }, 0);
    }
    return Number(inv.total) || 0;
  };

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

  const filteredPurchases = purchases.filter(
    (inv) =>
      inv.supplier_name?.toLowerCase().includes(search.toLowerCase()) ||
      inv.reference?.toLowerCase().includes(search.toLowerCase())
  );

  // Sort by invoice_date descending (latest first)
  const sortedPurchases = filteredPurchases.sort(
    (a, b) => new Date(b.invoice_date) - new Date(a.invoice_date)
  );

  const paginatedPurchases = sortedPurchases.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // (kept for future use if you want sorting)
  // const sortedInvoices = purchases.sort((a, b) => new Date(b.invoice_date) - new Date(a.invoice_date));

  const openView = async (id) => {
    const { data } = await axios.get(`${API_BASE}/purchases/${id}`);
    setSelectedInvoice(data);   // contains .totals and .amount_paid
    setViewOpen(true);
  };

  function handleSearchChange(e) {
    setSearch(e.target.value);
    navigate(`/purchases?search=${encodeURIComponent(e.target.value)}`);
  }

  function afterAction() {
    navigate(`/purchases?search=${encodeURIComponent(search)}`);
  }

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
            placeholder="Search invoices..."
            className="border rounded px-2 py-1 text-sm w-48"
            value={search}
            onChange={e => {
              setSearch(e.target.value);
              navigate(`/purchases?search=${encodeURIComponent(e.target.value)}`);
            }}
          />
          <button
            onClick={() => setSearch("")}
            className="ml-2 px-2 py-1 rounded border bg-gray-200 text-gray-800 text-sm"
          >
            Clear
          </button>
          <button
    onClick={() => handleBatchDelete(selectedIds)}
    className="px-3 py-1 rounded border bg-red-100 text-red-800 hover:bg-red-200 text-sm"
    disabled={selectedIds.length === 0}
  >
    Batch Delete
  </button>
  {/* Add this button below */}
  <button
    onClick={() => handleBatchPost(selectedIds)}
    className="px-3 py-1 rounded border bg-purple-100 text-purple-800 hover:bg-purple-200 text-sm"
    disabled={selectedIds.length === 0}
  >
    Batch Post
  </button>
  {/* ...other buttons... */}
  <button
    id="import-btn"
    className="px-3 py-1 rounded border bg-green-100 text-green-800 hover:bg-green-200 text-sm"
  
          >  
            Import
          </button>
          <button
            id="export-btn"
            className="px-3 py-1 rounded border bg-blue-100 text-blue-800 hover:bg-blue-200 text-sm"
          >
            Export
          </button>
          <button
            id="download-template-btn"
            className="px-3 py-1 rounded border bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm"
          >
            Download Template
          </button>
          <button
            className="px-3 py-1 rounded border bg-purple-100 text-purple-800 hover:bg-purple-200 text-sm"
            onClick={() => navigate("/pending-recurring")}
          >
            Pending Recurring Invoices
          </button>
        </div>

        <table className="w-full table-auto text-sm" id="purchase-invoices-table">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-2 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.length === purchases.length && purchases.length > 0}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedIds(purchases.map((inv) => inv.id));
                    else setSelectedIds([]);
                  }}
                />
              </th>
              <th className="p-2 text-left">Date</th>
              <th className="p-2 text-left">Supplier</th>
              <th className="p-2 text-left">Reference</th>
              <th className="p-2 text-left">CU INV Number</th> {/* Moved here */}
              <th className="p-2 text-right">Total</th>
              <th className="p-2 text-right">Balance Due</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-1 text-left">Actions</th>
            </tr>
          </thead>

          <tbody>
            {loadingPurchases ? (
              <tr>
                <td colSpan={10} className="p-4 text-center">Loading...</td>
              </tr>
            ) : filteredPurchases.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-4 text-center">No purchases found.</td>
              </tr>
            ) : (
              paginatedPurchases.map((p) => {
                const total = calcInvoiceTotal(p);
                const balanceDue = total - (Number(p.amount_paid) || 0);
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
                    <td className="p-2">{p.cu_inv_number || ""}</td> {/* Added here */}
                    <td className="p-2 text-right">
                      {p.currency_code === "KES" ? "Ksh " : p.currency_code === "USD" ? "$ " : p.currency_code + " "}
                      {formatAmount(total, 1)}
                    </td>
                    <td className="p-2 text-right">
                      {p.currency_code === "KES" ? "Ksh " : p.currency_code === "USD" ? "$ " : p.currency_code + " "}
                      {formatAmount(balanceDue, 1)}
                    </td>
                    <td className="p-2">{p.status || "Draft"}</td>
                    <td className="p-2 whitespace-nowrap w-40">
                      <button
                        className="bg-gray-700 px-2 py-1 text-white text-xs mr-1"
                        onClick={() => window.open(`${API_BASE}/purchases/${p.id}/pdf`, "_blank")}
                      >
                        PDF
                      </button>
                      <button
                        className="bg-green-600 px-2 py-1 text-white text-xs mr-1"
                        onClick={async () => {
                          const res = await axios.get(`${API_BASE}/purchases/${p.id}`);
                          setViewPurchase(res.data);
                          setViewModalOpen(true);
                        }}
                      >
                        View
                      </button>
                      <button
                        className="bg-blue-600 px-2 py-1 text-white text-xs mr-1"
                        onClick={() => navigate(`/purchases/${p.id}/edit`)}
                      >
                        Edit
                      </button>
                      <button
                        className="bg-yellow-600 px-2 py-1 text-white text-xs mr-1"
                        onClick={async () => {
                          await axios.post(`${API_BASE}/purchases/${p.id}/post`);
                          afterAction();
                        }}
                      >
                        Post
                      </button>
                      <button
                        className="bg-red-600 px-2 py-1 text-white text-xs mr-1"
                        onClick={async () => {
                          if (window.confirm("Are you sure you want to delete this purchase?")) {
                            await axios.delete(`${API_BASE}/purchases/${p.id}/delete`);
                            afterAction();
                          }
                        }}
                      >
                        Delete
                      </button>
                      <button
                        className="bg-purple-600 px-2 py-1 text-white text-xs"
                        onClick={() => handleCopy(p.id)}
                      >
                        Copy
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          <tfoot>
            <tr className="bg-gray-100 font-bold">
              {/* Up to 'Reference' (checkbox + 3 cols) */}
              <td colSpan={4} className="p-2 text-right">Totals:</td>
              {/* Totals & Balance Due */}
              <td className="p-2 text-right">
                {formatAmount(
                  purchases.reduce((sum, inv) => sum + calcInvoiceTotal(inv), 0),
                  2
                )}
              </td>
              <td className="p-2 text-right">
                {formatAmount(
                  purchases.reduce((sum, inv) => {
                    const total = calcInvoiceTotal(inv);
                    return sum + (total - (Number(inv.amount_paid) || 0));
                  }, 0),
                  2
                )}
              </td>
              {/* Remaining columns: Status, Currency, CU INV Number, Actions */}
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Pagination */}
      <div id="pagination" className="mt-4 flex items-center justify-center space-x-4 text-sm">
        <button
          className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Prev
        </button>
        <span className="text-gray-700 font-medium text-sm">
          Page {page} of {Math.max(1, Math.ceil(filteredPurchases.length / PAGE_SIZE))}
        </span>
        <button
          className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
          disabled={page === Math.ceil(filteredPurchases.length / PAGE_SIZE) || filteredPurchases.length === 0}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>

      {/* View Modal */}
      {viewModalOpen && viewPurchase && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
          <div className="bg-white w-[min(1100px,95vw)] max-h-[85vh] overflow-y-auto rounded-xl p-6 shadow-xl relative">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
              onClick={() => setViewModalOpen(false)}
            >
              &times;
            </button>
            <h2 className="text-xl font-bold mb-4">Purchase Invoice</h2>

            <div className="flex justify-between mb-4">
              <div>
                <div className="font-bold">
                  {viewPurchase.supplier_name || viewPurchase.supplier?.name}
                </div>
              </div>
              <div className="text-right">
                <div className="font-bold">{company.company_name || "Your Company"}</div>
                <div>{company.address || ""}</div>
                <div>{company.email || ""}</div>
                <div>{company.phone || ""}</div>
                <div>{company.kra_pin ? `KRA PIN: ${company.kra_pin}` : ""}</div>
                <table className="mt-2 text-sm w-full">
                  <tbody>
                    <tr>
                      <td className="font-semibold">Invoice Date</td>
                      <td className="text-right">{viewPurchase.invoice_date}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">Reference</td>
                      <td className="text-right">{viewPurchase.reference}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">CU INV Number</td>
                      <td className="text-right">{viewPurchase.cu_inv_number || "N/A"}</td>
                    </tr>
                    <tr>
                      <td className="font-semibold">Status</td>
                      <td className="text-right">{viewPurchase.status || "Draft"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <table className="min-w-full text-sm mb-4 border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-2 text-left">No</th>
                  <th className="p-2 text-left">Item/Description</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-right">Unit Price</th>
                  <th className="p-2 text-left">Tax</th>
                  <th className="p-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(viewPurchase.lines || []).map((ln, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{idx + 1}</td>
                    <td className="p-2">{ln.item || ln.description || ln.product?.label || ""}</td>
                    <td className="p-2 text-right">{ln.quantity}</td>
                    <td className="p-2 text-right">{Number(ln.unit_price).toFixed(2)}</td>
                    <td className="p-2">
                      {ln.vat_code ? `VAT` : ""}
                      {ln.excise_code ? (ln.vat_code ? ", Excise" : "Excise") : ""}
                    </td>
                    <td className="p-2 text-right">
                      {formatAmount(
                        (() => {
                          const quantity = Number(ln.quantity) || 0;
                          const unit_price = Number(ln.unit_price) || 0;
                          const base = quantity * unit_price;
                          const exciseRate = findTaxRate(ln.excise_code, "Excise");
                          const exciseAmount = base * exciseRate;
                          const vatRate = findTaxRate(ln.vat_code, "VAT");
                          const vatAmount = (base + exciseAmount) * vatRate;
                          return base + exciseAmount + vatAmount;
                        })(),
                        2
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={6}>&nbsp;</td>
                </tr>
                <tr>
                  <td colSpan={4}></td>
                  <td className="p-2 font-bold">Sub-total</td>
                  <td className="p-2 text-right font-bold">
                    {formatAmount(calcSubTotal(viewPurchase), 2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}></td>
                  <td className="p-2 font-bold">Excise</td>
                  <td className="p-2 text-right font-bold">
                    {formatAmount(calcExcise(viewPurchase), 2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}></td>
                  <td className="p-2 font-bold">VAT</td>
                  <td className="p-2 text-right font-bold">
                    {formatAmount(calcVAT(viewPurchase), 2)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={4}></td>
                  <td className="p-2 font-bold">Total</td>
                  <td className="p-2 text-right font-bold">
                    {formatAmount(calcInvoiceTotal(viewPurchase), 1)}
                  </td>
                </tr>
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <div className="w-[260px]">
                <PurchaseTotals totals={viewPurchase.totals} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;
