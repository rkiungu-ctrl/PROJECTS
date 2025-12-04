// src/pages/BankPaymentView.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const BankPaymentView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchPayment = async () => {
      try {
        setError("");
        const res = await fetch(
          `http://localhost:8000/bank-accounts/payments/${id}`
        );
        if (!res.ok) {
          throw new Error("Failed to load payment");
        }
        const data = await res.json();
        setPayment(data);
      } catch (err) {
        console.error("Failed to load payment", err);
        setError("Failed to load payment");
      } finally {
        setLoading(false);
      }
    };

    fetchPayment();
  }, [id]);

  if (loading) {
    return (
      <div className="p-6">
        <div>Loading…</div>
      </div>
    );
  }

  if (error || !payment) {
    return (
      <div className="p-6 text-sm">
        <div className="font-semibold text-red-600">
          {error || "Payment not found"}
        </div>
      </div>
    );
  }

  const formattedTotal = Number(payment.total_amount || 0).toLocaleString(
    undefined,
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  );

  return (
    <div className="p-6 text-sm">
      {/* === Top action bar (like Manager) ================================= */}
      <div className="flex items-center justify-between mb-4 border-b pb-2">
        <div className="flex items-center gap-3">
          <span className="font-semibold">
            Payment{" "}
            {payment.reference && payment.reference.trim() !== ""
              ? payment.reference
              : `#${payment.id}`}
          </span>

          {/* Small "View | Journal" tabs (Journal disabled for now) */}
          <div className="ml-4 flex items-center rounded border bg-gray-50 overflow-hidden text-xs">
            <button className="px-3 py-1 bg-white font-semibold">View</button>
            <button className="px-3 py-1 text-gray-400 cursor-default">
              Journal
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit will later go to /bank-payments/:id/edit */}
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-gray-100"
            onClick={() => navigate(`/bank-payments/${payment.id}/edit`)}
          >
            Edit
          </button>

          {/* Clone / Copy to are placeholders for now */}
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-500 cursor-default"
          >
            Clone
          </button>
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-500 cursor-default"
          >
            Copy to ▼
          </button>

          {/* Print just prints the browser page for now */}
          <button
            type="button"
            className="rounded border border-gray-300 bg-white px-3 py-1 text-xs font-semibold hover:bg-gray-100"
            onClick={() => window.print()}
          >
            Print
          </button>

          {/* Simple, non-functional pager for now – just UI */}
          <div className="ml-4 flex items-center rounded border bg-white overflow-hidden text-xs">
            <button
              type="button"
              className="px-2 py-1 text-gray-400 cursor-default"
            >
              ⏮
            </button>
            <button
              type="button"
              className="px-2 py-1 text-gray-400 cursor-default"
            >
              ◀
            </button>
            <span className="px-3 py-1 border-l border-r border-gray-200 text-gray-500">
              1 / 1
            </span>
            <button
              type="button"
              className="px-2 py-1 text-gray-400 cursor-default"
            >
              ▶
            </button>
            <button
              type="button"
              className="px-2 py-1 text-gray-400 cursor-default"
            >
              ⏭
            </button>
          </div>
        </div>
      </div>

      {/* === Main Payment header ========================================== */}
      <h1 className="text-2xl font-semibold mb-4">Payment</h1>

      {/* Date / Reference / Paid from */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div className="font-semibold">Date</div>
          <div>{payment.date}</div>
        </div>
        <div>
          <div className="font-semibold">Reference</div>
          <div>
            {payment.reference && payment.reference.trim() !== ""
              ? payment.reference
              : "-"}
          </div>
        </div>
        <div>
          <div className="font-semibold">Paid from</div>
          <div>{payment.bank_account_name || "-"}</div>
        </div>
      </div>

      {/* Payee */}
      <div className="mb-4">
        <div className="font-semibold">Payee</div>
        <div>{payment.payee || "-"}</div>
      </div>

      {/* Description */}
      <div className="mb-4">
        <div className="font-semibold">Description</div>
        <div>{payment.description || "-"}</div>
      </div>

      {/* Lines table */}
      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border px-2 py-1 text-left">Account</th>
            <th className="border px-2 py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {payment.lines && payment.lines.length > 0 ? (
            payment.lines.map((line) => (
              <tr key={line.id}>
                <td className="border px-2 py-1">
                  {line.account_code} - {line.account_name}
                </td>
                <td className="border px-2 py-1 text-right">
                  {payment.currency}{" "}
                  {Number(line.amount || 0).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td
                className="border px-2 py-2 text-center text-gray-500"
                colSpan={2}
              >
                No lines found for this payment.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td className="border px-2 py-1 font-semibold text-right">
              Total
            </td>
            <td className="border px-2 py-1 font-semibold text-right">
              {payment.currency} {formattedTotal}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

export default BankPaymentView;
