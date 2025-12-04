import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const BankAccountsDashboard = () => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBatchMenu, setShowBatchMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const navigate = useNavigate();
  const handleEdit = (accountId) => {
    navigate(`/bank-accounts/${accountId}/edit`);
  };

  const handleBatchAction = async (action) => {
    // Implement Batch Delete and Batch View; others are placeholders
    if (action === "Batch Delete") {
      if (selectedIds.size === 0) {
        alert("No accounts selected for batch delete");
        setShowBatchMenu(false);
        return;
      }
      if (!confirm(`Delete ${selectedIds.size} accounts? This will mark them inactive.`)) {
        setShowBatchMenu(false);
        return;
      }

      try {
        const ids = Array.from(selectedIds);
        const res = await fetch("http://localhost:8000/bank-accounts/batch-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        if (!res.ok) throw new Error(`Batch delete failed: ${res.statusText}`);
        const data = await res.json();
        alert(`Deleted ${data.deleted.length} accounts`);
        setSelectedIds(new Set());
        // refresh
        fetchAccounts();
      } catch (err) {
        console.error(err);
        alert(err.message || "Batch delete failed");
      } finally {
        setShowBatchMenu(false);
      }
      return;
    }

    if (action === "Batch View") {
      if (selectedIds.size === 0) {
        alert("No accounts selected to view");
        setShowBatchMenu(false);
        return;
      }
      // open each selected account in a new tab (limited to first 10 for safety)
      const ids = Array.from(selectedIds).slice(0, 10);
      ids.forEach((id) => window.open(`/bank-accounts/${id}`, "_blank"));
      setShowBatchMenu(false);
      return;
    }

    // placeholder for other actions
    alert(`Batch action: ${action} (to be implemented)`);
    setShowBatchMenu(false);
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (checked) => {
    if (checked) {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoading(true);
        setError("");
        const res = await fetch("http://localhost:8000/bank-accounts/summary");
        if (!res.ok) {
          throw new Error("Failed to load bank accounts");
        }
        const data = await res.json();
        setAccounts(data);
      } catch (err) {
        console.error(err);
        setError(err.message || "Error loading bank accounts");
      } finally {
        setLoading(false);
      }
    };

    fetchAccounts();
  }, []);

  const formatAmount = (value) => {
    const num = Number(value || 0);
    return num.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const copyToClipboard = async () => {
    const header = [
      "Code",
      "Name",
      "Currency",
      "Uncategorized Receipts",
      "Uncategorized Payments",
      "Cleared Balance",
      "Actual Balance",
    ];

    const rows = accounts.map((a) => [
      a.account_code,
      a.name,
      a.currency_code || "Ksh",
      a.uncategorized_receipts,
      a.uncategorized_payments,
      a.cleared_balance,
      a.actual_balance,
    ]);

    const text = [header, ...rows].map((r) => r.join("\t")).join("\n");

    try {
      await navigator.clipboard.writeText(text);
      // small visual confirmation; keep simple for now
      alert("Bank accounts copied to clipboard");
    } catch (err) {
      console.error("Copy failed", err);
      alert("Copy to clipboard failed");
    }
  };

  // compute totals grouped by currency
  const totalsByCurrency = accounts.reduce((map, a) => {
    const code = a.currency_code || "Ksh";
    if (!map[code]) {
      map[code] = {
        uncategorized_receipts: 0,
        uncategorized_payments: 0,
        cleared_balance: 0,
        actual_balance: 0,
      };
    }
    map[code].uncategorized_receipts += Number(a.uncategorized_receipts || 0);
    map[code].uncategorized_payments += Number(a.uncategorized_payments || 0);
    map[code].cleared_balance += Number(a.cleared_balance || 0);
    map[code].actual_balance += Number(a.actual_balance || 0);
    return map;
  }, {});

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold mb-4">Bank and Cash Accounts</h1>

      <div className="mb-3 flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={copyToClipboard}
            className="text-sm px-3 py-1 rounded bg-gray-100 border border-gray-300 hover:bg-gray-200 mr-2"
          >
            Copy to clipboard
          </button>
        </div>
        <div>
          <button
            type="button"
            onClick={() => navigate(`/bank-accounts/new/edit`)}
            className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            New Bank or Cash Account
          </button>
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2 relative">
        <button
          type="button"
          onClick={copyToClipboard}
          className="text-sm px-3 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200"
        >
          Copy to clipboard
        </button>
        <button
          type="button"
          onClick={() => navigate("/bank-accounts/import")}
          className="text-sm px-3 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200"
        >
          Import bank statement
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowBatchMenu((v) => !v)}
            className="text-sm px-3 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200"
          >
            Batch Operations ▾
          </button>
          {showBatchMenu && (
            <div className="absolute right-0 mt-1 w-40 bg-white border rounded shadow-lg z-10 text-sm">
              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => handleBatchAction("Batch Create")}
              >
                Batch Create
              </button>
              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => handleBatchAction("Batch Update")}
              >
                Batch Update
              </button>
              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => handleBatchAction("Batch Recode")}
              >
                Batch Recode
              </button>
              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => handleBatchAction("Batch Delete")}
              >
                Batch Delete
              </button>
              <button
                className="block w-full text-left px-3 py-1 hover:bg-gray-100"
                onClick={() => handleBatchAction("Batch View")}
              >
                Batch View
              </button>
            </div>
          )}
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && (
        <p className="text-sm text-red-600 mb-2">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto border rounded bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {/* checkbox column like Manager */}
                  <th className="border px-2 py-1 w-8">
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === accounts.length}
                    onChange={(e) => selectAll(e.target.checked)}
                  />
                </th>
                {/* actions column */}
                <th className="border px-2 py-1 w-24 text-center">Actions</th>
                <th className="border px-2 py-1 text-left w-20">Code</th>
                <th className="border px-2 py-1 text-left">Name</th>
                <th className="border px-2 py-1 text-left w-24">Currency</th>
                <th className="border px-2 py-1 text-right w-40">
                  Uncategorized Receipts
                </th>
                <th className="border px-2 py-1 text-right w-40">
                  Uncategorized Payments
                </th>
                <th className="border px-2 py-1 text-right w-40">
                  Cleared balance
                </th>
                <th className="border px-2 py-1 text-right w-40">
                  Actual balance
                </th>
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 && (
                <tr>
                  <td
                    className="border px-2 py-2 text-center text-gray-500"
                    colSpan={8}
                  >
                    No bank or cash accounts found.
                  </td>
                </tr>
              )}

              {accounts.map((acc) => (
                <tr key={acc.id}>
                  {/* checkbox (not wired yet, just for looks) */}
                  <td className="border px-2 py-1 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(acc.id)}
                      onChange={() => toggleSelect(acc.id)}
                    />
                  </td>

                  {/* Actions: compact icons for Edit + View (account details) */}
                  <td className="border px-2 py-1 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="relative group inline-block">
                        <button
                          type="button"
                          onClick={() => handleEdit(acc.id)}
                          title="Edit account"
                          aria-label={`Edit account ${acc.name}`}
                          className="p-1 rounded hover:bg-gray-100 border border-transparent"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-gray-700">
                            <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                            <path d="M2 15.25V18h2.75l8.486-8.486-2.75-2.75L2 15.25z" />
                          </svg>
                        </button>
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap bg-gray-800 text-white text-xs px-2 py-1 rounded">
                          Edit
                        </div>
                      </div>

                      <div className="relative group inline-block">
                        <button
                          type="button"
                          onClick={() => navigate(`/bank-accounts/${acc.id}`)}
                          title="View account"
                          aria-label={`View account ${acc.name}`}
                          className="p-1 rounded hover:bg-gray-100 border border-transparent"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-600">
                            <path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7zm0 12a5 5 0 110-10 5 5 0 010 10z" />
                            <path d="M12 9a3 3 0 100 6 3 3 0 000-6z" />
                          </svg>
                        </button>
                        <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 hidden group-hover:block whitespace-nowrap bg-gray-800 text-white text-xs px-2 py-1 rounded">
                          View
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="border px-2 py-1">{acc.account_code}</td>
                  <td className="border px-2 py-1">{acc.name}</td>
                  <td className="border px-2 py-1 text-center">{acc.currency_code || "Ksh"}</td>

                  <td className="border px-2 py-1 text-right">
                    {acc.uncategorized_receipts}
                  </td>
                  <td className="border px-2 py-1 text-right">
                    {acc.uncategorized_payments}
                  </td>

                  {/* Cleared balance → open statement */}
                  <td className="border px-2 py-1 text-right">
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() =>
                        navigate(`/bank-accounts/${acc.id}/statements`)
                      }
                    >
                      {(acc.currency_code || "Ksh")} {formatAmount(acc.cleared_balance)}
                    </button>
                  </td>

                  {/* Actual balance → open statement */}
                  <td className="border px-2 py-1 text-right">
                    <button
                      className="text-blue-600 hover:underline"
                      onClick={() =>
                        navigate(`/bank-accounts/${acc.id}/statements`)
                      }
                    >
                      {(acc.currency_code || "Ksh")} {formatAmount(acc.actual_balance)}
                    </button>
                  </td>
                </tr>
                ))}

                {/* Totals rows per currency */}
                {Object.keys(totalsByCurrency).length > 0 &&
                  Object.entries(totalsByCurrency).map(([code, t]) => (
                    <tr key={`totals-${code}`} className="bg-gray-50 font-semibold">
                      <td className="border px-2 py-1" />
                      <td className="border px-2 py-1 text-right" colSpan={4}>
                        Total ({code})
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {t.uncategorized_receipts}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {t.uncategorized_payments}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {code} {formatAmount(t.cleared_balance)}
                      </td>
                      <td className="border px-2 py-1 text-right">
                        {code} {formatAmount(t.actual_balance)}
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default BankAccountsDashboard;
