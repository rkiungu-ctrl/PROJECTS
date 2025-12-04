import React, { useState } from "react";

const defaultLeaveTypes = [
  { type: "Annual Leave", paid: true, accrued: true },
  { type: "Sick Leave", paid: true, accrued: false },
  { type: "Maternity Leave", paid: true, accrued: false },
  { type: "Paternity Leave", paid: true, accrued: false },
  { type: "Unpaid Leave", paid: false, accrued: false },
];

const Leave = ({ formData, setFormData }) => {
  const leaves = formData.leaves || [];
  const [editingIdx, setEditingIdx] = useState(null);
  const [form, setForm] = useState({
    type: "",
    paid: false,
    accrued: false,
    accrued_annually: "",
    allowed: "",
    used: "",
    remaining: "",
  });
  const [showForm, setShowForm] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleInput = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((f) => ({ ...f, [name]: type === "checkbox" ? checked : value }));
    setDirty(true);
  };

  const handleEdit = (idx) => {
    setEditingIdx(idx);
    setForm(leaves[idx]);
    setShowForm(true);
    setDirty(false);
  };

  const handleDelete = (idx) => {
    const updated = leaves.filter((_, i) => i !== idx);
    setFormData((prev) => ({ ...prev, leaves: updated }));
    setEditingIdx(null);
    setShowForm(false);
    setDirty(true);
  };

  const handleAdd = () => {
    setForm({
      type: "",
      paid: false,
      accrued: false,
      accrued_annually: "",
      allowed: "",
      used: "",
      remaining: "",
    });
    setEditingIdx(null);
    setShowForm(true);
    setDirty(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    let updated;
    if (editingIdx !== null) {
      updated = leaves.map((b, i) => (i === editingIdx ? form : b));
    } else {
      updated = [...leaves, form];
    }
    setFormData((prev) => ({ ...prev, leaves: updated }));
    setShowForm(false);
    setEditingIdx(null);
    setDirty(false);
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h3 className="font-bold mb-2">Employee Leave</h3>
      <table className="min-w-full border text-sm mb-2">
        <thead className="bg-purple-200">
          <tr>
            <th className="border px-2 py-1">Leave Type</th>
            <th className="border px-2 py-1">Paid/Non Paid</th>
            <th className="border px-2 py-1">Accrued Annually</th>
            <th className="border px-2 py-1">Annual Hrs Allowed</th>
            <th className="border px-2 py-1">Annual Hrs Used</th>
            <th className="border px-2 py-1">Hours Remaining</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {leaves.length === 0 ? (
            <tr>
              <td colSpan={7} className="border px-2 py-2 text-center text-gray-500">No leave records</td>
            </tr>
          ) : (
            leaves.map((l, idx) => (
              <tr key={idx} className={editingIdx === idx ? "bg-purple-100" : ""}>
                <td className="border px-2 py-1">{l.type}</td>
                <td className="border px-2 py-1">{l.paid ? "Paid" : "Non Paid"}</td>
                <td className="border px-2 py-1">{l.accrued ? "Yes" : "No"}</td>
                <td className="border px-2 py-1">{l.allowed}</td>
                <td className="border px-2 py-1">{l.used}</td>
                <td className="border px-2 py-1">{l.remaining}</td>
                <td className="border px-2 py-1">
                  <button className="text-blue-600 underline mr-2" onClick={() => handleEdit(idx)}>Edit</button>
                  <button className="text-red-600 underline" onClick={() => handleDelete(idx)}>Delete</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {showForm && (
        <form className="bg-purple-50 p-4 rounded mb-2 w-full" onSubmit={handleSave}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <select className="border px-2 py-1 rounded" name="type" value={form.type} onChange={handleInput} required>
              <option value="">Select Leave Type</option>
              {defaultLeaveTypes.map((t) => (
                <option key={t.type} value={t.type}>{t.type}</option>
              ))}
            </select>
            <select className="border px-2 py-1 rounded" name="paid" value={form.paid ? "true" : "false"} onChange={e => setForm(f => ({ ...f, paid: e.target.value === "true" }))}>
              <option value="true">Paid</option>
              <option value="false">Non Paid</option>
            </select>
            <select className="border px-2 py-1 rounded" name="accrued" value={form.accrued ? "true" : "false"} onChange={e => setForm(f => ({ ...f, accrued: e.target.value === "true" }))}>
              <option value="true">Accrued</option>
              <option value="false">Not Accrued</option>
            </select>
            <input className="border px-2 py-1 rounded" name="accrued_annually" placeholder="Accrued Annually" value={form.accrued_annually} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="allowed" placeholder="Annual Hrs Allowed" value={form.allowed} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="used" placeholder="Annual Hrs Used" value={form.used} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="remaining" placeholder="Hours Remaining" value={form.remaining} onChange={handleInput} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">
              {editingIdx !== null ? "Save Changes" : "Add Leave"}
            </button>
            <button type="button" className="bg-gray-400 text-white px-3 py-1 rounded" onClick={() => { setShowForm(false); setEditingIdx(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <button className="mt-2 bg-green-600 text-white px-3 py-1 rounded" onClick={handleAdd}>
        Add Leave
      </button>

      {dirty && (
        <button className="mt-4 bg-blue-700 text-white px-6 py-2 rounded float-right" onClick={() => { setFormData((prev) => ({ ...prev, leaves })); setDirty(false); }}>
          Save
        </button>
      )}

      <div className="mt-8 text-center text-purple-700 font-semibold">
        Earned Paid Off (PTO)
      </div>
    </div>
  );
};

export default Leave;
