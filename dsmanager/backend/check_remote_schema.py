#!/usr/bin/env python3
"""Check remote database schema via port forward"""
import psycopg2

conn = psycopg2.connect(
    host='127.0.0.1',
    port=43702,
    user='_976c550b51a37267',
    password='_0dec1b59e12aaaa4209378e4ce5da2',
    dbname='_7ba42ccb83ab',
    sslmode='require'
)
cur = conn.cursor()

# Get all tables
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
""")
print('=== TABLES IN DATABASE ===')
tables = [row[0] for row in cur.fetchall()]
for t in tables:
    print(f'  {t}')

# Get columns for key tables
print('\n=== KEY TABLE COLUMNS ===')
key_tables = ['users', 'projects', 'conversations', 'prompt_sessions', 'prompt_versions', 'ai_suggestions']
for table_name in key_tables:
    if table_name in tables:
        cur.execute("""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = %s
            ORDER BY ordinal_position
        """, (table_name,))
        print(f'\n{table_name}:')
        for row in cur.fetchall():
            print(f'  - {row[0]} ({row[1]})')
    else:
        print(f'\n{table_name}: TABLE MISSING!')

# Get row counts
print('\n=== ROW COUNTS ===')
for t in tables:
    try:
        cur.execute(f'SELECT COUNT(*) FROM "{t}"')
        count = cur.fetchone()[0]
        print(f'  {t}: {count} rows')
    except Exception as e:
        print(f'  {t}: ERROR - {e}')

cur.close()
conn.close()
print('\n=== SCHEMA CHECK COMPLETE ===')
