// BankAccountDetail.jsx — CLEAN + STABLE
import { useParams, Link, Outlet } from "react-router-dom";
import { useEffect, useState } from "react";
import axios from "axios";
import Select from "react-select";
import TransactionModal from "./TransactionModal"; // Import the new modal component


const API_BASE = "http://127.0.0.1:8000";

// Safe date display
const safeDate = (value) => {
  try {
    if (!value) return "";
    const d = new Date(value);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString();
  } catch {
    return "";
  }
};

const BankAccountDetail = () => {
  // Read the encoded param and decode it back to the original account code
  const { accountCode: rawParam } = useParams();
  const accountCode = decodeURIComponent(rawParam || "");

  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  // Pagination and search
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [total, setTotal] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");

  // File import
  const [importFile, setImportFile] = useState(null);
  const [importSummary, setImportSummary] = useState(null);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTx, setEditTx] = useState(null);
  const [modalErr, setModalErr] = useState("");
  const initialTxForm = {
    date: "",
    type: "deposit",
    amount: "",
    reference: "",
    narration: "",
    counter_account_id: "",
    lines: [
      // { account_id, amount, narration }
    ],
  };
  const [txForm, setTxForm] = useState(initialTxForm);

  const [accountList, setAccountList] = useState([]);
  const [supplierList, setSupplierList] = useState([]);
  const [employeeList, setEmployeeList] = useState([]);
  const [unpaidInvoices, setUnpaidInvoices] = useState({});
  const [payPeriods, setPayPeriods] = useState([]);
  const [partyList, setPartyList] = useState([]);

  // -------- helpers --------
  const fetchTransactions = async (signal) => {
    try {
      const { data } = await axios.get(
        `${API_BASE}/bank_transactions/code/${encodeURIComponent(accountCode)}`,
        { params: { page, page_size: pageSize, q: searchTerm }, signal }
      );
      setTransactions(Array.isArray(data?.transactions) ? data.transactions : []);
      setTotal(typeof data?.total === "number" ? data.total : 0);
    } catch (e) {
      if (axios.isCancel?.(e)) return;
      setTransactions([]);
      setErr(e?.response?.data?.detail || e?.message || "Failed to load transactions");
    }
  };

  // -------- initial & reactive load --------
  useEffect(() => {
    if (!accountCode) {
      setErr("Invalid account code.");
      setAccount(null);
      setTransactions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const accRes = await axios.get(
          `${API_BASE}/accounts/code/${encodeURIComponent(accountCode)}`,
          { signal: controller.signal }
        );
        if (cancelled) return;

        setAccount(accRes?.data || null);
        await fetchTransactions(controller.signal);
      } catch (e) {
        if (axios.isCancel?.(e)) return;
        console.error("Fetch error:", e);
        if (!cancelled) {
          setAccount(null);
          setTransactions([]);
          setErr(
            e?.response?.data?.detail || e?.message || "Failed to load account/transactions"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCode, page, pageSize, searchTerm]);

  // Fetch COA accounts on mount
  useEffect(() => {
    axios.get(`${API_BASE}/accounts/`).then((res) => setAccountList(res.data));
  }, []);

  // Fetch suppliers
  useEffect(() => {
    axios.get(`${API_BASE}/suppliers/`).then(res => setSupplierList(res.data));
  }, []);

  // Fetch employees
  useEffect(() => {
    axios.get(`${API_BASE}/employees/`).then(res => setEmployeeList(res.data));
  }, []);

  // Fetch payroll periods
  useEffect(() => {
    axios.get(`${API_BASE}/payrolls/periods`).then(res => setPayPeriods(res.data));
  }, []);

  // Fetch unpaid invoices for selected supplier
  useEffect(() => {
    const supplierIds = txForm.lines
      .map(l => l.supplier_id)
      .filter(Boolean);
    supplierIds.forEach(supplierId => {
      if (!unpaidInvoices[supplierId]) {
        axios.get(`${API_BASE}/suppliers/${supplierId}/invoices_summary`)
          .then(res => {
            setUnpaidInvoices(prev => ({
              ...prev,
              [supplierId]: (res.data.invoices || []).filter(inv => inv.balance_due > 0)
            }));
          });
      }
    });
  }, [txForm.lines]);

  // Fetch parties (customers, suppliers, employees)
  useEffect(() => {
    const fetchParties = async () => {
      try {
        const [customers, suppliers, employees] = await Promise.all([
          axios.get(`${API_BASE}/customers`),
          axios.get(`${API_BASE}/suppliers`),
          axios.get(`${API_BASE}/employees`)
        ]);
        // Combine all parties into one list
        const parties = [
          ...customers.data.map(c => ({ id: c.id, name: `Customer: ${c.name}` })),
          ...suppliers.data.map(s => ({ id: s.id, name: `Supplier: ${s.name}` })),
          ...employees.data.map(e => ({ id: e.id, name: `Employee: ${e.name}` }))
        ];
        setPartyList(parties);
      } catch (err) {
        // Handle error
        setPartyList([]);
      }
    };
    fetchParties();
  }, []);

  // Fetch documents for a party (customer, supplier, employee)
  const fetchDocumentsForParty = async (partyId, partyType) => {
    let url = "";
    if (partyType === "customer") url = `${API_BASE}/customers/${partyId}/unpaid-invoices`;
    if (partyType === "supplier") url = `${API_BASE}/suppliers/${partyId}/unpaid-purchases`;
    if (partyType === "employee") url = `${API_BASE}/employees/${partyId}/unpaid-payrolls`;
    if (!url) return [];
    const res = await axios.get(url);
    // Return as [{id, label}]
    return res.data.map(doc => ({
      id: doc.id,
      label: doc.reference || doc.description || `ID: ${doc.id}`,
    }));
  };

  // -------- actions --------
  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setSearchTerm(e.target.search.value || "");
  };

  // Import CSV
  const handleImport = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      formData.append("account_code", accountCode); // backend expects account_code

      const { data } = await axios.post(`${API_BASE}/bank_transactions/import`, formData);
      setImportFile(null);
      setImportSummary(data); // { imported, errors }
      await fetchTransactions();
    } catch (e) {
      console.error(e);
      setModalErr("Import failed");
    }
  };

  // Add transaction (account determined by account_code)
  const handleAddSubmit = async () => {
    try {
      await axios.post(`${API_BASE}/bank_transactions/code/`, {
        account_code: accountCode,
        ...txForm,
        amount: parseFloat(txForm.amount),
      });
      await fetchTransactions();
      setShowAddModal(false);
      setTxForm(initialTxForm);
      setModalErr("");
    } catch (e) {
      console.error(e);
      setModalErr("Failed to add transaction");
    }
  };

  // Edit transaction
  const handleEditSubmit = async () => {
    try {
      await axios.put(`${API_BASE}/bank_transactions/${editTx.id}`, {
        date: txForm.date,
        type: txForm.type,
        amount: parseFloat(txForm.amount),
        reference: txForm.reference,
        narration: txForm.narration,
        counter_account_id: txForm.counter_account_id,
      });
      setShowAddModal(false);
      setEditTx(null);
      fetchTransactions();
    } catch (err) {
      setModalErr("Failed to edit transaction");
    }
  };

  // Delete transaction
  const handleDelete = async (id) => {
    if (!id) return;
    if (!window.confirm("Are you sure you want to delete this transaction?")) return;
    try {
      await axios.delete(`${API_BASE}/bank_transactions/${id}`);
      setTransactions((prev) => prev.filter((tx) => tx.id !== id));
    } catch (e) {
      console.error("Delete transaction error:", e);
      setErr(e?.response?.data?.detail || e?.message || "Failed to delete transaction");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Batch actions
  const [selectedTxIds, setSelectedTxIds] = useState([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTargetAccount, setMoveTargetAccount] = useState(null);

  // Checkbox handler for transactions
  const handleSelectTx = (id) => {
    setSelectedTxIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Batch move handler
  const handleBatchMove = async () => {
    if (!moveTargetAccount || selectedTxIds.length === 0) return;
    await axios.post(`${API_BASE}/bank_transactions/transactions/batch_move/`, {
      transaction_ids: selectedTxIds,
      target_account_id: moveTargetAccount,
    });
    setSelectedTxIds([]);
    setShowMoveModal(false);
    setMoveTargetAccount(null);
    await fetchTransactions();
  };

  // Batch delete handler
  const handleBatchDelete = async () => {
    if (selectedTxIds.length === 0) return;
    if (!window.confirm("Delete selected transactions? This cannot be undone.")) return;
    try {
      // Send individual delete requests (or create a batch endpoint if needed)
      await Promise.all(
        selectedTxIds.map(id =>
          axios.delete(`${API_BASE}/bank_transactions/${id}`)
        )
      );
      setSelectedTxIds([]);
      await fetchTransactions();
    } catch (e) {
      setErr("Batch delete failed");
    }
  };

  return (
    <div className="px-4 py-8 w-full">
      <Link to="/bank-balances" className="text-blue-600 underline mb-4 inline-block">
        &larr; Back to Bank & Cash Accounts
      </Link>

      <h2 className="text-2xl font-bold mb-4">Bank Account Transactions</h2>

      {err && <div className="text-red-600 mb-2">{err}</div>}
      {loading && <div>Loading...</div>}

      {account && (
        <div className="mb-4">
          <div>
            <strong>Account:</strong> {account.name} ({account.account_code})
          </div>
          <div>
            <strong>Type:</strong> {account.type}
          </div>
        </div>
      )}

      <form onSubmit={handleSearch} className="mb-4 flex items-center gap-2">
        <input
          type="text"
          name="search"
          placeholder="Search transactions..."
          className="border px-2 py-1 rounded"
          defaultValue={searchTerm}
        />
        <button type="submit" className="bg-blue-600 text-white px-4 py-1 rounded">
          Search
        </button>
      </form>

      {/* Top action buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {/* Import */}
        <form onSubmit={handleImport} className="flex items-center gap-2">
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setImportFile(e.target.files?.[0] || null)}
            className="text-sm"
            required
          />
          <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
            Import CSV
          </button>
        </form>

        {/* Export */}
        <a
          href={
            account
              ? `${API_BASE}/bank_transactions/export/?account_id=${account.id}`
              : "#"
          }
          className="bg-green-600 text-white px-3 py-1 rounded text-sm"
          onClick={(e) => { if (!account) e.preventDefault(); }}
          download
        >
          Export CSV
        </a>

        {/* Add */}
        <button
          onClick={() => {
            setShowAddModal(true);
            setEditTx(null);
            setTxForm(initialTxForm);
          }}
          className="bg-blue-700 text-white px-3 py-1 rounded text-sm"
        >
          + Add Transaction
        </button>

        {/* Batch Delete */}
        <button
          className="px-3 py-1 border rounded bg-red-600 text-white text-sm"
          onClick={handleBatchDelete}
          disabled={selectedTxIds.length === 0}
        >
          Batch Delete
        </button>

        {/* Move Selected */}
        <button
          className="px-3 py-1 border rounded bg-yellow-600 text-white text-sm"
          onClick={() => setShowMoveModal(true)}
          disabled={selectedTxIds.length === 0}
        >
          Move Selected
        </button>
      </div>

      {/* Table fills the screen */}
      <div className="overflow-x-auto w-full">
        <table className="w-full border text-sm">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={
                    selectedTxIds.length === transactions.length && transactions.length > 0
                  }
                  onChange={() => {
                    if (selectedTxIds.length === transactions.length) {
                      setSelectedTxIds([]);
                    } else {
                      setSelectedTxIds(transactions.map((tx) => tx.id));
                    }
                  }}
                />
              </th>
              <th className="px-4 py-2 border">Date</th>
              <th className="px-4 py-2 border">Reference</th>
              <th className="px-4 py-2 border">Narration</th>
              <th className="px-4 py-2 border text-right">Amount</th>
              <th className="px-4 py-2 border text-right">Running Balance</th>
              <th className="px-4 py-2 border">Actions</th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
  {transactions && transactions.length > 0 ? (
    transactions.map((tx) => (
      <tr key={tx.id ?? `${tx.reference}-${tx.date}-${Math.random()}`}>
        <td>
          <input
            type="checkbox"
            checked={selectedTxIds.includes(tx.id)}
            onChange={() => handleSelectTx(tx.id)}
          />
        </td>
        <td className="px-4 py-2 border">{safeDate(tx?.date)}</td>
        <td className="px-4 py-2 border">{tx?.reference ?? ""}</td>
        <td className="px-4 py-2 border">{tx?.narration ?? ""}</td>
        <td
          className={`px-4 py-2 border text-right font-bold ${
            tx.type === "withdrawal" ? "text-red-600" : "text-black"
          }`}
        >
          {typeof tx?.amount === "number" ? tx.amount.toLocaleString() : ""}
        </td>
        <td className="px-4 py-2 border text-right">
          {typeof tx?.running_balance === "number"
            ? tx.running_balance.toLocaleString()
            : ""}
        </td>
        <td className="px-4 py-2 border">
          <div className="flex gap-3">
            <button
              className="text-blue-600 underline text-xs"
              onClick={() => {
                setEditTx(tx);
                setTxForm({
                  date: tx.date?.slice(0, 10) || "",
                  type: tx.type || "deposit",
                  amount: tx.amount ?? "",
                  reference: tx.reference || "",
                  narration: tx.narration || "",
                  counter_account_id: tx.counter_account_id || "",
                  lines: Array.isArray(tx.lines) ? tx.lines : [],
                });
                setShowAddModal(false);
              }}
            >
              Edit
            </button>
            <button
              className="text-red-600 underline text-xs"
              onClick={() => handleDelete(tx.id)}
            >
              Delete
            </button>
          </div>
        </td>
        <td>
          {tx.counter_account_name
            ? `${tx.counter_account_name} (${tx.counter_account_code})`
            : "Suspense"}
        </td>
      </tr>
    ))
  ) : (
    <tr>
      <td colSpan={8} className="text-center py-4">
        No transactions found.
      </td>
    </tr>
  )}
</tbody>
        </table>
      </div>

      <div className="flex justify-between items-center mt-4">
        <button
          className="px-3 py-1 border rounded"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          className="px-3 py-1 border rounded"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Next
        </button>
      </div>

      {/* Transaction modal (add/edit) */}
      {(showAddModal || editTx) && (
        <TransactionModal
          txForm={txForm}
          setTxForm={setTxForm}
          accountList={accountList}
          partyList={partyList}
          fetchDocumentsForParty={fetchDocumentsForParty}
          onSave={editTx ? handleEditSubmit : handleAddSubmit}
          onCancel={() => {
            setShowAddModal(false);
            setEditTx(null);
            setTxForm(initialTxForm);
            setModalErr("");
          }}
        />
      )}

      {/* Import summary (matches backend shape) */}
      {importSummary && (
        <div className="bg-gray-100 border p-4 rounded my-4">
          <h3 className="font-bold mb-2">Import Summary</h3>
          <div>Imported: {importSummary.imported ?? 0}</div>
          {Array.isArray(importSummary.errors) && importSummary.errors.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-red-600">Error details</summary>
              <ul className="list-disc ml-6 text-sm">
                {importSummary.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* Move selected transactions modal */}
      {showMoveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg w-full max-w-3xl">
            <h2 className="text-lg font-bold mb-4">Move Transactions</h2>
            <div className="mb-2">
              <label className="block mb-1">Target Account</label>
              <Select
                options={accountList.map(acc => ({
                  value: acc.id,
                  label: `${acc.account_code} - ${acc.name}`,
                }))}
                value={accountList.find(acc => acc.id === moveTargetAccount)
                  ? {
                      value: moveTargetAccount,
                      label: accountList.find(acc => acc.id === moveTargetAccount).name,
                    }
                  : null}
                onChange={option =>
                  setMoveTargetAccount(option ? option.value : null)
                }
                isClearable
                placeholder="Select account..."
              />
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                onClick={() => setShowMoveModal(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-4 py-2 bg-green-600 text-white rounded"
                disabled={!moveTargetAccount}
                onClick={handleBatchMove}
              >
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      <Outlet />
    </div>
  );
};



export default BankAccountDetail;
