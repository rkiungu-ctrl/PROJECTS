import requests
r = requests.put('http://127.0.0.1:8000/employees/TNL001', data={'name':'COLLINS TEST'})
print(r.status_code)
print(r.text[:2000])
