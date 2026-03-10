// src/features/employee/EmployeeList.jsx
// Displays a list of employees and opens EmployeeDetailsModal for full edit
import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import EmployeeDetailsModal from "./EmployeeDetailsModal";

const EmployeeList = () => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const res = await api.get("/employees/");
      setEmployees(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load employees");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const filtered = (employees || []).filter((e) => {
    const q = search.toLowerCase();
    return [e.name, e.staff_no, e.department, e.job_title]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const handleOpen = (emp) => {
    setSelected(emp);
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setSelected(null);
  };

  const handleSaved = () => {
    fetchEmployees();
    handleClose();
  };

  return (
    <div className="px-4 py-3 w-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Employees</h1>
        <input
          type="text"
          placeholder="Search employees…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-[260px] border rounded px-3 py-2 text-sm"
        />
      </div>

      {error && <div className="mb-3 p-3 rounded bg-red-100 text-red-800 text-sm">{error}</div>}

      <div className="border rounded-lg overflow-hidden bg-white">
        <div className="px-4 py-3 border-b bg-gray-50 font-medium text-sm">
          Employee List {loading && <span className="text-gray-400 ml-2">Loading…</span>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left font-semibold px-4 py-2">Actions</th>
                <th className="text-left font-semibold px-4 py-2">Staff No.</th>
                <th className="text-left font-semibold px-4 py-2">Name</th>
                <th className="text-left font-semibold px-4 py-2">Department</th>
                <th className="text-left font-semibold px-4 py-2">Job Title</th>
                <th className="text-left font-semibold px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                    No employees found.
                  </td>
                </tr>
              )}
              {filtered.map((e) => (
                <tr key={e.staff_no || e.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 align-top">
                    <button
                      className="px-2 py-1 border rounded text-xs hover:bg-gray-50"
                      onClick={() => handleOpen(e)}
                    >
                      View / Edit
                    </button>
                  </td>
                  <td className="px-4 py-2 align-top">{e.staff_no || "-"}</td>
                  <td className="px-4 py-2 align-top font-medium">{e.name || "-"}</td>
                  <td className="px-4 py-2 align-top">{e.department || "-"}</td>
                  <td className="px-4 py-2 align-top">{e.job_title || "-"}</td>
                  <td className="px-4 py-2 align-top">{e.status || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && selected && (
        <EmployeeDetailsModal
          employee={selected}
          employees={employees}
          onClose={handleClose}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default EmployeeList;
