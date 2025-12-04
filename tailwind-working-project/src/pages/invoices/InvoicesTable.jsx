import React, { useState } from "react";

const r1 = (v) => Math.round(Number(v ?? 0) * 10) / 10;
const r0 = (v) => Math.round(Number(v ?? 0));
const fmt2 = (v) =>
  Number(v ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const num = (v) => Number(v ?? 0);

function getGrandTotal(inv) {
  if (inv.grand_total && Number(inv.grand_total) !== 0) return r0(inv.grand_total);
  const sub = r1(inv.amount);
  const ex = r1(inv.excise);
  const va = r1(inv.vat);
  return r0(sub + ex + va);
}

function getBalanceDue(inv) {
  if (typeof inv.balance_due !== "undefined") return fmt2(inv.balance_due);
  const total = getGrandTotal(inv);
  const paid = Number(inv.receipted_amount ?? 0);
  return fmt2(total - paid);
}

function getExcise(inv) {
  if (inv.excise && Number(inv.excise) !== 0) return r1(inv.excise);
  if (Array.isArray(inv.lines)) {
    return r1(inv.lines.reduce((s, l) => s + r1(l.excise || 0), 0));
  }
  return 0;
}

function getVat(inv) {
  if (inv.vat && Number(inv.vat) !== 0) return r1(inv.vat);
  if (Array.isArray(inv.lines)) {
    return r1(inv.lines.reduce((s, l) => s + r1(l.vat || 0), 0));
  }
  return 0;
}

export default function InvoicesTable({
  rows,
  page,
  perPage,
  totalPages,
  serverTotal,
  setPage,
  onChangePerPage,

  onView,
  onEdit,
  onDelete,
  onPdf,
  onPost,

  onImport,
  onExport,
  onDownloadTemplate,

  onBatchDelete,
  onBatchPost,
}) {
  const [selected, setSelected] = useState([]);
  const allChecked = rows.length > 0 && selected.length === rows.length;

  const toggleAll = () =>
    setSelected(allChecked ? [] : rows.map((r) => r.invoice_number));

  const toggleOne = (no) =>
    setSelected((prev) =>
      prev.includes(no) ? prev.filter((x) => x !== no) : [...prev, no]
    );

  const runBatch = async (fn) => {
    if (selected.length === 0) return;
    if (!window.confirm(`Apply to ${selected.length} invoices?`)) return;
    try {
      await fn(selected);
    } finally {
      setSelected([]);
    }
  };

  const pageIsFirst = page <= 1;
  const pageIsLast = totalPages <= 1 || page >= totalPages;
  const perPageOptions = [50, 100, 250, 500, 1000];

  const showingFrom =
    perPage === 0 ? (rows.length === 0 ? 0 : 1) : rows.length === 0 ? 0 : (page - 1) * perPage + 1;
  const showingTo = perPage === 0 ? rows.length : (page - 1) * perPage + rows.length;
  const totalLabel = perPage === 0 ? rows.length : (serverTotal || rows.length);

  return (
    <div className="mt-6">
      <table className="min-w-full border text-sm table-fixed">
        <colgroup>
          <col className="w-10" />
          <col className="w-10" />
          <col className="w-24" />
          <col className="w-[22rem]" />
          <col className="w-32" />
          <col className="w-40" />
          <col className="w-28" />
          <col className="w-24" />
          <col className="w-24" />
          <col className="w-28" />
          <col className="w-32" />
          <col className="w-24" />
          <col className="w-44" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <input type="checkbox" checked={allChecked} onChange={toggleAll} />
            </th>
            <th>#</th>
            <th>Date</th>
            <th>Customer</th>
            <th>Reference</th>
            <th>CU INV Number</th>
            <th>Sub-total</th>
            <th>Excise</th>
            <th>VAT</th>
            <th>Total</th>
            <th>Balance Due</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((inv, i) => (
            <tr key={inv.invoice_number}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.includes(inv.invoice_number)}
                  onChange={() => toggleOne(inv.invoice_number)}
                />
              </td>
              <td>{(perPage || rows.length) * (page - 1) + i + 1}</td>
              <td>{inv.invoice_date}</td>
              <td className="truncate">{inv.name || inv.customer_name}</td>
              <td>{inv.invoice_number}</td>
              <td className="truncate">{inv.cu_inv_number}</td>
              <td className="text-right">{fmt2(inv.amount)}</td>
              <td className="text-right">{fmt2(getExcise(inv))}</td>
              <td className="text-right">{fmt2(getVat(inv))}</td>
              <td className="text-right">
                {Number(getGrandTotal(inv)).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
              <td className="text-right">{getBalanceDue(inv)}</td>
              <td>
                <span
                  className={`px-2 py-1 rounded text-white text-xs ${
                    inv.status === "Posted"
                      ? "bg-green-600"
                      : inv.status === "Issued"
                      ? "bg-gray-600"
                      : "bg-yellow-600"
                  }`}
                >
                  {inv.status}
                </span>
              </td>
              <td className="space-x-1">
                <button
                  className="bg-green-600 px-2 py-1 text-white text-xs"
                  onClick={() => onView(inv)}
                >
                  View
                </button>
                <button
                  className="bg-blue-600 px-2 py-1 text-white text-xs"
                  onClick={() => onEdit(inv)}
                >
                  Edit
                </button>
                <button
                  className="bg-red-500 px-2 py-1 text-white text-xs"
                  onClick={() => onDelete(inv.invoice_number)}
                >
                  Delete
                </button>
                <button
                  className="bg-gray-700 px-2 py-1 text-white text-xs"
                  onClick={() => onPdf(inv.invoice_number)}
                >
                  PDF
                </button>
                <button
                  className="bg-purple-600 px-2 py-1 text-white text-xs"
                  onClick={() => onPost(inv.invoice_number)}
                >
                  Post
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination + per-page like Manager.io */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        {/* Per-page selector chips */}
        <div className="flex flex-wrap items-center gap-2">
          {perPageOptions.map((n) => (
            <button
              key={n}
              className={`px-2 py-1 rounded border text-sm ${
                perPage === n ? "bg-gray-200 font-semibold" : "hover:bg-gray-100"
              }`}
              onClick={() => onChangePerPage(n)}
            >
              {n}
            </button>
          ))}
          <button
            className={`px-2 py-1 rounded border text-sm ${
              perPage === 0 ? "bg-gray-200 font-semibold" : "hover:bg-gray-100"
            }`}
            title="Show all invoices on one page"
            onClick={() => onChangePerPage(0)}
          >
            All{serverTotal ? <span className="ml-1 opacity-70">{serverTotal}</span> : null}
          </button>
        </div>

        {/* “Showing X–Y of Z” + compact pager */}
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">
            Showing {showingFrom}-{showingTo} of {totalLabel}
          </span>

          <div className="flex items-center gap-2">
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage(1)}
              disabled={pageIsFirst || perPage === 0}
              title="First page"
            >
              ⏮
            </button>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage(page - 1)}
              disabled={pageIsFirst || perPage === 0}
              title="Previous page"
            >
              ◀
            </button>
            <span className="px-3 text-sm">
              Page {perPage === 0 ? 1 : page} of {perPage === 0 ? 1 : Math.max(totalPages, 1)}
            </span>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage(page + 1)}
              disabled={pageIsLast || perPage === 0}
              title="Next page"
            >
              ▶
            </button>
            <button
              className="px-2 py-1 border rounded disabled:opacity-50"
              onClick={() => setPage(totalPages)}
              disabled={pageIsLast || perPage === 0}
              title="Last page"
            >
              ⏭
            </button>
          </div>
        </div>
      </div>

      {/* Import/Export/Batch toolbar */}
      <hr className="my-4" />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          onChange={(e) => e.target.files[0] && onImport(e.target.files[0])}
          className="border px-2 py-1"
        />
        <button className="bg-purple-600 text-white px-3 py-1 text-sm" onClick={() => {}}>
          Import
        </button>
        <button className="bg-blue-700 text-white px-3 py-1 text-sm" onClick={onExport}>
          Export
        </button>
        <button
          className="bg-green-700 text-white px-3 py-1 text-sm"
          onClick={onDownloadTemplate}
        >
          Download Template
        </button>
        <button
          className="bg-red-700 text-white px-3 py-1 text-sm disabled:opacity-50"
          disabled={selected.length === 0}
          onClick={() => runBatch(onBatchDelete)}
        >
          Batch Delete
        </button>
        <button
          className="bg-purple-700 text-white px-3 py-1 text-sm disabled:opacity-50"
          disabled={selected.length === 0}
          onClick={() => runBatch(onBatchPost)}
        >
          Batch Post
        </button>
      </div>
    </div>
  );
}
