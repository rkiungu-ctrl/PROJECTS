import React, { useState, useEffect } from "react";
import axios from "axios";
import { useParams, useNavigate } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000";

function formatAmount(num, decimals = 2) {
  return Number(num || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// Coerce a value to an integer only if it's purely numeric; otherwise return null
const intOrNull = (v) => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  return /^\d+$/.test(s) ? parseInt(s, 10) : null;
};

const PurchaseForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  // Form state
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [reference, setReference] = useState("");
  const [cuInvNumber, setCuInvNumber] = useState(""); // Add this line
  const [lines, setLines] = useState([]);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceInterval, setRecurrenceInterval] = useState("monthly");
  const [recurrenceIntervalValue, setRecurrenceIntervalValue] = useState(1);
  const [recurrenceType, setRecurrenceType] = useState("months");
  const [recurrenceDayOption, setRecurrenceDayOption] = useState("same_day");
  const [recurrenceEndType, setRecurrenceEndType] = useState("until_notice");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState("");
  const [nextIssueDate, setNextIssueDate] = useState("");
  const [products, setProducts] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [currencyCode, setCurrencyCode] = useState("KES");
  const [exchangeRate, setExchangeRate] = useState(""); // Add this line
  const [currencies, setCurrencies] = useState([]);
  const [baseCurrency, setBaseCurrency] = useState("KES");

  // Normalized tax options: { type, code, rate, account_code, label }
  const [taxOptions, setTaxOptions] = useState([
    // safe defaults in case API is empty
    { type: "VAT", code: "VAT 16%", rate: 0.16, account_code: "092", label: "VAT 16%" },
    { type: "EXCISE", code: "Excise 15%", rate: 0.15, account_code: "091", label: "Excise 15%" },
  ]);

  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);

  // ---- Helpers to normalize tax payloads ----
  const normalizeTax = (t) => {
    // Try to extract a consistent "type"
    const rawType = (t.type || t.tax_type || "").toString().toUpperCase();
    const type =
      rawType === "EXCISE" ? "EXCISE" :
      rawType === "VAT" ? "VAT" : rawType;

    // Prefer explicit code; otherwise fall back to name/label/id
    const code =
      t.code ??
      t.name ??
      t.label ??
      (t.id != null ? String(t.id) : "");

    // Parse rate as number (handles "0.16", "16%", 16, etc.)
    let rate = t.rate;
    if (typeof rate === "string") {
      const pctMatch = rate.trim().match(/^(\d+(\.\d+)?)%$/);
      if (pctMatch) {
        rate = parseFloat(pctMatch[1]) / 100; // "16%" -> 0.16
      } else {
        rate = parseFloat(rate); // "0.16" -> 0.16
      }
    }
    if (typeof rate !== "number" || Number.isNaN(rate)) rate = 0;

    // Try account code from various shapes
    const account_code =
      t.account_code ??
      (t.account && (t.account.code || t.account.account_code)) ??
      "";

    const label = t.name || t.label || code;

    return { type, code: String(code), rate, account_code: String(account_code || ""), label };
  };

  // Fetch supporting data first
  useEffect(() => {
    async function fetchData() {
      await axios.get(`${API_BASE}/products/`).then((res) => setProducts(res.data || []));
      await axios.get(`${API_BASE}/accounts/`).then((res) => setAccounts(res.data || []));
      await axios.get(`${API_BASE}/suppliers/`).then((res) => setSuppliers(res.data || []));
      await axios.get(`${API_BASE}/taxes/`).then((res) => {
        const items = Array.isArray(res.data) ? res.data : [];
        const normalized = items.map(normalizeTax).filter(x => x.type && x.code);
        if (normalized.length) setTaxOptions(normalized);
      });
      // Now fetch purchase for edit
      if (id) {
        setLoading(true);
        fetch(`${API_BASE}/purchases/${id}`)
          .then(res => res.json())
          .then(data => {
            setSupplierId(data.supplier_id || "");
            setSupplierName(data.supplier_name || "");
            setInvoiceDate(data.invoice_date || "");
            setReference(data.reference || "");
            setCuInvNumber(data.cu_inv_number || "");
            setCurrencyCode(data.currency_code || "KES");
            setLines(data.lines || []);
            setIsRecurring(data.is_recurring || false);
            setRecurrenceInterval(data.recurrence_interval || "monthly");
            setRecurrenceDayOption(data.recurrence_day_option || "same_day");
            setRecurrenceEndType(data.recurrence_end_type || "until_notice");
            setRecurrenceEndDate(data.recurrence_end_date || "");
            setNextIssueDate(data.next_issue_date || "");
          })
          .finally(() => setLoading(false));
      }

      // Fetch currencies
      axios.get(`${API_BASE}/currencies/`)
        .then(res => {
          const base = (res.data || []).find(c => c.is_base);
          setBaseCurrency(base ? base.code : "KES");
          setCurrencies(res.data || []);
        })
        .catch(() => setBaseCurrency("KES"));
    }
    fetchData();
  }, [id]);

  // Add/remove line items
  const addLine = () =>
    setLines((prev) => [
      ...prev,
      {
        type: "Product",
        product_id: "",
        item: "",
        account_code: "",
        description: "",
        quantity: 1,
        unit_price: 0,
        vat_code: "",
        excise_code: "",
      },
    ]);

  const updateLine = (idx, field, value) => {
    setLines((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const removeLine = (idx) =>
    setLines((prev) => prev.filter((_, i) => i !== idx));

  // ---- Robust tax lookup (code OR name OR id OR account_code, case-insensitive type) ----
  function findTaxRate(selectedValue, type) {
    if (!selectedValue) return 0;
    const tUpper = (type || "").toString().toUpperCase();
    const val = String(selectedValue);

    const hit = taxOptions.find((t) => {
      const sameType = (t.type || "").toUpperCase() === tUpper;
      if (!sameType) return false;
      return (
        t.code === val ||
        t.label === val ||
        t.account_code === val
      );
    });

    return hit ? Number(hit.rate) || 0 : 0;
  }

  // Summary calculations
  const subTotal = lines.reduce(
    (sum, ln) => sum + Number(ln.quantity || 0) * Number(ln.unit_price || 0),
    0
  );

  const exciseTotal = lines.reduce((sum, ln) => {
    const base = Number(ln.quantity || 0) * Number(ln.unit_price || 0);
    const exciseRate = findTaxRate(ln.excise_code, "Excise");
    return sum + base * exciseRate;
  }, 0);

  const vatTotal = lines.reduce((sum, ln) => {
    const base = Number(ln.quantity || 0) * Number(ln.unit_price || 0);
    const exciseRate = findTaxRate(ln.excise_code, "Excise");
    const exciseAmount = base * exciseRate;
    const vatRate = findTaxRate(ln.vat_code, "VAT");
    return sum + (base + exciseAmount) * vatRate;
  }, 0);

  const grandTotal = subTotal + exciseTotal + vatTotal;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      supplier_id: supplierId,
      invoice_date: invoiceDate,
      reference,
      currency_code: currencyCode,
      cu_inv_number: cuInvNumber, // Add this line
      lines: lines.map(l => {
  const pid = intOrNull(l.product_id ?? l.productId ?? l.itemId);
  return {
    id: l.id, // <-- include line id if present
    ...(pid !== null ? { product_id: pid } : {}),
    type: l.type,
    item: l.item,
    description: l.description,
    account_code: l.account_code,
    quantity: Number(l.quantity) || 0,
    unit_price: Number(l.unit_price) || 0,
    vat_code: l.vat_code || null,
    excise_code: l.excise_code || null,
  };
}),
      is_recurring: isRecurring,
      recurrence_interval: `${recurrenceIntervalValue} ${recurrenceType}`,
      recurrence_day_option: recurrenceDayOption,
      recurrence_end_type: recurrenceEndType,
      recurrence_end_date: recurrenceEndType === "end_date" ? recurrenceEndDate : null,
      next_issue_date: nextIssueDate,
      exchange_rate: currencyCode !== baseCurrency ? Number(exchangeRate) || 1 : null,
    };
    try {
      let res;
      if (id) {
        res = await axios.put(`${API_BASE}/purchases/${id}/edit`, payload);
      } else {
        res = await axios.post(`${API_BASE}/purchases/`, payload);
      }
      alert("Changes saved successfully!");
      navigate("/purchases");
    } catch (err) {
      console.error("Failed to save purchase:", err?.response?.data || err);
      alert("Failed to save purchase");
    }
  };

  // Filter lines by type
  const filteredLines = typeFilter
    ? lines.filter(ln =>
        (ln.type || "").toLowerCase().includes(typeFilter.toLowerCase())
      )
    : lines;

  return (
    <form
      onSubmit={handleSubmit}
      className="w-[95%] ml-4 flex flex-col p-2 space-y-2"
    >
      <h2 className="text-lg font-semibold">
        {id ? "Edit Purchase Invoice" : "New Purchase Invoice"}
      </h2>

      {/* Supplier */}
      <div className="mb-1">
        <label className="block text-sm mb-0.5">Supplier:</label>
        <input
          list="suppliers"
          value={supplierName}
          onChange={e => {
            setSupplierName(e.target.value);
            const match = suppliers.find(s => s.name === e.target.value);
            if (match) {
              setSupplierId(match.id);
              setCurrencyCode(match.default_currency || "KES"); // if supplier has default_currency
            }
          }}
          className="border rounded p-1 w-full text-sm"
          required
          placeholder="Type to search supplier..."
        />
        <datalist id="suppliers">
          {suppliers.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name} ({s.id})
            </option>
          ))}
        </datalist>
      </div>

      {/* Date */}
      <div className="mb-1">
        <label className="block text-sm mb-0.5">Date:</label>
        <input
          type="date"
          value={invoiceDate}
          onChange={(e) => setInvoiceDate(e.target.value)}
          className="border rounded p-1 w-full text-sm"
          required
        />
      </div>

      {/* Reference */}
      <div className="mb-1">
        <label className="block text-sm mb-0.5">Reference:</label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className="border rounded p-1 w-full text-sm"
        />
      </div>

      {/* CU INV Number (optional) */}
      <div className="mb-1">
        <label className="block text-sm mb-0.5">CU INV Number (optional):</label>
        <input
          type="text"
          value={cuInvNumber}
          onChange={e => setCuInvNumber(e.target.value)}
          className="border rounded p-1 w-full text-sm"
          placeholder="Enter CU INV Number (if any)"
        />
      </div>

      {/* Currency */}
      <div className="mb-1">
        <label className="block text-sm mb-0.5">Currency:</label>
        <select
          value={currencyCode}
          onChange={e => setCurrencyCode(e.target.value)}
          className="border rounded p-1 w-full text-sm"
        >
          {currencies.map(cur => (
            <option key={cur.code} value={cur.code}>
              {cur.code} {cur.name}
            </option>
          ))}
        </select>
      </div>

      {/* Exchange Rate (conditional) */}
      {currencyCode !== baseCurrency && (
        <div className="mb-1 flex items-center gap-2">
          <label className="block text-sm">Exchange rate</label>
          <span>1 {currencyCode} =</span>
          <input
            type="number"
            step="any"
            value={exchangeRate}
            onChange={e => setExchangeRate(e.target.value)}
            className="border rounded p-1 w-24 text-sm"
            placeholder="Autofill"
          />
          <span>{baseCurrency}</span>
          <button
            type="button"
            className="ml-2 px-2 py-1 border rounded"
            onClick={() => {/* autofill logic here */}}
            title="Autofill exchange rate"
          >
            &#8646;
          </button>
        </div>
      )}

      {/* Line Items */}
      <div className="mb-1">
        <div className="flex items-center gap-2">
          <label className="block text-sm">Line Items:</label>
          <button
            type="button"
            onClick={addLine}
            className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
          >
            Add Line
          </button>
        </div>

      
        <table className="w-full text-xs mt-1 border border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="px-1 py-1 text-left">Type</th>
              <th className="px-1 py-1 text-left">Product/Service</th>
              <th className="px-1 py-1 text-left">Description</th>
              <th className="px-1 py-1 text-left">Account</th>
              <th className="px-1 py-1 text-right w-14">Qty</th>
              <th className="px-1 py-1 text-right w-20">Unit Price</th>
              <th className="px-1 py-1 text-left w-28">VAT</th>
              <th className="px-1 py-1 text-left w-28">Excise</th>
              <th className="px-1 py-1 text-right w-24">Total</th>
              <th className="px-1 py-1 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {filteredLines.map((ln, idx) => {
              const base = Number(ln.quantity || 0) * Number(ln.unit_price || 0);
              const exciseRate = findTaxRate(ln.excise_code, "Excise");
              const exciseAmount = base * exciseRate;
              const vatRate = findTaxRate(ln.vat_code, "VAT");
              const vatAmount = (base + exciseAmount) * vatRate;
              const lineTotal = base + exciseAmount + vatAmount;

              return (
                <tr key={idx} className="align-top">
                  {/* Type */}
                  <td className="px-1 py-1">
                    <select
                      value={ln.type}
                      onChange={(e) => updateLine(idx, "type", e.target.value)}
                      className="border rounded p-1 text-xs"
                    >
                      <option value="Product">Product</option>
                      <option value="Service">Service</option>
                      <option value="Discount">Discount</option>
                    </select>
                  </td>

                  {/* Product/Service */}
                  <td className="px-1 py-1">
                    {ln.type === "Product" ? (
                      <select
                        value={ln.product_id}
                        onChange={(e) =>
                          updateLine(idx, "product_id", e.target.value)
                        }
                        className="border rounded p-1 text-xs w-44"
                      >
                        <option value="">Select Product</option>
                        {products.map((prod) => (
                          <option key={prod.id} value={prod.id}>
                            {prod.label || prod.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={ln.item}
                        onChange={(e) => updateLine(idx, "item", e.target.value)}
                        className="border rounded p-1 text-xs w-44"
                        placeholder="Service/Discount"
                      />
                    )}
                  </td>

                  {/* Description */}
                  <td className="px-1 py-1">
                    <input
                      type="text"
                      value={ln.description}
                      onChange={(e) =>
                        updateLine(idx, "description", e.target.value)
                      }
                      className="border rounded p-1 text-xs w-44"
                      placeholder="Description"
                    />
                  </td>

                  {/* Account (datalist) */}
                  <td className="px-1 py-1 whitespace-normal break-words">
                    <input
                      list="accounts"
                      value={ln.account_code}
                      onChange={(e) =>
                        updateLine(idx, "account_code", e.target.value)
                      }
                      className="border rounded p-1 text-xs w-48"
                      placeholder="Search account..."
                    />
                    <datalist id="accounts">
                      {accounts.map((acc) => (
                        <option key={acc.code} value={acc.code}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </datalist>
                  </td>

                  {/* Qty */}
                  <td className="px-1 py-1 text-right">
                    <input
                      type="number"
                      value={ln.quantity}
                      onChange={(e) =>
                        updateLine(idx, "quantity", e.target.value)
                      }
                      className="border rounded p-1 text-right w-14 text-xs"
                    />
                  </td>

                  {/* Unit Price */}
                  <td className="px-1 py-1 text-right">
                    <input
                      type="number"
                      value={ln.unit_price}
                      onChange={(e) =>
                        updateLine(idx, "unit_price", e.target.value)
                      }
                      className="border rounded p-1 text-right w-20 text-xs"
                    />
                  </td>

                  {/* VAT */}
                  <td className="px-1 py-1">
                    <select
                      value={ln.vat_code}
                      onChange={(e) =>
                        updateLine(idx, "vat_code", e.target.value)
                      }
                      className="border rounded p-1 text-xs w-28"
                    >
                      <option value="">None</option>
                      {taxOptions
                        .filter((t) => t.type === "VAT")
                        .map((tax) => (
                          <option key={`${tax.type}-${tax.code}`} value={tax.code}>
                            {tax.label} ({tax.rate * 100}%)
                          </option>
                        ))}
                    </select>
                  </td>

                  {/* Excise */}
                  <td className="px-1 py-1">
                    <select
                      value={ln.excise_code}
                      onChange={(e) =>
                        updateLine(idx, "excise_code", e.target.value)
                      }
                      className="border rounded p-1 text-xs w-28"
                    >
                      <option value="">None</option>
                      {taxOptions
                        .filter((t) => t.type === "EXCISE")
                        .map((tax) => (
                          <option key={`${tax.type}-${tax.code}`} value={tax.code}>
                            {tax.label} ({tax.rate * 100}%)
                          </option>
                        ))}
                    </select>
                  </td>

                  {/* Total */}
                  <td className="px-1 py-1 text-right">
                    {formatAmount(lineTotal, 2)}
                  </td>

                  {/* Remove */}
                  <td className="px-1 py-1">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLines(prev => {
                          const copy = { ...prev[idx] };
                          return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
                        });
                      }}
                      className="px-2 py-1 text-xs bg-gray-400 text-white rounded ml-1"
                    >
                      Copy
                    </button>
                  </td>
                </tr>
              );
            })}

            {/* Summary rows */}
            <tr className="bg-gray-50 text-sm">
              <td colSpan={7} className="px-1 py-1 font-semibold text-right">
                Sub-total
              </td>
              <td className="px-1 py-1 text-right">
                {formatAmount(subTotal, 2)}
              </td>
              <td></td>
            </tr>
            <tr className="bg-gray-50 text-sm">
              <td colSpan={7} className="px-1 py-1 font-semibold text-right">
                Excise
              </td>
              <td className="px-1 py-1 text-right">
                {formatAmount(exciseTotal, 2)}
              </td>
              <td></td>
            </tr>
            <tr className="bg-gray-50 text-sm">
              <td colSpan={7} className="px-1 py-1 font-semibold text-right">
                VAT
              </td>
              <td className="px-1 py-1 text-right">{formatAmount(vatTotal, 2)}</td>
              <td></td>
            </tr>
            <tr className="bg-gray-100 text-sm">
              <td colSpan={7} className="px-1 py-1 font-bold text-right">
                Total
              </td>
              <td className="px-1 py-1 text-right">
                {formatAmount(grandTotal, 2)}
              </td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Recurring */}
      <div className="flex items-center gap-2">
        <label className="text-sm">
          <input
            type="checkbox"
            className="mr-1"
            checked={isRecurring}
            onChange={(e) => setIsRecurring(e.target.checked)}
          />
          Make recurring
        </label>
      </div>

      {isRecurring && (
        <div className="mb-1 flex gap-2 items-center">
          <label className="block text-sm">Interval:</label>
          <span>Every</span>
          <input
            type="number"
            min={1}
            value={recurrenceIntervalValue}
            onChange={e => setRecurrenceIntervalValue(e.target.value)}
            className="border rounded p-1 w-16 text-sm"
          />
          <select
            value={recurrenceType}
            onChange={e => setRecurrenceType(e.target.value)}
            className="border rounded p-1 text-sm"
          >
            <option value="months">Month(s)</option>
            <option value="weeks">Week(s)</option>
            <option value="days">Day(s)</option>
          </select>
          <select
            value={recurrenceDayOption}
            onChange={e => setRecurrenceDayOption(e.target.value)}
            className="border rounded p-1 text-sm"
          >
            <option value="same_day">on the same day</option>
            <option value="first_day">on the first day</option>
            <option value="last_day">on the last day</option>
            {/* Add more options as needed */}
          </select>
          <select
            value={recurrenceEndType}
            onChange={e => setRecurrenceEndType(e.target.value)}
            className="border rounded p-1 text-sm"
          >
            <option value="until_notice">Until further notice</option>
            <option value="end_date">Until date</option>
          </select>
          {recurrenceEndType === "end_date" && (
            <input
              type="date"
              value={recurrenceEndDate}
              onChange={e => setRecurrenceEndDate(e.target.value)}
              className="border rounded p-1 text-sm"
            />
          )}
          <label className="block text-sm">Next Issue Date:</label>
          <input
            type="date"
            value={nextIssueDate}
            onChange={e => setNextIssueDate(e.target.value)}
            className="border rounded p-1 text-sm"
          />
        </div>
      )}

      <div className="pt-1">
        <button
          type="submit"
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded"
        >
          {id ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
};

export default PurchaseForm;

/* In your routing setup (e.g., App.js or Routes.js), use:
<Route path="/purchases/:id/edit" element={<PurchaseForm />} />
*/
