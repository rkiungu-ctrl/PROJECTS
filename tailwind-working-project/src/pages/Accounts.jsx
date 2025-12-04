import React, { useEffect, useState, useRef, useMemo } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

const typeOrder = {
  Asset: 1,
  Liability: 2,
  Equity: 3,
  Income: 4,
  Expense: 5,
};

import { API_BASE } from "../lib/api";

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [accountCode, setAccountCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState("Asset");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [parentAccountCode, setParentAccountCode] = useState("");
  const [allAccounts, setAllAccounts] = useState([]);
  const [isPhysical, setIsPhysical] = useState(false);
  const [collapsed, setCollapsed] = useState({}); // account_code -> boolean
  const fileInput = useRef();

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await axios.get(`${API_BASE}/accounts/`);
      setAccounts(res.data || []);
      setAllAccounts(res.data || []);
    } catch (e) {
      console.error(e);
      setError("Failed to load accounts");
    }
  };

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(accounts);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ChartOfAccounts");
    XLSX.writeFile(wb, "chart_of_accounts.xlsx");
  };

  const resetForm = () => {
    setAccountCode("");
    setName("");
    setType("Asset");
    setParentAccountCode("");
    setError("");
    setSuccess("");
    setIsPhysical(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!accountCode || !name || !type) {
      setError("All fields are required");
      return;
    }

    try {
      if (isEditing) {
        await axios.put(`${API_BASE}/accounts/code/${accountCode}`, {
          name,
          type,
          parent_account_code: parentAccountCode || null,
          is_physical: isPhysical,
        });
        setSuccess("Account updated");
      } else {
        await axios.post(`${API_BASE}/accounts/`, {
          account_code: accountCode,
          name,
          type,
          parent_account_code: parentAccountCode || null,
          is_physical: isPhysical,
        });
        setSuccess("Account created");
      }

      resetForm();
      setShowForm(false);
      setIsEditing(false);
      fetchAccounts();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Request failed");
    }
  };

  const handleEdit = (acc) => {
    setShowForm(true);
    setIsEditing(true);
    setError("");
    setSuccess("");

    setAccountCode(String(acc.account_code));
    setName(acc.name || "");
    setType(acc.type || "Asset");
    setParentAccountCode(acc.parent_account_code ? String(acc.parent_account_code) : "");
    setIsPhysical(acc.is_physical || false);
  };

  const handleDelete = async (code) => {
    if (!window.confirm(`Delete account ${code}?`)) return;
    try {
      await axios.delete(`${API_BASE}/accounts/code/${code}`);
      setSuccess("Account deleted");
      fetchAccounts();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.detail || "Delete failed");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await axios.post(`${API_BASE}/accounts/import/`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert(`Imported: ${res.data.imported}\nErrors:\n${(res.data.errors || []).join("\n")}`);
      fetchAccounts();
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      console.error(err);
      alert("Import failed");
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "account_code",
      "name",
      "type",
      "description",
      "is_active",
      "is_control_account",
      "parent_account_code",
    ];
    const sample = [
      {
        account_code: "1110",
        name: "Cash & Cash Equivalents",
        type: "Asset",
        description: "",
        is_active: "true",
        is_control_account: "true",
        parent_account_code: "1100",
      },
      {
        account_code: "1111",
        name: "Petty Cash",
        type: "Asset",
        description: "",
        is_active: "true",
        is_control_account: "false",
        parent_account_code: "1110",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sample, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "AccountsTemplate");
    XLSX.writeFile(wb, "accounts_import_template.xlsx");
  };

  // ---------- helpers ----------
  const codeIndex = useMemo(() => {
    const idx = {};
    (accounts || []).forEach((a) => {
      idx[String(a.account_code)] = a;
    });
    return idx;
  }, [accounts]);

  function getPathLabel(code) {
    const seen = new Set();
    const parts = [];
    let cur = codeIndex[String(code)];
    let guard = 0;
    while (cur && guard < 20 && !seen.has(cur.account_code)) {
      parts.unshift(cur.name);
      seen.add(cur.account_code);
      const parentCode = cur.parent_account_code ? String(cur.parent_account_code) : "";
      cur = parentCode ? codeIndex[parentCode] : null;
      guard++;
    }
    return parts.join(" › ");
  }

  function buildAccountTree(rows) {
    const map = {};
    rows.forEach((acc) => {
      map[String(acc.account_code)] = { ...acc, children: [] };
    });
    const roots = [];
    rows.forEach((acc) => {
      const parentCode = acc.parent_account_code ? String(acc.parent_account_code) : "";
      if (parentCode && map[parentCode]) {
        map[parentCode].children.push(map[String(acc.account_code)]);
      } else {
        roots.push(map[String(acc.account_code)]);
      }
    });
    const sortRec = (nodeList) => {
      nodeList.sort((a, b) =>
        String(a.account_code).localeCompare(String(b.account_code), undefined, { numeric: true })
      );
      nodeList.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
  }

  function toggle(code) {
    setCollapsed((prev) => ({ ...prev, [String(code)]: !prev[String(code)] }));
  }

  function renderAccountRows(acc, level = 0) {
    const hasChildren = acc.children && acc.children.length > 0;
    const isCollapsed = !!collapsed[String(acc.account_code)];
    return (
      <React.Fragment key={String(acc.account_code)}>
        <tr>
          <td className="px-2 py-2 border font-mono" style={{ width: "120px", paddingLeft: `${level * 20}px` }}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(acc.account_code)}
                className="mr-2 inline-flex items-center justify-center w-5 h-5 border rounded text-xs"
                title={isCollapsed ? "Expand" : "Collapse"}
              >
                {isCollapsed ? "▸" : "▾"}
              </button>
            ) : (
              <span className="mr-2 inline-block w-5" />
            )}
            {acc.account_code}
          </td>
          <td className="px-2 py-2 border" style={{ width: "300px" }} title={getPathLabel(acc.account_code)}>
            {acc.name}
          </td>
          <td className="px-2 py-2 border text-right" style={{ width: "120px" }}>
            {!hasChildren && acc.balance !== undefined && acc.balance !== null
              ? Number(acc.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : ""}
          </td>
          <td className="px-1 py-2 border text-right" style={{ width: "90px" }}>
            <button className="bg-yellow-500 text-xs px-1 py-1 rounded mr-1" onClick={() => handleEdit(acc)}>
              Edit
            </button>
            <button className="bg-red-600 text-xs px-1 py-1 rounded" onClick={() => handleDelete(acc.account_code)}>
              Delete
            </button>
          </td>
        </tr>
        {!isCollapsed && hasChildren && acc.children.map((child) => renderAccountRows(child, level + 1))}
      </React.Fragment>
    );
  }

  // ---------- Filter & group ----------
  const filtered = accounts
    .filter((a) => !a.is_physical)
    .filter((a) => `${a.account_code} ${a.name} ${a.type}`.toLowerCase().includes(search.toLowerCase()));

  const groupedByType = useMemo(() => {
    const g = {};
    filtered.forEach((curr) => {
      g[curr.type] = g[curr.type] || [];
      g[curr.type].push(curr);
    });
    return g;
  }, [filtered]);

  // Prebuild trees by type to avoid recomputing
  const treesByType = useMemo(() => {
    const t = {};
    Object.keys(groupedByType).forEach((typ) => {
      t[typ] = buildAccountTree(groupedByType[typ]);
    });
    return t;
  }, [groupedByType]);

  // Left: Balance Sheet, Right: Income Statement
  const leftTypes = ["Asset", "Liability", "Equity"];
  const rightTypes = ["Income", "Expense"];

  function renderTypeSection(typeLabel) {
    const tree = treesByType[typeLabel] || [];
    if (tree.length === 0) return null;
    return (
      <div key={typeLabel} className="mb-6">
        <h3 className="font-bold text-lg bg-gray-100 p-2">{typeLabel}</h3>
        <table className="min-w-full border mb-4 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-2 py-2 border text-left" style={{ width: "120px" }}>Code</th>
              <th className="px-2 py-2 border text-left" style={{ width: "300px" }}>Name</th>
              <th className="px-2 py-2 border text-right" style={{ width: "120px" }}>Balance</th>
              <th className="px-1 py-2 border text-right" style={{ width: "90px" }}>Actions</th>
            </tr>
          </thead>
          <tbody>{tree.map((acc) => renderAccountRows(acc))}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Chart of Accounts</h2>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          type="text"
          placeholder="Search accounts..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 flex-1 min-w-[220px]"
        />
        <button onClick={handleExport} className="bg-green-600 text-white px-3 py-2 rounded">
          Export to Excel
        </button>
        <button
          onClick={() => {
            setShowForm((s) => !s);
            setIsEditing(false);
            resetForm();
          }}
          className="bg-blue-600 text-white px-3 py-2 rounded"
        >
          {showForm ? "Cancel" : "Add Account"}
        </button>
        <button onClick={handleDownloadTemplate} className="bg-gray-600 text-white px-3 py-2 rounded">
          Download Import Template
        </button>
        <input
          type="file"
          accept=".csv,.xlsx"
          ref={fileInput}
          onChange={handleImport}
          className="border p-2"
          style={{ maxWidth: 260 }}
        />
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-6 border p-4 rounded bg-gray-50">
          {error && <div className="text-red-600 mb-2">{error}</div>}
          {success && <div className="text-green-600 mb-2">{success}</div>}

          <div className="grid grid-cols-3 gap-4 mb-2">
            <input
              type="text"
              placeholder="Account Code"
              value={accountCode}
              onChange={(e) => setAccountCode(e.target.value)}
              className="border p-2"
              disabled={isEditing}
            />
            <input
              type="text"
              placeholder="Account Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border p-2"
            />
            <select value={type} onChange={(e) => setType(e.target.value)} className="border p-2">
              <option value="Asset">Asset</option>
              <option value="Liability">Liability</option>
              <option value="Equity">Equity</option>
              <option value="Income">Income</option>
              <option value="Expense">Expense</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Parent Account</label>
            <select
              value={parentAccountCode}
              onChange={(e) => setParentAccountCode(e.target.value)}
              className="border rounded p-2 w-full"
            >
              <option value="">No Parent (Top Level)</option>
              {allAccounts.map((acc) => (
                <option key={String(acc.account_code)} value={String(acc.account_code)}>
                  {acc.account_code} - {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="inline-flex items-center">
              <input
                type="checkbox"
                checked={isPhysical}
                onChange={(e) => setIsPhysical(e.target.checked)}
                className="form-checkbox h-5 w-5 text-blue-600"
              />
              <span className="ml-2 text-gray-700">Physical Bank/Cash Account</span>
            </label>
          </div>

          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded">
            {isEditing ? "Update Account" : "Save Account"}
          </button>
        </form>
      )}

      {/* --------- TWO COLUMN LAYOUT --------- */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: Balance Sheet */}
        <div>
          <div className="text-lg font-semibold mb-2">Balance Sheet</div>
          {leftTypes
            .sort((a, b) => (typeOrder[a] || 99) - (typeOrder[b] || 99))
            .map((t) => renderTypeSection(t))}
        </div>

        {/* Right: Income Statement */}
        <div>
          <div className="text-lg font-semibold mb-2">Income Statement</div>
          {rightTypes
            .sort((a, b) => (typeOrder[a] || 99) - (typeOrder[b] || 99))
            .map((t) => renderTypeSection(t))}
        </div>
      </div>
    </div>
  );
};

export default Accounts;
