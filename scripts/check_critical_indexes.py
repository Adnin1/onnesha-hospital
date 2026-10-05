import os
import glob
import re
from collections import defaultdict

MIGRATIONS_DIR = 'supabase/migrations'

CRITICAL_TABLES = [
    'invoices', 'invoice_items', 'payments', 'refunds',
    'journal_entries', 'journal_entry_lines', 'chart_of_accounts',
    'patients', 'patient_visits', 'appointments', 'prescriptions',
    'prescription_items', 'diagnostic_orders', 'diagnostic_order_items',
    'diagnostic_results', 'beds', 'bed_assignments', 'wards',
    'medicines', 'medicine_batches', 'stock_transactions',
    'goods_receipt_notes', 'goods_receipt_items', 'purchase_requisitions',
    'purchase_requisition_items', 'inventory_items', 'inventory_transactions',
    'audit_logs', 'waiting_queue', 'token_counters'
]

def check_critical_indexes():
    migration_files = sorted(glob.glob(os.path.join(MIGRATIONS_DIR, '*.sql')))
    
    table_indexes = defaultdict(list)
    table_columns = defaultdict(set)
    foreign_keys = defaultdict(list)

    for fpath in migration_files:
        with open(fpath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()

        # Track columns
        for m in re.finditer(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s*\((.*?)\);', content, re.IGNORECASE | re.DOTALL):
            tbl = m.group(1).lower()
            if tbl in CRITICAL_TABLES:
                body = m.group(2)
                for line in body.split('\n'):
                    line = line.strip()
                    if line and not line.startswith('--') and not line.upper().startswith(('CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK')):
                        col_m = re.match(r'([a-zA-Z0-9_]+)', line)
                        if col_m:
                            table_columns[tbl].add(col_m.group(1).lower())

        for m in re.finditer(r'ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?(?:public\.)?([a-zA-Z0-9_]+)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)', content, re.IGNORECASE):
            tbl = m.group(1).lower()
            if tbl in CRITICAL_TABLES:
                table_columns[tbl].add(m.group(2).lower())

        # Track indexes
        for m in re.finditer(r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+ON\s+(?:public\.)?([a-zA-Z0-9_]+)(?:\s+USING\s+[a-zA-Z0-9_]+)?\s*\((.*?)\)', content, re.IGNORECASE):
            idx_name = m.group(1)
            tbl = m.group(2).lower()
            if tbl in CRITICAL_TABLES:
                raw_cols = m.group(3)
                cols = [re.split(r'\s+', c.strip())[0].lower() for c in raw_cols.split(',')]
                table_indexes[tbl].append((idx_name, cols))

        # Track FKs
        for m in re.finditer(r'([a-zA-Z0-9_]+)\s+[a-zA-Z0-9_]+(?:\([0-9,\s]+\))?\s+REFERENCES\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([a-zA-Z0-9_]+)\)', content, re.IGNORECASE):
            col = m.group(1).lower()
            ref_tbl = m.group(2).lower()
            pre_text = content[:m.start()]
            tbl_match = re.findall(r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)', pre_text, re.IGNORECASE)
            tbl = tbl_match[-1].lower() if tbl_match else 'unknown'
            if tbl in CRITICAL_TABLES:
                foreign_keys[tbl].append((col, ref_tbl))

        for m in re.finditer(r'FOREIGN\s+KEY\s*\(([a-zA-Z0-9_,\s]+)\)\s*REFERENCES\s+(?:public\.)?([a-zA-Z0-9_]+)\s*\(([a-zA-Z0-9_,\s]+)\)', content, re.IGNORECASE):
            cols = [c.strip().lower() for c in m.group(1).split(',')]
            ref_tbl = m.group(2).lower()
            pre_text = content[:m.start()]
            tbl_match = re.findall(r'(?:CREATE\s+TABLE|ALTER\s+TABLE)\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_]+)', pre_text, re.IGNORECASE)
            tbl = tbl_match[-1].lower() if tbl_match else 'unknown'
            if tbl in CRITICAL_TABLES:
                foreign_keys[tbl].append((cols[0], ref_tbl))

    print("=== CRITICAL TABLES INDEX COVERAGE ===")
    for tbl in CRITICAL_TABLES:
        indexes = table_indexes[tbl]
        cols = table_columns[tbl]
        fks = foreign_keys[tbl]
        
        # Check indexed columns (leading column in an index)
        leading_indexed_cols = set(idx[1][0] for idx in indexes if idx[1])
        all_indexed_cols = set(c for idx in indexes for c in idx[1])

        unindexed_fks = [fk for fk in fks if fk[0] not in leading_indexed_cols and fk[0] != 'id']
        missing_org = 'organization_id' in cols and 'organization_id' not in leading_indexed_cols
        missing_status = 'status' in cols and 'status' not in all_indexed_cols
        missing_created = 'created_at' in cols and 'created_at' not in all_indexed_cols

        print(f"\nTable: {tbl}")
        print(f"  Total indexes: {len(indexes)}")
        for idx_name, idx_cols in indexes:
            print(f"    - {idx_name} ({', '.join(idx_cols)})")
        if unindexed_fks:
            print(f"  [MISSING FK INDEX]: {unindexed_fks}")
        if missing_org:
            print(f"  [MISSING ORG INDEX]: organization_id not leading in any index")
        if missing_status:
            print(f"  [MISSING STATUS INDEX]: status not indexed")
        if missing_created:
            print(f"  [MISSING CREATED_AT INDEX]: created_at not indexed")

if __name__ == '__main__':
    check_critical_indexes()
