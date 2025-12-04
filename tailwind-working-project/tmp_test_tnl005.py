import requests
import json

BASE = 'http://127.0.0.1:8000'
STAFF = 'TNL005'

session = requests.Session()

print('GET before:')
r = session.get(f"{BASE}/employees/{STAFF}")
print('STATUS', r.status_code)
try:
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print('No JSON:', e)

# Update personal name
print('\nPUT personal (name=AUTOMATION TEST)')
r = session.put(f"{BASE}/employees/{STAFF}", data={'name':'AUTOMATION TEST'})
print('STATUS', r.status_code)
try:
    print(r.json())
except:
    print(r.text)

# Update HR slice
print('\nPUT hr (head_of, job_title)')
r = session.put(f"{BASE}/employees/{STAFF}/hr", data={'head_of':'Automation Dept','job_title':'Automation Engineer'})
print('STATUS', r.status_code)
try:
    print(r.json())
except:
    print(r.text)

# Update salary slice
print('\nPUT salary (basic_salary)')
r = session.put(f"{BASE}/employees/{STAFF}/salary", data={'basic_salary':'55555', 'salary_processing_method':'Bank', 'deduct_shif':'true'})
print('STATUS', r.status_code)
try:
    print(r.json())
except:
    print(r.text)

# Update contact
print('\nPUT contact (personal_email, phone)')
r = session.put(f"{BASE}/employees/{STAFF}/contact", data={'personal_email':'tnl005.automation@example.com','phone':'0712345678'})
print('STATUS', r.status_code)
try:
    print(r.json())
except:
    print(r.text)

# Update next_of_kin (send JSON string as text/plain)
print('\nPUT next_of_kin (raw JSON string)')
nok = [
    {"name":"Test NOK","relationship":"Spouse","phone":"0700000000","id_number":"A123456"}
]
headers = {'Content-Type':'text/plain'}
r = session.put(f"{BASE}/employees/{STAFF}/next_of_kin", data=json.dumps(nok), headers=headers)
print('STATUS', r.status_code)
try:
    print(r.json())
except:
    print(r.text)

print('\nGET after:')
r = session.get(f"{BASE}/employees/{STAFF}")
print('STATUS', r.status_code)
try:
    print(json.dumps(r.json(), indent=2))
except Exception as e:
    print('No JSON:', e)
