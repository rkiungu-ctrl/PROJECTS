import React, { useEffect, useState } from "react";
import axios from "axios";
import {
  Tabs,
  Tab,
  PersonalDetails,
  SalaryDetails,
  HRDetails,
  ContactDetails,
  Documents,
  Deductions,
  Benefits,
  Earnings,
  LoansAdvance,
} from "../components";

const API_BASE = "http://127.0.0.1:8000";

const initialForm = {
  staff_no: "",
  name: "",
  phone: "",
  personal_email: "",
  kra_pin: "",
  id_number: "",
  nssf_number: "",
  nhif_number: "",
  bank_name: "",
  bank_account: "",
  branch_name: "",
  branch_code: "",
  basic_salary: "",
  house_allowance: "",
  transport_allowance: "",
  other_allowances: "",
  commission: "",
  bonus: "",
  is_director: false,
  employment_type: "permanent",
};

const EmployeeList = () => {
  const [employees, setEmployees] = useState([]);
  const [err, setErr] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [editStaffNo, setEditStaffNo] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Fetch employees
  const fetchEmployees = () => {
    axios
      .get(`${API_BASE}/employees/`)
      .then((res) => setEmployees(res.data))
      .catch(() => setErr("Failed to load employees"));
  };

  useEffect(() => {
    axios.get("http://127.0.0.1:8000/employees/")
      .then(res => setEmployees(res.data))
      .catch(err => {
        console.error("Failed to fetch employees", err);
        setEmployees([]);
      });
  }, []);

  // Handle add/edit submit
  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      basic_salary: parseFloat(form.basic_salary) || 0,
      house_allowance: parseFloat(form.house_allowance) || 0,
      transport_allowance: parseFloat(form.transport_allowance) || 0,
      other_allowances: parseFloat(form.other_allowances) || 0,
      commission: parseFloat(form.commission) || 0,
      bonus: parseFloat(form.bonus) || 0,
      is_director: !!form.is_director,
    };
    if (editStaffNo) {
      axios
        .put(`${API_BASE}/employees/employees/${editStaffNo}`, payload)
        .then(() => {
          fetchEmployees();
          setShowModal(false);
          setForm(initialForm);
          setEditStaffNo(null);
        })
        .catch(() => setErr("Failed to update employee"));
    } else {
      axios
        .post(`${API_BASE}/employees/`, payload)
        .then(() => {
          fetchEmployees();
          setShowModal(false);
          setForm(initialForm);
        })
        .catch(() => setErr("Failed to add employee"));
    }
  };

  // Handle delete
  const handleDelete = (staff_no) => {
    if (window.confirm("Are you sure you want to delete this employee?")) {
      axios
        .delete(`${API_BASE}/employees/${staff_no}`)
        .then(() => fetchEmployees())
        .catch(() => setErr("Failed to delete employee"));
    }
  };

  // Handle import
  const handleImport = (e) => {
    const file = e.target.files[0];
    setImportFile(file);
    if (file) {
      const formData = new FormData();
      formData.append("file", file);
      axios
        .post(`${API_BASE}/employees/import`, formData)
        .then((res) => setImportMsg(res.data.message || "Import successful"))
        .then(() => fetchEmployees())
        .catch(() => setImportMsg("Import failed"));
    }
  };

  // Open edit modal
  const openEdit = (emp) => {
    setForm(emp);
    setEditStaffNo(emp.staff_no);
    setShowModal(true);
  };

  // Open details tab
  const openDetails = (emp) => {
    axios
      .get(`${API_BASE}/employees/${emp.staff_no}`)
      .then((res) => setSelectedEmployee(res.data))
      .catch(() => setErr("Failed to load employee details"));
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">Employee List</h1>
      {err && <div className="text-red-600 mb-2">{err}</div>}
      <div className="mb-4 flex gap-2">
        <button
          className="px-4 py-2 bg-blue-600 text-white rounded"
          onClick={() => {
            setShowModal(true);
            setForm(initialForm);
            setEditStaffNo(null);
          }}
        >
          Add Employee
        </button>
        <input
          type="file"
          accept=".csv"
          onChange={handleImport}
          className="border px-2 py-1"
        />
        {importMsg && <span className="ml-2 text-green-600">{importMsg}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full border text-sm">
          <thead>
            <tr>
              <th className="border px-2 py-1">Staff No</th>
              <th className="border px-2 py-1">Name</th>
              <th className="border px-2 py-1">Phone</th>
              <th className="border px-2 py-1">Personal Email</th> {/* updated header */}
              <th className="border px-2 py-1">Employment Type</th>
              <th className="border px-2 py-1">Active</th>
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {employees && employees.length > 0 ? (
              employees.map(emp => (
                <tr key={emp.staff_no}>
                  <td>{emp.staff_no || ""}</td>
                  <td>{emp.name || ""}</td>
                  <td>{emp.phone || ""}</td>
                  <td>{emp.personal_email || ""}</td> {/* updated field */}
                  <td>{emp.employment_type || ""}</td>
                  <td>{emp.is_active ? "Yes" : "No"}</td>
                  <td>
                    <button className="text-blue-600 underline text-xs" onClick={() => openEdit(emp)}>
                      Edit
                    </button>
                    <button className="text-red-600 underline text-xs" onClick={() => handleDelete(emp.staff_no)}>
                      Delete
                    </button>
                    <button className="text-green-600 underline text-xs" onClick={() => openDetails(emp)}>
                      View Details
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="text-center py-4">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-lg">
            <h2 className="text-lg font-bold mb-4">{editStaffNo ? "Edit Employee" : "Add Employee"}</h2>
            <form onSubmit={handleSubmit} className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Staff No"
                  value={form.staff_no}
                  onChange={(e) => setForm({ ...form, staff_no: e.target.value })}
                  className="border px-2 py-1"
                  required
                  disabled={!!editStaffNo}
                />
                <input
                  type="text"
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="border px-2 py-1"
                  required
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="email"
                  placeholder="Personal Email"
                  value={form.personal_email}
                  onChange={(e) => setForm({ ...form, personal_email: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="KRA PIN"
                  value={form.kra_pin}
                  onChange={(e) => setForm({ ...form, kra_pin: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="ID Number"
                  value={form.id_number}
                  onChange={(e) => setForm({ ...form, id_number: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="NSSF Number"
                  value={form.nssf_number}
                  onChange={(e) => setForm({ ...form, nssf_number: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="NHIF Number"
                  value={form.nhif_number}
                  onChange={(e) => setForm({ ...form, nhif_number: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="Bank Name"
                  value={form.bank_name}
                  onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="Bank Account"
                  value={form.bank_account}
                  onChange={(e) => setForm({ ...form, bank_account: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="Branch Name"
                  value={form.branch_name}
                  onChange={(e) => setForm({ ...form, branch_name: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="text"
                  placeholder="Branch Code"
                  value={form.branch_code}
                  onChange={(e) => setForm({ ...form, branch_code: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="number"
                  placeholder="Basic Salary"
                  value={form.basic_salary}
                  onChange={(e) => setForm({ ...form, basic_salary: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="number"
                  placeholder="House Allowance"
                  value={form.house_allowance}
                  onChange={(e) => setForm({ ...form, house_allowance: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="number"
                  placeholder="Transport Allowance"
                  value={form.transport_allowance}
                  onChange={(e) => setForm({ ...form, transport_allowance: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="number"
                  placeholder="Other Allowances"
                  value={form.other_allowances}
                  onChange={(e) => setForm({ ...form, other_allowances: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="number"
                  placeholder="Commission"
                  value={form.commission}
                  onChange={(e) => setForm({ ...form, commission: e.target.value })}
                  className="border px-2 py-1"
                />
                <input
                  type="number"
                  placeholder="Bonus"
                  value={form.bonus}
                  onChange={(e) => setForm({ ...form, bonus: e.target.value })}
                  className="border px-2 py-1"
                />
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={form.is_director}
                    onChange={(e) => setForm({ ...form, is_director: e.target.checked })}
                    className="mr-2"
                  />
                  <label>Director</label>
                </div>
                <select
                  value={form.employment_type}
                  onChange={(e) => setForm({ ...form, employment_type: e.target.value })}
                  className="border px-2 py-1"
                >
                  <option value="permanent">Permanent</option>
                  <option value="contract">Contract</option>
                  <option value="casual">Casual</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                  {editStaffNo ? "Update" : "Add"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedEmployee && (
        <EmployeeDetailsModal employee={selectedEmployee} onClose={() => setSelectedEmployee(null)} employees={employees} />
      )}
    </div>
  );
};

const EmployeeDetailsModal = ({ employee, onClose, employees }) => {
  const [activeTab, setActiveTab] = useState("Personal");

  const tabs = [
    { label: "Personal", component: <PersonalDetails data={employee} /> },
    { label: "Salary", component: <SalaryDetails data={employee} /> },
    { label: "HR", component: <HRDetails data={employee} employeeList={employees} /> },
    { label: "Contact", component: <ContactDetails data={employee} /> },
    { label: "Documents", component: <Documents data={employee} /> },
    { label: "Deductions", component: <Deductions data={employee} /> },
    { label: "Benefits", component: <Benefits data={employee} /> },
    { label: "Earnings", component: <Earnings data={employee} /> },
    { label: "Loans/Advances", component: <LoansAdvance loans={employee.loans || []} advances={employee.advances || []} /> },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-full max-w-5xl h-[80vh] flex flex-col">
        <h2 className="text-lg font-bold mb-4">Employee Details</h2>
        <div className="border-b mb-4 flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              className={`px-4 py-2 whitespace-nowrap ${activeTab === tab.label ? "border-b-2 border-blue-600 font-bold" : "text-gray-600"}`}
              onClick={() => setActiveTab(tab.label)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {tabs.find((tab) => tab.label === activeTab)?.component}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeeList;