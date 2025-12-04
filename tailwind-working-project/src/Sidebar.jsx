// src/Sidebar.jsx
import { NavLink, Link, useLocation } from "react-router-dom";

const Sidebar = () => {
  const location = useLocation();
  const baseLink = "block px-4 py-2 rounded transition-colors";
  const idle = "text-white/90 hover:bg-gray-700";
  const active = "bg-gray-700 text-white";

  return (
    <aside className="w-64 shrink-0 h-screen bg-gray-800 text-white flex flex-col">
      {/* Brand / Header */}
      <div className="p-6 border-b border-gray-700">
        <Link to="/dashboard" className="text-xl font-bold">
          My Accounting
        </Link>
      </div>

      {/* Scrollable nav area */}
      <nav className="flex-1 overflow-y-auto px-2 pb-6" style={{ scrollbarGutter: "stable" }}>
        {/* SUMMARY */}
        <div className="mt-4 mb-2 text-xs uppercase tracking-wider text-gray-400">Summary</div>
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/dashboard"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Dashboard
            </NavLink>
          </li>
        </ul>

        {/* SALES */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Sales</div>
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/customers"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Customers
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/invoices"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Invoices
            </NavLink>
          </li>
        </ul>

        {/* PURCHASES */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Purchases</div>
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/suppliers"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Suppliers
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/purchase-invoices"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Purchase Invoices
            </NavLink>
          </li>
        </ul>

        {/* BANKING */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Banking</div>
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/bank-balances"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Bank Balances
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/receipts"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Receipts
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/payments"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Payments
            </NavLink>
          </li>
        </ul>

        {/* INVENTORY */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Inventory</div>
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/inventory/products"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Products
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/inventory/low-stock"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Low Stock
            </NavLink>
          </li>
        </ul>

        {/* PAYROLL */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Payroll</div>
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/employees"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Employees
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/payroll"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Payroll
            </NavLink>
          </li>
          <li>
            {/* Use NavLink, not <a href>, to avoid full reload */}
            <NavLink
              to="/payroll-settings"
              className={({ isActive }) =>
                `${baseLink} ${isActive ? active : idle}`
              }
            >
              Payroll Settings
            </NavLink>
          </li>
        </ul>

        {/* ACCOUNTING */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Accounting</div>
        <ul className="space-y-1">
          <li>
            <NavLink to="/chart_of_accounts" className={({isActive}) => `${baseLink} ${isActive ? active : idle}`}>
              Chart of Accounts
            </NavLink>
          </li>
          <li>
            <NavLink to="/currencies" className={({isActive}) => `${baseLink} ${isActive ? active : idle}`}>
              Currencies
            </NavLink>
          </li>
          <li>
            <NavLink to="/journal-entry" className={({isActive}) => `${baseLink} ${isActive ? active : idle}`}>
              Journal
            </NavLink>
          </li>
          <li>
            <NavLink to="/taxes" className={({isActive}) => `${baseLink} ${isActive ? active : idle}`}>
              Taxes
            </NavLink>
          </li>
        </ul>

        {/* REPORTS */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Reports</div>
        <ul className="space-y-1">
          <li>
            <NavLink to="/reports" className={({isActive}) => `${baseLink} ${isActive ? active : idle}`}>
              Reports
            </NavLink>
          </li>
        </ul>

        {/* COMPANY */}
        <div className="mt-6 mb-2 text-xs uppercase tracking-wider text-gray-400">Company</div>
        <ul className="space-y-1">
          <li>
            <NavLink
              to="/settings/company"
              className={({ isActive }) => `${baseLink} ${isActive ? active : idle}`}
            >
              Company Settings
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
