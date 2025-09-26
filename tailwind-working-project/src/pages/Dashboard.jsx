// src/pages/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = "http://127.0.0.1:8000";
const GET_PROFILE = `${API_BASE}/company/profile`;

const formatKES = (n) =>
  `KES ${Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const CardSkeleton = () => (
  <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 animate-pulse">
    <div className="h-3 w-20 bg-gray-200 rounded mb-3" />
    <div className="h-7 w-28 bg-gray-200 rounded" />
  </div>
);

export default function Dashboard() {
  const [company, setCompany] = useState(null);

  const [revenue, setRevenue] = useState(0);
  const [employmentCosts, setEmploymentCosts] = useState(0);
  const [cashBalance, setCashBalance] = useState(0);

  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({ invoices: "", payrolls: "", bank: "" });

  // NEW: activity state
  const [activities, setActivities] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [activityErr, setActivityErr] = useState("");

  // Optional period filter. Backward compatible if backend ignores it.
  // Examples you can implement server-side later: this_month | last_month | this_quarter | ytd | custom:YYYY-MM-DD,YYYY-MM-DD
  const [period, setPeriod] = useState("this_month");

  const username = localStorage.getItem("username");
  const password = localStorage.getItem("password");
  const navigate = useNavigate();

  // Build query tail with credentials (and optional period)
  const q = useMemo(() => {
    const parts = [
      `username=${encodeURIComponent(username || "")}`,
      `password=${encodeURIComponent(password || "")}`,
    ];
    if (period) parts.push(`period=${encodeURIComponent(period)}`);
    return parts.join("&");
  }, [username, password, period]);

  useEffect(() => {
    if (!username || !password) {
      alert("Missing credentials. Please log in again.");
      navigate("/login");
      return;
    }
    setLoading(true);
    setLoadingActivities(true);
    setErrors({ invoices: "", payrolls: "", bank: "" });
    setActivityErr("");

    const fetchProfile = fetch(GET_PROFILE).then((res) => res.json());

    const fetchRevenue = fetch(`${API_BASE}/invoices/summary?${q}`)
      .then((res) => res.json())
      .then((data) => setRevenue(data.total_revenue || 0))
      .catch(() =>
        setErrors((e) => ({ ...e, invoices: "Invoices summary unavailable." }))
      );

    const fetchPayroll = fetch(`${API_BASE}/payrolls/summary?${q}`)
      .then((res) => res.json())
      .then((data) => setEmploymentCosts(data.employment_costs || 0))
      .catch(() =>
        setErrors((e) => ({ ...e, payrolls: "Payroll summary unavailable." }))
      );

    const fetchCash = fetch(`${API_BASE}/bank_transactions/summary?${q}`)
      .then((res) => res.json())
      .then((data) => setCashBalance(data.cash_balance || 0))
      .catch(() =>
        setErrors((e) => ({ ...e, bank: "Bank summary unavailable." }))
      );

    // NEW: fetch recent activity
    const fetchActivity = fetch(`${API_BASE}/activity/recent?${q}`)
      .then((res) => res.json())
      .then((data) =>
        setActivities(Array.isArray(data.items) ? data.items : [])
      )
      .catch(() => setActivityErr("Recent activity unavailable."))
      .finally(() => setLoadingActivities(false));

    Promise.allSettled([
      fetchProfile,
      fetchRevenue,
      fetchPayroll,
      fetchCash,
      fetchActivity,
    ]).then(([profileResult]) => {
      if (profileResult.status === "fulfilled") setCompany(profileResult.value);
      setLoading(false);
    });
  }, [q, navigate, username, password]);

  const netProfit = (revenue || 0) - (employmentCosts || 0);

  return (
    <div className="bg-gray-50 p-6 md:p-8 min-h-screen">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {company?.logo_url && (
            <img
              src={company.logo_url}
              alt="Logo"
              className="h-10 w-10 rounded-md object-contain bg-white p-1 border"
            />
          )}
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold leading-tight">
              Dashboard
            </h1>
            {company?.company_name && (
              <p className="text-sm text-gray-500">{company.company_name}</p>
            )}
          </div>
        </div>

        {/* Period switcher (Manager simplicity + Odoo polish) */}
        <div className="flex items-center gap-2">
          {["this_month", "last_month", "this_quarter", "ytd"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded-full text-sm border ${
                period === p
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-700 border-gray-200"
              }`}
            >
              {p === "this_month" && "This Month"}
              {p === "last_month" && "Last Month"}
              {p === "this_quarter" && "This Quarter"}
              {p === "ytd" && "YTD"}
            </button>
          ))}
        </div>
      </header>

      {/* Quick Actions (Odoo-style convenience) */}
      <section className="mb-6">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/create-invoice"
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300 shadow-sm text-sm"
          >
            ➕ Create Invoice
          </Link>
          <Link
            to="/receipts/create"
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300 shadow-sm text-sm"
          >
            💳 Record Receipt
          </Link>
          <Link
            to="/purchases"
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300 shadow-sm text-sm"
          >
            🧾 Add Purchase
          </Link>
          <Link
            to="/payments"
            className="px-3 py-2 rounded-lg bg-white border border-gray-200 hover:border-gray-300 shadow-sm text-sm"
          >
            🏦 Record Payment
          </Link>
        </div>
      </section>

      {/* KPI Row (Manager density + Odoo polish) */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {loading ? (
          <>
            <CardSkeleton /> <CardSkeleton /> <CardSkeleton /> <CardSkeleton />
          </>
        ) : (
          <>
            <KpiCard
              label="Revenue"
              value={formatKES(revenue)}
              color="text-emerald-600"
              to="/invoices"
              hint={errors.invoices}
            />
            <KpiCard
              label="Employment Costs"
              value={formatKES(employmentCosts)}
              color="text-rose-600"
              to="/payroll"
              hint={errors.payrolls}
            />
            <KpiCard
              label="Net Profit"
              value={formatKES(netProfit)}
              color={netProfit >= 0 ? "text-blue-600" : "text-rose-600"}
              to="/reports"
            />
            <KpiCard
              label="Cash Balance"
              value={formatKES(cashBalance)}
              color="text-purple-600"
              to="/bank-balances"
              hint={errors.bank}
            />
          </>
        )}
      </section>

      {/* Middle: Manager-style summaries */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Debtors Aging (placeholder) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Debtors Aging</h3>
            <Link
              to="/invoices"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              View
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            Add endpoint like <code>/reports/aging?type=ar</code> then render
            0–30 • 31–60 • 61–90 • 90+.
          </p>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <AgingPill label="0–30" amount={0} />
            <AgingPill label="31–60" amount={0} />
            <AgingPill label="61–90" amount={0} />
            <AgingPill label="90+" amount={0} />
          </div>
        </div>

        {/* Creditors Aging (placeholder) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Creditors Aging</h3>
            <Link
              to="/purchases"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              View
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            Add endpoint like <code>/reports/aging?type=ap</code> then render
            0–30 • 31–60 • 61–90 • 90+.
          </p>
          <div className="mt-3 grid grid-cols-4 gap-3">
            <AgingPill label="0–30" amount={0} />
            <AgingPill label="31–60" amount={0} />
            <AgingPill label="61–90" amount={0} />
            <AgingPill label="90+" amount={0} />
          </div>
        </div>

        {/* Bank Accounts (compact Manager-style list) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Bank & Cash</h3>
            <Link
              to="/bank-balances"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              View
            </Link>
          </div>
          <p className="text-sm text-gray-500">
            Re-use your existing balances list here (top 3 accounts); link to
            the detail page.
          </p>
          <ul className="mt-3 divide-y text-sm">
            <li className="py-2 flex items-center justify-between">
              <span className="text-gray-600">Main Bank</span>
              <span className="font-medium">{formatKES(cashBalance)}</span>
            </li>
            <li className="py-2 flex items-center justify-between">
              <span className="text-gray-600">Petty Cash</span>
              <span className="font-medium">{formatKES(0)}</span>
            </li>
            <li className="py-2 flex items-center justify-between">
              <span className="text-gray-600">MPESA</span>
              <span className="font-medium">{formatKES(0)}</span>
            </li>
          </ul>
        </div>

        {/* Recent Activity (now wired) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Recent Activity</h3>
            <Link
              to="/reports"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              View
            </Link>
          </div>

          {loadingActivities ? (
            <div className="text-sm text-gray-500">Loading...</div>
          ) : activityErr ? (
            <div className="text-sm text-amber-700">{activityErr}</div>
          ) : activities.length === 0 ? (
            <div className="text-sm text-gray-500">No recent activity.</div>
          ) : (
            <ul className="mt-2 space-y-2 text-sm">
              {activities.map((a, idx) => (
                <li
                  key={`${a.type}-${a.ref}-${idx}`}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-2 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50">
                      {a.type}
                    </span>
                    <div className="text-gray-700">
                      <span className="font-medium">{a.ref || "—"}</span>{" "}
                      <span className="text-gray-500">• {a.party || "—"}</span>
                      {a.narration ? (
                        <span className="text-gray-400"> — {a.narration}</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-gray-500">{a.date}</span>
                    <span className="font-semibold">
                      {`KES ${Number(a.amount || 0).toLocaleString()}`}
                    </span>
                    {/* Contextual drill-down links — adjust routes if yours differ */}
                    <Link
                      to={
                        a.type === "invoice"
                          ? `/invoices?search=${encodeURIComponent(a.ref || "")}`
                          : a.type === "receipt"
                          ? `/receipts?search=${encodeURIComponent(a.ref || "")}`
                          : a.type === "purchase"
                          ? `/purchases?search=${encodeURIComponent(a.ref || "")}`
                          : a.type === "payment"
                          ? `/payments?search=${encodeURIComponent(a.ref || "")}`
                          : "#"
                      }
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Open
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* Trends (minimal Odoo-esque flair, no library required yet) */}
      <section className="mt-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Trends</h3>
            <span className="text-sm text-gray-500">Last 12 months</span>
          </div>
        </div>
      </section>
    </div>
  );
}

/** SMALL PIECES */

function KpiCard({ label, value, color = "text-gray-900", to = "#", hint = "" }) {
  return (
    <Link
      to={to}
      className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 hover:shadow transition"
    >
      <div className="text-gray-500 text-xs">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {hint ? <div className="mt-2 text-xs text-amber-600">{hint}</div> : null}
    </Link>
  );
}

function AgingPill({ label, amount }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 bg-gray-50">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold mt-0.5">{formatKES(amount)}</div>
    </div>
  );
}
