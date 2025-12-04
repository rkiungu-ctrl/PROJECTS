import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  getInvoice, createInvoice, updateInvoice, deleteInvoice,
  postInvoice, downloadPdfUrl, importInvoices,
  listCustomers, listProducts, listTaxes
} from "../../services/invoicesApi";
import InvoiceForm from "./InvoiceForm";
import InvoicesTable from "./InvoicesTable";
import ViewInvoiceModal from "./ViewInvoiceModal";

const API_BASE = "http://127.0.0.1:8000";
const num = (v) => Number(v ?? 0);

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxes, setTaxes] = useState([]);

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [serverPages, setServerPages] = useState(1);
  const [serverTotal, setServerTotal] = useState(0);

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [viewInvoice, setViewInvoice] = useState(null);

  const [editingInvoice, setEditingInvoice] = useState(false);
  const [formData, setFormData] = useState({
    invoice_number: "", invoice_date: "", customer_name: "",
    description: "", cu_inv_number: "",
    vat: 0, excise: 0,
    lines: []
  });

  // ---- loaders ---------------------------------------------------

  const loadOnePage = async (page, limit) => {
    const res = await fetch(`${API_BASE}/invoices?page=${page}&limit=${limit}`);
    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
    setInvoices(items);
    setServerPages(Number(data?.pages ?? 1));
    setServerTotal(Number(data?.total ?? items.length ?? 0));
  };

  // “All” loader (chunk through the API even if server doesn’t accept limit=0)
  const loadAllInvoices = async () => {
    const CHUNK = 500; // keep <= server max
    let page = 1;
    let all = [];
    let total = 0;

    const r0 = await fetch(`${API_BASE}/invoices?page=1&limit=${CHUNK}`);
    const d0 = await r0.json();
    const first = Array.isArray(d0?.items) ? d0.items : (Array.isArray(d0) ? d0 : []);
    all = all.concat(first);
    total = Number(d0?.total ?? first.length ?? 0);
    const totalPages = Number(d0?.pages ?? (Math.ceil(total / CHUNK) || 1));

    for (page = 2; page <= totalPages; page++) {
      const r = await fetch(`${API_BASE}/invoices?page=${page}&limit=${CHUNK}`);
      const d = await r.json();
      const items = Array.isArray(d?.items) ? d.items : (Array.isArray(d) ? d : []);
      all = all.concat(items);
    }

    setInvoices(all);
    setServerTotal(total || all.length);
    setServerPages(1);
    setCurrentPage(1);
  };

  const loadInvoices = async (page = 1, limit = perPage) => {
    try {
      if (limit === 0) {
        await loadAllInvoices();
      } else {
        await loadOnePage(page, limit);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load invoices");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [cust, prod, tx] = await Promise.all([
          listCustomers(), listProducts(), listTaxes()
        ]);
        setCustomers(cust);
        setProducts(prod);
        setTaxes(tx);
      } catch (e) { console.error(e); }
      await loadInvoices(1, perPage);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadInvoices(currentPage, perPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, perPage]);

  const refresh = async () => loadInvoices(currentPage, perPage);

  // ---- CRUD ------------------------------------------------------

  const onSubmit = async (payload) => {
    try {
      const { reference, ...rest } = payload;
      if (editingInvoice) {
        await updateInvoice(payload.invoice_number, rest);
        setSuccess("Invoice updated successfully");
      } else {
        await createInvoice(rest);
        setSuccess("Invoice created successfully");
      }
      setError(""); setEditingInvoice(false);
      setFormData({
        invoice_number:"", invoice_date:"", customer_name:"",
        description:"", cu_inv_number:"", vat:0, excise:0, lines:[]
      });
      await refresh();
    } catch (e) {
      console.error(e);
      setError("Failed to create/update invoice");
    }
  };

  const onEdit = async (row) => {
    try {
      const inv = await getInvoice(row.invoice_number);
      const mappedLines = (inv.lines || []).map(li => ({
        type: li.type,
        product_id: li.product_id ?? null,
        item: li.item || "",
        description: li.description || "",
        quantity: Number(li.quantity ?? 1),
        unit_price: Number(li.unit_price ?? 0),
        amount: Number(li.amount ?? 0),
        vat_code: li.vat_code || "",
        excise_code: li.excise_code || "",
        vat: Number(li.vat ?? 0),
        excise: Number(li.excise ?? 0),
      }));
      setFormData({
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        customer_name: inv.customer_name || inv.name || "",
        description: inv.description || "",
        cu_inv_number: inv.cu_inv_number || "",
        vat: inv.vat || 0,
        excise: inv.excise || 0,
        lines: mappedLines.length ? mappedLines : [{
          type:"Service", item:"", description:"", quantity:1, unit_price:0, amount:0,
          product_id:null, vat_code:"", excise_code:""
        }],
      });
      setEditingInvoice(true);
    } catch (e) {
      setError("Failed to load invoice for editing");
    }
  };

  const onDelete = async (no) => {
    if (!window.confirm("Delete this invoice?")) return;
    try { await deleteInvoice(no); setSuccess("Invoice deleted"); await refresh(); }
    catch (e) { setError("Failed to delete invoice"); }
  };

  const onPost = async (no) => {
    try { await postInvoice(no); setSuccess("Invoice posted"); await refresh(); }
    catch (e) { setError("Failed to post invoice"); }
  };

  const onPdf = (no) => window.open(downloadPdfUrl(no), "_blank");

  // ---- Batch ops (true batch delete endpoint) --------------------

  const onBatchDelete = async (invoiceNos) => {
    try {
      await fetch(`${API_BASE}/invoices/batch-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_numbers: invoiceNos }),
      });
      setSuccess(`Deleted ${invoiceNos.length} invoices`);
      await refresh();
    } catch (e) {
      console.error(e);
      setError("Batch delete failed");
    }
  };

  const onBatchPost = async (invoiceNos) => {
    try {
      await Promise.all(invoiceNos.map((no) => postInvoice(no)));
      setSuccess(`Posted ${invoiceNos.length} invoices`);
      await refresh();
    } catch (e) {
      console.error(e);
      setError("Batch post failed");
    }
  };

  // ---- Import/Export/Template -----------------------------------

  const onImport = async (file) => {
    try { await importInvoices(file); setSuccess("Imported"); await refresh(); }
    catch (e) { setError("Failed to import invoices"); }
  };

  const downloadTemplate = () => {
    const headers = [
      "invoice_number","invoice_date","client_number","description",
      "reference","cu_inv_number","type","product_id","service_item","item",
      "quantity","unit_price","vat_code","excise_code",
      "line_vat","line_excise","line_total"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "invoice_template.xlsx");
  };

  // ---- client filter over loaded items ---------------------------

  const filtered = invoices.filter(i =>
    (i.invoice_number || "").toLowerCase().includes(search.toLowerCase()) ||
    (i.customer_name || i.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const computedRows = filtered.map(inv => {
    const ex = inv.excise || (Array.isArray(inv.lines) ? inv.lines.reduce((s,l)=>s + (Number(l.excise||0)),0) : 0);
    const va = inv.vat    || (Array.isArray(inv.lines) ? inv.lines.reduce((s,l)=>s + (Number(l.vat||0)),0) : 0);
    const total = inv.grand_total ?? (num(inv.amount) + num(ex) + num(va));
    const paid = num(inv.receipted_amount);
    const balance_due = inv.balance_due ?? (total - paid);
    return { ...inv, _total: total, _balance_due: balance_due, excise: ex, vat: va };
  });

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">{editingInvoice ? "Edit Invoice" : "Create Invoice"}</h2>
      {error && <p className="text-red-500">{error}</p>}
      {success && <p className="text-green-600">{success}</p>}

      <InvoiceForm
        editing={editingInvoice}
        data={formData}
        setData={setFormData}
        customers={customers}
        products={products}
        taxes={taxes}
        onSubmit={onSubmit}
      />

      {/* Search */}
      <div className="flex mb-2 mt-8">
        <input
          className="border px-2 py-1 mr-2"
          placeholder="Search invoices..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
        />
        <button className="bg-blue-600 text-white px-3 py-1" onClick={() => setCurrentPage(1)}>
          Search
        </button>
      </div>

      <InvoicesTable
        rows={computedRows}
        page={currentPage}
        perPage={perPage}
        totalPages={serverPages}
        serverTotal={serverTotal}
        setPage={setCurrentPage}
        onChangePerPage={(val) => { setPerPage(val); setCurrentPage(1); }}

        onView={async (r) => setViewInvoice(await getInvoice(r.invoice_number))}
        onEdit={onEdit}
        onDelete={onDelete}
        onPdf={onPdf}
        onPost={onPost}
        onImport={onImport}
        onExport={() => {
          const ws = XLSX.utils.json_to_sheet(invoices); // exports what is loaded (page or all)
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Invoices");
          XLSX.writeFile(wb, "invoices.xlsx");
        }}
        onDownloadTemplate={downloadTemplate}
        onBatchDelete={onBatchDelete}
        onBatchPost={onBatchPost}
      />

      {viewInvoice && (
        <ViewInvoiceModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />
      )}
    </div>
  );
}
