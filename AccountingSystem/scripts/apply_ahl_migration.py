import sqlite3
import pathlib

DB = pathlib.Path(__file__).resolve().parents[1] / 'accounting_system.db'
SQL = pathlib.Path(__file__).resolve().parents[1] / 'migrations' / '001_add_ahl_tables.sql'

def main():
    print('DB:', DB)
    print('SQL:', SQL)
    sql = SQL.read_text()
    conn = sqlite3.connect(str(DB))
    try:
        cur = conn.cursor()
        cur.executescript(sql)
        conn.commit()
        print('Applied migration')
    finally:
        conn.close()

if __name__ == '__main__':
    main()
