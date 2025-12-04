import React, { useEffect, useMemo, useState } from "react";
import Select, { components } from "react-select";
import CustomerQuickModal from "../../components/CustomerQuickModal";

/* -------------------- helpers -------------------- */
const r1 = (v) => Math.round(Number(v ?? 0) * 10) / 10;
const fmt2 = (v) =>
  Number(v ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const num = (v) => Number(v ?? 0);
const lineAmount = (li) => r1(num(li.quantity) * num(li.unit_price));

/* ============================================================ */
export default function InvoiceForm({
  editing,
  data,
  setData,
  customers,
  products,
  taxes,
  onSubmit,
}) {
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [custModalMode, setCustModalMode] = useState("create");
  const [custModalData, setCustModalData] = useState(null);
  const [customerOpts, setCustomerOpts] = useState([]);

  const buildCustomerOption = (c) => ({
    value: c.name,
    label: `${c.name}${c.client_number ? ` (${c.client_number})` : ""}`,
    data: c,
  });

  useEffect(() => {
    setCustomerOpts((customers || []).map(buildCustomerOption));
  }, [customers]);

  const currentCustomerOpt = useMemo(() => {
    if (!data?.customer_name) return null;
    return customerOpts.find((o) => o.value === data.customer_name) || null;
  }, [customerOpts, data?.customer_name]);

  const setField = (k, v) => setData((p) => ({ ...p, [k]: v }));

  const nextClientNumber = useMemo(() => {
    const nums = (customers || [])
      .map((c) => Number(c.client_number))
      .filter((n) => Number.isFinite(n));
    return nums.length ? Math.max(...nums) + 1 : 1;
  }, [customers]);

  const openCreateCustomer = () => {
    setCustModalMode("create");
    setCustModalData({ client_number: nextClientNumber });
    setCustModalOpen(true);
  };
  const openEditCustomer = () => {
    if (!currentCustomerOpt?.data) return;
    setCustModalMode("edit");
    setCustModalData(currentCustomerOpt.data);
    setCustModalOpen(true);
  };

  const handleCustomerSaved = (savedCustomer) => {
    if (!savedCustomer) return;
    setCustomerOpts((prev) => {
      const existsAt = prev.findIndex(
        (o) => o.data?.id && o.data.id === savedCustomer.id
      );
      const newOpt = buildCustomerOption(savedCustomer);
      if (existsAt >= 0) {
        const copy = [...prev];
        copy[existsAt] = newOpt;
        return copy;
      }
      return [...prev, newOpt];
    });
    setField("customer_name", savedCustomer.name);
    if (savedCustomer.client_number)
      setField("client_number", savedCustomer.client_number);
    setCustModalOpen(false);
  };

  const MenuList = (props) => (
    <components.MenuList {...props}>
      {props.children}
      <div className="border-t my-1" />
      <div
        role="button"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openCreateCustomer();
        }}
        className="px-3 py-2 text-sm text-blue-600 hover:underline cursor-pointer"
      >
        + Create and edit…
      </div>
      <div
        role="button"
        onMouseDown={(e) => {
          if (!currentCustomerOpt) return;
          e.preventDefault();
          e.stopPropagation();
          openEditCustomer();
        }}
        className={`px-3 py-2 text-sm ${
          currentCustomerOpt
            ? "text-blue-600 hover:underline cursor-pointer"
            : "text-gray-400 cursor-not-allowed"
        }`}
      >
        ✏️ Edit selected…
      </div>
    </components.MenuList>
  );

  const lineDefaults = {
    type: "Service",
    product_id: null,
    item: "",
    description: "",
    quantity: 1,
    unit_price: 0,
    vat_code: "",
    excise_code: "",
  };

  useEffect(() => {
    if (!Array.isArray(data?.lines) || data.lines.length === 0) {
      setData((p) => ({ ...p, lines: [{ ...lineDefaults }] }));
    }
  }, []);

  const taxType = (t) => String(t?.type || "").toUpperCase();
  const taxValueKey = (t) => t.account_code ?? t.code ?? t.id ?? t.name ?? "";

  const taxRate = (code, date, type) => {
    if (!code) return 0;
    const list = (taxes || []).filter((t) => taxType(t) === type);
    const d = new Date(date || new Date());
    const match = list.find(
      (o) =>
        new Date(o.start_date) <= d &&
        (!o.end_date || d <= new Date(o.end_date)) &&
        (o.account_code === code ||
          o.code === code ||
          o.id === code ||
          o.name === code)
    );
    return match ? Number(match.rate || 0) : 0;
  };

  const updateLine = (i, field, value) => {
    const lines = [...(data.lines || [])];
    lines[i] = { ...lines[i], [field]: value };
    setData((p) => ({ ...p, lines }));
  };

  const addLine = () =>
    setData((p) => ({ ...p, lines: [...(p.lines || []), { ...lineDefaults }] }));

  const removeLine = (idx) =>
    setData((p) => ({
      ...p,
      lines: (p.lines || []).filter((_, i) => i !== idx),
    }));

  const totals = useMemo(() => {
    const sub = r1((data.lines || []).reduce((s, li) => s + lineAmount(li), 0));

    const ex = r1(
      (data.lines || []).reduce((s, li) => {
        const er = taxRate(li.excise_code, data.invoice_date, "EXCISE");
        return s + lineAmount(li) * er;
      }, 0)
    );

    const va = r1(
      (data.lines || []).reduce((s, li) => {
        const er = taxRate(li.excise_code, data.invoice_date, "EXCISE");
        const vr = taxRate(li.vat_code, data.invoice_date, "VAT");
        return s + lineAmount(li) * (1 + er) * vr;
      }, 0)
    );

    const grand = r1(sub + ex + va);
    return { sub, ex, va, grand };
  }, [data.lines, data.invoice_date, taxes]);

  const vatOpts = useMemo(
    () =>
      (taxes || [])
        .filter((t) => taxType(t) === "VAT")
        .map((x) => ({ value: taxValueKey(x), label: x.name })),
    [taxes]
  );

  const exciseOpts = useMemo(
    () =>
      (taxes || [])
        .filter((t) => taxType(t) === "EXCISE")
        .map((x) => ({ value: taxValueKey(x), label: x.name })),
    [taxes]
  );

  return (
    <>
      {custModalOpen && (
        <CustomerQuickModal
          mode={custModalMode}
          initialData={custModalData}
          onClose={() => setCustModalOpen(false)}
          onSaved={handleCustomerSaved}
        />
      )}

      {/* Header */}
      <div className="grid grid-cols-12 gap-3 mb-4">
        <div className="col-span-4">
          <label className="block text-sm text-gray-600 mb-1">Invoice No.</label>
          <input
            className="border rounded w-full px-2 py-1"
            value={data.invoice_number || ""}
            onChange={(e) => setField("invoice_number", e.target.value)}
            placeholder="Auto or manual"
          />
        </div>
        <div className="col-span-4">
          <label className="block text-sm text-gray-600 mb-1">Reference</label>
          <input
            className="border rounded w-full px-2 py-1"
            value={data.reference || ""}
            onChange={(e) => setField("reference", e.target.value)}
            placeholder="Optional"
          />
        </div>
        <div className="col-span-4">
          <label className="block text-sm text-gray-600 mb-1">Date</label>
          <input
            type="date"
            className="border rounded w-full px-2 py-1"
            value={data.invoice_date || ""}
            onChange={(e) => setField("invoice_date", e.target.value)}
          />
        </div>

        <div className="col-span-6">
          <label className="block text-sm text-gray-600 mb-1">Customer</label>
          <Select
            classNamePrefix="select"
            placeholder="Select..."
            options={customerOpts}
            components={{ MenuList }}
            value={currentCustomerOpt}
            onChange={(opt) => {
              if (!opt) return;
              setField("customer_name", opt.value);
              if (opt.data?.client_number)
                setField("client_number", opt.data.client_number);
            }}
            isClearable
          />
        </div>

        <div className="col-span-6">
          <label className="block text-sm text-gray-600 mb-1">Description</label>
          <input
            className="border rounded w-full px-2 py-1"
            value={data.description || ""}
            onChange={(e) => setField("description", e.target.value)}
            placeholder="Overall description"
          />
        </div>
      </div>

      {/* Lines */}
      <h3 className="font-semibold mb-2">Line Items</h3>

      {(data.lines || []).map((li, i) => (
        <div
          key={i}
          className="grid grid-cols-12 gap-2 items-center mb-2 text-sm"
        >
          <select
            value={li.type}
            onChange={(e) => updateLine(i, "type", e.target.value)}
            className="border rounded px-2 py-1 col-span-2"
          >
            <option value="Service">Service</option>
            <option value="Product">Product</option>
          </select>

          {li.type === "Product" ? (
            <select
              value={li.product_id || ""}
              onChange={(e) => updateLine(i, "product_id", e.target.value)}
              className="border rounded px-2 py-1 col-span-2"
            >
              <option value="">Select Product</option>
              {(products || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={li.item || ""}
              onChange={(e) => updateLine(i, "item", e.target.value)}
              className="border rounded px-2 py-1 col-span-2"
              placeholder="Service / narration"
            />
          )}

          <input
            value={li.description || ""}
            onChange={(e) => updateLine(i, "description", e.target.value)}
            className="border rounded px-2 py-1 col-span-2"
            placeholder="Description"
          />

          <input
            type="number"
            value={li.quantity ?? 1}
            onChange={(e) => updateLine(i, "quantity", e.target.value)}
            className="border rounded px-2 py-1 col-span-1"
            min="0"
            step="0.01"
            placeholder="Qty"
          />

          <input
            type="number"
            value={li.unit_price ?? 0}
            onChange={(e) => updateLine(i, "unit_price", e.target.value)}
            className="border rounded px-2 py-1 col-span-2"
            min="0"
            step="0.01"
            placeholder="Unit Price"
          />

          <select
            value={li.vat_code || ""}
            onChange={(e) => updateLine(i, "vat_code", e.target.value)}
            className="border rounded px-2 py-1 col-span-1"
            title="VAT"
          >
            <option value="">VAT</option>
            {vatOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            value={li.excise_code || ""}
            onChange={(e) => updateLine(i, "excise_code", e.target.value)}
            className="border rounded px-2 py-1 col-span-1"
            title="Excise"
          >
            <option value="">Excise</option>
            {exciseOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <input
            readOnly
            type="number"
            value={lineAmount(li)}
            className="border rounded px-2 py-1 bg-gray-100 col-span-1"
          />

          <div className="col-span-1 flex items-center justify-end gap-2">
            {i === (data.lines?.length || 0) - 1 && (
              <button
                type="button"
                onClick={addLine}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
              >
                + Add
              </button>
            )}
            <button
              type="button"
              onClick={() => removeLine(i)}
              className="text-red-600"
              title="Remove"
            >
              🗑️
            </button>
          </div>
        </div>
      ))}

      <div className="mt-6 grid grid-cols-12">
        <div className="col-span-7" />
        <div className="col-span-5">
          <div className="flex justify-between py-1">
            <span className="text-gray-700">Subtotal</span>
            <span className="font-medium">{fmt2(totals.sub)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-700">Excise</span>
            <span className="font-medium">{fmt2(totals.ex)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-700">VAT</span>
            <span className="font-medium">{fmt2(totals.va)}</span>
          </div>
          <div className="flex justify-between py-2 border-t mt-2">
            <span className="text-gray-900 font-semibold">Total</span>
            <span className="text-gray-900 font-semibold">{fmt2(totals.grand)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={() =>
            onSubmit({
              ...data,
              amount: totals.sub,
              excise: totals.ex,
              vat: totals.va,
            })
          }
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded shadow"
                >
                  {editing ? "Update Invoice" : "Create Invoice"}
                </button>
              </div>
            </>
          );
        }
