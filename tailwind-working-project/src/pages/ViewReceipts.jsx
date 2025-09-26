import React, { useEffect, useState } from "react";
import axios from "axios";
import { saveAs } from "file-saver";

const ViewReceipts = () => {
  const [receipts, setReceipts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOldestFirst, setSortOldestFirst] = useState(true);

  useEffect(() => {
    console.log("✅ useEffect triggered");
    fetchReceipts();
  }, []);

  const fetchReceipts = async () => {
    console.log("📡 Fetching receipts...");
    try {
      const res = await axios.get("http://127.0.0.1:8000/receipts/");
      console.log("📦 Fetched receipts:", res.data);
      setReceipts(res.data);
    } catch (err) {
      console.error("❌ Failed to fetch receipts", err);
    }
  };

  const handleSearchChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const toggleSort = () => {
    setSortOldestFirst((prev) => !prev);
  };

  const filteredReceipts = receipts
    .filter((r) =>
      (r.reference || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.narration || "").toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return sortOldestFirst ? dateA - dateB : dateB - dateA;
    });

  const exportCSV = () => {
    const header = "Date,Reference,Narration,Customer,Amount,Bank Account\n";
    const rows = filteredReceipts.map((r) =>
      `${r.date},${r.reference},${r.narration},${r.customer_name},${r.amount},${r.bank_account}`
    );
    const csvContent = header + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    saveAs(blob, "receipts.csv");
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Receipt List</h2>

      <input
        type="text"
        placeholder="Search by Reference or Narration"
        className="border p-2 mb-4 w-full md:w-1/2"
        value={searchQuery}
        onChange={handleSearchChange}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={toggleSort}
          className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700"
        >
          Sort by Date ({sortOldestFirst ? "Oldest" : "Newest"})
        </button>
        <button
          onClick={exportCSV}
          className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-500"
        >
          Export CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-4 py-2 text-left">Date</th>
              <th className="border px-4 py-2 text-left">Reference</th>
              <th className="border px-4 py-2 text-left">Narration</th>
              <th className="border px-4 py-2 text-left">Customer</th>
              <th className="border px-4 py-2 text-left">Amount</th>
              <th className="border px-4 py-2 text-left">Bank</th>
            </tr>
          </thead>
          <tbody>
            {filteredReceipts.map((r) => (
              <tr key={r.id}>
                <td className="border px-4 py-2">{r.date}</td>
                <td className="border px-4 py-2">{r.reference}</td>
                <td className="border px-4 py-2">{r.narration}</td>
                <td className="border px-4 py-2">{r.customer_name}</td>
                <td className="border px-4 py-2">{r.amount}</td>
                <td className="border px-4 py-2">{r.bank_account}</td>
              </tr>
            ))}
            {filteredReceipts.length === 0 && (
              <tr>
                <td colSpan="6" className="text-center py-4 text-gray-500">
                  No receipts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ViewReceipts;
