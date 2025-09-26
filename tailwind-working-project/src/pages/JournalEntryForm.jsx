import React, { useEffect, useState } from "react";
import axios from "axios";
import Select from "react-select";
import { format } from "date-fns";

const JournalEntryForm = () => {
  const [date, setDate] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState([
    { account_code: "", account_label: "", narration: "", debit: 0, credit: 0 },
  ]);
  const [accountOptions, setAccountOptions] = useState([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const response = await axios.get("http://127.0.0.1:8000/accounts/", {
          auth: {
            username: localStorage.getItem("username"),
            password: localStorage.getItem("password"),
          },
        });
        const options = response.data.map((account) => ({
          value: account.account_code,
          label: `${account.account_code} - ${account.name}`,
        }));
        setAccountOptions(options);
      } catch (error) {
        console.error("Error fetching accounts", error);
      }
    };

    fetchAccounts();
  }, []);

  const handleLineChange = (index, field, value) => {
    const newLines = [...lines];
    newLines[index][field] = value;

    if (field === "account") {
      newLines[index]["account_code"] = value.value;
      newLines[index]["account_label"] = value.label;
    }

    setLines(newLines);
  };

  const handleAddLine = () => {
    setLines([
      ...lines,
      { account_code: "", account_label: "", narration: "", debit: 0, credit: 0 },
    ]);
  };

  const handleRemoveLine = (index) => {
    const newLines = [...lines];
    newLines.splice(index, 1);
    setLines(newLines);
  };

  const totalDebit = lines.reduce((sum, line) => sum + parseFloat(line.debit || 0), 0);
  const totalCredit = lines.reduce((sum, line) => sum + parseFloat(line.credit || 0), 0);
  const isBalanced = totalDebit === totalCredit;

  const handleSubmit = async (e) => {
    e.preventDefault();

    const payload = {
      date,
      reference,
      narration,
      lines: lines.map((line) => ({
        account_code: line.account_code,
        narration: line.narration,
        debit: parseFloat(line.debit || 0),
        credit: parseFloat(line.credit || 0),
      })),
    };

    try {
      const response = await axios.post("http://127.0.0.1:8000/journal/entries/", payload, {
        auth: {
          username: localStorage.getItem("username"),
          password: localStorage.getItem("password"),
        },
      });
      setSuccess("Journal entry posted successfully");
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to post journal entry");
      setSuccess("");
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-4 bg-white shadow rounded-lg">
      <h2 className="text-2xl font-bold mb-4">Post Journal Entry</h2>

      {error && <div className="bg-red-100 text-red-800 p-2 rounded mb-3">{error}</div>}
      {success && <div className="bg-green-100 text-green-800 p-2 rounded mb-3">{success}</div>}

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium">Date</label>
            <input
              type="date"
              className="w-full border rounded p-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Reference</label>
            <input
              type="text"
              className="w-full border rounded p-2"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium">Narration</label>
          <textarea
            className="w-full border rounded p-2"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
        </div>

        <table className="w-full border mt-4 mb-4">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Account</th>
              <th className="border p-2">Narration</th>
              <th className="border p-2">Debit</th>
              <th className="border p-2">Credit</th>
              <th className="border p-2">Remove</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="border p-2 w-64">
                  <Select
                    options={accountOptions}
                    value={
                      line.account_code
                        ? { value: line.account_code, label: line.account_label }
                        : null
                    }
                    onChange={(selected) =>
                      handleLineChange(index, "account", selected)
                    }
                    isClearable
                    placeholder="Search account..."
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="text"
                    className="w-full border rounded p-1"
                    value={line.narration}
                    onChange={(e) =>
                      handleLineChange(index, "narration", e.target.value)
                    }
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded p-1"
                    value={line.debit}
                    onChange={(e) =>
                      handleLineChange(index, "debit", e.target.value)
                    }
                  />
                </td>
                <td className="border p-2">
                  <input
                    type="number"
                    step="0.01"
                    className="w-full border rounded p-1"
                    value={line.credit}
                    onChange={(e) =>
                      handleLineChange(index, "credit", e.target.value)
                    }
                  />
                </td>
                <td className="border p-2 text-center">
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(index)}
                    className="text-red-600 hover:underline"
                  >
                    ✖
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50 font-semibold">
            <tr>
              <td colSpan="2" className="border p-2 text-right">
                Totals:
              </td>
              <td className="border p-2">{totalDebit.toFixed(2)}</td>
              <td className="border p-2">{totalCredit.toFixed(2)}</td>
              <td className="border p-2"></td>
            </tr>
          </tfoot>
        </table>

        {!isBalanced && (
          <div className="text-red-600 font-semibold mb-2">
            Debits and Credits must balance!
          </div>
        )}

        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={handleAddLine}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded"
          >
            Add Line
          </button>
          <button
            type="submit"
            className={`px-6 py-2 rounded text-white ${
              isBalanced ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-400 cursor-not-allowed"
            }`}
            disabled={!isBalanced}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
};

export default JournalEntryForm;
