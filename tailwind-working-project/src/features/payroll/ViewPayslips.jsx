// src/pages/ViewPayslips.jsx
import React, { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import EmployeePayslipModal from "../components/EmployeePayslipModal"; // ✅ add

import { API_BASE } from "../lib/api";

function fmt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ViewPayslips() {
  const { period } = useParams(); // can be 'YYYY-MM' or 'YYYY-MM-DD'
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] = useState(null);

  // NEW: payslip modal state
  const [modalRow, setModalRow] = useState(null);

  // normalize for heading
  const prettyPeriod = useMemo(() => {
    try {
      const d = new Date(/^\d{4}-\d{2}$/.test(period) ? `${period}-01` : period);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "long" });
    } catch {
      return period;
    }
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const { data } = await axios.get(`${API_BASE}/payrolls/${period}/payslips`);
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch (e) {
        if (!cancelled) {
          if (e.response?.status === 404) {
            setRows([]);
            setErr("No payslips found for this period.");
          } else if (e.response?.status === 400) {
            setErr("Invalid period format. Use YYYY-MM or YYYY-MM-DD.");
          } else {
            setErr("Failed to load payslips.");
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [period]);

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return alert('No rows selected');
    if (!window.confirm('Delete selected payslips? This cannot be undone.')) return;
    try {
      const ids = Array.from(selected);
      await axios.delete(`${API_BASE}/payrolls/${period}/batch-delete`, { data: { payroll_ids: ids, confirm: true } });
      // refresh
      const { data } = await axios.get(`${API_BASE}/payrolls/${period}/payslips`);
      setRows(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (e) {
      alert('Failed to delete selected');
    }
  };

  const deleteRow = async (payrollId) => {
    if (!window.confirm('Delete this payslip?')) return;
    try {
      await axios.delete(`${API_BASE}/payrolls/${period}/details/${payrollId}`);
      setRows((r) => r.filter(x => x.id !== payrollId));
    } catch (e) {
      alert('Failed to delete');
    }
  };

  // REPLACED: open modal instead of new tab
  const viewPayslip = (row) => {
    const p = (/^\d{4}-\d{2}$/.test(period)) ? `${period}-01` : period;
    // ensure we keep the payroll id and normalized period
    setModalRow({ ...row, period: p, payroll_id: row.id });
  };

  const totals = useMemo(() => {
    const t = {
      basic: 0, house: 0, transport: 0, other: 0, comm: 0, bonus: 0,
      gross: 0, nssf: 0, shif: 0, ahl: 0, paye: 0, noncash: 0,
      loan: 0, advance: 0, net: 0,
    };
    rows.forEach(r => {
      t.basic += +r.basic_salary || 0;
      t.house += +r.house_allowance || 0;
      t.transport += +r.transport_allowance || 0;
      t.other += +r.other_allowances || 0;
      t.comm += +r.commission || 0;
      t.bonus += +r.bonus || 0;
      t.gross += +r.gross_pay || 0;
      t.nssf += +r.nssf || 0;
      t.shif += +r.shif || 0;
      t.ahl += +r.ahl || 0;
      t.paye += +r.paye || 0;
      t.noncash += +r.non_cash_benefit || 0;
      t.loan += +r.loan || 0;
      t.advance += +r.advance || 0;
      t.net += +r.net_pay || 0;
    });
    return t;
  }, [rows]);

  return (
    <div className="bg-gray-100 p-6 md:p-8 min-h-screen">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-bold">Payslips — {prettyPeriod}</h1>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (!window.confirm("Email password-protected PDFs to all employees for this period?")) return;
              try {
                const { data } = await axios.post(`${API_BASE}/payrolls/${period}/payslips/email-bulk`);
                alert(`Queued ${data.count} emails.`);
              } catch (e) {
                alert(e?.response?.data?.detail || "Failed to queue bulk emails");
              }
            }}
            className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
          >
            Send All Payslips
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Recompute payrolls for this period? This will update stored NSSF/PAYE/net values.')) return;
              try {
                setRecomputing(true);
                setRecomputeResult(null);
                const { data } = await axios.post(`${API_BASE}/payrolls/recompute`, { period, confirm: true });
                setRecomputeResult(data);
                // refresh rows
                const res = await axios.get(`${API_BASE}/payrolls/${period}/payslips`);
                setRows(Array.isArray(res.data) ? res.data : []);
                alert(`Recomputed ${data.updated} payroll rows`);
              } catch (e) {
                alert(e.response?.data || e.message || 'Failed to recompute');
              } finally {
                setRecomputing(false);
              }
            }}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-sm"
            disabled={recomputing}
          >
            {recomputing ? 'Recomputing…' : 'Recompute Payrolls'}
          </button>
          <Link to="/payroll" className="text-blue-600 hover:underline text-sm">← Back to Payroll</Link>
        </div>
      </div>

      {loading && <div className="text-sm">Loading…</div>}
      {!loading && err && (
        <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-3 py-2 rounded text-sm">{err}</div>
      )}

      {!loading && !err && (
        <>
        <div className="overflow-x-auto border rounded-lg">
          <table className="min-w-[1200px] w-full text-xs">
            <thead className="bg-gray-50 text-gray-700 uppercase">
              <tr>
                <th className="px-2 py-2 text-left whitespace-nowrap">
                  <input
                    type="checkbox"
                    onChange={(e) => { if (e.target.checked) setSelected(new Set(rows.map(r=>r.id))); else setSelected(new Set()); }}
                  />
                </th>
                <th className="px-2 py-2 text-left whitespace-nowrap">#</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">Staff No</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">Name</th>

                <th className="px-2 py-2 text-right whitespace-nowrap">Basic</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">House</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Transport</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Other</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Commission</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Bonus</th>

                <th className="px-2 py-2 text-right whitespace-nowrap">Non-Cash Benefit</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Gross</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">NSSF</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">NHIF/SHIF</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">AHL</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">PAYE</th>
                {/* Note: “Non-Cash Benefit” already shown above; keeping columns unchanged */}

                <th className="px-2 py-2 text-right whitespace-nowrap">Loan</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Advance</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Net Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} />
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap">{i + 1}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.staff_no}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{r.name}</td>

                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.basic_salary)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.house_allowance)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.transport_allowance)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.other_allowances)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.commission)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.bonus)}</td>

                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.non_cash_benefit)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap font-semibold">{fmt(r.gross_pay)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.nssf)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.shif)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.ahl)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.paye)}</td>

                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.loan)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap">{fmt(r.advance)}</td>
                  <td className="px-2 py-1 text-right whitespace-nowrap font-semibold">{fmt(r.net_pay)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => viewPayslip(r)}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs"
                      >
                        View Payslip
                      </button>
                      <a
                        href={`/payrolls/${String(period).slice(0,10)}/edit/${r.id}`}
                        className="px-2 py-1 bg-yellow-500 text-white rounded text-xs"
                      >
                        Edit
                      </a>
                      <button
                        onClick={() => deleteRow(r.id)}
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={18} className="px-2 py-4 text-center text-gray-500">No payslips.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-400 border-b-[3px] border-double bg-gray-50 font-semibold">
                  <td className="px-2 py-2 text-left" colSpan={4}>Totals</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.basic)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.house)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.transport)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.other)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.comm)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.bonus)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.noncash)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.gross)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.nssf)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.shif)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.ahl)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.paye)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.loan)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.advance)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">{fmt(totals.net)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="mt-3">
          <button onClick={deleteSelected} className="px-3 py-1 bg-red-600 text-white rounded">Delete Selected</button>
        </div>

        {/* Payslip modal */}
        {modalRow && (
          <EmployeePayslipModal
            open={true}
            employee={modalRow}
            staffNo={modalRow.staff_no}
            period={modalRow.period}
            payrollId={modalRow.payroll_id}
            onClose={() => setModalRow(null)}
          />
        )}
        </>
      )}
    </div>
  );
}
