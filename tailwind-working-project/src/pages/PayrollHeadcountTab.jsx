import React, { useEffect, useState } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

const PayrollHeadcountTab = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("/api/payrolls/periods").then(res => {
      // Transform data for chart
      setData(
        res.data.map(item => ({
          period: new Date(item.period).toLocaleDateString('en-KE', { year: '2-digit', month: 'short' }),
          headcount: item.employee_count,
        }))
      );
    });
  }, []);

  return (
    <div className="bg-white rounded shadow p-4">
      <h2 className="text-xl font-semibold mb-4">Payroll Headcount Per Month</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="period" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="headcount" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PayrollHeadcountTab;