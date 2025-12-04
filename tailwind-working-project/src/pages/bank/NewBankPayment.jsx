import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Select from "react-select";

const makeBlankLine = () => ({
  _id: Date.now() + Math.random(),
  account_code: "",
  description: "",
  vat_code: "",
  amount: "",
});

const PAYMENT_TYPE_OPTIONS = [
  { value: "normal", label: "Normal Payment" },
  { value: "etr_purchase", label: "ETR Purchase (with VAT)" },
];


const NewBankPayment = () => {
  // Chart of Accounts for line dropdown
  const [accounts, setAccounts] = useState([]);
  // Fixed total for edit mode
  const [fixedTotal, setFixedTotal] = useState(null);

  // ETR/Payment Type state
  const [paymentType, setPaymentType] = useState("normal");

  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [bankAccountCode, setBankAccountCode] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");

  const [payee, setPayee] = useState("");
  const [payeeType, setPayeeType] = useState("Other");
  const [customerList, setCustomerList] = useState([]);
  const [supplierList, setSupplierList] = useState([]);
  const [payeeSearch, setPayeeSearch] = useState("");

  // ETR fields
  const [supplierName, setSupplierName] = useState("");
  const [supplierPin, setSupplierPin] = useState("");
  const [etrNumber, setEtrNumber] = useState("");
  const [etrDate, setEtrDate] = useState("");
  const [etrVatCode, setEtrVatCode] = useState("");

  const [description, setDescription] = useState("");
  const [currency, setCurrency] = useState("Ksh");
  const [lines, setLines] = useState([makeBlankLine()]);
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // --- 1) Fetch customers & suppliers depending on payee type ---
  useEffect(() => {
    if (payeeType === "Customer") {
      fetch("http://localhost:8000/customers/")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setCustomerList(data))
        .catch(() => setCustomerList([]));
    } else if (payeeType === "Supplier") {
      fetch("http://localhost:8000/suppliers/")
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setSupplierList(data))
        .catch(() => setSupplierList([]));
    }
  }, [payeeType]);

  // --- 2) When in ETR mode, auto-fill ETR details from Payee and Date ---
  useEffect(() => {
    if (paymentType !== "etr_purchase") return;

    // Default ETR date to payment date if not set
    if (date && !etrDate) {
      setEtrDate(date);
    }

    // Auto-link supplier ETR fields when payee is a Supplier
    if (payeeType === "Supplier" && payee && supplierList.length > 0) {
      const supplier = supplierList.find((s) => s.name === payee);
      if (supplier) {
        if (!supplierName) {
          setSupplierName(supplier.name);
        }
        if (!supplierPin && supplier.pin) {
          setSupplierPin(supplier.pin);
        }
      } else if (!supplierName) {
        setSupplierName(payee);
      }
    } else if (!supplierName && payee) {
      // Fallback: mirror generic payee into ETR supplier name
      setSupplierName(payee);
    }
  }, [
    paymentType,
    date,
    payeeType,
    payee,
    supplierList,
    etrDate,
    supplierName,
    supplierPin,
  ]);

  // --- 3) Load existing payment in edit mode ---
  useEffect(() => {
    if (!isEdit) return;

    const fetchPayment = async () => {
      try {
        setError("");
        const res = await fetch(
          `http://localhost:8000/bank-accounts/payments/${id}`
        );
        if (!res.ok) throw new Error("Failed to load payment");
        const data = await res.json();


        setDate(data.date || "");
        setReference(data.reference || "");
        setDescription(data.description || "");
        setCurrency(data.currency || "Ksh");
        setPayee(data.payee || "");
        setBankAccountCode(data.bank_account_code || "");
        setBankAccountName(data.bank_account_name || "");
        setPaymentType(data.payment_type || "normal");

        // NEW: remember the original statement total in edit mode
        setFixedTotal(data.total_amount ?? null);

        // ETR fields
        setSupplierName(data.etr_supplier_name || "");
        setSupplierPin(data.etr_supplier_pin || "");
        setEtrNumber(data.etr_number || "");
        setEtrDate(data.etr_date || "");
        setEtrVatCode(data.etr_vat_code || "");

        if (data.lines && data.lines.length > 0) {
          setLines(
            data.lines.map((l) => ({
              _id: `${l.id}-${Math.random()}`,
              account_code: l.account_code || "",
              description: l.description || "",
              vat_code: l.vat_code || "",
              amount: l.amount ?? "",
            }))
          );
        } else {
          setLines([makeBlankLine()]);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load payment");
      }
    };

    fetchPayment();
  }, [isEdit, id]);

  // --- 4) Fetch all accounts once ---
  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await fetch("http://localhost:8000/accounts/accounts");
        if (!res.ok) throw new Error("Failed to load accounts");
        const data = await res.json();
        setAccounts(data);
      } catch (err) {
        console.error("Error loading accounts", err);
      }
    };
    fetchAccounts();
  }, []);

  const updateLine = (lineId, field, value) => {
    setLines((prev) =>
      prev.map((l) =>
        l._id === lineId
          ? {
              ...l,
              [field]: value,
            }
          : l
      )
    );
  };

  const addLine = () => {
    setLines((prev) => [...prev, makeBlankLine()]);
  };

  const removeLine = (lineId) => {
    setLines((prev) =>
      prev.length === 1 ? prev : prev.filter((l) => l._id !== lineId)
    );
  };

  const handleDateChange = (e) => {
    const newDate = e.target.value;
    setDate(newDate);
    if (paymentType === "etr_purchase" && !etrDate) {
      setEtrDate(newDate);
    }
  };

  const totalAmount = lines.reduce((sum, l) => {
    const n = parseFloat(l.amount || "0");
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!date) {
      setError("Date is required");
      return;
    }

    // In create mode, bank account code is required
    if (!isEdit && !bankAccountCode) {
      setError("Paid from (Bank account code) is required");
      return;
    }

    const cleanLines = lines
      .filter((l) => l.account_code && l.amount)
      .map((l) => ({
        account_code: l.account_code.trim(),
        description: (l.description || "").trim() || null,
        amount: Number(l.amount),
        vat_code:
          paymentType === "etr_purchase" && l.vat_code ? l.vat_code : null,
      }));


    if (cleanLines.length === 0) {
      setError("At least one line with account and amount is required");
      return;
    }

    // In edit mode, don’t allow the lines to change the original payment amount
    if (isEdit && fixedTotal != null) {
      const roundedTotal = Math.round(totalAmount * 100);
      const roundedFixed = Math.round(Number(fixedTotal) * 100);

      if (roundedTotal !== roundedFixed) {
        setError(
          `Lines total (${currency} ${totalAmount.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}) must equal the original payment total (${currency} ${Number(
            fixedTotal
          ).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}).`
        );
        return;
      }
    }

    // Structured payee fields for backend
    let payee_type = null;
    let payee_id = null;
    let payee_name = payee || null;

    if (payeeType === "Supplier") {
      payee_type = "supplier";
      const supplier = supplierList.find((s) => s.name === payee);
      if (supplier) {
        payee_id = supplier.id;
        payee_name = supplier.name;
      }
    } else if (payeeType === "Customer") {
      payee_type = "customer";
      const customer = customerList.find((c) => c.name === payee);
      if (customer) {
        payee_id = customer.id;
        payee_name = customer.name;
      }
    } else if (payeeType === "Other") {
      payee_type = "other";
    }

    const payload = {
      date,
      reference: reference || null,
      payee: payee || null,
      payee_type,
      payee_id,
      payee_name,
      description: description || null,
      currency,
      payment_type: paymentType,
      lines: cleanLines,
    };

    if (!isEdit) {
      payload.bank_account_code = bankAccountCode;
    }

    if (paymentType === "etr_purchase") {
      const supplier =
        payeeType === "Supplier"
          ? supplierList.find((s) => s.name === payee)
          : null;

      payload.etr_supplier_name =
        supplierName || payee_name || payee || null;
      payload.etr_supplier_pin =
        supplierPin || (supplier && supplier.pin) || null;
      payload.etr_number = etrNumber || null;
      payload.etr_date = etrDate || date || null;
      // Header-level VAT not used now VAT is per line
      payload.etr_vat_code = null;
    }

    try {
      setSaving(true);
      const url = isEdit
        ? `http://localhost:8000/bank-accounts/payments/${id}`
        : "http://localhost:8000/bank-accounts/payments/";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Failed to save payment");
      const saved = await res.json();

      setSuccess(
        isEdit ? "Payment updated successfully" : "Payment created successfully"
      );
      navigate(`/bank-payments/${saved.id}`);
    } catch (err) {
      console.error(err);
      setError(
        isEdit ? "Failed to update payment" : "Failed to create payment"
      );
    } finally {
      setSaving(false);
    }
  };

  const title = isEdit ? "Edit Payment" : "New Payment";
  const buttonLabel = isEdit ? "Update Payment" : "Create Payment";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">{title}</h1>

        {error && (
          <div className="mb-4 rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Payment Type */}
          <div>
            <label className="block font-semibold mb-1">Payment Type</label>
            <select
              className="w-full border px-2 py-1 rounded"
              value={paymentType}
              onChange={(e) => {
                const value = e.target.value;
                if (PAYMENT_TYPE_OPTIONS.some(option => option.value === value)) {
                  setPaymentType(value);
                }
              }}
            >
              {PAYMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/* ETR Details block, only for etr_purchase */}
          {paymentType === "etr_purchase" && (
            <div className="border rounded p-3 mt-4 bg-gray-50 space-y-3">
              <h3 className="text-sm font-semibold">ETR Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold">
                    Supplier Name
                  </label>
                  <input
                    className="w-full border px-2 py-1 rounded"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder={
                      payeeType === "Supplier" ? "Auto-filled from Payee" : ""
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">
                    Supplier PIN
                  </label>
                  <input
                    className="w-full border px-2 py-1 rounded"
                    value={supplierPin}
                    onChange={(e) => setSupplierPin(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold">
                    ETR Number
                  </label>
                  <input
                    className="w-full border px-2 py-1 rounded"
                    value={etrNumber}
                    onChange={(e) => setEtrNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">
                    ETR Date
                  </label>
                  <input
                    type="date"
                    className="w-full border px-2 py-1 rounded"
                    value={etrDate}
                    onChange={(e) => setEtrDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold">
                    VAT Code
                  </label>
                  <input
                    className="w-full border px-2 py-1 rounded bg-gray-100 text-xs"
                    value="Set per line item below"
                    readOnly
                  />
                </div>
              </div>
            </div>
          )}
            {/* Top row: Date, Reference, Paid From */}
            <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold mb-1">Date</label>
              <input
                type="date"
                className="w-full border px-2 py-1 rounded"
                value={date}
                onChange={handleDateChange}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Reference</label>
              <input
                type="text"
                className="w-full border px-2 py-1 rounded"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Paid from</label>
              {isEdit ? (
                <input
                  className="w-full border px-2 py-1 rounded bg-gray-100"
                  value={bankAccountName || bankAccountCode}
                  readOnly
                />
              ) : (
                <input
                  className="w-full border px-2 py-1 rounded"
                  placeholder="Enter bank account code (e.g. 1100)"
                  value={bankAccountCode}
                  onChange={(e) => setBankAccountCode(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Payee section */}
          <div>
            <label className="block font-semibold mb-1">Payee</label>
            <div className="flex gap-2">
              <select
                className="border px-2 py-1 rounded"
                value={payeeType}
                onChange={(e) => {
                  setPayeeType(e.target.value);
                  setPayee("");
                  setPayeeSearch("");
                }}
              >
                <option value="Other">Other</option>
                <option value="Customer">Customer</option>
                <option value="Supplier">Supplier</option>
              </select>
              {payeeType === "Supplier" && (
                <div className="flex-1">
                  <Select
                    options={supplierList.map((s) => ({
                      value: s.name,
                      label: s.name,
                    }))}
                    value={
                      supplierList
                        .filter((s) => s.name === payee)
                        .map((s) => ({ value: s.name, label: s.name }))[0] ||
                      null
                    }
                    onChange={(option) => {
                      const name = option ? option.value : "";
                      setPayee(name);
                      // If this is an ETR purchase, auto-fill ETR supplier details
                      if (paymentType === "etr_purchase" && name) {
                        const supplier = supplierList.find(
                          (s) => s.name === name
                        );
                        if (supplier) {
                          setSupplierName(supplier.name);
                          if (supplier.pin) {
                            setSupplierPin(supplier.pin);
                          }
                        } else {
                          setSupplierName(name);
                        }
                      }
                    }}
                    placeholder="Select or search supplier..."
                    isClearable
                    menuPlacement="auto"
                  />
                </div>
              )}
              {payeeType === "Customer" && (
                <div className="flex-1">
                  <Select
                    options={customerList.map((c) => ({
                      value: c.name,
                      label: c.name,
                    }))}
                    value={
                      customerList
                        .filter((c) => c.name === payee)
                        .map((c) => ({ value: c.name, label: c.name }))[0] ||
                      null
                    }
                    onChange={(option) =>
                      setPayee(option ? option.value : "")
                    }
                    placeholder="Select or search customer..."
                    isClearable
                    menuPlacement="auto"
                  />
                </div>
              )}
              {payeeType === "Other" && (
                <input
                  type="text"
                  className="flex-1 border px-2 py-1 rounded"
                  placeholder="Enter payee name"
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                />
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block font-semibold mb-1">Description</label>
            <textarea
              className="w-full border px-2 py-1 rounded"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Currency */}
          <div>
            <label className="block font-semibold mb-1">Currency</label>
            <input
              className="w-full border px-2 py-1 rounded"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </div>

          {/* Lines table */}
          <div>
            <label className="block font-semibold mb-1">Lines</label>
            <table className="w-full border">
              <thead>
                <tr className="bg-gray-100 text-left text-xs">
                  <th className="border px-2 py-1">Account</th>
                  <th className="border px-2 py-1">Description</th>
                  {paymentType === "etr_purchase" && (
                    <th className="border px-2 py-1 text-center">VAT</th>
                  )}
                  <th className="border px-2 py-1 text-right">Amount</th>
                  <th className="border px-2 py-1 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line._id}>
                    <td className="border px-2 py-1">
                      <Select
                        options={accounts.map((a) => ({
                          value: a.account_code,
                          label: `${a.account_code} - ${a.name}`,
                        }))}
                        value={
                          accounts
                            .filter((a) => a.account_code === line.account_code)
                            .map((a) => ({
                              value: a.account_code,
                              label: `${a.account_code} - ${a.name}`,
                            }))[0] || null
                        }
                        onChange={(option) =>
                          updateLine(
                            line._id,
                            "account_code",
                            option ? option.value : ""
                          )
                        }
                        placeholder="Select or search account..."
                        isClearable
                        menuPlacement="auto"
                        styles={{ menu: (base) => ({ ...base, zIndex: 9999 }) }}
                      />
                    </td>
                    <td className="border px-2 py-1">
                      <input
                        type="text"
                        className="w-full border px-1 py-0.5 rounded"
                        value={line.description || ""}
                        onChange={(e) =>
                          updateLine(line._id, "description", e.target.value)
                        }
                        placeholder="Line description"
                      />
                    </td>
                    {paymentType === "etr_purchase" && (
                      <td className="border px-2 py-1">
                        <select
                          className="w-full border px-1 py-0.5 rounded text-xs"
                          value={line.vat_code || ""}
                          onChange={(e) =>
                            updateLine(line._id, "vat_code", e.target.value)
                          }
                        >
                          <option value="">No VAT</option>
                          <option value="VAT16">VAT 16%</option>
                        </select>
                      </td>
                    )}
                    <td className="border px-2 py-1">
                      <input
                        type="number"
                        step="0.01"
                        className="w-full border px-1 py-0.5 rounded text-right"
                        value={line.amount}
                        onChange={(e) =>
                          updateLine(line._id, "amount", e.target.value)
                        }
                      />
                    </td>
                    <td className="border px-2 py-1 text-center">
                      <button
                        type="button"
                        className="text-xs text-red-600"
                        onClick={() => removeLine(line._id)}
                        disabled={lines.length === 1}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td
                    className="border px-2 py-1 text-right font-semibold"
                    colSpan={paymentType === "etr_purchase" ? 2 : 1}
                  >
                    Total
                  </td>
                  <td className="border px-2 py-1 text-right font-semibold">
                    {currency}{" "}
                    {totalAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="border"></td>
                </tr>
              </tfoot>
            </table>

            <button
              type="button"
              className="mt-2 text-xs text-blue-600"
              onClick={addLine}
            >
              + Add line
            </button>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : buttonLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewBankPayment;


