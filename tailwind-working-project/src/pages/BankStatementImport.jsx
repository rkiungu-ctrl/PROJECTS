import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const BankStatementImport = () => {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [file, setFile] = useState(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        setLoadingAccounts(true);
        setError("");
        const res = await fetch("http://localhost:8000/bank-accounts/summary");
        if (!res.ok) {
          throw new Error(`Failed to load bank accounts (${res.status})`);
        }
        const data = await res.json();
        setAccounts(data || []);
      } catch (err) {
        console.error(err);
        setError(err.message || "Error loading bank accounts");
      } finally {
        setLoadingAccounts(false);
      }
    };
    fetchAccounts();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedAccountId) {
      alert("Please select a bank or cash account.");
      return;
    }
    if (!file) {
      alert("Please choose a CSV file.");
      return;
    }

    setImporting(true);
    setError("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `http://localhost:8000/bank-accounts/${selectedAccountId}/import-statements`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Import failed: ${res.status} ${txt}`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      console.error(err);
      setError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const selectedAccount = accounts.find((a) => a.id === Number(selectedAccountId));

  return (
    <div className="p-4 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <button
            onClick={() => navigate("/bank-accounts")}
            className="text-xs text-blue-600 hover:underline mb-1"
          >
            Bank and Cash Accounts
          </button>
          <h1 className="text-xl font-semibold">Import bank statement</h1>
          {selectedAccount && (
            <p className="text-sm text-gray-600">
              Importing into: <span className="font-medium">{selectedAccount.account_code} — {selectedAccount.name}</span>
            </p>
          )}
        </div>
        <button
          className="text-sm px-3 py-1 rounded border bg-white"
          onClick={() => navigate(-1)}
        >
          Back
        </button>
      </div>

      {loadingAccounts && (
        <p className="text-sm text-gray-500 mb-2">Loading bank accounts…</p>
      )}
      {error && (
        <p className="text-sm text-red-600 mb-2">
          {error}
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 border rounded bg-white p-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Bank or Cash Account
          </label>
          <select
            className="border rounded px-2 py-1 w-full text-sm"
            value={selectedAccountId}
            onChange={(e) => setSelectedAccountId(e.target.value)}
            required
          >
            <option value="">Select account…</option>
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.account_code} — {acc.name} ({acc.currency_code || "Ksh"})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Statement file (CSV)
          </label>
          <input
            type="file"
            accept=".csv,text/csv"
            className="block w-full text-sm"
            onChange={(e) => setFile(e.target.files && e.target.files[0])}
          />
          <p className="text-xs text-gray-500 mt-1">
            Expected columns: <strong>date</strong>, <strong>amount</strong> (or <strong>debit</strong> + <strong>credit</strong>),
            optional: reference, description/narration, transaction_type, payee.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={importing}
            className="px-3 py-1 rounded bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import statement"}
          </button>
          {selectedAccountId && (
            <button
              type="button"
              className="px-3 py-1 rounded border text-sm"
              onClick={() => navigate(`/bank-accounts/${selectedAccountId}/statements`)}
            >
              View statements
            </button>
          )}
        </div>
      </form>

      {result && (
        <div className="mt-4 border rounded bg-white p-4 text-sm">
          <h2 className="font-semibold mb-2">Import summary</h2>
          <p>Total rows in file: <strong>{result.total_rows}</strong></p>
          <p>Imported transactions: <strong>{result.imported_rows}</strong></p>
          <p>Skipped rows: <strong>{result.skipped_rows}</strong></p>

          {result.errors && result.errors.length > 0 && (
            <div className="mt-2">
              <p className="font-medium mb-1">Notes / errors (first few):</p>
              <ul className="list-disc pl-5 space-y-1 max-h-40 overflow-y-auto">
                {result.errors.slice(0, 20).map((msg, idx) => (
                  <li key={idx}>{msg}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BankStatementImport;
