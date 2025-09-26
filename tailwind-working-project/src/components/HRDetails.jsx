import React, { useState, useMemo } from "react";
import axios from "axios";

const HRDetails = ({ data, employeeList = [], onEmployeeUpdated }) => {
  const [form, setForm] = useState({
    staff_no: data.staff_no || "",
    date_of_employment: data.date_of_employment || "",
    contract_start: data.contract_start || "",
    contract_end: data.contract_end || "",
    job_title: data.job_title || "",
    department: data.department || "",
    reports_to: data.reports_to || "",
    region: data.region || "",
    is_director: data.is_director || false,
    project: data.project || "",
  });

  // Calculate contract duration
  const contractDuration = useMemo(() => {
    if (form.contract_start) {
      const start = new Date(form.contract_start);
      const end = form.contract_end ? new Date(form.contract_end) : new Date();
      let years = end.getFullYear() - start.getFullYear();
      let months = end.getMonth() - start.getMonth();
      if (months < 0) {
        years -= 1;
        months += 12;
      }
      return `${years > 0 ? years + " Years " : ""}${months > 0 ? months + " Months" : ""}`.trim();
    }
    return "";
  }, [form.contract_start, form.contract_end]);

  const handleUpdate = async () => {
    try {
      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          // Convert boolean to string for is_director
          if (key === "is_director") {
            formData.append(key, value ? "true" : "false");
          } else {
            formData.append(key, value);
          }
        }
      });

      await axios.put(
        `http://127.0.0.1:8000/employees/${form.staff_no}/hr`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      // Fetch updated employee details
      const res = await axios.get(
        `http://127.0.0.1:8000/employees/${form.staff_no}`
      );
      if (onEmployeeUpdated) {
        onEmployeeUpdated(res.data); // update parent state
      }
      alert("Employee HR details updated!");
    } catch (err) {
      alert("Update failed");
    }
  };

  return (
    <div className="grid grid-cols-2 gap-6">
      <div>
        <label>Job/Staff Number:</label>
        <input className="border px-2 py-1 w-full" value={form.staff_no} disabled />
      </div>
      <div>
        <label>Date of Employment:</label>
        <input
          type="date"
          className="border px-2 py-1 w-full"
          value={form.date_of_employment}
          onChange={e => setForm({ ...form, date_of_employment: e.target.value })}
        />
      </div>
      <div className="col-span-2 flex items-center gap-4">
        <label>Current Contract:</label>
        <input
          type="date"
          className="border px-2 py-1"
          value={form.contract_start}
          onChange={e => setForm({ ...form, contract_start: e.target.value })}
        />
        <span>to</span>
        <input
          type="date"
          className="border px-2 py-1"
          value={form.contract_end}
          onChange={e => setForm({ ...form, contract_end: e.target.value })}
        />
        <span>({contractDuration})</span>
      </div>
      <div>
        <label>Job Title:</label>
        <input
          className="border px-2 py-1 w-full"
          value={form.job_title}
          onChange={e => setForm({ ...form, job_title: e.target.value })}
        />
      </div>
      <div>
        <label>Department:</label>
        <select
          className="border px-2 py-1 w-full"
          value={form.department}
          onChange={e => setForm({ ...form, department: e.target.value })}
        >
          <option value="">Select</option>
          <option value="IT">IT</option>
          <option value="CustomerService">Customer Service</option>
          <option value="Admin">Admin</option>
          <option value="Accounts">Accounts</option>
        </select>
      </div>
      <div>
        <label>Reports to:</label>
        <select
          className="border px-2 py-1 w-full"
          value={form.reports_to}
          onChange={e => setForm({ ...form, reports_to: e.target.value })}
        >
          <option value="">Select</option>
          {employeeList && employeeList.length > 0 ? (
            employeeList.map(emp => (
              <option key={emp.staff_no} value={emp.staff_no}>
                {emp.name} [{emp.staff_no}]
              </option>
            ))
          ) : (
            <div>No employees found.</div>
          )}
        </select>
      </div>
      <div>
        <label>Region:</label>
        <select
          className="border px-2 py-1 w-full"
          value={form.region}
          onChange={e => setForm({ ...form, region: e.target.value })}
        >
          <option value="">Select</option>
          <option value="Kilifi">Kilifi</option>
          <option value="Mtwapa">Mtwapa</option>
        </select>
      </div>
      <div>
        <label>Board Director:</label>
        <div>
          <label>
            <input
              type="radio"
              name="is_director"
              checked={!form.is_director}
              onChange={() => setForm({ ...form, is_director: false })}
            />
            No
          </label>
          <label className="ml-4">
            <input
              type="radio"
              name="is_director"
              checked={!!form.is_director}
              onChange={() => setForm({ ...form, is_director: true })}
            />
            Yes
          </label>
        </div>
      </div>
      <div>
        <label>Project (Optional):</label>
        <input
          className="border px-2 py-1 w-full"
          value={form.project}
          onChange={e => setForm({ ...form, project: e.target.value })}
        />
      </div>
      <div className="col-span-2 flex justify-center mt-4">
        <button
          className="px-4 py-2 bg-green-600 text-white rounded"
          onClick={handleUpdate}
        >
          Update Employee
        </button>
      </div>
    </div>
  );
};

export default HRDetails;

