import json
import sys
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def create_or_update_loan():
    loans = [{
        "reference_no": "LN-TEST-PY",
        "loan_type": "Loan",
        "principal_amount": 1000.0
    }]
    resp = client.put("/employees/TNL005", data={"loans": json.dumps(loans)})
    if resp.status_code != 200:
        print("create_or_update_loan FAILED: status", resp.status_code, resp.text)
        return False
    data = resp.json()
    if not any(l.get("reference_no") == "LN-TEST-PY" for l in data.get("loans", [])):
        print("create_or_update_loan FAILED: loan not present", data.get("loans"))
        return False
    print("create_or_update_loan OK")
    return True


def update_loan_principal():
    loans = [{
        "reference_no": "LN-TEST-PY",
        "loan_type": "Loan",
        "principal_amount": 2000.0
    }]
    resp = client.put("/employees/TNL005", data={"loans": json.dumps(loans)})
    if resp.status_code != 200:
        print("update_loan_principal FAILED: status", resp.status_code, resp.text)
        return False
    data = resp.json()
    for l in data.get("loans", []):
        if l.get("reference_no") == "LN-TEST-PY":
            if float(l.get("principal_amount", 0)) == 2000.0:
                print("update_loan_principal OK")
                return True
            else:
                print("update_loan_principal FAILED: principal not updated", l)
                return False
    print("update_loan_principal FAILED: updated loan not found")
    return False


if __name__ == '__main__':
    ok = create_or_update_loan()
    ok = ok and update_loan_principal()
    if not ok:
        sys.exit(1)
    print("ALL OK")
    sys.exit(0)
