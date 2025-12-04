import React from "react";

const Earnings = ({ data = {}, onChange, formData, setFormData }) => {
  const defaultTypes = [
    "Bonus",
    "Commissions",
    "Daily Wages",
    "Director's fee",
    "Hourly Wages",
    "Overtime",
    "Overtime @1.5x",
    "Other"
  ];

  const earnings = data.earnings || [];
  const types = defaultTypes;

  const handleInput = (idx, field, value) => {
    const updated = earnings.map((item, i) =>
      i === idx ? { ...item, [field]: field === "recurring" ? value : value } : item
    );
    setFormData((prev) => ({
      ...prev,
      salary: { ...prev.salary, earnings: updated },
    }));
    onChange && onChange({ ...data, earnings: updated });
  };

  const handleDelete = (idx) => {
    const updated = earnings.filter((_, i) => i !== idx);
    setFormData((prev) => ({
      ...prev,
      salary: { ...prev.salary, earnings: updated },
    }));
    onChange && onChange({ ...data, earnings: updated });
  };

  const handleAdd = () => {
    const newEarning = {
      type: formData.earningType || "",
      amount: formData.earningAmount || "",
      recurring: formData.earningRecurring || false,
    };
    if (!newEarning.type || !newEarning.amount) return;
    const updated = [...earnings, newEarning];
    setFormData((prev) => ({
      ...prev,
      salary: { ...prev.salary, earnings: updated },
      earningType: "",
      earningAmount: "",
      earningRecurring: false,
    }));
    onChange && onChange({ ...data, earnings: updated });
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h3 className="font-bold mb-2">Employee Earnings</h3>
      <table className="min-w-full border text-sm mb-2">
        <thead>
          <tr>
            <th className="border px-2 py-1">Type</th>
            <th className="border px-2 py-1">Amount</th>
            <th className="border px-2 py-1">Recurring</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
          {earnings.length === 0 ? (
            <tr>
              <td colSpan={4} className="border px-2 py-2 text-center text-gray-500">No earnings</td>
            </tr>
          ) : (
            earnings.map((b, idx) => (
              <tr key={idx}>
                <td className="border px-2 py-1">
                  <select
                    value={b.type}
                    onChange={e => handleInput(idx, "type", e.target.value)}
                    className="border px-2 py-1 rounded"
                  >
                    <option value="">Select Earning Type</option>
                    {types.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </td>
                <td className="border px-2 py-1">
                  <input
                    type="number"
                    value={b.amount}
                    onChange={e => handleInput(idx, "amount", e.target.value)}
                    className="border px-2 py-1 rounded"
                  />
                </td>
                <td className="border px-2 py-1">
                  <input
                    type="checkbox"
                    checked={b.recurring}
                    onChange={e => handleInput(idx, "recurring", e.target.checked)}
                  />
                </td>
                <td className="border px-2 py-1">
                  <button className="text-red-600 underline" onClick={() => handleDelete(idx)}>Delete</button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="flex gap-2 items-center mt-2">
        <select
          className="border px-2 py-1 rounded"
          value={formData.earningType || ""}
          onChange={e => setFormData((prev) => ({ ...prev, earningType: e.target.value }))}
        >
          <option value="">Select Earning Type</option>
          {types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input
          className="border px-2 py-1 rounded"
          type="number"
          placeholder="Amount"
          value={formData.earningAmount || ""}
          onChange={e => setFormData((prev) => ({ ...prev, earningAmount: e.target.value }))}
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={formData.earningRecurring || false}
            onChange={e => setFormData((prev) => ({ ...prev, earningRecurring: e.target.checked }))}
          />
          Recurring
        </label>
        <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={handleAdd}>
          Add Earning
        </button>
      </div>
    </div>
  );
};

export default Earnings;
