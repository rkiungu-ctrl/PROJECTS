import React, { useState } from "react";
import axios from "axios";

const SalaryDetails = ({ data }) => {
  const [form, setForm] = useState({
    employment_type: data.employment_type || "",
    payment_currency: data.payment_currency || "KES",
    basic_salary: data.basic_salary || "",
    work_shift: data.work_shift || "",
    off_days: data.off_days || "",
    daily_hours: data.daily_hours || 8,
    hourly_rate: data.hourly_rate || "",
    daily_rate: data.daily_rate || "",
    income_tax: data.income_tax || "",
    deduct_shif: data.deduct_shif || false,
    deduct_nssf: data.deduct_nssf || false,
    deduct_housing_levy: data.deduct_housing_levy || false,
    disability_exemption_amount: data.disability_exemption_amount || "",
    exemption_certificate_no: data.exemption_certificate_no || "",
    mobile_money: data.mobile_money || "",
    bank_name: data.bank_name || "",
    bank_account: data.bank_account || "",
    branch_name: data.branch_name || "",
    branch_code: data.branch_code || "",
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm({
      ...form,
      [name]: type === "checkbox" ? checked : value,
    });
  };

  const handleUpdate = async () => {
    const formData = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (
        [
          "basic_salary",
          "daily_hours",
          "hourly_rate",
          "daily_rate",
          "disability_exemption_amount",
        ].includes(key)
      ) {
        if (value !== "" && value !== null && value !== undefined) {
          formData.append(key, Number(value));
        }
      } else if (
        ["deduct_shif", "deduct_nssf", "deduct_housing_levy"].includes(key)
      ) {
        formData.append(key, value ? "true" : "false");
      } else {
        formData.append(key, value);
      }
    });

    try {
      await axios.put(
        `http://127.0.0.1:8000/employees/${data.staff_no}/salary`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } }
      );
      // Fetch updated employee details
      const res = await axios.get(`http://127.0.0.1:8000/employees/${data.staff_no}`);
      setForm({
        employment_type: res.data.employment_type || "",
        payment_currency: res.data.payment_currency || "KES",
        basic_salary: res.data.basic_salary || "",
        work_shift: res.data.work_shift || "",
        off_days: res.data.off_days || "",
        daily_hours: res.data.daily_hours || 8,
        hourly_rate: res.data.hourly_rate || "",
        daily_rate: res.data.daily_rate || "",
        income_tax: res.data.income_tax || "",
        deduct_shif: !!res.data.deduct_shif,
        deduct_nssf: !!res.data.deduct_nssf,
        deduct_housing_levy: !!res.data.deduct_housing_levy,
        disability_exemption_amount: res.data.disability_exemption_amount || "",
        exemption_certificate_no: res.data.exemption_certificate_no || "",
        mobile_money: res.data.mobile_money || "",
        bank_name: res.data.bank_name || "",
        bank_account: res.data.bank_account || "",
        branch_name: res.data.branch_name || "",
        branch_code: res.data.branch_code || "",
      });
      alert("Salary details updated!");
    } catch (err) {
      alert("Update failed");
    }
  };

  return (
    <div className="grid grid-cols-2 gap-8">
      <div>
        <label>Employment Type:</label>
        <select
          className="border px-2 py-1 w-full"
          name="employment_type"
          value={form.employment_type}
          onChange={handleChange}
        >
          <option value="">Select</option>
          <option value="Regular (open-ended)">Regular (open-ended)</option>
          <option value="Regular (fixed-term)">Regular (fixed-term)</option>
          <option value="Intern">Intern</option>
          <option value="Probationary">Probationary</option>
          <option value="Casual">Casual</option>
          <option value="Consultant">Consultant</option>
        </select>
        <label className="mt-4 block">Payment Currency:</label>
        <select
          className="border px-2 py-1 w-full"
          name="payment_currency"
          value={form.payment_currency}
          onChange={handleChange}
        >
          <option value="KES">KES</option>
          <option value="USD">USD</option>
        </select>
        <label className="mt-4 block">Monthly Salary (KES):</label>
        <input
          className="border px-2 py-1 w-full"
          name="basic_salary"
          value={form.basic_salary}
          onChange={handleChange}
        />
        <label className="mt-4 block">Work Shift:</label>
        <input
          className="border px-2 py-1 w-full"
          name="work_shift"
          value={form.work_shift}
          onChange={handleChange}
        />
        <label className="mt-4 block">Off Days:</label>
        <input
          className="border px-2 py-1 w-full"
          name="off_days"
          value={form.off_days}
          onChange={handleChange}
        />
        <label className="mt-4 block">Daily Hours:</label>
        <input
          type="number"
          className="border px-2 py-1 w-full"
          name="daily_hours"
          value={form.daily_hours}
          onChange={handleChange}
        />
        <label className="mt-4 block">Hourly Rate (KES):</label>
        <input
          className="border px-2 py-1 w-full bg-gray-100"
          name="hourly_rate"
          value={form.hourly_rate}
          readOnly
        />
        <label className="mt-4 block">Daily Rate (KES):</label>
        <input
          className="border px-2 py-1 w-full bg-gray-100"
          name="daily_rate"
          value={form.daily_rate}
          readOnly
        />
        <label className="mt-4 block">Income Tax:</label>
        <select
          className="border px-2 py-1 w-full"
          name="income_tax"
          value={form.income_tax}
          onChange={handleChange}
        >
          <option value="">Select</option>
          <option value="PAYE Primary">P.A.Y.E. Primary Employee</option>
          <option value="PAYE Secondary">P.A.Y.E. Secondary Employee</option>
        </select>
        <label className="mt-4 block">Contributions:</label>
        <div className="flex gap-4">
          <label>
            <input
              type="checkbox"
              name="deduct_shif"
              checked={form.deduct_shif}
              onChange={handleChange}
            />{" "}
            Deduct SHIF
          </label>
          <label>
            <input
              type="checkbox"
              name="deduct_nssf"
              checked={form.deduct_nssf}
              onChange={handleChange}
            />{" "}
            Deduct NSSF
          </label>
          <label>
            <input
              type="checkbox"
              name="deduct_housing_levy"
              checked={form.deduct_housing_levy}
              onChange={handleChange}
            />{" "}
            Deduct Housing Levy
          </label>
        </div>
      </div>
      <div>
        <fieldset className="border p-4 mb-4">
          <legend className="font-bold">Tax Exemption</legend>
          <label>Disability Exemption Amount (KES):</label>
          <input
            className="border px-2 py-1 w-full"
            name="disability_exemption_amount"
            value={form.disability_exemption_amount}
            onChange={handleChange}
          />
          <label className="mt-4 block">Exemption Certificate No.:</label>
          <input
            className="border px-2 py-1 w-full"
            name="exemption_certificate_no"
            value={form.exemption_certificate_no}
            onChange={handleChange}
          />
        </fieldset>
        <fieldset className="border p-4 mb-4">
          <legend className="font-bold">Salary Processing Options</legend>
          <label>Mobile Money No.:</label>
          <input
            className="border px-2 py-1 w-full"
            name="mobile_money"
            value={form.mobile_money}
            onChange={handleChange}
          />
        </fieldset>
        <fieldset className="border p-4">
          <legend className="font-bold">Bank Details</legend>
          <label>Bank Name:</label>
          <input
            className="border px-2 py-1 w-full"
            name="bank_name"
            value={form.bank_name}
            onChange={handleChange}
          />
          <label className="mt-4 block">Bank Account:</label>
          <input
            className="border px-2 py-1 w-full"
            name="bank_account"
            value={form.bank_account}
            onChange={handleChange}
          />
          <label className="mt-4 block">Branch Name:</label>
          <input
            className="border px-2 py-1 w-full"
            name="branch_name"
            value={form.branch_name}
            onChange={handleChange}
          />
          <label className="mt-4 block">Branch Code:</label>
          <input
            className="border px-2 py-1 w-full"
            name="branch_code"
            value={form.branch_code}
            onChange={handleChange}
          />
        </fieldset>
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

export default SalaryDetails;