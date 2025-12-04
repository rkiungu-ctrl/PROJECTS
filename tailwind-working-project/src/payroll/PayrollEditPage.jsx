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
    let payrollData = null;
    let empData = null;
    let latestInc = null;

    const fetchAll = async () => {
      try {
  // Normalize period string to YYYY-MM-DD (use first-of-month for YYYY-MM) so backend routes match
  const normalizedPeriod = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period;
  const res = await axios.get(`http://localhost:8000/payrolls/${normalizedPeriod}/details/${employeeId}`);
        payrollData = res.data || {};
        // try to fetch full employee record to prefer master data
        try {
          const er = await axios.get(`http://localhost:8000/employees/${payrollData.staff_no || employeeId}`);
          empData = er.data || {};
        } catch (e) {
          empData = null;
        }

        // try to fetch increments (latest) if employee exists
        try {
          const ir = await axios.get(`http://localhost:8000/employees/${payrollData.staff_no || employeeId}/increments`);
          const incs = ir.data || [];
          if (incs.length) {
            // pick most recent by start_date
            incs.sort((a,b) => new Date(b.start_date) - new Date(a.start_date));
            latestInc = incs[0];
          }
        } catch (e) {
          latestInc = null;
        }

        // call the backend preview helper to get auto-prefill values (basic, gross, auto_advance, etc.)
        let preview = null;
        try {
          const staff_no = payrollData.staff_no || employeeId;
          const pr = await axios.get(`http://localhost:8000/payrolls/preview`, { params: { staff_no, period: normalizedPeriod } });
          preview = pr.data || null;
        } catch (e) {
          // preview is optional; continue with local logic if it fails
          preview = null;
        }

        // build initial form values: prefer payroll values, then employee master, then preview, then latest increment
        const built = {};
        const pick = (key) => {
          if (payrollData && payrollData[key] !== undefined && payrollData[key] !== null) return payrollData[key];
          if (empData && empData[key] !== undefined && empData[key] !== null) return empData[key];
          // preview keys: basic_salary, gross_pay, auto_advance
          if (preview) {
            if (key === 'basic_salary' && preview.basic_salary !== undefined && preview.basic_salary !== null) return preview.basic_salary;
            if (key === 'advance' && preview.auto_advance !== undefined && preview.auto_advance !== null) return preview.auto_advance;
          }
          if (key === 'basic_salary' && latestInc) return latestInc.gross_pay;
          return 0;
        };

        built.basic_salary = pick('basic_salary');
        built.house_allowance = pick('house_allowance');
        built.transport_allowance = pick('transport_allowance');
        built.other_allowances = pick('other_allowances');
        built.commission = pick('commission');
        built.bonus = pick('bonus');
        built.non_cash_benefit = pick('non_cash_benefit');
        built.loan = pick('loan');
        built.advance = pick('advance');
        built.gross_pay = (parseFloat(built.basic_salary) || 0) + (parseFloat(built.house_allowance) || 0) + (parseFloat(built.transport_allowance) || 0) + (parseFloat(built.other_allowances) || 0) + (parseFloat(built.commission) || 0) + (parseFloat(built.bonus) || 0);

        setEmployee(empData || payrollData);
        setForm({ ...built, ...payrollData });
      } catch (err) {
        console.error(err);
        alert("Failed to fetch employee payslip.");
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [period, employeeId]);

  // Recalculate gross pay when any earning field changes
  const handleChange = e => {
    const { name, value } = e.target;
    const updatedForm = { ...form, [name]: parseFloat(value) || 0 };

    // Calculate gross pay (cash earnings only - non-cash benefits don't count as received cash)
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

    // Normalize period so backends that expect YYYY-MM-01 will match the row
    const normalized = /^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period;

    // Ensure staff_no is explicitly included so backend can reliably find the record
    const body = { ...form, staff_no: (employee && employee.staff_no) || form.staff_no || employeeId };

    axios.put(`http://localhost:8000/payrolls/${normalized}/details/${employeeId}`, body)
      .then(async () => {
        alert("Payslip updated!");

        // NOTE: Removed sync-loan-repayments call as it was causing duplicate entries.
        // Payroll update already handles loan deductions via _apply_payroll_to_loans.

        // Tell Loans component (if open) to refresh for this employee
        try {
          const staffNo = (employee && employee.staff_no) || form.staff_no || employeeId;
          window.dispatchEvent(new CustomEvent('loans:refresh', { detail: { staff_no: staffNo } }));
        } catch (e) {
          // ignore
        }

        // Go back to the View Payslips page for the (normalized) period so the user sees updated data
        navigate(`/payroll/${normalized}`);
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
          <label>Non-Cash Benefit</label>
          <input type="number" name="non_cash_benefit" value={form.non_cash_benefit || ""} onChange={handleChange} className="border px-2 py-1 rounded w-full" />
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