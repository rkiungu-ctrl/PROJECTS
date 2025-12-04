// src/components/EmployeePayslipModal.jsx
import React, { useMemo } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import useCompanyProfile from "../hooks/useCompanyProfile";
import { API_BASE } from "../lib/api";

function fmt(n) {
  const v = Number(n || 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function EmployeePayslipModal({ employee, onClose }) {
  const { profile, loading, bust } = useCompanyProfile();
  if (!employee) return null;

  // cache-busted assets
  const logo = !loading ? bust(profile?.logo_url) : null;
  const stamp = !loading ? bust(profile?.stamp_url) : null;

  // Footer (single line)
  const footerLine = useMemo(() => {
    const bits = [
      profile?.company_name,
      profile?.address,
      profile?.email,
      profile?.phone,
      profile?.website,
    ].filter(Boolean);
    return bits.join(" | ");
  }, [profile]);

  const monthText = useMemo(() => {
    if (!employee?.period) return "";
    const d = new Date(employee.period);
    return isNaN(d.getTime())
      ? String(employee.period)
      : d.toLocaleDateString("en-KE", { year: "numeric", month: "long" });
  }, [employee?.period]);

  const {
    period = "",
    name = "",
    staff_no = "",
    job_title = "",
    email = "",
    bank_name = "",
    bank_account = "",
    gross_pay = 0,
    basic_salary = 0,
    house_allowance = 0,
    transport_allowance = 0,
    other_allowances = 0,
    commission = 0,
    bonus = 0,
    non_cash_benefit = 0,
    nssf = 0,
    shif = 0,
    ahl = 0,
    paye = 0,
    loan = 0,
    advance = 0,
    net_pay = 0,
    taxable_pay = 0,
  } = employee || {};

  const deductionsBeforeTax = (Number(nssf) || 0) + (Number(shif) || 0) + (Number(ahl) || 0);
  // Use taxable_pay from database instead of calculating it incorrectly
  const taxablePay = Number(taxable_pay) || 0;
  const deductionsAfterTax = (Number(loan) || 0) + (Number(advance) || 0);

  const emailThisPayslip = async () => {
    try {
      await axios.post(`${API_BASE}/payrolls/payslips/${employee.id}/email`);
      alert("Payslip email queued.");
    } catch (e) {
      alert(e?.response?.data?.detail || "Failed to email payslip");
    }
  };

  // NEW: client-side PDF that matches the on-screen layout 1:1
  const downloadClientPDF = async () => {
    const node = document.getElementById("payslip-print");
    if (!node) return;
    
    console.log("Starting PDF generation...");
    
    // Wait for images to load completely
    const images = node.querySelectorAll('img');
    console.log(`Found ${images.length} images`);
    
    for (let img of images) {
      if (!img.complete || img.naturalHeight === 0) {
        console.log(`Waiting for image to load: ${img.src}`);
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve; // Continue even if image fails
        });
      }
    }
    
    console.log("All images loaded, generating canvas...");
    
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: true, // Enable logging for debugging
      imageTimeout: 0, // Don't timeout on images
      removeContainer: false
    });
    
    console.log("Canvas generated, creating PDF...");
    
    const img = canvas.toDataURL("image/png");
    const pdf = new jsPDF("p", "mm", "a4");
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    pdf.addImage(img, "PNG", 0, 0, w, h);
    pdf.save(`Payslip_${staff_no}_${period?.slice(0,10)}.pdf`);
    
    console.log("PDF saved successfully!");
  };

  // Optional: keep backend password-protected PDF
  const downloadSecurePdf = () => {
    // Use payroll_id instead of employee.id
    const payroll_id = employee.payroll_id || employee.id;
    const url = `${API_BASE}/payrolls/payslips/${payroll_id}/pdf`;
    console.log("=== PDF Download Debug ===");
    console.log("API_BASE:", API_BASE);
    console.log("Employee object:", employee);
    console.log("Payroll ID:", payroll_id);
    console.log("Final URL:", url);
    console.log("========================");
    
    // Simply open the URL directly (like Download PDF button does)
    window.open(url, "_blank");
  };

  // Print using a new window (more reliable)
  const printThisPayslip = () => {
    console.log("Print function called");
    
    const payslipElement = document.getElementById("payslip-print");
    if (!payslipElement) {
      alert("Payslip content not found");
      return;
    }
    
    // Create new window for printing
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      alert("Print window blocked. Please allow popups and try again.");
      return;
    }
    
    // Get the payslip HTML
    const payslipHTML = payslipElement.innerHTML;
    
    // Create complete HTML document for printing
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Payslip_${staff_no}_${period?.slice(0,10)}</title>
          <style>
            @page { 
              size: A4 portrait; 
              margin: 15mm; 
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              margin: 0;
              padding: 20px;
              background: white;
              color: black;
            }
            .payslip-sheet {
              width: 100%;
              max-width: 210mm;
              background: white;
              margin: 0 auto;
            }
            /* Copy key styles from Tailwind */
            .text-center { text-align: center; }
            .font-semibold { font-weight: 600; }
            .font-bold { font-weight: bold; }
            .grid { display: grid; }
            .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .gap-2 { gap: 0.5rem; }
            .gap-6 { gap: 1.5rem; }
            .flex { display: flex; }
            .justify-between { justify-content: space-between; }
            .justify-center { justify-content: center; }
            .items-center { align-items: center; }
            .mx-auto { margin-left: auto; margin-right: auto; }
            .border { border: 1px solid #e5e7eb; }
            .border-t { border-top: 1px solid #e5e7eb; }
            .border-b { border-bottom: 1px solid #e5e7eb; }
            .border-b-4 { border-bottom: 4px solid #e5e7eb; }
            .border-double { border-style: double; }
            .rounded { border-radius: 0.25rem; }
            .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
            .py-1 { padding-top: 0.25rem; padding-bottom: 0.25rem; }
            .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
            .px-8 { padding-left: 2rem; padding-right: 2rem; }
            .pt-6 { padding-top: 1.5rem; }
            .pb-10 { padding-bottom: 2.5rem; }
            .mt-2 { margin-top: 0.5rem; }
            .mt-4 { margin-top: 1rem; }
            .mt-6 { margin-top: 1.5rem; }
            .mt-8 { margin-top: 2rem; }
            .mb-2 { margin-bottom: 0.5rem; }
            .text-sm { font-size: 0.875rem; }
            .text-xs { font-size: 0.75rem; }
            .text-base { font-size: 1rem; }
            .text-gray-600 { color: #6b7280; }
            .text-gray-700 { color: #374151; }
            .h-14 { height: 3.5rem; }
            .h-20 { height: 5rem; }
            .w-20 { width: 5rem; }
            .w-auto { width: auto; }
            .object-contain { object-fit: contain; }
            .col-span-2 { grid-column: span 2 / span 2; }
            img { 
              print-color-adjust: exact !important;
              -webkit-print-color-adjust: exact !important;
              max-width: 100%;
            }
          </style>
        </head>
        <body>
          <div class="payslip-sheet">
            ${payslipHTML}
          </div>
        </body>
      </html>
    `);
    
    printWindow.document.close();
    
    // Wait for content to load, then print
    setTimeout(() => {
      try {
        printWindow.focus();
        printWindow.print();
        console.log("Print dialog opened in new window");
        
        // Close the print window after printing
        setTimeout(() => {
          printWindow.close();
        }, 1000);
      } catch (error) {
        console.error("Print failed:", error);
        alert("Print failed: " + error.message);
      }
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      {/* Modal card */}
      <div className="bg-white rounded-lg shadow-xl w-full max-w-[220mm] relative max-h-[95vh] overflow-y-auto">
        {/* Top controls */}
        <div className="sticky top-0 z-10 bg-white border-b px-4 py-2 flex items-center justify-between">
          <div className="font-semibold">
            Payslip — <span className="text-gray-600">{staff_no}</span> — <span className="text-gray-600">{period?.slice(0,10)}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={printThisPayslip} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Print</button>
            <button onClick={emailThisPayslip} className="px-3 py-1 rounded bg-green-600 text-white text-sm">Email</button>
            <button onClick={downloadClientPDF} className="px-3 py-1 rounded bg-indigo-600 text-white text-sm">Download PDF</button>
            <button onClick={downloadSecurePdf} className="px-3 py-1 rounded bg-purple-600 text-white text-sm">Download Secure PDF</button>
            <button onClick={onClose} className="px-3 py-1 rounded bg-gray-700 text-white text-sm">Close</button>
          </div>
        </div>

        {/* A4 sheet (same layout as your display) */}
        <div className="p-4">
          <div id="payslip-print" className="payslip-sheet mx-auto bg-white border rounded shadow-sm">
            {/* Header: centered logo only */}
            <div className="pt-6 px-8">
              {logo && (
                <div className="w-full text-center">
                  <img src={logo} alt="Company Logo" className="h-14 w-auto mx-auto" onError={(e) => (e.currentTarget.style.display = "none")} />
                </div>
              )}
              <div className="text-center mt-2 text-base font-semibold">{profile?.company_name || ""}</div>
            </div>

            {/* Title */}
            <div className="mt-4 text-center font-semibold">Payslip {monthText ? `for the month of ${monthText}` : ""}</div>

            {/* Employee details */}
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm px-8">
              <div><b>Name:</b> {name}</div>
              <div><b>Staff No:</b> {staff_no}</div>
              <div><b>Job Title:</b> {job_title || "-"}</div>
              <div><b>Email:</b> {email || "-"}</div>
              <div><b>Pay Period:</b> {period?.slice(0,10)}</div>
              <div><b>Payslip No:</b> SLIP{String(employee.payroll_id || employee.id).padStart(4, '0')}</div>
              <div><b>Bank:</b> {bank_name || "-"}</div>
              <div><b>Bank A/C:</b> {bank_account || "-"}</div>
            </div>

            {/* Earnings & Deductions */}
            <div className="mt-6 grid grid-cols-2 gap-6 text-sm px-8">
              {/* Earnings */}
              <div>
                <div className="font-semibold mb-2">EARNINGS</div>
                <div className="border rounded">
                  <div className="flex justify-between px-3 py-1 border-b"><span>Basic Salary</span><span>{fmt(basic_salary)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>House Allowance</span><span>{fmt(house_allowance)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>Transport Allowance</span><span>{fmt(transport_allowance)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>Other Allowances</span><span>{fmt(other_allowances)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>Commission</span><span>{fmt(commission)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>Bonus</span><span>{fmt(bonus)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>Non-Cash Benefit</span><span>{fmt(non_cash_benefit)}</span></div>

                  {/* Gross row: single top border + double line below, bold */}
                  <div className="px-3 py-2 border-t font-bold">
                    <div className="flex justify-between">
                      <span>GROSS PAY</span>
                      <span>{fmt(gross_pay)}</span>
                    </div>
                    <div className="border-b-4 border-double mt-1"></div>
                  </div>
                </div>
              </div>

              {/* Deductions */}
              <div>
                <div className="font-semibold mb-2">DEDUCTIONS</div>
                <div className="border rounded">
                  <div className="flex justify-between px-3 py-1 border-b"><span>N.S.S.F.</span><span>{fmt(nssf)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>S.H.I.F.</span><span>{fmt(shif)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>A.H.L.</span><span>{fmt(ahl)}</span></div>

                  <div className="px-3 py-2 border-t font-bold">
                    <div className="flex justify-between">
                      <span>Total Deductions Before Tax</span>
                      <span>{fmt(deductionsBeforeTax)}</span>
                    </div>
                    <div className="border-b-4 border-double mt-1"></div>
                  </div>

                  <div className="flex justify-between px-3 py-1 border-b"><span>Taxable Pay</span><span>{fmt(taxablePay)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>P.A.Y.E.</span><span>{fmt(paye)}</span></div>

                  <div className="flex justify-between px-3 py-1 border-b"><span>Loan</span><span>{fmt(loan)}</span></div>
                  <div className="flex justify-between px-3 py-1 border-b"><span>Advance</span><span>{fmt(advance)}</span></div>

                  <div className="px-3 py-2 border-t font-bold">
                    <div className="flex justify-between">
                      <span>Total Deductions After Tax</span>
                      <span>{fmt(deductionsAfterTax)}</span>
                    </div>
                    <div className="border-b-4 border-double mt-1"></div>
                  </div>

                  <div className="px-3 py-2 border-t font-bold text-base">
                    <div className="flex justify-between">
                      <span>NET PAY</span>
                      <span>{fmt(net_pay)}</span>
                    </div>
                    <div className="border-b-4 border-double mt-1"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Stamp bottom-left + created */}
            <div className="mt-8 px-8 flex items-center gap-6">
              {stamp ? (
                <img
                  src={stamp}
                  alt="Company Stamp"
                  className="h-20 w-20 object-contain border rounded bg-white p-1"
                  onError={(e) => (e.currentTarget.style.display = "none")}
                />
              ) : (
                <div className="border border-dashed border-gray-400 w-32 h-20 flex items-center justify-center text-gray-500">
                  Stamp
                </div>
              )}
              <div className="text-sm text-gray-600">Created: {new Date().toLocaleDateString()}</div>
            </div>

            {/* Footer: single line */}
            <div className="px-8 pt-6 pb-10">
              <div className="border-t pt-2 text-xs text-center text-gray-700">{footerLine}</div>
            </div>
          </div>
        </div>
      </div>

      {/* PRINT CSS: A4 portrait, hide modal chrome, fit page */}
      <style>{`
        @page { 
          size: A4 portrait; 
          margin: 15mm 10mm; 
        }
        @media print {
          /* Hide everything except payslip */
          body * { visibility: hidden; }
          #payslip-print, #payslip-print * { visibility: visible; }
          
          /* Reset modal positioning for print */
          .fixed { position: static !important; }
          .inset-0 { position: static !important; }
          
          /* Hide modal background and controls */
          .bg-black\\/40, .bg-black { background: transparent !important; }
          .border-b { display: none !important; } /* top controls */
          .rounded-lg { border-radius: 0 !important; }
          .shadow-xl { box-shadow: none !important; }
          .max-w-\\[220mm\\] { max-width: none !important; }
          .max-h-\\[95vh\\] { max-height: none !important; }
          .overflow-y-auto { overflow: visible !important; }
          
          /* Payslip specific print styles */
          #payslip-print { 
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            box-shadow: none !important; 
            border: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          
          /* Ensure images print */
          img { 
            print-color-adjust: exact !important;
            -webkit-print-color-adjust: exact !important;
          }
        }
        .payslip-sheet { 
          width: 210mm; 
          min-height: 297mm; 
          padding: 6mm; 
          background: white; 
          page-break-inside: avoid;
        }
      `}</style>
    </div>
  );
}
