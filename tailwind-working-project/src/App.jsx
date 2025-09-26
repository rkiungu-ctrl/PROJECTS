// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import CompanyHeader from "./components/CompanyHeader";
import SidebarLayout from "./SidebarLayout";

// Auth / landing
import Login from "./pages/Login";

// Dashboard
import Dashboard from "./pages/Dashboard";

// Sales
import Customers from "./pages/Customers";
import Invoices from "./pages/Invoices";

// Purchases
import Suppliers from "./pages/Suppliers";
import PurchaseInvoices from "./pages/PurchaseInvoices";
import PurchaseForm from "./pages/PurchaseForm";
import PendingRecurringInvoices from "./pages/PendingRecurringInvoices";

// Banking
import BankBalances from "./pages/BankBalances";
import BankAccountDetail from "./pages/BankAccountDetail";
import ReceiptList from "./pages/ReceiptList";
import Payments from "./pages/Payments"; 

// Accounting
import Accounts from "./pages/Accounts";
import JournalEntryForm from "./pages/JournalEntryForm"; // <-- move under Accounts
import Taxes from "./pages/Taxes";
import Currencies from "./pages/Currencies";

// Payroll
import EmployeeList from "./pages/EmployeeList";
import PayrollPage from "./pages/PayrollPage";
import ViewPayslips from "./pages/ViewPayslips";
import AddSinglePayroll from "./pages/AddSinglePayroll";
import PayrollEditPage from "./pages/PayrollEditPage";
import PayrollSettingsPage from "./pages/PayrollSettingsPage";

// Company
import CompanySettings from "./pages/CompanySettings";

function App() {
  return (
    <BrowserRouter>
      <CompanyHeader />

      <Routes>
        {/* Public route */}
        <Route path="/" element={<Login />} />

        {/* App routes wrapped by sidebar */}
        <Route element={<SidebarLayout />}>
          {/* Summary */}
          <Route path="/dashboard" element={<Dashboard />} />

          {/* Sales */}
          <Route path="/customers" element={<Customers />} />
          <Route path="/invoices" element={<Invoices />} />
          <Route path="/pending-recurring" element={<PendingRecurringInvoices />} />

          {/* Purchases */}
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/purchase-invoices" element={<PurchaseInvoices />} />
          <Route path="/purchases" element={<PurchaseInvoices />} /> {/* alias */}
          <Route path="/purchase/new" element={<PurchaseForm />} />
          <Route path="/purchases/:id/edit" element={<PurchaseForm />} />
          <Route path="/supplier-payments/new" element={<Payments />} />

          {/* Banking */}
          <Route path="/bank-balances" element={<BankBalances />} />
          <Route path="/bank-balances/:accountCode" element={<BankAccountDetail />} />
          <Route path="/receipts" element={<ReceiptList />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/payments/new" element={<Payments />} />

          {/* Accounting (now includes Journal) */}
          <Route path="/chart_of_accounts" element={<Accounts />} />
          <Route path="/journal-entry" element={<JournalEntryForm />} /> {/* under Accounts */}
          <Route path="/taxes" element={<Taxes />} />
          <Route path="/currencies" element={<Currencies />} />
          {/* Payroll */}
          <Route path="/employees" element={<EmployeeList />} />
          <Route path="/payroll" element={<PayrollPage />} />
          <Route path="/payroll/single" element={<AddSinglePayroll />} />
          <Route path="/payroll/:period" element={<ViewPayslips />} />
          <Route path="/payrolls/:period/edit/:employeeId" element={<PayrollEditPage />} />
          <Route path="/payroll-settings" element={<PayrollSettingsPage />} />

          {/* Company */}
          <Route path="/settings/company" element={<CompanySettings />} />
          <Route path="/company-settings" element={<CompanySettings />} />

          {/* Fallback */}
          <Route path="*" element={<div>Not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
