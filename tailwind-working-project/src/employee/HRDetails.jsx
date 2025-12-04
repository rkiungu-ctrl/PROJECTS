import React, { useState, useEffect } from "react";
import { api } from "../lib/api";
import { departments } from "./departmentList";
import { getNextStaffNo } from "./StaffNoGenerator";

const HRDetails = ({ data = {}, onChange, employees = [], formData, setFormData }) => {
  const isNew = !data?.staff_no;
  const autoStaffNo = isNew ? getNextStaffNo(employees) : data.staff_no;

  useEffect(() => {
    if (!data.staff_no) return;
    api.get(`/employees/${data.staff_no}/increments`)
      .then(res => setIncrements(res.data))
      .catch(() => setIncrements([]));
  }, [data.staff_no]);

  const handleFormChange = (e) => {
    const { name, value, type, checked } = e.target;
    const updated = { ...data, [name]: type === "checkbox" ? checked : value };
    setFormData((prev) => ({ ...prev, hr: updated }));
    if (onChange) onChange(updated);
  };

  const [increments, setIncrements] = useState([]);
  const [newInc, setNewInc] = useState({ start_date: "", gross_pay: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editInc, setEditInc] = useState({ start_date: "", gross_pay: "" });

  const addIncrement = async (e) => {
    e.preventDefault();
    if (!newInc.start_date || !newInc.gross_pay) return;
    setLoading(true);
    setErr("");
    try {
      const res = await api.post(`/employees/${data.staff_no}/increments`, {
        start_date: newInc.start_date,
        gross_pay: parseFloat(newInc.gross_pay)
      });
      setIncrements([...increments, res.data]);
      setNewInc({ start_date: "", gross_pay: "" });
    } catch {
      setErr("Failed to add increment");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (idx) => {
    setEditIdx(idx);
    setEditInc({
      start_date: increments[idx].start_date,
      gross_pay: increments[idx].gross_pay,
    });
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setEditInc({ start_date: "", gross_pay: "" });
  };

  const saveEdit = async (incId) => {
    setLoading(true);
    setErr("");
    try {
      const res = await api.put(`/employees/increments/${incId}`, {
        start_date: editInc.start_date,
        gross_pay: parseFloat(editInc.gross_pay)
      });
      setIncrements(increments.map((inc) => (inc.id === incId ? res.data : inc)));
      cancelEdit();
    } catch {
      setErr("Failed to update increment");
    } finally {
      setLoading(false);
    }
  };

  const deleteIncrement = async (incId) => {
    if (!window.confirm("Delete this increment?")) return;
    setLoading(true);
    setErr("");
    try {
      await api.delete(`/employees/increments/${incId}`);
      setIncrements(increments.filter((inc) => inc.id !== incId));
    } catch {
      setErr("Failed to delete increment");
    } finally {
      setLoading(false);
    }
  };

  const [message, setMessage] = useState("");
  const handleUpdate = async () => {
    setMessage("");
    try {
      const payload = new FormData();
      const { hr } = formData;
      const putIfTruthy = (key, val) => {
        if (val !== undefined && val !== null && String(val).trim() !== "") payload.append(key, val);
      };
      putIfTruthy("job_title", hr.job_title);
      putIfTruthy("department", hr.department);
      putIfTruthy("reports_to", hr.reports_to);
      putIfTruthy("head_of", hr.head_of);
      putIfTruthy("region", hr.region);
      payload.append("is_director", hr.is_director ? "true" : "false");
      putIfTruthy("date_of_employment", hr.date_of_employment);
      putIfTruthy("contract_start", hr.contract_start);
      putIfTruthy("contract_end", hr.contract_end);
      putIfTruthy("project", hr.project);

      const staffNoToUse = formData.hr.staff_no && formData.hr.staff_no.trim()
        ? formData.hr.staff_no.trim()
        : autoStaffNo;

      await api.put(`/employees/${staffNoToUse}/hr`, payload);

      const res = await api.get(`/employees/${staffNoToUse}`);
      const emp = res.data || {};
      setFormData((prev) => ({
        ...prev,
        hr: {
          staff_no: emp.staff_no ?? prev.hr?.staff_no ?? "",
          job_title: emp.job_title ?? prev.hr?.job_title ?? "",
          department: emp.department ?? prev.hr?.department ?? "",
          head_of: emp.head_of ?? prev.hr?.head_of ?? "",
          reports_to: emp.reports_to ?? prev.hr?.reports_to ?? "",
          region: emp.region ?? prev.hr?.region ?? "",
          date_of_employment: emp.date_of_employment ?? prev.hr?.date_of_employment ?? "",
          contract_start: emp.contract_start ?? prev.hr?.contract_start ?? "",
          contract_end: emp.contract_end ?? prev.hr?.contract_end ?? "",
          project: emp.project ?? prev.hr?.project ?? "",
          is_director: emp.is_director ?? prev.hr?.is_director ?? false,
        },
      }));
      setMessage("Saved successfully");
    } catch {
      setMessage("Failed to save");
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <form className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-4 rounded shadow">
        <div>
          <label className="block text-sm font-medium">Job/Staff Number</label>
          <input
            type="text"
            name="staff_no"
            value={data.staff_no || ""}
            onChange={handleFormChange}
            className="w-full border px-2 py-1 rounded"
            placeholder={`Leave blank to auto-generate (${autoStaffNo})`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Job Title</label>
          <input type="text" name="job_title" value={data.job_title || ""} onChange={handleFormChange} className="w-full border px-2 py-1 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Department</label>
          <select name="department" value={data.department || ""} onChange={handleFormChange} className="w-full border px-2 py-1 rounded">
            <option value="">Select</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Region</label>
          <input type="text" name="region" value={data.region || ""} onChange={handleFormChange} className="w-full border px-2 py-1 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Date of Employment</label>
          <input type="date" name="date_of_employment" value={data.date_of_employment || ""} onChange={handleFormChange} className="w-full border px-2 py-1 rounded" />
        </div>
        <div>
          <label className="block text-sm font-medium">Head of</label>
          <select name="head_of" value={data.head_of || ""} onChange={handleFormChange} className="w-full border px-2 py-1 rounded">
            <option value="">Select</option>
            {departments.map((dept) => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Reports to</label>
          <select name="reports_to" value={data.reports_to || ""} onChange={handleFormChange} className="w-full border px-2 py-1 rounded">
            <option value="">Select</option>
            {employees.map((emp) => (
              <option key={emp.staff_no || emp.id || emp.name} value={emp.staff_no || emp.id || emp.name}>{emp.name}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <label className="block text-sm font-medium">Board Director:</label>
          <input type="checkbox" name="is_director" checked={!!data.is_director} onChange={handleFormChange} />
        </div>
      </form>

      {/* Increments table & controls omitted for brevity (unchanged) */}

      {/* Use modal's Update Employee button to save HR (keep message for inline feedback) */}
      <div className="mt-3">
        {message && <span className="ml-3 text-sm">{message}</span>}
      </div>
    </div>
  );
};

export default HRDetails;
