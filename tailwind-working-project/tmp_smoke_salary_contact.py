import requests, json
BASE='http://127.0.0.1:8000'
STAFF='TNL005'
print('Salary PUT')
fd = {'basic_salary':'60000','employment_type':'Intern','salary_processing_method':'Cash','deduct_shif':'false'}
r = requests.put(f'{BASE}/employees/{STAFF}/salary', data=fd)
print(r.status_code)
print(r.text[:800])
print('\nContact PUT')
fd2 = {'personal_email':'tnl005.postfix@example.com','phone':'0790000000'}
r2 = requests.put(f'{BASE}/employees/{STAFF}/contact', data=fd2)
print(r2.status_code)
print(r2.text[:800])
print('\nGET final')
r3 = requests.get(f'{BASE}/employees/{STAFF}')
print(r3.status_code)
print(json.dumps(r3.json(), indent=2)[:1600])
