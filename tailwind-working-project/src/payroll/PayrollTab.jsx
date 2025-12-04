import React, { useEffect, useState } from "react";
import axios from "axios";
import { format } from "date-fns";

const API_BASE = "http://127.0.0.1:8000";
const GET_PROFILE = `${API_BASE}/company/profile`;

const PayrollTab = () => {
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [details, setDetails] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [company, setCompany] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]); // <-- Move here

  // Fetch payroll periods
  useEffect(() => {
    axios.get(`${API_BASE}/payrolls/periods`)
      .then(res => setPeriods(res.data))
      .catch(() => setPeriods([]));
  }, []);

  // Fetch company profile
  useEffect(() => {
    fetch(GET_PROFILE)
      .then(res => res.json())
      .then(data => setCompany(data));
  }, []);

  // Fetch payroll details for selected period
  useEffect(() => {
    if (!selectedPeriod) return;
    setLoadingDetails(true);
    axios.get(`${API_BASE}/payrolls/${selectedPeriod}/details`)
      .then(res => setDetails(res.data))
      .catch(() => setDetails([]))
      .finally(() => setLoadingDetails(false));
  }, [selectedPeriod]);

  // Payroll creation form state
  const [form, setForm] = useState({
    period: "",
    employees: [],
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  // Handle payroll creation
  const handleCreatePayroll = async () => {
    setCreating(true);
    setError(null);

    // Only send required fields as per backend schema
    const payloadA = form.employees.map(emp => ({
      staff_no: emp.staff_no,
      // period must be a date string (YYYY-MM-DD)
      period: form.period + "-01", // If form.period is "2025-08", convert to "2025-08-01"
      basic_salary: parseFloat(emp.basic_salary) || 0,
      house_allowance: parseFloat(emp.house_allowance) || 0,
      transport_allowance: parseFloat(emp.transport_allowance) || 0,
      other_allowances: parseFloat(emp.other_allowances) || 0,
      commission: parseFloat(emp.commission) || 0,
      bonus: parseFloat(emp.bonus) || 0,
      loan: parseFloat(emp.loan) || 0,
      advance: parseFloat(emp.advance) || 0,
    }));

    try {
      await axios.post(`${API_BASE}/payrolls/bulk`, payloadA);
      alert("Payroll created!");
      setShowCreate(false);
      axios.get(`${API_BASE}/payrolls/periods`)
        .then(res => setPeriods(res.data));
    } catch (err) {
      let detail = err?.response?.data?.detail ?? err?.response?.data ?? err.message;
      if (typeof detail === "object") {
        detail = JSON.stringify(detail, null, 2);
      }
      setError(detail);
      alert("Failed to create payroll.\n" + detail);
    } finally {
      setCreating(false);
    }
  };

  // When showCreate is true, fetch employees and show a table for editing
  useEffect(() => {
    if (showCreate) {
      axios.get(`${API_BASE}/employees/`)
        .then(res => setForm(f => ({ ...f, employees: res.data })));
    }
  }, [showCreate]);

  const handleSelect = (id, checked) => {
    setSelectedIds(ids => checked ? [...ids, id] : ids.filter(x => x !== id));
  };

  const handleBatchDelete = () => {
    if (window.confirm("Delete selected payslips?")) {
      axios.delete(`${API_BASE}/payrolls/${selectedPeriod}/batch-delete`, {
        data: selectedIds
      }).then(() => {
        alert("Deleted!");
        setDetails(details => details.filter(d => !selectedIds.includes(d.id)));
        setSelectedIds([]);
      });
    }
  };

  // Render payroll periods table
  const renderPeriodsTable = () => (
    <div className="bg-white rounded shadow p-4 mb-4">
      <h2 className="text-lg font-semibold mb-2">Payroll Periods</h2>
      <table className="min-w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="px-3 py-2 border">Period</th>
            <th className="px-3 py-2 border">Total Gross</th>
            <th className="px-3 py-2 border">Net Pay</th>
            <th className="px-3 py-2 border">Employees</th>
            <th className="px-3 py-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {(periods && periods.length > 0)
            ? periods.map((period, i) => (
                <tr key={period.period ?? i}>
                  <td className="px-3 py-2 border">{format(new Date(period.period), "MMM yyyy")}</td>
                  <td className="px-3 py-2 border">KES {period.total_gross?.toLocaleString()}</td>
                  <td className="px-3 py-2 border">KES {period.net_pay?.toLocaleString()}</td>
                  <td className="px-3 py-2 border">{period.employees}</td>
                  <td className="px-3 py-2 border">
                    <button
                      className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                      onClick={() => setSelectedPeriod(period.period)}
                    >
                      View Payslips
                    </button>
                  </td>
                </tr>
              ))
            : (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-500">
                    No records
                  </td>
                </tr>
              )
          }
        </tbody>
      </table>

      <button
        className="mt-4 px-4 py-2 bg-green-600 text-white rounded"
        onClick={() => setShowCreate(true)}
      >
        Create New Payroll
      </button>
    </div>
  );

  // Render payroll details for a period
  const renderPeriodDetails = () => (
    <div className="bg-white rounded shadow p-4">
      <button
        className="mb-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        onClick={() => setSelectedPeriod(null)}
      >
        &larr; Back to Payroll Periods
      </button>
      <h2 className="text-xl font-semibold mb-4">
        Payslips for {new Date(selectedPeriod).toLocaleDateString('en-KE', { year: 'numeric', month: 'long' })}
      </h2>
      {loadingDetails ? (
        <div>Loading payroll details...</div>
      ) : (
        <>
          <div className="mb-4">
            <button
              className="bg-red-600 text-white px-3 py-1 rounded"
              onClick={handleBatchDelete}
              disabled={selectedIds.length === 0}
            >
              Delete Selected
            </button>
          </div>
          <table className="min-w-full border text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="px-3 py-2 border"></th> {/* For checkbox */}
                <th className="px-3 py-2 border">Staff No</th>
                <th className="px-3 py-2 border">Employee Name</th>
                <th className="px-3 py-2 border">Basic Salary</th>
                <th className="px-3 py-2 border">House Allowance</th>
                <th className="px-3 py-2 border">Transport Allowance</th>
                <th className="px-3 py-2 border">Other Allowances</th>
                <th className="px-3 py-2 border">Commission</th>
                <th className="px-3 py-2 border">Bonus</th>
                <th className="px-3 py-2 border">Gross Pay</th>
                <th className="px-3 py-2 border">Taxable Pay</th>
                <th className="px-3 py-2 border">NSSF</th>
                <th className="px-3 py-2 border">NHIF</th>
                <th className="px-3 py-2 border">AHL</th>
                <th className="px-3 py-2 border">PAYE</th>
                <th className="px-3 py-2 border">Loan</th>
                <th className="px-3 py-2 border">Advance</th>
                <th className="px-3 py-2 border">Net Pay</th>
                <th className="px-3 py-2 border">Actions</th>
              </tr>
            </thead>
            <tbody>
              {details.length === 0 ? (
                <tr>
                  <td colSpan={18} className="text-center py-4 text-gray-400">
                    No payslips found for this period.
                  </td>
                </tr>
              ) : (
                details.map(emp => {
                  const roundedNetPay = Math.floor(emp.net_pay / 10) * 10;
                  return (
                    <tr key={emp.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(emp.id)}
                          onChange={e => handleSelect(emp.id, e.target.checked)}
                        />
                      </td>
                      <td className="px-3 py-2 border">{emp.staff_no}</td>
                      <td className="px-3 py-2 border">{emp.name}</td>
                      <td className="px-3 py-2 border">{emp.basic_salary}</td>
                      <td className="px-3 py-2 border">{emp.house_allowance}</td>
                      <td className="px-3 py-2 border">{emp.transport_allowance}</td>
                      <td className="px-3 py-2 border">{emp.other_allowances}</td>
                      <td className="px-3 py-2 border">{emp.commission}</td>
                      <td className="px-3 py-2 border">{emp.bonus}</td>
                      <td className="px-3 py-2 border">KES {emp.gross_pay?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">{emp.taxable_pay?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">{emp.nssf?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">{emp.shif?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">{emp.ahl?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">{emp.paye?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">{emp.loan?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">{emp.advance?.toLocaleString()}</td>
                      <td className="px-3 py-2 border">KES {roundedNetPay.toLocaleString()}</td>
                      <td className="px-3 py-2 border">
                        <button
                          className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 mr-2"
                          onClick={() => setSelectedEmployee({ ...emp, period: selectedPeriod })}
                        >
                          View Payslip
                        </button>
                        <button
                          className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600"
                          onClick={() => window.location.href = `/payrolls/${selectedPeriod}/edit/${emp.id}`}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </>
      )}
      {selectedEmployee && (
        <EmployeePayslipModal
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
          company={company}
        />
      )}
    </div>
  );

  // Render payroll creation form (simple version)
  const renderCreatePayroll = () => (
    <div className="bg-white rounded shadow p-4 mb-4">
      <h2 className="text-lg font-semibold mb-2">Create New Payroll</h2>
      <label className="block mb-2">
        Payroll Period (YYYY-MM):
        <input
          type="month"
          value={form.period}
          onChange={e => setForm(f => ({ ...f, period: e.target.value }))}
          className="border px-2 py-1 rounded ml-2"
        />
      </label>
      <div className="overflow-x-auto mt-4">
        <table className="min-w-full border text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-1 border">Staff No</th>
              <th className="px-2 py-1 border">Name</th>
              <th className="px-2 py-1 border">Basic Salary</th>
              <th className="px-2 py-1 border">House Allowance</th>
              <th className="px-2 py-1 border">Transport Allowance</th>
              <th className="px-2 py-1 border">Other Allowances</th>
              <th className="px-2 py-1 border">Commission</th>
              <th className="px-2 py-1 border">Bonus</th>
              <th className="px-2 py-1 border">Loan</th>
              <th className="px-2 py-1 border">Advance</th>
            </tr>
          </thead>
          <tbody>
            {form.employees.map((emp, idx) => (
              <tr key={emp.staff_no}>
                <td className="px-2 py-1 border">{emp.staff_no}</td>
                <td className="px-2 py-1 border">{emp.name}</td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.basic_salary}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].basic_salary = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.house_allowance}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].house_allowance = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.transport_allowance}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].transport_allowance = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.other_allowances}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].other_allowances = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.commission}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].commission = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.bonus}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].bonus = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.loan}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].loan = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
                <td className="px-2 py-1 border">
                  <input
                    type="number"
                    value={emp.advance}
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setForm(f => {
                        const updated = [...f.employees];
                        updated[idx].advance = val;
                        return { ...f, employees: updated };
                      });
                    }}
                    className="border px-1 py-1 rounded w-20"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded"
        onClick={handleCreatePayroll}
        disabled={creating || !form.period}
      >
        {creating ? "Creating..." : "Confirm & Create Payroll"}
      </button>
      <button
        className="mt-2 ml-2 px-4 py-2 bg-gray-200 rounded"
        onClick={() => setShowCreate(false)}
      >
        Cancel
      </button>
    </div>
  );

  return (
    <div>
      {!selectedPeriod && !showCreate && renderPeriodsTable()}
      {showCreate && renderCreatePayroll()}
      {selectedPeriod && renderPeriodDetails()}
    </div>
  );
};

// Modal for viewing payslip
const EmployeePayslipModal = ({ employee, onClose, company }) => {
  // Defensive date formatting
  let payslipPeriod = "Invalid Date";
  if (employee.period) {
    const dateObj = new Date(employee.period);
    if (!isNaN(dateObj)) {
      payslipPeriod = format(dateObj, "MMMM yyyy");
    }
  }

  const handlePrint = () => window.print();

  const handleEmail = () => {
    axios.post(`${API_BASE}/payrolls/${employee.period}/email`, { employee_id: employee.id })
      .then(() => alert("Payslip sent!"))
      .catch(() => alert("Failed to send payslip."));
  };

  const handleEdit = () => {
    window.location.href = `/payrolls/${employee.period}/edit/${employee.id}`;
  };

  const handleDelete = () => {
    if (window.confirm("Are you sure you want to delete this payslip?")) {
      axios.delete(`${API_BASE}/payrolls/${employee.period}/employee/${employee.id}`)
        .then(() => alert("Payslip deleted!"))
        .catch(() => alert("Failed to delete payslip."));
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 print-payslip">
      <div className="bg-black opacity-50 absolute inset-0"></div>
      <div className="bg-white rounded shadow-lg p-6 max-w-lg w-full z-10 max-h-[80vh] overflow-y-auto">
        {/* Company Logo and Name */}
        {company && (
          <div className="mb-4 flex items-center">
            {company.logo_url && (
              <img src={company.logo_url} alt="Company Logo" className="h-12 mr-4" />
            )}
            <div>
              <div className="font-bold text-lg">{company.company_name}</div>
              <div className="text-sm">{company.address}</div>
              <div className="text-sm">{company.email}</div>
              <div className="text-sm">{company.phone}</div>
            </div>
          </div>
        )}
        {/* Employee Info */}
        <div className="mb-4">
          <div className="flex justify-between">
            <span className="font-semibold">Employee Name:</span>
            <span>{employee.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Staff No:</span>
            <span>{employee.staff_no}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Email:</span>
            <span>{employee.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold">Payslip No:</span>
            <span>{employee.payslip_number}</span>
          </div>
        </div>
        {/* Payslip Table */}
        <div className="border-t pt-2">
          {/* Earnings */}
          <div className="font-semibold mb-2">Earnings</div>
          <div className="flex justify-between py-1">
            <span>Basic Salary</span>
            <span>KES {employee.basic_salary?.toLocaleString()}</span>
          </div>
          {employee.house_allowance > 0 && (
            <div className="flex justify-between py-1">
              <span>House Allowance</span>
              <span>KES {employee.house_allowance.toLocaleString()}</span>
            </div>
          )}
          {employee.transport_allowance > 0 && (
            <div className="flex justify-between py-1">
              <span>Transport Allowance</span>
              <span>KES {employee.transport_allowance.toLocaleString()}</span>
            </div>
          )}
          {employee.other_allowances > 0 && (
            <div className="flex justify-between py-1">
              <span>Other Allowances</span>
              <span>KES {employee.other_allowances.toLocaleString()}</span>
            </div>
          )}
          {employee.commission > 0 && (
            <div className="flex justify-between py-1">
              <span>Commission</span>
              <span>KES {employee.commission.toLocaleString()}</span>
            </div>
          )}
          {employee.bonus > 0 && (
            <div className="flex justify-between py-1">
              <span>Bonus</span>
              <span>KES {employee.bonus.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between py-1 font-bold border-t mt-2">
            <span>Gross Pay</span>
            <span>KES {employee.gross_pay?.toLocaleString()}</span>
          </div>
          {/* Deductions */}
          <div className="font-semibold mt-4 mb-2">Deductions</div>
          {employee.paye > 0 && (
            <div className="flex justify-between py-1">
              <span>PAYE</span>
              <span>KES {employee.paye.toLocaleString()}</span>
            </div>
          )}
          {employee.nssf > 0 && (
            <div className="flex justify-between py-1">
              <span>NSSF</span>
              <span>KES {employee.nssf.toLocaleString()}</span>
            </div>
          )}
          {employee.shif > 0 && (
            <div className="flex justify-between py-1">
              <span>NHIF</span>
              <span>KES {employee.shif.toLocaleString()}</span>
            </div>
          )}
          {employee.ahl > 0 && (
            <div className="flex justify-between py-1">
              <span>AHL</span>
              <span>KES {employee.ahl.toLocaleString()}</span>
            </div>
          )}
          {employee.loan > 0 && (
            <div className="flex justify-between py-1">
              <span>Loan</span>
              <span>KES {employee.loan.toLocaleString()}</span>
            </div>
          )}
          {employee.advance > 0 && (
            <div className="flex justify-between py-1">
              <span>Advance</span>
              <span>KES {employee.advance.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between py-1 font-bold border-t mt-2">
            <span>Net Pay</span>
            <span>KES {Math.floor(employee.net_pay / 10) * 10}</span>
          </div>
        </div>
        {/* Personal Info Section */}
        <div className="mt-6 border-t-2 border-black pt-2">
          <div className="font-semibold mb-1">PERSONAL INFO.:</div>
          <table className="w-full text-xs border-separate" style={{ borderSpacing: 0 }}>
            <tbody>
              <tr className="bg-gray-50">
                <td className="py-1 px-2">Payment Mode:</td>
                <td className="py-1 px-2">{employee.payment_mode || "Bank Transfer"}</td>
                <td className="py-1 px-2">ID:</td>
                <td className="py-1 px-2">{employee.id_number || "-"}</td>
              </tr>
              <tr>
                <td className="py-1 px-2">Bank Name:</td>
                <td className="py-1 px-2">{employee.bank_name || "-"}</td>
                <td className="py-1 px-2">PIN:</td>
                <td className="py-1 px-2">{employee.kra_pin || "-"}</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="py-1 px-2">Bank Branch:</td>
                <td className="py-1 px-2">{employee.branch_name || "-"}</td>
                <td className="py-1 px-2">NHIF:</td>
                <td className="py-1 px-2">{employee.nhif_number || "-"}</td>
              </tr>
              <tr>
                <td className="py-1 px-2">Bank Acc:</td>
                <td className="py-1 px-2">{employee.bank_account || "-"}</td>
                <td className="py-1 px-2">NSSF:</td>
                <td className="py-1 px-2">{employee.nssf_number || "-"}</td>
              </tr>
            </tbody>
          </table>
          <div className="border-b-2 border-black mt-1"></div>
        </div>
        {/* Stamp and Date */}
        <div className="mt-8 flex items-center">
          <div className="border border-dashed border-gray-400 w-32 h-20 flex items-center justify-center text-gray-500">
            Stamp
          </div>
          <div className="ml-8 text-sm text-gray-600">
            Date: {new Date().toLocaleDateString()}
          </div>
        </div>
        {/* Buttons */}
        <div className="flex gap-2 mt-6">
          <button onClick={handlePrint} className="bg-blue-600 text-white px-3 py-1 rounded">Print</button>
          <button onClick={handleEmail} className="bg-green-600 text-white px-3 py-1 rounded">Email</button>
          <button onClick={handleEdit} className="bg-yellow-500 text-white px-3 py-1 rounded">Edit</button>
          <button onClick={handleDelete} className="bg-red-600 text-white px-3 py-1 rounded">Delete</button>
        </div>
        <button
          onClick={onClose}
          className="mt-4 px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Close
        </button>
      </div>
    </div>
  );
};

export default PayrollTab;