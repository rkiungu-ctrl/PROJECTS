// src/components/EmployeeDetailsModal.jsx
import React, { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

// Helper: append only when value is present
const putIfTruthy = (fd, k, v) => {
  if (v !== undefined && v !== null && String(v).trim() !== "") fd.append(k, v);
};

// --- save HR slice ---
async function saveHRSlice(staffNo, hr) {
  const fd = new FormData();
  putIfTruthy(fd, "job_title", hr.job_title);
  putIfTruthy(fd, "department", hr.department);
  putIfTruthy(fd, "reports_to", hr.reports_to);
  putIfTruthy(fd, "head_of", hr.head_of);
  putIfTruthy(fd, "region", hr.region);
  fd.append("is_director", hr.is_director ? "true" : "false");
  putIfTruthy(fd, "date_of_employment", hr.date_of_employment);
  putIfTruthy(fd, "contract_start", hr.contract_start);
  putIfTruthy(fd, "contract_end", hr.contract_end);
  putIfTruthy(fd, "project", hr.project);
  const { data } = await api.put(`/employees/${encodeURIComponent(staffNo)}/hr`, fd);
  return data;
}

// --- save Salary slice (optionally force a computed basic) ---
async function saveSalarySlice(staffNo, sal, computedBasic) {
  const fd = new FormData();
  putIfTruthy(fd, "employment_type", sal.employment_type);
  putIfTruthy(fd, "payment_currency", sal.payment_currency);
  putIfTruthy(fd, "basic_salary", computedBasic ?? sal.basic_salary);
  putIfTruthy(fd, "work_shift", sal.work_shift);
  putIfTruthy(fd, "off_days", sal.off_days);
  putIfTruthy(fd, "daily_hours", sal.daily_hours);
  putIfTruthy(fd, "income_tax", sal.income_tax);
  putIfTruthy(fd, "salary_processing_method", sal.salary_processing_method);
  fd.append("deduct_shif", sal.deduct_shif ? "true" : "false");
  fd.append("deduct_nssf", sal.deduct_nssf ? "true" : "false");
  fd.append("deduct_housing_levy", sal.deduct_housing_levy ? "true" : "false");
  putIfTruthy(fd, "disability_exemption_amount", sal.disability_exemption_amount);
  putIfTruthy(fd, "exemption_certificate_no", sal.exemption_certificate_no);
  putIfTruthy(fd, "mobile_money", sal.mobile_money);
  // bank & account
  putIfTruthy(fd, "account_name", sal.account_name);
  putIfTruthy(fd, "bank_name", sal.bank_name);
  putIfTruthy(fd, "bank_account", sal.bank_account);
  putIfTruthy(fd, "branch_name", sal.branch_name);
  putIfTruthy(fd, "branch_code", sal.branch_code);
  // extras
  putIfTruthy(fd, "house_allowance", sal.house_allowance);
  putIfTruthy(fd, "transport_allowance", sal.transport_allowance);
  putIfTruthy(fd, "other_allowances", sal.other_allowances);
  putIfTruthy(fd, "commission", sal.commission);
  putIfTruthy(fd, "bonus", sal.bonus);
  putIfTruthy(fd, "overtime", sal.overtime);
  putIfTruthy(fd, "cash_notes", sal.cash_notes);
  putIfTruthy(fd, "cheque_number", sal.cheque_number);
  putIfTruthy(fd, "cheque_bank_name", sal.cheque_bank_name);

  const { data } = await api.put(`/employees/${encodeURIComponent(staffNo)}/salary`, fd);

  // Also persist leaves when saving salary slice so leave records aren't lost
  try {
    const lf = Array.isArray(sal?.leaves) ? sal.leaves : (window?.formData?.leaves || []);
    if (Array.isArray(lf)) {
      const fd2 = new FormData();
      fd2.append("leaves", JSON.stringify(lf));
      await api.put(`/employees/${encodeURIComponent(staffNo)}`, fd2);
    }
  } catch (e) {
    console.error("Failed to persist leaves after salary save", e);
  }
  return data;
}

import {
  PersonalDetails,
  SalaryDetails,
  ContactDetails,
  Documents,
  Deductions,
  Benefits,
  Earnings,
  LoansAdvance,
} from "../components";
import Leave from "./Leave";

const EmployeeDetailsModal = ({
  employee: initialEmployee = {},
  onClose,
  employees = [],
  onSaved,
}) => {
  // Termination UI stays in EmployeeList; this is strictly for edit/update.
  const [activeTab, setActiveTab] = useState("Personal");
  const prevNameRef = useRef(initialEmployee?.name || "");

  const getInitialFormData = (seed = initialEmployee) => ({
    personal: {
      name: seed.name || "",
      date_of_birth: seed.date_of_birth || "",
      gender: seed.gender || "",
      marital_status: seed.marital_status || "",
      id_number: seed.id_number || "",
      kra_pin: seed.kra_pin || "",
      nssf_number: seed.nssf_number || "",
      nhif_number: seed.nhif_number || "",
      dependants: seed.dependants ?? "",
      passport_photo_url: seed.passport_photo_url || "",
      passport_photo_file: null,
    },
    salary: {
      basic_salary: seed.basic_salary ?? "",
      salary_type: seed.salary_type || "Basic",
      salary_period: seed.salary_period || "Monthly",
      employment_type: seed.employment_type || "Regular (open-ended)",
      payment_currency: seed.payment_currency || "KES",
      work_shift: seed.work_shift || "Regular Shift",
      off_days: seed.off_days || "Sunday",
      daily_hours: seed.daily_hours ?? 8,
      hourly_rate: seed.hourly_rate ?? "",
      daily_rate: seed.daily_rate ?? "",
  income_tax: seed.income_tax || "P.A.Y.E. Primary Employee",
  deduct_shif: seed.deduct_shif ?? true,
  deduct_nssf: seed.deduct_nssf ?? true,
  deduct_housing_levy: seed.deduct_housing_levy ?? true,
      salary_processing_method: seed.salary_processing_method || "Bank",
      account_name: seed.account_name || seed.name || "",
      bank_account: seed.bank_account || "",
      bank_name: seed.bank_name || "",
      branch_name: seed.branch_name || "",
      branch_code: seed.branch_code || "",
      mobile_money: seed.mobile_money || "",
      cash_notes: seed.cash_notes || "",
      cheque_number: seed.cheque_number || "",
      cheque_bank_name: seed.cheque_bank_name || "",
      disability_exemption_amount: seed.disability_exemption_amount ?? "",
      exemption_certificate_no: seed.exemption_certificate_no || "",
      house_allowance: seed.house_allowance ?? 0,
      transport_allowance: seed.transport_allowance ?? 0,
      other_allowances: seed.other_allowances ?? 0,
      commission: seed.commission ?? 0,
      bonus: seed.bonus ?? 0,
      overtime: seed.overtime ?? 0,
      _latest_increment_basic: undefined,
    },
    hr: {
      staff_no: seed.staff_no || "",
      job_title: seed.job_title || "",
      department: seed.department || "",
      reports_to: seed.reports_to || "",
      head_of: seed.head_of || "",
      region: seed.region || "",
      date_of_employment: seed.date_of_employment || "",
      contract_start: seed.contract_start || "",
      contract_end: seed.contract_end || "",
      project: seed.project || "",
      is_director: seed.is_director ?? false,
    },
    contact: {
      official_email: seed.official_email || "",
      personal_email: seed.personal_email || "",
      phone: seed.phone || "",
      office_phone: seed.office_phone || "",
      address: seed.address || "",
      city: seed.city || "",
      country: seed.country || "",
      county: seed.county || "",
      postal_code: seed.postal_code || "",
      next_of_kin: (() => {
        if (Array.isArray(seed.next_of_kin)) return seed.next_of_kin;
        if (typeof seed.next_of_kin === "string" && seed.next_of_kin.trim().startsWith("[")) {
          try { return JSON.parse(seed.next_of_kin); } catch { return []; }
        }
        return [];
      })(),
    },
    deductions: seed.deductions || [],
    loans: seed.loans || [],
    leaves: seed.leaves || [],
    documents: seed.documents || [],

    // Leave settings (persisted)
    leaveMonthlyRate: Number(seed.leaveMonthlyRate ?? 1.75),
    leaveWorkingPattern: seed.leaveWorkingPattern || "Mon-Sat",
    leaveCustomWorkingDays: Array.isArray(seed.leaveCustomWorkingDays) ? seed.leaveCustomWorkingDays : [],
    leaveCutoffDate: seed.leaveCutoffDate || "", // set when termination date is selected
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [employee, setEmployee] = useState(initialEmployee);

  // Function to refresh employee data from server
  const refreshEmployeeData = async () => {
    const staff = initialEmployee?.staff_no || formData?.hr?.staff_no;
    if (!staff) return;
    
    try {
      const { data } = await api.get(`/employees/${staff}`);
      const merged = getInitialFormData(data || initialEmployee);
      setFormData(merged);
      setEmployee(data || initialEmployee);
    } catch (err) {
      console.error("Failed to refresh employee data:", err);
    }
  };

  useEffect(() => {
    setFormData(getInitialFormData(initialEmployee));
    setEmployee(initialEmployee);

    const staff = initialEmployee?.staff_no;
    if (!staff) return;

    (async () => {
      try {
        const { data } = await api.get(`/employees/${staff}`);
        const merged = getInitialFormData(data || initialEmployee);
        setFormData(merged);
        setEmployee(data || initialEmployee);
        prevNameRef.current = merged.personal.name || "";
      } catch {/* ignore */}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmployee?.staff_no]);

  // keep account name in sync with personal name (unless user edited)
  useEffect(() => {
    const currentName = formData.personal?.name ?? "";
    const prevName = prevNameRef.current;
    const currentAccountName = formData.salary?.account_name ?? "";
    const shouldSync = !currentAccountName || currentAccountName === prevName;
    if (shouldSync && currentName !== currentAccountName) {
      setFormData((prev) => ({
        ...prev,
        salary: { ...prev.salary, account_name: currentName },
      }));
    }
    prevNameRef.current = currentName;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.personal?.name]);

  // Listen for termination-date changes from the EmployeeList modal and reflect in Leave tab
  useEffect(() => {
    const onTermDate = (ev) => {
      const dateStr = ev?.detail?.date;
      if (!dateStr) return;
      setFormData((prev) => ({ ...prev, leaveCutoffDate: dateStr }));
    };
    window.addEventListener("termination-date-changed", onTermDate);
    return () => window.removeEventListener("termination-date-changed", onTermDate);
  }, []);

  const buildPayload = () => {
    const fd = new FormData();
    const required = {
      staff_no: formData.hr.staff_no,
      name: formData.personal.name,
      phone: formData.contact.phone,
      personal_email: formData.contact.personal_email,
      kra_pin: formData.personal.kra_pin,
      id_number: formData.personal.id_number,
      nssf_number: formData.personal.nssf_number,
      nhif_number: formData.personal.nhif_number,
      bank_name: formData.salary.bank_name,
      bank_account: formData.salary.bank_account,
      branch_name: formData.salary.branch_name,
      branch_code: formData.salary.branch_code,
      basic_salary: formData.salary._latest_increment_basic ?? formData.salary.basic_salary,
      salary_processing_method: formData.salary.salary_processing_method,
      employment_type: formData.salary.employment_type,
      house_allowance: formData.salary.house_allowance,
      transport_allowance: formData.salary.transport_allowance,
      other_allowances: formData.salary.other_allowances,
      commission: formData.salary.commission,
      bonus: formData.salary.bonus,
      overtime: formData.salary.overtime,
      is_director: formData.hr.is_director,
      account_name: formData.salary.account_name || formData.personal.name,
    };
    Object.entries(required).forEach(([k, v]) => putIfTruthy(fd, k, v));

    const appendRest = (obj) => {
      const skip = new Set(["passport_photo_file", "benefits", "earnings", "next_of_kin", "_latest_increment_basic"]);
      Object.entries(obj).forEach(([k, v]) => {
        if (skip.has(k)) return;
        if (v && typeof v === "object") return;
        if (!(k in required)) putIfTruthy(fd, k, v);
      });
    };
    appendRest(formData.personal);
    appendRest(formData.salary);
    appendRest(formData.hr);
    appendRest(formData.contact);

    // Always include deduction flags (even when false) to preserve HR settings
    fd.append("deduct_shif", formData.salary.deduct_shif ? "true" : "false");
    fd.append("deduct_nssf", formData.salary.deduct_nssf ? "true" : "false");
    fd.append("deduct_housing_levy", formData.salary.deduct_housing_levy ? "true" : "false");

    const pfile = formData.personal?.passport_photo_file;
    if (pfile) fd.append("passport_photo", pfile);

    if (Array.isArray(formData.loans) && formData.loans.length > 0) {
      fd.append("loans", JSON.stringify(formData.loans));
    }
    if (Array.isArray(formData.salary.benefits)) {
      fd.append("benefits", JSON.stringify(formData.salary.benefits));
    }
    if (Array.isArray(formData.salary.earnings)) {
      fd.append("earnings", JSON.stringify(formData.salary.earnings));
    }
    if (Array.isArray(formData.contact.next_of_kin)) {
      fd.append("next_of_kin", JSON.stringify(formData.contact.next_of_kin));
    }
    // ✅ Persist leaves and leave settings with the employee
    fd.append("leaves", JSON.stringify(Array.isArray(formData.leaves) ? formData.leaves : []));
    putIfTruthy(fd, "leaveMonthlyRate", formData.leaveMonthlyRate);
    putIfTruthy(fd, "leaveWorkingPattern", formData.leaveWorkingPattern);
    if (Array.isArray(formData.leaveCustomWorkingDays)) {
      fd.append("leaveCustomWorkingDays", JSON.stringify(formData.leaveCustomWorkingDays));
    }
    if (formData.leaveCutoffDate) putIfTruthy(fd, "leaveCutoffDate", formData.leaveCutoffDate);

    return fd;
  };

  const saveEmployee = async () => {
    const payload = buildPayload();
    try { console.debug("EmployeeDetailsModal: saving leaves count", Array.isArray(formData.leaves) ? formData.leaves.length : 0); } catch {}
    if (!formData?.hr?.staff_no) {
      await api.post(`/employees/`, payload);
    } else {
      await api.put(`/employees/${encodeURIComponent(formData.hr.staff_no)}`, payload);
    }
  };

  const handleUpdateEmployee = async () => {
    try {
      const staffNo = formData?.hr?.staff_no;
      if (!staffNo) {
        alert("Staff number is required to update employee.");
        return;
      }

      // 1) Contact tab
      if (activeTab === "Contact") {
        const contact = formData.contact || {};
        const fd = new FormData();
        const put = (k, v) => { if (v !== undefined && v !== null && String(v).trim() !== "") fd.append(k, v); };
        put("personal_email", contact.personal_email);
        put("official_email", contact.official_email);
        put("phone", contact.phone);
        put("office_phone", contact.office_phone);
        put("country", contact.country);
        put("address", contact.address);
        put("city", contact.city);
        put("county", contact.county);
        put("postal_code", contact.postal_code);
        await api.put(`/employees/${encodeURIComponent(staffNo)}/contact`, fd);

        const nok = Array.isArray(contact.next_of_kin) ? contact.next_of_kin : [];
        await api.put(
          `/employees/${encodeURIComponent(staffNo)}/next_of_kin`,
          JSON.stringify(nok),
          { headers: { "Content-Type": "text/plain" } }
        );

        // persist leaves/settings too
        await api.put(`/employees/${encodeURIComponent(staffNo)}`, buildPayload());

        // Refresh modal data from server so any server-side computed fields (loans/leaves)
        // are reflected immediately in the open modal. Also notify parent to reload list.
        try {
          const { data } = await api.get(`/employees/${encodeURIComponent(staffNo)}`);
          const merged = getInitialFormData(data || initialEmployee);
          setFormData(merged);
          setEmployee(data || initialEmployee);
        } catch (e) {
          // ignore refresh failures
        }

        alert("Employee contact and next of kin updated successfully!");
        onSaved && onSaved();
        return;
      }

      // 2) Salary tab
      if (activeTab === "Salary") {
        await saveHRSlice(staffNo, formData.hr);
        const computedBasic = formData.salary?._latest_increment_basic;
        await saveSalarySlice(staffNo, formData.salary, computedBasic);

        // Persist leaves/settings explicitly
        await api.put(`/employees/${encodeURIComponent(staffNo)}`, buildPayload());

        // Refresh and MERGE leaves if backend omits them
        try {
          const { data } = await api.get(`/employees/${encodeURIComponent(staffNo)}`);
          const merged = getInitialFormData(data);
          if (!Array.isArray(data?.leaves) || data.leaves.length === 0) {
            merged.leaves = Array.isArray(formData.leaves) ? formData.leaves : [];
          }
          setFormData(merged);
          setEmployee(data);
        } catch {/* ignore */}

        alert("Employee updated successfully.");
        onSaved && onSaved();
        return;
      }

      // 3) All other tabs (including Leave)
      await api.put(`/employees/${encodeURIComponent(staffNo)}`, buildPayload());

      // Refresh and MERGE leaves if missing
      try {
        const { data } = await api.get(`/employees/${encodeURIComponent(staffNo)}`);
        const merged = getInitialFormData(data);
        if (!Array.isArray(data?.leaves) || data.leaves.length === 0) {
          merged.leaves = Array.isArray(formData.leaves) ? formData.leaves : [];
        }
        setFormData(merged);
        setEmployee(data);
      } catch {/* ignore */}

      alert("Employee updated successfully.");
      onSaved && onSaved();
    } catch (e) {
      const msg = e?.response?.data ? JSON.stringify(e.response.data) : e?.message;
      alert("Failed to update employee: " + msg);
    }
  };

  const tabs = [
    {
      label: "Personal",
      component: (
        <PersonalDetails
          data={formData.personal}
          onChange={(data) => setFormData((prev) => ({ ...prev, personal: { ...prev.personal, ...data } }))}
          formData={formData}
          setFormData={setFormData}
        />
      ),
    },
    {
      label: "Salary",
      component: (
        <SalaryDetails
          staffNo={formData.hr.staff_no}
          personalName={formData.personal.name}
          data={formData.salary}
          hrData={formData.hr}
          employees={employees}
          onHRChange={(hr) => setFormData((p) => ({ ...p, hr: { ...p.hr, ...hr } }))}
          onChange={(data) => setFormData((prev) => ({ ...prev, salary: { ...prev.salary, ...data } }))}
          onSaved={() => {}}
          formData={formData}
          setFormData={setFormData}
          onLatestIncrement={(amount) =>
            setFormData((prev) => ({
              ...prev,
              salary: { ...prev.salary, _latest_increment_basic: amount, basic_salary: amount },
            }))
          }
        />
      ),
    },
    {
      label: "Benefits",
      component: (
        <Benefits
          data={{
            benefits: formData.salary.benefits ?? [],
            house_allowance: formData.salary.house_allowance ?? 0,
            transport_allowance: formData.salary.transport_allowance ?? 0,
            other_allowances: formData.salary.other_allowances ?? 0,
          }}
          onChange={(data) =>
            setFormData((prev) => ({
              ...prev,
              salary: {
                ...prev.salary,
                house_allowance: data.house_allowance ?? prev.salary.house_allowance ?? 0,
                transport_allowance: data.transport_allowance ?? prev.salary.transport_allowance ?? 0,
                other_allowances: data.other_allowances ?? prev.salary.other_allowances ?? 0,
                benefits: data.benefits ?? prev.salary.benefits ?? [],
              },
            }))
          }
          formData={formData}
          setFormData={setFormData}
        />
      ),
    },
    {
      label: "Earnings",
      component: (
        <Earnings
          data={{
            earnings: formData.salary.earnings ?? [],
            commission: formData.salary.commission ?? 0,
            bonus: formData.salary.bonus ?? 0,
            overtime: formData.salary.overtime ?? 0,
          }}
          onChange={(data) =>
            setFormData((prev) => ({
              ...prev,
              salary: {
                ...prev.salary,
                commission: data.commission ?? prev.salary.commission ?? 0,
                bonus: data.bonus ?? prev.salary.bonus ?? 0,
                overtime: data.overtime ?? prev.salary.overtime ?? 0,
                earnings: data.earnings ?? prev.salary.earnings ?? [],
              },
            }))
          }
          formData={formData}
          setFormData={setFormData}
        />
      ),
    },
    { label: "Contact", component: <ContactDetails formData={formData} setFormData={setFormData} staffNo={formData.hr.staff_no} /> },
    { label: "Deductions", component: <Deductions staffNo={formData.hr.staff_no} formData={formData} setFormData={setFormData} /> },
    { label: "Loans/Advance", component: <LoansAdvance formData={formData} setFormData={setFormData} staffNo={formData?.hr?.staff_no} onDataChange={refreshEmployeeData} /> },
    { label: "Leave", component: <Leave formData={formData} setFormData={setFormData} /> },
    { label: "Documents", component: <Documents formData={formData} setFormData={setFormData} /> },
  ];

  const tabOrder = tabs.map((t) => t.label);
  const lastTabLabel = tabOrder[tabOrder.length - 1];
  const isNew = !initialEmployee?.staff_no;

  const handleCreateOrNext = async () => {
    const currentIdx = tabOrder.indexOf(activeTab);
    if (currentIdx < tabOrder.length - 1) {
      setActiveTab(tabOrder[currentIdx + 1]);
      return;
    }
    if (!formData.hr?.staff_no) {
      alert("Staff number is required.");
      return;
    }
    try {
      await saveEmployee();
    } catch (e) {
      alert("Failed to save employee: " + (e?.response?.data?.detail || e?.message || "Unknown error"));
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded shadow-lg w-full max-w-5xl h-[92vh] flex flex-col relative">
        <button
          type="button"
          className="absolute top-4 right-4 text-gray-400 hover:text-red-500 text-2xl font-bold focus:outline-none z-10"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="text-lg font-bold mb-2">Employee Details</h2>
        <div className="text-xl font-semibold mb-4 text-blue-700">
          {formData.personal?.name || "(No Name)"}
        </div>

        <div className="border-b mb-4 flex overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.label}
              className={`px-4 py-2 whitespace-nowrap ${activeTab === tab.label ? "border-b-2 border-blue-600 font-bold" : "text-gray-600"}`}
              onClick={() => setActiveTab(tab.label)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {tabs.find((t) => t.label === activeTab)?.component}

          {!isNew && (
            <div className="flex justify-end mt-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
                  onClick={handleUpdateEmployee}
                >
                  Update Employee
                </button>
              </div>
            </div>
          )}
        </div>

        {isNew && (
          <div className="flex flex-col items-end gap-2 mt-2">
            {!formData.hr?.staff_no && (
              <div className="text-red-600 text-sm mb-2">
                Staff number is required to save employee.
              </div>
            )}
            <button
              type="button"
              className={`px-4 py-2 bg-green-600 text-white rounded ${!formData.hr?.staff_no ? "opacity-50 cursor-not-allowed" : ""}`}
              disabled={!formData.hr?.staff_no}
              onClick={handleCreateOrNext}
            >
              {activeTab === lastTabLabel ? "Save & Finish" : "Add & Continue →"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default EmployeeDetailsModal;
