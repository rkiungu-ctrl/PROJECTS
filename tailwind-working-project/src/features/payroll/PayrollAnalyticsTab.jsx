import React, { useEffect, useState } from "react";
import axios from "axios";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer } from "recharts";

const PayrollAnalyticsTab = () => {
  const [data, setData] = useState([]);

  useEffect(() => {
    axios.get("/api/payrolls/periods").then(res => {
      // You may need to fetch more detailed data for deductions
      setData(
        res.data.map(item => ({
          period: new Date(item.period).toLocaleDateString('en-KE', { year: '2-digit', month: 'short' }),
          net_pay: item.total_net,
          // Add more fields if your summary endpoint provides them
        }))
      );
    });
  }, []);

  return (
    <div className="bg-white rounded shadow p-4">
      <h2 className="text-xl font-semibold mb-4">Payroll Analytics</h2>
      <div className="mb-8">
        <h3 className="font-semibold mb-2">Net Pay Trend</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="net_pay" stroke="#10b981" name="Net Pay" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {/* Add more charts for deductions if you have the data */}
    </div>
  );
};

export default PayrollAnalyticsTab;