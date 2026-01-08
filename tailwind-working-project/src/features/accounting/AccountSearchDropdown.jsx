import React, { useState, useEffect } from "react";
import axios from "axios";
import { useDebounce } from "use-debounce";

function AccountSearchDropdown({ onSelect }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loadedDefault, setLoadedDefault] = useState(false);

  useEffect(() => {
    const run = async () => {
      const q = debouncedSearch.trim();
      if (q.length === 0) {
        // When opened with empty search, preload a default list for immediate dropdown
        if (showDropdown && !loadedDefault) {
          try {
            const res = await axios.get(`http://localhost:8000/accounts/`);
            const data = Array.isArray(res.data) ? res.data : [];
            const items = data.slice(0, 25).map(a => ({ id: a.id, account_code: a.account_code, name: a.name }));
            setResults(items);
            setLoadedDefault(true);
          } catch (e) {
            setResults([]);
          }
        } else if (!showDropdown) {
          setResults([]);
        }
        return;
      }
      try {
        const res = await axios.get(`http://localhost:8000/accounts/search?q=${encodeURIComponent(q)}`);
        const data = res.data;
        const items = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
        setResults(items);
      } catch (err) {
        console.error("Search error", err);
        setResults([]);
      }
    };
    run();
  }, [debouncedSearch, showDropdown, loadedDefault]);

  const handleSelect = (account) => {
    setSearch(`${account.account_code} - ${account.name}`);
    setShowDropdown(false);
    onSelect(account); // callback to pass selected account to parent
  };

  return (
    <div className="relative w-full">
      <input
        type="text"
        className="w-full border p-2 rounded"
        placeholder="Search account name or code..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setShowDropdown(true);
        }}
        onFocus={() => {
          setShowDropdown(true);
        }}
        onBlur={() => {
          // Small delay so click can register
          setTimeout(() => setShowDropdown(false), 150);
        }}
      />
      {showDropdown && results.length > 0 && (
        <ul className="absolute z-10 bg-white border w-full rounded mt-1 max-h-60 overflow-y-auto shadow">
          {results.map((account) => (
            <li
              key={`${account.id ?? account.account_code}`}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
              onClick={() => handleSelect(account)}
            >
              {account.account_code} — {account.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AccountSearchDropdown;
