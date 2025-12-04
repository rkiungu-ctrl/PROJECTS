import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const BankAccountView = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchAccount = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch("http://localhost:8000/bank-accounts/summary");
        if (!res.ok) throw new Error("Failed to load bank accounts");
        const data = await res.json();
        const found = data.find((a) => a.id === Number(id));
        setAccount(found || null);
      } catch (err) {
        console.error(err);
        setError(err.message || "Error loading bank account");
      } finally {
        setLoading(false);
      }
    };

    fetchAccount();
  }, [id]);

  return (
    <div className="p-4">
      {/* Breadcrumb-ish header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <button
            onClick={() => navigate("/bank-accounts")}
            className="text-xs text-blue-600 hover:underline mb-1"
          >
            Bank and Cash Accounts
          </button>
          <h1 className="text-xl font-semibold">Bank or Cash Account</h1>
        </div>
        <div className="flex gap-2">
          {/* Placeholder for future Edit page */}
          <button
            className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-100"
            onClick={() => {
              // later we can navigate to /accounts/edit/:id or a dedicated edit page
              alert("Edit bank account form to be implemented.");
            }}
          >
            Edit
          </button>
          <button
            className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-100"
            onClick={() => navigate(`/bank-accounts/${id}/statement`)}
          >
            View Statement
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && (
        <p className="text-sm text-red-600 mb-2">
          {error}
        </p>
      )}

      {!loading && !error && account && (
        <div className="border rounded p-6 bg-white">
          <h2 className="text-lg font-semibold mb-4">Bank or Cash Account</h2>
          <div className="space-y-3 text-sm">
            <div className="flex">
              <div className="w-32 font-medium">Name</div>
              <div>{account.name}</div>
            </div>
            <div className="flex">
              <div className="w-32 font-medium">Code</div>
              <div>{account.account_code}</div>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && !account && (
        <p className="text-sm text-gray-500">
          Bank account not found.
        </p>
      )}
    </div>
  );
};

export default BankAccountView;
