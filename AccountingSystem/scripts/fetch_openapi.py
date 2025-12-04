import urllib.request, json

URL = 'http://127.0.0.1:8000/openapi.json'

def main():
    try:
        with urllib.request.urlopen(URL, timeout=5) as r:
            body = r.read().decode('utf-8')
            data = json.loads(body)
            print('PATHS KEYS:', list(data.get('paths', {}).keys())[:50])
    except Exception as e:
        print('ERROR', e)

if __name__ == '__main__':
    main()
