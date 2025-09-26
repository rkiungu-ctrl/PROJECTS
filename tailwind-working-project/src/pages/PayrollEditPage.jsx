import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";

const PayrollEditPage = () => {
  const { period, employeeId } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({});

  // Fetch the payroll detail using the correct endpoint
  useEffect(() => {
    axios.get(`http://localhost:8000/payrolls/${period}/details/${employeeId}`)
      .then(res => {
        setEmployee(res.data);
        setForm(res.data);
      })
      .catch((err) => {
        console.error(err);
        alert("Failed to fetch employee payslip.");
      })
      .finally(() => setLoading(false));
  }, [period, employeeId]);

  // Recalculate gross pay when any earning field changes
  const handleChange = e => {
    const { name, value } = e.target;
    const updatedForm = { ...form, [name]: parseFloat(value) || 0 };

    // Calculate gross pay
    const gross =
      (parseFloat(updatedForm.basic_salary) || 0) +
      (parseFloat(updatedForm.house_allowance) || 0) +
      (parseFloat(updatedForm.transport_allowance) || 0) +
      (parseFloat(updatedForm.other_allowances) || 0) +
      (parseFloat(updatedForm.commission) || 0) +
      (parseFloat(updatedForm.bonus) || 0);

    updatedForm.gross_pay = gross;

    setForm(updatedForm);
  };

  const handleSubmit = e => {
    e.preventDefault();
    axios.put(`http://localhost:8000/payrolls/${period}/details/${employeeId}`, form)
      .then(() => {
        alert("Payslip updated!");
        navigate(-1); // Go back to previous page
      })
      .catch(() => alert("Failed to update payslip."));
  };

  if (loading) return <div>Loading...</div>;
  if (!employee) return <div>Employee not found.</div>;

  return (
    <div className="max-w-xl mx-auto bg-white p-6 rounded shadow mt-8">
      <h2 className="text-xl font-bold mb-4">Edit Payslip for {employee.name}</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label>Basic Salary</label>
          <input type="number" name="basic_salary" value={form.basic_salary || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>House Allowance</label>
          <input type="number" name="house_allowance" value={form.house_allowance || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>Transport Allowance</label>
          <input type="number" name="transport_allowance" value={form.transport_allowance || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>Other Allowances</label>
          <input type="number" name="other_allowances" value={form.other_allowances || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>Commission</label>
          <input type="number" name="commission" value={form.commission || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>Bonus</label>
          <input type="number" name="bonus" value={form.bonus || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>Loan</label>
          <input type="number" name="loan" value={form.loan || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>Advance</label>
          <input type="number" name="advance" value={form.advance || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
        </div>
        <div>
          <label>Gross Pay</label>
          <input value={form.gross_pay || ""} readOnly className="border px-2 py-1 rounded w-full bg-gray-100" />
        </div>
        {/* Add other calculated fields as read-only if needed */}
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">Save</button>
        <button type="button" onClick={() => navigate(-1)} className="ml-2 px-4 py-2 bg-gray-200 rounded">Back</button>
      </form>
    </div>
  );
};

export default PayrollEditPage;