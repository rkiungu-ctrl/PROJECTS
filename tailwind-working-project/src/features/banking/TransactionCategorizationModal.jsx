import React, { useState, useEffect } from "react";

export default function TransactionCategorizationModal({ open, onClose, transaction, onSuccess }) {
  const [formData, setFormData] = useState({
    category: transaction?.category || "Uncategorised",
    ledger_account_id: transaction?.ledger_account_id || "",
    payee_type: transaction?.payee_type || "",
    payee_id: transaction?.payee_id || "",
    category_notes: transaction?.category_notes || "",
  });

  const [accounts, setAccounts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState(null);

  useEffect(() => {
    if (open && transaction) {
      setFormData({
        category: transaction.category || "Uncategorised",
        ledger_account_id: transaction.ledger_account_id || "",
        payee_type: transaction.payee_type || "",
        payee_id: transaction.payee_id || "",
        category_notes: transaction.category_notes || "",
      });
      fetchAccounts();
    }
  }, [open, transaction]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch("http://localhost:8000/accounts/");
      if (res.ok) {
        const data = await res.json();
        setAccounts(data);
      }
    } catch (err) {
      console.error("Failed to fetch accounts", err);
    }
  };

  const fetchEntities = async (type) => {
    try {
      let url = "";
      if (type === "customer") url = "http://localhost:8000/customers/simple-list";
      else if (type === "supplier") url = "http://localhost:8000/suppliers/simple-list";
      else if (type === "employee") url = "http://localhost:8000/employees/simple-list";

      if (url) {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (type === "customer") setCustomers(data);
          else if (type === "supplier") setSuppliers(data);
          else if (type === "employee") setEmployees(data);
        }
      }
    } catch (err) {
      console.error(`Failed to fetch ${type}s`, err);
    }
  };

  const handleLedgerAccountChange = (accountId) => {
    const account = accounts.find(a => a.id === parseInt(accountId));
    setSelectedAccount(account);

    setFormData(prev => ({
      ...prev,
      ledger_account_id: accountId,
      payee_type: account?.linked_entity_type || "",
      payee_id: "", // Reset payee when account changes
    }));

    // Fetch entities if account has linked_entity_type
    if (account?.linked_entity_type) {
      fetchEntities(account.linked_entity_type);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`http://localhost:8000/bank/transactions/${transaction.id}/categorise`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        onSuccess?.();
        onClose();
      } else {
        alert("Failed to categorize transaction");
      }
    } catch (err) {
      console.error("Categorization failed", err);
      alert("Failed to categorize transaction");
    } finally {
      setLoading(false);
    }
  };

  if (!open || !transaction) return null;

  const getPayeeOptions = () => {
    if (formData.payee_type === "customer") return customers;
    if (formData.payee_type === "supplier") return suppliers;
    if (formData.payee_type === "employee") return employees;
    return [];
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Categorize Transaction</h2>
          <button onClick={onClose} className="px-2 py-1 text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-1">Category</label>
            <select
              value={formData.category}
              onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
              className="w-full border rounded px-3 py-2"
              required
            >
              <option value="Payment">Payment</option>
              <option value="Receipt">Receipt</option>
              <option value="Transfer">Transfer</option>
              <option value="Uncategorised">Uncategorised</option>
            </select>
          </div>

          {/* Ledger Account */}
          <div>
            <label className="block text-sm font-medium mb-1">Ledger Account</label>
            <select
              value={formData.ledger_account_id}
              onChange={(e) => handleLedgerAccountChange(e.target.value)}
              className="w-full border rounded px-3 py-2"
            >
              <option value="">Select Account</option>
              {accounts.map(account => (
                <option key={account.id} value={account.id}>
                  {account.account_code} - {account.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payee Type - Auto-filled based on account */}
          {formData.payee_type && (
            <div>
              <label className="block text-sm font-medium mb-1">Payee Type</label>
              <input
                type="text"
                value={formData.payee_type}
                readOnly
                className="w-full border rounded px-3 py-2 bg-gray-50"
              />
            </div>
          )}

          {/* Payee Dropdown - Only show if payee_type is set */}
          {formData.payee_type && (
            <div>
              <label className="block text-sm font-medium mb-1">Payee</label>
              <select
                value={formData.payee_id}
                onChange={(e) => setFormData(prev => ({ ...prev, payee_id: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              >
                <option value="">Select Payee</option>
                {getPayeeOptions().map(entity => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Category Notes */}
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={formData.category_notes}
              onChange={(e) => setFormData(prev => ({ ...prev, category_notes: e.target.value }))}
              className="w-full border rounded px-3 py-2"
              rows={3}
              placeholder="Optional notes..."
            />
          </div>

          {/* Transaction Info */}
          <div className="bg-gray-50 p-3 rounded text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><strong>Date:</strong> {transaction.date}</div>
              <div><strong>Amount:</strong> {transaction.amount}</div>
              <div><strong>Reference:</strong> {transaction.reference || "-"}</div>
              <div><strong>Description:</strong> {transaction.narration || "-"}</div>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}