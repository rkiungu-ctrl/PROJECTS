import requests
base='http://127.0.0.1:8000'
staff='TNL001'

# 1. Update HR: head_of
r = requests.put(f'{base}/employees/{staff}/hr', data={'head_of':'Head of Sales','job_title':'Chief Test'})
print('HR update', r.status_code)
print(r.json().get('head_of'), r.json().get('job_title'))

# 2. Update salary
r = requests.put(f'{base}/employees/{staff}/salary', data={'basic_salary':'200000','salary_processing_method':'Bank','deduct_shif':'true'})
print('Salary update', r.status_code)
print('basic_salary', r.json().get('basic_salary'), 'salary_processing_method', r.json().get('salary_processing_method'))

# 3. Update contact
r = requests.put(f'{base}/employees/{staff}/contact', data={'personal_email':'newemail@example.com','phone':'0123456789'})
print('Contact update', r.status_code)
print(r.json().get('personal_email'), r.json().get('phone'))

# 4. Update next_of_kin - send raw JSON string in body
nok = [{'name':'Tester','relation':'Friend','phone':'0700000000','email':'t@test.com'}]
r = requests.put(f'{base}/employees/{staff}/next_of_kin', data=str(nok))
print('Next of kin update', r.status_code)
print('next_of_kin raw', r.json().get('next_of_kin')[:200])

# Final get
r = requests.get(f'{base}/employees/{staff}')
print('Final GET status', r.status_code)
print('head_of', r.json().get('head_of'))
print('basic_salary', r.json().get('basic_salary'))
print('personal_email', r.json().get('personal_email'))
print('next_of_kin', r.json().get('next_of_kin'))
