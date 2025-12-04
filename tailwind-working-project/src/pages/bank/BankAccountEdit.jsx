import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const BankAccountEdit = () => {
  const { accountId } = useParams();
  const isNew = !accountId || accountId === "new";
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [currencyId, setCurrencyId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [isCash, setIsCash] = useState(false); // only for create

  const [currencies, setCurrencies] = useState([]);

  useEffect(() => {
    const fetchCurrencies = async () => {
      try {
        const res = await fetch("http://localhost:8000/currencies?active=true");
        if (!res.ok) throw new Error("Failed to load currencies");
        const data = await res.json();
        setCurrencies(data || []);
      } catch (err) {
        console.error(err);
      }
    };
    fetchCurrencies();
  }, []);

  useEffect(() => {
    if (isNew) return;
    const fetchDetail = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`http://localhost:8000/bank-accounts/${accountId}`);
        if (!res.ok) throw new Error(`Failed to load account (${res.status})`);
        const data = await res.json();
        setName(data.name || "");
        setAccountCode(data.account_code || "");
        setCurrencyId(data.currency_id ?? "");
        setIsActive(Boolean(data.is_active));
      } catch (err) {
        console.error(err);
        setError(err.message || "Error loading account");
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [accountId, isNew]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!name || !accountCode || !currencyId) {
      alert("Please provide Name, Code and Currency");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        account_code: accountCode.trim(),
        currency_id: Number(currencyId),
      };

      if (isNew) payload.is_cash = Boolean(isCash);

      const url = isNew
        ? `http://localhost:8000/bank-accounts/`
        : `http://localhost:8000/bank-accounts/${accountId}`;

      const method = isNew ? "POST" : "PUT";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Save failed: ${res.status} ${txt}`);
      }

      const data = await res.json();
      // navigate to the account view or dashboard
      const newAccountId = data.account_id ?? accountId;
      navigate(`/bank-accounts/${newAccountId}`);
    } catch (err) {
      console.error(err);
      alert(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 max-w-lg">
      <h2 className="text-lg font-semibold mb-4">
        {isNew ? "New Bank / Cash Account" : "Edit Bank Account"}
      </h2>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-sm text-red-600 mb-2">{error}</p>}

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Account Code</label>
          <input
            className="border rounded px-2 py-1 w-full"
            value={accountCode}
            onChange={(e) => setAccountCode(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Currency</label>
          <select
            className="border rounded px-2 py-1 w-full"
            value={currencyId}
            onChange={(e) => setCurrencyId(e.target.value)}
            required
          >
            <option value="">Select currency…</option>
            {currencies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </div>

        {isNew && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isCash}
                onChange={(e) => setIsCash(e.target.checked)}
              />
              <span>Is Cash account (otherwise Bank)</span>
            </label>
          </div>
        )}

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <span>Active</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving}
            className="px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className="px-3 py-1 rounded border"
            onClick={() => navigate("/bank-accounts")}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default BankAccountEdit;

