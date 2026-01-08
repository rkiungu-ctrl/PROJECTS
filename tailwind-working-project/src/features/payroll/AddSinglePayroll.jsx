import React, { useState, useEffect } from "react";
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
    non_cash_benefit: 0,
    loan: 0,
    advance: 0,
  });

  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [loadingPrev, setLoadingPrev] = useState(false);
  const [existingPayroll, setExistingPayroll] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const navigate = useNavigate();

  // Check for existing payroll and prefill from backend preview when staff_no and period are present
  useEffect(() => {
    // period should be YYYY-MM
    if (!formData.staff_no || !formData.period || formData.period.length !== 7) return;

    let cancelled = false;
    (async () => {
      try {
        setLoadingPrev(true);
        setError(null);
        setExistingPayroll(null);
        setIsEditMode(false);

        // First check if payroll already exists for this period
        try {
          const { data: existingData } = await axios.get(
            `${API_BASE}/payrolls/`,
            {
              params: {
                staff_no: formData.staff_no,
                period: `${formData.period}-01`
              }
            }
          );
          
          if (existingData && existingData.length > 0) {
            // Payroll exists - load it for editing
            const payroll = existingData[0];
            setExistingPayroll(payroll);
            setIsEditMode(true);
            if (cancelled) return;
            
            setFormData(prev => ({
              ...prev,
              basic_salary: payroll.basic_salary ?? prev.basic_salary,
              house_allowance: payroll.house_allowance ?? prev.house_allowance,
              transport_allowance: payroll.transport_allowance ?? prev.transport_allowance,
              other_allowances: payroll.other_allowances ?? prev.other_allowances,
              commission: payroll.commission ?? prev.commission,
              bonus: payroll.bonus ?? prev.bonus,
              non_cash_benefit: payroll.non_cash_benefit ?? prev.non_cash_benefit,
              advance: payroll.advance ?? 0,
              loan: payroll.loan ?? 0,
            }));
            return; // Don't fetch preview data since we're editing existing payroll
          }
        } catch (existingError) {
          // No existing payroll found, proceed with preview
        }

        // No existing payroll - fetch preview data for new payroll
        const { data } = await axios.get(`${API_BASE}/payrolls/preview`, {
          params: { staff_no: formData.staff_no, period: `${formData.period}-01` }
        });
        if (cancelled) return;
        setFormData(prev => ({
          ...prev,
          basic_salary: data.basic_salary ?? prev.basic_salary,
          house_allowance: data.house_allowance ?? prev.house_allowance,
          transport_allowance: data.transport_allowance ?? prev.transport_allowance,
          other_allowances: data.other_allowances ?? prev.other_allowances,
          commission: data.commission ?? prev.commission,
          bonus: data.bonus ?? prev.bonus,
          non_cash_benefit: data.non_cash_benefit ?? prev.non_cash_benefit,
          // be generous with backend field names for advance (supports auto_advance, advance_due, next_advance)
          advance: (
            data.auto_advance ??
            data.advance_due ??
            data.next_advance ??
            0
          ),
          // be generous with backend field names for loan (supports auto_loan, loan_due, next_loan)
          loan: (
            data.auto_loan ??
            data.loan_due ??
            data.next_loan ??
            0
          ),
        }));
      } catch (e) {
        // ignore preview failures; user may still enter values manually
      } finally {
        setLoadingPrev(false);
      }
    })();

    return () => { cancelled = true; };
  }, [formData.staff_no, formData.period]);

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
        name === "non_cash_benefit" ||
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
      if (isEditMode && existingPayroll) {
        // Update existing payroll
        await axios.put(
          `${API_BASE}/payrolls/${formattedPeriod}/details/${existingPayroll.id}?username=Triza&password=F%40stAP!123`,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        // Create new payroll
        await axios.post(
          `${API_BASE}/payrolls/?username=Triza&password=F%40stAP!123`,
          payload,
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
      
      // NOTE: Removed sync-loan-repayments call as it was causing duplicate entries.
      // Payroll creation/update already handles loan deductions via _apply_payroll_to_loans.

      try {
        window.dispatchEvent(new CustomEvent('loans:refresh', { detail: { staff_no: formData.staff_no } }));
      } catch (e) {
        // ignore in non-browser tests/environments
      }

      // Navigate to the payslip view for the created/updated period so the user sees the saved payslip
      setSuccess(true);
      navigate(`/payroll/${formattedPeriod}`);
    } catch (err) {
      console.error("Payroll submission failed", err);
      if (err?.response?.status === 409) {
        setError("Payroll for this employee and period already exists. Please refresh to edit the existing record.");
      } else {
        setError("Failed to submit payroll.");
      }
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-8 bg-white shadow-md rounded p-6">
      <h2 className="text-2xl font-semibold mb-4">
        {isEditMode ? "Edit Existing Payroll" : "Add Single Payroll"}
      </h2>
      
      {isEditMode && existingPayroll && (
        <div className="bg-blue-100 text-blue-800 px-4 py-2 mb-4 rounded border border-blue-300">
          <strong>Editing existing payroll:</strong> This payroll already exists for {formData.staff_no} in {formData.period}. 
          You can modify the values below and save to update the existing record.
        </div>
      )}

      {success && (
        <div className="bg-green-100 text-green-800 px-4 py-2 mb-4 rounded border border-green-300">
          {isEditMode ? "Payroll updated successfully!" : "Payroll added successfully!"}
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
            className="mt-1 w-full border rounded px-3 py-2 text-right"
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
            className="mt-1 w-full border rounded px-3 py-2 text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Basic Salary</label>
          <input
            type="number"
            name="basic_salary"
            value={formData.basic_salary}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2 text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">House Allowance</label>
          <input
            type="number"
            name="house_allowance"
            value={formData.house_allowance}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2 text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Transport Allowance</label>
          <input
            type="number"
            name="transport_allowance"
            value={formData.transport_allowance}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2 text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Other Allowances</label>
          <input
            type="number"
            name="other_allowances"
            value={formData.other_allowances}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2 text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Commission</label>
          <input
            type="number"
            name="commission"
            value={formData.commission}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2 text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Bonus</label>
          <input
            type="number"
            name="bonus"
            value={formData.bonus}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2 text-right"
          />
        </div>

        <div>
          <label className="block text-sm font-medium">Non-Cash Benefit</label>
          <input
            type="number"
            name="non_cash_benefit"
            value={formData.non_cash_benefit}
            onChange={handleChange}
            className="mt-1 w-full border rounded px-3 py-2 text-right"
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
          {isEditMode ? "Update Payroll" : "Submit Payroll"}
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
