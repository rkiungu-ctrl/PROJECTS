import React from "react";
import { useParams } from "react-router-dom";

const ViewPayslips = () => {
  const { period } = useParams();

  return (
    <div className="bg-gray-100 p-8 min-h-screen">
      <h1 className="text-2xl font-bold mb-4">Payslips for {period}</h1>
      <p className="text-gray-600">This page will show all payslips for the selected payroll period.</p>
    </div>
  );
};

export default ViewPayslips;
