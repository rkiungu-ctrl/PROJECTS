import urllib.request, json

URL = 'http://127.0.0.1:8000/payroll-settings/paye/'

def main():
    try:
        with urllib.request.urlopen(URL, timeout=5) as r:
            body = r.read().decode('utf-8')
            print('STATUS', r.status)
            print('BODY', body[:2000])
    except Exception as e:
        print('ERROR', e)

if __name__ == '__main__':
    main()
