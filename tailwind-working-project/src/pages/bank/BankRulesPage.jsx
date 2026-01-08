import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AccountSearchDropdown from "../../components/AccountSearchDropdown";

const emptyForm = {
  name: "",
  is_active: true,
  priority: 100,
  bank_account_id: "",
  transaction_type: "",
  description_contains: "",
  reference_contains: "",
  payee_contains: "",
  min_amount: "",
  max_amount: "",
  target_account_id: "",
  set_payee_to: "",
};

const BankRulesPage = () => {
  const navigate = useNavigate();
  const [rules, setRules] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [coa, setCoa] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const loadRules = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/bank-rules/");
      const data = await res.json();
      setRules(data || []);
    } catch (e) {
      console.error(e);
      alert("Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  const loadAccounts = async () => {
    try {
      const res = await fetch("http://localhost:8000/bank-accounts/summary");
      const data = await res.json();
      setAccounts(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const loadCoA = async () => {
    try {
      // Assuming an endpoint exists to list accounts; if not, provide a minimal list in UI.
      const res = await fetch("http://localhost:8000/accounts");
      if (res.ok) {
        const data = await res.json();
        setCoa(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRules();
    loadAccounts();
    loadCoA();
  }, []);

  const startNew = () => {
    // Use an empty object to indicate "creating" while keeping edit flow logic
    setEditingRule({});
    setForm(emptyForm);
  };

  const startEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name || "",
      is_active: !!rule.is_active,
      priority: rule.priority ?? 100,
      bank_account_id: rule.bank_account_id ?? "",
      transaction_type: rule.transaction_type || "",
      description_contains: rule.description_contains || "",
      reference_contains: rule.reference_contains || "",
      payee_contains: rule.payee_contains || "",
      min_amount: rule.min_amount ?? "",
      max_amount: rule.max_amount ?? "",
      target_account_id: rule.target_account_id ?? "",
      set_payee_to: rule.set_payee_to || "",
    });
  };

  const saveRule = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      bank_account_id: form.bank_account_id ? Number(form.bank_account_id) : null,
      min_amount: form.min_amount === "" ? null : Number(form.min_amount),
      max_amount: form.max_amount === "" ? null : Number(form.max_amount),
      priority: form.priority === "" ? 100 : Number(form.priority),
      target_account_id: Number(form.target_account_id),
    };
    try {
      const isEdit = !!(editingRule && editingRule.id);
      const url = isEdit
        ? `http://localhost:8000/bank-rules/${editingRule.id}`
        : `http://localhost:8000/bank-rules/`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`${method} failed: ${res.status} ${txt}`);
      }
      await loadRules();
      setEditingRule(null);
      setForm(emptyForm);
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to save rule");
    }
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm("Delete this rule?")) return;
    try {
      const res = await fetch(`http://localhost:8000/bank-rules/${ruleId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      await loadRules();
    } catch (err) {
      console.error(err);
      alert(err.message || "Failed to delete rule");
    }
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold">Bank Rules</h1>
          <p className="text-sm text-gray-600">Auto-categorisation rules applied to statements.</p>
        </div>
        <button className="text-sm px-3 py-1 rounded border" onClick={() => navigate(-1)}>Back</button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <button className="px-3 py-1 rounded border bg-gray-100" onClick={startNew}>New Rule</button>
      </div>

      {editingRule !== null && (
        <form onSubmit={saveRule} className="border rounded bg-white p-4 mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium">Name</label>
            <input className="border rounded px-2 py-1 w-full" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} required />
          </div>
          <div>
            <label className="text-sm font-medium">Active</label>
            <input type="checkbox" checked={form.is_active} onChange={(e)=>setForm({...form, is_active: e.target.checked})} />
          </div>
          <div>
            <label className="text-sm font-medium">Priority</label>
            <input className="border rounded px-2 py-1 w-full" type="number" value={form.priority} onChange={(e)=>setForm({...form, priority:e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-medium">Bank Account</label>
            <select className="border rounded px-2 py-1 w-full" value={form.bank_account_id} onChange={(e)=>setForm({...form, bank_account_id:e.target.value})}>
              <option value="">All</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.account_code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Transaction Type</label>
            <select className="border rounded px-2 py-1 w-full" value={form.transaction_type} onChange={(e)=>setForm({...form, transaction_type:e.target.value})}>
              <option value="">All</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Description contains</label>
            <input className="border rounded px-2 py-1 w-full" value={form.description_contains} onChange={(e)=>setForm({...form, description_contains:e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-medium">Reference contains</label>
            <input className="border rounded px-2 py-1 w-full" value={form.reference_contains} onChange={(e)=>setForm({...form, reference_contains:e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-medium">Payee contains</label>
            <input className="border rounded px-2 py-1 w-full" value={form.payee_contains} onChange={(e)=>setForm({...form, payee_contains:e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-medium">Min amount</label>
            <input className="border rounded px-2 py-1 w-full" type="number" value={form.min_amount} onChange={(e)=>setForm({...form, min_amount:e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-medium">Max amount</label>
            <input className="border rounded px-2 py-1 w-full" type="number" value={form.max_amount} onChange={(e)=>setForm({...form, max_amount:e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-medium">Target account</label>
            <AccountSearchDropdown
              onSelect={(acc) => setForm({ ...form, target_account_id: acc.id })}
            />
          </div>
          <div>
            <label className="text-sm font-medium">Payee name (optional)</label>
            <input className="border rounded px-2 py-1 w-full" value={form.set_payee_to} onChange={(e)=>setForm({...form, set_payee_to:e.target.value})} />
          </div>
          <div className="col-span-2 flex gap-2 mt-2">
            <button type="submit" className="px-3 py-1 rounded bg-blue-600 text-white">Save</button>
            <button type="button" className="px-3 py-1 rounded border" onClick={()=>{setEditingRule(null); setForm(emptyForm);}}>Cancel</button>
          </div>
        </form>
      )}

      <div className="border rounded bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-2 py-1">Name</th>
              <th className="border px-2 py-1">Conditions</th>
              <th className="border px-2 py-1">Target Account</th>
              <th className="border px-2 py-1">Payee</th>
              <th className="border px-2 py-1">Status</th>
              <th className="border px-2 py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-4 text-center">Loading…</td></tr>
            )}
            {!loading && rules.length === 0 && (
              <tr><td colSpan={6} className="p-4 text-center text-gray-500">No rules yet</td></tr>
            )}
            {rules.map(rule => {
              const acc = accounts.find(a => a.id === rule.bank_account_id);
              const target = coa.find(c => c.id === rule.target_account_id);
              const parts = [];
              if (acc) parts.push(`Account ${acc.account_code} — ${acc.name}`);
              if (rule.transaction_type) parts.push(`Type ${rule.transaction_type}`);
              if (rule.description_contains) parts.push(`Desc contains "${rule.description_contains}"`);
              if (rule.reference_contains) parts.push(`Ref contains "${rule.reference_contains}"`);
              if (rule.payee_contains) parts.push(`Payee contains "${rule.payee_contains}"`);
              if (rule.min_amount != null || rule.max_amount != null) parts.push(`Amount ${rule.min_amount ?? ''}-${rule.max_amount ?? ''}`);
              const conditions = parts.join(', ');
              return (
                <tr key={rule.id}>
                  <td className="border px-2 py-1">{rule.name}</td>
                  <td className="border px-2 py-1">{conditions || '—'}</td>
                  <td className="border px-2 py-1">{target ? `${target.account_code} — ${target.name}` : rule.target_account_id}</td>
                  <td className="border px-2 py-1">{rule.set_payee_to || '—'}</td>
                  <td className="border px-2 py-1">{rule.is_active ? 'Active' : 'Inactive'}</td>
                  <td className="border px-2 py-1">
                    <button className="px-2 py-1 rounded border mr-1" onClick={()=>startEdit(rule)}>Edit</button>
                    <button className="px-2 py-1 rounded border" onClick={()=>deleteRule(rule.id)}>Delete</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BankRulesPage;
