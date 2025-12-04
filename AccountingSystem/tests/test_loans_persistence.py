import json
from fastapi.testclient import TestClient
from main import app
from database import SessionLocal
import models
from models.loan_advance import LoanAdvance


def setup_test_employee(session, staff_no="TST001"):
    # remove existing employee with same staff_no to keep test idempotent
    existing = session.query(models.Employee).filter(models.Employee.staff_no == staff_no).first()
    if existing:
        # delete linked loans/advances first
        session.query(LoanAdvance).filter(LoanAdvance.employee_id == existing.id).delete()
        session.delete(existing)
        session.commit()

    emp = models.Employee(staff_no=staff_no, name="Test Employee")
    session.add(emp)
    session.commit()
    session.refresh(emp)
    return emp


def test_put_employee_with_loans_persists_to_db():
    session = SessionLocal()
    try:
        emp = setup_test_employee(session)
        client = TestClient(app)

        loans = [
            {
                "loan_type": "Personal",
                "reference_no": "T1-REF",
                "principal_amount": 1500,
                "date_issued": "2020-01-01",
            }
        ]

        # Send as multipart non-file part (frontend uses files={'loans': (None, json)})
        resp = client.put(f"/employees/{emp.staff_no}", files={"loans": (None, json.dumps(loans))})
        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert "loans" in data
        assert isinstance(data["loans"], list)
        assert len(data["loans"]) == 1
        loan_item = data["loans"][0]
        assert loan_item.get("reference_no") == "T1-REF"
        assert float(loan_item.get("principal_amount", 0)) == 1500.0

        # Now verify directly in DB
        db_loan = session.query(LoanAdvance).filter(LoanAdvance.reference_no == "T1-REF", LoanAdvance.employee_id == emp.id).first()
        assert db_loan is not None
        assert float(db_loan.principal_amount) == 1500.0
    finally:
        # cleanup
        try:
            obj = session.query(models.Employee).filter(models.Employee.staff_no == "TST001").first()
            if obj:
                session.query(LoanAdvance).filter(LoanAdvance.employee_id == obj.id).delete()
                session.delete(obj)
                session.commit()
        except Exception:
            session.rollback()
        session.close()
