import React, { useState } from "react";
import PayrollHeadcountTab from "./PayrollHeadcountTab";
import PayrollAnalyticsTab from "./PayrollAnalyticsTab";
import PayrollTab from "./PayrollTab";

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
