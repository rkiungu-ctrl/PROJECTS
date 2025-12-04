// src/pages/EmployeeList.jsx
import React, { useEffect, useState } from "react";
import axios from "axios";
// ✅ Import from barrel to avoid path issues
import { EmployeeDetailsModal } from "../components";

import { API_BASE } from "../lib/api";
const WORKING_DAYS_IN_MONTH = 26; // Wingubox-style daily rate (monthly / 26)

const EmployeeList = () => {
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Filters and UI state
  const [tab, setTab] = useState("Active");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterJob, setFilterJob] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterRegion, setFilterRegion] = useState("");
  const [selected, setSelected] = useState([]);
  const [showLoansOnly, setShowLoansOnly] = useState(false);

  // Match the backend field `employment_type` values (e.g. "Fixed Term", "Contract", "Intern").
  // Use explicit value/label pairs so the select's value maps correctly to the API data.
  const types = [
    { label: "All Types", value: "" },
    { label: "Fixed Term", value: "Fixed Term" },
    { label: "Contract", value: "Contract" },
    { label: "Intern", value: "Intern" },
  ];
  const jobs = ["All Job Titles", "Managing Director", "Sales Executive", "Accountant"];
  const depts = ["No Department Set", "Sales", "HR", "Finance"];
  const regions = ["All Regions", "Nairobi", "Mombasa", "Kisumu"];

  const today = new Date();

  // Helper: canonical check if employee has any outstanding loans/advances
  const hasLoanForEmp = (emp) => {
    // 1) Prefer top-level totals if backend provides them
    const totalTopLevel =
      Number(emp.loan || 0) +
      Number(emp.advance || 0) +
      Number(emp.loan_due || 0) +
      Number(emp.advance_due || 0);

    if (totalTopLevel > 0) {
      return true;
    }

    // 2) Fall back to checking nested loan/advance arrays for balances
    const loanItems = Array.isArray(emp.loans) ? emp.loans : [];
    const advanceItems = Array.isArray(emp.advances) ? emp.advances : [];
    const hasOutstandingLoans = loanItems.concat(advanceItems).some((l) => {
      const bal = (l && (l.balance ?? l.balance_outstanding)) || 0;
      return Number(bal) > 0;
    });

    if (hasOutstandingLoans) {
      return true;
    }

    // 3) If backend sends an explicit flag, honour it
    if (emp.has_loan === true) {
      return true;
    }

    return false;
  };

  const [terminateEmployeeData, setTerminateEmployeeData] = useState(null);
  const [terminateLeaves, setTerminateLeaves] = useState([]);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [terminateForm, setTerminateForm] = useState({
    termination_date: "",
    accumulated_leave_payout: 0,
    accumulated_leave_days: 0,
    months_of_service: 0,
    monthly_accrual: 0,
    accrued_days: 0,
    used_days: 0,
    daily_rate: 0,
  });

  // Helper: compute termination-driven numbers
  const computeTerminationValues = (data, leaves, termDateStr) => {
    const termDate = termDateStr ? new Date(termDateStr) : new Date();

    // monthly accrual rate (default 1.75)
    const monthlyAccrual = Number(data.leaveMonthlyRate || 1.75) || 1.75;

    // months of service up to termination date — inclusive rule
    // (count an extra month when the day-of-month is >= start day)
    let months = 0;
    if (data.date_of_employment) {
      const d = new Date(data.date_of_employment);
      months =
        (termDate.getFullYear() - d.getFullYear()) * 12 +
        (termDate.getMonth() - d.getMonth());
      if (termDate.getDate() >= d.getDate()) months += 1;
      if (months < 0) months = 0;
    }
    const accrued = months * monthlyAccrual;

    // used days up to term date (Annual leave only)
    let used = 0;
    for (const l of Array.isArray(leaves) ? leaves : []) {
      if (!l) continue;
      if (!(l.type === "Annual Leave" || l.type === "Annual")) continue;
      const days = Number(l.days || 0) || 0;
      if (l.end_date) {
        const end = new Date(l.end_date);
        if (end <= termDate) used += days;
      } else if (l.start_date) {
        const start = new Date(l.start_date);
        if (start <= termDate) used += days;
      } else {
        used += days;
      }
    }

    const computedRemaining = Math.max(0, accrued - used);
    const salary = Number(data.basic_salary || 0);
    const dailyRate =
      salary && salary > 0 ? salary / WORKING_DAYS_IN_MONTH : 0;
    const payout = computedRemaining * dailyRate;

    return {
      months,
      monthlyAccrual,
      accrued,
      used,
      remainingDays: computedRemaining,
      payout,
    };
  };

  const fetchEmployees = async () => {
    setLoading(true);
    setErr("");
    try {
      const { data } = await axios.get(`${API_BASE}/employees`);
      setEmployees(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setErr("Failed to load employees.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const openModal = (emp) => {
    setSelectedEmployee(emp);
    setShowNewModal(true);
  };

  const closeModal = () => {
    setSelectedEmployee(null);
    setShowNewModal(false);
  };

  const handleEmployeeSaved = () => {
    fetchEmployees();
  };

  const openTerminate = async (emp) => {
    setShowTerminateModal(true);
    setTerminateEmployeeData(emp);
    try {
      const res = await axios.get(
        `${API_BASE}/employees/${encodeURIComponent(emp.staff_no)}`
      );
      const data = res.data || {};
      const leaves = data.leaves || [];
      setTerminateLeaves(leaves);

      const vals = computeTerminationValues(data, leaves, data.termination_date);
      setTerminateForm((prev) => ({
        ...prev,
        termination_date: data.termination_date || "",
        accumulated_leave_payout: vals.payout,
        accumulated_leave_days: vals.remainingDays,
        months_of_service: vals.months,
        monthly_accrual: vals.monthlyAccrual,
        accrued_days: vals.accrued,
        used_days: vals.used,
        daily_rate:
          data.daily_rate ||
          (data.basic_salary
            ? data.basic_salary / WORKING_DAYS_IN_MONTH
            : 0),
      }));
    } catch (error) {
      console.error("Failed to fetch employee details:", error);
    }
  };

  const closeTerminate = () => {
    setShowTerminateModal(false);
    setTerminateEmployeeData(null);
    setTerminateLeaves([]);
  };

  const handleTerminateChange = (field, value) => {
    setTerminateForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleTerminateSubmit = async (e) => {
    e.preventDefault();
    if (!terminateEmployeeData) return;
    try {
      const payload = {
        termination_date: terminateForm.termination_date,
        accumulated_leave_payout: terminateForm.accumulated_leave_payout,
        accumulated_leave_days: terminateForm.accumulated_leave_days,
        termination_reason: terminateForm.termination_reason || "",
        terminated_by: terminateForm.terminated_by || "",
        terminated_at: terminateForm.terminated_at || new Date().toISOString(),
      };
      await axios.put(
        `${API_BASE}/employees/${encodeURIComponent(
          terminateEmployeeData.staff_no
        )}/terminate`,
        payload
      );
      alert("Employee terminated successfully");
      closeTerminate();
      fetchEmployees();
    } catch (error) {
      console.error("Failed to terminate employee:", error);
      alert("Failed to terminate employee.");
    }
  };

  const filtered = employees.filter((emp) => {
    const status = (emp.status ?? "").toString().trim().toLowerCase(); // normalize case
    const termDate = emp.termination_date ? new Date(emp.termination_date) : null;

    // Treat as terminated if status says so OR termination date is today/past
    const isTerminated = status === "terminated" || (termDate && termDate <= today);

    // Canonical flag: does this employee have any loan/advance?
    const hasLoanFlag = hasLoanForEmp(emp);

    // Enforce show-only-loans toggle (client-side filter) first
    if (showLoansOnly && !hasLoanFlag) return false;

    // Show in Active tab if not terminated OR if they have outstanding loans.
    if (tab === "Active" && isTerminated && !hasLoanFlag) return false;
    if (tab === "Terminated" && !isTerminated) return false;

    // The backend uses `employment_type` (not `type`). Compare case-insensitively
    // and treat empty filter as "all".
    if (filterType && filterType !== "" && ((emp.employment_type || "").toString().toLowerCase() !== filterType.toString().toLowerCase()))
      return false;
    if (filterJob && filterJob !== "All Job Titles" && emp.job_title !== filterJob)
      return false;
    if (filterDept && filterDept !== "No Department Set" && emp.department !== filterDept)
      return false;
    if (filterRegion && filterRegion !== "All Regions" && emp.region !== filterRegion)
      return false;
    if (
      search &&
      !Object.values(emp).join(" ").toLowerCase().includes(search.toLowerCase())
    )
      return false;

    return true;
  });

  // ---------------- Bulk helpers (unchanged) ----------------
  const toggleSelect = (staff_no) => {
    setSelected((sel) =>
      sel.includes(staff_no)
        ? sel.filter((s) => s !== staff_no)
        : [...sel, staff_no]
    );
  };
  const selectAll = () => {
    setSelected(filtered.map((emp) => emp.staff_no));
  };
  const deselectAll = () => setSelected([]);

  // ---------------- Export/Import (kept as-is) ----------------
  const exportCSV = async () => {
    try {
      const response = await axios.get(`${API_BASE}/employees/export`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "employees_export.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (error) {
      console.error("Error exporting employees:", error);
      alert("Failed to export employees.");
    }
  };

  // UI for hiding columns (left as-is)
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const toggleColumn = (col) => {
    setHiddenColumns((prev) =>
      prev.includes(col) ? prev.filter((c) => c !== col) : [...prev, col]
    );
  };
  const isHidden = (col) => hiddenColumns.includes(col);

  return (
    <div className="p-4 text-xs">
      <div className="flex justify-between mb-4 items-center">
        <div>
          <h1 className="text-lg font-bold">Employees</h1>
          <p className="text-gray-600 text-xs">
            Manage employee records, including HR, salary, loans, and leave.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="bg-green-600 text-white px-3 py-1 rounded"
            onClick={() => openModal(null)}
          >
            + Add Employee
          </button>
          <button
            className="bg-blue-600 text-white px-3 py-1 rounded"
            onClick={exportCSV}
          >
            Export CSV
          </button>
        </div>
      </div>

      {err && <div className="mb-2 text-red-600 text-xs">{err}</div>}

      <div className="flex gap-2 mb-2">
        <button
          className={`px-3 py-1 rounded ${
            tab === "Active" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
          onClick={() => setTab("Active")}
        >
          Active
        </button>
        <button
          className={`px-3 py-1 rounded ${
            tab === "Terminated" ? "bg-blue-600 text-white" : "bg-gray-200"
          }`}
          onClick={() => setTab("Terminated")}
        >
          Terminated
        </button>
      </div>

      <div className="flex gap-2 mb-2 items-center">
        <input
          type="text"
          placeholder="Search..."
          className="border px-2 py-1 rounded text-xs w-44"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="border px-2 py-1 rounded text-xs"
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          {types.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="border px-2 py-1 rounded text-xs"
          value={filterJob}
          onChange={(e) => setFilterJob(e.target.value)}
        >
          {jobs.map((j) => (
            <option key={j} value={j === "All Job Titles" ? "" : j}>
              {j}
            </option>
          ))}
        </select>
        <select
          className="border px-2 py-1 rounded text-xs"
          value={filterDept}
          onChange={(e) => setFilterDept(e.target.value)}
        >
          {["All Departments", ...depts].map((d) => (
            <option
              key={d}
              value={
                d === "All Departments"
                  ? ""
                  : d === "No Department Set"
                  ? "No Department Set"
                  : d
              }
            >
              {d}
            </option>
          ))}
        </select>
        <select
          className="border px-2 py-1 rounded text-xs"
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
        >
          {regions.map((r) => (
            <option key={r} value={r === "All Regions" ? "" : r}>
              {r}
            </option>
          ))}
        </select>
        <button
          className={`bg-blue-600 text-white px-3 py-1 rounded ml-2 ${
            showLoansOnly ? "bg-blue-700" : ""
          }`}
          onClick={() => setShowLoansOnly(!showLoansOnly)}
        >
          {showLoansOnly ? "Show All Employees" : "Show Only with Loans"}
        </button>
        <button className="bg-blue-600 text-white px-3 py-1 rounded ml-2">
          Select an Action
        </button>
      </div>

      <div className="flex gap-2 mb-2">
        <span className="text-xs font-semibold">Hide Columns:</span>
        {["Job Title", "Department", "Region", "Salary"].map((col) => (
          <button
            key={col}
            className={`px-2 py-1 text-xs rounded border ${
              isHidden(col) ? "bg-gray-300" : "bg-white"
            }`}
            onClick={() => toggleColumn(col)}
          >
            {col}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border text-xs">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-2 py-1">
                <input
                  type="checkbox"
                  checked={
                    selected.length === filtered.length && filtered.length > 0
                  }
                  onChange={(e) =>
                    e.target.checked ? selectAll() : deselectAll()
                  }
                />
              </th>
              <th className="border px-2 py-1">Staff No</th>
              <th className="border px-2 py-1">Name</th>
              {!isHidden("Job Title") && (
                <th className="border px-2 py-1">Job Title</th>
              )}
              {!isHidden("Department") && (
                <th className="border px-2 py-1">Department</th>
              )}
              {!isHidden("Region") && (
                <th className="border px-2 py-1">Region</th>
              )}
              {!isHidden("Salary") && (
                <>
                  <th className="border px-2 py-1 text-right">Basic Salary</th>
                  <th className="border px-2 py-1 text-right">
                    House Allowance
                  </th>
                  <th className="border px-2 py-1 text-right">
                    Transport Allowance
                  </th>
                  <th className="border px-2 py-1 text-right">
                    Other Allowances
                  </th>
                </>
              )}
              <th className="border px-2 py-1 text-right">Loan</th>
              <th className="border px-2 py-1 text-right">Advance</th>
              <th className="border px-2 py-1">Status</th>
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td className="border px-2 py-2 text-center" colSpan={15}>
                  Loading…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="border px-2 py-2 text-center" colSpan={15}>
                  No employees found.
                </td>
              </tr>
            ) : (
              filtered.map((emp) => (
                <tr
                  key={emp.staff_no}
                  className={selected.includes(emp.staff_no) ? "bg-blue-50" : ""}
                >
                  <td className="border px-2 py-1">
                    <input
                      type="checkbox"
                      checked={selected.includes(emp.staff_no)}
                      onChange={() => toggleSelect(emp.staff_no)}
                    />
                  </td>
                  <td className="border px-2 py-1">{emp.staff_no}</td>
                  <td
                    className={`border px-2 py-1 ${
                      hasLoanForEmp(emp) ? "text-red-600 font-bold" : ""
                    }`}
                  >
                    {emp.name}
                  </td>
                  {!isHidden("Job Title") && (
                    <td className="border px-2 py-1">
                      {emp.job_title || ""}
                    </td>
                  )}
                  {!isHidden("Department") && (
                    <td className="border px-2 py-1">
                      {emp.department || "No Department Set"}
                    </td>
                  )}
                  {!isHidden("Region") && (
                    <td className="border px-2 py-1">
                      {emp.region || "Not Set"}
                    </td>
                  )}
                  {!isHidden("Salary") && (
                    <>
                      <td className="border px-2 py-1 text-right">
                        {(emp.basic_salary || 0).toLocaleString()}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {(emp.house_allowance || 0).toLocaleString()}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {(emp.transport_allowance || 0).toLocaleString()}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {(emp.other_allowances || 0).toLocaleString()}
                      </td>
                    </>
                  )}
                  <td className="border px-2 py-1 text-right">
                    {(emp.loan || 0).toLocaleString()}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {(emp.advance || 0).toLocaleString()}
                  </td>
                  <td className="border px-2 py-1">
                    {emp.status === "terminated" ? "Terminated" : "Active"}
                  </td>
                  <td className="border px-2 py-1">
                    <button
                      className="bg-blue-600 text-white px-2 py-1 text-xs rounded mr-1"
                      onClick={() => openModal(emp)}
                    >
                      View
                    </button>
                    <button
                      className="bg-red-600 text-white px-2 py-1 text-xs rounded"
                      onClick={() => openTerminate(emp)}
                    >
                      Terminate
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showNewModal && (
        <EmployeeDetailsModal
          isOpen={showNewModal}
          onClose={closeModal}
          employee={selectedEmployee}
          employees={employees}
          onSaved={handleEmployeeSaved}
        />
      )}

      {showTerminateModal && terminateEmployeeData && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded shadow p-4 w-[480px] text-xs">
            <h2 className="text-base font-bold mb-2">
              Terminate {terminateEmployeeData.name}
            </h2>
            <form onSubmit={handleTerminateSubmit}>
              <div className="mb-2">
                <label className="block text-xs mb-1">
                  Termination Date
                </label>
                <input
                  type="date"
                  className="border px-2 py-1 rounded w-full text-xs"
                  value={terminateForm.termination_date || ""}
                  onChange={(e) =>
                    handleTerminateChange("termination_date", e.target.value)
                  }
                />
              </div>
              <div className="mb-2">
                <label className="block text-xs mb-1">
                  Accrued Leave Days
                </label>
                <input
                  type="number"
                  className="border px-2 py-1 rounded w-full text-xs"
                  value={terminateForm.accumulated_leave_days || 0}
                  readOnly
                />
              </div>
              <div className="mb-2">
                <label className="block text-xs mb-1">
                  Accrued Leave Payout
                </label>
                <input
                  type="number"
                  className="border px-2 py-1 rounded w-full text-xs"
                  value={terminateForm.accumulated_leave_payout || 0}
                  readOnly
                />
              </div>
              <div className="mb-2">
                <label className="block text-xs mb-1">
                  Termination Reason
                </label>
                <textarea
                  className="border px-2 py-1 rounded w-full text-xs"
                  value={terminateForm.termination_reason || ""}
                  onChange={(e) =>
                    handleTerminateChange(
                      "termination_reason",
                      e.target.value
                    )
                  }
                />
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  className="px-3 py-1 rounded border"
                  onClick={closeTerminate}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1 rounded bg-red-600 text-white"
                >
                  Confirm Termination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeeList;
