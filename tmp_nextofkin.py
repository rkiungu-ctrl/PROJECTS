import requests, json
base='http://127.0.0.1:8000'
staff='TNL001'

nok = [{'name':'Tester','relation':'Friend','phone':'0700000000','email':'t@test.com'}]
headers = {'Content-Type':'text/plain'}
r = requests.put(f'{base}/employees/{staff}/next_of_kin', data=json.dumps(nok), headers=headers)
print('status', r.status_code)
print('resp', r.text[:400])

r = requests.get(f'{base}/employees/{staff}')
print('final next_of_kin', r.json().get('next_of_kin'))
