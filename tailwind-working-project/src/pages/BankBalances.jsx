// BankBalances.jsx — Manager.io style list with summary columns & search
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000";

const BankBalances = () => {
  const navigate = useNavigate();

  const [accounts, setAccounts] = useState([]);
  const [balances, setBalances] = useState([]); // summary from backend
  const [err, setErr] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [addErr, setAddErr] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editAccount, setEditAccount] = useState(null);
  const [search, setSearch] = useState("");

  const [newAccount, setNewAccount] = useState({
    account_code: "",
    name: "",
    type: "Asset",
    category: "Bank",
    sub_category: "",
    description: "",
    is_physical: true,
    bank_name: "",
    account_number: "",
    branch_name: "",
    branch_code: "",
  });

  const [viewAccount, setViewAccount] = useState(null);
  const [showViewModal, setShowViewModal] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importAccount, setImportAccount] = useState("");
  const [importFile, setImportFile] = useState(null);

  const [selectedAccounts, setSelectedAccounts] = useState([]);

  // ---- Data fetchers --------------------------------------------------------
  const fetchAccounts = async () => {
    try {
      setErr("");
      const res = await axios.get(`${API_BASE}/accounts/`);
      // Only show physical bank/cash accounts
      setAccounts(
        (res.data || []).filter(
          (acc) =>
            acc.is_physical === true &&
            acc.type === "Asset" &&
            ["Bank", "Cash"].includes(acc.category)
        )
      );
    } catch (e) {
      setErr("Failed to load accounts");
    }
  };

  const fetchSummary = async () => {
    try {
      setErr("");
      const res = await axios.get(
        `${API_BASE}/bank_transactions/bank_transactions/summary`
      );
      setBalances(res.data || []);
    } catch (e) {
      console.error(e);
      setErr("Failed to load bank balances");
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchSummary();
  }, []);

  // ---- Helper mapping (account_code -> summary fields) ----------------------
  const summaryByCode = useMemo(() => {
    const map = {};
    (balances || []).forEach((b) => {
      // expected keys (fallbacks to 0 if backend doesn’t provide)
      const code = b?.account_code ?? b?.code ?? b?.accountCode;
      if (!code) return;
      map[code] = {
        uncategorized_receipts: Number(b?.uncategorized_receipts ?? 0),
        uncategorized_payments: Number(b?.uncategorized_payments ?? 0),
        cleared_balance: Number(b?.cleared_balance ?? 0),
        actual_balance: Number(b?.actual_balance ?? b?.balance ?? 0),
      };
    });
    return map;
  }, [balances]);

  // Filter like Manager search box (code or name match)
  const filteredAccounts = useMemo(() => {
    const q = (search || "").toLowerCase().trim();
    if (!q) return accounts;
    return accounts.filter(
      (a) =>
        String(a.account_code || "").toLowerCase().includes(q) ||
        String(a.name || "").toLowerCase().includes(q)
    );
  }, [accounts, search]);

  // Totals (sum of actual balances)
  const totalActual = useMemo(() => {
    return filteredAccounts.reduce((sum, a) => {
      const code = a?.account_code;
      const s = summaryByCode[code] || {};
      return sum + Number(s.actual_balance ?? a?.balance ?? 0);
    }, 0);
  }, [filteredAccounts, summaryByCode]);

  // ---- Handlers -------------------------------------------------------------
  const handleAddAccount = async (e) => {
    e.preventDefault();
    setAddErr("");
    try {
      await axios.post(`${API_BASE}/accounts/`, {
        ...newAccount,
        is_physical: true,
      });
      setShowAddModal(false);
      setNewAccount({
        account_code: "",
        name: "",
        type: "Asset",
        category: "Bank",
        sub_category: "",
        description: "",
        is_physical: true,
      });
      fetchAccounts();
      fetchSummary();
    } catch (err) {
      console.error(err);
      setAddErr(err.response?.data?.detail || "Failed to add account");
    }
  };

  const handleEdit = (acc) => {
    setEditAccount(acc);
    setShowEditModal(true);
  };

  const handleUpdateAccount = async (e) => {
    e.preventDefault();
    setAddErr("");
    try {
      await axios.put(`${API_BASE}/accounts/${editAccount.id}/`, {
        ...editAccount,
        is_physical: true,
      });
      setShowEditModal(false);
      setEditAccount(null);
      fetchAccounts();
      fetchSummary();
    } catch (err) {
      console.error(err);
      setAddErr(err.response?.data?.detail || "Failed to update account");
    }
  };

  const handleView = (acc) => {
    setViewAccount(acc);
    setShowViewModal(true);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!importAccount || !importFile) return;
    const formData = new FormData();
    formData.append("account_code", importAccount);
    formData.append("file", importFile);
    await axios.post(`${API_BASE}/bank_transactions/import/`, formData);
    setShowImportModal(false);
    fetchSummary();
  };

  const downloadTemplate = () => {
    // You can serve a static CSV file from your backend or generate one here
    const csvContent = "Date,Description,Amount\n2023-01-01,Deposit,1000.00";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bank_statement_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Checkbox handler
  const handleSelectAccount = (id) => {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Batch delete handler
  const handleBatchDelete = async () => {
    if (selectedAccounts.length === 0) return;
    if (!window.confirm("Delete selected accounts? This cannot be undone."))
      return;
    await axios.delete(`${API_BASE}/bank_transactions/accounts/batch_delete/`, {
      data: selectedAccounts,
    });
    setSelectedAccounts([]);
    fetchAccounts();
    fetchSummary();
  };

  // Example handler for moving selected transactions
  const handleBatchMove = async (selectedTxIds, targetAccountId) => {
    await axios.post(`${API_BASE}/bank_transactions/transactions/batch_move/`, {
      transaction_ids: selectedTxIds,
      target_account_id: targetAccountId,
    });
    // Refresh transactions after move
    fetchTransactions();
  };

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="p-6">
      {/* Title row like Manager */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold">Bank and Cash Accounts</h2>

        <div className="flex items-center gap-2">
          <button
            className="px-4 py-2 rounded bg-green-600 text-white"
            onClick={() => setShowAddModal(true)}
          >
            New Bank or Cash Account
          </button>

          <button
            className="px-3 py-2 rounded border"
            title="Advanced Queries (coming soon)"
            onClick={() => {}}
          >
            Advanced Queries
          </button>

          <input
            type="text"
            placeholder="Search"
            className="border rounded px-3 py-2 w-[220px]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            className="px-4 py-2 rounded bg-blue-600 text-white"
            onClick={() => {
              fetchAccounts();
              fetchSummary();
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      {err && <div className="text-red-600 mb-2">{err}</div>}

      {/* Manager-like table */}
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-3 py-2 w-10">
                <input
                  type="checkbox"
                  checked={
                    selectedAccounts.length === filteredAccounts.length &&
                    filteredAccounts.length > 0
                  }
                  onChange={() => {
                    if (selectedAccounts.length === filteredAccounts.length) {
                      setSelectedAccounts([]);
                    } else {
                      setSelectedAccounts(filteredAccounts.map((a) => a.id));
                    }
                  }}
                />
              </th>
              <th className="border px-3 py-2 w-28 text-left">Code</th>
              <th className="border px-3 py-2 text-left">Name</th>
              <th className="border px-3 py-2 text-center">
                Uncategorized Receipts
              </th>
              <th className="border px-3 py-2 text-center">
                Uncategorized Payments
              </th>
              <th className="border px-3 py-2 text-right">Cleared balance</th>
              <th className="border px-3 py-2 text-right">Actual balance</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-6">
                  No accounts found.
                </td>
              </tr>
            ) : (
              filteredAccounts.map((acc) => {
                const code = acc?.account_code;
                const s = summaryByCode[code] || {};
                const cleared = Number(s.cleared_balance ?? 0);
                const actual = Number(
                  s.actual_balance ?? acc?.balance ?? 0
                );
                const urec = Number(s.uncategorized_receipts ?? 0);
                const upay = Number(s.uncategorized_payments ?? 0);

                return (
                  <tr key={code} className="hover:bg-gray-50">
                    <td className="border px-3 py-2">
                      <input
                        type="checkbox"
                        checked={selectedAccounts.includes(acc.id)}
                        onChange={() => handleSelectAccount(acc.id)}
                      />
                    </td>
                    <td className="border px-3 py-2">{code}</td>
                    <td className="border px-3 py-2">{acc?.name}</td>
                    <td className="border px-3 py-2 text-center">
                      {urec.toLocaleString()}
                    </td>
                    <td className="border px-3 py-2 text-center">
                      {upay.toLocaleString()}
                    </td>
                    <td className="border px-3 py-2 text-right">
                      Ksh{" "}
                      {cleared.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                    <td className="border px-3 py-2 text-right">
                      <button
                        className="text-blue-600 underline"
                        onClick={() =>
                          navigate(
                            `/bank-balances/${encodeURIComponent(code)}`
                          )
                        }
                      >
                        Ksh{" "}
                        {actual.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>

          {/* Totals row (Actual balance) */}
          <tfoot>
            <tr className="bg-gray-200 font-semibold">
              <td className="border px-3 py-2" colSpan={6}>
                Total
              </td>
              <td className="border px-3 py-2 text-right text-blue-700">
                Ksh{" "}
                {totalActual.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Footer controls like Manager (non-functional placeholders except Refresh) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="px-3 py-2 border rounded"
          onClick={() => setShowImportModal(true)}
        >
          Import bank statement
        </button>
        <button className="px-3 py-2 border rounded" onClick={() => {}}>
          Form Defaults
        </button>
        <button className="px-3 py-2 border rounded" onClick={() => {}}>
          Edit columns
        </button>
        <button className="px-3 py-2 border rounded" onClick={() => {}}>
          Batch Operations
        </button>
        <button
          className="px-3 py-2 border rounded bg-red-600 text-white"
          onClick={handleBatchDelete}
          disabled={selectedAccounts.length === 0}
        >
          Batch Delete
        </button>
      </div>

      {/* Add Account Modal (unchanged) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Add Bank or Cash Account</h3>
            {addErr && <div className="text-red-600 mb-2">{addErr}</div>}
            {/* Only show fields relevant for bank/cash accounts */}
            <form onSubmit={handleAddAccount}>
              <div className="mb-2">
                <label className="block mb-1">Account Code</label>
                <input
                  className="border p-2 rounded w-full"
                  value={newAccount.account_code}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, account_code: e.target.value })
                  }
                  required
                />
              </div>

              <div className="mb-2">
                <label className="block mb-1">Name</label>
                <input
                  className="border p-2 rounded w-full"
                  value={newAccount.name}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="mb-2">
                <label className="block mb-1">Currency</label>
                <select
                  className="border p-2 rounded w-full"
                  value={newAccount.currency || "KES"}
                  onChange={(e) =>
                    setNewAccount({ ...newAccount, currency: e.target.value })
                  }
                >
                  <option value="KES">KES - Kenya Shillings</option>
                  {/* Add more currencies as needed */}
                </select>
              </div>

              <div className="mb-2">
                <label className="block mb-1">Bank Name</label>
                <input
                  className="border p-2 rounded w-full"
                  value={newAccount.bank_name}
                  onChange={e => setNewAccount({ ...newAccount, bank_name: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1">Account Number</label>
                <input
                  className="border p-2 rounded w-full"
                  value={newAccount.account_number}
                  onChange={e => setNewAccount({ ...newAccount, account_number: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1">Branch Name</label>
                <input
                  className="border p-2 rounded w-full"
                  value={newAccount.branch_name}
                  onChange={e => setNewAccount({ ...newAccount, branch_name: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1">Branch Code</label>
                <input
                  className="border p-2 rounded w-full"
                  value={newAccount.branch_code}
                  onChange={e => setNewAccount({ ...newAccount, branch_code: e.target.value })}
                />
              </div>

              {/* Add more fields as needed */}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {showEditModal && editAccount && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Edit Bank or Cash Account</h3>
            {addErr && <div className="text-red-600 mb-2">{addErr}</div>}
            {/* Only show fields relevant for bank/cash accounts */}
            <form onSubmit={handleUpdateAccount}>
              <div className="mb-2">
                <label className="block mb-1">Account Code</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editAccount.account_code}
                  onChange={(e) =>
                    setEditAccount({ ...editAccount, account_code: e.target.value })
                  }
                  required
                />
              </div>

              <div className="mb-2">
                <label className="block mb-1">Name</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editAccount.name}
                  onChange={(e) =>
                    setEditAccount({ ...editAccount, name: e.target.value })
                  }
                  required
                />
              </div>

              <div className="mb-2">
                <label className="block mb-1">Currency</label>
                <select
                  className="border p-2 rounded w-full"
                  value={editAccount.currency || "KES"}
                  onChange={(e) =>
                    setEditAccount({ ...editAccount, currency: e.target.value })
                  }
                >
                  <option value="KES">KES - Kenya Shillings</option>
                  {/* Add more currencies as needed */}
                </select>
              </div>

              <div className="mb-2">
                <label className="block mb-1">Bank Name</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editAccount.bank_name}
                  onChange={e => setEditAccount({ ...editAccount, bank_name: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1">Account Number</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editAccount.account_number}
                  onChange={e => setEditAccount({ ...editAccount, account_number: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1">Branch Name</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editAccount.branch_name}
                  onChange={e => setEditAccount({ ...editAccount, branch_name: e.target.value })}
                />
              </div>
              <div className="mb-2">
                <label className="block mb-1">Branch Code</label>
                <input
                  className="border p-2 rounded w-full"
                  value={editAccount.branch_code}
                  onChange={e => setEditAccount({ ...editAccount, branch_code: e.target.value })}
                />
              </div>

              {/* Add more fields as needed */}
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Account Modal */}
      {showViewModal && viewAccount && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">View Bank or Cash Account</h3>
            {/* Display all fields in viewAccount */}
            <div className="mb-2">
              <strong>Account Code:</strong> {viewAccount.account_code}
            </div>
            <div className="mb-2">
              <strong>Name:</strong> {viewAccount.name}
            </div>
            <div className="mb-2">
              <strong>Currency:</strong> {viewAccount.currency}
            </div>
            <div className="mb-2">
              <strong>Bank Name:</strong> {viewAccount.bank_name}
            </div>
            <div className="mb-2">
              <strong>Account Number:</strong> {viewAccount.account_number}
            </div>
            <div className="mb-2">
              <strong>Branch Name:</strong> {viewAccount.branch_name}
            </div>
            <div className="mb-2">
              <strong>Branch Code:</strong> {viewAccount.branch_code}
            </div>

            {/* Add more fields as needed */}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-md">
            <h3 className="text-lg font-bold mb-4">Import Bank Statement</h3>
            <form onSubmit={handleImport}>
              <div className="mb-2">
                <label className="block mb-1">Select Account</label>
                <select
                  className="border p-2 rounded w-full"
                  value={importAccount}
                  onChange={e => setImportAccount(e.target.value)}
                  required
                >
                  <option value="">Select Account</option>
                  {accounts.map(acc => (
                    <option key={acc.account_code} value={acc.account_code}>
                      {acc.name} ({acc.account_code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="mb-2">
                <label className="block mb-1">Upload File</label>
                <input
                  type="file"
                  accept=".csv"
                  onChange={e => setImportFile(e.target.files[0])}
                  required
                />
              </div>
              <div className="flex justify-between gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="px-4 py-2 bg-gray-500 text-white rounded"
                >
                  Cancel
                </button>
                <a
                  href={`${API_BASE}/bank_transactions/import/template/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                >
                  Download Template
                </a>
                <button
                  type="submit"
                  className="px-4 py-2 bg-green-600 text-white rounded"
                >
                  Import
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BankBalances;
