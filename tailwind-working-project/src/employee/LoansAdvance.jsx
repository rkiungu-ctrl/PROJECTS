

import React, { useState } from "react";

const deductionMethods = ["Payroll Deduction", "Standing Order", "Manual", "Other"];

function generateRefNo() {
  return "LN-" + Math.random().toString(36).substr(2, 8).toUpperCase();
}

const emptyLoan = {
  loan_type: "Loan",
  reference_no: generateRefNo(),
  principal_amount: "",
  date_issued: "",
  interest_rate: "",
  repayment_period: "",
  installment_amount: "",
  deduction_method: deductionMethods[0],
  balance_outstanding: "",
  amount_repaid: "",
  status: "",
  last_deduction_date: "",
  next_due_date: "",
  debit_account_id: "",
  credit_account_id: "",
  journal_entry_id: "",
  created_by: "",
  approved_by: "",
  guarantor_id: "",
  penalty_rate: "",
  remarks: "",
  attachment: "",
};

const LoansAdvance = ({ formData, setFormData }) => {
  const loans = Array.isArray(formData.loans) ? formData.loans : [];
  const [editingIdx, setEditingIdx] = useState(null);
  const [form, setForm] = useState(emptyLoan);
  const [showForm, setShowForm] = useState(false);
  const [showScheduleIdx, setShowScheduleIdx] = useState(null);
  const [dirty, setDirty] = useState(false);

  const handleInput = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setDirty(true);
  };

  const handleDropdown = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setDirty(true);
  };

  const handleEdit = (idx) => {
    setEditingIdx(idx);
    setForm(loans[idx]);
    setShowForm(true);
    setDirty(false);
  };

  const handleDelete = (idx) => {
    const updated = loans.filter((_, i) => i !== idx);
    setFormData((prev) => ({ ...prev, loans: updated }));
    setEditingIdx(null);
    setShowForm(false);
    setDirty(true);
  };

  const handleAdd = () => {
    setForm({ ...emptyLoan, reference_no: generateRefNo() });
    setEditingIdx(null);
    setShowForm(true);
    setDirty(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    let updated;
    if (editingIdx !== null) {
      updated = loans.map((b, i) => (i === editingIdx ? form : b));
    } else {
      updated = [...loans, form];
    }
    setFormData((prev) => ({ ...prev, loans: updated }));
    setShowForm(false);
    setEditingIdx(null);
    setDirty(false);
  };

  // Dummy loan schedule generator (replace with real logic as needed)
  const getSchedule = (loan) => {
    if (!loan.principal_amount || !loan.repayment_period || !loan.installment_amount) return [];
    const period = parseInt(loan.repayment_period) || 0;
    const inst = parseFloat(loan.installment_amount) || 0;
    const principal = parseFloat(loan.principal_amount) || 0;
    let balance = principal;
    let schedule = [];
    for (let i = 1; i <= period && balance > 0; i++) {
      const paid = Math.min(inst, balance);
      schedule.push({
        period: i,
        amount: paid,
        balance: Math.max(0, balance - paid),
      });
      balance -= paid;
    }
    return schedule;
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h3 className="font-bold mb-2">Employee Loans & Advances</h3>
      <table className="min-w-full border text-sm mb-2">
        <thead>
          <tr>
            <th>Type</th>
            <th>Reference No</th>
            <th>Principal</th>
            <th>Date Issued</th>
            <th>Interest Rate (%)</th>
            <th>Repayment Period</th>
            <th>Installment</th>
            <th>Deduction Method</th>
            <th>Outstanding</th>
            <th>Repaid</th>
            <th>Status</th>
            <th>Last Deduction</th>
            <th>Next Due</th>
            <th>Debit Acc</th>
            <th>Credit Acc</th>
            <th>Journal Entry</th>
            <th>Created By</th>
            <th>Approved By</th>
            <th>Guarantor</th>
            <th>Penalty Rate</th>
            <th>Remarks</th>
            <th>Attachment</th>
            <th>Actions</th>
            <th>Schedule</th>
          </tr>
        </thead>
        <tbody>
          {loans.length === 0 ? (
            <tr>
              <td colSpan={25} className="text-center py-4 text-gray-500">
                No loans/advances found.
              </td>
            </tr>
          ) : (
            loans.map((loan, idx) => (
              <React.Fragment key={idx}>
                <tr className={editingIdx === idx ? "bg-blue-50" : ""}>
                  <td>{loan.loan_type}</td>
                  <td>{loan.reference_no}</td>
                  <td>{loan.principal_amount}</td>
                  <td>{loan.date_issued}</td>
                  <td>{loan.interest_rate}</td>
                  <td>{loan.repayment_period}</td>
                  <td>{loan.installment_amount}</td>
                  <td>{loan.deduction_method}</td>
                  <td>{loan.balance_outstanding}</td>
                  <td>{loan.amount_repaid}</td>
                  <td>{loan.status}</td>
                  <td>{loan.last_deduction_date}</td>
                  <td>{loan.next_due_date}</td>
                  <td>{loan.debit_account_id}</td>
                  <td>{loan.credit_account_id}</td>
                  <td>{loan.journal_entry_id}</td>
                  <td>{loan.created_by}</td>
                  <td>{loan.approved_by}</td>
                  <td>{loan.guarantor_id}</td>
                  <td>{loan.penalty_rate}</td>
                  <td>{loan.remarks}</td>
                  <td>{loan.attachment}</td>
                  <td>
                    <button className="text-blue-600 underline mr-2" onClick={() => handleEdit(idx)}>Edit</button>
                    <button className="text-red-600 underline" onClick={() => handleDelete(idx)}>Delete</button>
                  </td>
                  <td>
                    <button className="text-indigo-600 underline" onClick={() => setShowScheduleIdx(showScheduleIdx === idx ? null : idx)}>
                      {showScheduleIdx === idx ? "Hide" : "Show"}
                    </button>
                  </td>
                </tr>
                {showScheduleIdx === idx && (
                  <tr>
                    <td colSpan={25} className="bg-gray-50">
                      <div className="p-2">
                        <b>Repayment Schedule</b>
                        <table className="min-w-full border text-xs mt-2">
                          <thead>
                            <tr>
                              <th>Period</th>
                              <th>Amount</th>
                              <th>Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {getSchedule(loan).length === 0 ? (
                              <tr><td colSpan={3} className="text-center text-gray-400">No schedule</td></tr>
                            ) : (
                              getSchedule(loan).map((s, i) => (
                                <tr key={i}>
                                  <td>{s.period}</td>
                                  <td>{s.amount}</td>
                                  <td>{s.balance}</td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          )}
        </tbody>
      </table>

      {showForm && (
        <form className="bg-gray-50 p-4 rounded mb-2 w-full" onSubmit={handleSave}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <select className="border px-2 py-1 rounded" name="loan_type" value={form.loan_type} onChange={handleDropdown} required>
              <option value="Loan">Loan</option>
              <option value="Advance">Advance</option>
            </select>
            <input className="border px-2 py-1 rounded bg-gray-100" name="reference_no" value={form.reference_no} readOnly />
            <input className="border px-2 py-1 rounded" name="principal_amount" type="number" placeholder="Principal" value={form.principal_amount} onChange={handleInput} required />
            <input className="border px-2 py-1 rounded" name="date_issued" type="date" placeholder="Date Issued" value={form.date_issued} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="interest_rate" type="number" placeholder="Interest Rate (%)" value={form.interest_rate} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="repayment_period" placeholder="Repayment Period (months)" value={form.repayment_period} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="installment_amount" type="number" placeholder="Installment" value={form.installment_amount} onChange={handleInput} />
            <select className="border px-2 py-1 rounded" name="deduction_method" value={form.deduction_method} onChange={handleDropdown} required>
              {deductionMethods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <input className="border px-2 py-1 rounded" name="balance_outstanding" type="number" placeholder="Outstanding" value={form.balance_outstanding} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="amount_repaid" type="number" placeholder="Repaid" value={form.amount_repaid} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="status" placeholder="Status" value={form.status} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="last_deduction_date" type="date" placeholder="Last Deduction" value={form.last_deduction_date} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="next_due_date" type="date" placeholder="Next Due" value={form.next_due_date} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="debit_account_id" placeholder="Debit Acc" value={form.debit_account_id} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="credit_account_id" placeholder="Credit Acc" value={form.credit_account_id} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="journal_entry_id" placeholder="Journal Entry" value={form.journal_entry_id} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="created_by" placeholder="Created By" value={form.created_by} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="approved_by" placeholder="Approved By" value={form.approved_by} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="guarantor_id" placeholder="Guarantor" value={form.guarantor_id} onChange={handleInput} />
            <input className="border px-2 py-1 rounded" name="penalty_rate" type="number" placeholder="Penalty Rate" value={form.penalty_rate} onChange={handleInput} />
            <input className="border px-2 py-1 rounded col-span-3" name="remarks" placeholder="Remarks" value={form.remarks} onChange={handleInput} />
            <input className="border px-2 py-1 rounded col-span-3" name="attachment" placeholder="Attachment" value={form.attachment} onChange={handleInput} />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">
              {editingIdx !== null ? "Save Changes" : "Add Loan/Advance"}
            </button>
            <button type="button" className="bg-gray-400 text-white px-3 py-1 rounded" onClick={() => { setShowForm(false); setEditingIdx(null); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <button className="mt-2 bg-green-600 text-white px-3 py-1 rounded" onClick={handleAdd}>
        Add Loan/Advance
      </button>

      {dirty && (
        <button className="mt-4 bg-blue-700 text-white px-6 py-2 rounded float-right" onClick={() => { setFormData((prev) => ({ ...prev, loans })); setDirty(false); }}>
          Save
        </button>
      )}
    </div>
  );
};

export default LoansAdvance;


