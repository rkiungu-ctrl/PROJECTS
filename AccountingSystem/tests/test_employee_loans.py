import json
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_create_or_update_loan():
    # create a loan via the employee update endpoint using JSON string in form
    loans = [{
        "reference_no": "LN-TEST-PY",
        "loan_type": "Loan",
        "principal_amount": 1000.0
    }]
    resp = client.put("/employees/TNL005", data={"loans": json.dumps(loans)})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "loans" in data
    assert any(l.get("reference_no") == "LN-TEST-PY" for l in data.get("loans", [])), data.get("loans")


def test_update_loan_principal():
    # update the same loan by reference_no
    loans = [{
        "reference_no": "LN-TEST-PY",
        "loan_type": "Loan",
        "principal_amount": 2000.0
    }]
    resp = client.put("/employees/TNL005", data={"loans": json.dumps(loans)})
    assert resp.status_code == 200, resp.text
    data = resp.json()
    for l in data.get("loans", []):
        if l.get("reference_no") == "LN-TEST-PY":
            # principal_amount is serialized as float
            assert float(l.get("principal_amount")) == 2000.0
            return
    assert False, "updated loan not found"
