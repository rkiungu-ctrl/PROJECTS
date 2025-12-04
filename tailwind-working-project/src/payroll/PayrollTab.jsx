import React, { useEffect, useState } from "react";
import axios from "axios";
import { format } from "date-fns";

import { API_BASE } from "../lib/api";

import { useLocation, Link } from "react-router-dom";

function fmt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PayrollTab() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const location = useLocation();

  // open the create UI when ?create=1 is present in the URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(location.search);
      if (params.get("create")) setShowCreate(true);
    } catch (e) {
      // ignore
    }
  }, [location.search]);

  useEffect(() => {
    (async () => {
      try {
        const [p, r] = await Promise.all([
          axios.get(`${API_BASE}/company/profile`).catch(() => ({ data: null })),
          axios.get(`${API_BASE}/payrolls/periods`),
        ]);
        setProfile(p?.data || null);
        setRows(Array.isArray(r.data) ? r.data : []);
      } catch (e) {
        setError("Failed to load payroll periods");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleDelete = async (period) => {
    if (!window.confirm(`Delete ALL payrolls for ${format(new Date(period), "MMM yyyy")}? This cannot be undone.`)) {
      return;
    }
    try {
      // send confirm flag in body so backend requires explicit confirmation
      await axios.delete(`${API_BASE}/payrolls/${period}`, { data: { confirm: true } });
      // refresh
      const r = await axios.get(`${API_BASE}/payrolls/periods`);
      setRows(Array.isArray(r.data) ? r.data : []);
    } catch (e) {
      alert("Failed to delete period.");
    }
  };

  // ---- Mass-create UI state and handlers ----
  const [createForm, setCreateForm] = useState({ period: "", employees: [] });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverResults, setServerResults] = useState(null);
  const [showOverwriteModal, setShowOverwriteModal] = useState(false);
  const [overwriteCandidates, setOverwriteCandidates] = useState([]);

  // Money input component: shows formatted value when blurred, raw when focused
  const MoneyInput = ({ value, onChange, className }) => {
    const [display, setDisplay] = useState(() => (value == null ? "" : Number(value).toLocaleString()));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
      if (!focused) setDisplay(value == null ? "" : Number(value).toLocaleString());
    }, [value, focused]);

    const parse = (v) => {
      if (v === "" || v == null) return "";
      const cleaned = String(v).replace(/[^0-9.-]+/g, '');
      const n = Number(cleaned);
      return isNaN(n) ? "" : n;
    };

    return (
      <input
        type="text"
        className={className}
        value={display}
        onFocus={(e) => { setFocused(true); setDisplay(value == null ? "" : String(value)); }}
        onBlur={(e) => { setFocused(false); const parsed = parse(display); onChange(parsed === "" ? 0 : parsed); setDisplay(parsed === "" ? "" : Number(parsed).toLocaleString()); }}
        onChange={(e) => setDisplay(e.target.value)}
      />
    );
  };

  const normalizePeriodToDate = (p) => {
    // accept YYYY-MM or YYYY-MM-DD, return YYYY-MM-01
    if (!p) return null;
    if (/^\d{4}-\d{2}$/.test(p)) return `${p}-01`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
    return null;
  };

  const loadActiveEmployees = async () => {
    setCreateErr("");
    const normalized = normalizePeriodToDate(createForm.period);
    if (!normalized) {
      setCreateErr("Period must be in YYYY-MM or YYYY-MM-DD format");
      return;
    }
    try {
      const { data } = await axios.get(`${API_BASE}/payrolls/active-employees/${normalized}`);
      // map to editable employee entries
      const rows = (Array.isArray(data) ? data : []).map(e => ({
        id: e.id,
        staff_no: e.staff_no,
        name: e.name,
        non_cash_benefit: Number(e.non_cash_benefit || 0),
        basic_salary: Number(e.basic_salary || 0),
        house_allowance: Number(e.house_allowance || 0),
        transport_allowance: Number(e.transport_allowance || 0),
        other_allowances: Number(e.other_allowances || 0),
        commission: Number(e.commission || 0),
        bonus: Number(e.bonus || 0),
        // accept multiple possible backend field names
        loan: Number(e.loan ?? e.loan_due ?? e.auto_loan ?? 0),
        advance: Number(e.advance ?? e.advance_due ?? e.auto_advance ?? 0)
      }));
      setCreateForm(f => ({ ...f, employees: rows }));
    } catch (e) {
      setCreateErr("Failed to load active employees for that period");
    }
  };

  const updateEmployeeField = (idx, field, value) => {
    setCreateForm(f => {
      const copy = { ...f, employees: [...(f.employees || [])] };
      copy.employees[idx] = { ...copy.employees[idx], [field]: value };
      return copy;
    });
  };

  const computeTotals = () => {
    const totals = { noncash: 0, basic: 0, house: 0, transport: 0, other: 0, commission: 0, bonus: 0, loan: 0, advance: 0, gross: 0 };
    (createForm.employees || []).forEach(e => {
      const nc = Number(e.non_cash_benefit) || 0;
      const b = Number(e.basic_salary) || 0;
      const h = Number(e.house_allowance) || 0;
      const t = Number(e.transport_allowance) || 0;
      const o = Number(e.other_allowances) || 0;
      const c = Number(e.commission) || 0;
      const bon = Number(e.bonus) || 0;
      const loan = Number(e.loan) || 0;
      const adv = Number(e.advance) || 0;
      const gross = nc + b + h + t + o + c + bon;
      totals.noncash += nc; totals.basic += b; totals.house += h; totals.transport += t; totals.other += o; totals.commission += c; totals.bonus += bon; totals.loan += loan; totals.advance += adv; totals.gross += gross;
    });
    return totals;
  };

  const validateRows = () => {
    const errors = [];
    (createForm.employees || []).forEach((e, idx) => {
      const rowErr = [];
      if (!e.staff_no) rowErr.push('missing staff_no');
      if (Number(e.non_cash_benefit) < 0) rowErr.push('non_cash_benefit negative');
      if (Number(e.basic_salary) < 0) rowErr.push('basic_salary negative');
      if (Number(e.house_allowance) < 0) rowErr.push('house_allowance negative');
      if (Number(e.transport_allowance) < 0) rowErr.push('transport_allowance negative');
      if (Number(e.other_allowances) < 0) rowErr.push('other_allowances negative');
      if (Number(e.loan) < 0) rowErr.push('loan negative');
      if (Number(e.advance) < 0) rowErr.push('advance negative');
      if (rowErr.length) errors.push({ idx, staff_no: e.staff_no, errors: rowErr });
    });
    return errors;
  };

  const checkForDuplicates = async () => {
    setCreateErr("");
    const normalized = normalizePeriodToDate(createForm.period);
    if (!normalized) {
      setCreateErr("Period must be in YYYY-MM or YYYY-MM-DD format");
      return false;
    }
    if (!createForm.employees || createForm.employees.length === 0) {
      setCreateErr("No employees loaded to create payrolls for");
      return false;
    }

    const payload = createForm.employees.map(e => ({
      staff_no: e.staff_no,
      period: normalized,
      non_cash_benefit: Number(e.non_cash_benefit) || 0,
      basic_salary: Number(e.basic_salary) || 0,
      house_allowance: Number(e.house_allowance) || 0,
      transport_allowance: Number(e.transport_allowance) || 0,
      other_allowances: Number(e.other_allowances) || 0,
      commission: Number(e.commission) || 0,
      bonus: Number(e.bonus) || 0,
      loan: Number(e.loan) || 0,
      advance: Number(e.advance) || 0,
    }));

    try {
      // Use dry_run=true to only check for duplicates without creating payrolls
      await axios.post(`${API_BASE}/payrolls/bulk?dry_run=true`, payload);
      // No duplicates – safe to proceed to the normal confirm modal
      return true;
    } catch (e) {
      const res = e.response;
      const data = res?.data;

      // ✅ Correct place to read duplicates: data.detail.duplicates
      if (res?.status === 409 && data) {
        const detail = data.detail || {};
        const duplicates = detail.duplicates || data.duplicates;

        if (Array.isArray(duplicates) && duplicates.length) {
          setOverwriteCandidates(duplicates);
          setShowOverwriteModal(true);   // show the "Skip/Overwrite" modal
          return false;                  // tell caller that duplicates exist
        }
      }

      // Any other error: show a simple message instead of raw JSON
      const msg =
        typeof data === "string"
          ? data
          : typeof data?.detail?.message === "string"
          ? data.detail.message
          : e.message || "Failed to check for duplicates";

      setCreateErr(msg);
      return false;
    }
  };

  const submitCreatePayrolls = async () => {
    setCreateErr("");
    const normalized = normalizePeriodToDate(createForm.period);
    if (!normalized) {
      setCreateErr("Period must be in YYYY-MM or YYYY-MM-DD format");
      return;
    }
    if (!createForm.employees || createForm.employees.length === 0) {
      setCreateErr("No employees loaded to create payrolls for");
      return;
    }
    const payload = createForm.employees.map(e => ({
      staff_no: e.staff_no,
      period: normalized,
      non_cash_benefit: Number(e.non_cash_benefit) || 0,
      basic_salary: Number(e.basic_salary) || 0,
      house_allowance: Number(e.house_allowance) || 0,
      transport_allowance: Number(e.transport_allowance) || 0,
      other_allowances: Number(e.other_allowances) || 0,
      commission: Number(e.commission) || 0,
      bonus: Number(e.bonus) || 0,
      loan: Number(e.loan) || 0,
      advance: Number(e.advance) || 0
    }));

    setCreating(true);
    try {
      const resp = await axios.post(`${API_BASE}/payrolls/bulk`, payload);
      const results = resp.data || [];
      setServerResults(results);
      const successes = results.filter(r => r.success).length;
      if (successes > 0) {
        // refresh periods
        const r = await axios.get(`${API_BASE}/payrolls/periods`);
        setRows(Array.isArray(r.data) ? r.data : []);
        // After bulk-create, trigger backend sync for the created period so loan_repayments are written
        try {
          const normalizedSync = normalizePeriodToDate(createForm.period);
          if (normalizedSync) {
            await axios.post(
              `${API_BASE}/payrolls/${encodeURIComponent(normalizedSync)}/sync-loan-repayments?username=Triza&password=F%40stAP!123`,
              {},
              { headers: { "Content-Type": "application/json" } }
            );
          }
        } catch (_) {
          // ignore sync failures for now
        }
      }
      // if all success, clear form and close
      if (results.length > 0 && results.every(r => r.success)) {
        setShowCreate(false);
        setCreateForm({ period: "", employees: [] });
        alert("Payrolls created successfully");
      } else {
        setCreateErr("Some rows failed. See results.");
      }
    } catch (e) {
      setCreateErr(typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data) || e.message || "Failed to create payrolls");
    } finally {
      setCreating(false);
    }
  };

  const confirmSkipAndSubmit = async () => {
    setShowOverwriteModal(false);
    setCreating(true);
    setCreateErr("");
    try {
      const normalized = normalizePeriodToDate(createForm.period);
      const payload = createForm.employees.map(e => ({
        staff_no: e.staff_no,
        period: normalized,
        non_cash_benefit: Number(e.non_cash_benefit) || 0,
        basic_salary: Number(e.basic_salary) || 0,
        house_allowance: Number(e.house_allowance) || 0,
        transport_allowance: Number(e.transport_allowance) || 0,
        other_allowances: Number(e.other_allowances) || 0,
        commission: Number(e.commission) || 0,
        bonus: Number(e.bonus) || 0,
        loan: Number(e.loan) || 0,
        advance: Number(e.advance) || 0
      }));

      const resp = await axios.post(`${API_BASE}/payrolls/bulk?skip_existing=true`, payload);
      const results = resp.data || [];
      setServerResults(results);
      const successes = results.filter(r => r.success).length;
      if (successes > 0) {
        const r = await axios.get(`${API_BASE}/payrolls/periods`);
        setRows(Array.isArray(r.data) ? r.data : []);
        // After skip bulk-create, trigger backend sync for the period
        try {
          const normalizedSync = normalizePeriodToDate(createForm.period);
          if (normalizedSync) {
            await axios.post(
              `${API_BASE}/payrolls/${encodeURIComponent(normalizedSync)}/sync-loan-repayments?username=Triza&password=F%40stAP!123`,
              {},
              { headers: { "Content-Type": "application/json" } }
            );
          }
        } catch (_) {
          // ignore sync failures
        }
      }
      const skippedCount = overwriteCandidates.length;
      const createdCount = successes;
      if (results.length > 0) {
        setShowCreate(false);
        setCreateForm({ period: "", employees: [] });
        alert(`Payrolls created successfully: ${createdCount} created, ${skippedCount} skipped (already existed)`);
      } else {
        setCreateErr("No payrolls were created.");
      }
    } catch (e) {
      setCreateErr(typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data) || e.message || "Failed to create payrolls with skip");
    } finally {
      setCreating(false);
    }
  };

  const confirmOverwriteAndSubmit = async () => {
    setShowOverwriteModal(false);
    setCreating(true);
    setCreateErr("");
    try {
      const normalized = normalizePeriodToDate(createForm.period);
      const payload = createForm.employees.map(e => ({
        staff_no: e.staff_no,
        period: normalized,
        non_cash_benefit: Number(e.non_cash_benefit) || 0,
        basic_salary: Number(e.basic_salary) || 0,
        house_allowance: Number(e.house_allowance) || 0,
        transport_allowance: Number(e.transport_allowance) || 0,
        other_allowances: Number(e.other_allowances) || 0,
        commission: Number(e.commission) || 0,
        bonus: Number(e.bonus) || 0,
        loan: Number(e.loan) || 0,
        advance: Number(e.advance) || 0
      }));

      const resp = await axios.post(`${API_BASE}/payrolls/bulk?confirm_overwrite=true`, payload);
      const results = resp.data || [];
      setServerResults(results);
      const successes = results.filter(r => r.success).length;
      if (successes > 0) {
        const r = await axios.get(`${API_BASE}/payrolls/periods`);
        setRows(Array.isArray(r.data) ? r.data : []);
        // After overwrite bulk-create, trigger backend sync for the period
        try {
          const normalizedSync = normalizePeriodToDate(createForm.period);
          if (normalizedSync) {
            await axios.post(
              `${API_BASE}/payrolls/${encodeURIComponent(normalizedSync)}/sync-loan-repayments?username=Triza&password=F%40stAP!123`,
              {},
              { headers: { "Content-Type": "application/json" } }
            );
          }
        } catch (_) {
          // ignore sync failures
        }
      }
      if (results.length > 0 && results.every(r => r.success)) {
        setShowCreate(false);
        setCreateForm({ period: "", employees: [] });
        alert("Payrolls created successfully (overwrote existing)");
      } else {
        setCreateErr("Some rows failed after overwrite. See results.");
      }
    } catch (e) {
      setCreateErr(typeof e.response?.data === 'string' ? e.response.data : JSON.stringify(e.response?.data) || e.message || "Failed to overwrite payrolls");
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <div className="p-4">Loading…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="text-2xl font-semibold">Payroll Dashboard</div>
        <div className="space-x-2">
          <Link to="/payroll?create=1" className="inline-block px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded">Create Payroll</Link>
          <Link to="/payroll/single" className="inline-block px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded">Add Single Payroll</Link>
        </div>
      </div>
      {showCreate && (
        <div className="mb-4 border rounded p-3 bg-white">
          <div className="flex items-center space-x-2 mb-3">
            <label className="text-sm">Period (month):</label>
            <input
              type="month"
              value={createForm.period}
              onChange={(e) => setCreateForm(f => ({ ...f, period: e.target.value }))}
              className="px-2 py-1 border rounded"
              placeholder="2025-11"
            />
            <button onClick={loadActiveEmployees} className="px-3 py-1 bg-indigo-600 text-white rounded">Load Active Employees</button>
            <button onClick={() => { setShowCreate(false); setCreateForm({ period: "", employees: [] }); }} className="px-3 py-1 bg-gray-300 rounded">Cancel</button>
          </div>
          {createErr && <div className="text-red-600 mb-2">{createErr}</div>}

          {createForm.employees && createForm.employees.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-[1000px] w-full text-sm">
                <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left">Staff No</th>
                    <th className="px-2 py-2 text-left">Name</th>
                    <th className="px-2 py-2 text-right">Non-Cash</th>
                    <th className="px-2 py-2 text-right">Basic</th>
                    <th className="px-2 py-2 text-right">House</th>
                    <th className="px-2 py-2 text-right">Transport</th>
                    <th className="px-2 py-2 text-right">Other</th>
                    <th className="px-2 py-2 text-right">Commission</th>
                    <th className="px-2 py-2 text-right">Bonus</th>
                    <th className="px-2 py-2 text-right">Loan</th>
                    <th className="px-2 py-2 text-right">Advance</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {createForm.employees.map((emp, idx) => {
                    const invalid = validateRows().some(v => v.idx === idx);
                    return (
                    <tr key={emp.id || idx} className={invalid ? 'bg-red-50' : ''}>
                      <td className="px-2 py-1">{emp.staff_no}</td>
                      <td className="px-2 py-1">{emp.name}</td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.non_cash_benefit} onChange={(v) => updateEmployeeField(idx, 'non_cash_benefit', v)} className="w-24 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.basic_salary} onChange={(v) => updateEmployeeField(idx, 'basic_salary', v)} className="w-24 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.house_allowance} onChange={(v) => updateEmployeeField(idx, 'house_allowance', v)} className="w-20 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.transport_allowance} onChange={(v) => updateEmployeeField(idx, 'transport_allowance', v)} className="w-20 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.other_allowances} onChange={(v) => updateEmployeeField(idx, 'other_allowances', v)} className="w-20 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.commission} onChange={(v) => updateEmployeeField(idx, 'commission', v)} className="w-20 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.bonus} onChange={(v) => updateEmployeeField(idx, 'bonus', v)} className="w-20 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.loan} onChange={(v) => updateEmployeeField(idx, 'loan', v)} className="w-20 text-right" /></td>
                      <td className="px-2 py-1 text-right"><MoneyInput value={emp.advance} onChange={(v) => updateEmployeeField(idx, 'advance', v)} className="w-20 text-right" /></td>
                    </tr>
                  )})}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td className="px-2 py-2 font-semibold">Totals</td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().noncash)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().basic)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().house)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().transport)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().other)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().commission)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().bonus)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().loan)}</td>
                    <td className="px-2 py-2 text-right">{fmt(computeTotals().advance)}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="mt-3 flex items-center space-x-2">
                <button disabled={creating} onClick={async () => {
                  const validationErrors = validateRows();
                  if (validationErrors.length > 0) {
                    setCreateErr(`Validation errors: ${validationErrors.map(v => `${v.staff_no}: ${v.errors.join(', ')}`).join('; ')}`);
                    return;
                  }
                  const hasDuplicates = !(await checkForDuplicates());
                  if (!hasDuplicates) {
                    setShowConfirm(true);
                  }
                }} className="px-3 py-1 bg-green-600 text-white rounded">Prepare Create</button>
                <button onClick={() => { setCreateForm({ period: '', employees: [] }); }} className="px-3 py-1 bg-gray-200 rounded">Clear</button>
                {serverResults && (
                  <div className="ml-4 text-sm text-red-600">Some rows failed — see results below after submit</div>
                )}
              </div>
              {showConfirm && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30">
                  <div className="bg-white p-4 rounded shadow-md w-[700px]">
                    <h3 className="text-lg font-semibold mb-2">Confirm create payrolls</h3>
                    <div className="mb-3">Employees: <strong>{createForm.employees.length}</strong></div>
                    <div className="mb-3">Total gross: <strong>KES {fmt(computeTotals().gross)}</strong></div>
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => setShowConfirm(false)} className="px-3 py-1 bg-gray-200 rounded">Cancel</button>
                      <button onClick={async () => {
                        setShowConfirm(false);
                        await submitCreatePayrolls();
                      }} className="px-3 py-1 bg-green-600 text-white rounded">{creating ? 'Creating…' : 'Confirm and Create'}</button>
                    </div>
                    {serverResults && (
                      <div className="mt-3 text-sm">
                        <div>Results:</div>
                        <ul className="list-disc ml-5 text-xs">
                          {serverResults.map((r, i) => (
                            <li key={i} className={r.success ? 'text-green-700' : 'text-red-700'}>
                              {r.staff_no}: {r.success ? `Created (id ${r.payroll_id})` : r.errors.join(', ')}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {showOverwriteModal && (
                <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-30">
                  <div className="bg-white p-4 rounded shadow-md w-[700px]">
                    <h3 className="text-lg font-semibold mb-2">Duplicate payrolls detected</h3>
                    <div className="mb-3 text-sm">Payrolls already exist for some staff for this period. Choose how to proceed:</div>
                    <div className="max-h-40 overflow-auto mb-3 text-xs bg-gray-50 p-2 rounded">
                      <ul className="list-disc ml-5">
                        {overwriteCandidates.map((d, i) => (
                          <li key={i}>{d.staff_no} (period: {d.period}) — existing id {d.existing_id}</li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex justify-end space-x-2">
                      <button onClick={() => setShowOverwriteModal(false)} className="px-3 py-1 bg-gray-200 rounded">Cancel</button>
                      <button onClick={confirmSkipAndSubmit} className="px-3 py-1 bg-blue-600 text-white rounded">Skip Existing & Create Others</button>
                      <button onClick={confirmOverwriteAndSubmit} className="px-3 py-1 bg-red-600 text-white rounded">Overwrite All</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <div className="overflow-x-auto border rounded-lg">
        <table className="min-w-[1200px] w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 text-xs uppercase">
            <tr>
              <th className="px-3 py-2 text-left whitespace-nowrap">Payroll Period</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Total Gross</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Total NHIF/SHIF</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Total NSSF</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">PAYE</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">AHL</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Total Other Deductions</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">Net Pay</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">ER NSSF</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">ER AHL</th>
              <th className="px-3 py-2 text-right whitespace-nowrap">NITA</th>
              <th className="px-3 py-2 text-center whitespace-nowrap">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.period}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {format(new Date(r.period), "MMM yyyy")}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_gross)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_shif)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_nssf)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_paye)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_ahl)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_other_deductions)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_net)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_nssf_employer)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_ahl_employer)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">KES {fmt(r.total_nita_employer)}</td>
                <td className="px-3 py-2 text-center whitespace-nowrap">
                  <a
                    className="inline-block px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded"
                    href={`/payrolls/${String(r.period).slice(0,10)}/payslips`}
                  >
                    View Payslips
                  </a>
                  <button
                    onClick={async () => {
                      const ym = String(r.period).slice(0,7);
                      const ymd = `${ym}-01`;
                      try {
                        await axios.post(
                          `${API_BASE}/payrolls/${encodeURIComponent(ymd)}/sync-loan-repayments?username=Triza&password=F%40stAP!123`,
                          {},
                          { headers: { "Content-Type": "application/json" } }
                        );
                        // refresh periods so totals reflect new repayments
                        const refreshed = await axios.get(`${API_BASE}/payrolls/periods`);
                        setRows(Array.isArray(refreshed.data) ? refreshed.data : []);
                        // notify loans widgets to refresh if open
                        try { window.dispatchEvent(new CustomEvent("loans:refresh", { detail: {} })); } catch {}
                        alert("Loan repayments synced for " + ymd);
                      } catch (e) {
                        console.error('Sync failed', e?.response?.data || e?.message);
                        alert("Failed to sync loan repayments for " + ymd);
                      }
                    }}
                    className="ml-2 inline-block px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded"
                  >
                    Sync loan repayments
                  </button>
                  <button
                    onClick={() => handleDelete(r.period)}
                    className="ml-2 inline-block px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-gray-500" colSpan={12}>
                  No payrolls yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}