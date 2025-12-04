// src/components/EmployeeDetailsModal.jsx
import React, { useState, useEffect, useRef } from "react";
import { api } from "../lib/api";

// Helper: only append when non-empty (prevents wiping DB with blanks)
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

// --- save Salary slice ---
async function saveSalarySlice(staffNo, sal) {
  const fd = new FormData();
  putIfTruthy(fd, "employment_type", sal.employment_type);
  putIfTruthy(fd, "payment_currency", sal.payment_currency);
  putIfTruthy(fd, "basic_salary", sal.basic_salary);
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
  putIfTruthy(fd, "bank_name", sal.bank_name);
  putIfTruthy(fd, "bank_account", sal.bank_account);
  putIfTruthy(fd, "branch_name", sal.branch_name);
  putIfTruthy(fd, "branch_code", sal.branch_code);
  const { data } = await api.put(`/employees/${encodeURIComponent(staffNo)}/salary`, fd);
  return data;
}

import {
  PersonalDetails,
  SalaryDetails,
  HRDetails,
  Increments,
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
}) => {
  const [activeTab, setActiveTab] = useState("Personal");
  const prevNameRef = useRef(initialEmployee?.name || "");

  // ---------- Shared form state ----------
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
      // extra containers
      gross_pay: seed.gross_pay ?? "",
      net_pay: seed.net_pay ?? "",
      allowances: seed.allowances ?? [],
      deductions: seed.salary_deductions ?? [],
      benefits: seed.benefits ?? [],
      earnings: seed.earnings ?? [],
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
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [employee, setEmployee] = useState(initialEmployee);

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
      } catch {
        /* keep local */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEmployee?.staff_no]);

  const personalName = formData.personal?.name || "";
  const isNew = !initialEmployee?.staff_no;

  // Sync account_name when name changes (unless user has manually edited it)
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

  // ---------- Common save helpers ----------
  const buildPayload = () => {
    const fd = new FormData();

    // REQUIRED: only append when non-empty to avoid wiping DB with blanks.
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
      basic_salary: formData.salary.basic_salary,
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

    const appendRest = (obj, prefixToSkip) => {
      const skipKeys = new Set(["passport_photo_file", "benefits", "earnings", "next_of_kin"]);
      Object.entries(obj).forEach(([k, v]) => {
        // skip keys that are handled specially (file or arrays) or that are in the required map
        if (skipKeys.has(k)) return;
        // also skip objects/arrays to avoid [object Object] being appended accidentally
        if (v && typeof v === "object") return;
        if (!(k in required)) fd.append(k, v ?? "");
      });
    };
    appendRest(formData.personal);
    appendRest(formData.salary);
    appendRest(formData.hr);
    appendRest(formData.contact);

    // If user provided a file, append with the field name backend expects
    const pfile = formData.personal?.passport_photo_file;
    if (pfile) {
      fd.append("passport_photo", pfile);
    }

    // include loans so modal changes persist (frontend maintains loans in formData.loans)
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

    return fd;
  };

  const saveEmployee = async () => {
    const payload = buildPayload();
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

      let updated;

      if (activeTab === "HR") {
        updated = await saveHRSlice(staffNo, formData.hr);
        setFormData((prev) => ({ ...prev, hr: {
          staff_no: updated.staff_no ?? prev.hr?.staff_no ?? "",
          job_title: updated.job_title ?? prev.hr?.job_title ?? "",
          department: updated.department ?? prev.hr?.department ?? "",
          head_of: updated.head_of ?? prev.hr?.head_of ?? "",
          reports_to: updated.reports_to ?? prev.hr?.reports_to ?? "",
          region: updated.region ?? prev.hr?.region ?? "",
          date_of_employment: updated.date_of_employment ?? prev.hr?.date_of_employment ?? "",
          contract_start: updated.contract_start ?? prev.hr?.contract_start ?? "",
          contract_end: updated.contract_end ?? prev.hr?.contract_end ?? "",
          project: updated.project ?? prev.hr?.project ?? "",
          is_director: updated.is_director ?? prev.hr?.is_director ?? false,
        }}));
        alert("HR details saved.");
        return;
      }

      if (activeTab === "Salary") {
        updated = await saveSalarySlice(staffNo, formData.salary);
        setFormData((prev) => ({ ...prev, salary: {
          ...prev.salary,
          employment_type: updated.employment_type ?? prev.salary?.employment_type ?? "",
          payment_currency: updated.payment_currency ?? prev.salary?.payment_currency ?? "",
          basic_salary: updated.basic_salary ?? prev.salary?.basic_salary ?? "",
          work_shift: updated.work_shift ?? prev.salary?.work_shift ?? "",
          off_days: updated.off_days ?? prev.salary?.off_days ?? "",
          daily_hours: updated.daily_hours ?? prev.salary?.daily_hours ?? "",
          income_tax: updated.income_tax ?? prev.salary?.income_tax ?? "",
          salary_processing_method: updated.salary_processing_method ?? prev.salary?.salary_processing_method ?? "",
          deduct_shif: !!updated.deduct_shif,
          deduct_nssf: !!updated.deduct_nssf,
          deduct_housing_levy: !!updated.deduct_housing_levy,
          disability_exemption_amount: updated.disability_exemption_amount ?? prev.salary?.disability_exemption_amount ?? "",
          exemption_certificate_no: updated.exemption_certificate_no ?? prev.salary?.exemption_certificate_no ?? "",
          mobile_money: updated.mobile_money ?? prev.salary?.mobile_money ?? "",
          bank_name: updated.bank_name ?? prev.salary?.bank_name ?? "",
          bank_account: updated.bank_account ?? prev.salary?.bank_account ?? "",
          branch_name: updated.branch_name ?? prev.salary?.branch_name ?? "",
          branch_code: updated.branch_code ?? prev.salary?.branch_code ?? "",
          hourly_rate: updated.hourly_rate ?? prev.salary?.hourly_rate ?? "",
          daily_rate: updated.daily_rate ?? prev.salary?.daily_rate ?? "",
        }}));
        alert("Salary details saved.");
        return;
      }

      // Default: Personal (original behavior)
      const payload = buildPayload();
      await api.put(`/employees/${encodeURIComponent(staffNo)}`, payload);

      // re-fetch
      try {
        const { data } = await api.get(`/employees/${encodeURIComponent(staffNo)}`);
        // If backend has passport_photo blob, expose a URL to fetch it
        const enriched = { ...data };
        if (data && data.passport_photo) {
          enriched.passport_photo_url = `${api.defaults.baseURL || API_BASE}/employees/${encodeURIComponent(
            staffNo
          )}/photo`;
        }
        setFormData(getInitialFormData(enriched));
        setEmployee(enriched);
      } catch {}

      alert("Employee updated successfully.");
    } catch (e) {
      alert("Failed to update employee: " + (e?.response?.data?.detail || e?.message || "Unknown error"));
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
          onChange={(data) => setFormData((prev) => ({ ...prev, salary: { ...prev.salary, ...data } }))}
          onSaved={(returned) => {
            if (!returned) return;
            setFormData((prev) => ({
              ...prev,
              salary: {
                ...prev.salary,
                employment_type: returned.employment_type ?? prev.salary?.employment_type ?? "",
                payment_currency: returned.payment_currency ?? prev.salary?.payment_currency ?? "",
                basic_salary: returned.basic_salary ?? prev.salary?.basic_salary ?? "",
                work_shift: returned.work_shift ?? prev.salary?.work_shift ?? "",
                off_days: returned.off_days ?? prev.salary?.off_days ?? "",
                daily_hours: returned.daily_hours ?? prev.salary?.daily_hours ?? "",
                income_tax: returned.income_tax ?? prev.salary?.income_tax ?? "",
                salary_processing_method: returned.salary_processing_method ?? prev.salary?.salary_processing_method ?? "",
                deduct_shif: !!returned.deduct_shif,
                deduct_nssf: !!returned.deduct_nssf,
                deduct_housing_levy: !!returned.deduct_housing_levy,
                disability_exemption_amount: returned.disability_exemption_amount ?? prev.salary?.disability_exemption_amount ?? "",
                exemption_certificate_no: returned.exemption_certificate_no ?? prev.salary?.exemption_certificate_no ?? "",
                mobile_money: returned.mobile_money ?? prev.salary?.mobile_money ?? "",
                bank_name: returned.bank_name ?? prev.salary?.bank_name ?? "",
                bank_account: returned.bank_account ?? prev.salary?.bank_account ?? "",
                branch_name: returned.branch_name ?? prev.salary?.branch_name ?? "",
                branch_code: returned.branch_code ?? prev.salary?.branch_code ?? "",
                hourly_rate: returned.hourly_rate ?? prev.salary?.hourly_rate ?? "",
                daily_rate: returned.daily_rate ?? prev.salary?.daily_rate ?? "",
              },
            }));
          }}
          formData={formData}
          setFormData={setFormData}
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
    {
      label: "HR",
      component: (
        <HRDetails
          data={formData.hr}
          onChange={(data) => setFormData((prev) => ({ ...prev, hr: { ...prev.hr, ...data } }))}
          employees={employees}
          formData={formData}
          setFormData={setFormData}
        />
      ),
    },
    {
      label: "Contact",
      component: (
        <ContactDetails
          formData={formData}
          setFormData={setFormData}
          staffNo={formData.hr.staff_no}
        />
      ),
    },
    { label: "Deductions", component: <Deductions formData={formData} setFormData={setFormData} /> },
    { label: "Loans/Advance", component: <LoansAdvance formData={formData} setFormData={setFormData} /> },
    { label: "Leave", component: <Leave formData={formData} setFormData={setFormData} /> },
    { label: "Documents", component: <Documents formData={formData} setFormData={setFormData} /> },
  ];

  const tabOrder = tabs.map((t) => t.label);
  const lastTabLabel = tabOrder[tabOrder.length - 1];

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
              className={`px-4 py-2 whitespace-nowrap ${
                activeTab === tab.label ? "border-b-2 border-blue-600 font-bold" : "text-gray-600"
              }`}
              onClick={() => setActiveTab(tab.label)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-thumb-blue-400 scrollbar-track-gray-200">
          {tabs.find((t) => t.label === activeTab)?.component}

          {!isNew && (
            <div className="flex justify-end mt-4">
              <button
                type="button"
                className="px-4 py-2 bg-blue-600 text-white rounded shadow hover:bg-blue-700"
                onClick={handleUpdateEmployee}
              >
                Update Employee
              </button>
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
              className={`px-4 py-2 bg-green-600 text-white rounded ${
                !formData.hr?.staff_no ? "opacity-50 cursor-not-allowed" : ""
              }`}
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
