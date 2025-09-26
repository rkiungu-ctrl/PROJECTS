import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

const API_BASE = "http://127.0.0.1:8000";

const blank = { code: "", name: "", symbol: "", decimal_places: 2, rate_to_base: 1, active: true, is_base: false };

export default function Currencies() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");

  const load = async () => {
    const r = await axios.get(`${API_BASE}/currencies/`);
    setItems(r.data || []);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return items.filter(x => x.code.toLowerCase().includes(s) || (x.name||"").toLowerCase().includes(s));
  }, [items, q]);

  const save = async () => {
    try {
      if (editing) {
        await axios.put(`${API_BASE}/currencies/${editing.id}`, {
          code: (form.code || "").toUpperCase(),
          name: form.name,
          symbol: form.symbol,
          decimal_places: Number(form.decimal_places),
          rate_to_base: Number(form.rate_to_base),
          active: Boolean(form.active),
        });
      } else {
        await axios.post(`${API_BASE}/currencies/`, {
          code: (form.code || "").toUpperCase(),
          name: form.name,
          symbol: form.symbol,
          decimal_places: Number(form.decimal_places),
          rate_to_base: Number(form.rate_to_base),
          active: Boolean(form.active),
          is_base: Boolean(form.is_base),
        });
      }
      setForm(blank); setEditing(null); load();
    } catch (e) {
      alert(e?.response?.data?.detail || "Failed to save currency");
    }
  };

  const setBase = async (id) => {
    await axios.post(`${API_BASE}/currencies/${id}/set_base`);
    load();
  };

  const del = async (id) => {
    if (!window.confirm("Delete currency?")) return;
    await axios.delete(`${API_BASE}/currencies/${id}`);
    load();
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-3">Currencies</h2>

      <div className="grid md:grid-cols-2 gap-6">
        {/* List */}
        <div className="border rounded-lg">
          <div className="flex items-center justify-between p-3 border-b bg-gray-50">
            <input className="border rounded px-2 py-1 text-sm" placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)} />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left">Code</th>
                  <th className="p-2 text-left">Name</th>
                  <th className="p-2 text-left">Symbol</th>
                  <th className="p-2 text-right">Rate → Base</th>
                  <th className="p-2 text-center">Base</th>
                  <th className="p-2 text-center">Active</th>
                  <th className="p-2 text-left w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(x => (
                  <tr key={x.id} className="border-t">
                    <td className="p-2">{x.code}</td>
                    <td className="p-2">{x.name}</td>
                    <td className="p-2">{x.symbol}</td>
                    <td className="p-2 text-right">{x.rate_to_base}</td>
                    <td className="p-2 text-center">
                      {x.is_base ? <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-xs">Base</span> :
                        <button className="text-xs px-2 py-1 border rounded hover:bg-gray-100" onClick={()=>setBase(x.id)}>Set Base</button>}
                    </td>
                    <td className="p-2 text-center">{x.active ? "Yes":"No"}</td>
                    <td className="p-2 whitespace-nowrap w-40">
                      <button className="bg-blue-600 text-white text-xs px-2 py-1 mr-1"
                        onClick={()=>{ setEditing(x); setForm({...x}); }}>Edit</button>
                      <button className="bg-red-600 text-white text-xs px-2 py-1" onClick={()=>del(x.id)} disabled={x.is_base}>Delete</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td className="p-3 text-center text-gray-500" colSpan={7}>No currencies</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Form */}
        <div className="border rounded-lg p-4">
          <h3 className="font-semibold mb-3">{editing ? `Edit ${editing.code}` : "Add Currency"}</h3>
          <div className="grid grid-cols-2 gap-3">
            {!editing && (
              <div className="col-span-1">
                <label className="text-xs text-gray-600">Code</label>
                <input
                  className="w-full border rounded px-2 py-1"
                  value={form.code}
                  onChange={(e)=>setForm({...form, code:e.target.value})}
                  placeholder="KES"
                  disabled={!!editing} // Optional: disable editing code when editing
                />
              </div>
            )}
            <div className={!editing ? "col-span-1" : "col-span-2"}>
              <label className="text-xs text-gray-600">Name</label>
              <input className="w-full border rounded px-2 py-1" value={form.name} onChange={e=>setForm({...form, name:e.target.value})} placeholder="Kenyan Shilling" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Symbol</label>
              <input className="w-full border rounded px-2 py-1" value={form.symbol} onChange={e=>setForm({...form, symbol:e.target.value})} placeholder="KSh" />
            </div>
            <div>
              <label className="text-xs text-gray-600">Decimal Places</label>
              <input type="number" min="0" max="6" className="w-full border rounded px-2 py-1" value={form.decimal_places}
                     onChange={e=>setForm({...form, decimal_places:e.target.value})}/>
            </div>
            <div>
              <label className="text-xs text-gray-600">Rate to Base</label>
              <input type="number" step="0.00000001" className="w-full border rounded px-2 py-1" value={form.rate_to_base}
                     onChange={e=>setForm({...form, rate_to_base:e.target.value})}/>
            </div>
            {!editing && (
              <div className="flex items-center gap-2 mt-6">
                <input id="is_base" type="checkbox" checked={form.is_base} onChange={e=>setForm({...form, is_base:e.target.checked})}/>
                <label htmlFor="is_base" className="text-sm">Set as Base Currency</label>
              </div>
            )}
            <div className="flex items-center gap-2 mt-6">
              <input id="active" type="checkbox" checked={form.active} onChange={e=>setForm({...form, active:e.target.checked})}/>
              <label htmlFor="active" className="text-sm">Active</label>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={save}>
              {editing ? "Update" : "Save"}
            </button>
            {editing && (
              <button className="border px-4 py-2 rounded" onClick={()=>{ setEditing(null); setForm(blank); }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
