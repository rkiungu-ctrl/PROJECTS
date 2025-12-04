import React, { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

export default function ViewInvoiceModal({ invoice, onClose }) {
  const [company, setCompany] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/company/profile`);
        if (res.ok) {
          const c = await res.json();
          // normalize common name/address fields from various backends
          setCompany({
            name: c.name || c.company_name || c.legal_name || "—",
            address: c.address || c.postal_address || c.address1 || "",
            phone: c.phone || c.tel || "",
            email: c.email || "",
            kra_pin: c.kra_pin || c.kra || "",
            logo_url: c.logo_url || c.logo || c.logo_path || null,
          });
        }
      } catch {}
    })();
  }, []);

  if (!invoice) return null;

  const money = (v) => Number(v ?? 0);
  const subtotal = money(invoice.amount);
  let excise  = money(invoice.excise ?? 0);
  let vat     = money(invoice.vat ?? 0);
  if ((excise === 0 || vat === 0) && Array.isArray(invoice.lines)) {
    excise = invoice.lines.reduce((s,l)=> s + Number(l.excise||0), 0);
    vat    = invoice.lines.reduce((s,l)=> s + Number(l.vat||0), 0);
  }
  const grand = r0(r1(subtotal) + r1(excise) + r1(vat));

  const logoSrc = company?.logo_url
    ? (company.logo_url.startsWith("http") ? company.logo_url : `${API_BASE}${company.logo_url}`)
    : null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg max-w-3xl w-full">
        <div className="flex justify-between mb-4">
          <div>
            <h3 className="text-2xl font-bold">{company?.name || "—"}</h3>
            <div className="text-sm">
              {company?.address && <div>{company.address}</div>}
              {company?.email && <div>{company.email}</div>}
              {company?.phone && <div>{company.phone}</div>}
              {company?.kra_pin && <div>KRA PIN: {company.kra_pin}</div>}
            </div>
          </div>
          {logoSrc && (
            <img src={logoSrc} alt="Logo" className="h-16 object-contain" />
          )}
        </div>

        <div className="flex justify-between border-b pb-3 mb-3">
          <div>
            <div className="font-semibold">INVOICE</div>
            <div className="text-sm">Invoice #: {invoice.invoice_number}</div>
            <div className="text-sm">CU INV Number: {invoice.cu_inv_number || "-"}</div>
            <div className="text-sm">Date: {invoice.invoice_date}</div>
            <div className="text-sm">Status: {invoice.status}</div>
          </div>
          <div className="text-right">
            <div className="font-semibold">Bill To</div>
            <div className="text-sm">{invoice.customer_name}</div>
            {invoice.customer_address && <div className="text-sm">{invoice.customer_address}</div>}
          </div>
        </div>

        {invoice.description && (
          <div className="mb-3">
            <div className="font-semibold">Description</div>
            <div className="text-sm">{invoice.description}</div>
          </div>
        )}

        <table className="w-full text-sm border mb-4">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Item</th>
              <th className="text-left p-2">Description</th>
              <th className="text-right p-2">Qty</th>
              <th className="text-right p-2">Unit Price</th>
              <th className="text-right p-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines?.map((li, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{li.type}</td>
                <td className="p-2">{li.item || li.product_id || "-"}</td>
                <td className="p-2">{li.description || ""}</td>
                <td className="p-2 text-right">{Number(li.quantity ?? 0)}</td>
                <td className="p-2 text-right">{Number(li.unit_price ?? 0).toFixed(2)}</td>
                <td className="p-2 text-right">{Number(li.amount ?? 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end">
          <table className="text-sm">
            <tbody>
              <tr><td className="pr-6 text-right">Subtotal</td><td className="text-right w-28">{fmt2(subtotal)}</td></tr>
              <tr><td className="pr-6 text-right">Excise</td><td className="text-right">{fmt2(excise)}</td></tr>
              <tr><td className="pr-6 text-right">VAT</td><td className="text-right">{fmt2(vat)}</td></tr>
              <tr className="font-semibold"><td className="pr-6 text-right">Grand Total</td><td className="text-right">{fmt2(grand)}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="mt-4 text-right">
          <button className="bg-gray-700 text-white px-4 py-1 rounded" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

// utils (add at the top of InvoiceForm.jsx, InvoicesTable.jsx, ViewInvoiceModal.jsx)
const r1 = (v) => Math.round(Number(v ?? 0) * 10) / 10; // round 1dp
const r0 = (v) => Math.round(Number(v ?? 0));           // round 0dp
const fmt2 = (v) => Number(v ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
