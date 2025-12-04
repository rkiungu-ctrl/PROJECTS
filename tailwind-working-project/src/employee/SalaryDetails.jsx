// src/components/SalaryDetails.jsx
import React, { useState } from "react";

import { api } from "../lib/api";

// Reusable save helper
export async function handleSalarySave(staffNo, salaryForm, onSuccess, onError) {
  const fd = new FormData();
  fd.append("employment_type", salaryForm.employment_type || "");
  fd.append("payment_currency", salaryForm.payment_currency || "");
  fd.append("basic_salary", salaryForm.basic_salary || "");
  fd.append("work_shift", salaryForm.work_shift || "");
  fd.append("off_days", salaryForm.off_days || "");
  fd.append("daily_hours", salaryForm.daily_hours || 8);
  fd.append("income_tax", salaryForm.income_tax || "");
  fd.append("deduct_shif", salaryForm.deduct_shif ? "true" : "false");
  fd.append("deduct_nssf", salaryForm.deduct_nssf ? "true" : "false");
  fd.append("deduct_housing_levy", salaryForm.deduct_housing_levy ? "true" : "false");
  fd.append("disability_exemption_amount", salaryForm.disability_exemption_amount || "");
  fd.append("exemption_certificate_no", salaryForm.exemption_certificate_no || "");
  fd.append("mobile_money", salaryForm.mobile_money || "");
  fd.append("bank_name", salaryForm.bank_name || "");
  fd.append("bank_account", salaryForm.bank_account || "");
  fd.append("branch_name", salaryForm.branch_name || "");
  fd.append("branch_code", salaryForm.branch_code || "");
  fd.append("salary_processing_method", salaryForm.salary_processing_method || "");
  fd.append("account_name", salaryForm.account_name || "");

  try {
    const res = await api.put(`/employees/${encodeURIComponent(staffNo)}/salary`, fd);
    onSuccess && onSuccess();
    return res.data;
  } catch (e) {
    onError && onError(e);
    throw e;
  }
}

export default function SalaryDetails({
  staffNo,
  data = {},
  personalName,
  onChange,
  onSaved,
  onContinue, // optional: called after successful save when pressing "Add & Continue"
  formData,
  setFormData,
}) {
  // 🔧 FIX: define message state to prevent crash/blank page
  const [message, setMessage] = useState("");

  // keep account_name synced to Personal tab name unless typed manually
  React.useEffect(() => {
    if (!personalName) return;
    setFormData((prev) => {
      const existing = prev?.salary?.account_name;
      if (existing) return prev; // already set by user
      const nextSalary = { ...(prev.salary || {}), account_name: personalName };
      // if no change, avoid updating state
      if (JSON.stringify(nextSalary) === JSON.stringify(prev.salary || {})) return prev;
      const next = { ...prev, salary: nextSalary };
      // call onChange with the new salary object (outside of render)
      try {
        onChange && onChange(nextSalary);
      } catch (e) {
        // ignore handler errors
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalName]);

  // refresh from new data prop
  React.useEffect(() => {
    if (!data) return;
    setFormData((prev) => {
      const prevSalary = prev.salary || {};
      const merged = {
        ...prevSalary,
        employment_type: data.employment_type ?? prevSalary.employment_type,
        payment_currency: data.payment_currency ?? prevSalary.payment_currency,
        basic_salary: data.basic_salary ?? prevSalary.basic_salary,
        work_shift: data.work_shift ?? prevSalary.work_shift,
        off_days: data.off_days ?? prevSalary.off_days,
        daily_hours: data.daily_hours ?? prevSalary.daily_hours,
        income_tax: data.income_tax ?? prevSalary.income_tax,
        deduct_shif: !!data.deduct_shif,
        deduct_nssf: !!data.deduct_nssf,
        deduct_housing_levy: !!data.deduct_housing_levy,
        salary_processing_method: data.salary_processing_method ?? prevSalary.salary_processing_method,
        mobile_money: data.mobile_money ?? prevSalary.mobile_money,
        bank_name: data.bank_name ?? prevSalary.bank_name,
        bank_account: data.bank_account ?? prevSalary.bank_account,
        branch_name: data.branch_name ?? prevSalary.branch_name,
        branch_code: data.branch_code ?? prevSalary.branch_code,
        disability_exemption_amount: data.disability_exemption_amount ?? prevSalary.disability_exemption_amount,
        exemption_certificate_no: data.exemption_certificate_no ?? prevSalary.exemption_certificate_no,
        account_name: data.account_name ?? prevSalary.account_name,
        salary_type: data.salary_type ?? prevSalary.salary_type,
        salary_period: data.salary_period ?? prevSalary.salary_period,
      };

      // Avoid forcing state updates when nothing changed
      if (JSON.stringify(merged) === JSON.stringify(prevSalary)) return prev;

      return { ...prev, salary: merged };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const updated = { ...data, [name]: type === "checkbox" ? !!checked : value };
    setFormData((prev) => ({ ...prev, salary: updated }));
    if (onChange) onChange(updated);
  };

  const save = async (e) => {
    e && e.preventDefault();
    if (!staffNo) {
      setMessage("Failed to save: missing staff number.");
      return;
    }
    setMessage("");
    await handleSalarySave(
      staffNo,
      formData.salary || {},
      async (returned) => {
        setMessage("Salary details saved.");
        // If the helper returned data, forward it to parent
        onSaved && onSaved(returned);
        onContinue && onContinue();
      },
      (err) => setMessage(`Failed to save: ${err?.response?.data?.detail || err.message}`)
    );
  };

  // computed rates (display only)
  const monthlySalary = parseFloat(data.basic_salary || 0) || 0;
  const dailyHours = parseFloat(data.daily_hours || 8) || 8;
  const hourlyRate = monthlySalary && dailyHours ? monthlySalary / (4.33 * 5 * dailyHours) : 0; // ~4.33 weeks
  const dailyRate = monthlySalary ? monthlySalary / 30 : 0;

  return (
    <form onSubmit={save} className="w-full">
      {message && (
        <div
          className={`mb-4 p-2 rounded text-sm ${
            message.startsWith("Failed") ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
          }`}
        >
          {message}
        </div>
      )}

      {/* Top-level two-column layout (Wingubox style) */}
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* LEFT: Salary inputs */}
  <div className="bg-white border rounded-md p-2">
          <div className="grid grid-cols-12 gap-2">
            {/* Employment Type */}
            <div className="col-span-12">
              <label className="block text-sm font-medium">Employment Type</label>
              <select
                name="employment_type"
                value={data.employment_type || ""}
                onChange={handleChange}
                className="mt-1 w-full border rounded p-2"
              >
                <option value="">— Select —</option>
                <option value="Regular (open-ended)">Regular (open-ended)</option>
                <option value="Fixed Term">Fixed Term</option>
                <option value="Intern">Intern</option>
                <option value="Casual">Casual</option>
              </select>
            </div>

            {/* Payment Currency */}
            <div className="col-span-12">
              <label className="block text-sm font-medium">Payment Currency</label>
              <select
                name="payment_currency"
                value={data.payment_currency || "KES"}
                onChange={handleChange}
                className="mt-1 w-full border rounded p-2"
              >
                <option value="KES">KES</option>
                <option value="USD">USD</option>
              </select>
            </div>

            {/* Monthly Salary + Basic Pay + Monthly label (compact row) */}
            <div className="col-span-12 grid grid-cols-12 gap-1 items-end">
              <div className="col-span-8">
                <label className="block text-sm font-medium">Monthly Salary (KES)</label>
                <input
                  name="basic_salary"
                  type="number"
                  step="0.01"
                  value={data.basic_salary || ""}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded p-2"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium">Type of Pay</label>
                <select
                  name="salary_type"
                  value={data.salary_type || "Basic Pay"}
                  onChange={handleChange}
                  className="w-full border rounded p-2"
                >
                  <option value="Basic Pay">Basic Pay</option>
                  <option value="Gross Pay (Incl. Benefits (computed))">Gross Pay (Incl. Benefits (computed))</option>
                  <option value="Consolidated Pay (Incl. Benefits (non-computed))">Consolidated Pay (Incl. Benefits (non-computed))</option>
                  <option value="Net Pay">Net Pay</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium">Payment Schedule</label>
                <select
                  name="salary_period"
                  value={data.salary_period || "Monthly"}
                  onChange={handleChange}
                  className="w-full border rounded p-2"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Daily">Daily</option>
                  <option value="Quarterly">Quarterly</option>
                </select>
              </div>
            </div>

            {/* Work Shift */}
            <div className="col-span-12">
              <label className="block text-sm font-medium">Work Shift</label>
              <select
                name="work_shift"
                value={data.work_shift || "Regular Shift"}
                onChange={handleChange}
                className="mt-1 w-full border rounded p-2"
              >
                <option>Regular Shift</option>
                <option>Night Shift</option>
                <option>Rotational</option>
              </select>
            </div>

            {/* Off Days */}
            <div className="col-span-12">
              <label className="block text-sm font-medium">Off Days</label>
              <input
                name="off_days"
                value={data.off_days || ""}
                onChange={handleChange}
                className="mt-1 w-full border rounded p-2"
                placeholder="e.g., Sunday"
              />
            </div>

            {/* Daily Hours row with suffix */}
            <div className="col-span-12 grid grid-cols-12 gap-1 items-end">
              <div className="col-span-4">
                <label className="block text-sm font-medium">Daily Hours</label>
                <input
                  name="daily_hours"
                  type="number"
                  step="0.25"
                  value={data.daily_hours || 8}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded p-2"
                />
              </div>
              <div className="col-span-8">
                <label className="block text-sm font-medium invisible">label</label>
                <div className="h-[38px] w-full border rounded p-2 text-sm bg-gray-50 flex items-center">
                  {data.daily_hours || 8} Hours per Day
                </div>
              </div>
            </div>

            {/* Hourly Rate (display only) */}
            <div className="col-span-12 grid grid-cols-12 gap-1 items-end">
              <div className="col-span-6">
                <label className="block text-sm font-medium">Hourly Rate (KES)</label>
                <input
                  value={(hourlyRate || 0).toFixed(2)}
                  readOnly
                  className="mt-1 w-full border rounded p-2 bg-gray-100"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium invisible">label</label>
                <div className="h-[38px] border rounded p-2 text-sm bg-gray-50 flex items-center justify-center">
                  Per Hour
                </div>
              </div>
              <div className="col-span-3 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm mt-6">
                  <input type="checkbox" disabled /> <span>User-defined</span>
                </label>
              </div>
            </div>

            {/* Daily Rate (display only) */}
            <div className="col-span-12 grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6">
                <label className="block text-sm font-medium">Daily Rate (KES)</label>
                <input
                  value={(dailyRate || 0).toFixed(2)}
                  readOnly
                  className="mt-1 w-full border rounded p-2 bg-gray-100"
                />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium invisible">label</label>
                <div className="h-[38px] border rounded p-2 text-sm bg-gray-50 flex items-center justify-center">
                  Per Day
                </div>
              </div>
            </div>

            {/* Income Tax */}
            <div className="col-span-12">
              <label className="block text-sm font-medium">Income Tax</label>
              <select
                name="income_tax"
                value={data.income_tax || "P.A.Y.E. Primary Employee"}
                onChange={handleChange}
                className="mt-1 w-full border rounded p-2"
              >
                <option>P.A.Y.E. Primary Employee</option>
                <option>P.A.Y.E. Secondary Employee</option>
                <option>Withholding</option>
                <option>Exempt</option>
              </select>
            </div>

            {/* Contributions */}
            <div className="col-span-12">
              <div className="flex flex-wrap gap-4 mt-1">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="deduct_shif"
                    checked={!!data.deduct_shif}
                    onChange={handleChange}
                  />
                  <span>Deduct SHIF</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="deduct_nssf"
                    checked={!!data.deduct_nssf}
                    onChange={handleChange}
                  />
                  <span>Deduct NSSF</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="deduct_housing_levy"
                    checked={!!data.deduct_housing_levy}
                    onChange={handleChange}
                  />
                  <span>Deduct Housing Levy</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Tax Exemption + Salary Processing Options */}
  <div className="space-y-3">
          {/* Tax Exemption card */}
          <div className="bg-white border rounded-md p-2">
            <h3 className="text-base font-semibold mb-3 border-b pb-2">Tax Exemption</h3>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12">
                <label className="block text-sm font-medium">Disability Exemption Amount (KES)</label>
                <input
                  name="disability_exemption_amount"
                  type="number"
                  step="0.01"
                  value={data.disability_exemption_amount || ""}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded p-2"
                />
              </div>
              <div className="col-span-12">
                <label className="block text-sm font-medium">Exemption Certificate No.</label>
                <input
                  name="exemption_certificate_no"
                  value={data.exemption_certificate_no || ""}
                  onChange={handleChange}
                  className="mt-1 w-full border rounded p-2"
                />
              </div>
            </div>
          </div>

          {/* Salary Processing Options */}
          <div className="bg-white border rounded-md p-2">
            <h3 className="text-base font-semibold mb-3 border-b pb-2">Salary Processing Options</h3>

            <div className="mb-4">
              <select
                name="salary_processing_method"
                value={data.salary_processing_method || "Bank"}
                onChange={handleChange}
                className="w-56 border rounded p-2"
              >
                <option value="Bank">Bank Transfer</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Cash">Cash</option>
              </select>
            </div>

            {/* Bank Salary Processing fields - hide when Cash is selected */}
            { (data.salary_processing_method || "Bank") !== "Cash" && (
              <div className="border rounded-md p-2">
                <div className="grid grid-cols-12 gap-2 mt-1">
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Account Name</label>
                    <input
                      name="account_name"
                      value={data.account_name || ""}
                      onChange={handleChange}
                      className="mt-1 w-full border rounded p-2"
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Bank Account No.</label>
                    <input
                      name="bank_account"
                      value={data.bank_account || ""}
                      onChange={handleChange}
                      className="mt-1 w-full border rounded p-2"
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Bank Name</label>
                    <input
                      name="bank_name"
                      value={data.bank_name || ""}
                      onChange={handleChange}
                      className="mt-1 w-full border rounded p-2"
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Bank Branch</label>
                    <input
                      name="branch_name"
                      value={data.branch_name || ""}
                      onChange={handleChange}
                      className="mt-1 w-full border rounded p-2"
                    />
                  </div>

                  <div className="col-span-12">
                    <label className="block text-sm font-medium">
                      Sort Code <span className="text-xs text-gray-500">(Bank + Branch Code)</span>
                    </label>
                    <input
                      name="branch_code"
                      value={data.branch_code || ""}
                      onChange={handleChange}
                      className="mt-1 w-full border rounded p-2"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer handled by modal - do not include a separate Save here */}
    </form>
  );
}
