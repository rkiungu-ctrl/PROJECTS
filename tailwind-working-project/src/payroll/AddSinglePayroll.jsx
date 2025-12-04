import React, { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";

const AddSinglePayroll = () => {
  const [formData, setFormData] = useState({
    staff_no: "",
    period: "",
    basic_salary: 0,
    house_allowance: 0,
    transport_allowance: 0,
    other_allowances: 0,
    commission: 0,
    bonus: 0,
    loan: 0,
    advance: 0,
  });

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]:
        name === "basic_salary" ||
        name === "house_allowance" ||
        name === "transport_allowance" ||
        name === "other_allowances" ||
        name === "commission" ||
        name === "bonus" ||
        name === "advance" ||
        name === "loan"
          ? parseFloat(value)
          : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(false);
    setError(null);

    const formattedPeriod = `${formData.period}-01`;

    const payload = {
      ...formData,
      period: formattedPeriod,
    };

    try {
      await axios.post(
        `http://127.0.0.1:8000/payrolls/?username=Triza&password=F%40stAP!123`,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      setSuccess(true);
    } catch (err) {
      console.error("Payroll submission failed", err);
      setError("Failed to submit payroll.");
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-8 bg-white shadow-md rounded p-6">
      <h2 className="text-2xl font-semibold mb-4">Add Single Payroll</h2>

      {success && (
        <div className="bg-green-100 text-green-800 px-4 py-2 mb-4 rounded border border-green-300">
          Payroll added successfully!
        </div>
      )}

      {error && (
        <div className="bg-red-100 text-red-800 px-4 py-2 mb-4 rounded border border-red-300">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium">Staff No</label>
          <input
            type="text"
            name="staff_no"
            value={formData.staff_no}
            onChange={handleChange}
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Period</label>
          <input
            type="month"
            name="period"
            value={formData.period}
            onChange={handleChange}
            required
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Basic Salary</label>
          <input
            type="number"
            name="basic_salary"
            value={formData.basic_salary}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">House Allowance</label>
          <input
            type="number"
            name="house_allowance"
            value={formData.house_allowance}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Transport Allowance</label>
          <input
            type="number"
            name="transport_allowance"
            value={formData.transport_allowance}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Other Allowances</label>
          <input
            type="number"
            name="other_allowances"
            value={formData.other_allowances}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Commission</label>
          <input
            type="number"
            name="commission"
            value={formData.commission}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Bonus</label>
          <input
            type="number"
            name="bonus"
            value={formData.bonus}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Advance</label>
          <input
            type="number"
            name="advance"
            value={formData.advance}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Loan</label>
          <input
            type="number"
            name="loan"
            value={formData.loan}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2"
          />
        </div>

        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Submit Payroll
        </button>
      </form>

      {success && (
        <Link
          to="/payroll"
          className="mt-6 inline-block text-blue-600 hover:underline"
        >
          ← Back to View Payrolls
        </Link>
      )}
    </div>
  );
};

export default AddSinglePayroll;
