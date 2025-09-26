import React from "react";

const LoansAdvance = ({ data }) => {
  const loans = Array.isArray(data.loans) ? data.loans : [];

  return (
    <div>
      <table className="min-w-full border text-sm">
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
            <th>Payslip No</th>
            <th>Debit Acc</th>
            <th>Credit Acc</th>
            <th>Journal Entry</th>
            <th>Created By</th>
            <th>Approved By</th>
            <th>Guarantor</th>
            <th>Penalty Rate</th>
            <th>Remarks</th>
            <th>Attachment</th>
          </tr>
        </thead>
        <tbody>
          {loans.length > 0 ? (
            loans.map(loan => (
              <tr key={loan.id}>
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
                <td>{loan.payslip_number}</td>
                <td>{loan.debit_account_id}</td>
                <td>{loan.credit_account_id}</td>
                <td>{loan.journal_entry_id}</td>
                <td>{loan.created_by}</td>
                <td>{loan.approved_by}</td>
                <td>{loan.guarantor_id}</td>
                <td>{loan.penalty_rate}</td>
                <td>{loan.remarks}</td>
                <td>{loan.attachment}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={23} className="text-center py-4">
                No loans/advances found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default LoansAdvance;


