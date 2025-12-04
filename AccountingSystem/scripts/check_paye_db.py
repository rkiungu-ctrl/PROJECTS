import sqlite3

DB = 'c:/PROJECTS/AccountingSystem/accounting_system.db'

def main():
    conn = sqlite3.connect(DB)
    cur = conn.cursor()
    try:
        cur.execute('SELECT id, start_date, end_date, personal_relief, insurance_relief_rate, insurance_relief_cap FROM paye_tables')
        tables = cur.fetchall()
        cur.execute('SELECT id, table_id, lower, upper, rate FROM paye_bands')
        bands = cur.fetchall()
        print('TABLES_COUNT:', len(tables))
        for t in tables[:5]:
            print('T:', t)
        print('BANDS_COUNT:', len(bands))
        for b in bands[:10]:
            print('B:', b)
    except Exception as e:
        print('ERROR:', e)
    finally:
        conn.close()

if __name__ == '__main__':
    main()
