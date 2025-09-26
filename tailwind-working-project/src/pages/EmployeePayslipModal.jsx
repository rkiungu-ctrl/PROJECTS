// src/components/EmployeePayslipModal.jsx
import React, { useMemo } from "react";
import useCompanyProfile from "../hooks/useCompanyProfile";

const EmployeePayslipModal = ({ employee, onClose }) => {
  const { profile, loading, bust } = useCompanyProfile();
  if (!employee) return null;

  // cache-busted assets
  const logo = !loading ? bust(profile?.logo_url) : null;
  const stamp = !loading ? bust(profile?.stamp_url) : null;

  // format period -> "August 2025" (fallback to raw if not a date)
  const monthText = useMemo(() => {
    if (!employee?.period) return "";
    const d = new Date(employee.period);
    return isNaN(d.getTime())
      ? String(employee.period)
      : d.toLocaleDateString("en-KE", { year: "numeric", month: "long" });
  }, [employee?.period]);

  // keep your existing fields/fallbacks
  const {
    period = "",
    name = "",
    staff_no = "",
    email = "",
    gross_pay = 0,
    paye = 0,
    nssf = 0,
    shif = 0,
    ahl = 0,
    net_pay = 0,
  } = employee || {};

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-2xl p-8 relative max-h-[90vh] overflow-y-auto">
        {/* Close */}
        <button
          className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-2xl leading-none"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        {/* Header: logo + details + stamp */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start gap-3">
            {logo && (
              <img
                src={logo}
                alt="Company Logo"
                className="h-10 w-auto mt-1"
                onError={(e) => (e.currentTarget.style.display = "none")}
              />
            )}
            <div>
              <div className="text-lg font-semibold">
                {profile?.company_name || ""}
              </div>
              <div className="text-xs text-gray-700">
                {profile?.address || ""}
              </div>
              {profile?.email && (
                <div className="text-xs text-gray-700">{profile.email}</div>
              )}
              {profile?.phone && (
                <div className="text-xs text-gray-700">{profile.phone}</div>
              )}
            </div>
          </div>

          {stamp && (
            <img
              src={stamp}
              alt="Company Stamp"
              className="h-16 w-16 object-contain opacity-80"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          )}
        </div>

        {/* Title / month */}
        <div className="mb-4 text-sm">
          <div className="font-semibold">
            Pay Slip {monthText ? `for ${monthText}` : ""}
          </div>
        </div>

        {/* Employee info */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div>
            <b>Employee Name:</b> {name}
          </div>
          <div>
            <b>Staff No:</b> {staff_no}
          </div>
          <div className="md:col-span-2">
            <b>Email:</b> {email}
          </div>
          <div className="md:col-span-2">
            <b>Payslip No:</b> {`SLIP/${monthText || period}`}
          </div>
        </div>

        <hr className="my-3" />

        {/* Earnings / Deductions */}
        <div className="text-sm">
          <div className="font-semibold mb-1">Earnings</div>
          <div className="flex justify-between">
            <span>Basic Salary</span>
            <span>{`KES ${Number(gross_pay).toLocaleString()}`}</span>
          </div>

          <div className="mt-3 font-semibold flex justify-between">
            <span>Gross Pay</span>
            <span>{`KES ${Number(gross_pay).toLocaleString()}`}</span>
          </div>

          <div className="mt-4 font-semibold mb-1">Deductions</div>
          <div className="flex justify-between">
            <span>PAYE</span>
            <span>{`KES ${Number(paye).toLocaleString()}`}</span>
          </div>
          <div className="flex justify-between">
            <span>NSSF</span>
            <span>{`KES ${Number(nssf).toLocaleString()}`}</span>
          </div>
          <div className="flex justify-between">
            <span>SHIF</span>
            <span>{`KES ${Number(shif).toLocaleString()}`}</span>
          </div>
          <div className="flex justify-between">
            <span>AHL</span>
            <span>{`KES ${Number(ahl).toLocaleString()}`}</span>
          </div>

          <div className="mt-3 font-semibold flex justify-between">
            <span>Net Pay</span>
            <span>{`KES ${Number(net_pay).toLocaleString()}`}</span>
          </div>
        </div>

        {/* Bottom stamp + date (optional) */}
        <div className="mt-6 flex items-center gap-6">
          {stamp ? (
            <img
              src={stamp}
              alt="Company Stamp"
              className="h-16 w-16 object-contain border rounded bg-white p-1"
            />
          ) : (
            <div className="border border-dashed border-gray-400 w-32 h-20 flex items-center justify-center text-gray-500">
              Stamp
            </div>
          )}
          <div className="text-sm text-gray-600">
            Date: {new Date().toLocaleDateString()}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-wrap gap-3">
          <button className="bg-blue-600 text-white px-4 py-2 rounded">Print</button>
          <button className="bg-green-600 text-white px-4 py-2 rounded">Email</button>
          <button className="bg-yellow-500 text-white px-4 py-2 rounded">Edit</button>
          <button className="bg-red-600 text-white px-4 py-2 rounded">Delete</button>
          <button onClick={onClose} className="ml-auto px-4 py-2 rounded bg-gray-800 text-white">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmployeePayslipModal;
