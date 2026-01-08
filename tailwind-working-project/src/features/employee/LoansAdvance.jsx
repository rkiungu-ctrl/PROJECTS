// src/employee/LoansAdvance.jsx
import React, { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

function generateRefNo() {
  return "LN-" + Math.random().toString(36).substr(2, 8).toUpperCase();
}

const METHODS = ["Flat Rate", "Reducing Balance"];
const TYPES = ["Advance", "Loan"];

const ymToDate = (ym) => new Date(`${ym}-01T00:00:00`);
const addMonthsYM = (ym, n) => {
  const d = ymToDate(ym);
  d.setMonth(d.getMonth() + n);
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  return `${y}-${m}`;
};

const newLoan = () => ({
  type: "Advance",
  reference_no: generateRefNo(),
  date_issued: new Date().toISOString().slice(0, 10),
  principal: "",
  interest_rate: "",
  interest_method: "Reducing Balance",
  installment_amount: "",
  first_period: new Date().toISOString().slice(0, 7),
  repayment_period: 0,
  // canonical API field is `balance`; keep `balance_outstanding` for backward compatibility.
  balance: 0,
  balance_outstanding: 0,
  amount_repaid: 0,
  status: "Draft",
  next_due_period: "",
  schedule: [],
});

function computeSchedule({ principal, ratePct, method, installment, firstYM }) {
  const p0 = Number(principal) || 0;
  const r = (Number(ratePct) || 0) / 100;
  const inst = Math.max(0, Number(installment) || 0);
  if (p0 <= 0 || inst <= 0) return { rows: [], periods: 0, nextDue: "", balance: p0 };

  let bal = p0;
  const rows = [];
  let ym = firstYM || new Date().toISOString().slice(0, 7);
  let guard = 600;

  while (bal > 0.000001 && guard-- > 0) {
    const opening = bal;
    const interest = method === "Flat Rate" ? p0 * r : opening * r;
    let installmentNow = inst;
    if (opening + interest < installmentNow) installmentNow = opening + interest;

    const principalPaid = Math.max(0, installmentNow - interest);
    const closing = Math.max(0, opening - principalPaid);

    rows.push({
      period_ym: ym,
      opening: Number(opening.toFixed(2)),
      interest: Number(interest.toFixed(2)),
      principal: Number(principalPaid.toFixed(2)),
      installment: Number(installmentNow.toFixed(2)),
      closing: Number(closing.toFixed(2)),
    });

    bal = closing;
    ym = addMonthsYM(ym, 1);
  }

  const nextDue = rows.length ? rows[0].period_ym : "";
  return { rows, periods: rows.length, nextDue, balance: Number(bal.toFixed(2)) };
}

const LoansAdvance = ({ staffNo, onDataChange }) => {
  const [serverLoans, setServerLoans] = useState([]);
  const [loanTotals, setLoanTotals] = useState(null);
  const [loading, setLoading] = useState(false);
  const [repayAudit, setRepayAudit] = useState({});
  const [editingIdx, setEditingIdx] = useState(null);
  const [draft, setDraft] = useState(newLoan());
  const [showForm, setShowForm] = useState(false);
  const [showScheduleIdx, setShowScheduleIdx] = useState(null);

  const onField = (name, value) => setDraft((d) => ({ ...d, [name]: value }));

  const refresh = async () => {
    if (!staffNo) return;
    setLoading(true);
    try {
      const [{ data: loansData }, { data: repaymentsData }] = await Promise.all([
        api.get(`/employees/${encodeURIComponent(staffNo)}/loans`),
        api.get(`/employees/${encodeURIComponent(staffNo)}/repayments`).catch(() => ({ data: [] })),
      ]);

      // Support both legacy (plain array) and wrapped responses like { loans: [...] }
      let loansArr = [];
      let totals = null;
      
      if (Array.isArray(loansData)) {
        loansArr = loansData;
      } else if (loansData && Array.isArray(loansData.loans)) {
        loansArr = loansData.loans;
        totals = loansData.totals; // Extract totals from new response format
      } else if (loansData && Array.isArray(loansData.items)) {
        loansArr = loansData.items;
      }

      const rps = Array.isArray(repaymentsData) ? repaymentsData : [];



      const mapped = loansArr.map((loan) => {
        // Normalize common field names so the UI can work with both old and new shapes
        const loanRef = loan.reference_no || loan.referenceNo || "";
        const loanId = loan.id || loan.loan_id || null;

        const rpForLoan = rps.filter((r) => {
          if (r.loan_id != null && loanId != null) return Number(r.loan_id) === Number(loanId);
          return (r.reference_no || "").toString() === (loanRef || "").toString();
        });

        // Canonicalize principal and type fields
        const principal = Number(
          loan.principal ?? loan.principal_amount ?? loan.amount ?? 0
        );

        const type =
          loan.type || loan.loan_type || (loan.loan_type === "Advance" ? "Advance" : "Loan");

        let schedule = Array.isArray(loan.schedule) ? loan.schedule.slice() : [];
        if ((!schedule || schedule.length === 0) && rpForLoan.length) {
          schedule = rpForLoan.map((r) => ({
            period_ym: r.period_ym || "",
            opening: r.opening || 0,
            interest: r.interest || 0,
            principal: Number(r.amount || 0),
            installment: Number(r.amount || 0),
            closing: r.closing || 0,
            paid: !!r.paid,
            paid_on: r.paid_on || "",
            payslip_id: r.payslip_id || null,
          }));
        } else if (rpForLoan.length) {
          const rpByPeriod = {};
          rpForLoan.forEach((r) => {
            if (r.period_ym) rpByPeriod[r.period_ym] = r;
          });
          schedule = schedule.map((s) => {
            const rp = rpByPeriod[s.period_ym];
            if (rp)
              return {
                ...s,
                paid: !!rp.paid,
                paid_on: rp.paid_on || s.paid_on || "",
                payslip_id: rp.payslip_id || s.payslip_id || null,
              };
            return s;
          });
        }

        const scheduleSorted = [...(schedule || [])].sort((a, b) => (a.period_ym || "").localeCompare(b.period_ym || ""));

  let opening = principal;
        const rich = scheduleSorted.map((r) => {
          const interest = Number(r.interest || 0);
          const inst = Number(r.installment || r.principal || 0);
          const principalPaid = Math.max(0, inst - interest);
          const closing = Math.max(0, opening - principalPaid);
          const row = {
            ...r,
            opening: r.opening ?? opening,
            principal: r.principal ?? principalPaid,
            installment: r.installment ?? inst,
            closing: r.closing ?? closing,
          };
          opening = closing;
          return row;
        });

        return {
          ...loan,
          type,
          principal,
          schedule: rich,
        };
      });

      // Sort by date_issued (oldest first) for the table
      mapped.sort((a, b) => (a.date_issued || "").localeCompare(b.date_issued || ""));

      setServerLoans(mapped);
      setLoanTotals(totals); // Store totals
    } catch (e) {
      console.error("load loans failed", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [staffNo]);

  useEffect(() => {
    let cancelled = false;
    async function loadRepayments() {
      if (!staffNo) return;
      try {
        const { data } = await api.get(`/employees/${encodeURIComponent(staffNo)}/repayments`);
        if (cancelled) return;
        const map = {};
        for (const r of (data || [])) {
          const key = `${r.reference_no}|${r.period_ym}`;
          map[key] = { paid: !!r.paid, paid_on: r.paid_on || "", payslip_id: r.payslip_id ?? null };
        }
        setRepayAudit(map);
      } catch {}
    }
    loadRepayments();
    return () => { cancelled = true; };
  }, [staffNo]);

  useEffect(() => {
    const handler = (ev) => {
      try {
        const s = ev?.detail?.staff_no;
        if (!s || s === staffNo) refresh();
      } catch {}
    };
    window.addEventListener("loans:refresh", handler);
    return () => window.removeEventListener("loans:refresh", handler);
  }, [staffNo]);

  const computed = useMemo(() => {
    const c = computeSchedule({
      principal: draft.principal,
      ratePct: draft.interest_rate,
      method: draft.interest_method,
      installment: draft.installment_amount,
      firstYM: draft.first_period,
    });
    return c;
  }, [draft.principal, draft.interest_rate, draft.interest_method, draft.installment_amount, draft.first_period]);

  const startAdd = () => {
    setDraft(newLoan());
    setEditingIdx(null);
    setShowForm(true);
  };

  const startEdit = (idx) => {
    const item = serverLoans[idx] || newLoan();
    setDraft({
      ...item,
      interest_method: item.interest_method || "Reducing Balance",
      type: item.type || "Advance",
      first_period: item.first_period || item.next_due_period || new Date().toISOString().slice(0, 7),
    });
    setEditingIdx(idx);
    setShowForm(true);
  };

  const remove = async (idx) => {
    const l = serverLoans[idx];
    if (!l) return;
    if (!window.confirm(`Delete ${l.reference_no}?`)) return;
    try {
      await api.delete(`/employees/${encodeURIComponent(staffNo)}/loans/${encodeURIComponent(l.reference_no)}`);
      await refresh();
      // Notify parent component to refresh its data
      if (onDataChange) {
        await onDataChange();
      }
    } catch (err) {
      alert("Failed to delete: " + (err?.response?.data?.detail ?? err.message));
    }
  };

  const save = async (e) => {
    e.preventDefault();
    const payload = {
      type: draft.type,
      reference_no: draft.reference_no,
      date_issued: draft.date_issued,
      principal: Number(draft.principal || 0),
      interest_rate: Number(draft.interest_rate || 0),
      interest_method: draft.interest_method || "Reducing Balance",
      installment_amount: Number(draft.installment_amount || 0),
      first_period: draft.first_period,
    };
    try {
      if (editingIdx !== null) {
        await api.put(`/employees/${encodeURIComponent(staffNo)}/loans/${encodeURIComponent(draft.reference_no)}`, payload);
      } else {
        await api.post(`/employees/${encodeURIComponent(staffNo)}/loans`, payload);
      }
      setShowForm(false);
      setEditingIdx(null);
      await refresh();
      // Notify parent component to refresh its data
      if (onDataChange) {
        await onDataChange();
      }
    } catch (err) {
      alert("Failed to save loan: " + (err?.response?.data?.detail ?? err.message));
    }
  };

  const totals = useMemo(() => {
    const all = serverLoans || [];
    // Prefer `balance` (canonical); fall back to legacy `balance_outstanding`.
    const outstanding = all.reduce((s, x) => s + Number(x.balance ?? x.balance_outstanding ?? 0), 0);
    const activeCount = all.filter((x) => (x.status || "").toLowerCase() === "active").length;
    const clearedCount = all.filter((x) => (x.status || "").toLowerCase() === "cleared").length;
    const nextDueTotal = all.reduce((s, x) => s + Number(x.installment_amount || 0), 0);
    return { outstanding, activeCount, clearedCount, nextDueTotal };
  }, [serverLoans]);

  return (
    <div className="w-full max-w-7xl mx-auto">
      <h3 className="font-bold mb-3">Employee Loans &amp; Advances</h3>

      {/* Totals Summary */}
      <div className="grid grid-cols-4 gap-3 mb-3 text-sm">
        <div className="bg-white border rounded p-2">
          <div className="text-gray-500 text-xs uppercase">Outstanding</div>
          <div className="font-semibold">KES {totals.outstanding.toLocaleString()}</div>
        </div>
        <div className="bg-white border rounded p-2">
          <div className="text-gray-500 text-xs uppercase">Next Due (Sum)</div>
          <div className="font-semibold">KES {totals.nextDueTotal.toLocaleString()}</div>
        </div>
        <div className="bg-white border rounded p-2">
          <div className="text-gray-500 text-xs uppercase">Active</div>
          <div className="font-semibold">{totals.activeCount}</div>
        </div>
        <div className="bg-white border rounded p-2">
          <div className="text-gray-500 text-xs uppercase">Cleared</div>
          <div className="font-semibold">{totals.clearedCount}</div>
        </div>
      </div>

      <table className="min-w-full border text-xs mb-3">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-2 py-1 border text-left whitespace-nowrap">Type</th>
            <th className="px-2 py-1 border text-left whitespace-nowrap">Ref</th>
            <th className="px-2 py-1 border text-left whitespace-nowrap">Date</th>
            <th className="px-2 py-1 border text-right whitespace-nowrap">Principal</th>
            <th className="px-2 py-1 border text-right whitespace-nowrap">Rate %/mo</th>
            <th className="px-2 py-1 border text-left whitespace-nowrap">Method</th>
            <th className="px-2 py-1 border text-right whitespace-nowrap">Installment</th>
            <th className="px-2 py-1 border text-center whitespace-nowrap">1st Period</th>
            <th className="px-2 py-1 border text-center whitespace-nowrap">#Instal.</th>
            <th className="px-2 py-1 border text-center whitespace-nowrap">Next Due</th>
            <th className="px-2 py-1 border text-right whitespace-nowrap">Balance</th>
            <th className="px-2 py-1 border text-center whitespace-nowrap">Status</th>
            <th className="px-2 py-1 border text-center whitespace-nowrap">Schedule</th>
          </tr>
        </thead>
        <tbody>
          {serverLoans.length === 0 ? (
            <tr>
              <td colSpan={14} className="text-center text-gray-500 py-4">
                No loans/advances yet.
              </td>
            </tr>
          ) : (
            serverLoans.map((l, idx) => (
              <React.Fragment key={idx}>
                <tr className="odd:bg-white even:bg-gray-50">
                  <td className="px-2 py-1 border whitespace-nowrap">{l.type || l.loan_type}</td>
                  <td className="px-2 py-1 border max-w-[120px] whitespace-nowrap overflow-hidden">
                    <span className="truncate font-semibold text-gray-900 block">{l.reference_no}</span>
                  </td>
                  <td className="px-2 py-1 border whitespace-nowrap">{l.date_issued}</td>
                  <td className="px-2 py-1 border text-right whitespace-nowrap">{Number(l.principal ?? l.principal_amount ?? 0).toLocaleString()}</td>
                  <td className="px-2 py-1 border text-right whitespace-nowrap">{Number(l.interest_rate || 0).toLocaleString()}</td>
                  <td className="px-2 py-1 border whitespace-nowrap">{l.interest_method}</td>
                  <td className="px-2 py-1 border text-right whitespace-nowrap">{Number(l.installment_amount || 0).toLocaleString()}</td>
                  <td className="px-2 py-1 border text-center whitespace-nowrap">{l.first_period || l.next_due_period}</td>
                  <td className="px-2 py-1 border text-center whitespace-nowrap">{l.repayment_period}</td>
                  <td className="px-2 py-1 border text-center whitespace-nowrap">{l.next_due_period}</td>
                  <td className="px-2 py-1 border text-right whitespace-nowrap">{Number(l.balance ?? l.balance_outstanding ?? 0).toLocaleString()}</td>
                  <td className="px-2 py-1 border text-center whitespace-nowrap">{l.status}</td>
                  <td className="px-2 py-1 border text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        className="text-indigo-600 underline"
                        onClick={() => setShowScheduleIdx(showScheduleIdx === idx ? null : idx)}
                        title={showScheduleIdx === idx ? "Hide schedule" : "View schedule"}
                      >
                        {showScheduleIdx === idx ? "Hide" : "View"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(idx)}
                        title="Edit"
                        className="text-blue-600"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        title="Delete"
                        className="text-red-600"
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>

                {showScheduleIdx === idx && (
                  <tr>
                    <td colSpan={14} className="bg-gray-50">
                      <div className="p-3">
                        <b>Repayment Schedule</b>
                        {(() => {
                          const showInterestCols = Number(l?.interest_rate || 0) > 0;
                          return (
                            <table className="w-full border border-gray-300 text-xs mt-2">
                              <thead>
                                <tr className="bg-gray-50">
                                  <th className="border border-gray-300 px-2 py-1 text-left">Payroll Period</th>
                                  <th className="border border-gray-300 px-2 py-1 text-right">Opening</th>
                                  {showInterestCols && <th className="border border-gray-300 px-2 py-1 text-right">Interest</th>}
                                  {showInterestCols && <th className="border border-gray-300 px-2 py-1 text-right">Principal</th>}
                                  <th className="border border-gray-300 px-2 py-1 text-right">Installment</th>
                                  <th className="border border-gray-300 px-2 py-1 text-right">Closing</th>
                                  <th className="border border-gray-300 px-2 py-1 text-right">Payslip</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Array.isArray(l.schedule) && l.schedule.length ? (
                                  l.schedule.map((r, i) => {
                                    const ref = l.reference_no || l.ref || "";
                                    const k = `${ref}|${r.period_ym}`;
                                    const audit = repayAudit[k] || {};
                                    const payslipId = r.payslip_id ?? audit.payslip_id ?? null;
                                    return (
                                      <tr key={i}>
                                        <td className="border border-gray-300 px-2 py-1">{r.period_ym}</td>
                                        <td className="border border-gray-300 px-2 py-1 text-right">{Number(r.opening || 0).toLocaleString()}</td>
                                        {showInterestCols && <td className="border border-gray-300 px-2 py-1 text-right">{Number(r.interest || 0).toLocaleString()}</td>}
                                        {showInterestCols && <td className="border border-gray-300 px-2 py-1 text-right">{Number(r.principal || 0).toLocaleString()}</td>}
                                        <td className="border border-gray-300 px-2 py-1 text-right">{Number(r.installment || 0).toLocaleString()}</td>
                                        <td className="border border-gray-300 px-2 py-1 text-right">{Number(r.closing || 0).toLocaleString()}</td>
                                        <td className="border border-gray-300 px-2 py-1 text-right">
                                          {payslipId ? <a className="text-indigo-600 underline" href={`/payroll/${payslipId}`}>{payslipId}</a> : "-"}
                                        </td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr><td colSpan={showInterestCols ? 7 : 5} className="text-center text-gray-400 py-2">No schedule</td></tr>
                                )}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))
          )}
          {/* Totals row */}
          {loanTotals && serverLoans.length > 0 && (
            <tr className="bg-blue-50 font-semibold border-t-2 border-blue-200">
              <td className="px-2 py-2 border font-bold">TOTAL</td>
              <td className="px-2 py-2 border text-center">{loanTotals.total_loans} loans</td>
              <td className="px-2 py-2 border text-center">
                <div className="text-green-600">{loanTotals.cleared_loans} cleared</div>
                <div className="text-orange-600">{loanTotals.active_loans} active</div>
              </td>
              <td className="px-2 py-2 border text-right font-bold">
                KES {loanTotals.total_principal.toLocaleString()}
              </td>
              <td className="px-2 py-2 border"></td>
              <td className="px-2 py-2 border"></td>
              <td className="px-2 py-2 border"></td>
              <td className="px-2 py-2 border"></td>
              <td className="px-2 py-2 border"></td>
              <td className="px-2 py-2 border"></td>
              <td className="px-2 py-2 border text-right font-bold text-orange-600">
                KES {loanTotals.total_balance.toLocaleString()}
              </td>
              <td className="px-2 py-2 border text-center">
                <div className="text-xs">
                  <div>Repaid: KES {loanTotals.total_repaid.toLocaleString()}</div>
                </div>
              </td>
              <td className="px-2 py-2 border"></td>
            </tr>
          )}
        </tbody>
      </table>

      {showForm && (
        <form className="bg-gray-50 p-4 rounded mb-3" onSubmit={save}>
          <div className="grid grid-cols-12 gap-2 text-xs">
            <select className="col-span-2 border rounded px-2 py-1" value={draft.type} onChange={(e) => onField("type", e.target.value)}>
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>

            <input className="col-span-3 border rounded px-2 py-1 bg-gray-100 font-semibold" value={draft.reference_no} readOnly />

            <input className="col-span-3 border rounded px-2 py-1" type="date" value={draft.date_issued} onChange={(e) => onField("date_issued", e.target.value)} />

            <input className="col-span-4 border rounded px-2 py-1" type="number" step="0.01" placeholder="Principal" value={draft.principal} onChange={(e) => onField("principal", e.target.value)} required />

            <input className="col-span-3 border rounded px-2 py-1" type="number" step="0.01" placeholder="Interest % per month" value={draft.interest_rate} onChange={(e) => onField("interest_rate", e.target.value)} />

            <select className="col-span-3 border rounded px-2 py-1" value={draft.interest_method} onChange={(e) => onField("interest_method", e.target.value)}>
              {METHODS.map((m) => <option key={m}>{m}</option>)}
            </select>

            <input className="col-span-3 border rounded px-2 py-1" type="number" step="0.01" placeholder="Installment Amount" value={draft.installment_amount} onChange={(e) => onField("installment_amount", e.target.value)} required />

            <input className="col-span-3 border rounded px-2 py-1" type="month" value={draft.first_period} onChange={(e) => onField("first_period", e.target.value)} title="First payroll period to deduct" />

            <div className="col-span-12 grid grid-cols-12 gap-2 text-gray-700">
              <div className="col-span-3">Auto # Instalments: <b>{computed.periods || 0}</b></div>
              <div className="col-span-3">Next Due: <b>{computed.nextDue || "-"}</b></div>
              <div className="col-span-3">Closing Balance: <b>{computed.rows.length ? computed.rows[computed.rows.length-1].closing.toLocaleString() : (Number(draft.principal||0)).toLocaleString()}</b></div>
              <div className="col-span-3">Status: <b>{computed.rows.length ? (computed.rows[computed.rows.length-1].closing <= 0 ? "Cleared" : "Active") : "Draft"}</b></div>
            </div>

            <div className="col-span-12">
              <div className="text-sm font-semibold mt-2 mb-1">Preview Schedule</div>
              <div className="overflow-x-auto">
                {(() => {
                  const showInterestCols = Number(draft.interest_rate || 0) > 0;
                  return (
                    <table className="w-full border border-gray-300 text-xs">
                      <thead>
                        <tr className="bg-white">
                          <th className="border border-gray-300 px-2 py-1 text-left">Payroll Period</th>
                          <th className="border border-gray-300 px-2 py-1 text-right">Opening</th>
                          {showInterestCols && <th className="border border-gray-300 px-2 py-1 text-right">Interest</th>}
                          {showInterestCols && <th className="border border-gray-300 px-2 py-1 text-right">Principal</th>}
                          <th className="border border-gray-300 px-2 py-1 text-right">Installment</th>
                          <th className="border border-gray-300 px-2 py-1 text-right">Closing</th>
                        </tr>
                      </thead>
                      <tbody>
                        {computed.rows.length ? computed.rows.map((r, i) => (
                          <tr key={i}>
                            <td className="border border-gray-300 px-2 py-1">{r.period_ym}</td>
                            <td className="border border-gray-300 px-2 py-1 text-right">{r.opening.toLocaleString()}</td>
                            {showInterestCols && <td className="border border-gray-300 px-2 py-1 text-right">{r.interest.toLocaleString()}</td>}
                            {showInterestCols && <td className="border border-gray-300 px-2 py-1 text-right">{r.principal.toLocaleString()}</td>}
                            <td className="border border-gray-300 px-2 py-1 text-right">{r.installment.toLocaleString()}</td>
                            <td className="border border-gray-300 px-2 py-1 text-right">{r.closing.toLocaleString()}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={showInterestCols ? 6 : 4} className="text-center text-gray-400">Enter principal and installment to preview</td></tr>
                        )}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>

            <div className="col-span-12 flex gap-2 mt-2">
              <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded">
                {editingIdx !== null ? "Save Changes" : "Add Loan/Advance"}
              </button>
              <button type="button" className="bg-gray-500 text-white px-3 py-1 rounded" onClick={() => { setShowForm(false); setEditingIdx(null); }}>
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}

      <button className="mt-2 bg-green-600 text-white px-3 py-1 rounded" onClick={startAdd}>
        Add Loan/Advance
      </button>
    </div>
  );
};

export default LoansAdvance;
