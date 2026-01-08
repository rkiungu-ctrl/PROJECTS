import argparse
import requests

def repost_year(year: int, start: int = 1, end: int = 12, base: str = 'http://127.0.0.1:8000'):
    created = 0
    errors = 0
    for m in range(start, end + 1):
        period = f"{year}-{m:02d}-01"
        try:
            r = requests.post(f"{base}/payrolls/{period}/post-to-journal", params={"overwrite": True}, timeout=30)
            print(f"{period} -> {r.status_code} {r.text[:120]}")
            if r.status_code == 200:
                created += 1
            else:
                errors += 1
        except Exception as e:
            print(f"{period} -> error: {e}")
            errors += 1
    print(f"Done: updated={created}, errors={errors}")

if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Re-post payroll journals for a year with overwrite=true')
    ap.add_argument('--year', type=int, required=True)
    ap.add_argument('--start', type=int, default=1)
    ap.add_argument('--end', type=int, default=12)
    ap.add_argument('--api', type=str, default='http://127.0.0.1:8000')
    args = ap.parse_args()
    repost_year(args.year, args.start, args.end, args.api)
