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

// simple stable id for new lines
const newId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
  const [recurringDay, setRecurringDay] = useState(1); // New state for recurring day

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
    const code = t.code || t.account_code || t.name || t.label || t.id || "";
    const rate = t.rate || t.tax_rate || 0;
    const account_code = t.account_code || "";
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
            // ensure each incoming line has a stable _id and preserve id from backend
            const incoming = Array.isArray(data.lines) ? data.lines : [];
            const withIds = incoming.map(l => {
              // If id is present, use it. If not, try to use l._id if it's a number. Otherwise, do not set id.
              let id = undefined;
              if (typeof l.id === 'number') id = l.id;
              else if (l._id && typeof l._id === 'number') id = l._id;
              return {
                _id: l._id || newId(),
                ...(id !== undefined ? { id } : {}),
                ...l
              };
            });
            setLines(withIds);
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

  // helper to create a blank line with a stable id
  const makeBlankLine = () => ({
    _id: newId(),
    type: "Product",
    product_id: "",
    item: "",
    account_code: "",
    description: "",
    quantity: 1,
    unit_price: 0,
    vat_code: "",
    excise_code: "",
  });

  // Add/remove/update line items (by _id for stability)
  // Always ensure at least one blank line is present
  useEffect(() => {
    if (lines.length === 0) {
      setLines([makeBlankLine()]);
    }
  }, [lines.length]);

  const addLine = () => setLines((prev) => [...prev, makeBlankLine()]);

  const updateLineById = (lineId, field, value) => {
    setLines((prev) => prev.map(l => l._id === lineId ? { ...l, [field]: value } : l));
  };

  const removeLineById = (lineId) =>
    setLines((prev) => prev.filter((l) => l._id !== lineId));

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

    // PATCH: Auto-generate reference if blank
    let ref = reference;
    if (!ref || ref.trim() === "") {
      ref = `PUR-${Date.now()}`; // Or use any preferred format
    }

    // Map selected VAT/Excise to code (e.g. 2252) for backend
    // Find the taxOption by label or code, then use .account_code as vat_code/excise_code
    const getTaxCode = (selected, type) => {
      const t = taxOptions.find(
        (tax) =>
          tax.type === type &&
          (tax.label === selected || tax.code === selected || tax.account_code === selected)
      );
      return t ? t.account_code : selected || null;
    };

    const payload = {
      supplier_id: supplierId,
      invoice_date: invoiceDate,
      reference: ref,
      currency_code: currencyCode,
      cu_inv_number: cuInvNumber,
      lines: lines.map(l => {
        // Ensure product_id is an integer if present
        const pid = l.product_id ? Number(l.product_id) : null;
        // Set type to "Product" if product_id is present, otherwise "Service"
        const type = pid ? "Product" : (l.type || "Service");
        // Set item to product name or SKU, if product, otherwise leave as is
        let item = l.item;
        if (type === "Product" && pid) {
          const prod = products.find(p => p.id === pid);
          item = prod ? (prod.sku || prod.name) : item;
        }
        // Always include id if not null/undefined
        const linePayload = {
          ...((l.id !== undefined && l.id !== null) ? { id: l.id } : {}),
          ...(pid ? { product_id: pid } : {}),
          type,
          item,
          description: l.description,
          account_code: l.account_code,
          quantity: Number(l.quantity) || 0,
          unit_price: Number(l.unit_price) || 0,
          vat_code: getTaxCode(l.vat_code, "VAT"),
          excise_code: getTaxCode(l.excise_code, "EXCISE"),
        };
        return linePayload;
      }),
      is_recurring: isRecurring,
      recurrence_interval: `${recurrenceIntervalValue} ${recurrenceType}`,
      recurrence_day_option: recurrenceDayOption,
      recurrence_end_type: recurrenceEndType,
      recurrence_end_date: recurrenceEndType === "end_date" ? recurrenceEndDate : null,
      next_issue_date: nextIssueDate,
      exchange_rate: currencyCode !== baseCurrency ? Number(exchangeRate) || 1 : null,
    };
    // Debug
    console.log("Payload:", payload);
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

  // Build payload for a line item
  const buildLinePayload = (line) => ({
    type: line.type || (line.product_id ? "Product" : "Service"),
    product_id: line.product_id,
    item: line.item || line.sku || line.product_name || "", // fallback to SKU or product name
    description: line.description || "",
    account_code: line.account_code || "",
    quantity: line.quantity,
    unit_price: line.unit_price,
    vat_code: line.vat_code,
    excise_code: line.excise_code,
  });

  const daysInMonth = Array.from({ length: 31 }, (_, i) => i + 1);

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
          {/* Only show Add Line button if there are no line items */}
          {lines.length === 0 && (
            <button
              type="button"
              onClick={addLine}
              className="px-2 py-1 text-xs bg-blue-600 text-white rounded"
            >
              Add Line
            </button>
          )}
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
            {lines.map((ln, idx) => {
              const base = Number(ln.quantity || 0) * Number(ln.unit_price || 0);
              const exciseRate = findTaxRate(ln.excise_code, "Excise");
              const exciseAmount = base * exciseRate;
              const vatRate = findTaxRate(ln.vat_code, "VAT");
              const vatAmount = (base + exciseAmount) * vatRate;
              const lineTotal = base + exciseAmount + vatAmount;
              return (
                <tr key={ln._id} className="align-top">
                  {/* Type */}
                  <td className="px-1 py-1">
                    <select
                      value={ln.type}
                      onChange={(e) => updateLineById(ln._id, "type", e.target.value)}
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
                        onChange={e => {
                          const prodId = intOrNull(e.target.value);
                          const prod = products.find(p => String(p.id) === String(prodId));
                          updateLineById(ln._id, "product_id", prodId);
                          updateLineById(ln._id, "item", prod ? prod.name : "");
                        }}
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
                        onChange={e => updateLineById(ln._id, "item", e.target.value)}
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
                        updateLineById(ln._id, "description", e.target.value)
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
                        updateLineById(ln._id, "account_code", e.target.value)
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
                        updateLineById(ln._id, "quantity", e.target.value)
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
                        updateLineById(ln._id, "unit_price", e.target.value)
                      }
                      className="border rounded p-1 text-right w-20 text-xs"
                    />
                  </td>

                  {/* VAT */}
                  <td className="px-1 py-1">
                    <select
                      value={ln.vat_code}
                      onChange={(e) =>
                        updateLineById(ln._id, "vat_code", e.target.value)
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
                        updateLineById(ln._id, "excise_code", e.target.value)
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

                  {/* Remove / Copy */}
                  <td className="px-1 py-1 flex gap-1 items-center justify-center">
                    <button
                      type="button"
                      onClick={() => removeLineById(ln._id)}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                      title="Delete line"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLines(prev => {
                          const idx = prev.findIndex(p => p._id === ln._id);
                          if (idx === -1) return prev;
                          const copy = { ...prev[idx], _id: newId() };
                          return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
                        });
                      }}
                      className="px-2 py-1 text-xs bg-gray-400 text-white rounded"
                      title="Copy line"
                    >
                      ⧉
                    </button>
                  </td>
                </tr>
              );
            })}
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

      {/* Recurring Day (newly added) */}
      {isRecurring && (
        <div className="mb-1">
          <label className="block text-sm mb-1">Recurring Day</label>
          <select
            className="border rounded px-2 py-1"
            value={recurringDay}
            onChange={e => setRecurringDay(Number(e.target.value))}
          >
            {daysInMonth.map(day => (
              <option key={day} value={day}>{day}</option>
            ))}
            <option value={0}>Last day</option>
          </select>
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
