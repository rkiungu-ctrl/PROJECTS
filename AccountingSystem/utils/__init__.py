from datetime import datetime

def parse_date(date_str):
    return datetime.strptime(date_str, "%Y-%m-%d").date()

def to_ymd(dt):
    return dt.strftime("%Y-%m-%d")