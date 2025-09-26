import React, { useEffect, useState } from "react";
import axios from "axios";

const Taxes = () => {
  const [taxes, setTaxes] = useState([]);
  const [accounts, setAccounts] = useState([]);
  
  const [taxId, setTaxId] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    type: "VAT",
    rate: "",
    start_date: "",
    end_date: "",
    account_code: "",
  });

  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editId, setEditId] = useState(null);

  useEffect(() => {
    fetchTaxes();
    fetchAccounts();
  }, []);

  const fetchTaxes = async () => {
    try {
      const res = await axios.get("http://localhost:8000/taxes/");
      setTaxes(res.data);
    } catch (err) {
      console.error("Failed to fetch taxes");
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await axios.get("http://localhost:8000/accounts/");
      const mapped = res.data.map((acc) => ({
        code: acc.account_code,
        label: `${acc.account_code} - ${acc.name}`,
      }));
      setAccounts(mapped);
    } catch (err) {
      console.error("Failed to fetch accounts");
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess("");
    setError("");

    // Prepare safe payload
    const payload = {
      ...formData,
      rate: parseFloat(formData.rate), // Ensure it's a float
      end_date: formData.end_date?.trim() === "" ? null : formData.end_date,
    };

    try {
      if (isEditing) {
        await axios.put(`http://localhost:8000/taxes/${editId}`, payload);
        setSuccess("Tax updated successfully.");
      } else {
        await axios.post("http://localhost:8000/taxes/", payload);
        setSuccess("Tax added successfully.");
      }

      setFormData({
        name: "",
        type: "VAT",
        rate: "",
        start_date: "",
        end_date: "",
        account_code: "",
      });
      setIsEditing(false);
      setEditId(null);
      fetchTaxes();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Failed to submit tax");
    }
  };

  const handleEdit = (tax) => {
    setFormData({
      name: tax.name,
      type: tax.type,
      rate: tax.rate,
      start_date: tax.start_date,
      end_date: tax.end_date || "",
      account_code: tax.account_code,
    });
    setIsEditing(true);
    setEditId(tax.id);
    setTaxId(tax.id);
  };

  const handleDelete = async (id) => {
  if (!window.confirm("Are you sure you want to delete this tax?")) return;
  try {
    // 🔁 Fetch tax to get its `id` based on name
    const res = await axios.get("http://localhost:8000/taxes/");
    const match = res.data.find((t) => t.name === taxName);

    if (!match) {
      setError("Tax not found.");
      return;
    }

    await axios.delete(`http://localhost:8000/taxes/${match.id}`);
    setSuccess("Tax deleted.");
    fetchTaxes();
  } catch (err) {
    setError("Failed to delete tax.");
    console.error(err);
  }
};


  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">
        {isEditing ? "Edit Tax" : "Create New Tax"}
      </h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4 mb-6">
        <input
          type="text"
          name="name"
          value={formData.name}
          placeholder="Tax Name (e.g., VAT 16%)"
          onChange={handleChange}
          className="border p-2"
          required
        />
        <select
          name="type"
          value={formData.type}
          onChange={handleChange}
          className="border p-2"
        >
          <option value="VAT">VAT</option>
          <option value="Excise">Excise</option>
        </select>
        <input
          type="number"
          name="rate"
          value={formData.rate}
          placeholder="Rate (e.g., 0.16)"
          step="0.01"
          onChange={handleChange}
          className="border p-2"
          required
        />
        <select
          name="account_code"
          value={formData.account_code}
          onChange={handleChange}
          className="border p-2"
          required
        >
          <option value="">-- Select Account --</option>
          {accounts.map((acc) => (
            <option key={acc.code} value={acc.code}>
              {acc.label}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="start_date"
          value={formData.start_date}
          onChange={handleChange}
          className="border p-2"
          required
        />
        <input
          type="date"
          name="end_date"
          value={formData.end_date}
          onChange={handleChange}
          className="border p-2"
        />
        <button
          type="submit"
          className="col-span-2 bg-blue-600 text-white px-4 py-2 rounded"
        >
          {isEditing ? "Update Tax" : "Add Tax"}
        </button>
        {success && <p className="col-span-2 text-green-600">{success}</p>}
        {error && <p className="col-span-2 text-red-600">{error}</p>}
      </form>

      <h2 className="text-xl font-bold mb-4">All Taxes</h2>
      <table className="w-full table-auto border">
        <thead className="bg-gray-200">
          <tr>
            <th className="border px-2 py-1">Name</th>
            <th className="border px-2 py-1">Type</th>
            <th className="border px-2 py-1">Rate (%)</th>
            <th className="border px-2 py-1">Account Code</th>
            <th className="border px-2 py-1">Start Date</th>
            <th className="border px-2 py-1">End Date</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {taxes.map((tax) => (
            <tr key={tax.id}>
              <td className="border px-2 py-1">{tax.name}</td>
              <td className="border px-2 py-1">{tax.type}</td>
              <td className="border px-2 py-1">{tax.rate}</td>
              <td className="border px-2 py-1">{tax.account_code}</td>
              <td className="border px-2 py-1">{tax.start_date}</td>
              <td className="border px-2 py-1">
                {tax.end_date || <span className="text-gray-400">–</span>}
              </td>
              <td className="border px-2 py-1 space-x-2">
                <button
                  onClick={() => handleEdit(tax)}
                  className="bg-yellow-500 text-white px-2 py-1 rounded"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(tax.name)}
                  className="bg-red-600 text-white px-2 py-1 rounded"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Taxes;
