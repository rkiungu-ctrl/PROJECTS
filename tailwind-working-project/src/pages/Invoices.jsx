// ✅ FINAL PATCH — Service Quantity Editable, Date Column Shown, Template Fixed
import React, { useEffect, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";
import Select from "react-select";
import { FaTrash } from "react-icons/fa";
import CompanyHeader from "../components/CompanyHeader";

const API_BASE = "http://127.0.0.1:8000";
const GET_PROFILE = `${API_BASE}/company/profile`;

const Invoices = () => {
  const [invoices, setInvoices] = useState([]);
  const [file, setFile] = useState(null);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [description, setDescription] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerOptions, setCustomerOptions] = useState([]);
  const [productOptions, setProductOptions] = useState([]);
  const [vat, setVat] = useState(0);
  const [excise, setExcise] = useState(0);
  const [lineItems, setLineItems] = useState([]);
  const [taxOptions, setTaxOptions] = useState([]);
  const [subtotal, setSubtotal] = useState(0);
  const [totalVat, setTotalVat] = useState(0);
  const [totalExcise, setTotalExcise] = useState(0);
  const [grandTotal, setGrandTotal] = useState(0);
  const [company, setCompany] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState([]);

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
      inv.customer_name?.toLowerCase().includes(search.toLowerCase())
  );
  const totalPages = Math.ceil(filteredInvoices.length / itemsPerPage);
  const currentInvoices = filteredInvoices.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
    fetchProducts();
    fetchTaxes();
  }, []);

  useEffect(() => {
    calculateTotals();
  }, [lineItems]);

  useEffect(() => {
    fetch(GET_PROFILE)
      .then((res) => res.json())
      .then((data) => setCompany(data));
  }, []);

  const fetchInvoices = async () => {
    try {
      const res = await axios.get("http://localhost:8000/invoices/");
      setInvoices(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await axios.get("http://localhost:8000/customers/");
      const options = res.data.map((cust) => ({
        value: cust.name,
        label: `${cust.client_number} - ${cust.name}`,
      }));
      setCustomerOptions(options);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await axios.get("http://localhost:8000/products/");
      setProductOptions(res.data);
    } catch (err) {
      console.error(err);
    }
  };
  const fetchTaxes = async () => {
    try {
      const res = await axios.get("http://127.0.0.1:8000/taxes/");
      const options = res.data.map((t) => ({
        code: t.code,                    // ✅ Needed for matching
        label: t.name,
        value: t.account_code,
        rate: t.rate,
        type: t.type,
        start_date: t.start_date,
        end_date: t.end_date,
      }));

      setTaxOptions(options);
    } catch (err) {
      console.error("Failed to fetch taxes", err);
    }
    };


  // 🔹 Adds a new blank line item with default fields including tax
  const handleAddItem = () => {
  setLineItems([
    ...lineItems,
    {
      type: "Service",
      item: "",
      description: "",
      quantity: 1,
      unit_price: 0,
      amount: 0,
      product_id: null,
      vat_code: "",
      excise_code: "",
    },
  ]);
};

// 🔹 Updates individual line item fields (type, product_id, quantity, price, tax)
  const handleLineItemChange = (idx, field, value) => {
  const updatedItems = [...lineItems];
  updatedItems[idx][field] = value;

  // Parse values
  const quantity = parseFloat(updatedItems[idx].quantity) || 0;
  const unit_price = parseFloat(updatedItems[idx].unit_price) || 0;
  const vat_code = updatedItems[idx].vat_code;
  const excise_code = updatedItems[idx].excise_code;

    // Recalculate
  const base = quantity * unit_price;

  const exciseRate = getTaxRateByCodeAndDate(excise_code, invoiceDate) || 0;
  const exciseAmount = base * exciseRate;

  const vatRate = getTaxRateByCodeAndDate(vat_code, invoiceDate) || 0;
  const vatAmount = (base + exciseAmount) * vatRate;

  const total = base + exciseAmount + vatAmount;
  updatedItems[idx].amount = parseFloat(total.toFixed(2));

  setLineItems(updatedItems);
};

// 🔹 Deletes a line item from the invoice
  const handleRemoveItem = (index) => {
    if (!window.confirm("Are you sure you want to delete this line item?")) return;
    const updatedItems = [...lineItems];
    updatedItems.splice(index, 1);
    setLineItems(updatedItems);
  };

// 🔹 Calculates total invoice amount by summing line item amountsA
  const getTaxRateByCodeAndDate = (code, date) => {
  if (!code || !taxOptions || taxOptions.length === 0) return 0;

  console.log("🔍 Checking tax:", code, date);
  console.log("🔍 Available taxOptions:", taxOptions);

  const validTaxes = taxOptions.filter((t) => t.value === code);
  const invoiceDt = new Date(date);

  const matchedTax = validTaxes.find((t) => {
    const start = new Date(t.start_date);
    const end = t.end_date ? new Date(t.end_date) : null;
    return invoiceDt >= start && (!end || invoiceDt <= end);
  });

  return matchedTax ? matchedTax.rate : 0;
};

  const getTaxLabel = (code, type) => {
  if (!code) return null;
  const tax = taxOptions.find((t) => t.type === type && t.value === code);
  return tax ? { label: `${tax.type} ${tax.rate * 100}%`, value: tax.value } : null;

};

  const getTaxOptions = (type) => {
  return taxOptions
    .filter((t) => t.type === type)
    .map((t) => ({
      label: `${t.type} ${t.rate * 100}%`,
      value: t.value,   // ✅ Use tax.code here (e.g. "VAT16", "091", etc.)
    }));
};

// 🔹 Places summary table
const calculateTotals = () => {
  // Use the actual invoice date if available
  const invoiceDt = invoiceDate || new Date().toISOString().split("T")[0];

  let subtotalSum = 0;
  let vatSum = 0;
  let exciseSum = 0;

  lineItems.forEach((li) => {
    const lineAmount = li.quantity * li.unit_price;
    subtotalSum += lineAmount;

    const exciseRate = getTaxRateByCodeAndDate(li.excise_code, invoiceDt);
    const exciseAmount = lineAmount * exciseRate;
    exciseSum += exciseAmount;

    const vatRate = getTaxRateByCodeAndDate(li.vat_code, invoiceDt);
    const vatAmount = (lineAmount + exciseAmount) * vatRate;
    vatSum += vatAmount;
  });

  setSubtotal(Number(subtotalSum.toFixed(2)));
  setTotalExcise(Number(exciseSum.toFixed(2)));
  setTotalVat(Number(vatSum.toFixed(2)));
  setGrandTotal(Number((subtotalSum + exciseSum + vatSum).toFixed(2)));
};
const handleCreateInvoice = async () => {
  try {
    const payload = {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      customer_name: selectedCustomer?.value || "",
      description,
      amount: subtotal,
      vat,
      excise,
      lines: lineItems.map((li) => ({
        type: li.type,
        product_id: li.type === "Product" ? li.product_id || null : null,
        item: li.item || "",
        description: li.description || "",
        quantity: li.quantity || 1,
        amount: li.amount || 0,
      })),
    };

    await axios.post("http://localhost:8000/invoices/", payload);
    setSuccess("Invoice created successfully");
    fetchInvoices();
    resetForm();
  } catch (err) {
    console.error(err);
    setError("Failed to create invoice");
  }
};


// 🔹 Sends invoice data to backend (POST for create, PUT for update)
  const handleCreateOrUpdate = async () => {
    const totalAmount = calculateTotalAmount();
    const payload = {
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      customer_name: selectedCustomer?.value,
      description,
      amount: totalAmount,
      vat: parseFloat(vat),
      excise: parseFloat(excise),
      lines: lineItems.map((li) => ({
        type: li.type,
        product_id: li.type === "Product" ? li.product_id : null,
        item: li.item,
        description: li.description,
        quantity: li.quantity,
        unit_price: li.unit_price,
        amount: li.amount,
        vat: li.vat || 0,
        excise: li.excise || 0,
      })),
    };
    console.log(payload);
    try {
      if (editingInvoice) {
        await axios.put(`http://localhost:8000/invoices/${invoiceNumber}`, payload);
        setSuccess("Invoice updated successfully");
      } else {
        await axios.post("http://localhost:8000/invoices/", payload);
        setSuccess("Invoice created successfully");
      }
      resetForm();
      fetchInvoices();
    } catch (err) {
      console.error(err);
      setError("Failed to create/update invoice");
    }
  };

  // 🔹 Loads existing invoice data for editing
  const handleEdit = async (inv) => {
    try {
      const res = await axios.get(`http://localhost:8000/invoices/${inv.invoice_number}`);
      const invoice = res.data;
      setInvoiceNumber(invoice.invoice_number);
      setInvoiceDate(invoice.invoice_date);
      setDescription(invoice.description);
      setVat(invoice.vat);
      setExcise(invoice.excise);
      setSelectedCustomer(customerOptions.find((c) => c.value === invoice.customer_name));
      setLineItems(
        invoice.lines.map((li) => ({
          type: li.type,
          product_id: li.product_id || null,
          item: li.item || "",
          description: li.description || "",
          quantity: li.quantity || 1,
          unit_price: li.unit_price ?? 0,
          amount: li.amount ?? (li.unit_price ?? 0) * (li.quantity ?? 1),
          vat: li.vat ?? 0,
          excise: li.excise ?? 0,
          vat_code: li.vat_code || "",
          excise_code: li.excise_code || "",
        }))
      );
      setEditingInvoice(true);
    } catch (err) {
      console.error(err);
      setError("Failed to load invoice for editing");
    }
  };
  
  const handleDelete = async (invoiceNumber) => {
    if (!window.confirm("Are you sure you want to delete this invoice?")) return;
    try {
      await axios.delete(`http://localhost:8000/invoices/${invoiceNumber}`);
      setSuccess("Invoice deleted successfully");
      fetchInvoices();
    } catch (err) {
      console.error(err);
      setError("Failed to delete invoice");
    }
  };

  const handlePostToJournal = async (invoiceNumber) => {
    try {
      await axios.post(`http://localhost:8000/invoices/${invoiceNumber}/post_to_journal`);
      setSuccess("Invoice posted to journal");
      fetchInvoices();
    } catch (err) {
      console.error(err);
      setError("Failed to post invoice to journal");
    }
  };

  const handleDownloadPDF = (invoiceNumber) => {
    window.open(`http://localhost:8000/invoices/${invoiceNumber}/pdf`, "_blank");
  };

  const handleFileUpload = async () => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      await axios.post("http://localhost:8000/invoices/import", formData);
      setSuccess("Invoices imported successfully");
      setFile(null);
      fetchInvoices();
    } catch (err) {
      console.error(err);
      setError("Failed to import invoices");
    }
  };

  const downloadTemplate = () => {
    const headers = [
      "invoice_number", "invoice_date", "client_number", "description",
      "type", "product_id", "item", "quantity", "amount", "vat", "excise"
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, "invoice_template.xlsx");
  };

  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(invoices);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Invoices");
    XLSX.writeFile(workbook, "invoices.xlsx");
  };

  const resetForm = () => {
    setInvoiceNumber("");
    setInvoiceDate("");
    setDescription("");
    setSelectedCustomer(null);
    setVat(0);
    setExcise(0);
    setLineItems([]);
    setEditingInvoice(false);
    setError("");
    setSuccess("");
  };
  
    const calculateTotalAmount = () => {
        return subtotal + totalVat + totalExcise;
      };
  
  // Add this above your return (
const handleSelectInvoice = (invoiceNumber) => {
  setSelectedInvoices((prev) =>
    prev.includes(invoiceNumber)
      ? prev.filter((num) => num !== invoiceNumber)
      : [...prev, invoiceNumber]
  );
};

const handleBatchDelete = async () => {
  if (selectedInvoices.length === 0) return;
  if (!window.confirm(`Delete ${selectedInvoices.length} selected invoices?`)) return;
  let failed = [];
  for (const num of selectedInvoices) {
    try {
      await axios.delete(`http://localhost:8000/invoices/${num}`);
    } catch (err) {
      failed.push(num);
    }
  }
  if (failed.length === 0) {
    setSuccess("Selected invoices deleted successfully");
    setError("");
  } else {
    setError(`Failed to delete invoices: ${failed.join(", ")}`);
    setSuccess("");
  }
  setSelectedInvoices([]);
  fetchInvoices();
};

// 🔷 Invoice Form Section (Header, Customer, Date, Description)
return (
  <div className="p-4">
        <h2 className="text-xl font-bold mb-4">
      {editingInvoice ? "Edit Invoice" : "Create Invoice"}
    </h2>
    {error && <p className="text-red-500">{error}</p>}
    {success && <p className="text-green-600">{success}</p>}

    <div className="space-y-2 mb-4">
      <input
        value={invoiceNumber}
        onChange={(e) => setInvoiceNumber(e.target.value)}
        placeholder="Invoice Number"
        className="border px-2 py-1 w-full"
      />
      <input
        type="date"
        value={invoiceDate}
        onChange={(e) => setInvoiceDate(e.target.value)}
        className="border px-2 py-1 w-full"
      />
      <Select
        options={customerOptions}
        value={selectedCustomer}
        onChange={setSelectedCustomer}
        placeholder="Select Customer"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className="border px-2 py-1 w-full"
      />
    </div>calculateTotals
    
    {/* 🔷 Line Items Entry Section */}
<h3 className="font-semibold mb-2">Line Items</h3>
{lineItems.length === 0 && handleAddItem()} {/* Always show at least 1 row */}
{lineItems.map((li, idx) => (
  <div key={idx} className="grid grid-cols-11 gap-2 mb-2 items-center text-sm">
    <select
      value={li.type}
      onChange={(e) => handleLineItemChange(idx, "type", e.target.value)}
      className="border px-2 py-1"
    >
      <option value="Service">Service</option>
      <option value="Product">Product</option>
    </select>

    {li.type === "Product" ? (
      <select
        value={li.product_id || ""}
        onChange={(e) =>
          handleLineItemChange(idx, "product_id", e.target.value)
        }
        className="border px-2 py-1"
      >
        <option value="">Select Product</option>
        {productOptions.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    ) : (
      <input
        value={li.item}
        onChange={(e) =>
          handleLineItemChange(idx, "item", e.target.value)
        }
        placeholder="Service Item"
        className="border px-2 py-1"
      />
    )}

    <input
      value={li.description}
      onChange={(e) =>
        handleLineItemChange(idx, "description", e.target.value)
      }
      placeholder="Description"
      className="border px-2 py-1"
    />

    <input
      type="number"
      value={li.quantity}
      onChange={(e) =>
        handleLineItemChange(idx, "quantity", parseFloat(e.target.value) || 0)
      }
      className="border px-2 py-1 w-full"
    />

    <input
      type="number"
      value={li.unit_price}
      onChange={(e) =>
        handleLineItemChange(idx, "unit_price", parseFloat(e.target.value) || 0)
      }
      className="border px-2 py-1 w-full"
    />

    <Select
      className="text-xs min-w-[100px]"
      options={getTaxOptions("VAT")}
      value={getTaxLabel(li.vat_code, "VAT")}
      onChange={(e) =>
        handleLineItemChange(idx, "vat_code", e ? e.value : "")
      }
      isClearable
      placeholder="VAT"
    />

    <Select
      className="text-xs min-w-[100px]"
      options={getTaxOptions("Excise")}
      value={getTaxLabel(li.excise_code, "Excise")}
      onChange={(e) =>
        handleLineItemChange(idx, "excise_code", e ? e.value : "")
      }
      isClearable
      placeholder="Excise"
    />

    <input
      type="number"
      value={li.amount || 0}
      readOnly
      className="border px-2 py-1 bg-gray-100"
    />

    <button
      onClick={() => handleRemoveItem(idx)}
      className="text-red-600"
      title="Remove"
    >
      <FaTrash />
    </button>

    {/* Add Item Button - inline with last row */}
    {idx === lineItems.length - 1 && (
      <button
        onClick={handleAddItem}
        className="bg-blue-500 text-white px-2 py-1 text-xs rounded"
      >
        + Add Item
      </button>
    )}
  </div>
))}

    {/* 🔷 Summary Table */}
    <table className="w-full mb-4 text-sm">
      <tbody>
        <tr className="bg-gray-100 font-semibold">
          <td colSpan="7"></td>
          <td className="text-right pr-2">Subtotal</td>
          <td className="text-right">{(subtotal.toFixed(1) + '0')}</td>
        </tr>
        <tr className="bg-gray-100 font-semibold">
          <td colSpan="7"></td>
          <td className="text-right pr-2">Total Excise</td>
          <td className="text-right">{(totalExcise.toFixed(1) + '0')}</td>
        </tr>
        <tr className="bg-gray-100 font-semibold">
          <td colSpan="7"></td>
          <td className="text-right pr-2">Total VAT</td>
          <td className="text-right">{(totalVat.toFixed(1) + '0')}</td>
        </tr>
        <tr className="bg-gray-200 font-bold">
          <td colSpan="7"></td>
          <td className="text-right pr-2">Grand Total</td>
          <td className="text-right">{grandTotal.toFixed(2)}</td>
        </tr>
      </tbody>
    </table>
   
    
   {/* 🔷 Create Invoice/Update Invoice button */} 
    <div className="mt-4">
      <button
            onClick={editingInvoice ? handleCreateOrUpdate : handleCreateInvoice}
          className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded shadow"
        >
          {editingInvoice ? "Update Invoice" : "Create Invoice"}
      </button>
    </div>

    {/* 🔷 Invoice List Table (below form) */}
    <div className="mt-6">
      <table className="w-full border text-sm">
        <thead className="bg-gray-200">
          <tr>
            <th className="px-2 py-2">
              <input
                type="checkbox"
                checked={currentInvoices.every((inv) => selectedInvoices.includes(inv.invoice_number))}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedInvoices(currentInvoices.map((inv) => inv.invoice_number));
                  } else {
                    setSelectedInvoices([]);
                  }
                }}
              />
            </th>
            <th className="text-left px-2 py-2">#</th>
            <th className="text-left px-2 py-2">Invoice Number</th>
            <th className="text-left px-2 py-2">Date</th>
            <th className="text-left px-2 py-2">Customer</th>
            <th className="text-right px-2 py-2">Amount</th>
            <th className="text-left px-2 py-2">Status</th>
            <th className="text-left px-2 py-2">Actions</th>
          </tr>
        </thead>

        <tbody>
          {currentInvoices.map((inv, index) => (
            <tr key={inv.invoice_number}>
              <td className="border px-2 text-center">
                <input
                  type="checkbox"
                  checked={selectedInvoices.includes(inv.invoice_number)}
                  onChange={() => handleSelectInvoice(inv.invoice_number)}
                />
              </td>
              <td className="border px-2 text-center">
                {(currentPage - 1) * itemsPerPage + index + 1}
              </td>
              <td className="border px-2">{inv.invoice_number}</td>
              <td className="border px-2">{inv.invoice_date}</td>
              <td className="border px-2">{inv.customer_name}</td>
              <td className="border px-2 text-left">
                {inv.amount?.toFixed(2) || "0.00"}
              </td>
              <td className="border px-2 text-center">
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
              <td className="border px-2 space-x-1 text-center">
                <button
                  onClick={() => handleEdit(inv)}
                  className="bg-yellow-500 px-2 py-1 text-white text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(inv.invoice_number)}
                  className="bg-red-500 px-2 py-1 text-white text-xs"
                >
                  Delete
                </button>
                <button
                  onClick={() => handlePostToJournal(inv.invoice_number)}
                  className="bg-blue-600 px-2 py-1 text-white text-xs"
                >
                  Post
                </button>
                <button
                  onClick={() => handleDownloadPDF(inv.invoice_number)}
                  className="bg-gray-700 px-2 py-1 text-white text-xs"
                >
                  PDF
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* 🔷 Pagination Buttons */}
      <div className="mt-4 space-x-2">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i + 1}
            onClick={() => setCurrentPage(i + 1)}
            className={`px-2 py-1 border ${
              currentPage === i + 1 ? "bg-gray-300 font-bold" : ""
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <hr className="my-4" />

      {/* 🔷 Import / Export / Template */}
      <div className="space-x-2">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files[0])}
          className="border px-2 py-1"
        />
        <button
          onClick={handleFileUpload}
          className="bg-purple-600 text-white px-3 py-1 text-sm"
        >
          Import
        </button>
        <button
          onClick={exportToExcel}
          className="bg-blue-700 text-white px-3 py-1 text-sm"
        >
          Export
        </button>
        <button
          onClick={downloadTemplate}
          className="bg-green-700 text-white px-3 py-1 text-sm"
        >
          Download Template
        </button>
        <button
          onClick={handleBatchDelete}
          className="bg-red-700 text-white px-3 py-1 text-sm"
          disabled={selectedInvoices.length === 0}
        >
          Batch Delete
        </button>
      </div>
    </div>
  </div>
);
};

// 🔚 Export Component
export default Invoices;
