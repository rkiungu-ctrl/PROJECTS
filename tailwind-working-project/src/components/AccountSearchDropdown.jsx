import React, { useState, useEffect } from "react";
import axios from "axios";
import { useDebounce } from "use-debounce";

function AccountSearchDropdown({ onSelect }) {
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);

  useEffect(() => {
    if (debouncedSearch.trim().length > 0) {
      axios
        .get(`/accounts/search?query=${debouncedSearch}`)
        .then((res) => setResults(res.data))
        .catch((err) => console.error("Search error", err));
    } else {
      setResults([]);
    }
  }, [debouncedSearch]);

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
      />
      {showDropdown && results.length > 0 && (
        <ul className="absolute z-10 bg-white border w-full rounded mt-1 max-h-60 overflow-y-auto shadow">
          {results.map((account) => (
            <li
              key={account.id}
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
