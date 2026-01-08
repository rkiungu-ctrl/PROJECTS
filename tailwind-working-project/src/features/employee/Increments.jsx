import React, { useState, useEffect } from "react";
import axios from "axios";

import { API_BASE } from "../lib/api";

const Increments = ({ staffNo, onChanged }) => {
  const [increments, setIncrements] = useState([]);
  const [newInc, setNewInc] = useState({ start_date: "", gross_pay: "", end_date: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [editIdx, setEditIdx] = useState(null);
  const [editInc, setEditInc] = useState({ start_date: "", gross_pay: "", end_date: "" });

  useEffect(() => {
    if (!staffNo) return;
    setLoading(true);
    axios.get(`${API_BASE}/employees/${staffNo}/increments`)
      .then(res => setIncrements(res.data))
      .catch(() => setIncrements([]))
      .finally(() => setLoading(false));
  }, [staffNo]);

  const addIncrement = async (e) => {
    e.preventDefault();
    if (!newInc.start_date || !newInc.gross_pay) return;
    setLoading(true);
    setErr("");
    try {
      const payload = { start_date: newInc.start_date, gross_pay: parseFloat(newInc.gross_pay) };
      if (newInc.end_date) payload.end_date = newInc.end_date;
      const res = await axios.post(`${API_BASE}/employees/${staffNo}/increments`, payload);
      setIncrements(prev => [...prev, res.data]);
      setNewInc({ start_date: "", gross_pay: "", end_date: "" });
      // Notify parent that increments changed so it can update basic salary
      if (onChanged) onChanged();
    } catch (err) {
      setErr("Failed to add increment");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (idx) => {
    setEditIdx(idx);
    setEditInc({
      start_date: increments[idx].start_date,
      gross_pay: increments[idx].gross_pay,
      end_date: increments[idx].end_date || "",
    });
  };

  const cancelEdit = () => {
    setEditIdx(null);
    setEditInc({ start_date: "", gross_pay: "" });
  };

  const saveEdit = async (incId) => {
    setLoading(true);
    setErr("");
    try {
      const payload = { start_date: editInc.start_date, gross_pay: parseFloat(editInc.gross_pay) };
      if (editInc.end_date !== undefined) payload.end_date = editInc.end_date || "";
      const res = await axios.put(`${API_BASE}/employees/increments/${incId}`, payload);
      setIncrements(increments.map((inc) => (inc.id === incId ? res.data : inc)));
      cancelEdit();
      // Notify parent that increments changed so it can update basic salary
      if (onChanged) onChanged();
    } catch (err) {
      setErr("Failed to update increment");
    } finally {
      setLoading(false);
    }
  };

  const deleteIncrement = async (incId) => {
    if (!window.confirm("Delete this increment?")) return;
    setLoading(true);
    setErr("");
    try {
      await axios.delete(`${API_BASE}/employees/increments/${incId}`);
      setIncrements(increments.filter((inc) => inc.id !== incId));
      // Notify parent that increments changed so it can update basic salary
      if (onChanged) onChanged();
    } catch (err) {
      setErr("Failed to delete increment");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h3 className="font-bold mb-2">Contract/Increments History</h3>
      {err && <div className="text-red-600 mb-2">{err}</div>}
      <table className="min-w-full border text-sm mb-2">
        <thead>
          <tr>
            <th className="border px-2 py-1">Start Date</th>
            <th className="border px-2 py-1">End Date</th>
            <th className="border px-2 py-1">Gross Pay</th>
            <th className="border px-2 py-1">Actions</th>
          </tr>
        </thead>
        <tbody>
            {loading ? (
            <tr><td colSpan={4} className="text-center py-2">Loading...</td></tr>
          ) : increments.length === 0 ? (
            <tr><td colSpan={4} className="text-center py-2">No increments yet.</td></tr>
          ) : (
            increments.map((inc, idx) => (
              <tr key={inc.id || idx}>
                <td className="border px-2 py-1">
                  {editIdx === idx ? (
                    <input
                      type="date"
                      value={editInc.start_date}
                      onChange={e => setEditInc({ ...editInc, start_date: e.target.value })}
                      className="border px-1 py-0.5"
                    />
                  ) : (
                    inc.start_date
                  )}
                </td>
                <td className="border px-2 py-1">
                  {editIdx === idx ? (
                    <input
                      type="date"
                      value={editInc.end_date}
                      onChange={e => setEditInc({ ...editInc, end_date: e.target.value })}
                      className="border px-1 py-0.5"
                    />
                  ) : (
                    inc.end_date || ""
                  )}
                </td>
                <td className="border px-2 py-1">
                  {editIdx === idx ? (
                    <input
                      type="number"
                      value={editInc.gross_pay}
                      onChange={e => setEditInc({ ...editInc, gross_pay: e.target.value })}
                      className="border px-1 py-0.5"
                    />
                  ) : (
                    inc.gross_pay
                  )}
                </td>
                <td className="border px-2 py-1">
                  {editIdx === idx ? (
                    <>
                      <button className="bg-green-600 text-white px-2 py-1 text-xs rounded mr-1" onClick={() => saveEdit(inc.id)} disabled={loading}>Save</button>
                      <button className="bg-gray-400 text-white px-2 py-1 text-xs rounded" onClick={cancelEdit} disabled={loading}>Cancel</button>
                    </>
                  ) : (
                    <>
                      <button className="bg-blue-600 text-white px-2 py-1 text-xs rounded mr-1" onClick={() => startEdit(idx)} disabled={loading}>Edit</button>
                      <button className="bg-red-600 text-white px-2 py-1 text-xs rounded" onClick={() => deleteIncrement(inc.id)} disabled={loading}>Delete</button>
                    </>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <form className="flex gap-2 mb-2" onSubmit={addIncrement}>
        <input
          type="date"
          value={newInc.start_date}
          onChange={e => setNewInc({ ...newInc, start_date: e.target.value })}
          className="border px-2 py-1"
          required
        />
        <input
          type="number"
          placeholder="Gross Pay"
          value={newInc.gross_pay}
          onChange={e => setNewInc({ ...newInc, gross_pay: e.target.value })}
          className="border px-2 py-1"
          required
        />
        <button type="submit" className="bg-blue-600 text-white px-3 py-1 rounded" disabled={loading}>Add Increment</button>
      </form>
    </div>
  );
};

export default Increments;
