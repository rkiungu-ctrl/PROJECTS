import React, { useEffect, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [file, setFile] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [editData, setEditData] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Add Customer Form State
  const [clientNumber, setClientNumber] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [kraPin, setKraPin] = useState("");
  const [address, setAddress] = useState("");

  useEffect(() => {
    fetchCustomers();
  }, []);

  useEffect(() => {
    handleSearch(searchTerm);
  }, [customers, searchTerm]);

  const fetchCustomers = async () => {
    try {
      const res = await axios.get("http://127.0.0.1:8000/customers/", {
        auth: {
          username: localStorage.getItem("username"),
          password: localStorage.getItem("password"),
        },
      });
      setCustomers(res.data);
    } catch {
      setError("Failed to fetch customers.");
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    try {
      await axios.post(
        "http://127.0.0.1:8000/customers/",
        {
          client_number: parseInt(clientNumber),
          name,
          phone,
          email,
          kra_pin: kraPin,
          address,
        },
        {
          auth: {
            username: localStorage.getItem("username"),
            password: localStorage.getItem("password"),
          },
        }
      );
      setSuccess("Customer added successfully!");
      setClientNumber("");
      setName("");
      setPhone("");
      setEmail("");
      setKraPin("");
      setAddress("");
      fetchCustomers();
    } catch (err) {
      setError("Error adding customer.");
    }
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(customers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, "customers_export.xlsx");
  };

  const handleFileChange = (e) => setFile(e.target.files[0]);

  const handleImport = async () => {
    if (!file) return setError("Please select a file.");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(
        "http://127.0.0.1:8000/customer_import/upload",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          auth: {
            username: localStorage.getItem("username"),
            password: localStorage.getItem("password"),
          },
        }
      );
      setSuccess(res.data.message);
      setFile(null);
      fetchCustomers();
    } catch (err) {
      setError(err.response?.data?.detail || "Import failed.");
    }
  };

  const handleSearch = (term) => {
    setSearchTerm(term);
    const lower = term.toLowerCase();
    const results = customers.filter(
      (cust) =>
        cust.name.toLowerCase().includes(lower) ||
        cust.client_number.toString().includes(lower)
    );
    setFilteredCustomers(results);
    setCurrentPage(1);
  };

  const startIdx = (currentPage - 1) * itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(
    startIdx,
    startIdx + itemsPerPage
  );
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this customer?")) return;
    try {
      await axios.delete(`http://127.0.0.1:8000/customers/${id}`, {
        auth: {
          username: localStorage.getItem("username"),
          password: localStorage.getItem("password"),
        },
      });
      fetchCustomers();
    } catch {
      setError("Failed to delete customer.");
    }
  };

  const beginEdit = (customer) => {
    setEditingCustomer(customer.id);
    setEditData({ ...customer });
  };

  const cancelEdit = () => {
    setEditingCustomer(null);
    setEditData({});
  };

  const saveEdit = async () => {
    try {
      await axios.put(
        `http://127.0.0.1:8000/customers/${editingCustomer}`,
        {
          client_number: editData.client_number,
          name: editData.name,
          phone: editData.phone,
          email: editData.email,
          kra_pin: editData.kra_pin,
          address: editData.address,
        },
        {
          auth: {
            username: localStorage.getItem("username"),
            password: localStorage.getItem("password"),
          },
        }
      );
      setEditingCustomer(null);
      fetchCustomers();
    } catch {
      setError("Failed to update customer.");
    }
  };

  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-4">Customer Management</h2>

      {success && (
        <div className="bg-green-100 text-green-800 p-2 mb-4 rounded">{success}</div>
      )}
      {error && (
        <div className="bg-red-100 text-red-800 p-2 mb-4 rounded">{error}</div>
      )}

      {/* Add Customer */}
      <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <input type="number" placeholder="Client Number" value={clientNumber} onChange={(e) => setClientNumber(e.target.value)} className="border p-2 rounded" required />
        <input type="text" placeholder="Customer Name" value={name} onChange={(e) => setName(e.target.value)} className="border p-2 rounded" required />
        <input type="text" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} className="border p-2 rounded" />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="border p-2 rounded" />
        <input type="text" placeholder="KRA PIN" value={kraPin} onChange={(e) => setKraPin(e.target.value)} className="border p-2 rounded" />
        <input type="text" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} className="border p-2 rounded" />
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded col-span-1 md:col-span-2">
          Add Customer
        </button>
      </form>

      {/* Tools */}
      <div className="mb-4 flex items-center justify-between">
        <input
          type="text"
          placeholder="Search by name or client number"
          className="border p-2 rounded w-1/2"
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
        />
        <div className="flex space-x-2">
          <button onClick={handleExport} className="bg-green-600 text-white px-4 py-2 rounded">
            Export
          </button>
          <input type="file" accept=".csv,.xlsx" onChange={handleFileChange} />
          <button onClick={handleImport} className="bg-yellow-600 text-white px-4 py-2 rounded">
            Upload
          </button>
        </div>
      </div>

      {/* Table */}
      <table className="w-full border border-gray-300 mb-4">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-2 border">Client #</th>
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Phone</th>
            <th className="p-2 border">Email</th>
            <th className="p-2 border">KRA PIN</th>
            <th className="p-2 border">Address</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {paginatedCustomers.map((cust) =>
            editingCustomer === cust.id ? (
              <tr key={cust.id} className="border-t">
                <td className="p-2 border">{cust.client_number}</td>
                <td className="p-2 border"><input value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })} className="border px-2 py-1 rounded" /></td>
                <td className="p-2 border"><input value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })} className="border px-2 py-1 rounded" /></td>
                <td className="p-2 border"><input value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })} className="border px-2 py-1 rounded" /></td>
                <td className="p-2 border"><input value={editData.kra_pin} onChange={(e) => setEditData({ ...editData, kra_pin: e.target.value })} className="border px-2 py-1 rounded" /></td>
                <td className="p-2 border"><input value={editData.address} onChange={(e) => setEditData({ ...editData, address: e.target.value })} className="border px-2 py-1 rounded" /></td>
                <td className="p-2 border space-x-2">
                  <button onClick={saveEdit} className="bg-blue-600 text-white px-2 py-1 rounded">Save</button>
                  <button onClick={cancelEdit} className="bg-gray-400 text-white px-2 py-1 rounded">Cancel</button>
                </td>
              </tr>
            ) : (
              <tr key={cust.id} className="border-t">
                <td className="p-2 border">{cust.client_number}</td>
                <td className="p-2 border">{cust.name}</td>
                <td className="p-2 border">{cust.phone}</td>
                <td className="p-2 border">{cust.email}</td>
                <td className="p-2 border">{cust.kra_pin}</td>
                <td className="p-2 border">{cust.address}</td>
                <td className="p-2 border space-x-2">
                  <button onClick={() => beginEdit(cust)} className="bg-blue-500 text-white px-2 py-1 rounded">Edit</button>
                  <button onClick={() => handleDelete(cust.id)} className="bg-red-600 text-white px-2 py-1 rounded">Delete</button>
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>

      {/* Pagination */}
      <div className="flex justify-center items-center space-x-4">
        <button
          disabled={currentPage === 1}
          onClick={() => setCurrentPage((prev) => prev - 1)}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          Previous
        </button>
        <span className="font-semibold">Page {currentPage} of {totalPages}</span>
        <button
          disabled={currentPage === totalPages}
          onClick={() => setCurrentPage((prev) => prev + 1)}
          className="px-3 py-1 bg-gray-200 rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
};

export default Customers;
