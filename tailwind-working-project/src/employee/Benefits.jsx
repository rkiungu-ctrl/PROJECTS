import React from "react";

const Benefits = ({ data = {}, onChange, formData, setFormData }) => {
  const benefitTypes = [
    { type: "House Allowance", key: "house_allowance" },
    { type: "Transport Allowance", key: "transport_allowance" },
    { type: "Other Allowances", key: "other_allowances" },
  ];

  const tableData = [
    ...benefitTypes.map(b => ({
      type: b.type,
      amount: data[b.key] ?? 0,
      recurring: true,
      key: b.key,
      isDefault: true,
    })),
    ...(data.benefits || []),
  ];

  const handleAmountChange = (idx, value) => {
    if (tableData[idx].isDefault) {
      onChange && onChange({ ...data, [tableData[idx].key]: Number(value) });
      setFormData((prev) => ({
        ...prev,
        salary: { ...prev.salary, [tableData[idx].key]: Number(value) },
      }));
    } else {
      const updated = [...(data.benefits || [])];
      updated[idx - benefitTypes.length] = {
        ...tableData[idx],
        amount: Number(value),
      };
      onChange && onChange({ ...data, benefits: updated });
      setFormData((prev) => ({
        ...prev,
        salary: { ...prev.salary, benefits: updated },
      }));
    }
  };

  const handleRecurringChange = (idx, checked) => {
    if (!tableData[idx].isDefault) {
      const updated = [...(data.benefits || [])];
      updated[idx - benefitTypes.length] = {
        ...tableData[idx],
        recurring: checked,
      };
      onChange && onChange({ ...data, benefits: updated });
      setFormData((prev) => ({
        ...prev,
        salary: { ...prev.salary, benefits: updated },
      }));
    }
  };

  const handleRemove = (idx) => {
    const updated = [...(data.benefits || [])];
    updated.splice(idx - benefitTypes.length, 1);
    onChange && onChange({ ...data, benefits: updated });
    setFormData((prev) => ({
      ...prev,
      salary: { ...prev.salary, benefits: updated },
    }));
  };

  const handleAddBenefit = () => {
    if (formData.benefitType && formData.benefitAmount) {
      const newBenefit = {
        type: formData.benefitType,
        amount: Number(formData.benefitAmount),
        recurring: formData.benefitRecurring || false,
      };
      const updated = [...(data.benefits || []), newBenefit];
      onChange && onChange({ ...data, benefits: updated });
      setFormData((prev) => ({
        ...prev,
        salary: { ...prev.salary, benefits: updated },
        benefitType: "",
        benefitAmount: "",
        benefitRecurring: false,
      }));
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h3 className="font-bold mb-2">Employee Benefits</h3>
      <div className="mb-4">
        <table className="min-w-full border">
          <thead>
            <tr>
              <th className="border px-2 py-1">Type</th>
              <th className="border px-2 py-1">Amount</th>
              <th className="border px-2 py-1">Recurring</th>
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-2">No benefits</td>
              </tr>
            ) : (
              tableData.map((row, idx) => (
                <tr key={row.key || idx}>
                  <td className="border px-2 py-1">{row.type}</td>
                  <td className="border px-2 py-1">
                    <input
                      type="number"
                      value={row.amount}
                      onChange={e => handleAmountChange(idx, e.target.value)}
                      className="w-24 border px-2 py-1 rounded"
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={row.recurring}
                      disabled={row.isDefault}
                      onChange={e => handleRecurringChange(idx, e.target.checked)}
                    />
                  </td>
                  <td className="border px-2 py-1 text-center">
                    {!row.isDefault && (
                      <button
                        className="text-red-500"
                        onClick={() => handleRemove(idx)}
                      >Remove</button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          placeholder="Type (e.g. Medical)"
          value={formData.benefitType || ""}
          onChange={e => setFormData && setFormData({ ...formData, benefitType: e.target.value })}
          className="border px-2 py-1 rounded"
        />
        <input
          type="number"
          placeholder="Amount"
          value={formData.benefitAmount || ""}
          onChange={e => setFormData && setFormData({ ...formData, benefitAmount: e.target.value })}
          className="border px-2 py-1 rounded w-24"
        />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={formData.benefitRecurring || false}
            onChange={e => setFormData && setFormData({ ...formData, benefitRecurring: e.target.checked })}
          />
          Recurring
        </label>
        <button
          className="bg-blue-500 text-white px-3 py-1 rounded"
          onClick={handleAddBenefit}
        >Add Benefit</button>
      </div>
    </div>
  );
};

export default Benefits;
