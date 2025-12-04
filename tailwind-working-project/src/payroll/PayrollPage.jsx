import React, { useState } from "react";
import PayrollHeadcountTab from "./PayrollHeadcountTab";
import PayrollAnalyticsTab from "./PayrollAnalyticsTab";
import PayrollTab from "./PayrollTab";

// Utils: YYYY-MM from Date
export const toYM = (d) => {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
};

// Get scheduled amounts for this employee and period
export function getScheduledDeductionsForPeriod(employee, periodYM) {
  const loans = Array.isArray(employee.loans) ? employee.loans : [];
  let loan = 0;
  let advance = 0;
  const repayments = []; // to send back on confirm (idempotent)

  for (const L of loans) {
    if (L.status && L.status !== "Active") continue;
    const sch = Array.isArray(L.schedule) ? L.schedule : [];
    const row = sch.find((r) => r.period_ym === periodYM && !r.paid);
    if (!row) continue;

    const amount = Number(row.installment || 0);
    if (!amount) continue;

    if ((L.loan_type || L.type || "").toLowerCase() === "advance") {
      advance += amount;
    } else {
      loan += amount;
    }

    repayments.push({
      reference_no: L.reference_no,
      period_ym: row.period_ym,
      installment: row.installment,
    });
  }
  return { loan, advance, repayments };
}

const PayrollPage = () => {
  const [activeTab, setActiveTab] = useState("headcount");

  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">Payroll Dashboard</h1>
      <div className="mb-6 flex space-x-4">
        <button onClick={() => setActiveTab("headcount")}
          className={`px-4 py-2 rounded ${activeTab === "headcount" ? "bg-blue-600 text-white" : "bg-white border"}`}>
          Payroll Headcount
        </button>
        <button onClick={() => setActiveTab("analytics")}
          className={`px-4 py-2 rounded ${activeTab === "analytics" ? "bg-blue-600 text-white" : "bg-white border"}`}>
          Payroll Analytics
        </button>
        <button onClick={() => setActiveTab("payroll")}
          className={`px-4 py-2 rounded ${activeTab === "payroll" ? "bg-blue-600 text-white" : "bg-white border"}`}>
          Payroll
        </button>
      </div>
      {activeTab === "headcount" && <PayrollHeadcountTab />}
      {activeTab === "analytics" && <PayrollAnalyticsTab />}
      {activeTab === "payroll" && <PayrollTab />}
    </div>
  );
};

export default PayrollPage;
