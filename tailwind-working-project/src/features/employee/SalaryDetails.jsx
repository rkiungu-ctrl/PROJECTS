// src/employee/SalaryDetails.jsx
import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import Increments from "./Increments";
import { departments } from "./departmentList";

export default function SalaryDetails({
  staffNo,
  data = {},
  hrData = {},
  personalName,
  employees = [],
  onHRChange,
  onChange,
  formData,
  setFormData,
  onLatestIncrement,
}) {
  const [latestBasic, setLatestBasic] = useState(undefined);
  const salary = data;

  // Keep account_name defaulted to employee name (editable)
  useEffect(() => {
    if (!personalName) return;
    setFormData((prev) => {
      const existing = prev?.salary?.account_name;
      if (existing) return prev;
      return { ...prev, salary: { ...(prev.salary || {}), account_name: personalName } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalName]);

  // Pull latest increment and mirror to Basic (display-only; you still save via Update button)
  const fetchLatestIncrement = async () => {
    if (!staffNo) return;
    try {
      const { data: rows } = await api.get(`/employees/${encodeURIComponent(staffNo)}/increments`);
      const list = Array.isArray(rows) ? rows : [];
      const sorted = [...list].sort((a, b) => String(b.start_date).localeCompare(String(a.start_date)));
      const latest = sorted[0];
      const amount = latest && Number(latest.gross_pay) ? Number(latest.gross_pay) : undefined;
      if (amount !== undefined) {
        setLatestBasic(amount);
        setFormData((prev) => ({
          ...prev,
          salary: { ...(prev.salary || {}), basic_salary: amount, _latest_increment_basic: amount },
        }));
        onLatestIncrement && onLatestIncrement(amount);
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { fetchLatestIncrement(); /* eslint-disable-next-line */ }, [staffNo]);

  // Controlled change helpers
  const handleSalaryChange = (e) => {
    const { name, value, type, checked } = e.target;
    const updated = { ...salary, [name]: type === "checkbox" ? !!checked : value };
    setFormData((prev) => ({ ...prev, salary: updated }));
    onChange && onChange(updated);
  };
  const handleHRChange = (e) => {
    const { name, value, type, checked } = e.target;
    const updated = { ...hrData, [name]: type === "checkbox" ? !!checked : value };
    onHRChange && onHRChange(updated);
  };

  const monthly = Number(latestBasic ?? salary.basic_salary ?? 0) || 0;
  const dailyHours = parseFloat(salary.daily_hours || 8) || 8;
  const hourlyRate = monthly && dailyHours ? monthly / (4.33 * 5 * dailyHours) : 0;
  const dailyRate = monthly ? monthly / 30 : 0;

  const method = salary.salary_processing_method || "Bank";
  // Filter employees for "Reports to" dropdown - exclude current employee and inactive employees
  const reportsToOptions = (employees || []).filter(emp => {
    // Exclude the current employee
    if (emp.staff_no === staffNo) return false;
    
    // Only include active employees (no termination date or future termination date)
    const termDate = emp.termination_date ? new Date(emp.termination_date) : null;
    const now = new Date();
    if (termDate && termDate <= now) return false;
    
    return true;
  });

  // Override statutory defaults - only inactive for interns
  // Check if employee is intern for informational purposes
  const isIntern = ((salary.employment_type || "") + "").toLowerCase().indexOf("intern") !== -1;

  return (
    <div className="w-full">
      {/* ===== Employment & HR (stays in Salary tab) ===== */}
      <div className="bg-white border rounded-md p-2 mb-3">
        <h3 className="text-base font-semibold mb-2 border-b pb-2">Employment & HR</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium">Job/Staff Number</label>
            <input name="staff_no" value={hrData.staff_no || ""} onChange={handleHRChange}
                   className="w-full border rounded p-2" placeholder="e.g., TNL015" />
          </div>
          <div>
            <label className="block text-sm font-medium">Job Title</label>
            <input name="job_title" value={hrData.job_title || ""} onChange={handleHRChange}
                   className="w-full border rounded p-2" />
          </div>

          <div>
            <label className="block text-sm font-medium">Department</label>
            <select name="department" value={hrData.department || ""} onChange={handleHRChange}
                    className="w-full border rounded p-2">
              <option value="">Select</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Region</label>
            <input name="region" value={hrData.region || ""} onChange={handleHRChange}
                   className="w-full border rounded p-2" />
          </div>

          <div>
            <label className="block text-sm font-medium">Date of Employment</label>
            <input type="date" name="date_of_employment" value={hrData.date_of_employment || ""} onChange={handleHRChange}
                   className="w-full border rounded p-2" />
          </div>

          <div>
            <label className="block text-sm font-medium">Head of</label>
            <select name="head_of" value={hrData.head_of || ""} onChange={handleHRChange}
                    className="w-full border rounded p-2">
              <option value="">Select</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium">Reports to</label>
            <select name="reports_to" value={hrData.reports_to || ""} onChange={handleHRChange}
                    className="w-full border rounded p-2">
              <option value="">Select</option>
              {reportsToOptions.map((emp) => (
                <option key={emp.staff_no || emp.id || emp.name} value={emp.staff_no || emp.id || emp.name}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 mt-6">
            <input type="checkbox" name="is_director" checked={!!hrData.is_director} onChange={handleHRChange} />
            <span className="text-sm">Board Director</span>
          </div>
        </div>
      </div>

      {/* ===== Salary details (Current Basic comes from Increment) ===== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* LEFT */}
        <div className="bg-white border rounded-md p-2">
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-12">
              <label className="block text-sm font-medium">Employment Type</label>
              <select name="employment_type" value={salary.employment_type || ""} onChange={handleSalaryChange}
                      className="mt-1 w-full border rounded p-2">
                <option value="">— Select —</option>
                <option value="Regular (open-ended)">Regular (open-ended)</option>
                <option value="Fixed Term">Fixed Term</option>
                <option value="Intern">Intern</option>
                <option value="Casual">Casual</option>
              </select>
            </div>

            <div className="col-span-12">
              <label className="block text-sm font-medium">Payment Currency</label>
              <select name="payment_currency" value={salary.payment_currency || "KES"} onChange={handleSalaryChange}
                      className="mt-1 w-full border rounded p-2">
                <option value="KES">KES</option>
                <option value="USD">USD</option>
              </select>
            </div>

            <div className="col-span-12 grid grid-cols-12 gap-1 items-end">
              <div className="col-span-8">
                <label className="block text-sm font-medium">Current Basic (from Increments)</label>
                <input name="basic_salary" type="number" step="0.01" value={monthly || ""} disabled
                       className="mt-1 w-full border rounded p-2 bg-gray-100" />
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium">Type of Pay</label>
                <select name="salary_type" value={salary.salary_type || "Basic Pay"} onChange={handleSalaryChange}
                        className="w-full border rounded p-2">
                  <option value="Basic Pay">Basic Pay</option>
                  <option value="Gross Pay (Incl. Benefits (computed))">Gross Pay (Incl. Benefits (computed))</option>
                  <option value="Consolidated Pay (Incl. Benefits (non-computed))">Consolidated Pay (Incl. Benefits (non-computed))</option>
                  <option value="Net Pay">Net Pay</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-sm font-medium">Payment Schedule</label>
                <select name="salary_period" value={salary.salary_period || "Monthly"} onChange={handleSalaryChange}
                        className="w-full border rounded p-2">
                  <option value="Monthly">Monthly</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Daily">Daily</option>
                  <option value="Quarterly">Quarterly</option>
                </select>
              </div>
            </div>

            <div className="col-span-12">
              <label className="block text-sm font-medium">Work Shift</label>
              <select name="work_shift" value={salary.work_shift || "Regular Shift"} onChange={handleSalaryChange}
                      className="mt-1 w-full border rounded p-2">
                <option>Regular Shift</option>
                <option>Night Shift</option>
                <option>Rotational</option>
              </select>
            </div>

            <div className="col-span-12">
              <label className="block text-sm font-medium">Off Days</label>
              <input name="off_days" value={salary.off_days || ""} onChange={handleSalaryChange}
                     className="mt-1 w-full border rounded p-2" placeholder="e.g., Sunday" />
            </div>

            <div className="col-span-12 grid grid-cols-12 gap-1 items-end">
              <div className="col-span-4">
                <label className="block text-sm font-medium">Daily Hours</label>
                <input name="daily_hours" type="number" step="0.25" value={salary.daily_hours || 8}
                       onChange={handleSalaryChange} className="mt-1 w-full border rounded p-2" />
              </div>
              <div className="col-span-8">
                <label className="block text-sm font-medium invisible">label</label>
                <div className="h-[38px] w-full border rounded p-2 text-sm bg-gray-50 flex items-center">
                  {salary.daily_hours || 8} Hours per Day
                </div>
              </div>
            </div>

            <div className="col-span-12 grid grid-cols-12 gap-1 items-end">
              <div className="col-span-6">
                <label className="block text-sm font-medium">Hourly Rate (KES)</label>
                <input value={(hourlyRate || 0).toFixed(2)} readOnly
                       className="mt-1 w-full border rounded p-2 bg-gray-100" />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium invisible">label</label>
                <div className="h-[38px] border rounded p-2 text-sm bg-gray-50 flex items-center justify-center">Per Hour</div>
              </div>
              <div className="col-span-3 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm mt-6">
                  <input type="checkbox" disabled /> <span>User-defined</span>
                </label>
              </div>
            </div>

            <div className="col-span-12 grid grid-cols-12 gap-2 items-end">
              <div className="col-span-6">
                <label className="block text-sm font-medium">Daily Rate (KES)</label>
                <input value={(dailyRate || 0).toFixed(2)} readOnly
                       className="mt-1 w-full border rounded p-2 bg-gray-100" />
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium invisible">label</label>
                <div className="h-[38px] border rounded p-2 text-sm bg-gray-50 flex items-center justify-center">Per Day</div>
              </div>
            </div>

            <div className="col-span-12">
              <label className="block text-sm font-medium">Income Tax</label>
              <select name="income_tax" value={salary.income_tax || "P.A.Y.E. Primary Employee"} onChange={handleSalaryChange}
                      className="mt-1 w-full border rounded p-2">
                <option>P.A.Y.E. Primary Employee</option>
                <option>P.A.Y.E. Secondary Employee</option>
                <option>Withholding</option>
                <option>Exempt</option>
              </select>
            </div>

            <div className="col-span-12">
              <div className="flex items-center justify-between mt-2">
                <div className="text-sm text-gray-700">Statutory deduction switches</div>
                {isIntern && (
                  <div className="text-xs text-blue-600 font-medium">Note: NITA is automatically exempt for interns</div>
                )}
              </div>
              <div className="flex flex-wrap gap-4 mt-1">
                <label className="inline-flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    name="deduct_shif" 
                    checked={!!salary.deduct_shif} 
                    onChange={handleSalaryChange} 
                  />
                  <span>Deduct SHIF</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    name="deduct_nssf" 
                    checked={!!salary.deduct_nssf} 
                    onChange={handleSalaryChange} 
                  />
                  <span>Deduct NSSF</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    name="deduct_housing_levy" 
                    checked={!!salary.deduct_housing_levy} 
                    onChange={handleSalaryChange} 
                  />
                  <span>Deduct Housing Levy</span>
                </label>
                {/* Deduct PAYE removed from UI; PAYE deduction should be driven by Income Tax selection */}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="space-y-3">
          <div className="bg-white border rounded-md p-2">
            <h3 className="text-base font-semibold mb-3 border-b pb-2">Tax Exemption</h3>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-12">
                <label className="block text-sm font-medium">Disability Exemption Amount (KES)</label>
                <input name="disability_exemption_amount" type="number" step="0.01"
                       value={salary.disability_exemption_amount || ""} onChange={handleSalaryChange}
                       className="mt-1 w-full border rounded p-2" />
              </div>
              <div className="col-span-12">
                <label className="block text-sm font-medium">Exemption Certificate No.</label>
                <input name="exemption_certificate_no" value={salary.exemption_certificate_no || ""} onChange={handleSalaryChange}
                       className="mt-1 w-full border rounded p-2" />
              </div>
            </div>
          </div>

          {/* === Salary Processing Options (conditional fields by method) === */}
          <div className="bg-white border rounded-md p-2">
            <h3 className="text-base font-semibold mb-3 border-b pb-2">Salary Processing Options</h3>

            <div className="mb-3">
              <label className="block text-sm font-medium">Payment Method</label>
              <select name="salary_processing_method" value={method} onChange={handleSalaryChange}
                      className="w-56 border rounded p-2">
                <option value="Bank">Bank Transfer</option>
                <option value="Mobile Money">Mobile Money</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
              </select>
            </div>

            {/* BANK */}
            {method === "Bank" && (
              <div className="border rounded-md p-2">
                <div className="grid grid-cols-12 gap-2 mt-1">
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Account Name</label>
                    <input name="account_name" value={salary.account_name || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" />
                  </div>
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Bank Account No.</label>
                    <input name="bank_account" value={salary.bank_account || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" />
                  </div>
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Bank Name</label>
                    <input name="bank_name" value={salary.bank_name || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" />
                  </div>
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Bank Branch</label>
                    <input name="branch_name" value={salary.branch_name || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" />
                  </div>
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Sort/Branch Code</label>
                    <input name="branch_code" value={salary.branch_code || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" />
                  </div>
                </div>
              </div>
            )}

            {/* MOBILE MONEY */}
            {method === "Mobile Money" && (
              <div className="border rounded-md p-2">
                <div className="grid grid-cols-12 gap-2 mt-1">
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Mobile Wallet / Number</label>
                    <input name="mobile_money" value={salary.mobile_money || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" placeholder="e.g., 07xx xxx xxx" />
                  </div>
                </div>
              </div>
            )}

            {/* CASH */}
            {method === "Cash" && (
              <div className="border rounded-md p-2">
                <div className="grid grid-cols-12 gap-2 mt-1">
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Cash Notes</label>
                    <input name="cash_notes" value={salary.cash_notes || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" placeholder="e.g., collect from petty cash" />
                  </div>
                </div>
              </div>
            )}

            {/* CHEQUE */}
            {method === "Cheque" && (
              <div className="border rounded-md p-2">
                <div className="grid grid-cols-12 gap-2 mt-1">
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Cheque Number</label>
                    <input name="cheque_number" value={salary.cheque_number || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" />
                  </div>
                  <div className="col-span-12">
                    <label className="block text-sm font-medium">Cheque Bank</label>
                    <input name="cheque_bank_name" value={salary.cheque_bank_name || ""} onChange={handleSalaryChange}
                           className="mt-1 w-full border rounded p-2" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== Increments (DRIVES BASIC) ===== */}
      <div className="mt-4">
        <div className="bg-white border rounded-md p-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-base font-semibold">Contract/Increment History</h3>
            <span className="text-sm text-gray-500">
              Latest increment drives the <b>Current Basic</b> above
            </span>
          </div>
          <Increments staffNo={staffNo} onChanged={fetchLatestIncrement} />
        </div>
      </div>
    </div>
  );
}
