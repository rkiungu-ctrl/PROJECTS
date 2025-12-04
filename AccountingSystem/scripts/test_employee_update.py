import requests
import json

BASE = 'http://127.0.0.1:8000'
STAFF = 'TNL005'

def p(resp):
    print('STATUS:', resp.status_code)
    try:
        print(json.dumps(resp.json(), indent=2)[:2000])
    except Exception:
        print(resp.text[:2000])

print('=== PERSONAL UPDATE ===')
try:
    r = requests.put(f"{BASE}/employees/{STAFF}", data={
        'name':'TEST NAME',
        'gender':'Other',
        'date_of_birth':'1990-01-01',
        'id_number':'999999',
        'kra_pin':'TESTKRA',
        'nssf_number':'NN123',
        'nhif_number':'NH123',
    })
    p(r)
except Exception as e:
    print('ERROR', e)

print('\n=== SALARY UPDATE ===')
try:
    sal_data = {
        'basic_salary':'78000',
        'employment_type':'Fixed Term',
        'payment_currency':'KES',
    }
    files = {
        'benefits': (None, json.dumps([{'type':'Test Benefit','amount':123}])),
        'earnings': (None, json.dumps([{'type':'Test Earning','amount':456}]))
    }
    r2 = requests.put(f"{BASE}/employees/{STAFF}/salary", data=sal_data, files=files)
    p(r2)
except Exception as e:
    print('ERROR', e)

print('\n=== HR UPDATE ===')
try:
    r3 = requests.put(f"{BASE}/employees/{STAFF}/hr", data={
        'job_title':'Test Role','department':'Test Dept','reports_to':'TNL001','head_of':'Finance'
    })
    p(r3)
except Exception as e:
    print('ERROR', e)

print('\n=== CONTACT UPDATE ===')
try:
    r4 = requests.put(f"{BASE}/employees/{STAFF}/contact", data={
        'personal_email':'test@example.com','official_email':'official@example.com','phone':'0700000000','address':'Test address','city':'Test City'
    })
    p(r4)
except Exception as e:
    print('ERROR', e)

print('\n=== NEXT OF KIN UPDATE ===')
try:
    nok = json.dumps([{'name':'Kin A','relation':'Son'},{'name':'Kin B','relation':'Daughter'}])
    r5 = requests.put(f"{BASE}/employees/{STAFF}/next_of_kin", data=nok, headers={'Content-Type':'text/plain'})
    p(r5)
except Exception as e:
    print('ERROR', e)

print('\n=== MAIN UPDATE WITH LOANS FIELD ===')
try:
    loans_json = json.dumps([{'loan_type':'Loan','reference_no':'LN-TEST','principal_amount':'1000'}])
    r6 = requests.put(f"{BASE}/employees/{STAFF}", data={'name':'TEST NAME'}, files={'loans':(None, loans_json)})
    p(r6)
except Exception as e:
    print('ERROR', e)

print('\n=== GET EMPLOYEE ===')
try:
    rget = requests.get(f"{BASE}/employees/{STAFF}")
    p(rget)
except Exception as e:
    print('ERROR', e)
