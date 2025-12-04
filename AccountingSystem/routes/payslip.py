# routes/payslips.py
from datetime import date
import io
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from openpyxl import Workbook
from openpyxl.styles import Font

from database import get_db
import models
from models.company import CompanyProfile
from routes.company import _to_response

router = APIRouter(prefix="/payslips", tags=["Payroll"])
templates = Jinja2Templates(directory="templates")


def _abs_static_url(request: Request, maybe_static_path: Optional[str]) -> Optional[str]:
    """
    Convert '/static/...' or relative paths to absolute URLs like
    'http://127.0.0.1:8000/static/...'. If already absolute or None, return as-is.
    """
    if not maybe_static_path:
        return None
    lower = maybe_static_path.lower()
    if lower.startswith("http://") or lower.startswith("https://"):
        return maybe_static_path
    if maybe_static_path.startswith("/static/"):
        path = maybe_static_path[len("/static/") :]
        return str(request.url_for("static", path=path))
    # treat any other relative like 'company_logo/foo.png' or 'company_stamp/foo.png'
    return str(request.url_for("static", path=maybe_static_path))


@router.get("/")
def get_payslip(
    staff_no: str,
    period: date,
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    payroll = (
        db.query(models.Payroll)
        .filter(models.Payroll.employee_id == employee.id)
        .filter(models.Payroll.period == period)
        .first()
    )
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll not found")

    payslip = {
        "employee_name": employee.name,
        "staff_no": employee.staff_no,
        "id_number": employee.id_number,
        "period": str(payroll.period),
        "earnings": {
            "basic_salary": payroll.basic_salary,
            "house_allowance": payroll.house_allowance,
            "transport_allowance": payroll.transport_allowance,
            "other_allowances": payroll.other_allowances,
            "commission": payroll.commission,
            "bonus": payroll.bonus,
        },
        "deductions": {
            "shif": payroll.shif,
            "nssf": payroll.nssf,
            "ahl": payroll.ahl,
            "paye": payroll.paye,
            "non_cash_benefit": getattr(payroll, 'non_cash_benefit', 0.0),
            "loan": payroll.loan,
            "advance": payroll.advance,
        },
        "summary": {
            "gross_pay": payroll.gross_pay,
            "taxable_pay": payroll.taxable_pay,
            "relief": getattr(payroll, "relief", 2400),
            "net_pay": payroll.net_pay,
        },
    }
    return payslip


@router.get("/html", response_class=HTMLResponse)
def view_payslip_html(
    request: Request,
    staff_no: str,
    period: date,
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    payroll = (
        db.query(models.Payroll)
        .filter(models.Payroll.employee_id == employee.id)
        .filter(models.Payroll.period == period)
        .first()
    )
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll not found")

    company_obj = db.query(CompanyProfile).first()
    company = _to_response(company_obj) if company_obj else None

    # Make image URLs absolute for the browser
    if company:
        if getattr(company, "logo_url", None):
            company.logo_url = _abs_static_url(request, company.logo_url)
        if getattr(company, "stamp_url", None):
            company.stamp_url = _abs_static_url(request, company.stamp_url)

    return templates.TemplateResponse(
        "payslip.html",
        {
            "request": request,
            "employee": employee,
            "payroll": payroll,
            "non_cash_benefit": getattr(payroll, 'non_cash_benefit', 0.0),
            "company": company,
            "relief": getattr(payroll, "relief", 2400),
            "ahl_employer": payroll.ahl_employer,
            "nssf_employer": payroll.nssf_employer,
            "nita_employer": payroll.nita_employer,
        },
    )


@router.get("/pdf")
def download_payslip_pdf(
    request: Request,
    staff_no: str,
    period: date,
    db: Session = Depends(get_db),
):
    employee = db.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    payroll = (
        db.query(models.Payroll)
        .filter(models.Payroll.employee_id == employee.id)
        .filter(models.Payroll.period == period)
        .first()
    )
    if not payroll:
        raise HTTPException(status_code=404, detail="Payroll not found")

    company_obj = db.query(CompanyProfile).first()
    company = _to_response(company_obj) if company_obj else None

    # Absolute URLs so WeasyPrint can fetch images
    if company:
        if getattr(company, "logo_url", None):
            company.logo_url = _abs_static_url(request, company.logo_url)
        if getattr(company, "stamp_url", None):
            company.stamp_url = _abs_static_url(request, company.stamp_url)

    rendered_html = templates.get_template("payslip.html").render(
        {
            "request": request,
            "employee": employee,
            "payroll": payroll,
            "company": company,
            "relief": getattr(payroll, "relief", 2400),
            "ahl_employer": payroll.ahl_employer,
            "nssf_employer": payroll.nssf_employer,
            "nita_employer": payroll.nita_employer,
        }
    )
    # Server-side PDF generation via WeasyPrint has been disabled to avoid
    # runtime crashes on platforms without the WeasyPrint native deps (eg
    # Windows). If you need a PDF endpoint later, switch to Playwright or
    # re-enable WeasyPrint in a Linux/WSL environment. For now return a
    # clear 501 so clients know to use the frontend (html2canvas/jspdf)
    # or a separate backend rendering service.
    raise HTTPException(
        status_code=501,
        detail=(
            "Server-side PDF generation is disabled. Use the front-end html2canvas/jspdf "
            "workflow or enable Playwright/WeasyPrint on the server."
        ),
    )


@router.get("/export")
def export_payslips_xlsx(
    period: date,
    db: Session = Depends(get_db),
):
    query = (
        db.query(models.Payroll)
        .join(models.Employee)
        .filter(models.Payroll.period == period)
        .order_by(models.Employee.staff_no.asc())
    )
    payrolls = query.all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Payslips"

    headers = [
        "Staff No",
        "Employee Name",
        "Period",
        "Basic",
        "House",
        "Transport",
        "Other",
        "Commission",
        "Bonus",
        "Gross",
        "Taxable",
        "SHIF",
        "NSSF",
        "PAYE",
        "AHL",
        "Non-Cash Benefit",
        "Loan",
        "Advance",
        "Net Pay",
    ]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)

    totals = {k: 0 for k in ["gross", "taxable", "shif", "nssf", "paye", "ahl", "loan", "advance", "net"]}

    for record in payrolls:
        employee = db.query(models.Employee).filter(models.Employee.id == record.employee_id).first()
        ws.append(
            [
                employee.staff_no,
                employee.name,
                str(record.period),
                record.basic_salary,
                record.house_allowance,
                record.transport_allowance,
                record.other_allowances,
                record.commission,
                record.bonus,
                record.gross_pay,
                record.taxable_pay,
                record.shif,
                record.nssf,
                record.paye,
                    record.ahl,
                    getattr(record, 'non_cash_benefit', 0.0),
                record.loan,
                record.advance,
                record.net_pay,
            ]
        )
        totals["gross"] += record.gross_pay
        totals["taxable"] += record.taxable_pay
        totals["shif"] += record.shif
        totals["nssf"] += record.nssf
        totals["paye"] += record.paye
        totals["ahl"] += record.ahl
        totals["loan"] += record.loan
        totals["advance"] += record.advance
        totals["net"] += record.net_pay

    ws.append(
        [
            "GRAND TOTALS",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            totals["gross"],
            totals["taxable"],
            totals["shif"],
            totals["nssf"],
            totals["paye"],
            totals["ahl"],
            totals["loan"],
            totals["advance"],
            totals["net"],
        ]
    )
    for cell in ws[ws.max_row]:
        cell.font = Font(bold=True)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"payslips_summary_{period}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
