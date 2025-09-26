import React, { useState } from "react";
import Select from "react-select";

const TransactionModal = ({
  txForm,
  setTxForm,
  accountList,
  partyList,
  fetchDocumentsForParty, // <-- Add this prop
  onSave,
  onCancel,
}) => {
  const [splitMode, setSplitMode] = useState(
    Array.isArray(txForm.lines) && txForm.lines.length > 0
  );

  const splitTotal = (txForm.lines || []).reduce(
    (sum, l) => sum + (parseFloat(l.amount) || 0),
    0
  );

  const handleLineChange = (idx, field, value) => {
    const newLines = [...(txForm.lines || [])];
    newLines[idx] = { ...newLines[idx], [field]: value };
    setTxForm({ ...txForm, lines: newLines });
  };

  const handleAddLine = () => {
    setTxForm({
      ...txForm,
      lines: [
        ...(txForm.lines || []),
        { account_id: "", party_id: "", amount: "" },
      ],
    });
  };

  const handleRemoveLine = (idx) => {
    const newLines = [...(txForm.lines || [])];
    newLines.splice(idx, 1);
    setTxForm({ ...txForm, lines: newLines });
  };

  const handleToggleMode = () => {
    if (splitMode) {
      setTxForm({ ...txForm, lines: undefined });
    } else {
      setTxForm({
        ...txForm,
        lines: [
          {
            account_id: txForm.counter_account_id || "",
            party_id: "",
            amount: txForm.amount || "",
          },
        ],
      });
    }
    setSplitMode(!splitMode);
  };

  // Store documents for each line
  const [lineDocuments, setLineDocuments] = useState({}); // { idx: [documents] }
  const [singleDocuments, setSingleDocuments] = useState([]);

  // Helper to get party type from party name (assuming prefix)
  const getPartyType = (partyName) => {
    if (partyName.startsWith("Customer:")) return "customer";
    if (partyName.startsWith("Supplier:")) return "supplier";
    if (partyName.startsWith("Employee:")) return "employee";
    return "";
  };

  // Example mapping, adjust as needed for your account codes/names
  const accountPartyTypeMap = {
    "Employee clearing account": "employee",
    "Accounts receivable": "customer",
    "Accounts payable": "supplier",
    // Add more mappings as needed
  };

  const getPartyTypeForAccount = (accountId) => {
    const account = accountList.find((acc) => acc.id === accountId);
    if (!account) return null;
    // You can use account.name or account.account_code for mapping
    return accountPartyTypeMap[account.name] || null;
  };

  // When party changes in split mode, fetch documents
  const handlePartyChange = async (idx, partyId) => {
    handleLineChange(idx, "party_id", partyId);
    const party = partyList.find((p) => p.id === partyId);
    if (party) {
      const partyType = getPartyType(party.name);
      const docs = await fetchDocumentsForParty(partyId, partyType);
      setLineDocuments((prev) => ({ ...prev, [idx]: docs }));
      handleLineChange(idx, "document_id", ""); // reset document selection
    }
  };

  // When party changes in single mode, fetch documents
  const handleSinglePartyChange = async (partyId) => {
    setTxForm({ ...txForm, party_id: partyId });
    const party = partyList.find((p) => p.id === partyId);
    if (party) {
      const partyType = getPartyType(party.name);
      const docs = await fetchDocumentsForParty(partyId, partyType);
      setSingleDocuments(docs);
      setTxForm({ ...txForm, party_id: partyId, document_id: "" });
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-full max-w-4xl">
        <h2 className="text-lg font-bold mb-4">Edit Transaction</h2>
        <div className="mb-2">
          <label className="block mb-1">Date</label>
          <input
            type="date"
            value={txForm.date}
            onChange={(e) => setTxForm({ ...txForm, date: e.target.value })}
            className="border p-2 rounded w-full"
          />
        </div>
        <div className="mb-2">
          <label className="block mb-1">Type</label>
          <select
            value={txForm.type}
            onChange={(e) => setTxForm({ ...txForm, type: e.target.value })}
            className="border p-2 rounded w-full"
          >
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
        </div>
        <div className="mb-2">
          <label className="block mb-1">Amount</label>
          <input
            type="number"
            value={txForm.amount}
            onChange={(e) => setTxForm({ ...txForm, amount: e.target.value })}
            className="border p-2 rounded w-full"
          />
        </div>
        <div className="mb-2">
          <label className="block mb-1">Reference</label>
          <input
            type="text"
            value={txForm.reference}
            onChange={(e) => setTxForm({ ...txForm, reference: e.target.value })}
            className="border p-2 rounded w-full"
          />
        </div>
        <div className="mb-2">
          <label className="block mb-1">Narration</label>
          <input
            type="text"
            value={txForm.narration}
            onChange={(e) => setTxForm({ ...txForm, narration: e.target.value })}
            className="border p-2 rounded w-full"
          />
        </div>
        <button
          type="button"
          onClick={handleToggleMode}
          className="mb-4 px-3 py-1 bg-gray-200 rounded"
        >
          {splitMode ? "Switch to Single Account" : "Switch to Split"}
        </button>

        {splitMode ? (
          <div className="mb-2">
            <label className="block mb-1">Split Lines</label>
            <table className="w-full mb-2">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Party</th>
                  <th>Invoice/Payroll</th>
                  <th>Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(txForm.lines || []).map((line, idx) => {
                  // Filter party list based on selected account
                  const partyType = getPartyTypeForAccount(line.account_id);
                  const filteredPartyList = partyType
                    ? partyList.filter((p) =>
                        p.name.startsWith(
                          partyType.charAt(0).toUpperCase() + partyType.slice(1) + ":"
                        )
                      )
                    : partyList;

                  return (
                    <tr key={idx}>
                      <td>
                        <Select
                          options={accountList.map((acc) => ({
                            value: acc.id,
                            label: `${acc.account_code} - ${acc.name}`,
                          }))}
                          value={accountList.find((acc) => acc.id === line.account_id)
                            ? {
                                value: line.account_id,
                                label: accountList.find((acc) => acc.id === line.account_id).name,
                              }
                            : null}
                          onChange={(option) =>
                            handleLineChange(idx, "account_id", option ? option.value : "")
                          }
                          isClearable
                          placeholder="Account"
                        />
                      </td>
                      <td>
                        <Select
                          options={filteredPartyList.map((party) => ({
                            value: party.id,
                            label: party.name,
                          }))}
                          value={filteredPartyList.find((p) => p.id === line.party_id)
                            ? {
                                value: line.party_id,
                                label: filteredPartyList.find((p) => p.id === line.party_id).name,
                              }
                            : null}
                          onChange={(option) =>
                            handlePartyChange(idx, option ? option.value : "")
                          }
                          isClearable
                          placeholder="Customer/Supplier/Employee"
                          isDisabled={!line.account_id}
                        />
                      </td>
                      <td>
                        <Select
                          options={(lineDocuments[idx] || []).map((doc) => ({
                            value: doc.id,
                            label: doc.label,
                          }))}
                          value={
                            line.document_id
                              ? {
                                  value: line.document_id,
                                  label:
                                    (lineDocuments[idx] || []).find(
                                      (d) => d.id === line.document_id
                                    )?.label || "",
                                }
                              : null
                          }
                          onChange={(option) =>
                            handleLineChange(idx, "document_id", option ? option.value : "")
                          }
                          isClearable
                          placeholder="Select Invoice/Payroll"
                          isDisabled={!line.party_id}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          value={line.amount}
                          onChange={(e) => handleLineChange(idx, "amount", e.target.value)}
                          className="border p-2 rounded w-24"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="text-red-600 px-2"
                          onClick={() => handleRemoveLine(idx)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <button
              type="button"
              className="bg-blue-600 text-white px-2 py-1 rounded text-xs"
              onClick={handleAddLine}
            >
              + Add Line
            </button>
            <div className="mt-2">
              <strong>Split Total:</strong> {splitTotal}
              <span style={{ marginLeft: 16 }}>
                <strong>Difference:</strong> {parseFloat(txForm.amount || 0) - splitTotal}
              </span>
            </div>
            {Math.abs(parseFloat(txForm.amount || 0) - splitTotal) > 0.001 && (
              <div className="text-red-600 font-bold mb-2">
                The split lines total does not match the transaction amount!
              </div>
            )}
          </div>
        ) : (
          <div className="mb-2 flex gap-2">
            <div className="flex-1">
              <label className="block mb-1">Account</label>
              <Select
                options={accountList.map((acc) => ({
                  value: acc.id,
                  label: `${acc.account_code} - ${acc.name}`,
                }))}
                value={accountList.find((acc) => acc.id === txForm.counter_account_id)
                  ? {
                      value: txForm.counter_account_id,
                      label: accountList.find((acc) => acc.id === txForm.counter_account_id).name,
                    }
                  : null}
                onChange={(option) =>
                  setTxForm({ ...txForm, counter_account_id: option ? option.value : "" })
                }
                isClearable
                placeholder="Select account..."
              />
            </div>
            <div className="flex-1">
              <label className="block mb-1">Party</label>
              {(() => {
                // Filter party list based on selected account
                const partyType = getPartyTypeForAccount(txForm.counter_account_id);
                const filteredPartyList = partyType
                  ? partyList.filter((p) =>
                      p.name.startsWith(
                        partyType.charAt(0).toUpperCase() + partyType.slice(1) + ":"
                      )
                    )
                  : partyList;
                return (
                  <Select
                    options={filteredPartyList.map((party) => ({
                      value: party.id,
                      label: party.name,
                    }))}
                    value={filteredPartyList.find((p) => p.id === txForm.party_id)
                      ? {
                          value: txForm.party_id,
                          label: filteredPartyList.find((p) => p.id === txForm.party_id).name,
                        }
                      : null}
                    onChange={(option) =>
                      handleSinglePartyChange(option ? option.value : "")
                    }
                    isClearable
                    placeholder="Customer/Supplier/Employee"
                    isDisabled={!txForm.counter_account_id}
                  />
                );
              })()}
            </div>
            <div className="flex-1">
              <label className="block mb-1">Invoice/Payroll</label>
              <Select
                options={singleDocuments.map((doc) => ({
                  value: doc.id,
                  label: doc.label,
                }))}
                value={
                  txForm.document_id
                    ? {
                        value: txForm.document_id,
                        label:
                          singleDocuments.find((d) => d.id === txForm.document_id)?.label || "",
                      }
                    : null
                }
                onChange={(option) =>
                  setTxForm({ ...txForm, document_id: option ? option.value : "" })
                }
                isClearable
                placeholder="Select Invoice/Payroll"
                isDisabled={!txForm.party_id}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-500 text-white rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(txForm)}
            disabled={
              splitMode &&
              Math.abs(parseFloat(txForm.amount || 0) - splitTotal) > 0.001
            }
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};

export default TransactionModal;