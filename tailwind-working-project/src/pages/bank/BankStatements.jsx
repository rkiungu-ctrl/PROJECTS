import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const formatAmount = (value) => {
  const num = Number(value || 0);
  return num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const BankStatements = () => {
  const { id: bankAccountId } = useParams();
  const navigate = useNavigate();

  const [statements, setStatements] = useState([]);
  const [account, setAccount] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalAmount, setTotalAmount] = useState(0);
  const [closingBalance, setClosingBalance] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  useEffect(() => {
    const fetchStatements = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
        if (search) params.append("search", search);

        const url = `http://localhost:8000/bank-accounts/${bankAccountId}/statements?` + params.toString();
        console.debug("Fetching statements from", url);
        const res = await fetch(url);
        // if the backend returned HTML (e.g. dev server proxy or error page), log it for debugging
        const ctype = res.headers.get("content-type") || "";
        if (!res.ok) {
          const txt = await res.text();
          console.error("Statements fetch failed", res.status, txt.slice(0, 200));
          throw new Error(`Failed to load statements: ${res.status}`);
        }
        if (ctype.includes("text/html")) {
          const txt = await res.text();
          console.error("Statements endpoint returned HTML (likely wrong origin or proxy):", txt.slice(0, 200));
          throw new Error("Statements endpoint returned HTML instead of JSON");
        }
        let data;
        try {
          data = await res.json();
        } catch (e) {
          const txt = await res.text();
          console.error("Failed to parse JSON from statements endpoint. Response text:", txt.slice(0, 500));
          throw e;
        }

        setStatements(data.items || []);
        setTotalItems(data.total_items || 0);
        setTotalAmount(data.total_amount || 0);
        setClosingBalance(data.closing_balance || 0);
      } catch (err) {
        console.error(err);
        alert(err.message || "Failed to load statements");
      } finally {
        setLoading(false);
      }
    };

    if (bankAccountId) fetchStatements();
  }, [bankAccountId, page, pageSize, search]);

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        const res = await fetch("http://localhost:8000/bank-accounts/summary");
        if (!res.ok) throw new Error("Failed to load bank accounts");
        const accounts = await res.json();
        const acc = accounts.find((a) => a.id === Number(bankAccountId));
        setAccount(acc || null);
      } catch (err) {
        console.error("Failed to fetch account summary", err);
      }
    };

    if (bankAccountId) fetchAccount();
  }, [bankAccountId]);

  const handleCopyToClipboard = () => {
    const header = ["Date", "Transaction", "Account", "Description", "Amount", "Balance"];
    const rows = statements.map((row) => [
      row.date,
      `${row.transaction_type} — ${row.reference || ""}`,
      row.account_name || "",
      row.description || "",
      row.amount,
      row.balance,
    ]);
    const csvLines = [header, ...rows].map((r) => r.join("\t")).join("\n");
    navigator.clipboard.writeText(csvLines);
    alert("Copied statements to clipboard");
  };

  const fetchStatements = async (p = page, ps = pageSize) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(p), page_size: String(ps) });
      if (search) params.append("search", search);
      const url = `http://localhost:8000/bank-accounts/${bankAccountId}/statements?` + params.toString();
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to load statements: ${res.status}`);
      const data = await res.json();
      setStatements(data.items || []);
      setTotalItems(data.total_items || 0);
      setTotalAmount(data.total_amount || 0);
      setClosingBalance(data.closing_balance || 0);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to load statements");
    } finally {
      setLoading(false);
    }
  };

  const handleApplyBankRules = async () => {
    if (!bankAccountId) return;
    if (!window.confirm("Apply bank rules to this account? Only uncategorised transactions will be updated.")) {
      return;
    }
    setApplyingRules(true);
    setApplyResult(null);
    try {
      const res = await fetch(
        `http://localhost:8000/bank-accounts/${bankAccountId}/apply-rules?only_uncategorised=true`,
        { method: "POST" }
      );
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Failed to apply rules: ${res.status} ${txt}`);
      }
      const data = await res.json();
      setApplyResult(data);
      await fetchStatements(1, pageSize);
      setPage(1);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to apply bank rules");
    } finally {
      setApplyingRules(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil((totalItems || 0) / pageSize));

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Bank statements</h2>
          {account && (
            <p className="text-sm text-gray-600">
              {account.account_code} — {account.name}
            </p>
          )}
          {/* Show closing/actual balance at the top, under the bank name */}
          {typeof closingBalance === 'number' && (
            <div className="mt-1 text-sm text-gray-700">
              <span className="font-medium">Actual balance:</span>
              <span className="ml-2" style={{ color: closingBalance < 0 ? 'red' : 'inherit' }}>{formatAmount(closingBalance)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="text-sm px-3 py-1 rounded border bg-blue-600 text-white font-semibold mr-2"
            onClick={() => navigate("/payments/new")}
          >
            New Payment
          </button>
          <button
            type="button"
            onClick={handleApplyBankRules}
            disabled={applyingRules}
            className="text-sm px-3 py-1 rounded border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
          >
            {applyingRules ? "Applying rules…" : "Apply Bank Rules"}
          </button>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference or description"
            className="border px-2 py-1 rounded text-sm"
          />
          <button onClick={handleCopyToClipboard} className="text-sm px-3 py-1 rounded border bg-gray-100">Copy to clipboard</button>
          <button onClick={() => navigate(-1)} className="text-sm px-3 py-1 rounded border bg-white">Back</button>
        </div>
      </div>
      {applyResult && (
        <p className="mt-2 text-xs text-gray-600">
          Bank rules applied: checked {applyResult.total_checked} transactions, updated {applyResult.updated}.
        </p>
      )}

      <div className="overflow-x-auto bg-white border rounded">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-2 py-1 w-24">Actions</th>
              <th className="border px-2 py-1 w-28">Date</th>
              <th className="border px-2 py-1">Transaction</th>
              <th className="border px-2 py-1">Account</th>
              <th className="border px-2 py-1">Description</th>
              <th className="border px-2 py-1 text-right w-32">Amount</th>
              <th className="border px-2 py-1 text-right w-32">Balance</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">Loading...</td>
              </tr>
            )}

            {!loading && statements.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500">No transactions found.</td>
              </tr>
            )}

            {statements.map((row) => (
              <tr key={row.id}>
                <td className="border px-2 py-1 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button className="p-1 rounded hover:bg-gray-100" title="Edit transaction">✎</button>
                    <button
                      className="p-1 rounded hover:bg-gray-100"
                      title="View payment"
                      onClick={() => navigate(`/bank-payments/${row.id}`)}
                    >
                      👁
                    </button>
                  </div>
                </td>
                <td className="border px-2 py-1">{row.date}</td>
                <td className="border px-2 py-1">{`${row.transaction_type} — ${row.reference || ""}`}</td>
                <td className="border px-2 py-1">{row.account_name || ""}</td>
                <td className="border px-2 py-1">{row.description || ""}</td>
                <td className="border px-2 py-1 text-right">
                  <span style={{ color: row.amount < 0 ? "red" : "inherit" }}>
                    {formatAmount(row.amount)}
                  </span>
                </td>
                <td className="border px-2 py-1 text-right">{formatAmount(row.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td colSpan={5} className="px-2 py-2 text-right">Total</td>
              <td className="px-2 py-2 text-right">{formatAmount(totalAmount)}</td>
              <td className="px-2 py-2 text-right">&nbsp;</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Show closing/actual balance under the account header (removed from table footer) */}
      <div className="mt-2">
        {typeof closingBalance === 'number' && (
          <div className="text-sm text-gray-700">
            <span className="font-medium">Actual balance:</span>
            <span className="ml-2" style={{ color: closingBalance < 0 ? 'red' : 'inherit' }}>{formatAmount(closingBalance)}</span>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(1)} disabled={page === 1} className="px-2 py-1 rounded border">&lt;&lt;</button>
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-2 py-1 rounded border">&lt;</button>
          <span className="px-2">Page {page} / {totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-2 py-1 rounded border">&gt;</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-2 py-1 rounded border">&gt;&gt;</button>
        </div>

        <div className="flex items-center gap-2">
          {[50, 100, 250, 1000].map((s) => (
            <button key={s} onClick={() => { setPageSize(s); setPage(1); }} className={`px-2 py-1 rounded border ${s === pageSize ? 'bg-gray-200' : ''}`}>{s}</button>
          ))}
          <button onClick={() => { setPageSize(totalItems || 5000); setPage(1); }} className={`px-2 py-1 rounded border ${totalItems === pageSize ? 'bg-gray-200' : ''}`}>{totalItems ? `All (${totalItems})` : 'All'}</button>
        </div>
      </div>
    </div>
  );
};

export default BankStatements;
