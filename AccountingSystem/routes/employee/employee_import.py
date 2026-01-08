# routes/employee_import.py

from fastapi import APIRouter, UploadFile, File, Depends
import csv
from sqlalchemy.orm import Session
from database import get_db
from models.employee import Employee

router = APIRouter()

def parse_float(val):
    if val is None:
        return 0.0
    try:
        return float(str(val).replace(",", "").strip() or 0)
    except ValueError:
        return 0.0

@router.post("/upload")
async def import_employees(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    decoded = content.decode("utf-8").splitlines()
    reader = csv.DictReader(decoded)
    added = 0
    skipped_existing = 0
    for row in reader:
        if not row.get("staff_no") or not row.get("name"):
            continue
        staff_no = row.get("staff_no")
        if db.query(Employee).filter_by(staff_no=staff_no).first():
            skipped_existing += 1
            continue
        # routes/employee_import.py – change email= to personal_email=
# ...
        emp = Employee(
            staff_no=staff_no,
            name=row.get("name"),
            phone=row.get("phone"),
            personal_email=row.get("email"),  # <-- map CSV "email" to personal_email
            kra_pin=row.get("kra_pin"),
            id_number=row.get("id_number"),
            nssf_number=row.get("nssf_number"),
            nhif_number=row.get("nhif_number"),
            bank_name=row.get("bank_name"),
            bank_account=row.get("bank_account"),
            branch_name=row.get("branch_name"),
            branch_code=row.get("branch_code"),
            basic_salary=parse_float(row.get("basic_salary")),
            house_allowance=parse_float(row.get("house_allowance")),
            transport_allowance=parse_float(row.get("transport_allowance")),
            other_allowances=parse_float(row.get("other_allowances")),
            commission=parse_float(row.get("commission")),
            bonus=parse_float(row.get("bonus")),
            is_director=str(row.get("is_director", "")).lower() in ("1", "true", "yes"),
            employment_type=row.get("employment_type")
        )

        
        db.add(emp)
        added += 1
    db.commit()
    return {"message": "Import complete", "added": added, "skipped_existing": skipped_existing}
