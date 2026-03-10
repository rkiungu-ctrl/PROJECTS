// src/features/reporting/Reports.jsx
// Financial reports page
import React, { useState } from "react";
import axios from "axios";
import { API_BASE } from "../../lib/api";

const REPORTS_ENDPOINT = `${API_BASE}/reports`;

const Reports = () => {
  const [reportType, setReportType] = useState("trial-balance");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleRun = async (e) => {
    e.preventDefault();
    setError("");
    setData(null);
    setLoading(true);
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      const res = await axios.get(`${REPORTS_ENDPOINT}/${reportType}`, { params });
      setData(res.data);
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.detail || "Failed to generate report");
    } finally {
      setLoading(false);
    }
  };

  const renderTable = (rows, columns) => {
    if (!rows || rows.length === 0) return <p className="text-gray-500 text-sm">No data to display.</p>;
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-sm border rounded">
          <thead className="bg-gray-50 border-b">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="text-left font-semibold px-4 py-2">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b hover:bg-gray-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-2">
                    {row[col.key] != null ? String(row[col.key]) : "-"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderReport = () => {
    if (!data) return null;
    if (reportType === "trial-balance") {
      const rows = Array.isArray(data) ? data : (data.lines || data.rows || []);
      return renderTable(rows, [
        { key: "account_code", label: "Code" },
        { key: "account_name", label: "Account" },
        { key: "debit", label: "Debit" },
        { key: "credit", label: "Credit" },
      ]);
    }
    if (reportType === "profit-and-loss") {
      const rows = Array.isArray(data) ? data : (data.lines || data.rows || []);
      return renderTable(rows, [
        { key: "account_code", label: "Code" },
        { key: "account_name", label: "Account" },
        { key: "amount", label: "Amount" },
      ]);
    }
    if (reportType === "balance-sheet") {
      const rows = Array.isArray(data) ? data : (data.lines || data.rows || []);
      return renderTable(rows, [
        { key: "account_code", label: "Code" },
        { key: "account_name", label: "Account" },
        { key: "balance", label: "Balance" },
      ]);
    }
    return <pre className="text-xs bg-gray-50 p-3 rounded border overflow-x-auto">{JSON.stringify(data, null, 2)}</pre>;
  };

  return (
    <div className="px-4 py-3 w-full">
      <h1 className="text-2xl font-semibold mb-4">Reports</h1>

      <div className="mb-4 border rounded-lg p-3 bg-white">
        <form onSubmit={handleRun} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs mb-0.5">Report Type</label>
            <select className="border rounded px-2.5 py-1.5 text-sm" value={reportType}
                    onChange={(e) => setReportType(e.target.value)}>
              <option value="trial-balance">Trial Balance</option>
              <option value="profit-and-loss">Profit and Loss</option>
              <option value="balance-sheet">Balance Sheet</option>
            </select>
          </div>
          <div>
            <label className="block text-xs mb-0.5">Start Date</label>
            <input type="date" className="border rounded px-2.5 py-1.5 text-sm" value={startDate}
                   onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs mb-0.5">End Date</label>
            <input type="date" className="border rounded px-2.5 py-1.5 text-sm" value={endDate}
                   onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <button type="submit" disabled={loading}
                  className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 text-sm">
            {loading ? "Generating…" : "Run Report"}
          </button>
        </form>
      </div>

      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>}

      {data && (
        <div className="border rounded-lg overflow-hidden bg-white">
          <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm capitalize">
            {reportType.replace(/-/g, " ")}
          </div>
          <div className="p-4">{renderReport()}</div>
        </div>
      )}
    </div>
  );
};

export default Reports;
