// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import CompanyHeader from "./features/settings/CompanyHeader";
import SidebarLayout from "./SidebarLayout";

// Auth / landing
import Login from "./features/auth/Login";

// Dashboard
import Dashboard from "./features/dashboard/Dashboard";

// Sales
import Customers from "./features/sales/Customers";
import InvoicesPage from "./pages/invoices/InvoicesPage";


// Purchases
import Suppliers from "./features/procurement/suppliers/Suppliers";
import PurchaseInvoices from "./pages/Purchases/PurchaseInvoices";
import PurchaseForm from "./pages/Purchases/PurchaseForm";
import PendingRecurringInvoices from "./pages/Purchases/PendingRecurringInvoices";


// Banking
import BankAccountsDashboard from "./pages/bank/BankAccountsDashboard";
import BankAccountView from "./pages/bank/BankAccountView";
import BankAccountEdit from "./pages/bank/BankAccountEdit";
import BankStatements from "./pages/bank/BankStatements";
import BankPaymentsPage from "./pages/bank/BankPaymentsPage";
import NewBankPayment from "./pages/bank/NewBankPayment";
import BankPaymentView from "./pages/bank/BankPaymentView";
import BankRulesPage from "./pages/bank/BankRulesPage";
import BankStatementImport from "./pages/BankStatementImport";

// Accounting
import Accounts from "./features/accounting/Accounts";
import JournalEntryForm from "./pages/JournalEntryForm";
import Taxes from "./features/settings/Taxes";
import Currencies from "./features/settings/Currencies";

// Payroll
import EmployeeList from "./features/employee/EmployeeList";
import PayrollPage from "./features/payroll/PayrollPage";
import ViewPayslips from "./features/payroll/ViewPayslips";
import AddSinglePayroll from "./features/payroll/AddSinglePayroll";
import PayrollEditPage from "./features/payroll/PayrollEditPage";
import PayrollSettingsPage from "./features/payroll/PayrollSettingsPage";

// Company
import CompanySettings from "./features/settings/CompanySettings";

// Inventory
import ProductList from "./features/procurement/inventory/ProductList";
import ProductForm from "./features/procurement/inventory/ProductForm";
import ProductLedger from "./features/procurement/inventory/ProductLedger";
import LowStockProducts from "./features/procurement/inventory/LowStockProducts";
import ProductView from "./features/procurement/inventory/ProductView";
import ProductEdit from "./features/procurement/inventory/ProductEdit";

// Reports
import Reports from "./features/reporting/Reports";

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
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/pending-recurring" element={<PendingRecurringInvoices />} />

          {/* Purchases */}
          <Route path="/suppliers" element={<Suppliers />} />
          <Route path="/purchase-invoices" element={<PurchaseInvoices />} />
          <Route path="/purchases" element={<PurchaseInvoices />} /> {/* alias */}
          <Route path="/purchase/new" element={<PurchaseForm />} />
          <Route path="/purchases/:id/edit" element={<PurchaseForm />} />

          {/* Banking */}
          <Route path="/payments/new" element={<NewBankPayment />} />
          <Route path="/bank-payments" element={<BankPaymentsPage />} />
          <Route path="/bank-payments/new" element={<NewBankPayment />} />
          <Route path="/bank-payments/:id" element={<BankPaymentView />} />
          <Route path="/bank-accounts" element={<BankAccountsDashboard />} />
          <Route path="/bank-accounts/:id" element={<BankAccountView />} />
          {/* legacy singular statement route removed; use /bank-accounts/:id/statements */}
          <Route path="/bank-accounts/:id/statements" element={<BankStatements />} />
          <Route path="/bank-accounts/import" element={<BankStatementImport />} />
          <Route path="/bank-accounts/:accountId/edit" element={<BankAccountEdit />} />
          <Route path="/bank-payments/:id/edit" element={<NewBankPayment />} />
          <Route path="/bank-rules" element={<BankRulesPage />} />
          
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
          {/* Backwards-compatible route used by PayrollTab 'View Payslips' links */}
          <Route path="/payrolls/:period/payslips" element={<ViewPayslips />} />
          <Route path="/payrolls/:period/edit/:employeeId" element={<PayrollEditPage />} />
          <Route path="/payroll-settings" element={<PayrollSettingsPage />} />

          {/* Company */}
          <Route path="/settings/company" element={<CompanySettings />} />
          <Route path="/company-settings" element={<CompanySettings />} />

          {/* Inventory */}
          <Route path="/inventory/products" element={<ProductList />} />
          <Route path="/inventory/products/new" element={<ProductForm />} />
          <Route path="/inventory/products/:id/ledger" element={<ProductLedger />} />
          <Route path="/inventory/products/:id/view" element={<ProductView />} />
          <Route path="/inventory/products/:id/edit" element={<ProductEdit />} />
          <Route path="/inventory/low-stock" element={<LowStockProducts />} />

          {/*Reports*/}
          <Route path="/reports" element={<Reports />} />
          
          {/* Fallback */}
          <Route path="*" element={<div>Not found</div>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

