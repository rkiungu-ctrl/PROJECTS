// src/pages/Reports.jsx
import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import * as XLSX from "xlsx";

import { API_BASE } from "../lib/api";

const ReportType = {
  PL: "Profit & Loss",
  BS: "Balance Sheet",
  TB: "Trial Balance",
  GL: "General Ledger",
};

export default function Reports() {
  const [report, setReport] = useState(ReportType.PL);

  // PATCH: Add state for new filters
  const [accountGroup, setAccountGroup] = useState("");
  const [tag, setTag] = useState("");
  const [project, setProject] = useState("");

  // common filters
  const [start, setStart] = useState(() => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  // GL specific
  const [glAccountCode, setGlAccountCode] = useState("");
  const [glData, setGlData] = useState(null);

  // data
  const [plData, setPlData] = useState(null);
  const [bsData, setBsData] = useState(null);
  const [tbData, setTbData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const canFetch = useMemo(() => {
    if (report === ReportType.BS) return !!asOf;
    if (report === ReportType.GL) return glAccountCode && start && end;
    return start && end;
  }, [report, start, end, asOf, glAccountCode]);

  const fetchReport = async () => {
    if (!canFetch) return;
    setLoading(true);
    setErr("");
    try {
      if (report === ReportType.PL) {
        const res = await axios.get(`${API_BASE}/reports/profit-and-loss`, { params: { start, end } });
        setPlData(res.data);
      } else if (report === ReportType.BS) {
        const res = await axios.get(`${API_BASE}/reports/balance-sheet`, { params: { as_of: asOf } });
        setBsData(res.data);
      } else if (report === ReportType.TB) {
        const res = await axios.get(`${API_BASE}/reports/trial-balance`, { params: { start, end } });
        setTbData(res.data);
      } else if (report === ReportType.GL) {
        const res = await axios.get(`${API_BASE}/reports/general-ledger`, {
          params: { account_code: glAccountCode, start, end },
        });
        setGlData(res.data);
      }
    } catch (e) {
      setErr(e?.response?.data?.detail || "Failed to fetch report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report]);

  const exportTB = () => {
    if (!tbData?.rows?.length) return;
    const ws = XLSX.utils.json_to_sheet(tbData.rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trial Balance");
    XLSX.writeFile(wb, `trial_balance_${tbData.start || "all"}_${tbData.end || "all"}.xlsx`);
  };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reports</h1>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
        <div className="flex flex-col">
          <label className="text-sm text-gray-600 mb-1">Report</label>
          <select
            value={report}
            onChange={(e) => setReport(e.target.value)}
            className="border rounded px-3 py-2"
          >
            {Object.values(ReportType).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        {/* Date pickers vary by report */}
        {report !== ReportType.BS && (
          <>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">Start</label>
              <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-3 py-2" />
            </div>
            <div className="flex flex-col">
              <label className="text-sm text-gray-600 mb-1">End</label>
              <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded px-3 py-2" />
            </div>
          </>
        )}

        {report === ReportType.BS && (
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">As of</label>
            <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="border rounded px-3 py-2" />
          </div>
        )}

        {report === ReportType.GL && (
          <div className="flex flex-col">
            <label className="text-sm text-gray-600 mb-1">Account Code</label>
            <input
              type="text"
              value={glAccountCode}
              onChange={(e) => setGlAccountCode(e.target.value)}
              placeholder="e.g., 4000"
              className="border rounded px-3 py-2"
            />
          </div>
        )}

        {/* PATCH: Add Account Group, Tag, Project inputs */}
        <input
          placeholder="Account Group"
          value={accountGroup}
          onChange={e => setAccountGroup(e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          placeholder="Tag"
          value={tag}
          onChange={e => setTag(e.target.value)}
          className="border rounded px-3 py-2"
        />
        <input
          placeholder="Project"
          value={project}
          onChange={e => setProject(e.target.value)}
          className="border rounded px-3 py-2"
        />

        <div className="flex gap-2">
          <button
            onClick={fetchReport}
            disabled={loading || !canFetch}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
          >
            {loading ? "Loading..." : "Run"}
          </button>

          {report === ReportType.TB && (
            <button
              onClick={exportTB}
              disabled={!tbData?.rows?.length}
              className="px-4 py-2 rounded border"
            >
              Export TB (Excel)
            </button>
          )}

          {/* PATCH: Add export links for PL and BS */}
          {report === ReportType.PL && (
            <>
              <a
                href={`${API_BASE}/reports/profit-and-loss/export?start=${start}&end=${end}&format=csv`
                  + `&account_group=${encodeURIComponent(accountGroup||"")}`
                  + `&tag=${encodeURIComponent(tag||"")}`
                  + `&project=${encodeURIComponent(project||"")}`}
                className="px-4 py-2 rounded border"
                target="_blank" rel="noreferrer"
              >
                Export P&amp;L (CSV)
              </a>
              <a
                href={`${API_BASE}/reports/profit-and-loss/export?start=${start}&end=${end}&format=pdf`
                  + `&account_group=${encodeURIComponent(accountGroup||"")}`
                  + `&tag=${encodeURIComponent(tag||"")}`
                  + `&project=${encodeURIComponent(project||"")}`}
                className="px-4 py-2 rounded border"
                target="_blank" rel="noreferrer"
              >
                Export P&amp;L (PDF)
              </a>
            </>
          )}

          {report === ReportType.BS && (
            <>
              <a
                href={`${API_BASE}/reports/balance-sheet/export?as_of=${asOf}&format=csv`
                  + `&account_group=${encodeURIComponent(accountGroup||"")}`
                  + `&tag=${encodeURIComponent(tag||"")}`
                  + `&project=${encodeURIComponent(project||"")}`}
                className="px-4 py-2 rounded border"
                target="_blank" rel="noreferrer"
              >
                Export Balance Sheet (CSV)
              </a>
              <a
                href={`${API_BASE}/reports/balance-sheet/export?as_of=${asOf}&format=pdf`
                  + `&account_group=${encodeURIComponent(accountGroup||"")}`
                  + `&tag=${encodeURIComponent(tag||"")}`
                  + `&project=${encodeURIComponent(project||"")}`}
                className="px-4 py-2 rounded border"
                target="_blank" rel="noreferrer"
              >
                Export Balance Sheet (PDF)
              </a>
            </>
          )}
        </div>
      </div>

      {err && <div className="p-3 rounded bg-red-50 border border-red-200 text-red-700">{err}</div>}

      {/* Render sections */}
      {report === ReportType.PL && plData && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Profit &amp; Loss ({plData.start} → {plData.end})</h2>

          <section>
            <h3 className="font-medium mb-2">Income</h3>
            <div className="overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Account</th>
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {plData.income.rows.map(r => (
                    <tr key={r.code} className="border-t">
                      <td className="p-2">{r.code}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-right">{r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-medium">
                    <td className="p-2" colSpan={2}>Total Income</td>
                    <td className="p-2 text-right">{plData.income.total.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h3 className="font-medium mb-2">Expenses</h3>
            <div className="overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">Code</th>
                    <th className="text-left p-2">Account</th>
                    <th className="text-right p-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {plData.expenses.rows.map(r => (
                    <tr key={r.code} className="border-t">
                      <td className="p-2">{r.code}</td>
                      <td className="p-2">{r.name}</td>
                      <td className="p-2 text-right">{r.amount.toLocaleString()}</td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50 font-medium">
                    <td className="p-2" colSpan={2}>Total Expenses</td>
                    <td className="p-2 text-right">{plData.expenses.total.toLocaleString()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <div className="text-right text-lg font-semibold">
            Net Profit: {plData.net_profit.toLocaleString()}
          </div>
        </div>
      )}

      {report === ReportType.BS && bsData && (
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Balance Sheet (as of {bsData.as_of})</h2>

          {["assets", "liabilities", "equity"].map((section) => (
            <section key={section}>
              <h3 className="font-medium mb-2 capitalize">{section}</h3>
              <div className="overflow-auto border rounded">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left p-2">Code</th>
                      <th className="text-left p-2">Account</th>
                      <th className="text-right p-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bsData[section].rows.map((r) => (
                      <tr key={r.code} className="border-t">
                        <td className="p-2">{r.code}</td>
                        <td className="p-2">{r.name}</td>
                        <td className="p-2 text-right">{r.amount.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-medium">
                      <td className="p-2" colSpan={2}>Total {section}</td>
                      <td className="p-2 text-right">{bsData[section].total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <div className="text-right mt-2 text-sm">
            Balance check (Assets − (Liabilities + Equity)):{" "}
            <span className={bsData.balance_check === 0 ? "text-green-600" : "text-red-600"}>
              {bsData.balance_check.toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {report === ReportType.TB && tbData && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Trial Balance ({tbData.start || "beginning"} → {tbData.end || "end"})</h2>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Code</th>
                  <th className="text-left p-2">Account</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Opening</th>
                  <th className="text-right p-2">Debits</th>
                  <th className="text-right p-2">Credits</th>
                  <th className="text-right p-2">Closing</th>
                </tr>
              </thead>
              <tbody>
                {tbData.rows.map((r) => (
                  <tr key={r.account_code} className="border-t">
                    <td className="p-2">{r.account_code}</td>
                    <td className="p-2">{r.account_name}</td>
                    <td className="p-2">{r.type}</td>
                    <td className="p-2 text-right">{r.opening.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.debits.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.credits.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.closing.toLocaleString()}</td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-medium">
                  <td className="p-2" colSpan={4}>Totals</td>
                  <td className="p-2 text-right">{tbData.totals.debits.toLocaleString()}</td>
                  <td className="p-2 text-right">{tbData.totals.credits.toLocaleString()}</td>
                  <td className="p-2"></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {report === ReportType.GL && glData && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">
            General Ledger — {glData.account.code} {glData.account.name} ({glData.start} → {glData.end})
          </h2>
          <div className="text-sm">
            Opening Balance: <span className="font-medium">{glData.opening_balance.toLocaleString()}</span>
          </div>
          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Narration</th>
                  <th className="text-right p-2">Balance</th>
                  <th className="text-right p-2">Credit</th>
                  <th className="text-right p-2">Debit</th>
                  <th className="text-left p-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {glData.rows.map((r, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{r.narration || ""}</td>
                    <td className="p-2 text-right">{r.balance.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.credit.toLocaleString()}</td>
                    <td className="p-2 text-right">{r.debit.toLocaleString()}</td>
                    <td className="p-2">{r.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-sm">
            Closing Balance: <span className="font-medium">{glData.closing_balance.toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}