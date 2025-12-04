import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

const BankPaymentsPage = () => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchPayments = async () => {
      try {
        setError("");
        setLoading(true);
        const res = await fetch("http://localhost:8000/bank-accounts/withdrawals/");
        if (!res.ok) throw new Error("Failed to load payments");
        const data = await res.json();
        setPayments(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Failed to load payments", err);
        setError("Failed to load payments");
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, []);

  // Totals per currency (Ksh, USD, etc.)
  const totalsByCurrency = useMemo(() => {
    const totals = {};
    payments.forEach((p) => {
      const currency = p.currency || "Ksh";
      const rawAmount =
        p.total_amount !== undefined ? p.total_amount : p.amount || 0;
      const amount = Number(rawAmount) || 0;
      totals[currency] = (totals[currency] || 0) + amount;
    });
    return totals;
  }, [payments]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Bank Payments</h1>
        <div>Loading…</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header + New Payment button */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Bank Payments</h1>
        <button
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => navigate("/bank-payments/new")}
        >
          New Payment
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-400 bg-red-100 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Payments table */}
      <div className="text-sm">
        <table className="w-full border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-2 py-1 text-left w-28">Date</th>
              <th className="border px-2 py-1 text-left">Paid from</th>
              <th className="border px-2 py-1 text-left">Description</th>
              <th className="border px-2 py-1 text-left w-40">Payee</th>
              <th className="border px-2 py-1 text-right w-32">Amount</th>
              <th className="border px-2 py-1 text-center w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const currency = p.currency || "Ksh";
              const rawAmount =
                p.total_amount !== undefined ? p.total_amount : p.amount || 0;
              const amount = Number(rawAmount) || 0;

              return (
                <tr key={p.id}>
                  <td className="border px-2 py-1">{p.date}</td>
                  <td className="border px-2 py-1">
                    {p.bank_account_name || p.bank_account_code || "-"}
                  </td>
                  <td className="border px-2 py-1">
                    {p.description || p.reference || "-"}
                  </td>
                  <td className="border px-2 py-1">
                    {p.payee || p.contact_name || "-"}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {currency}{" "}
                    {amount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td className="border px-2 py-1 text-center">
                    <button
                      type="button"
                      className="mx-1 text-xs text-blue-600"
                      onClick={() => navigate(`/bank-payments/${p.id}`)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="mx-1 text-xs text-green-600"
                      onClick={() => navigate(`/bank-payments/${p.id}/edit`)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
            {payments.length === 0 && (
              <tr>
                <td
                  className="border px-2 py-3 text-center text-gray-500"
                  colSpan={6}
                >
                  No payments found.
                </td>
              </tr>
            )}
          </tbody>
          {/* Totals row (Manager-style, per currency) */}
          <tfoot>
            {Object.entries(totalsByCurrency).map(([currency, total]) => (
              <tr key={currency} className="bg-gray-50 font-semibold">
                <td className="border px-2 py-1 text-right" colSpan={4}>
                  Total ({currency})
                </td>
                <td className="border px-2 py-1 text-right">
                  {currency}{" "}
                  {total.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
                <td className="border px-2 py-1" />
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default BankPaymentsPage;
